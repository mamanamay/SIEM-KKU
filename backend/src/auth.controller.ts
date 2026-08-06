import {
  Controller, Post, Body, Req, UnauthorizedException, Get,
  Delete, Param, BadRequestException, Put, Redirect
} from '@nestjs/common';
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

  // ── Local Login ─────────────────────────────────────────
  @Post('login')
  async login(@Body() body: any, @Req() req: any) {
    const { username, password } = body;
    const user = await this.userRepository.findOne({ where: { username } });

    if (user && user.passwordHash === password) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      await this.sessionRepository.save({
        username: user.username,
        role: user.role,
        ipAddress: Array.isArray(ip) ? ip[0] : ip,
      });
      return { access_token: `fake-jwt-token-for-${user.role}`, role: user.role };
    }

    throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  // ── Login Audit Sessions ────────────────────────────────
  @Get('sessions')
  async getSessions() {
    return this.sessionRepository.find({ order: { timestamp: 'DESC' }, take: 100 });
  }

  // ── SSO Redirect ────────────────────────────────────────
  @Get('sso/login')
  @Redirect()
  ssoLogin() {
    // Read the App ID from .env so we NEVER hardcode it in the frontend
    const clientId = process.env.SSO_CLIENT_ID || '019f5e7a-664b-7b4b-89aa-d3e411cff59f';
    const ssoWebUrl = process.env.SSO_WEB_URL || 'https://ssonext.kku.ac.th';
    return { url: `${ssoWebUrl}/login?app=${clientId}` };
  }

  // ── SSO Callback ────────────────────────────────────────
  @Post('sso/callback')
  async ssoCallback(@Body() body: { code: string }, @Req() req: any) {
    const { code } = body;
    if (!code) throw new BadRequestException('Authorization code is required');

    const clientId = process.env.SSO_CLIENT_ID || '';
    const clientSecret = process.env.SSO_CLIENT_SECRET || '';
    
    // IMPORTANT: This URL MUST EXACTLY match the one registered in the KKU SSO dashboard!
    const redirectUrl = process.env.SSO_CALLBACK_URL || 'https://odt-siem-uat.kku.ac.th/callback';
    const ssoApiUrl = process.env.SSO_API_URL || 'https://ssonext-api.kku.ac.th';

    console.log(`[SSO] Exchanging code. ClientID: ${clientId}, RedirectURL: ${redirectUrl}`);

    try {
      // 1. Exchange code for access token
      const tokenRes = await fetch(`${ssoApiUrl}/auth.token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUrl, clientId, clientSecret }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.ok) {
        console.error(`[SSO Token Error] URL Mismatch or Invalid Secret:`, tokenData);
        throw new UnauthorizedException(
          'ไม่สามารถยืนยันตัวตนกับ KKU SSO ได้: ' + (tokenData.error || 'Unknown error') + '. โปรดตรวจสอบ Redirect URL ในระบบว่าตรงกันหรือไม่',
        );
      }

      // 2. Get User Profile
      const profileRes = await fetch(`${ssoApiUrl}/user.profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenData.accessToken}` },
      });
      const profileData = await profileRes.json();

      if (!profileData.ok) {
        console.error(`[SSO Profile Error]:`, profileData);
        throw new UnauthorizedException('ไม่สามารถดึงข้อมูลโปรไฟล์จาก KKU SSO ได้');
      }

      const email: string = profileData.profile.email;

      // *** WHITELIST CHECK *** — look up by FULL email stored as username
      const user = await this.userRepository.findOne({ where: { username: email } });
      if (!user) {
        throw new UnauthorizedException(
          `อีเมล "${email}" ยังไม่ได้รับอนุญาตให้เข้าสู่ระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มสิทธิ์`,
        );
      }

      // Record Login Session
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      await this.sessionRepository.save({
        username: user.username,
        role: user.role,
        ipAddress: Array.isArray(ip) ? ip[0] : ip,
      });

      return { access_token: `fake-jwt-token-for-${user.role}`, role: user.role };
    } catch (err) {
      console.error('SSO Error:', err);
      throw new UnauthorizedException(err.message || 'SSO Authentication failed');
    }
  }

  // ── Create User ─────────────────────────────────────────
  @Post('register')
  async registerUser(@Body() body: any) {
    const { username, password, role, isSso } = body;
    if (!username) {
      throw new BadRequestException('กรุณากรอก Username');
    }
    if (!isSso && !password) {
      throw new BadRequestException('กรุณากรอก Username และ Password');
    }
    const existing = await this.userRepository.findOne({ where: { username } });
    if (existing) {
      throw new BadRequestException('Username นี้มีในระบบแล้ว');
    }

    const user = this.userRepository.create({
      username,
      passwordHash: isSso ? 'SSO_MANAGED' : password,
      role: role || 'guest',
    });
    await this.userRepository.save(user);
    return { success: true, message: `สร้างบัญชี "${username}" สำเร็จ` };
  }

  // ── List Users (includes password for non-SSO accounts) ─
  @Get('users')
  async getUsers() {
    const users = await this.userRepository.find();
    return users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      // Expose password only for manually managed accounts (not SSO)
      passwordHash: u.passwordHash === 'SSO_MANAGED' ? null : u.passwordHash,
      isSso: u.passwordHash === 'SSO_MANAGED',
    }));
  }

  // ── Change Password ────────────────────────────────────
  @Put('users/:username/password')
  async changePassword(@Param('username') username: string, @Body() body: any) {
    const { newPassword } = body;
    if (!newPassword || newPassword.trim().length < 4) {
      throw new BadRequestException('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
    }

    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');
    if (user.passwordHash === 'SSO_MANAGED') {
      throw new BadRequestException('ไม่สามารถเปลี่ยนรหัสผ่านบัญชี SSO ได้');
    }

    user.passwordHash = newPassword;
    await this.userRepository.save(user);
    return { success: true, message: `เปลี่ยนรหัสผ่านของ "${username}" สำเร็จ` };
  }

  // ── Delete User ─────────────────────────────────────────
  @Delete('users/:username')
  async deleteUser(@Param('username') username: string) {
    if (username === 'admin') {
      throw new BadRequestException('ไม่สามารถลบบัญชี admin หลักได้');
    }
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');

    await this.userRepository.remove(user);
    return { success: true };
  }
}
