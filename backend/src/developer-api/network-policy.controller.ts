import { Body, Controller, ForbiddenException, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { DeveloperSessionGuard } from './access.guard';
import { NetworkMapService } from '../network-map.service';
import { AuditService } from '../audit.service';
import { clientIp } from './ip-policy';

@Controller('api/network-map')
@UseGuards(DeveloperSessionGuard)
export class NetworkPolicyController {
  constructor(private readonly network: NetworkMapService, private readonly audit: AuditService) {}
  @Get() get(@Res({ passthrough: true }) res: Response) {
    res.setHeader('X-SIEM-Network-Rule-Version', this.network.getVersion());
    return this.network.getRecords();
  }
  @Post() async save(@Req() req: any, @Body() records: unknown) {
    if (req.apiActor.role !== 'admin') throw new ForbiddenException('Only administrators may edit monitored networks');
    const result = await this.network.update(records);
    await this.audit.log({ username: req.apiActor.username, role: req.apiActor.role, action: 'UPDATE_NETWORK_POLICY', resource: 'NETWORK_MAP', ipAddress: clientIp(req), result: 'SUCCESS', metadata: { version: result.version } });
    return result;
  }
}
