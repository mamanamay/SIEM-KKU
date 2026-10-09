import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attack } from './entities/attack.entity';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from './jwt.config';
import { NetworkMapService } from './network-map.service';

@WebSocketGateway({
  cors: {
    // รับจาก origin เดียวกับ server (Nginx proxy) และ localhost สำหรับ dev
    origin: true,
    credentials: true,
  },
  // transports รองรับ WebSocket + polling fallback เพื่อให้ Nginx proxy ได้
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
    private readonly network: NetworkMapService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;

    if (!token) {
      // ใช้ disconnect พร้อม error message ให้ socket.io client จับใน connect_error
      client.disconnect(true);
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // disconnect(true) = force disconnect → client จะเห็นเป็น connect_error
      client.disconnect(true);
      return;
    }

    console.log(`[WS] ✅ Client connected: ${client.id}`);
    const scoped = client.handshake.auth?.scope === 'lan';
    client.join(scoped ? 'lan-events' : 'legacy-events');

    // ส่งข้อมูลเดิมของวันนี้ทั้งหมดให้ client ที่เพิ่ง connect (จัดเรียงเก่าไปใหม่ เพื่อให้ Frontend นำไปต่อท้ายได้ถูกต้อง)
    try {
      const attacks = await this.attackRepository.find({
        order: { id: 'DESC' },
        take: 500
      });
      client.emit('initial_data', scoped ? attacks.filter(event => this.network.evaluate(event).inScope).map(event => ({ ...event, networkScope: this.network.evaluate(event) })).reverse() : attacks.reverse());
    } catch (e) {
      console.error('[WS] Failed to load initial data:', e.message);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] 🔌 Client disconnected: ${client.id}`);
  }

  broadcastSystemHealth(metric: any) {
    this.server.emit('system_health', metric);
  }

  broadcastAttack(event: any) {
    this.server.to('legacy-events').emit('new_attack', event);
    const networkScope = this.network.evaluate(event);
    if (networkScope.inScope) this.server.to('lan-events').emit('new_attack', { ...event, networkScope });
  }

  broadcastAttackCount(event: { id: number; hitCount: number; destIp: string }) {
    this.server.to('legacy-events').emit('attack_count_updated', event);
    if (this.network.evaluate(event).inScope) this.server.to('lan-events').emit('attack_count_updated', event);
  }

  sendInitialData(client: Socket, events: any[]) {
    client.emit('initial_data', client.handshake.auth?.scope === 'lan' ? events.filter(event => this.network.evaluate(event).inScope).map(event => ({ ...event, networkScope: this.network.evaluate(event) })) : events);
  }
  @SubscribeMessage('refresh_scope') async refreshScope(client: Socket) {
    const events = await this.attackRepository.find({ order: { id: 'DESC' }, take: 500 });
    this.sendInitialData(client, events.reverse());
  }
}
