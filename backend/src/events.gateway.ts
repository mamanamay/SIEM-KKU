import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Attack } from './entities/attack.entity';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from './jwt.config';
import { User } from './entities/user.entity';
import { Cron } from '@nestjs/schedule';
import { AlertQueryService } from './alert-query.service';
import { ALERT_POLICY_VERSION } from './alert-policy';
import { NetworkMapService } from './network-map.service';
import { MAX_WS_PENDING_BYTES, MAX_WS_PENDING_PACKETS, MAX_WS_CLIENTS } from './runtime-limits';

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
  private slowClientCloses = 0;
  private checkingSessions = false;
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly alerts: AlertQueryService,
    private readonly network: NetworkMapService,
  ) {}

  async handleConnection(client: Socket) {
    if (this.server.sockets.sockets.size > MAX_WS_CLIENTS) { client.conn.close(true); return; }
    const token = client.handshake.auth?.token;

    if (!token) {
      // ใช้ disconnect พร้อม error message ให้ socket.io client จับใน connect_error
      client.disconnect(true);
      return;
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
      const user = await this.users.findOne({ where: { id: Number(payload.sub) } });
      if (!user || user.accountStatus !== 'active' || payload.purpose !== 'access' ||
          user.tokenVersion !== (payload.tokenVersion || 0) || user.role !== payload.role) throw new Error('Revoked socket session');
      client.data.auth = payload;
    } catch (err) {
      // disconnect(true) = force disconnect → client จะเห็นเป็น connect_error
      client.disconnect(true);
      return;
    }

    console.log(`[WS] ✅ Client connected: ${client.id}`);
    client.join('lan-events');

    // ส่งข้อมูลเดิมของวันนี้ทั้งหมดให้ client ที่เพิ่ง connect (จัดเรียงเก่าไปใหม่ เพื่อให้ Frontend นำไปต่อท้ายได้ถูกต้อง)
    try {
      const rows = await this.alerts.latest();
      this.sendInitialData(client, rows);
      client.emit('attack_stats', await this.alerts.stats());
      client.emit('dashboard_data', await this.alerts.dashboard());
    } catch (e) {
      console.error('[WS] Failed to load initial data:', e.message);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] 🔌 Client disconnected: ${client.id}`);
  }

  runtimeDiagnostics() {
    let queuedPackets=0,queuedBytes=0,transportBytes=0,scannedClients=0,truncated=false;
    const clients=this.server?.sockets?.sockets;
    if(clients)for(const client of clients.values()) {
      if(++scannedClients>1000){truncated=true;break;}
      // Read-only inspection of the pinned Engine.IO transport. No tokens,
      // session IDs, IPs or packet contents are returned.
      const connection:any=client.conn;
      const buffer=connection?.writeBuffer;
      if(Array.isArray(buffer)) {
        queuedPackets+=buffer.length;
        if(buffer.length>1024)truncated=true;
        for(const packet of buffer.slice(0,1024)) {
        const data=packet.data;
        queuedBytes+=typeof data==='string'?Buffer.byteLength(data):data?.byteLength||0;
        }
      }
      transportBytes+=Number(connection?.transport?.socket?.bufferedAmount)||0;
    }
    return {clients:clients?.size||0,queuedPackets,queuedBytes,transportBytes,truncated,sendingStats:this.sendingStats,
      slowClientCloses:this.slowClientCloses,maxClients:MAX_WS_CLIENTS,maxPendingPackets:MAX_WS_PENDING_PACKETS,maxPendingBytes:MAX_WS_PENDING_BYTES};
  }

  private enforceTransportBudget(client: Socket) {
    const connection:any=client.conn;
    const packets=connection?.writeBuffer || [];
    let bytes=Number(connection?.transport?.socket?.bufferedAmount)||0;
    if(packets.length<MAX_WS_PENDING_PACKETS)for(const packet of packets) {
      bytes+=typeof packet.data==='string'?Buffer.byteLength(packet.data):packet.data?.byteLength||0;
      if(bytes>=MAX_WS_PENDING_BYTES)break;
    }
    if(packets.length<MAX_WS_PENDING_PACKETS&&bytes<MAX_WS_PENDING_BYTES)return true;
    this.slowClientCloses++;
    // Engine.IO transport close allows Socket.IO to reconnect automatically.
    // discard=true releases the queue instead of waiting for a stalled drain.
    // Persisted incidents and stats are reloaded by handleConnection.
    connection.close(true);
    return false;
  }

  private enforceTransportBudgets() {
    const clients=this.server?.sockets?.sockets;
    if(clients)for(const client of clients.values())this.enforceTransportBudget(client);
  }

  @Cron('*/15 * * * * *')
  async revokeExpiredConnections() {
    if (!this.server?.sockets || this.checkingSessions) return;
    this.checkingSessions=true;
    try {
    this.enforceTransportBudgets();
    const clients = [...this.server.sockets.sockets.values()];
    if (!clients.length) return;
    const users = await this.users.findBy({ id: In(clients.map(c => Number(c.data.auth?.sub)).filter(Number.isSafeInteger)) });
    const byId = new Map(users.map(user => [user.id, user]));
    for (const client of clients) {
      const token = client.data.auth, user = byId.get(Number(token?.sub));
      if (!token || token.exp * 1000 <= Date.now() || !user || user.accountStatus !== 'active' ||
          user.tokenVersion !== (token.tokenVersion || 0) || user.role !== token.role) client.disconnect(true);
    }
    } finally { this.checkingSessions=false; }
  }

  broadcastSystemHealth(metric: any) {
    this.enforceTransportBudgets();
    this.server.emit('system_health', metric);
  }

  broadcastAttack(event: any) {
    this.enforceTransportBudgets();
    if (!this.isDisplayAlert(event)) return;
    const networkScope = this.network.evaluate(event);
    if (networkScope.inScope) this.server.to('lan-events').emit('new_attack', { ...event, networkScope });
    this.statsDirty = true;
  }

  private statsDirty = false;
  private sendingStats = false;
  private lastStatsSent=0;
  @Cron('*/2 * * * * *')
  async broadcastStats() {
    if ((!this.statsDirty && Date.now()-this.lastStatsSent<60000) || this.sendingStats || !this.server) return;
    this.sendingStats = true;
    this.statsDirty = false;
    try {
      const [stats,dashboard]=await Promise.all([this.alerts.stats(),this.alerts.dashboard()]);
      this.enforceTransportBudgets();
      this.server.emit('attack_stats',stats);this.server.emit('dashboard_data',dashboard);this.lastStatsSent=Date.now();
    }
    catch { this.statsDirty = true; }
    finally { this.sendingStats = false; }
  }

  sendInitialData(client: Socket, events: any[]) {
    client.emit('initial_data', events.filter(event=>this.isDisplayAlert(event) && this.network.evaluate(event).inScope).map(event=>({ ...event, networkScope: this.network.evaluate(event) })));
  }
  @SubscribeMessage('refresh_scope') async refreshScope(client: Socket) {
    this.sendInitialData(client, await this.alerts.latest());
  }

  private isDisplayAlert(event:any) {
    return event?.alertEligible===true&&event.detectionMode==='engine'&&
      event.alertPolicyVersion===ALERT_POLICY_VERSION&&
      (event.targetScope==='organization'||event.networkContext?.source?.scope==='organization');
  }
}
