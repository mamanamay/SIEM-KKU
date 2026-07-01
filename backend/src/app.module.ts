import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AttacksController } from './attacks.controller';
import { LogService } from './log.service';
import { EventsGateway } from './events.gateway';
import { User } from './entities/user.entity';
import { Attack } from './entities/attack.entity';
import { LoginSession } from './entities/login-session.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/honeypot',
      entities: [User, Attack, LoginSession],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([User, Attack, LoginSession])
  ],
  controllers: [AuthController, AttacksController],
  providers: [LogService, EventsGateway, SeedService],
})
export class AppModule {}
