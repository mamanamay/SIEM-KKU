import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Controller('api/admin/audit-logs')
export class AuditController {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>
  ) {}

  @Get()
  async getAuditLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('search') search: string = '',
    @Query('category') category: string = 'all'
  ) {
    const qb = this.auditRepo.createQueryBuilder('log')
        .orderBy('log.timestamp', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);
    
    if (search) {
      qb.andWhere('(log.username LIKE :search OR log.action LIKE :search)', { search: '%' + search + '%' });
    }

    const [logs, total] = await qb.getManyAndCount();

    return {
      data: logs.map(l => ({
        id: `AD-${l.id}`,
        user: l.username || 'system',
        role: l.role || 'unknown',
        action: l.action,
        category: l.resource || 'System',
        status: l.result,
        ip: l.ip_address || '127.0.0.1',
        ua: l.user_agent || 'N/A',
        time: l.timestamp
      })),
      total,
      page,
      limit
    };
  }
}