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
      console.log('[+] Seeded admin user');
    } else {
      // Force update admin password to ensure user is never locked out due to db persistence
      adminUser.passwordHash = 'Admin@1234!';
      await this.userRepository.save(adminUser);
      console.log('[+] Forced reset of admin password to Admin@1234!');
    }

    const guestUser = await this.userRepository.findOne({ where: { role: 'guest' } });
    if (!guestUser) {
      await this.userRepository.save({ username: 'guest', passwordHash: 'Guest@1234!', role: 'guest' });
      console.log('[+] Seeded guest user');
    }

    // Mock data seeding has been removed to prepare for production/real data
  }
}
