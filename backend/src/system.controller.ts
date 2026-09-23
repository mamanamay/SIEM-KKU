import { Controller, Inject, forwardRef, Get, Query, UseGuards } from '@nestjs/common';
import { SystemService } from './system.service';
import { AuthGuard } from './auth.guard';

@Controller('api/system')
@UseGuards(AuthGuard)
export class SystemController {
  constructor(@Inject(forwardRef(() => SystemService)) private readonly systemService: SystemService) {}

  @Get('metrics')
  async getMetrics(@Query('hours') hoursStr?: string) {
    const hours = hoursStr ? parseInt(hoursStr, 10) : 24;
    return this.systemService.getRecentMetrics(hours);
  }

  @Get('health')
  async getCurrentHealth() {
    return this.systemService.getCurrentHealth();
  }
}
