import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { User } from '../entities/user.entity';
import { JWT_SECRET } from '../jwt.config';

@Injectable()
export class ApiHistoryAdminGuard implements CanActivate {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    let decoded: any;
    try { decoded = match ? jwt.verify(match[1], JWT_SECRET) : null; } catch { throw new UnauthorizedException(); }
    const user = decoded && Number.isSafeInteger(Number(decoded.sub)) ? await this.users.findOneBy({ id: Number(decoded.sub) }) : null;
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException();
    if (user.role !== 'admin') throw new ForbiddenException('Administrator access required');
    req.user = { sub: user.id, username: user.username, role: user.role };
    return true;
  }
}
