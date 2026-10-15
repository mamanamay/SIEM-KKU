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
import * as bcrypt from 'bcryptjs';

import { signAccessToken, signPreAuth, verifyPreAuth } from './auth-tokens';
import { PublicEndpoint, SelfService } from './auth-policy';
import { Roles } from './roles.guard';
import { randomUUID } from 'crypto';
import { safeHttp } from './outbound-http';
import { ssoApiEndpoint } from './integration-url';
import { ForbiddenException } from '@nestjs/common';

import { UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('api/auth')
@Roles('admin')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(LoginSession)
    private sessionRepository: Repository<LoginSession>,
    private readonly totpService: TotpService,
  ) {}

  private async issuePreAuth(user: User, stage: 'setup' | 'verify') {
    if (user.accountStatus !== 'active') throw new UnauthorizedException('Account disabled');
    user.preAuthNonce = randomUUID();
    const updated = await this.userRepository.update({ id: user.id, accountStatus: 'active', tokenVersion: user.tokenVersion }, { preAuthNonce: user.preAuthNonce });
    if (updated.affected !== 1) throw new UnauthorizedException('Account changed; login again');
    return signPreAuth(user.id, stage, user.preAuthNonce, user.tokenVersion);
  }

  private requireChallenge(user: User | null, challenge: any) {
    if (!user || user.accountStatus !== 'active' || user.preAuthNonce !== challenge.nonce ||
        user.tokenVersion !== challenge.version) throw new UnauthorizedException('Challenge revoked');
  }

  private async updateSelf(user: User, fields: Partial<User>) {
    const result = await this.userRepository.update({ id: user.id, tokenVersion: user.tokenVersion, accountStatus: 'active' }, fields);
    if (result.affected !== 1) throw new UnauthorizedException('Account changed; login again');
  }

  private async consumeChallenge(user: User, challenge: any) {
    const secret = user.totpSecretEnc;
    if (!secret) throw new UnauthorizedException('Missing 2FA secret');
    const result = await this.userRepository.update({ id: user.id, preAuthNonce: challenge.nonce,
      tokenVersion: challenge.version, accountStatus: 'active', totpSecretEnc: secret },
      { preAuthNonce: null, backupCodesJson: user.backupCodesJson });
    if (result.affected !== 1) throw new UnauthorizedException('Challenge already used or revoked');
  }

  private requireSelf(user: User, req: any) {
    if (Number(req.user.sub) !== user.id) throw new ForbiddenException('Only the account owner may enroll or disable 2FA');
  }

  // ── Local Login (2FA-aware) ──────────────────────────────
  @Post('login')
  @PublicEndpoint()
  async login(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const { username, password } = body;
    const user = await this.userRepository.findOne({ where: { username } });

    if (user && user.accountStatus === 'active' && user.authMethod !== 'kku_sso' && user.passwordHash && typeof password === 'string' && await bcrypt.compare(password, user.passwordHash)) {
      // Password correct — determine 2FA stage
      if (!user.totpEnabled) {
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
        const preAuth = await this.issuePreAuth(user, 'verify');
        res.cookie('pre_auth_token', preAuth, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
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
  @PublicEndpoint()
  async mfaSetup(@Req() req: any) {
    const preAuth = req.cookies?.pre_auth_token;
    const payload = verifyPreAuth(preAuth);
    if (!payload || payload.stage !== 'setup') {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบก่อนและเริ่มการตั้งค่า 2FA');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.userId } });
    this.requireChallenge(user, payload);
    if (!user) throw new UnauthorizedException('ไม่พบผู้ใช้');

    // Generate new secret every time setup is called (safe to regenerate)
    const setup = await this.totpService.generateSetup(user.username);

    // Store encrypted secret (unconfirmed — totpEnabled stays false)
    user.totpSecretEnc = setup.encryptedSecret;
    const updated = await this.userRepository.update({ id: user.id, preAuthNonce: payload.nonce, totpEnabled: false }, { totpSecretEnc: setup.encryptedSecret });
    if (updated.affected !== 1) throw new UnauthorizedException('Setup challenge revoked');

    return {
      qrCodeDataUrl: setup.qrCodeDataUrl,
      secret: setup.secret, // for manual entry
      message: 'สแกน QR Code ด้วยแอป Authenticator แล้วกรอกรหัส 6 หลักเพื่อยืนยัน',
    };
  }

  // ── 2FA Setup Confirm: Verify code, enable TOTP, issue session ──────
  @Post('2fa/setup/confirm')
  @PublicEndpoint()
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
    this.requireChallenge(user, payload);
    if (!user || !user.totpSecretEnc || user.totpEnabled) throw new UnauthorizedException('ไม่พบข้อมูล 2FA กรุณาเริ่มใหม่');

    const isValid = await this.totpService.verifyCode(code, user.totpSecretEnc);
    if (!isValid) throw new UnauthorizedException('รหัส 2FA ไม่ถูกต้อง กรุณาลองใหม่');

    // Code valid — enable TOTP and generate backup codes
    const { plainCodes, hashedCodes } = await this.totpService.generateBackupCodes();
    user.totpEnabled = true;
    user.backupCodesJson = JSON.stringify(hashedCodes);
    const confirmed = await this.userRepository.update({ id: user.id, preAuthNonce: payload.nonce,
      tokenVersion: payload.version, accountStatus: 'active', totpEnabled: false, totpSecretEnc: user.totpSecretEnc },
      { totpEnabled: true, backupCodesJson: user.backupCodesJson, preAuthNonce: null, tokenVersion: user.tokenVersion + 1 });
    if (confirmed.affected !== 1) throw new UnauthorizedException('Setup challenge revoked or already used');
    user.tokenVersion++;

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
  @PublicEndpoint()
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
    this.requireChallenge(user, payload);
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
    await this.consumeChallenge(user, payload);
    res.clearCookie('pre_auth_token');
    return {
      access_token: signAccessToken(user),
      role: user.role,
      username: user.username,
    };
  }

  // ── User: Init 2FA Setup (from Settings page) ───────────
  @Post('users/:username/init-2fa')
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter', 'guest', 'viewer')
  @SelfService()
  async initTwoFa(@Param('username') username: string, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const user = await this.userRepository.createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');
    this.requireSelf(user, req);
    
    if (user.totpEnabled) throw new BadRequestException('2FA is already enabled');
    // We set a pre_auth_token to reuse the existing setup flow
    const preAuth = await this.issuePreAuth(user, 'setup');
    res.cookie('pre_auth_token', preAuth, {
      httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000, // 10 mins for setup
    });return { success: true, message: 'กรุณาตั้งค่า 2FA' };
  }

  // ── User: Disable 2FA (from Settings page) ──────────────
  @Post('users/:username/disable-2fa')
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter', 'guest', 'viewer')
  @SelfService()
  async disableTwoFa(@Param('username') username: string, @Req() req: any) {
    const user = await this.userRepository.createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');
    this.requireSelf(user, req);

    user.totpSecretEnc = null;
    user.totpEnabled = false;
    user.backupCodesJson = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.preAuthNonce = null;
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
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.preAuthNonce = null;
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
  @PublicEndpoint()
  @Redirect()
  ssoLogin() {
    // Read the App ID from .env so we NEVER hardcode it in the frontend
    const clientId = process.env.SSO_CLIENT_ID || '';
    if (!clientId) throw new BadRequestException('SSO_CLIENT_ID is missing in server configuration');
    const ssoWebUrl = process.env.SSO_WEB_URL || 'https://ssonext.kku.ac.th';
    return { url: `${ssoApiEndpoint(ssoWebUrl, 'login')}?app=${encodeURIComponent(clientId)}` };
  }

  // ── SSO Callback ────────────────────────────────────────
  @Post('sso/callback')
  @PublicEndpoint()
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
      
      const tokenRes = await safeHttp({ url: ssoApiEndpoint(ssoApiUrl, 'auth.token'),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: payload,
      });
      const tokenData = tokenRes.data;

      if (!tokenData.ok) {
        throw new UnauthorizedException(
          'KKU SSO ไม่ยอมรับการแลก authorization code กรุณาลองเข้าสู่ระบบใหม่',
        );
      }

      // 2. Get User Profile
      const profileRes = await safeHttp({ url: ssoApiEndpoint(ssoApiUrl, 'user.profile'),
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenData.accessToken}` },
      });
      const profileData = profileRes.data;

      if (!profileData.ok) {
        throw new UnauthorizedException('ไม่สามารถดึงข้อมูลโปรไฟล์จาก KKU SSO ได้');
      }

      const ssoProfile = profileData.profile || profileData || {};
      const email: string = ssoProfile.email || ssoProfile.mail || ssoProfile.userPrincipalName || ssoProfile.username || ssoProfile.uid || '';
      
      if (!email) {
        throw new UnauthorizedException('ไม่พบข้อมูลบัญชีผู้ใช้จากระบบ KKU SSO');
      }

      const usernamePrefix = email.includes('@') ? email.split('@')[0] : email;

      // *** WHITELIST CHECK *** — look up by FULL email or Prefix (Case-Insensitive)
      let user = await this.userRepository.createQueryBuilder('user')
        .where('(LOWER(user.username) = LOWER(:email) OR LOWER(user.email) = LOWER(:email))', { email })
        .andWhere('user.authMethod = :method', { method: 'kku_sso' })
        .getOne();
      // Legacy approved SSO accounts used a short username with no stored email.
      // Never match local accounts, another email/domain, or a wildcard username.
      if (!user && /^[^@\s]+@(?:[a-z0-9-]+\.)*kku\.ac\.th$/i.test(email)) {
        user = await this.userRepository.createQueryBuilder('user')
          .where('LOWER(user.username) = LOWER(:prefix)', { prefix: usernamePrefix })
          .andWhere('(user.email IS NULL OR user.email = :empty)', { empty: '' })
          .andWhere('user.authMethod = :method', { method: 'kku_sso' })
          .getOne();
      }
      if (!user || user.accountStatus !== 'active') {
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
        const preAuth = await this.issuePreAuth(user, 'verify');
        res.cookie('pre_auth_token', preAuth, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 5 * 60 * 1000,
        });
        return { stage: 'verify', message: 'กรุณายืนยันรหัส 2FA' };
      }

      return { access_token: signAccessToken(user), role: user.role, username: user.username, requirePasswordChange: user.requirePasswordChange };
    } catch (err) {
      // Axios errors may contain client secrets and bearer tokens in config.
      console.error('SSO request failed', { status: err.response?.status, code: err.code });
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException(`เชื่อมต่อ KKU SSO ไม่สำเร็จ (HTTP ${err.response?.status || 'unavailable'}): ${err.code || err.message || 'SSO Authentication failed'}`);
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
    if (role && !['admin', 'analyst', 'guest', 'viewer'].includes(role)) throw new BadRequestException('Invalid role');
    if (!isSso && (typeof password !== 'string' || password.length < 12)) throw new BadRequestException('Password must contain at least 12 characters');
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
      authMethod: isSso ? 'kku_sso' : 'local',
      requirePasswordChange: !isSso,
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

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.preAuthNonce = null;
    await this.userRepository.save(user);
    return { success: true, message: `เปลี่ยนสิทธิ์ของ "${username}" เป็น ${user.role} สำเร็จ` };
  }

  // ── Change Password ────────────────────────────────────
  @Put('users/:username/password')
  async changePassword(@Param('username') username: string, @Body() body: any) {
    const { newPassword } = body;
    if (!newPassword || newPassword.trim().length < 12) {
      throw new BadRequestException('รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร');
    }

    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) throw new BadRequestException('ไม่พบผู้ใช้');
    if (user.passwordHash === 'SSO_MANAGED') {
      throw new BadRequestException('ไม่สามารถเปลี่ยนรหัสผ่านบัญชี SSO ได้');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.preAuthNonce = null;
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
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter', 'guest', 'viewer')
  @SelfService()
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
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter', 'guest', 'viewer')
  @SelfService()
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

    const fields: Partial<User> = {};
    if (body.firstName !== undefined) fields.firstName = body.firstName;
    if (body.lastName !== undefined) fields.lastName = body.lastName;
    if (body.email !== undefined) fields.email = body.email;
    if (Object.keys(fields).length) await this.updateSelf(user, fields);
    return { success: true };
  }

  // === Authenticated 2FA Management (From Settings) ===
  @Post('me/2fa/setup')
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter', 'guest', 'viewer')
  @SelfService()
  async my2FaSetup(@Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Missing token');
    const secret = JWT_SECRET;
    const decoded: any = jwt.verify(token, secret);
    
    const user = await this.userRepository.findOne({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.totpEnabled) throw new BadRequestException('2FA already enabled');

    const { encryptedSecret, qrCodeDataUrl, secret: plainSecret } = await this.totpService.generateSetup(user.username);
    await this.updateSelf(user, { totpSecretEnc: encryptedSecret });

    return { 
      qrCodeUrl: qrCodeDataUrl, 
      secret: plainSecret
    };
  }

  @Post('me/2fa/confirm')
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter', 'guest', 'viewer')
  @SelfService()
  async my2FaConfirm(@Body() body: any, @Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Missing token');
    const secret = JWT_SECRET;
    const decoded: any = jwt.verify(token, secret);
    
    const user = await this.userRepository.findOne({ where: { id: decoded.sub } });
    if (!user || !user.totpSecretEnc || user.totpEnabled) throw new UnauthorizedException('Invalid state');

    const { code } = body;
    const isValid = await this.totpService.verifyCode(code, user.totpSecretEnc);
    if (!isValid) throw new UnauthorizedException('Invalid 2FA code');

    const { plainCodes, hashedCodes } = await this.totpService.generateBackupCodes();
    const confirmed = await this.userRepository.update({ id: user.id, tokenVersion: user.tokenVersion, accountStatus: 'active', totpEnabled: false, totpSecretEnc: user.totpSecretEnc }, { totpEnabled: true, backupCodesJson: JSON.stringify(hashedCodes), tokenVersion: user.tokenVersion + 1, preAuthNonce: null });
    if (confirmed.affected !== 1) throw new UnauthorizedException('2FA state changed');

    user.tokenVersion++;
    return { success: true, backupCodes: plainCodes, access_token: signAccessToken(user) };
  }

  @Post('me/2fa/disable')
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter', 'guest', 'viewer')
  @SelfService()
  async my2FaDisable(@Req() req: any) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedException('Missing token');
    const secret = JWT_SECRET;
    const decoded: any = jwt.verify(token, secret);
    
    const user = await this.userRepository.findOne({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    await this.updateSelf(user, { totpEnabled: false, totpSecretEnc: null, backupCodesJson: null, tokenVersion: user.tokenVersion + 1, preAuthNonce: null });

    user.tokenVersion++;
    return { success: true, message: '2FA disabled', access_token: signAccessToken(user) };
  }

  @Post('change-password')
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter', 'guest', 'viewer')
  @SelfService()
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
      throw new BadRequestException('รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร');
    }
    if (newPassword.toLowerCase().includes(user.username.toLowerCase())) {
      throw new BadRequestException('รหัสผ่านต้องไม่มีชื่อผู้ใช้งาน (username) อยู่ในนั้น');
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      throw new BadRequestException('รหัสผ่านต้องประกอบด้วยตัวอักษรพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข');
    }

    await this.updateSelf(user, { passwordHash: await bcrypt.hash(newPassword, 10), requirePasswordChange: false, tokenVersion: user.tokenVersion + 1, preAuthNonce: null });

    // Other sessions remain revoked; the caller receives a token for the new version.
    user.tokenVersion += 1;
    user.requirePasswordChange = false;
    return { success: true, message: 'Password changed successfully',
      access_token: signAccessToken(user), role: user.role, username: user.username };
  }
}
