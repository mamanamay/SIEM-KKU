import { Controller, Post, Body, Req, UnauthorizedException, Get, Delete, Param, BadRequestException } from '@nestjs/common';
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

  @Post('register')
  async registerUser(@Body() body: any) {
    const { username, password, role } = body;
    const existing = await this.userRepository.findOne({ where: { username } });
    if (existing) {
      throw new BadRequestException('Username already exists');
    }
    
    const user = this.userRepository.create({
      username,
      passwordHash: password, // In a real app, hash this!
      role: role || 'guest'
    });
    await this.userRepository.save(user);
    return { success: true, message: 'User created successfully' };
  }

  @Get('users')
  async getUsers() {
    const users = await this.userRepository.find();
    // Don't send passwords back to the client
    return users.map(u => ({ id: u.id, username: u.username, role: u.role }));
  }

  @Delete('users/:username')
  async deleteUser(@Param('username') username: string) {
    if (username === 'admin') {
      throw new BadRequestException('Cannot delete default admin account');
    }
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) throw new BadRequestException('User not found');
    
    await this.userRepository.remove(user);
    return { success: true };
  }
}
