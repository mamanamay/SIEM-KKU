import { BadRequestException, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../jwt.config';
import { ApiToken } from '../entities/api-token.entity';
import { User } from '../entities/user.entity';
import { AuditService } from '../audit.service';
import { clientIp, ipInCidr, validCidr } from './ip-policy';

export const API_SCOPES = ['catalog:read', 'integrations:read', 'health:read'] as const;
const ROLE_SCOPES: Record<string, readonly string[]> = { admin: API_SCOPES, analyst: API_SCOPES, guest: ['health:read'] };
export const tokenView = (token: ApiToken) => ({ id: token.id, name: token.name, prefix: token.prefix, scopes: token.scopes, allowedCidrs: token.allowedCidrs, expiresAt: token.expiresAt, revokedAt: token.revokedAt, lastUsedAt: token.lastUsedAt, createdAt: token.createdAt });

@Injectable()
export class ApiAccessService {
  private issuanceTail: Promise<unknown> = Promise.resolve();
  constructor(
    @InjectRepository(ApiToken) private readonly tokens: Repository<ApiToken>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly database: DataSource,
    private readonly audit: AuditService,
  ) {}

  allowedScopes(user: User): readonly string[] { return ROLE_SCOPES[user.role] || []; }
  private bearer(request: any): string {
    const match = /^Bearer ([^\s]+)$/i.exec(String(request.headers.authorization || ''));
    if (!match) throw new UnauthorizedException('Authorization: Bearer is required');
    return match[1];
  }
  private async activeUser(id: number): Promise<User> {
    const user = Number.isSafeInteger(id) ? await this.users.findOneBy({ id }) : null;
    if (!user || user.accountStatus !== 'active' || !ROLE_SCOPES[user.role]) throw new UnauthorizedException('Account is unavailable');
    return user;
  }
  async session(request: any): Promise<User> {
    const token = this.bearer(request);
    if (token.startsWith('kkusiem_pat_')) throw new UnauthorizedException('A browser session is required for credential management');
    let decoded: any;
    try { decoded = jwt.verify(token, JWT_SECRET); } catch { throw new UnauthorizedException('Session expired or invalid'); }
    const user = await this.activeUser(Number(decoded.sub));
    request.user = { sub: user.id, username: user.username, role: user.role };
    request.apiActor = user;
    return user;
  }
  async authenticate(request: any): Promise<{ user: User; token: ApiToken; scopes: string[] }> {
    const secret = this.bearer(request);
    if (!/^kkusiem_pat_[a-f0-9]{12}\.[A-Za-z0-9_-]{43}$/.test(secret)) throw new UnauthorizedException('A developer API token is required');
    const token = await this.tokens.findOneBy({ tokenHash: createHash('sha256').update(secret).digest('hex') });
    if (!token || token.revokedAt || token.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Token expired, revoked or invalid');
    const user = await this.activeUser(token.userId);
    const ip = clientIp(request);
    if (token.allowedCidrs.length && !token.allowedCidrs.some(cidr => ipInCidr(ip, cidr))) throw new ForbiddenException('Caller IP is outside this token allow-list');
    const now = Date.now();
    const window = Math.floor(now / 60000) * 60000;
    const updated = await this.tokens.createQueryBuilder().update(ApiToken).set({
      windowStartMs: window,
      windowCount: () => 'CASE WHEN "windowStartMs" = :window THEN "windowCount" + 1 ELSE 1 END',
      lastUsedAt: new Date(now),
    }).where('id = :id AND "revokedAt" IS NULL AND "expiresAt" > :now AND ("windowStartMs" != :window OR "windowCount" < 60)', { id: token.id, window, now: new Date(now) }).execute();
    if (!updated.affected) {
      const latest = await this.tokens.findOneBy({ id: token.id });
      if (!latest || latest.revokedAt || latest.expiresAt <= new Date(now)) throw new UnauthorizedException('Token is no longer active');
      request.res?.setHeader('Retry-After', String(Math.ceil((window + 60000 - now) / 1000)));
      throw new HttpException('API rate limit exceeded (60 requests/minute)', 429);
    }
    const scopes = token.scopes.filter(scope => this.allowedScopes(user).includes(scope));
    request.user = { sub: user.id, username: user.username, role: user.role };
    request.apiTokenId = token.id;
    request.apiActor = user;
    request.apiScopes = scopes;
    return { user, token, scopes };
  }
  requireScope(request: any, scope: string): void {
    if (!request.apiScopes?.includes(scope)) throw new ForbiddenException('Required scope: ' + scope);
  }
  async list(user: User) {
    const rows = await this.tokens.find({ where: { userId: user.id }, order: { createdAt: 'DESC' }, take: 100 });
    return { items: rows.map(tokenView), total: rows.length, limit: 10, allowedScopes: this.allowedScopes(user) };
  }
  private validate(user: User, input: any) {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new BadRequestException('Name must contain 1–80 characters');
    if (!Array.isArray(input.scopes) || !input.scopes.length || input.scopes.some((s: unknown) => typeof s !== 'string' || !this.allowedScopes(user).includes(s))) throw new BadRequestException('Select scopes permitted by your current role');
    const days = input.expiresInDays ?? 30;
    if (![7, 30, 90].includes(days)) throw new BadRequestException('Expiry must be 7, 30 or 90 days');
    const cidrs = input.allowedCidrs ?? [];
    if (!Array.isArray(cidrs) || cidrs.length > 20 || cidrs.some((cidr: unknown) => typeof cidr !== 'string' || !validCidr(cidr))) throw new BadRequestException('Allow-list must contain at most 20 valid IPv4/IPv6 CIDRs');
    return { name: input.name.trim(), scopes: [...new Set<string>(input.scopes)], allowedCidrs: [...new Set<string>(cidrs)], days };
  }
  async issue(user: User, input: any, request: any, replacingId?: string) {
    const operation = this.issuanceTail.then(() => this.database.transaction(async manager => {
      const owner = await manager.getRepository(User).findOne({ where: { id: user.id }, ...(this.database.options.type === 'postgres' ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
      if (!owner || owner.accountStatus !== 'active') throw new UnauthorizedException('Account unavailable');
      const values = this.validate(owner, input);
      const repository = manager.getRepository(ApiToken);
      if (replacingId) {
        const old = await repository.findOneBy({ id: replacingId, userId: owner.id, revokedAt: IsNull() });
        if (!old || old.expiresAt <= new Date()) throw new BadRequestException('Only an active token owned by you can be rotated');
        await repository.update(old.id, { revokedAt: new Date() });
      }
      if (await repository.countBy({ userId: owner.id, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) }) >= 10) throw new BadRequestException('Maximum 10 active tokens; revoke an unused token first');
      const prefix = 'kkusiem_pat_' + randomBytes(6).toString('hex');
      const secret = prefix + '.' + randomBytes(32).toString('base64url');
      const saved = await repository.save(repository.create({ userId: owner.id, name: values.name, prefix, tokenHash: createHash('sha256').update(secret).digest('hex'), scopes: values.scopes, allowedCidrs: values.allowedCidrs, expiresAt: new Date(Date.now() + values.days * 86400000), revokedAt: null, lastUsedAt: null }));
      return { ...tokenView(saved), token: secret };
    }));
    this.issuanceTail = operation.catch(() => undefined);
    const result = await operation;
    await this.audit.log({ userId: user.id, username: user.username, role: user.role, action: replacingId ? 'ROTATE_API_TOKEN' : 'CREATE_API_TOKEN', resource: 'DEVELOPER_API', resourceId: result.id, ipAddress: clientIp(request), result: 'SUCCESS', metadata: { name: result.name, scopes: result.scopes } });
    return result;
  }
  async revoke(user: User, id: string, request: any) {
    const token = await this.tokens.findOneBy({ id, userId: user.id });
    if (!token) throw new BadRequestException('Token not found');
    await this.tokens.update({ id, userId: user.id }, { revokedAt: new Date() });
    await this.audit.log({ userId: user.id, username: user.username, role: user.role, action: 'REVOKE_API_TOKEN', resource: 'DEVELOPER_API', resourceId: id, ipAddress: clientIp(request), result: 'SUCCESS' });
    return { success: true };
  }
}
