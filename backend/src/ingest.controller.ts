import { Controller, Post, Get, Body, Headers, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { LogService } from './log.service';
import { IngestEndpoint, PublicEndpoint } from './auth-policy';
import { Roles } from './roles.guard';

@Controller('api/ingest')
export class IngestController {
  constructor(private readonly logService: LogService, private readonly receipts?: ReceiptService) {}

  // ── Single-Ingest Endpoint ────────────────────────────────────────────────
  @Post()
  @IngestEndpoint()
  async ingestLog(
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
      const receipt = await this.logService.ingestLog(body);
      return { status: 'accepted', ...receipt, endpoint: '/api/ingest' };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('Durable receipt failed; retry later', HttpStatus.SERVICE_UNAVAILABLE);
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
  @PublicEndpoint()
  testIngest() {
    return {
      status: 'ok',
      message: 'KKUSIEM Ingest Endpoint is reachable',
      endpoint: 'POST /api/ingest',
      auth: 'X-Ingest-Key header required',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @PublicEndpoint()
  async readiness() {
    try { return await this.receipts!.ready(); }
    catch { throw new HttpException('Database unavailable', HttpStatus.SERVICE_UNAVAILABLE); }
  }

  @Get('queue')
  @Roles('admin')
  getQueue() { return this.logService.getQueueHealth(); }

  @Get('summary')
  async getSummary() {
    const [summary, detection] = await Promise.all([this.receipts!.summary(), this.logService.detectionStatus()]);
    return { ...summary, worker: this.logService.runtimeDiagnostics(), detection };
  }

  @Get('failures') @Roles('admin')
  failures() { return this.receipts!.failures(); }

  @Post('replay/:id') @Roles('admin')
  replay(@Param('id') id: string) { return this.receipts!.replayFailed(id); }

  @Get('events/:id')
  @Roles('admin','analyst','analyst_l2','threat_hunter')
  eventDetail(@Param('id') id: string) { return this.receipts!.eventDetail(id); }

  @Get('events') @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter')
  events(@Query() query: { source?: string; srcIp?: string; dstIp?: string; page?: string; limit?: string }) {
    return this.receipts!.searchEvents(query);
  }
}
