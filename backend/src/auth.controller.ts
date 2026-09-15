import {
  Controller, Post, Body, Req, Res, UnauthorizedException, Get,
  Delete, Param, BadRequestException, Put, Redirect
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { User } from './entities/user.entity';
import { LoginSession } from './entities/login-session.entity';
import { TotpService } from './totp.service';
import { JWT_SECRET } from './jwt.config';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

// ── Pre-auth token helpers (stateless, no DB, short-lived) ──────────────────
// We store a signed JSON in an httpOnly cookie instead of a full JWT lib
// to avoid adding another dependency. In production, use @nestjs/jwt.
function signPreAuth(userId: number, stage: 'setup' | 'verify'): string {
  const payload = { userId, stage, exp: Date.now() + 5 * 60 * 1000 }; // 5 min
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function verifyPreAuth(token: string): { userId: number; stage: 'setup' | 'verify' } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (Date.now() > payload.exp) return null;
    return { userId: payload.userId, stage: payload.stage };
  } catch {
    return null;
  }
}

function signAccessToken(user: { id: number; username: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' },
  );
}

import { UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('api/auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(LoginSession)
    private sessionRepository: Repository<LoginSession>,
    private readonly totpService: TotpService,
  ) {}

  // ── Local Login (2FA-aware) ──────────────────────────────
  @Post('login')
  async login(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const { username, password } = body;
    const user = await this.userRepository.findOne({ where: { username } });

    if (user && await bcrypt.compare(password, user.passwordHash)) {
      // Password correct — determine 2FA stage
      if (!user.totpEnabled || user.username === 'admin') {
        // User does not have 2FA enabled, log them in directly
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        await this.sessionRepository.save({
          username: user.username,
          role: user.role,
          ipAddress: Array.isArray(ip) ? ip[0] : ip,
        });
        // Important: clear any old pre-auth cookies
        res.clearCookie('pre_auth_token');
        return { access_token: signAccessToken(user), role: user.role, username: user.username, requirePasswordChange: user.requirePasswordChange, message: 'เข้าสู่ระบบสำเร็จ' };
      } else {
        // Already set up: user must verify TOTP
        const preAuth = signPreAuth(user.id, 'verify');
        res.cookie('pre_auth_token', preAuth, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 5 * 60 * 1000,
        });
        return { stage: 'verify', message: 'กรุณายืนยันรหัส 2FA' };
      }
    }

    throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  // ── 2FA Setup: Generate QR Code ─────────────────────────
  @Post('2fa/setup')
  async mfaSetup(@Req() req: any) {
    const preAuth = req.cookies?.pre_auth_token;
    const payload = verifyPreAuth(preAuth);
    if (!payload || payload.stage !== 'setup') {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบก่อนและเริ่มการตั้งค่า 2FA');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedException('ไม่พบผู้ใช้');

    // Generate new secret every time setup is called (safe to regenerate)
    const setup = await this.totpService.generateSetup(user.username);

    // Store encrypted secret (unconfirmed — totpEnabled stays false)
    user.totpSecretEnc = setup.encryptedSecret;
    await this.userRepository.save(user);

    return {
      qrCodeDataUrl: setup.qrCodeDataUrl,
      secret: setup.secret, // for manual entry
      message: 'สแกน QR Code ด้วยแอป Authenticator แล้วกรอกรหัส 6 หลักเพื่อยืนยัน',
    };
  }

  // ── 2FA Setup Confirm: Verify code, enable TOTP, issue session ──────
  @Post('2fa/setup/confirm')
  async mfaSetupConfirm(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const preAuth = req.cookies?.pre_auth_token;
    const payload = verifyPreAuth(preAuth);
    if (!payload || payload.stage !== 'setup') {
      throw new UnauthorizedException('กรุณาเริ่มกระบวนการตั้งค่า 2FA ใหม่');
    }

    const { code } = body;
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('กรุณากรอกรหัส 6 หลัก');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.userId } });
    if (!user || !user.totpSecretEnc) throw new UnauthorizedException('ไม่พบข้อมูล 2FA กรุณาเริ่มใหม่');

    const isValid = await this.totpService.verifyCode(code, user.totpSecretEnc);
    if (!isValid) throw new UnauthorizedException('รหัส 2FA ไม่ถูกต้อง กรุณาลองใหม่');

    // Code valid — enable TOTP and generate backup codes
    const { plainCodes, hashedCodes } = await this.totpService.generateBackupCodes();
    user.totpEnabled = true;
    user.backupCodesJson = JSON.stringify(hashedCodes);
    await this.userRepository.save(user);

    // Log session
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await this.sessionRepository.save({
      username: user.username,
      role: user.role,
      ipAddress: Array.isArray(ip) ? ip[0] : ip,
    });

    // Clear pre-auth cookie, issue access token
    res.clearCookie('pre_auth_token');
    return {
      access_token: signAccessToken(user),
      role: user.role,
      username: user.username,
      backupCodes: plainCodes, // show once — user must save these!
      message: '2FA เปิดใช้งานสำเร็จ! กรุณาบันทึก Backup Codes ไว้ในที่ปลอดภัย',
    };
  }

  // ── 2FA Verify: Check code on every login ───────────────
  @Post('2fa/verify')
  async mfaVerify(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const preAuth = req.cookies?.pre_auth_token;
    const payload = verifyPreAuth(preAuth);
    if (!payload || payload.stage !== 'verify') {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบก่อน');
    }

    const { code } = body;
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('กรุณากรอกรหัส 6 หลัก');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.userId } });
    if (!user || !user.totpEnabled || !user.totpSecretEnc) {
      throw new UnauthorizedException('ไม่พบข้อมูล 2FA');
    }

    // Try TOTP code first
    let isValid = await this.totpService.verifyCode(code, user.totpSecretEnc);

    // Try backup codes if TOTP fails
    if (!isValid && user.backupCodesJson) {
      const hashedCodes: string[] = JSON.parse(user.backupCodesJson);
      const usedIndex = await this.totpService.verifyBackupCode(code, hashedCodes);
      if (usedIndex !== -1) {
        // Remove used backup code (one-time use)
        hashedCodes.splice(usedIndex, 1);
        user.backupCodesJson = JSON.stringify(hashedCodes);
        await this.userRepository.save(user);
        isValid = true;
      }
    }

    if (!isValid) throw new UnauthorizedException('รหัส 2FA ไม่ถูกต้อง');

    // Log session
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await this.sessionRepository.save({
      username: user.username,
      role: user.role,
      ipAddress: Array.isArray(ip) ? ip[0] : ip,
    });

    // Clear pre-auth cookie, issue access token
    res.clearCookie('pre_auth_token');
    return {
      access_token: signAccessToken(user),
      role: user.role,
      username: user.username,
    };
  }

  // ── User: Init 2FA Setup (from Settings page) ───────────
  @Post('users/:username/init-2fa')
  async initTwoFa(@Param('username') username: string, @Res({ passthrough: true }) res: Response) {
    const user = await this.userRepository.createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');
    
    // We set a pre_auth_token to reuse the existing setup flow
    const preAuth = signPreAuth(user.id, 'setup');
    res.cookie('pre_auth_token', preAuth, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000, // 10 mins for setup
    });return { success: true, message: 'กรุณาตั้งค่า 2FA' };
  }

  // ── User: Disable 2FA (from Settings page) ──────────────
  @Post('users/:username/disable-2fa')
  async disableTwoFa(@Param('username') username: string) {
    const user = await this.userRepository.createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');

    user.totpSecretEnc = null;
    user.totpEnabled = false;
    user.backupCodesJson = null;
    await this.userRepository.save(user);

    return { success: true, message: 'ปิดการใช้งาน 2FA สำเร็จ' };
  }

  // ── Admin: Reset 2FA for a user ─────────────────────────
  @Post('users/:username/reset-2fa')
  async resetTwoFa(@Param('username') username: string) {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');

    user.totpSecretEnc = null;
    user.totpEnabled = false;
    user.backupCodesJson = null;
    await this.userRepository.save(user);

    return { success: true, message: `รีเซ็ต 2FA ของ "${username}" สำเร็จ — ผู้ใช้จะต้องตั้งค่า 2FA ใหม่เมื่อ Login ครั้งถัดไป` };
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
  async ssoCallback(@Body() body: { code: string }, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const { code } = body;
    if (!code) throw new BadRequestException('Authorization code is required');

    const clientId = process.env.SSO_CLIENT_ID || '';
    const clientSecret = process.env.SSO_CLIENT_SECRET || '';
    
    // IMPORTANT: This URL MUST EXACTLY match the one registered in the KKU SSO dashboard!
    const redirectUrl = process.env.SSO_CALLBACK_URL || 'https://odt-siem-uat.kku.ac.th/callback';
    const ssoApiUrl = process.env.SSO_API_URL || 'https://ssonext-api.kku.ac.th';

    try {
      // 1. Exchange code for access token
      const payload = {
        code,
        redirectUrl,
        redirect_uri: redirectUrl, // Add snake_case for standard OAuth2
        clientId,
        client_id: clientId,       // Add snake_case for standard OAuth2
        clientSecret,
        client_secret: clientSecret // Add snake_case for standard OAuth2
      };
      
      console.log(`[SSO Token Request] Sending to ${ssoApiUrl}/auth.token with redirectUrl: ${redirectUrl}`);
      
      const tokenRes = await fetch(`${ssoApiUrl}/auth.token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

      const ssoProfile = profileData.profile || profileData || {};
      const email: string = ssoProfile.email || ssoProfile.mail || ssoProfile.userPrincipalName || ssoProfile.username || ssoProfile.uid || '';
      
      if (!email) {
        console.error(`[SSO Profile Warning]: No email/username in response`, JSON.stringify(profileData));
        throw new UnauthorizedException('ไม่พบข้อมูลบัญชีผู้ใช้จากระบบ KKU SSO ข้อมูลที่ได้มาคือ: ' + JSON.stringify(profileData));
      }

      const usernamePrefix = email.includes('@') ? email.split('@')[0] : email;

      // *** WHITELIST CHECK *** — look up by FULL email or Prefix (Case-Insensitive)
      const user = await this.userRepository.createQueryBuilder('user')
        .where('LOWER(user.username) = LOWER(:email)', { email })
        .orWhere('LOWER(user.username) = LOWER(:prefix)', { prefix: usernamePrefix })
        .orWhere('LOWER(user.username) LIKE LOWER(:likePrefix)', { likePrefix: `${usernamePrefix}@%` })
        .getOne();
      if (!user) {
        throw new UnauthorizedException(
          `บัญชี "${email}" ยังไม่ได้รับอนุญาตให้เข้าสู่ระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มสิทธิ์`,
        );
      }

      // Record Login Session
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      await this.sessionRepository.save({
        username: user.username,
        role: user.role,
        ipAddress: Array.isArray(ip) ? ip[0] : ip,
      });

      if (user.totpEnabled) {
        // Enforce 2FA for SSO users
        const preAuth = signPreAuth(user.id, 'verify');
        res.cookie('pre_auth_token', preAuth, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 5 * 60 * 1000,
        });
        return { stage: 'verify', message: 'กรุณายืนยันรหัส 2FA' };
      }

      return { access_token: signAccessToken(user), role: user.role, username: user.username, requirePasswordChange: user.requirePasswordChange };
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
    const lowerUsername = username.toLowerCase();
    const existing = await this.userRepository.findOne({ where: { username: lowerUsername } });
    if (existing) {
      throw new BadRequestException('Username นี้มีในระบบแล้ว');
    }

    const hash = isSso ? 'SSO_MANAGED' : await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      username: lowerUsername,
      passwordHash: hash,
      role: role || 'guest',
    });
    await this.userRepository.save(user);
    return { success: true, message: `สร้างบัญชี "${lowerUsername}" สำเร็จ` };
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
      totpEnabled: u.totpEnabled,
    }));
  }

  // ── Update User Role ────────────────────────────────────
  @Put('users/:username')
  async updateUser(@Param('username') username: string, @Body() body: any) {
    if (username === 'admin') {
      throw new BadRequestException('ไม่สามารถเปลี่ยนสิทธิ์ของ admin หลักได้');
    }
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');

    if (body.role && ['admin', 'analyst', 'guest'].includes(body.role)) {
      user.role = body.role;
    }

    await this.userRepository.save(user);
    return { success: true, message: `เปลี่ยนสิทธิ์ของ "${username}" เป็น ${user.role} สำเร็จ` };
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

    user.passwordHash = await bcrypt.hash(newPassword, 10);
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

  // --- My Profile ---
  @Get('me')
  async getMe(@Req() req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('No token');
    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as any;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      authMethod: user.authMethod,
      totpEnabled: user.totpEnabled,
      requirePasswordChange: user.requirePasswordChange
    };
  }

  @Post('me')
  async updateMe(@Body() body: any, @Req() req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('No token');
    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as any;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    if (body.firstName !== undefined) user.firstName = body.firstName;
    if (body.lastName !== undefined) user.lastName = body.lastName;
    if (body.email !== undefined) user.email = body.email;

    await this.userRepository.save(user);
    return { success: true };
  }

  // === Authenticated 2FA Management (From Settings) ===
  @Post('me/2fa/setup')
  async my2FaSetup(@Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Missing token');
    const secret = JWT_SECRET;
    const decoded: any = jwt.verify(token, secret);
    
    const user = await this.userRepository.findOne({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    const { encryptedSecret, qrCodeDataUrl, secret: plainSecret } = await this.totpService.generateSetup(user.username);
    const { plainCodes, hashedCodes } = await this.totpService.generateBackupCodes();
    
    user.totpSecretEnc = encryptedSecret;
    user.backupCodesJson = JSON.stringify(hashedCodes);
    await this.userRepository.save(user);

    return { 
      qrCodeUrl: qrCodeDataUrl, 
      secret: plainSecret, 
      backupCodes: plainCodes 
    };
  }

  @Post('me/2fa/confirm')
  async my2FaConfirm(@Body() body: any, @Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Missing token');
    const secret = JWT_SECRET;
    const decoded: any = jwt.verify(token, secret);
    
    const user = await this.userRepository.findOne({ where: { id: decoded.sub } });
    if (!user || !user.totpSecretEnc) throw new UnauthorizedException('Invalid state');

    const { code } = body;
    const isValid = await this.totpService.verifyCode(code, user.totpSecretEnc);
    if (!isValid) throw new UnauthorizedException('Invalid 2FA code');

    const { plainCodes, hashedCodes } = await this.totpService.generateBackupCodes();
    user.totpEnabled = true;
    user.backupCodesJson = JSON.stringify(hashedCodes);
    await this.userRepository.save(user);

    return { success: true, backupCodes: plainCodes };
  }

  @Post('me/2fa/disable')
  async my2FaDisable(@Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Missing token');
    const secret = JWT_SECRET;
    const decoded: any = jwt.verify(token, secret);
    
    const user = await this.userRepository.findOne({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    user.totpEnabled = false;
    user.totpSecretEnc = null;
    user.backupCodesJson = null;
    await this.userRepository.save(user);

    return { success: true, message: '2FA disabled' };
  }

  @Post('change-password')
  async myChangePassword(@Body() body: any, @Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Missing token');
    const secret = JWT_SECRET;
    const decoded: any = jwt.verify(token, secret);
    
    const user = await this.userRepository.findOne({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.authMethod === 'kku_sso') throw new BadRequestException('Cannot change password for SSO users');

    const { currentPassword, newPassword } = body;
    
    // Allow bypass current password if it's forced change (first login from admin reset)
    if (!user.requirePasswordChange) {
      if (!currentPassword) throw new BadRequestException('Current password required');
      if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
        throw new BadRequestException('Current password incorrect');
      }
    }

    // New password validation
    if (!newPassword || newPassword.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters long');
    }
    if (newPassword.toLowerCase().includes(user.username.toLowerCase())) {
      throw new BadRequestException('Password cannot contain username');
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      throw new BadRequestException('Password must contain uppercase, lowercase, and numbers');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.requirePasswordChange = false; // Successfully changed

    await this.userRepository.save(user);

    return { success: true, message: 'Password changed successfully' };
  }
}
