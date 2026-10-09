import { Body, Controller, ForbiddenException, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DeveloperSessionGuard } from './access.guard';
import { SlackAlertService } from './slack-alert.service';
import { AuditService } from '../audit.service';

@Controller('api/developer/alerts')
@UseGuards(DeveloperSessionGuard)
export class AlertPolicyController {
  constructor(private readonly alerts: SlackAlertService, private readonly audit: AuditService) {}
  private admin(req: any) { if (req.apiActor.role !== 'admin') throw new ForbiddenException('Administrator access required'); }
  @Get() get(@Req() req: any) { this.admin(req); return this.alerts.overview(); }
  @Patch() async update(@Req() req: any, @Body() body: any) {
    this.admin(req);
    const result = await this.alerts.update(body);
    await this.audit.log({ username: req.apiActor.username, role: req.apiActor.role, action: 'UPDATE_ALERT_POLICY', resource: 'ALERT_POLICY', result: 'SUCCESS', metadata: result.policy });
    return result;
  }
  @Post('preview') preview(@Req() req: any, @Body() body: any) { this.admin(req); return this.alerts.preview(body); }
}
