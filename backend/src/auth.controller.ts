import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Controller('api/auth')
export class AuthController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  @Post('login')
  async login(@Body() body: any) {
    const { username, password } = body;
    const user = await this.userRepository.findOne({ where: { username } });
    
    if (user && user.passwordHash === password) {
      return { access_token: `fake-jwt-token-for-${user.role}`, role: user.role };
    }
    
    throw new UnauthorizedException('Invalid credentials');
  }
}
