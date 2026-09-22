import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Attack } from './entities/attack.entity';
import * as bcrypt from 'bcrypt';

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
    
    const hash = await bcrypt.hash('Admin@1234!', 10);
    const adminUser = await this.userRepository.findOne({ where: { username: 'admin' } });
    if (!adminUser) {
      await this.userRepository.save({ username: 'admin', passwordHash: hash, role: 'admin' });
      console.log('[+] Seeded admin user');
    } else if (!adminUser.passwordHash.startsWith('$2b$')) {
      // Force update if the password in DB is plain text from an older version
      adminUser.passwordHash = hash;
      await this.userRepository.save(adminUser);
      console.log('[+] Force updated admin password hash');
    }

    const guestHash = await bcrypt.hash('guest123', 10);
    const guestUser = await this.userRepository.findOne({ where: { username: 'guest' } });
    if (!guestUser) {
      await this.userRepository.save({ username: 'guest', passwordHash: guestHash, role: 'guest' });
      console.log('[+] Seeded guest user');
    } else if (!guestUser.passwordHash.startsWith('$2b$')) {
      guestUser.passwordHash = guestHash;
      await this.userRepository.save(guestUser);
      console.log('[+] Force updated guest password hash');
    }

  }
}
