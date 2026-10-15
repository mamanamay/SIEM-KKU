/**
 * WazuhController — Legacy Compatibility Layer
 *
 * Endpoint นี้ยังคงรับ Request จาก Wazuh / Suricata เวอร์ชันเก่าที่ Config ไว้แล้ว
 * แต่จะ Forward ข้อมูลทั้งหมดไปยัง LogService.ingestLog() เหมือนกับ /api/ingest
 *
 * ⚠️  Endpoint ใหม่ที่แนะนำ: POST /api/ingest
 *     (Auto-detect source จาก Payload — ไม่ต้องเปลี่ยน URL ถ้ายังใช้ /api/wazuh อยู่)
 */
import { Controller, Post, Body, Logger } from '@nestjs/common';
import { LogService } from './log.service';
import { IngestEndpoint } from './auth-policy';

@Controller('api/wazuh')
export class WazuhController {
  private readonly logger = new Logger(WazuhController.name);

  constructor(private readonly logService: LogService) {}

  @Post()
  @IngestEndpoint()
  async receiveAlert(@Body() alertData: any) {
    this.logger.log('📥 [Legacy] Received via /api/wazuh → forwarding to ingestLog()');
    // Forward ไปยัง ingestLog เหมือนกัน — auto-detect จะรู้ว่าเป็น Wazuh
    const receipt = await this.logService.ingestLog(alertData, 'wazuh');
    return { status: 'accepted', ...receipt, note: 'Please migrate to POST /api/ingest' };
  }
}
