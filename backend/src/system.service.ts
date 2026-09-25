import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemMetric } from './entities/system-metric.entity';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EventsGateway } from './events.gateway';

const execAsync = promisify(exec);

@Injectable()
export class SystemService implements OnModuleInit {
  private readonly logger = new Logger(SystemService.name);
  private previousCpuUsage: { idle: number; total: number } = { idle: 0, total: 0 };

  constructor(
    @InjectRepository(SystemMetric)
    private metricRepository: Repository<SystemMetric>,
    @Inject(forwardRef(() => EventsGateway)) private eventsGateway: EventsGateway,
  ) {}

  onModuleInit() {
    this.previousCpuUsage = this.getCpuTickInfo();
    setTimeout(() => this.collectMetrics(), 2000);
  }

  // Collect every 1 minute
  @Cron(CronExpression.EVERY_MINUTE)
  async collectMetrics() {
    try {
      const cpuUsage = this.calculateCpuUsage();
      
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const ramUsedGb = usedMem / (1024 ** 3);
      const ramTotalGb = totalMem / (1024 ** 3);
      const ramUsage = (usedMem / totalMem) * 100;

      const diskStats = await this.getDiskUsage();

      const metric = this.metricRepository.create({
        cpuUsage: parseFloat(cpuUsage.toFixed(2)),
        ramUsed: parseFloat(ramUsedGb.toFixed(2)),
        ramTotal: parseFloat(ramTotalGb.toFixed(2)),
        ramUsage: parseFloat(ramUsage.toFixed(2)),
        diskUsed: parseFloat(diskStats.usedGb.toFixed(2)),
        diskTotal: parseFloat(diskStats.totalGb.toFixed(2)),
        diskUsage: parseFloat(diskStats.usage.toFixed(2)),
        uptime: Math.floor(os.uptime()),
      });

      await this.metricRepository.save(metric);

      // Broadcast latest health to connected clients
      this.eventsGateway.broadcastSystemHealth(metric);

      // Self-Monitoring Alerting
      if (ramUsage > 90 || diskStats.usage > 90) {
        this.logger.warn(`[!] System Health Warning! RAM: ${ramUsage.toFixed(1)}%, Disk: ${diskStats.usage.toFixed(1)}%`);
      }

      // ?? EMERGENCY DISK SAVER: If Disk > 85%, forcefully delete oldest 100,000 logs!
      if (diskStats.usage > 85) {
        this.logger.error('[EMERGENCY] Disk space exceeded 85%! Initiating emergency log purge to prevent OS crash...');
        try {
          // TypeORM raw query to delete oldest 100,000 rows quickly
          await this.metricRepository.query('DELETE FROM attack WHERE id IN (SELECT id FROM attack ORDER BY "createdAt" ASC LIMIT 100000);');
          this.logger.log('[EMERGENCY] 100,000 oldest logs deleted successfully.');
        } catch (e) {
          this.logger.error('[EMERGENCY] Failed to purge logs', e);
        }
      }

    } catch (error) {
      this.logger.error('Failed to collect system metrics', error);
    }
  }

  private getCpuTickInfo() {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
      idle += cpu.times.idle;
    }
    return { idle, total };
  }

  private calculateCpuUsage(): number {
    const current = this.getCpuTickInfo();
    const idleDiff = current.idle - this.previousCpuUsage.idle;
    const totalDiff = current.total - this.previousCpuUsage.total;
    this.previousCpuUsage = current;
    
    if (totalDiff === 0) return 0;
    return 100 - ((idleDiff / totalDiff) * 100);
  }

  private async getDiskUsage(): Promise<{ usedGb: number, totalGb: number, usage: number }> {
    try {
      if (os.platform() === 'win32') {
        const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
        const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l && !l.toLowerCase().startsWith('caption'));
        let cDrive = lines.find(l => l.startsWith('C:')) || lines[0];
        if (!cDrive) throw new Error('No drive found');
        const parts = cDrive.split(/\s+/);
        const freeBytes = parseInt(parts[1], 10);
        const totalBytes = parseInt(parts[2], 10);
        const usedBytes = totalBytes - freeBytes;
        return {
          usedGb: usedBytes / (1024 ** 3),
          totalGb: totalBytes / (1024 ** 3),
          usage: (usedBytes / totalBytes) * 100
        };
      } else {
        const { stdout } = await execAsync('df -k /hostfs 2>/dev/null | tail -n 1 || df -k / | tail -n 1');
        const parts = stdout.trim().split(/\s+/);
        const totalKb = parseInt(parts[1], 10);
        const usedKb = parseInt(parts[2], 10);
        return {
          usedGb: usedKb / (1024 ** 2),
          totalGb: totalKb / (1024 ** 2),
          usage: (usedKb / totalKb) * 100
        };
      }
    } catch (e) {
      return { usedGb: 0, totalGb: 0, usage: 0 };
    }
  }

  async getRecentMetrics(hours: number = 24) {
    const timeAgo = new Date();
    timeAgo.setHours(timeAgo.getHours() - hours);
    return this.metricRepository.createQueryBuilder('metric')
      .where('metric.timestamp >= :timeAgo', { timeAgo })
      .orderBy('metric.timestamp', 'ASC')
      .getMany();
  }

  async getCurrentHealth() {
    const latest = await this.metricRepository.findOne({
      order: { timestamp: 'DESC' }
    });
    return latest || null;
  }
}
