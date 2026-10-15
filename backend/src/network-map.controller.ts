import { Controller, Get, Post, Body, Headers, Res, Req } from '@nestjs/common';
import type { Response } from 'express';
import { NetworkMapService } from './network-map.service';
import { Roles } from './roles.guard';
import { AuditService } from './audit.service';

@Controller('api/network-map')
export class NetworkMapController {
  constructor(private readonly map: NetworkMapService, private readonly audit: AuditService) {}
  @Get()
  get(@Res({ passthrough: true }) res: Response) {
    res.setHeader('ETag', '"' + this.map.getRevision() + '"');
    return this.map.getRecords();
  }
  @Post()
  @Roles('admin')
  async update(@Body() body: any, @Headers('if-match') revision: string, @Req() req: any,
               @Res({ passthrough: true }) res: Response) {
    const records = await this.map.update(body, revision);
    res.setHeader('ETag', '"' + this.map.getRevision() + '"');
    await this.audit.log({ action: 'UPDATE_NETWORK_MAP', resource: 'Network Map', username: req.user.username,
                          ipAddress: req.ip, result: 'SUCCESS', metadata: { count: records.length } });
    return { success: true, records };
  }
}
