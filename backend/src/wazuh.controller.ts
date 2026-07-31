import { Controller, Post, Body, Logger } from '@nestjs/common';
import { LogService } from './log.service';

@Controller('api/wazuh')
export class WazuhController {
  private readonly logger = new Logger(WazuhController.name);

  constructor(private readonly logService: LogService) {}

  @Post()
  receiveAlert(@Body() alertData: any) {
    this.logger.log('📥 Received alert from Wazuh Integration');
    this.logService.processWazuhAlert(alertData);
    return { status: 'success', message: 'Alert processed' };
  }
}
