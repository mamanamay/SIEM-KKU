import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import axios from 'axios';
import { IntegrationObservation } from '../entities/integration-observation.entity';
import { User } from '../entities/user.entity';

export const PUBLIC_BASE_URL = (process.env.SIEM_PUBLIC_BASE_URL || 'https://odt-siem-uat.kku.ac.th').replace(/\/$/, '');
export const EXPORTED_ENDPOINTS = [
  { method: 'GET', path: '/api/v1/me', scope: null, operationId: 'getCurrentApiIdentity', description: 'Current API identity and effective permissions' },
  { method: 'GET', path: '/api/v1/integration-catalog', scope: 'catalog:read', operationId: 'getIntegrationCatalog', description: 'Published SIEM endpoint catalog' },
  { method: 'GET', path: '/api/v1/integrations', scope: 'integrations:read', operationId: 'getIntegrationConnections', description: 'Connections with credentials removed' },
  { method: 'GET', path: '/api/v1/health', scope: 'health:read', operationId: 'getApiHealth', description: 'Developer API service availability' },
  { method: 'GET', path: '/api/v1/openapi.json', scope: 'catalog:read', operationId: 'getOpenApiDocument', description: 'OpenAPI specification for published REST endpoints' },
];

export function integrationFingerprint(url: string) { return createHash('sha256').update(url).digest('hex'); }
function parseJson(value: string | null | undefined): Record<string, any> { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function describe(url: string): { origin: string; kind: string } | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const kind = parsed.hostname === 'hooks.slack.com' ? 'slack' : /(^|\.)gen\.ai\.kku\.ac\.th$|generativelanguage\.googleapis\.com|api\.openai\.com/.test(parsed.hostname) ? 'ai' : /cve|mitre|nvd/.test(parsed.hostname) ? 'cve' : parsed.hostname === 'detection-engine' ? 'detection-engine' : 'other';
    // URL.origin excludes username/password; no path, query or fragment is published.
    return { origin: parsed.origin, kind };
  } catch { return null; }
}

@Injectable()
export class IntegrationCatalogService implements OnModuleInit, OnModuleDestroy {
  private requestInterceptor = -1;
  private responseInterceptor = -1;
  private pending = new Set<Promise<unknown>>();
  constructor(@InjectRepository(IntegrationObservation) private readonly observations: Repository<IntegrationObservation>) {}

  onModuleInit() {
    this.requestInterceptor = axios.interceptors.request.use(config => {
      const absolute = config.baseURL ? new URL(config.url || '', config.baseURL).toString() : config.url || '';
      const descriptor = describe(absolute);
      if (descriptor) (config as any).__siemObservation = { ...descriptor, fingerprint: integrationFingerprint(absolute), started: Date.now() };
      return config;
    });
    this.responseInterceptor = axios.interceptors.response.use(response => {
      this.observe((response.config as any).__siemObservation, response.status);
      return response;
    }, error => {
      this.observe(error.config?.__siemObservation, error.response?.status || 0);
      return Promise.reject(error);
    });
  }
  onModuleDestroy() {
    axios.interceptors.request.eject(this.requestInterceptor);
    axios.interceptors.response.eject(this.responseInterceptor);
  }
  private observe(info: any, status: number) {
    if (!info) return;
    const operation = this.recordObservation(info, status).catch(() => undefined);
    this.pending.add(operation);
    void operation.finally(() => this.pending.delete(operation));
  }
  async flushObservations() { await Promise.all([...this.pending]); }
  async recordObservation(info: { fingerprint: string; kind: string; origin: string; started: number }, status: number) {
    const succeeded = status >= 200 && status < 400;
    await this.observations.upsert({ fingerprint: info.fingerprint, kind: info.kind, origin: info.origin, lastSeenAt: new Date(), lastStatus: status || null, lastDurationMs: Math.max(0, Date.now() - info.started), ...(succeeded ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() }) }, ['fingerprint']);
    await this.observations.increment({ fingerprint: info.fingerprint }, 'requests', 1);
    await this.observations.increment({ fingerprint: info.fingerprint }, succeeded ? 'successes' : 'failures', 1);
  }
  identity(user: User, scopes: readonly string[]) { return { id: user.id, username: user.username, role: user.role, effectiveScopes: scopes }; }
  catalog(scopes: readonly string[]) {
    const items = EXPORTED_ENDPOINTS.filter(endpoint => !endpoint.scope || scopes.includes(endpoint.scope)).map(endpoint => ({ ...endpoint, service: 'SIEM KKU', direction: 'inbound', auth: 'bearer', url: PUBLIC_BASE_URL + endpoint.path }));
    return { service: 'SIEM KKU', version: '1.0.0', baseUrl: PUBLIC_BASE_URL, items, total: items.length, nextCursor: null, mcp: { url: PUBLIC_BASE_URL + '/api/v1/mcp', transport: 'streamable-http', authentication: 'bearer-pat', protocolVersions: ['2025-11-25', '2025-06-18'], readOnly: true } };
  }
  health() { return { service: 'SIEM KKU', status: 'ok', apiVersion: '1.0.0', time: new Date().toISOString(), capabilities: ['rest', 'mcp-read-only'], centralSync: 'not-configured' }; }
  async connections(user: User) {
    const config = parseJson(user.apiConfigJson);
    const definitions = [
      { id: 'slack', name: 'Slack alerts', kind: 'slack', url: config.slackUrl, purpose: 'Security incident notifications' },
      { id: 'ai', name: 'AI analysis', kind: 'ai', url: config.aiApiUrl, purpose: 'Security analysis', enabled: !!config.aiKey },
      { id: 'teams', name: 'Microsoft Teams', kind: 'teams', url: config.teamsUrl, purpose: 'Security incident notifications' },
    ];
    const rows = user.role === 'admin' ? await this.observations.find({ order: { lastSeenAt: 'DESC' }, take: 100 }) : [];
    const items = definitions.map(definition => {
      const descriptor = describe(definition.url || '');
      const observed = definition.url ? rows.find(row => row.fingerprint === integrationFingerprint(definition.url)) : null;
      return { id: definition.id, name: definition.name, purpose: definition.purpose, direction: 'outbound', targetOrigin: descriptor?.origin || null, configured: !!descriptor && definition.enabled !== false, state: observed ? observed.lastStatus && observed.lastStatus < 400 ? 'observed' : 'degraded' : descriptor && definition.enabled !== false ? 'configured' : 'not-configured', lastSeenAt: observed?.lastSeenAt || null, lastSuccessAt: observed?.lastSuccessAt || null, lastFailureAt: observed?.lastFailureAt || null, requests: observed?.requests || 0, failures: observed?.failures || 0 };
    });
    // Global server observations are administrator-only; never expose another user's integration settings.
    const activity = rows.map(row => ({ kind: row.kind, targetOrigin: row.origin, requests: row.requests, successes: row.successes, failures: row.failures, lastStatus: row.lastStatus, lastDurationMs: row.lastDurationMs, lastSeenAt: row.lastSeenAt, lastSuccessAt: row.lastSuccessAt, lastFailureAt: row.lastFailureAt }));
    return { items, total: items.length, nextCursor: null, activity, central: { configured: false, reason: 'Central registry URL and registration schema have not been provided' }, observationCoverage: 'Server axios requests; configured connections and observed traffic are reported separately' };
  }
  openapi() {
    const listSchema = { type: 'object', required: ['items', 'total', 'nextCursor'], properties: { items: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' }, nextCursor: { type: ['string', 'null'] } } };
    const paths = Object.fromEntries(EXPORTED_ENDPOINTS.map(endpoint => [endpoint.path, { get: { operationId: endpoint.operationId, summary: endpoint.description, 'x-required-scope': endpoint.scope, security: [{ developerToken: [] }], responses: { '200': { description: 'Success', content: { 'application/json': { schema: endpoint.path === '/api/v1/me' ? { type: 'object', required: ['id', 'username', 'role', 'effectiveScopes'], properties: { id: { type: 'integer' }, username: { type: 'string' }, role: { type: 'string' }, effectiveScopes: { type: 'array', items: { type: 'string' } } } } : endpoint.path === '/api/v1/health' ? { type: 'object', required: ['service', 'status', 'apiVersion', 'time'], properties: { service: { type: 'string' }, status: { type: 'string' }, apiVersion: { type: 'string' }, time: { type: 'string', format: 'date-time' } } } : endpoint.path.endsWith('openapi.json') ? { type: 'object', required: ['openapi', 'info', 'paths'] } : listSchema } } }, '401': { description: 'Invalid, revoked or expired credential' }, '403': { description: 'Scope, role or caller IP denied' }, '429': { description: '60 requests per minute per credential; see Retry-After' } } } }]));
    return { openapi: '3.1.0', info: { title: 'SIEM KKU Developer API', version: '1.0.0' }, servers: [{ url: PUBLIC_BASE_URL }], paths, components: { securitySchemes: { developerToken: { type: 'http', scheme: 'bearer', bearerFormat: 'Personal Access Token' } } } };
  }
}
