import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attack } from './entities/attack.entity';

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
      client.disconnect();
      return;
    }
    console.log(`Client connected: ${client.id}`);
    
    // Fetch and send all attacks
    const attacks = await this.attackRepository.find({ order: { id: 'DESC' } });
    client.emit('initial_data', attacks);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  broadcastAttack(event: any) {
    this.server.emit('new_attack', event);
  }

  sendInitialData(client: Socket, events: any[]) {
    client.emit('initial_data', events);
  }
}
