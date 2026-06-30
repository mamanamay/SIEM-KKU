import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AttacksController } from './attacks.controller';
import { LogService } from './log.service';
import { EventsGateway } from './events.gateway';
import { User } from './entities/user.entity';
import { Attack } from './entities/attack.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/honeypot',
      entities: [User, Attack],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([User, Attack])
  ],
  controllers: [AuthController, AttacksController],
  // SeedService removed — system now uses real logs from proxy.js + honeypots
  providers: [LogService, EventsGateway],
})
export class AppModule {}
