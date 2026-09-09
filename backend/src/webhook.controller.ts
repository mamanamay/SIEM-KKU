import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookConfig } from './entities/webhook-config.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import * as crypto from 'crypto';

@Controller('api/webhooks')
export class WebhookController {
  constructor(
    @InjectRepository(WebhookConfig)
    private readonly webhookConfigRepository: Repository<WebhookConfig>,
    @InjectRepository(WebhookDelivery)
    private readonly webhookDeliveryRepository: Repository<WebhookDelivery>,
  ) {}

  @Get()
  async getWebhooks() {
    return await this.webhookConfigRepository.find();
  }

  @Post()
  async createWebhook(@Body() config: Partial<WebhookConfig>) {
    const webhook = this.webhookConfigRepository.create(config);
    return await this.webhookConfigRepository.save(webhook);
  }

  @Delete(':id')
  async deleteWebhook(@Param('id') id: string) {
    return await this.webhookConfigRepository.delete(id);
  }

  @Get('logs')
  async getLogs() {
    return await this.webhookDeliveryRepository.find({ order: { timestamp: 'DESC' }, take: 50 });
  }

  @Post('test')
  async testWebhook(@Body() config: Partial<WebhookConfig>) {
    const payload = { message: 'Test webhook payload from KKU SIEM' };
    const payloadString = JSON.stringify(payload);
    const startTime = Date.now();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.secret) {
      const signature = crypto.createHmac('sha256', config.secret).update(payloadString).digest('hex');
      headers['X-KKU-SIEM-Signature'] = signature;
    }

    try {
      if (!config.url) throw new Error('Webhook URL is required');
      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers,
        body: payloadString,
      });

      const endTime = Date.now();
      return {
        success: response.ok,
        status: response.status,
        responseTime: endTime - startTime,
        errorReason: response.ok ? null : response.statusText,
      };
    } catch (error: any) {
      const endTime = Date.now();
      return {
        success: false,
        responseTime: endTime - startTime,
        errorReason: error.message,
      };
    }
  }
}
