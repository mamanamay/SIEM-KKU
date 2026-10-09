import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiAccessService } from './access.service';

@Injectable()
export class DeveloperSessionGuard implements CanActivate {
  constructor(private readonly access: ApiAccessService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.access.session(context.switchToHttp().getRequest());
    context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    return true;
  }
}

@Injectable()
export class DeveloperTokenGuard implements CanActivate {
  constructor(private readonly access: ApiAccessService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.access.authenticate(context.switchToHttp().getRequest());
    context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    return true;
  }
}
