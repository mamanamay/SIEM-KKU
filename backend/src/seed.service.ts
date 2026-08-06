import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Attack } from './entities/attack.entity';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
  ) {}

  async onModuleInit() {
    console.log('[+] Checking database seed...');
    
    const adminUser = await this.userRepository.findOne({ where: { role: 'admin' } });
    if (!adminUser) {
      await this.userRepository.save({ username: 'admin', passwordHash: 'Admin@1234!', role: 'admin' });
      console.log('[+] Seeded admin user with default password (Admin@1234!)');
    }

    const guestUser = await this.userRepository.findOne({ where: { role: 'guest' } });
    if (!guestUser) {
      await this.userRepository.save({ username: 'guest', passwordHash: 'guest', role: 'guest' });
      console.log('[+] Seeded guest user');
    }

    // Seed 3 example cases if database is empty so the dashboard has some initial data
    const attackCount = await this.attackRepository.count();
    if (attackCount === 0) {
      console.log('[+] Database is empty. Seeding 3 example threat cases...');
      const samples = [
        {
          timeStr: new Date(Date.now() - 3600000).toISOString(),
          ip: '192.168.1.105',
          country: 'Local Network',
          type: 'Suspicious Network Scan',
          severity: 'medium',
          detail: 'Detected NMAP aggressive scanning on multiple ports',
          mitreCode: 'T1046',
          timestampMs: Date.now() - 3600000,
        },
        {
          timeStr: new Date(Date.now() - 7200000).toISOString(),
          ip: '45.33.32.156',
          country: 'United States',
          type: 'Brute Force Authentication',
          severity: 'high',
          detail: 'Multiple failed SSH login attempts detected for user root',
          mitreCode: 'T1110',
          timestampMs: Date.now() - 7200000,
        },
        {
          timeStr: new Date(Date.now() - 14400000).toISOString(),
          ip: '185.15.22.99',
          country: 'Russia',
          type: 'Malware C2 Beacon',
          severity: 'critical',
          detail: 'Outbound connection matches known Trickbot C2 signature',
          mitreCode: 'T1071',
          timestampMs: Date.now() - 14400000,
        }
      ];
      await this.attackRepository.save(samples);
      console.log('[+] Seeded 3 example cases successfully.');
    }
  }
}
