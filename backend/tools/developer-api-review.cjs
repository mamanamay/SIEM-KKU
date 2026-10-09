// Isolated review server: in-memory SQLite, loopback only, no ingestion or external notifications.
const path = require('node:path');
const { Test } = require('@nestjs/testing');
const { TypeOrmModule } = require('@nestjs/typeorm');
const { DataSource } = require('typeorm');
const jwt = require('jsonwebtoken');
const root = process.env.SIEM_REVIEW_ROOT || path.resolve(__dirname, '..');
const load = (file, symbol) => require(path.join(root, 'dist', file))[symbol];
const entity = (file, symbol) => load('entities/' + file + '.entity.js', symbol);
const User = entity('user', 'User');
const Attack = entity('attack', 'Attack');
const entities = [User, Attack, entity('api-token', 'ApiToken'), entity('api-log', 'ApiLog'), entity('audit-log', 'AuditLog'), entity('system-config', 'SystemConfig'), entity('network-policy', 'NetworkPolicy'), entity('integration-observation', 'IntegrationObservation'), entity('alert-notification', 'AlertNotification'), entity('alert-notification', 'AlertPolicy')];
const component = (file, symbol) => load('developer-api/' + file + '.js', symbol);
const NetworkMapService = load('network-map.service.js', 'NetworkMapService');
const access = component('access.service', 'ApiAccessService');
const guards = [component('access.guard', 'DeveloperSessionGuard'), component('access.guard', 'DeveloperTokenGuard')];
const { JWT_SECRET } = require(path.join(root, 'dist/jwt.config.js'));

(async () => {
  const module = await Test.createTestingModule({
    imports: [TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities, synchronize: true }), TypeOrmModule.forFeature(entities), load('api-log/api-log.module.js', 'ApiLogModule')],
    controllers: [component('developer-api.controller', 'DeveloperApiController'), component('developer-api.controller', 'DeveloperManagementController'), component('network-policy.controller', 'NetworkPolicyController'), component('alert-policy.controller', 'AlertPolicyController'), load('attacks.controller.js', 'AttacksController'), load('settings.controller.js', 'SettingsController')],
    providers: [access, ...guards, component('catalog.service', 'IntegrationCatalogService'), NetworkMapService, component('slack-alert.service', 'SlackAlertService'), load('audit.service.js', 'AuditService'), load('events.gateway.js', 'EventsGateway'), { provide: load('log.service.js', 'LogService'), useValue: { getIngestHealth: () => ({}) } }, { provide: load('ai.service.js', 'AiService'), useValue: {} }],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  const db = module.get(DataSource);
  const userRepo = db.getRepository(User);
  const admin = await userRepo.save(userRepo.create({ username: 'admin', role: 'admin', authMethod: 'local', accountStatus: 'active', firstName: 'SIEM', lastName: 'Review', apiConfigJson: '{}' }));
  app.use(async (req, res, next) => {
    if (req.url === '/__review/session') return res.json({ token: jwt.sign({ sub: admin.id, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '2h' }) });
    if (req.url === '/api/auth/me' && req.method === 'GET') {
      try { const claims = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer /, ''), JWT_SECRET); const user = await userRepo.findOneBy({ id: claims.sub }); if (!user) return res.status(401).json({ message: 'Unavailable' }); return res.json({ id: user.id, username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName, authMethod: user.authMethod, totpEnabled: false }); } catch { return res.status(401).json({ message: 'Unauthorized' }); }
    }
    if (req.url.includes('test-slack') || req.url.includes('test-teams') || req.url.includes('test-ai') || req.url.includes('ai-proxy')) return res.status(503).json({ message: 'External calls are disabled in the review server' });
    if (req.url.startsWith('/api/system/') && req.method === 'GET') return res.json({ services: [], status: 'review', cpu: 0, memory: 0 });
    return next();
  });
  await app.init();
  await module.get(NetworkMapService).update([{ Route: '10.101.0.0/16', 'Faculty/Dept': 'ODT — Digital Technology', Type: 'LAN' }, { Route: '10.198.0.0/16', 'Faculty/Dept': 'EN — Engineering', Type: 'LAN' }]);
  const attacks = db.getRepository(Attack);
  for (const [destIp, type] of [['10.101.104.234', 'SQL Injection'], ['10.198.0.20', 'SSH Brute Force'], ['203.0.113.25', 'External noise']]) await attacks.save(attacks.create({ ip: '198.51.100.42', destIp, timeStr: new Date().toISOString(), type, severity: 'high', threatScore: 90, detail: 'Review fixture only' }));
  await app.listen(Number(process.env.SIEM_REVIEW_PORT || 5019), '127.0.0.1');
  console.log('Isolated developer API review server ready on 127.0.0.1:' + (process.env.SIEM_REVIEW_PORT || 5019));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
})().catch(error => { console.error(error.message); process.exit(1); });
