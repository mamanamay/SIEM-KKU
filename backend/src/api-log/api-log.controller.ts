import { Controller, Get, Query, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, MoreThanOrEqual } from 'typeorm';
import { ApiLog } from '../entities/api-log.entity';
import type { Response } from 'express';

@Controller('api/admin/api-logs')
export class ApiLogController {
  constructor(
    @InjectRepository(ApiLog)
    private apiLogRepository: Repository<ApiLog>,
  ) {}

  /**
   * GET /api/admin/api-logs
   * ดึงประวัติ API พร้อมกรองและ pagination
   * Query params:
   *   - method: GET | POST | PATCH | DELETE
   *   - status: 2xx | 4xx | 5xx (หรือตัวเลขตรงๆ เช่น 200)
   *   - path: filter by path (partial match)
   *   - from: ISO date start
   *   - to: ISO date end
   *   - page: หน้าที่ (default 1)
   *   - limit: จำนวนต่อหน้า (default 50, max 200)
   */
  @Get()
  async getLogs(
    @Query('method') method?: string,
    @Query('status') status?: string,
    @Query('path') pathFilter?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    // กรองตาม Method
    if (method && ['GET','POST','PATCH','DELETE','PUT'].includes(method.toUpperCase())) {
      where.method = method.toUpperCase();
    }

    // กรองตาม Path
    if (pathFilter) {
      where.path = Like(`%${pathFilter}%`);
    }

    // กรองตาม Date range
    if (from || to) {
      const fromDate = from ? new Date(from) : new Date('2000-01-01');
      const toDate = to ? new Date(to) : new Date();
      where.timestamp = Between(fromDate, toDate);
    }

    const [logs, total] = await this.apiLogRepository.findAndCount({
      where,
      order: { timestamp: 'DESC' },
      take: limitNum,
      skip,
    });

    // กรอง status แบบ range (2xx/4xx/5xx) หลัง query เพราะ TypeORM ทำ range ยาก
    let filteredLogs = logs;
    if (status) {
      if (status === '2xx') filteredLogs = logs.filter(l => l.statusCode >= 200 && l.statusCode < 300);
      else if (status === '4xx') filteredLogs = logs.filter(l => l.statusCode >= 400 && l.statusCode < 500);
      else if (status === '5xx') filteredLogs = logs.filter(l => l.statusCode >= 500 && l.statusCode < 600);
      else {
        const code = parseInt(status, 10);
        if (!isNaN(code)) filteredLogs = logs.filter(l => l.statusCode === code);
      }
    }

    return {
      data: filteredLogs,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * GET /api/admin/api-logs/stats
   * สรุปสถิติ API ใน 24 ชั่วโมงล่าสุด
   */
  @Get('stats')
  async getStats() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since1h  = new Date(Date.now() - 60 * 60 * 1000);

    const [all24h, success24h, errors24h, recent1h] = await Promise.all([
      this.apiLogRepository.count({ where: { timestamp: MoreThanOrEqual(since24h) } }),
      this.apiLogRepository.count({ where: { timestamp: MoreThanOrEqual(since24h) } })
        .then(async () => {
          const r = await this.apiLogRepository.createQueryBuilder('l')
            .where('l.timestamp >= :since', { since: since24h })
            .andWhere('l.statusCode < 400')
            .getCount();
          return r;
        }),
      this.apiLogRepository.createQueryBuilder('l')
        .where('l.timestamp >= :since', { since: since24h })
        .andWhere('l.statusCode >= 400')
        .getCount(),
      this.apiLogRepository.count({ where: { timestamp: MoreThanOrEqual(since1h) } }),
    ]);

    // Avg response time ใน 24h
    const avgResult = await this.apiLogRepository.createQueryBuilder('l')
      .select('AVG(l.durationMs)', 'avg')
      .where('l.timestamp >= :since', { since: since24h })
      .getRawOne();

    // Top 5 endpoints ที่ถูกเรียกมากสุด
    const topEndpoints = await this.apiLogRepository.createQueryBuilder('l')
      .select('l.path', 'path')
      .addSelect('l.method', 'method')
      .addSelect('COUNT(*)', 'count')
      .where('l.timestamp >= :since', { since: since24h })
      .groupBy('l.path')
      .addGroupBy('l.method')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();

    return {
      total24h: all24h,
      success24h,
      errors24h,
      recent1h,
      successRate: all24h > 0 ? Math.round((success24h / all24h) * 100) : 100,
      avgResponseMs: Math.round(parseFloat(avgResult?.avg || '0')),
      topEndpoints,
    };
  }

  /**
   * GET /api/admin/api-logs/export
   * Export ประวัติ API เป็น CSV
   */
  @Get('export')
  async exportCsv(@Res() res: Response) {
    const logs = await this.apiLogRepository.find({
      order: { timestamp: 'DESC' },
      take: 5000, // จำกัด 5000 แถว
    });

    const header = 'ID,Timestamp,Method,Path,StatusCode,ClientIP,AuthRole,DurationMs,UserAgent\n';
    const rows = logs.map(l =>
      `${l.id},"${l.timestamp?.toISOString() ?? ''}",${l.method},"${l.path}",${l.statusCode},"${l.clientIp ?? ''}","${l.authRole ?? ''}",${l.durationMs ?? ''},"${(l.userAgent ?? '').replace(/"/g, "'")}"`
    ).join('\n');

    const csv = header + rows;
    const filename = `api-logs-${new Date().toISOString().slice(0,10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM สำหรับ Excel ภาษาไทย
  }
}
