import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiLog } from '../entities/api-log.entity';
import { MAX_API_LOG_WRITES } from '../runtime-limits';
import { clientIp as resolveClientIp } from '../developer-api/ip-policy';

@Injectable()
export class ApiLogMiddleware implements NestMiddleware {
  private static active=0;
  private static dropped=0;
  private static failed=0;
  private static lastWarning=0;
  static diagnostics() {
    return {activeWrites:this.active,maxWrites:MAX_API_LOG_WRITES,droppedAccessLogs:this.dropped,failedWrites:this.failed};
  }
  constructor(
    @InjectRepository(ApiLog)
    private apiLogRepository: Repository<ApiLog>,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    // ดึง IP จริงของ client (รองรับ proxy/nginx)
    const clientIp = resolveClientIp(req) || 'unknown';

    // Hook เมื่อ response ส่งเสร็จแล้ว
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const path = req.path;

      // ข้ามการบันทึก health check / socket.io
      if (path === '/health' || path.startsWith('/socket.io') ||
          ['/api/ingest/ready','/api/system/runtime'].includes(path)) return;

      // Optional access history must not create an unlimited promise queue
      // when the database is slower than HTTP traffic. Durable event receipts
      // and security audit records use their own awaited paths.
      if(ApiLogMiddleware.active>=MAX_API_LOG_WRITES) {
        ApiLogMiddleware.dropped++;
        if(Date.now()-ApiLogMiddleware.lastWarning>=60000) {
          ApiLogMiddleware.lastWarning=Date.now();
          console.warn('[ApiLog] Access history write budget full; skipped entries counted in runtime diagnostics');
        }
        return;
      }

      const contentLength = res.getHeader('content-length');
      const responseSize = contentLength ? parseInt(contentLength as string, 10) : undefined;

      // บันทึกแบบ async ไม่ block request
      const logEntry = new ApiLog();
      logEntry.method = req.method;
      logEntry.path = path;
      logEntry.statusCode = res.statusCode;
      logEntry.clientIp = clientIp as any;
      logEntry.userAgent = ((req.headers['user-agent'] || '').substring(0, 500)) as any;
      logEntry.durationMs = durationMs as any;
      logEntry.authRole = ((req as any).userVerified || (req as any).user?.role === 'service')
        ? (req as any).user?.role : null;
      logEntry.responseSize = (responseSize ?? null) as any;
      logEntry.actorUserId = (req as any).userVerified ? (req as any).user?.sub || null : null;
      logEntry.credentialId = (req as any).apiTokenId || null;

      ApiLogMiddleware.active++;
      void (async()=>{
        try {await this.apiLogRepository.save(logEntry, { transaction: false });}
        catch {ApiLogMiddleware.failed++;}
        finally {ApiLogMiddleware.active--;}
      })();
    });

    next();
  }
}
