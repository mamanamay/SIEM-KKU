import { Controller, Post, Get, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { LogService } from './log.service';

@Controller('api/ingest')
export class IngestController {
  constructor(private readonly logService: LogService) {}

  // ── Single-Ingest Endpoint ────────────────────────────────────────────────
  @Post()
  ingestLog(
    @Body() body: any,
    @Headers('x-ingest-key') apiKey?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    // ── Optional API Key Guard ────────────────────────────────────────────
    const expectedKey = process.env.INGEST_API_KEY;
    if (expectedKey) {
      let providedKey = apiKey;
      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        providedKey = authHeader.substring(7).trim();
      }
      if (providedKey !== expectedKey) {
        throw new HttpException('Unauthorized: Invalid Ingest API Key', HttpStatus.UNAUTHORIZED);
      }
    }

    if (!body || (Array.isArray(body) && body.length === 0)) {
      throw new HttpException('Empty payload', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logService.ingestLog(body);
      const count = Array.isArray(body) ? body.length : 1;
      return { status: 'ok', accepted: count, endpoint: '/api/ingest' };
    } catch (err) {
      throw new HttpException(`Ingest error: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ── Ingest Health Monitor ─────────────────────────────────────────────────
  // GET /api/ingest/status — SOC ใช้ดูว่าต้นทางไหนยังส่งข้อมูลมาอยู่
  @Get('status')
  getIngestStatus() {
    return this.logService.getIngestHealth();
  }

  // ── Ingest Connectivity Test ─────────────────────────────────────────
  // GET /api/ingest/test — ไม่ต้องใช้ Key — แค่ Ping เช็คว่า Backend ทำงานอยู่
  // สำหรับทีมต้นทางใช้ verify ว่าถึง endpoint ได้ก่อนจะตั้งค่า
  @Get('test')
  testIngest() {
    return {
      status: 'ok',
      message: 'KKUSIEM Ingest Endpoint is reachable',
      endpoint: 'POST /api/ingest',
      auth: process.env.INGEST_API_KEY ? 'X-Ingest-Key header required' : 'No auth required',
      timestamp: new Date().toISOString(),
    };
  }
}
