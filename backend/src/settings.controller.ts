import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { Put, Param } from '@nestjs/common';
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

@Controller('api/settings')
@UseGuards(AuthGuard, RolesGuard)
export class SettingsController {
  @Post('integrations/ai-proxy/models')
  async getAiModels(@Body() body: { aiApiUrl?: string, aiKey?: string }) {
    const config = await this.configRepo.findOne({ where: { id: 1 } });
    const apiConfig = config && config.apiConfigJson ? JSON.parse(config.apiConfigJson) : {};
    
    const apiUrl = body.aiApiUrl || apiConfig.aiApiUrl || 'https://gen.ai.kku.ac.th/api/v1';
    let apiKey = body.aiKey;
    
    // If frontend sends masked password, use the real one from DB
    if (apiKey === '********' || !apiKey) {
        apiKey = apiConfig.aiKey;
    }

    if (!apiKey) return { models: [] };

    let models: any[] = [];
    try {
      const response = await axios.post(apiUrl + '/chat/models-list', {}, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 5000
      });
      models = response.data || [];
    } catch (e: any) {
      console.error('POST /chat/models-list failed:', e.message, '- Trying GET /models');
      try {
        const response2 = await axios.get(apiUrl + '/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 5000
        });
        models = response2.data?.data || response2.data || [];
      } catch (err: any) {
         console.error('GET /models failed:', err.message);
      }
    }
    
    // Check quota for each model
    const modelsWithQuota = await Promise.all(models.map(async (model) => {
        try {
            const res = await axios.post(apiUrl + '/chat/completions', {
                model: model.id,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                timeout: 3000
            });
            const quota = res.data?.model_quota || null;
            return { ...model, quota };
        } catch (error: any) {
            const msg = error.response?.data?.error?.message || error.response?.data || '';
            if (String(msg).includes('daily limit') || error.response?.status === 401 || error.response?.status === 403) {
                return { ...model, quota: { daily_remaining_tokens: 0, daily_quota_tokens: 0 }, error: 'Quota Exceeded' };
            }
            return { ...model, quota: null, error: 'Ping failed' };
        }
    }));

    return modelsWithQuota;
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


  @Roles('admin', 'analyst_l2', 'analyst', 'threat_hunter')
  @Post('integrations/ai-proxy/chat/completions')
  async aiProxyChat(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const config = await this.configRepo.findOne({ where: { id: 1 } });
    if (!config || !config.apiConfigJson) throw new BadRequestException('AI is not configured in Settings');
    
    const apiConfig = JSON.parse(config.apiConfigJson);
    const apiUrl = apiConfig.aiApiUrl || 'https://gen.ai.kku.ac.th/api/v1';
    const apiKey = apiConfig.aiKey;
    if (!apiKey) throw new BadRequestException('AI API Key is missing in Settings');
    
    try {
      // For simplicity, we don't stream the proxy, we just wait for the full response and return it
      // so the frontend can still parse it as JSON
      const response = await axios.post(apiUrl + '/chat/completions', {
        model: body.model || apiConfig.aiModel || 'typhoon-v2-70b-instruct',
        messages: body.messages,
        max_tokens: body.max_tokens || 2048,
        temperature: body.temperature || 0.3,
        stream: false // Override stream to false for proxy simplicity
      }, {
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
      const errMsg = e.response?.data?.error?.message || e.message;
      
      let customErrorMsg = errMsg;
      
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
  async getSettings() {
    let config = await this.configRepo.findOne({ where: { id: 1 } });
    if (!config) {
      config = this.configRepo.create({
        id: 1,
        sysConfigJson: JSON.stringify({
          retentionDays: 90, criticalThreshold: 85, autoBlockEnabled: true,
          alertEmail: 'soc@kku.ac.th', autoLogout: 30
        }),
        apiConfigJson: JSON.stringify({
          aiApiUrl: 'https://ai.kku.ac.th/api/v1', aiKey: '',
          scorecardApiUrl: '', scorecardKey: '',
          slackUrl: '', teamsUrl: '', lineToken: ''
        })
      });
      await this.configRepo.save(config);
    }
    
    const sys = config.sysConfigJson ? JSON.parse(config.sysConfigJson) : {};
    const api = config.apiConfigJson ? JSON.parse(config.apiConfigJson) : {};
    
    // Mask secrets
    if (api.aiKey) api.aiKey = '********';
    if (api.scorecardKey) api.scorecardKey = '********';
    if (api.lineToken) api.lineToken = '********';

    return { sysConfig: sys, apiConfig: api };
  }

  @Post()
  @Roles('admin')
  async updateSettings(@Body() body: { sysConfig?: any, apiConfig?: any }, @Req() req: any) {
    let config = await this.configRepo.findOne({ where: { id: 1 } });
    if (!config) { config = this.configRepo.create({ id: 1 }); }
    
    const existingApi = config.apiConfigJson ? JSON.parse(config.apiConfigJson) : {};
    
    if (body.sysConfig) config.sysConfigJson = JSON.stringify(body.sysConfig);
    if (body.apiConfig) {
      const newApi = body.apiConfig;
      // Restore secrets if masked
      if (newApi.aiKey === '********') newApi.aiKey = existingApi.aiKey;
      if (newApi.scorecardKey === '********') newApi.scorecardKey = existingApi.scorecardKey;
      if (newApi.lineToken === '********') newApi.lineToken = existingApi.lineToken;
      
      config.apiConfigJson = JSON.stringify(newApi);
    }
    
    await this.configRepo.save(config);

    this.auditService.log({
      action: 'UPDATE_SYSTEM_CONFIG',
      username: 'admin', // Ideally from JWT
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
      await axios.post(body.slackUrl, { text: 'SIEM Test Alert: Connection successful!' }, { timeout: 5000 });
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'Slack', result: 'SUCCESS', username: 'admin', ipAddress: req.ip });
      return { success: true };
    } catch (e: any) {
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'Slack', result: 'FAILED', username: 'admin', ipAddress: req.ip, metadata: { error: e.message } });
      throw new BadRequestException('Failed to send Slack message: ' + e.message);
    }
  }

  @Post('integrations/test-teams')
  async testTeams(@Body() body: { teamsUrl: string }, @Req() req: any) {
    if (!body.teamsUrl) throw new BadRequestException('Missing Teams URL');
    try {
      await axios.post(body.teamsUrl, { text: 'SIEM Test Alert: Connection successful!' }, { timeout: 5000 });
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'Teams', result: 'SUCCESS', username: 'admin', ipAddress: req.ip });
      return { success: true };
    } catch (e: any) {
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'Teams', result: 'FAILED', username: 'admin', ipAddress: req.ip, metadata: { error: e.message } });
      throw new BadRequestException('Failed to send Teams message: ' + e.message);
    }
  }

  @Post('integrations/test-ai')
  async testAiIntegration(@Body() body: { aiApiUrl: string, aiKey: string, aiModel: string }, @Req() req: any) {
    let key = body.aiKey;
    if (key === '********') {
        const config = await this.configRepo.findOne({ where: { id: 1 } });
        if (config && config.apiConfigJson) {
            const api = config.apiConfigJson ? JSON.parse(config.apiConfigJson) : {};
            key = api.aiKey;
        }
    }

    try {
      const url = body.aiApiUrl || 'https://gen.ai.kku.ac.th/api/v1';
      // Use models-list to test API key instead of guessing a model
      const res = await axios.post(`${url}/chat/models-list`, {}, {
          headers: { 'Authorization': `Bearer ${key}` },
          timeout: 5000
      });
      
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'AI', result: 'SUCCESS', username: 'admin', ipAddress: req.ip });
      return { success: true };
    } catch (e: any) {
      this.auditService.log({ action: 'TEST_INTEGRATION', resource: 'AI', result: 'FAILED', username: 'admin', ipAddress: req.ip, metadata: { error: e.message } });
      throw new BadRequestException('AI Connection Failed: ' + (e.response?.data?.error?.message || e.message));
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
    if (!username || !role) throw new BadRequestException('Username and role are required');
    
    const existing = await this.userRepository.findOne({ where: { username } });
    if (existing) throw new BadRequestException('Username already exists');

    const user = this.userRepository.create({
      username, firstName, lastName, email, role,
      authMethod: authMethod || 'local',
      accountStatus: 'active',
      requirePasswordChange: true
    });

    if (user.authMethod === 'local') {
      const initPassword = body.password || `${username}@2026!`;
      user.passwordHash = await bcrypt.hash(initPassword, 10);
    }

    await this.userRepository.save(user);
    this.auditService.log({ action: 'CREATE_USER', resource: user.username, result: 'SUCCESS', username: 'admin', ipAddress: req.ip });
    return { success: true, user: { id: user.id, username: user.username } };
  }

  @Roles('admin')
  @Put('users/:id')
  async updateUser(@Param('id') id: number, @Body() body: any, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');

    const { firstName, lastName, email, role, accountStatus, requirePasswordChange } = body;
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (accountStatus !== undefined) user.accountStatus = accountStatus;
    if (requirePasswordChange !== undefined) user.requirePasswordChange = requirePasswordChange;

    await this.userRepository.save(user);
    this.auditService.log({ action: 'UPDATE_USER', resource: user.username, result: 'SUCCESS', username: 'admin', ipAddress: req.ip });
    return { success: true };
  }

  @Roles('admin')
  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: number, @Body() body: any, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
    if (user.authMethod === 'kku_sso') throw new BadRequestException('Cannot reset password for SSO users');

    const newPassword = body.password || `${user.username}@Reset!`;
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.requirePasswordChange = true;
    user.totpEnabled = false; // Reset 2FA
    user.totpSecretEnc = null;
    user.backupCodesJson = null;
    
    await this.userRepository.save(user);
    this.auditService.log({ action: 'RESET_USER_PASSWORD', resource: user.username, result: 'SUCCESS', username: 'admin', ipAddress: req.ip });
    return { success: true, message: 'Password reset and 2FA disabled' };
  }
}



