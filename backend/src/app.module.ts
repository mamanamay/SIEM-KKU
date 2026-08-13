import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AttacksController } from './attacks.controller';
import { WazuhController } from './wazuh.controller';
import { LogService } from './log.service';
import { AiService } from './ai.service';
import { EventsGateway } from './events.gateway';
import { CryptoService } from './crypto.service';
import { TotpService } from './totp.service';
import { User } from './entities/user.entity';
import { Attack } from './entities/attack.entity';
import { LoginSession } from './entities/login-session.entity';
import { ApiLog } from './entities/api-log.entity';
import { SeedService } from './seed.service';
import { ApiLogModule } from './api-log/api-log.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'database.sqlite',
      entities: [User, Attack, LoginSession, ApiLog],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([User, Attack, LoginSession, ApiLog]),
    ApiLogModule,
  ],
  controllers: [AuthController, AttacksController, WazuhController],
  providers: [LogService, AiService, EventsGateway, SeedService, CryptoService, TotpService],
})
export class AppModule {}
