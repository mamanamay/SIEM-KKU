import { Controller, Post, Body, Req, UnauthorizedException, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginSession } from './entities/login-session.entity';

@Controller('api/auth')
export class AuthController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(LoginSession)
    private sessionRepository: Repository<LoginSession>,
  ) {}

  @Post('login')
  async login(@Body() body: any, @Req() req: any) {
    const { username, password } = body;
    const user = await this.userRepository.findOne({ where: { username } });
    
    if (user && user.passwordHash === password) {
      // Record the login session
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      await this.sessionRepository.save({
        username: user.username,
        role: user.role,
        ipAddress: Array.isArray(ip) ? ip[0] : ip,
      });

      return { access_token: `fake-jwt-token-for-${user.role}`, role: user.role };
    }
    
    throw new UnauthorizedException('Invalid credentials');
  }

  @Get('sessions')
  async getSessions() {
    return this.sessionRepository.find({ order: { timestamp: 'DESC' }, take: 100 });
  }
}
