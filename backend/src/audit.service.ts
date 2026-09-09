import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
  ) {}

  async log(data: {
    userId?: number;
    username?: string;
    role?: string;
    action: string;
    resource?: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    result: 'SUCCESS' | 'FAILED';
    metadata?: any;
  }) {
    try {
      const entry = this.auditRepository.create({
        user_id: data.userId,
        username: data.username,
        role: data.role,
        action: data.action,
        resource: data.resource,
        resource_id: data.resourceId,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
        result: data.result,
        metadata: data.metadata,
      });
      await this.auditRepository.save(entry);
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }
}
