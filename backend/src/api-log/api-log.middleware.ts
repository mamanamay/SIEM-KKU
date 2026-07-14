import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiLog } from '../entities/api-log.entity';

@Injectable()
export class ApiLogMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(ApiLog)
    private apiLogRepository: Repository<ApiLog>,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    // ดึง IP จริงของ client (รองรับ proxy/nginx)
    const clientIp = (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown'
    );

    // ดึง role จาก fake-jwt token ถ้ามี
    let authRole: string | undefined;
    const authHeader = req.headers['authorization'] as string;
    if (authHeader?.startsWith('Bearer fake-jwt-token-for-')) {
      authRole = authHeader.replace('Bearer fake-jwt-token-for-', '').trim();
    }

    // Hook เมื่อ response ส่งเสร็จแล้ว
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const path = req.path;

      // ข้ามการบันทึก health check / socket.io
      if (path === '/health' || path.startsWith('/socket.io')) return;

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
      logEntry.authRole = (authRole || null) as any;
      logEntry.responseSize = (responseSize ?? null) as any;

      this.apiLogRepository.save(logEntry).catch((err) => {
        console.warn('[ApiLog] Failed to save log:', err?.message);
      });
    });

    next();
  }
}
