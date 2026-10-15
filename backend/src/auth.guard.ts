import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { JWT_SECRET } from './jwt.config';
import { User } from './entities/user.entity';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector,
              @InjectRepository(User) private readonly users: Repository<User>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('auth:public', targets)) return true;
    const request = context.switchToHttp().getRequest();
    if (this.reflector.getAllAndOverride<boolean>('auth:ingest', targets)) {
      const expected = process.env.INGEST_API_KEY;
      if (!expected) throw new UnauthorizedException('INGEST_API_KEY must be configured');
      const supplied = request.headers['x-ingest-key'] || request.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
          !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new UnauthorizedException('Invalid ingest key');
      request.user = { username: 'ingest-service', role: 'service' };
      return true;
    }
    if (!request.userVerified) {
      const header = request.headers.authorization;
      if (typeof header !== 'string' || !/^Bearer\s+\S+$/i.test(header)) throw new UnauthorizedException('Bearer token required');
      let payload: any;
      try { payload = jwt.verify(header.replace(/^Bearer\s+/i, ''), JWT_SECRET, { algorithms: ['HS256'] }); }
      catch { throw new UnauthorizedException('Invalid or expired token'); }
      if (!Number.isSafeInteger(Number(payload.sub)) || payload.purpose !== 'access') throw new UnauthorizedException('Invalid access token');
      const user = await this.users.findOne({ where: { id: Number(payload.sub) } });
      if (!user || user.accountStatus !== 'active' || (payload.tokenVersion || 0) !== user.tokenVersion ||
          payload.role !== user.role) throw new UnauthorizedException('Account/session revoked');
      request.user = { ...payload, sub: user.id, username: user.username, role: user.role };
      request.userVerified = true;
    }
    const roles = this.reflector.getAllAndOverride<string[]>('roles', targets);
    if (roles && request.user.role !== 'admin' && !roles.includes(request.user.role)) throw new ForbiddenException('Insufficient role');
    if (!roles && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        !this.reflector.getAllAndOverride<boolean>('auth:self-service', targets) &&
        !['admin', 'analyst', 'analyst_l2', 'threat_hunter'].includes(request.user.role)) throw new ForbiddenException('Read-only role');
    return true;
  }
}
