import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AttacksController } from './attacks.controller';
import { LogService } from './log.service';
import { EventsGateway } from './events.gateway';
import { User } from './entities/user.entity';
import { Attack } from './entities/attack.entity';
import { LoginSession } from './entities/login-session.entity';
import { ApiLog } from './entities/api-log.entity';
import { SeedService } from './seed.service';
import { ApiLogModule } from './api-log/api-log.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/honeypot',
      entities: [User, Attack, LoginSession, ApiLog],
      synchronize: true, // สร้างตาราง api_logs ให้อัตโนมัติ
    }),
    TypeOrmModule.forFeature([User, Attack, LoginSession, ApiLog]),
    ApiLogModule,
  ],
  controllers: [AuthController, AttacksController],
  providers: [LogService, EventsGateway, SeedService],
})
export class AppModule {}
