import * as crypto from 'crypto';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Attack } from './entities/attack.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);
  constructor(@InjectRepository(User) private readonly users: Repository<User>,
              @InjectRepository(Attack) private readonly _attacks: Repository<Attack>) {}

  async onModuleInit() {
    if (await this.users.count() > 0) {
      if (process.env.NODE_ENV === 'production') {
        for (const [username, legacyPassword] of [['admin', 'Admin@1234!'], ['guest', 'guest123']]) {
          const user = await this.users.findOneBy({ username });
          if (user && user.accountStatus === 'active' && user.passwordHash &&
              (user.passwordHash === legacyPassword || await bcrypt.compare(legacyPassword, user.passwordHash))) {
            throw new Error('Legacy default credentials detected for ' + username + '; rotate or disable this account in UAT before production');
          }
        }
      }
      return;
    }
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (process.env.NODE_ENV === 'production' && (!password || password.length < 12 || /ChangeMe|Admin@1234/i.test(password))) {
      throw new Error('Empty production DB requires BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters)');
    }
    const initial = password || crypto.randomBytes(18).toString('base64url');
    await this.users.save({ username: 'admin', passwordHash: await bcrypt.hash(initial, 12),
      role: 'admin', authMethod: 'local', accountStatus: 'active', requirePasswordChange: true });
    if (!password) this.logger.warn('Development bootstrap password (shown once): ' + initial);
    else this.logger.log('Bootstrap admin created; password change required');
  }
}
