import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { JWT_SECRET } from '../jwt.config';
import { User } from '../entities/user.entity';
import { ApiToken } from '../entities/api-token.entity';
import { ApiLog } from '../entities/api-log.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { NetworkPolicy } from '../entities/network-policy.entity';
import { IntegrationObservation } from '../entities/integration-observation.entity';
import { AlertNotification, AlertPolicy } from '../entities/alert-notification.entity';
import { ApiAccessService } from './access.service';
import { DeveloperSessionGuard, DeveloperTokenGuard } from './access.guard';
import { DeveloperApiController, DeveloperManagementController } from './developer-api.controller';
import { IntegrationCatalogService } from './catalog.service';
import { AuditService } from '../audit.service';
import { NetworkMapService } from '../network-map.service';
import { NetworkPolicyController } from './network-policy.controller';
import { SlackAlertService } from './slack-alert.service';
import { AlertPolicyController } from './alert-policy.controller';
import { ApiLogModule } from '../api-log/api-log.module';
import { AttacksController } from '../attacks.controller';
import { Attack } from '../entities/attack.entity';
import { EventsGateway } from '../events.gateway';
import { LogService } from '../log.service';
import { AiService } from '../ai.service';
import { clientIp, ipInCidr, validCidr } from './ip-policy';

const ENTITIES = [User, ApiToken, ApiLog, AuditLog, SystemConfig, NetworkPolicy, IntegrationObservation, AlertNotification, AlertPolicy, Attack];
const SCOPES = ['catalog:read', 'integrations:read', 'health:read'];
const fakeSlackUrl = 'https://hooks.slack.com/services/TEST_ONLY/NOT_REAL/PLACEHOLDER';
const event = (extra: Record<string, any> = {}) => ({ type: 'SQL Injection', ip: '203.0.113.24', destIp: '10.101.104.234', threatScore: 90, severity: 'high', source: 'firewall', detail: 'SQL injection detected', ...extra });

describe('Developer API, MCP, network scope and notification delivery', () => {
  let app: INestApplication;
  let db: DataSource;
  let users: Repository<User>;
  let tokens: Repository<ApiToken>;
  let network: NetworkMapService;
  let alerts: SlackAlertService;
  let catalog: IntegrationCatalogService;
  let admin: User;
  let analyst: User;
  let guest: User;
  let post: jest.SpyInstance;
  const session = (user: User) => 'Bearer ' + jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
  const server = () => app.getHttpServer();
  const issue = async (owner = admin, scopes = SCOPES, extra: any = {}) => (await request(server()).post('/api/developer/tokens').set('Authorization', session(owner)).send({ name: 'Test integration', scopes, expiresInDays: 30, ...extra }).expect(201)).body;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: ENTITIES, synchronize: true }), TypeOrmModule.forFeature(ENTITIES), ApiLogModule],
      controllers: [DeveloperApiController, DeveloperManagementController, NetworkPolicyController, AlertPolicyController, AttacksController],
      providers: [ApiAccessService, DeveloperSessionGuard, DeveloperTokenGuard, AuditService, NetworkMapService, IntegrationCatalogService, SlackAlertService, { provide: EventsGateway, useValue: {} }, { provide: LogService, useValue: {} }, { provide: AiService, useValue: {} }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
    db = module.get(DataSource); users = db.getRepository(User); tokens = db.getRepository(ApiToken);
    network = module.get(NetworkMapService); alerts = module.get(SlackAlertService); catalog = module.get(IntegrationCatalogService);
    admin = await users.save(users.create({ username: 'admin', role: 'admin', authMethod: 'local', accountStatus: 'active' }));
    analyst = await users.save(users.create({ username: 'analyst-test', role: 'analyst', authMethod: 'local', accountStatus: 'active' }));
    guest = await users.save(users.create({ username: 'guest-test', role: 'guest', authMethod: 'local', accountStatus: 'active' }));
    post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: 'ok' });
  });
  beforeEach(async () => {
    await catalog.flushObservations();
    await new Promise(resolve => setTimeout(resolve, 15));
    await tokens.clear(); await db.getRepository(AlertNotification).clear(); await db.getRepository(IntegrationObservation).clear(); await db.getRepository(Attack).clear();
    await users.update(admin.id, { role: 'admin', accountStatus: 'active', apiConfigJson: JSON.stringify({ slackUrl: fakeSlackUrl, aiKey: 'DO_NOT_EXPORT', aiApiUrl: 'https://gen.ai.kku.ac.th/api/v1' }) });
    await users.update(analyst.id, { role: 'analyst', accountStatus: 'active' });
    await db.getRepository(SystemConfig).upsert({ id: 1, apiConfigJson: '{}' }, ['id']);
    await alerts.update({ enabled: true, minHighScore: 80, maxPerMinute: 5, cooldownSeconds: 600, highGroupSeconds: 60 });
    await db.getRepository(AlertPolicy).update(1, { channelPauseUntil: null });
    await network.update([{ Route: '10.101.0.0/16', 'Faculty/Dept': 'KKU', Type: 'LAN' }, { Route: '2001:db8:1::/48', Type: 'LAN' }, { Route: '0.0.0.0/0', Type: 'DEFAULT' }]);
    post.mockReset().mockResolvedValue({ status: 200, data: 'ok' });
  });
  afterAll(async () => { post.mockRestore(); await catalog.flushObservations(); await app.close(); });

  it('requires a browser session and never treats a PAT as a management credential', async () => {
    await request(server()).get('/api/developer/overview').expect(401);
    const created = await issue();
    await request(server()).get('/api/developer/tokens').set('Authorization', 'Bearer ' + created.token).expect(403);
    await request(server()).post('/api/auth/register').set('Authorization', 'Bearer ' + created.token).send({ username: 'must-not-execute' }).expect(403);
  });
  it('shows a secret only on issuance and stores only its hash', async () => {
    const created = await issue();
    expect(created.token).toMatch(/^kkusiem_pat_/);
    const list = await request(server()).get('/api/developer/tokens').set('Authorization', session(admin)).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(created.token);
    expect(list.body.items[0].tokenHash).toBeUndefined();
    const persisted = await tokens.createQueryBuilder('t').addSelect('t.tokenHash').getOneOrFail();
    expect(persisted.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(created.token);
  });
  it('rejects browser JWTs and malformed credentials on exported APIs', async () => {
    await request(server()).get('/api/v1/me').set('Authorization', session(admin)).expect(401);
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer kkusiem_pat_invalid').expect(401);
  });
  it('enforces scope even for admin-owned credentials', async () => {
    const created = await issue(admin, ['health:read']);
    await request(server()).get('/api/v1/health').set('Authorization', 'Bearer ' + created.token).expect(200);
    await request(server()).get('/api/v1/integration-catalog').set('Authorization', 'Bearer ' + created.token).expect(403);
  });
  it('checks the current role instead of the role at issuance', async () => {
    const created = await issue();
    await users.update(admin.id, { role: 'guest' });
    await request(server()).get('/api/v1/integration-catalog').set('Authorization', 'Bearer ' + created.token).expect(403);
    const me = await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + created.token).expect(200);
    expect(me.body.effectiveScopes).toEqual(['health:read']);
    expect(me.body.role).toBe('guest');
  });
  it('blocks disabled and deleted owners on their next request', async () => {
    const created = await issue();
    await users.update(admin.id, { accountStatus: 'disabled' });
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + created.token).expect(401);
    await request(server()).get('/api/developer/overview').set('Authorization', session(admin)).expect(401);
    const transient = await users.save(users.create({ username: 'deleted-owner', role: 'analyst', authMethod: 'local', accountStatus: 'active' }));
    const second = await issue(transient);
    await users.delete(transient.id);
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + second.token).expect(401);
  });
  it('revoke and expiration immediately deny API access', async () => {
    const created = await issue();
    await request(server()).delete('/api/developer/tokens/' + created.id).set('Authorization', session(admin)).expect(200);
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + created.token).expect(401);
    const second = await issue();
    await tokens.update(second.id, { expiresAt: new Date(Date.now() - 1000) });
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + second.token).expect(401);
  });
  it('does not expose or revoke another account credentials', async () => {
    const created = await issue();
    const list = await request(server()).get('/api/developer/tokens').set('Authorization', session(analyst)).expect(200);
    expect(list.body.items).toHaveLength(0);
    await request(server()).delete('/api/developer/tokens/' + created.id).set('Authorization', session(analyst)).expect(400);
  });
  it('validates scope, expiry and caller CIDR at issuance', async () => {
    await request(server()).post('/api/developer/tokens').set('Authorization', session(guest)).send({ name: 'bad', scopes: ['catalog:read'] }).expect(400);
    await request(server()).post('/api/developer/tokens').set('Authorization', session(admin)).send({ name: 'bad', scopes: SCOPES, expiresInDays: 365 }).expect(400);
    await request(server()).post('/api/developer/tokens').set('Authorization', session(admin)).send({ name: 'bad', scopes: SCOPES, allowedCidrs: ['999.1.2.3/16'] }).expect(400);
  });
  it('atomically limits concurrent issuance to ten active credentials', async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => request(server()).post('/api/developer/tokens').set('Authorization', session(admin)).send({ name: 'concurrent-' + index, scopes: SCOPES })));
    expect(responses.filter(response => response.status === 201)).toHaveLength(10);
    expect(responses.filter(response => response.status === 400)).toHaveLength(2);
  });
  it('rotates at the quota and does not revoke the original on failed validation', async () => {
    const created = await issue();
    for (let index = 1; index < 10; index++) await issue();
    await request(server()).post('/api/developer/tokens/' + created.id + '/rotate').set('Authorization', session(admin)).send({ name: 'bad', scopes: ['admin:*'] }).expect(400);
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + created.token).expect(200);
    const rotated = await request(server()).post('/api/developer/tokens/' + created.id + '/rotate').set('Authorization', session(admin)).send({ name: 'replacement', scopes: SCOPES }).expect(201);
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + created.token).expect(401);
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + rotated.body.token).expect(200);
  });
  it('applies a per-credential rate limit and includes Retry-After', async () => {
    const created = await issue();
    await tokens.update(created.id, { windowStartMs: Math.floor(Date.now() / 60000) * 60000, windowCount: 60 });
    const limited = await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + created.token).expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    const another = await issue();
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + another.token).expect(200);
  });
  it('enforces allowed caller CIDRs', async () => {
    const denied = await issue(admin, SCOPES, { allowedCidrs: ['198.51.100.0/24'] });
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + denied.token).expect(403);
    const permitted = await issue(admin, SCOPES, { allowedCidrs: ['127.0.0.0/8'] });
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + permitted.token).expect(200);
  });
  it('publishes the configured UAT URL and an OpenAPI contract for implemented routes', async () => {
    const created = await issue();
    const catalogResponse = await request(server()).get('/api/v1/integration-catalog').set('Authorization', 'Bearer ' + created.token).expect(200);
    expect(catalogResponse.body.baseUrl).toBe('https://odt-siem-uat.kku.ac.th');
    const spec = await request(server()).get('/api/v1/openapi.json').set('Authorization', 'Bearer ' + created.token).expect(200);
    for (const endpoint of catalogResponse.body.items) {
      expect(spec.body.paths[endpoint.path].get).toBeDefined();
      await request(server()).get(endpoint.path).set('Authorization', 'Bearer ' + created.token).expect(200);
    }
  });
  it('redacts integration credentials and never claims the central registry is connected', async () => {
    const created = await issue();
    const response = await request(server()).get('/api/v1/integrations').set('Authorization', 'Bearer ' + created.token).expect(200);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('DO_NOT_EXPORT'); expect(serialized).not.toContain('/services/');
    expect(response.body.central.configured).toBe(false);
    expect(response.body.items.find((item: any) => item.id === 'slack').state).toBe('configured');
  });
  it('negotiates MCP, lists authorized tools and executes a read-only call', async () => {
    const created = await issue();
    const rpc = (body: any) => request(server()).post('/api/v1/mcp').set('Authorization', 'Bearer ' + created.token).send({ jsonrpc: '2.0', id: 1, ...body });
    const initialized = await rpc({ method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }).expect(200);
    expect(initialized.body.result.protocolVersion).toBe('2025-11-25');
    expect((await rpc({ method: 'tools/list' }).expect(200)).body.result.tools).toHaveLength(3);
    const result = await rpc({ method: 'tools/call', params: { name: 'list_api_endpoints', arguments: {} } }).expect(200);
    expect(result.body.result.structuredContent.items.length).toBeGreaterThan(0);
    expect((await rpc({ method: 'resources/read', params: { uri: 'siem://integration-catalog' } }).expect(200)).body.result.contents).toHaveLength(1);
    await request(server()).post('/api/v1/mcp').set('Authorization', 'Bearer ' + created.token).send({ jsonrpc: '2.0', method: 'notifications/initialized' }).expect(202);
    await request(server()).get('/api/v1/mcp').set('Authorization', 'Bearer ' + created.token).expect(405);
  });
  it('does not list or invoke MCP tools outside credential scopes', async () => {
    const created = await issue(admin, ['health:read']);
    const tools = await request(server()).post('/api/v1/mcp').set('Authorization', 'Bearer ' + created.token).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).expect(200);
    expect(tools.body.result.tools.map((tool: any) => tool.name)).toEqual(['get_integration_health']);
    const denied = await request(server()).post('/api/v1/mcp').set('Authorization', 'Bearer ' + created.token).send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_api_endpoints' } }).expect(200);
    expect(denied.body.error.code).toBe(-32602);
  });
  it('rejects untrusted MCP origins and unsupported protocol headers', async () => {
    const created = await issue();
    await request(server()).post('/api/v1/mcp').set('Authorization', 'Bearer ' + created.token).set('Origin', 'https://untrusted.example').send({ jsonrpc: '2.0', id: 1, method: 'ping' }).expect(403);
    await request(server()).post('/api/v1/mcp').set('Authorization', 'Bearer ' + created.token).set('MCP-Protocol-Version', 'unsupported').send({ jsonrpc: '2.0', id: 1, method: 'ping' }).expect(400);
  });
  it('records verified credential identity without token values', async () => {
    const created = await issue();
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer ' + created.token).expect(200);
    await new Promise(resolve => setTimeout(resolve, 30));
    const log = await db.getRepository(ApiLog).findOne({ where: { credentialId: created.id } });
    expect(log?.actorUserId).toBe(admin.id); expect(JSON.stringify(log)).not.toContain(created.token);
    await request(server()).get('/api/admin/api-logs').set('Authorization', session(analyst)).expect(403);
    await request(server()).get('/api/admin/api-logs').expect(401);
  });
  it('validates and persists canonical network rules, excluding a default route', async () => {
    expect(network.evaluate({ destIp: '203.0.113.24' }).inScope).toBe(false);
    expect(network.evaluate({ destIp: '10.101.104.234' }).inScope).toBe(true);
    expect(network.evaluate({ destIp: '2001:db8:1::24' }).inScope).toBe(true);
    expect(network.evaluate({ ip: '10.101.104.234' }).scope).toBe('unknown');
    await request(server()).post('/api/network-map').set('Authorization', session(analyst)).send([{ Route: '10.0.0.0/8' }]).expect(403);
    await request(server()).post('/api/network-map').set('Authorization', session(admin)).send([{ Route: 'invalid/16' }]).expect(400);
    const changed = await request(server()).post('/api/network-map').set('Authorization', session(admin)).send([{ Route: '10.198.0.0/16', 'Export Row': 10, 'Source Row #': 2, 'Source Page': 1 }]).expect(201);
    const read = await request(server()).get('/api/network-map').set('Authorization', session(admin)).expect(200);
    expect(read.headers['x-siem-network-rule-version']).toBe(changed.body.version);
    expect(read.body[0]['Export Row']).toBe(10);
    expect(read.body[0]['Source Page']).toBe(1);
    expect(network.evaluate({ destIp: '10.101.104.234' }).inScope).toBe(false);
    expect(network.evaluate({ destIp: '10.198.0.20' }).inScope).toBe(true);
  });
  it('filters history and search before pagination while preserving the legacy raw history', async () => {
    const repo = db.getRepository(Attack);
    for (const destIp of ['10.101.0.1', '203.0.113.1', '10.101.0.2', '198.51.100.1']) await repo.save(repo.create({ ip: '203.0.113.24', destIp, timeStr: 'test', type: 'SQL Injection', severity: 'high', detail: 'test' }));
    const history = await request(server()).get('/api/attacks/history?scope=lan').expect(200);
    expect(history.body).toHaveLength(2);
    expect((await request(server()).get('/api/attacks/history').expect(200)).body).toHaveLength(4);
    const result = await request(server()).get('/api/attacks/search?lan=true&limit=1&page=2').set('Authorization', session(admin)).expect(200);
    expect(result.body.total).toBe(2); expect(result.body.data).toHaveLength(1); expect(result.body.data[0].destIp).toBe('10.101.0.1');
    const ipHistory = await request(server()).get('/api/attacks/ip-history/203.0.113.24?scope=lan').set('Authorization', session(admin)).expect(200);
    expect(ipHistory.body.totalEvents).toBe(2);
    expect(ipHistory.body.timeline.every((entry: any) => entry.destIp.startsWith('10.101.'))).toBe(true);
  });
  it('keeps the Wallboard legacy live feed and emits scoped events only to LAN clients', () => {
    const emitted: any[] = [];
    const gateway = new EventsGateway(db.getRepository(Attack), network);
    gateway.server = { to: (room: string) => ({ emit: (name: string, value: any) => emitted.push({ room, name, value }) }) } as any;
    gateway.broadcastAttack({ destIp: '203.0.113.24' });
    expect(emitted.map(item => item.room)).toEqual(['legacy-events']);
    emitted.length = 0; gateway.broadcastAttack({ destIp: '10.101.104.234' });
    expect(emitted.map(item => item.room)).toEqual(['legacy-events', 'lan-events']);
    expect(emitted[1].value.networkScope.ruleVersion).toBe(network.getVersion());
  });
  it('requires LAN, risk evidence and score; a dropped packet is not a Critical incident', async () => {
    const policy = await alerts.policy();
    expect(alerts.evaluate(event({ destIp: '203.0.113.2' }), policy).send).toBe(false);
    expect(alerts.evaluate(event({ type: 'Firewall Activity', detail: 'packet dropped', severity: 'critical', threatScore: 100 }), policy).send).toBe(false);
    expect(alerts.evaluate(event({ threatScore: 40 }), policy).send).toBe(false);
    expect(alerts.evaluate(event(), policy).severity).toBe('high');
    expect(alerts.evaluate(event({ type: 'Ransomware', threatScore: 100 }), policy).severity).toBe('critical');
  });
  it('preview never sends to Slack or changes the delivery queue', async () => {
    const response = await request(server()).post('/api/developer/alerts/preview').set('Authorization', session(admin)).send(event()).expect(201);
    expect(response.body.action).toBe('queued-grouped'); expect(post).not.toHaveBeenCalled();
    expect(await db.getRepository(AlertNotification).count()).toBe(0);
  });
  it('merges 1000 duplicate events durably, and separates a new target', async () => {
    for (let index = 0; index < 1000; index++) await alerts.enqueue(event());
    const rows = await db.getRepository(AlertNotification).find();
    expect(rows).toHaveLength(1); expect(rows[0].hitCount).toBe(1000);
    await alerts.enqueue(event({ destIp: '10.101.104.235' }));
    expect(await db.getRepository(AlertNotification).count()).toBe(2);
  }, 30000);
  it('escalates an existing queued High incident without suppressing Critical evidence', async () => {
    await alerts.enqueue(event());
    await alerts.enqueue(event({ detail: 'SQL injection delivers ransomware', threatScore: 100 }));
    const row = await db.getRepository(AlertNotification).findOneByOrFail({});
    expect(row.severity).toBe('critical'); expect(row.hitCount).toBe(2); expect(row.nextAttemptAt <= new Date()).toBe(true);
  });
  it('respects the channel budget across service instances and database-backed cooldown', async () => {
    for (let index = 0; index < 7; index++) await alerts.enqueue(event({ type: 'Ransomware', threatScore: 100, ip: '203.0.113.' + (index + 1) }));
    for (let index = 0; index < 7; index++) await alerts.drain();
    expect(post).toHaveBeenCalledTimes(5);
    expect(await db.getRepository(AlertNotification).countBy({ status: 'queued' })).toBe(2);
    const restarted = new SlackAlertService(db.getRepository(AlertNotification), db.getRepository(AlertPolicy), db.getRepository(SystemConfig), users, db, network);
    await restarted.drain(); expect(post).toHaveBeenCalledTimes(5);
    expect((await restarted.enqueue(event({ type: 'Ransomware', threatScore: 100, ip: '203.0.113.1' }))).send).toBe(false);
  });
  it('pauses the whole channel for Slack 429 Retry-After and retains the queue', async () => {
    await alerts.enqueue(event({ type: 'Ransomware', threatScore: 100 }));
    await alerts.enqueue(event({ type: 'Ransomware', threatScore: 100, ip: '203.0.113.25' }));
    post.mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '120' } } });
    await alerts.drain(); await alerts.drain();
    expect(post).toHaveBeenCalledTimes(1);
    expect((await alerts.policy()).channelPauseUntil!.getTime()).toBeGreaterThan(Date.now() + 110000);
    expect(await db.getRepository(AlertNotification).countBy({ status: 'queued' })).toBe(2);
  });
  it('bounds retries for temporary errors and marks permanent errors failed', async () => {
    await alerts.enqueue(event({ type: 'Ransomware', threatScore: 100 }));
    post.mockRejectedValue({ response: { status: 500 } });
    for (let index = 0; index < 5; index++) { await db.getRepository(AlertNotification).createQueryBuilder().update().set({ nextAttemptAt: new Date(0) }).execute(); await alerts.drain(); }
    expect(await db.getRepository(AlertNotification).countBy({ status: 'failed' })).toBe(1);
    expect(post).toHaveBeenCalledTimes(5);
  });
  it('stops queued notifications when their target leaves the monitored network', async () => {
    await alerts.enqueue(event({ type: 'Ransomware', threatScore: 100 }));
    await network.update([{ Route: '10.198.0.0/16' }]);
    await alerts.drain(); expect(post).not.toHaveBeenCalled();
    expect(await db.getRepository(AlertNotification).countBy({ status: 'suppressed' })).toBe(1);
  });
  it('validates IPv4/IPv6 CIDRs and ignores forged forwarded IPs from untrusted peers', () => {
    expect(validCidr('999.1.2.3/24')).toBe(false); expect(validCidr('10.1.2.3/33')).toBe(false);
    expect(ipInCidr('2001:db8:1::24', '2001:db8:1::/48')).toBe(true);
    expect(ipInCidr('::ffff:127.0.0.1', '127.0.0.0/8')).toBe(true);
    expect(clientIp({ socket: { remoteAddress: '203.0.113.24' }, headers: { 'x-forwarded-for': '10.101.104.234' } })).toBe('203.0.113.24');
  });
});
