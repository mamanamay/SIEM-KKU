import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attack } from './entities/attack.entity';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from './jwt.config';

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

    // ส่งข้อมูลเดิมทั้งหมดให้ client ที่เพิ่ง connect (จัดเรียงเก่าไปใหม่ เพื่อให้ Frontend นำไปต่อท้ายได้ถูกต้อง)
    try {
      const attacks = await this.attackRepository.find({
        order: { id: 'DESC' },
        take: 500, // จำกัดไม่ให้ส่งมากเกินไป
      });
      client.emit('initial_data', attacks.reverse());
    } catch (e) {
      console.error('[WS] Failed to load initial data:', e.message);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] 🔌 Client disconnected: ${client.id}`);
  }

  broadcastAttack(event: any) {
    this.server.emit('new_attack', event);
  }

  sendInitialData(client: Socket, events: any[]) {
    client.emit('initial_data', events);
  }
}
