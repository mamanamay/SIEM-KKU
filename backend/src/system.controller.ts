import { Controller, Inject, forwardRef, Get, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { SystemService } from './system.service';
import { AuthGuard } from './auth.guard';
import { Roles } from './roles.guard';
import { runtimeMemory } from './runtime-memory';
import { ApiLogMiddleware } from './api-log/api-log.middleware';
import { LogService } from './log.service';
import { EventsGateway } from './events.gateway';
import { requestAdmission } from './request-admission';

@Controller('api/system')
@UseGuards(AuthGuard)
export class SystemController {
  constructor(@Inject(forwardRef(() => SystemService)) private readonly systemService: SystemService,
    private readonly logs:LogService,private readonly events:EventsGateway) {}

  @Get('runtime')
  @Roles('admin')
  async runtime() {
    return {as_of:Date.now(),backend:runtimeMemory(),http:requestAdmission.diagnostics(),apiLogs:ApiLogMiddleware.diagnostics(),
      ingestion:{...(await this.logs.getQueueHealth()),...this.logs.runtimeDiagnostics()},
      websocket:this.events.runtimeDiagnostics()};
  }

  @Get('metrics')
  async getMetrics(@Query('hours') hoursStr?: string) {
    const hours = hoursStr ? parseInt(hoursStr, 10) : 24;
    if (!Number.isFinite(hours) || hours < 1 || hours > 24) throw new BadRequestException('hours must be between 1 and 24');
    return this.systemService.getRecentMetrics(hours);
  }

  @Get('health')
  async getCurrentHealth() {
    return this.systemService.getCurrentHealth();
  }

  @Post(['health/gc', 'gc'])
  @Roles('admin')
  async forceGarbageCollection() {
    if (global.gc) {
      global.gc();
      return { success: true, message: 'Garbage collection forced successfully' };
    } else {
      return { success: false, message: 'Garbage collection is not exposed' };
    }
  }
}

