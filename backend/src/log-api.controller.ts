import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Roles } from './roles.guard';
import { LogApiService, logApiSource } from './log-api.service';
import { AuditService } from './audit.service';

@Controller('api/log-sources')
@Roles('admin')
export class LogApiController {
  constructor(private readonly sources: LogApiService, private readonly audit: AuditService) {}
  @Get() overview() { return this.sources.overview(); }
  @Post() async saveConnection(@Body() input: any, @Req() req: any) { return this.save('combined', input, req); }
  @Post('test') testConnection(@Body() input: any) { return this.sources.test('combined', input); }
  @Post('pull') pullConnection() { return this.sources.pull('combined'); }
  @Post(':source') async save(@Param('source') source: string, @Body() input: any, @Req() req: any) {
    logApiSource(source);
    const result = await this.sources.save(source, input);
    await this.audit.log({ action: 'UPDATE_LOG_API', resource: source, username: req.user.username, result: 'SUCCESS' });
    return result;
  }
  @Post(':source/test') test(@Param('source') source: string, @Body() input: any) { return this.sources.test(source, input); }
  @Post(':source/pull') pull(@Param('source') source: string) { return this.sources.pull(source); }
}
