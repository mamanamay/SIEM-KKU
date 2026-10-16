import { User } from './entities/user.entity';
import * as bcrypt from 'bcryptjs';
import { Put, Param, Delete } from '@nestjs/common';
﻿import { Controller, Get, Post, Body, Req, BadRequestException , Res, UseGuards } from '@nestjs/common';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import * as path from 'path';
import * as fs from 'fs';
import { AuthGuard } from './auth.guard';
import { RolesGuard, Roles } from './roles.guard';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { AuditService } from './audit.service';
import axios from 'axios';
import { safeHttp, safeAiHttp } from './outbound-http';
import { aiFailure } from './ai.service';
import { aiApiBase } from './integration-url';
import { randomBytes } from 'crypto';

@Controller('api/settings')
@UseGuards(AuthGuard, RolesGuard)
export class SettingsController {
  @Post('integrations/ai-proxy/models')
  async getAiModels(@Body() body: { aiApiUrl?: string, aiKey?: string }, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id: req.user.sub } });
    if (!user) throw new BadRequestException('User not found');
    const apiConfig = user && user.apiConfigJson ? JSON.parse(user.apiConfigJson) : {};
    
    const apiUrl = aiApiBase(body.aiApiUrl || apiConfig.aiApiUrl || 'https://gen.ai.kku.ac.th/api/v1');
    let apiKey = body.aiKey;
    
    // If frontend sends masked password, use the real one from DB
    if (apiKey === '********' || !apiKey) {
        apiKey = apiConfig.aiKey;
    }

    if (!apiKey) throw new BadRequestException('AI API Key is missing in Settings');

    let models: any[] = [];
    try {
      // First try standard OpenAI endpoint
      const response2 = await safeHttp({ url: apiUrl + '/models', method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 5000
      });
      models = response2.data?.data || response2.data || [];
    } catch (err: any) {
       console.error('GET /models failed:', err.message);
       // Fallback for custom implementations
       try {
         const response = await safeHttp({ url: apiUrl + '/chat/models-list', method: 'POST', data: {},
           headers: { 'Authorization': `Bearer ${apiKey}` },
           timeout: 5000
         });
         models = response.data?.data || response.data?.models || response.data || [];
       } catch (e: any) {
         console.error('POST /chat/models-list failed:', e.message);
         throw new BadRequestException(`ไม่สามารถโหลดรายชื่อโมเดล AI ได้ (HTTP ${e.response?.status || 'unavailable'}): ${e.code || 'ตรวจสอบการเชื่อมต่อขาออกของเซิร์ฟเวอร์'}`);
       }
    }

    return { models };
  }


  @Roles('admin')
  @Post('logo')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadLogo(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('No file uploaded');
    
    const uploadDir = path.join(__dirname, '..', 'uploads', 'reports');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, 'kku-odt-logo.png');
    fs.writeFileSync(filePath, file.buffer);
    
    const staticPath = path.join(__dirname, '..', '..', 'frontend', 'static', 'kku-odt-logo.png');
    fs.writeFileSync(staticPath, file.buffer);
    
    return { url: '/kku-odt-logo.png?t=' + Date.now() };
  }


  @Roles('admin', 'analyst_l2', 'analyst', 'threat_hunter', 'guest')
  @Post('integrations/ai-proxy/chat/completions')
  async aiProxyChat(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const user = await this.userRepository.findOne({ where: { id: req.user.sub } });
    if (!user) throw new BadRequestException('User not found');
    if (!user || !user.apiConfigJson) throw new BadRequestException('AI is not configured for your account. Please set it in Settings > Integrations.');
    
    const apiConfig = JSON.parse(user.apiConfigJson);
    const apiUrl = aiApiBase(apiConfig.aiApiUrl || 'https://gen.ai.kku.ac.th/api/v1');
    const apiKey = apiConfig.aiKey;
    if (!apiKey) throw new BadRequestException('AI API Key is missing in Settings');
    
    try {
      // For simplicity, we don't stream the proxy, we just wait for the full response and return it
      // so the frontend can still parse it as JSON
      const response = await safeAiHttp({ url: apiUrl + '/chat/completions', method: 'POST', data: {
        model: body.model || apiConfig.aiModel || 'typhoon-v2-70b-instruct',
        messages: body.messages,
        max_tokens: body.max_tokens || 2048,
        temperature: body.temperature || 0.3,
        stream: false // Override stream to false for proxy simplicity
      },
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      
      const modelQuota = response.data?.model_quota;
      const quotaInfo = modelQuota ? ` (Quota: ${modelQuota.daily_remaining_tokens}/${modelQuota.daily_quota_tokens} remaining)` : '';

      this.auditService.log({
        action: 'AI_ANALYSIS',
        resource: 'KKU AI',
        result: 'SUCCESS',
        username: req.user?.username || 'admin',
        ipAddress: req.ip,
        metadata: { quota: modelQuota }
      });

      // We can pass quota info back to frontend inside response.data
      return response.data;
    } catch (e: any) {
      const status = e.response?.status;
      const issue = aiFailure(e);
      const errMsg = issue.message;
      
      let customErrorMsg = `${issue.code}: ${errMsg}`;
      
      // Quota Limit Handling
      if (status === 401 && errMsg.includes('daily limit')) {
        customErrorMsg = 'QUOTA_EXCEEDED: โควต้า AI รายวันของโมเดลนี้เต็มแล้ว กรุณาเปลี่ยนไปใช้โมเดลอื่นแทน (เช่น เปลี่ยนจาก 70B เป็น 8B) ในหน้า Settings > Integrations';
      } else if (status === 401 && errMsg.includes('Invalid API key')) {
        customErrorMsg = 'INVALID_KEY: API Key สำหรับ KKU AI ไม่ถูกต้อง กรุณาตั้งค่าใหม่ใน Settings';
      }
      
      this.auditService.log({
        action: 'AI_ANALYSIS',
        resource: 'KKU AI',
        result: 'FAILED',
        username: req.user?.username || 'admin',
        ipAddress: req.ip,
        metadata: { error: customErrorMsg }
      });
      
      throw new BadRequestException(customErrorMsg);
    }
  }

  constructor(
    @InjectRepository(SystemConfig)
    private configRepo: Repository<SystemConfig>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private auditService: AuditService
  ) {}

  @Get()
  async getSettings(@Req() req: any) {
    let config = await this.configRepo.findOne({ where: { id: 1 } });
    if (!config) {
      config = this.configRepo.create({
        id: 1,
        sysConfigJson: JSON.stringify({
          retentionDays: 90, criticalThreshold: 85, autoBlockEnabled: true,
          alertEmail: 'soc@kku.ac.th', autoLogout: 30
        })
      });
      await this.configRepo.save(config);
    }
    
    const sys = config.sysConfigJson ? JSON.parse(config.sysConfigJson) : {};
    
    const user = await this.userRepository.findOne({ where: { id: req.user.sub } });
    if (!user) throw new BadRequestException('User not found');
    const api = user && user.apiConfigJson ? JSON.parse(user.apiConfigJson) : {
        aiApiUrl: 'https://gen.ai.kku.ac.th/api/v1', aiKey: '',
        scorecardApiUrl: '', scorecardKey: '',
        slackUrl: '', teamsUrl: '', lineToken: ''
    };
    
    // Mask secrets
    if (api.aiKey) api.aiKey = '********';
    if (api.scorecardKey) api.scorecardKey = '********';
    if (api.lineToken) api.lineToken = '********';

    return { sysConfig: sys, apiConfig: api };
  }

  @Post()
  async updateSettings(@Body() body: { sysConfig?: any, apiConfig?: any }, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id: req.user.sub } });
    if (!user) throw new BadRequestException('User not found');

    if (body.sysConfig) {
      if (req.user.role !== 'admin') {
         throw new BadRequestException('Only admins can update system config');
      }
      let config = await this.configRepo.findOne({ where: { id: 1 } });
      if (!config) { config = this.configRepo.create({ id: 1 }); }
      config.sysConfigJson = JSON.stringify(body.sysConfig);
      await this.configRepo.save(config);
    }
    
    if (body.apiConfig) {
      const existingApi = user.apiConfigJson ? JSON.parse(user.apiConfigJson) : {};
      const newApi = body.apiConfig;
      // Restore secrets if masked
      if (newApi.aiKey === '********') newApi.aiKey = existingApi.aiKey;
      if (newApi.scorecardKey === '********') newApi.scorecardKey = existingApi.scorecardKey;
      if (newApi.lineToken === '********') newApi.lineToken = existingApi.lineToken;
      
      user.apiConfigJson = JSON.stringify(newApi);
      await this.userRepository.update({ id: user.id, tokenVersion: user.tokenVersion, accountStatus: 'active' }, { apiConfigJson: user.apiConfigJson });
      if (req.user.role === 'admin' && Object.prototype.hasOwnProperty.call(newApi, 'slackUrl')) {
        let config = await this.configRepo.findOneBy({ id: 1 });
        if (!config) config = this.configRepo.create({ id: 1 });
        const systemApi = JSON.parse(config.apiConfigJson || '{}');
        config.apiConfigJson = JSON.stringify({ ...systemApi, slackUrl: newApi.slackUrl || '' });
        await this.configRepo.save(config);
      }
    }

    this.auditService.log({
      action: 'UPDATE_SETTINGS',
      username: req.user.username,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      result: 'SUCCESS'
    });

    return { success: true };
  }

  @Post('integrations/test-slack')
  async testSlack(@Body() body: { slackUrl: string }, @Req() req: any) {
    if (!body.slackUrl) throw new BadRequestException('Missing Slack URL');
    if (!body.slackUrl.startsWith('https://hooks.slack.com/')) {
        throw new BadRequestException('Invalid Slack Webhook URL');
    }
    try {
      await safeHttp({ url: body.slackUrl, method: 'POST', data: { text: 'SIEM Test Alert: Connection successful!' } });
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'Slack', result: 'SUCCESS', username: req.user.username, ipAddress: req.ip });
      return { success: true };
    } catch (e: any) {
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'Slack', result: 'FAILED', username: req.user.username, ipAddress: req.ip, metadata: { error: e.message } });
      throw new BadRequestException('Failed to send Slack message: ' + e.message);
    }
  }

  @Post('integrations/test-teams')
  async testTeams(@Body() body: { teamsUrl: string }, @Req() req: any) {
    if (!body.teamsUrl) throw new BadRequestException('Missing Teams URL');
    try {
      await safeHttp({ url: body.teamsUrl, method: 'POST', data: { text: 'SIEM Test Alert: Connection successful!' } });
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'Teams', result: 'SUCCESS', username: req.user.username, ipAddress: req.ip });
      return { success: true };
    } catch (e: any) {
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'Teams', result: 'FAILED', username: req.user.username, ipAddress: req.ip, metadata: { error: e.message } });
      throw new BadRequestException('Failed to send Teams message: ' + e.message);
    }
  }

  @Post('integrations/test-ai')
  async testAiIntegration(@Body() body: { aiApiUrl?: string, aiKey?: string, aiModel?: string }, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id: req.user.sub } });
    if (!user) throw new BadRequestException('User not found');
    let saved: any = {};
    try { saved = JSON.parse(user.apiConfigJson || '{}'); } catch { throw new BadRequestException('AI_CONFIG_INVALID: กรุณาบันทึกการตั้งค่า AI ใหม่'); }
    const key = body.aiKey && body.aiKey !== '********' ? body.aiKey : saved.aiKey;
    if (!key) throw new BadRequestException('AI_NOT_CONFIGURED: กรุณาระบุ AI API key สำหรับบัญชีนี้');
    try {
      // Test generation itself, not just an accessible model-list endpoint.
      const response = await safeAiHttp({ url: aiApiBase(body.aiApiUrl || saved.aiApiUrl || 'https://gen.ai.kku.ac.th/api/v1') + '/chat/completions',
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        data: { model: body.aiModel || saved.aiModel || 'typhoon-v2-70b-instruct', messages: [{ role: 'user', content: 'Reply with OK.' }],
          max_tokens: 32, temperature: 0, stream: false } });
      if (typeof response.data?.choices?.[0]?.message?.content !== 'string' || !response.data.choices[0].message.content.trim())
        throw Object.assign(new Error('Empty AI response'), { code: 'AI_EMPTY_RESPONSE' });
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'AI', result: 'SUCCESS', username: req.user.username, ipAddress: req.ip });
      return { success: true, generationVerified: true };
    } catch (error) {
      const issue = aiFailure(error);
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'AI', result: 'FAILED', username: req.user.username, ipAddress: req.ip, metadata: { code: issue.code } });
      throw new BadRequestException(`${issue.code}: ${issue.message}`);
    }
  }

  // --- User Management ---
  @Roles('admin')
  @Get('users')
  async getUsers() {
    const users = await this.userRepository.find({
      select: ['id', 'username', 'firstName', 'lastName', 'email', 'role', 'authMethod', 'accountStatus', 'totpEnabled', 'lastLogin', 'createdAt']
    });
    return users;
  }

  @Roles('admin')
  @Post('users')
  async createUser(@Body() body: any, @Req() req: any) {
    const { username, firstName, lastName, email, role, authMethod } = body;
    if (authMethod !== undefined && !['local', 'kku_sso'].includes(authMethod)) throw new BadRequestException('Invalid authentication method');
    if (!username || !['admin', 'analyst', 'guest', 'viewer', 'analyst_l2', 'threat_hunter'].includes(role)) throw new BadRequestException('Username and valid role are required');
    
    const existing = await this.userRepository.findOne({ where: { username } });
    if (existing) throw new BadRequestException('Username already exists');

    const user = this.userRepository.create({
      username, firstName, lastName, email, role,
      authMethod: authMethod || 'local',
      accountStatus: 'active',
      requirePasswordChange: (authMethod || 'local') === 'local'
    });

    if (user.authMethod === 'local') {
      const initPassword = body.password;
      if (typeof initPassword !== 'string' || initPassword.length < 12) throw new BadRequestException('Initial password must contain at least 12 characters');
      user.passwordHash = await bcrypt.hash(initPassword, 10);
    }

    await this.userRepository.save(user);
    this.auditService.log({ action: 'CREATE_USER', resource: user.username, result: 'SUCCESS', username: req.user.username, ipAddress: req.ip });
    return { success: true, user: { id: user.id, username: user.username } };
  }

  @Roles('admin')
  @Put('users/:id')
  async updateUser(@Param('id') id: number, @Body() body: any, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');

    const { firstName, lastName, email, role, accountStatus, requirePasswordChange, authMethod } = body;
    if (authMethod !== undefined && !['local', 'kku_sso'].includes(authMethod)) throw new BadRequestException('Invalid authentication method');
    const methodChanged = authMethod !== undefined && authMethod !== user.authMethod;
    if (methodChanged) {
      if (authMethod === 'local') {
        if (typeof body.password !== 'string' || body.password.length < 12) throw new BadRequestException('Initial password required when switching to Local (at least 12 characters)');
        user.passwordHash = await bcrypt.hash(body.password, 10);
        user.requirePasswordChange = true;
      } else {
        user.passwordHash = 'SSO_MANAGED';
        user.requirePasswordChange = false;
      }
      user.authMethod = authMethod;
    }
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (role !== undefined && !['admin', 'analyst', 'guest', 'viewer', 'analyst_l2', 'threat_hunter'].includes(role)) throw new BadRequestException('Invalid role');
    if (accountStatus !== undefined && !['active', 'disabled'].includes(accountStatus)) throw new BadRequestException('Invalid account status');
    if (accountStatus !== undefined) user.accountStatus = accountStatus;
    if (requirePasswordChange !== undefined && user.authMethod === 'local') user.requirePasswordChange = requirePasswordChange;
    if (role !== undefined || accountStatus !== undefined || methodChanged) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.preAuthNonce = null;
    }

    await this.userRepository.save(user);
    this.auditService.log({ action: 'UPDATE_USER', resource: user.username, result: 'SUCCESS', username: req.user.username, ipAddress: req.ip });
    return { success: true };
  }

  @Roles('admin')
  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: number, @Body() body: any, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
    if (user.authMethod === 'kku_sso') throw new BadRequestException('Cannot reset password for SSO users');

    const newPassword = body.password;
    if (typeof newPassword !== 'string' || newPassword.length < 12) throw new BadRequestException('Password must contain at least 12 characters');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.requirePasswordChange = true;
    user.totpEnabled = false; // Reset 2FA
    user.totpSecretEnc = null;
    user.backupCodesJson = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.preAuthNonce = null;
    
    await this.userRepository.save(user);
    this.auditService.log({ action: 'RESET_USER_PASSWORD', resource: user.username, result: 'SUCCESS', username: req.user.username, ipAddress: req.ip });
    return { success: true, message: 'Password reset and 2FA disabled' };
  }

  @Roles('admin')
  @Delete('users/:id')
  async deleteUser(@Param('id') id: number, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
    if (user.username === 'admin') throw new BadRequestException('Cannot delete primary admin account');
    
    await this.userRepository.remove(user);
    this.auditService.log({ action: 'DELETE_USER', resource: user.username, result: 'SUCCESS', username: req.user.username, ipAddress: req.ip });
    return { success: true };
  }
}



