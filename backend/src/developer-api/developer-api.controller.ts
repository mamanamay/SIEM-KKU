import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiAccessService } from './access.service';
import { DeveloperSessionGuard, DeveloperTokenGuard } from './access.guard';
import { IntegrationCatalogService, PUBLIC_BASE_URL } from './catalog.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiLog } from '../entities/api-log.entity';

@Controller('api/developer')
@UseGuards(DeveloperSessionGuard)
export class DeveloperManagementController {
  constructor(private readonly access: ApiAccessService, private readonly catalog: IntegrationCatalogService, @InjectRepository(ApiLog) private readonly logs: Repository<ApiLog>) {}
  @Get('overview') async overview(@Req() req: any) {
    const scopes = this.access.allowedScopes(req.apiActor);
    return { identity: this.catalog.identity(req.apiActor, scopes), baseUrl: PUBLIC_BASE_URL, catalog: this.catalog.catalog(scopes), connections: scopes.includes('integrations:read') ? await this.catalog.connections(req.apiActor) : null, tokens: await this.access.list(req.apiActor) };
  }
  @Get('tokens') tokens(@Req() req: any) { return this.access.list(req.apiActor); }
  @Post('tokens') create(@Req() req: any, @Body() body: any) { return this.access.issue(req.apiActor, body, req); }
  @Delete('tokens/:id') revoke(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) { return this.access.revoke(req.apiActor, id, req); }
  @Post('tokens/:id/rotate') rotate(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: any) { return this.access.issue(req.apiActor, body, req, id); }
  @Get('activity') async activity(@Req() req: any) {
    const items = await this.logs.find({ where: { actorUserId: req.apiActor.id }, order: { timestamp: 'DESC' }, take: 50 });
    return { items, total: items.length, nextCursor: null };
  }
  @Get('openapi.json') openapi(@Req() req: any) { if (!this.access.allowedScopes(req.apiActor).includes('catalog:read')) throw new ForbiddenException('Required scope: catalog:read'); return this.catalog.openapi(); }
}

@Controller('api/v1')
@UseGuards(DeveloperTokenGuard)
export class DeveloperApiController {
  constructor(private readonly access: ApiAccessService, private readonly catalog: IntegrationCatalogService) {}
  @Get('me') me(@Req() req: any) { return this.catalog.identity(req.apiActor, req.apiScopes); }
  @Get('integration-catalog') endpoints(@Req() req: any) { this.access.requireScope(req, 'catalog:read'); return this.catalog.catalog(req.apiScopes); }
  @Get('integrations') connections(@Req() req: any) { this.access.requireScope(req, 'integrations:read'); return this.catalog.connections(req.apiActor); }
  @Get('health') health(@Req() req: any) { this.access.requireScope(req, 'health:read'); return this.catalog.health(); }
  @Get('openapi.json') openapi(@Req() req: any) { this.access.requireScope(req, 'catalog:read'); return this.catalog.openapi(); }
  @Post('mcp') @HttpCode(200) async mcp(@Req() req: any, @Body() body: any, @Res() res: Response) {
    const origin = req.headers.origin;
    const allowedOrigins = (process.env.SIEM_MCP_ALLOWED_ORIGINS || PUBLIC_BASE_URL).split(',').map(value => value.trim());
    let localDevelopmentOrigin = false;
    try { localDevelopmentOrigin = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin || '').hostname); } catch { /* no valid local origin */ }
    if (origin && !allowedOrigins.includes(origin) && !localDevelopmentOrigin) return res.status(403).json({ error: 'MCP origin is not permitted' });
    const versions = ['2025-11-25', '2025-06-18'];
    const headerVersion = req.headers['mcp-protocol-version'];
    if (headerVersion && !versions.includes(headerVersion)) return res.status(400).json({ error: 'Unsupported MCP protocol version' });
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string' || Array.isArray(body)) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request' } });
    const hasId = Object.prototype.hasOwnProperty.call(body, 'id');
    if (hasId && !(typeof body.id === 'string' || typeof body.id === 'number' || body.id === null)) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request id' } });
    if (!hasId) return body.method.startsWith('notifications/') ? res.status(202).send() : res.status(400).json({ error: 'Request id required' });
    const tools = [
      { name: 'list_api_endpoints', description: 'Read published SIEM REST endpoints', scope: 'catalog:read' },
      { name: 'list_integrations', description: 'Read permitted integrations with secrets removed', scope: 'integrations:read' },
      { name: 'get_integration_health', description: 'Read SIEM developer API health', scope: 'health:read' },
    ].filter(tool => req.apiScopes.includes(tool.scope));
    const resourceList = req.apiScopes.includes('catalog:read') ? [{ uri: 'siem://integration-catalog', name: 'SIEM endpoint catalog', mimeType: 'application/json' }] : [];
    let result: any;
    switch (body.method) {
      case 'initialize': result = { protocolVersion: versions.includes(body.params?.protocolVersion) ? body.params.protocolVersion : versions[0], capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'siem-kku', version: '1.0.0' }, instructions: 'Read-only SIEM API catalog. Tokens do not authorize account management, blocking IPs or SOAR actions.' }; break;
      case 'ping': result = {}; break;
      case 'tools/list': result = { tools: tools.map(({ scope, ...tool }) => ({ ...tool, inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) }; break;
      case 'resources/list': result = { resources: resourceList }; break;
      case 'resources/templates/list': result = { resourceTemplates: [] }; break;
      case 'resources/read':
        if (!resourceList.some(resource => resource.uri === body.params?.uri)) return res.json({ jsonrpc: '2.0', id: body.id, error: { code: -32002, message: 'Resource not found or not permitted' } });
        result = { contents: [{ uri: 'siem://integration-catalog', mimeType: 'application/json', text: JSON.stringify(this.catalog.catalog(req.apiScopes)) }] }; break;
      case 'tools/call': {
        const tool = tools.find(candidate => candidate.name === body.params?.name);
        if (!tool || (body.params.arguments !== undefined && (!body.params.arguments || Array.isArray(body.params.arguments) || typeof body.params.arguments !== 'object' || Object.keys(body.params.arguments).length))) return res.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Tool or arguments not permitted' } });
        const data = tool.name === 'list_api_endpoints' ? this.catalog.catalog(req.apiScopes) : tool.name === 'list_integrations' ? await this.catalog.connections(req.apiActor) : this.catalog.health();
        result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false }; break;
      }
      default: return res.json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } });
    }
    return res.status(200).json({ jsonrpc: '2.0', id: body.id, result });
  }
  @Get('mcp') getMcp(@Res() res: Response) { return res.status(405).setHeader('Allow', 'POST').end(); }
  @Delete('mcp') deleteMcp(@Res() res: Response) { return res.status(405).setHeader('Allow', 'POST').end(); }
}
