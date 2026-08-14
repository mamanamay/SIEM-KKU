import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attack } from './entities/attack.entity';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    if (!token) {
      client.emit('error', 'Unauthorized: No token provided');
      client.disconnect();
      return;
    }

    // Verify JWT
    try {
      const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
      jwt.verify(token, secret);
    } catch (err) {
      client.emit('error', 'Unauthorized: Invalid or expired token');
      client.disconnect();
      return;
    }

    console.log(`[WS] Client connected: ${client.id}`);
    const attacks = await this.attackRepository.find({ order: { id: 'DESC' } });
    client.emit('initial_data', attacks);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] Client disconnected: ${client.id}`);
  }

  broadcastAttack(event: any) {
    this.server.emit('new_attack', event);
  }

  sendInitialData(client: Socket, events: any[]) {
    client.emit('initial_data', events);
  }
}
