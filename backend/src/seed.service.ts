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
    if (adminUser) {
      adminUser.username = 'admin';
      adminUser.passwordHash = 'Admin@1234!';
      await this.userRepository.save(adminUser);
    } else {
      await this.userRepository.save({ username: 'admin', passwordHash: 'Admin@1234!', role: 'admin' });
      console.log('[+] Seeded admin user');
    }

    const guestUser = await this.userRepository.findOne({ where: { role: 'guest' } });
    if (guestUser) {
      guestUser.username = 'guest';
      guestUser.passwordHash = 'Guest@1234!';
      await this.userRepository.save(guestUser);
    } else {
      await this.userRepository.save({ username: 'guest', passwordHash: 'Guest@1234!', role: 'guest' });
      console.log('[+] Seeded guest user');
    }

    const attackCount = await this.attackRepository.count();
    if (attackCount === 0) {
      const now = new Date();
      const timeOpts = { timeZone: 'Asia/Bangkok', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' } as const;
      
      const timeStr1 = new Date(now.getTime() - 5000).toLocaleTimeString('en-US', timeOpts);
      const timeStr2 = new Date(now.getTime() - 15000).toLocaleTimeString('en-US', timeOpts);
      const timeStr3 = new Date(now.getTime() - 45000).toLocaleTimeString('en-US', timeOpts);

      await this.attackRepository.save([
        { 
          timeStr: timeStr1, ip: '185.220.101.4', type: 'SSH Brute Force', severity: 'critical', 
          detail: '320 attempts / 5 min', mitigation: 'Block IP (Immediate) | Disable Password Auth (Long-term)',
          country: 'Russia', clientVersion: 'SSH-2.0-libssh-0.9.3', mitreCode: 'T1110', threatScore: 85
        },
        { 
          timeStr: timeStr2, ip: '91.196.241.88', type: 'SQL Inject', severity: 'high', 
          detail: 'UNION SELECT payload', mitigation: 'Block IP (Immediate) | Use Prepared Statements (Long-term)',
          country: 'China', clientVersion: 'Nmap/7.92', mitreCode: 'T1190', threatScore: 75
        },
        { 
          timeStr: timeStr3, ip: '194.165.16.65', type: 'Web Scan', severity: 'medium', 
          detail: '/wp-login.php, /admin', mitigation: 'Block User-Agent (Immediate) | Hide Admin Paths (Long-term)',
          country: 'Brazil', clientVersion: 'Mozilla/5.0 ZmEu', mitreCode: 'T1595', threatScore: 40
        }
      ]);
      console.log('[+] Seeded 3 mock attacks for demonstration');
    }
  }
}
