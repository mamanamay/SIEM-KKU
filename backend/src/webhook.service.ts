import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookConfig } from './entities/webhook-config.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import * as crypto from 'crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookConfig)
    private readonly webhookConfigRepository: Repository<WebhookConfig>,
    @InjectRepository(WebhookDelivery)
    private readonly webhookDeliveryRepository: Repository<WebhookDelivery>,
  ) {}

  async triggerWebhooks(event: string, payload: any): Promise<void> {
    const webhooks = await this.webhookConfigRepository.find({ where: { active: true } });
    const matchingWebhooks = webhooks.filter(w => w.events.includes(event));

    const payloadString = JSON.stringify(payload);

    for (const webhook of matchingWebhooks) {
      const startTime = Date.now();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (webhook.secret) {
        const signature = crypto.createHmac('sha256', webhook.secret).update(payloadString).digest('hex');
        headers['X-KKU-SIEM-Signature'] = signature;
      }

      const delivery = new WebhookDelivery();
      delivery.webhookId = webhook.id;
      delivery.event = event;
      delivery.payload = payloadString;

      try {
        const response = await fetch(webhook.url, {
          method: webhook.method || 'POST',
          headers,
          body: payloadString,
        });

        const endTime = Date.now();
        delivery.status = response.ok ? 'Success' : 'Failed';
        delivery.httpCode = response.status;
        delivery.responseTime = endTime - startTime;

        if (!response.ok) {
          delivery.errorReason = `HTTP Error: ${response.statusText}`;
        }
      } catch (error: any) {
        const endTime = Date.now();
        delivery.status = 'Failed';
        delivery.responseTime = endTime - startTime;
        delivery.errorReason = error.message;
      }

      await this.webhookDeliveryRepository.save(delivery);
    }
  }
}
