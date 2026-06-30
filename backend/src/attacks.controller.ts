import { Controller, Patch, Post, Param, Body, HttpException, HttpStatus, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attack } from './entities/attack.entity';
import { EventsGateway } from './events.gateway';
import { LogService } from './log.service';
import * as fs from 'fs';
import * as path from 'path';

// Persist blocked IPs to a JSON file so they survive restarts
const BLOCKED_IPS_FILE = path.join('/app/siem-logs', 'blocked_ips.json');
const ISOLATED_PORTS_FILE = path.join('/app/siem-logs', 'isolated_ports.json');

function readJSON(filePath: string, fallback: any[] = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return fallback; }
}

function writeJSON(filePath: string, data: any) {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch {}
}

@Controller('api/attacks')
export class AttacksController {
  constructor(
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
    private eventsGateway: EventsGateway,
    private logService: LogService
  ) {}

  // ── IP Map Registration (from proxy.js) ───────────────────────────────────
  @Post('ip-map')
  mapIp(@Body() body: { realIp: string; faculty?: any; service?: string; timestamp?: string }) {
    if (body.realIp) {
      this.logService.registerIpMap(body.realIp, body.faculty, body.service);
      return { success: true };
    }
    throw new HttpException('Missing parameters', HttpStatus.BAD_REQUEST);
  }

  // ── Update Attack Status ──────────────────────────────────────────────────
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    if (!['Opened', 'In Progress', 'Closed'].includes(status)) {
      throw new HttpException('Invalid status', HttpStatus.BAD_REQUEST);
    }
    const attack = await this.attackRepository.findOne({ where: { id: parseInt(id) } });
    if (!attack) throw new HttpException('Attack not found', HttpStatus.NOT_FOUND);
    attack.status = status;
    await this.attackRepository.save(attack);
    this.eventsGateway.server.emit('status_updated', { id: attack.id, status: attack.status });
    return attack;
  }

  // ── Block IP (WAF Rule) ───────────────────────────────────────────────────
  // Adds the IP to blocked_ips.json and broadcasts to all clients
  @Post('block-ip')
  blockIp(@Body() body: { ip: string; reason: string; attackId?: number; faculty?: any; port?: string }) {
    if (!body.ip) throw new HttpException('Missing IP', HttpStatus.BAD_REQUEST);

    const blockedIps: any[] = readJSON(BLOCKED_IPS_FILE);

    // Check if already blocked
    if (blockedIps.find(b => b.ip === body.ip)) {
      return { success: false, message: `IP ${body.ip} is already blocked.`, alreadyBlocked: true };
    }

    const entry = {
      ip:        body.ip,
      blockedAt: new Date().toISOString(),
      reason:    body.reason || 'Manual block from SIEM Dashboard',
      attackId:  body.attackId || null,
      faculty:   body.faculty || null,
      switchPort:body.port || null,
      blockedBy: 'SIEM Dashboard (Auto)',
    };

    blockedIps.push(entry);
    writeJSON(BLOCKED_IPS_FILE, blockedIps);

    // Broadcast to all connected SIEM clients
    this.eventsGateway.server.emit('ip_blocked', entry);

    console.log(`[SIEM] 🔒 IP Blocked: ${body.ip} — ${body.reason}`);
    return { success: true, entry };
  }

  // ── Unblock IP (WAF Rule) ─────────────────────────────────────────────────
  @Post('unblock-ip')
  unblockIp(@Body() body: { ip: string }) {
    if (!body.ip) throw new HttpException('Missing IP', HttpStatus.BAD_REQUEST);

    let blockedIps: any[] = readJSON(BLOCKED_IPS_FILE);
    const initialLength = blockedIps.length;
    blockedIps = blockedIps.filter(b => b.ip !== body.ip);

    if (blockedIps.length === initialLength) {
      return { success: false, message: `IP ${body.ip} is not currently blocked.` };
    }

    writeJSON(BLOCKED_IPS_FILE, blockedIps);
    this.eventsGateway.server.emit('ip_unblocked', { ip: body.ip });

    console.log(`[SIEM] 🔓 IP Unblocked: ${body.ip}`);
    return { success: true, ip: body.ip };
  }

  // ── Get Blocked IPs List ──────────────────────────────────────────────────
  @Get('blocked-ips')
  getBlockedIps() {
    return readJSON(BLOCKED_IPS_FILE);
  }

  // ── Isolate Switch Port ───────────────────────────────────────────────────
  // Marks a switch port as isolated in isolated_ports.json
  // In a real network, this would call the switch's SNMP/API to shutdown the port
  @Post('isolate-port')
  isolatePort(@Body() body: {
    ip: string; switchPort: string; building: string; floor: string;
    portNumber: string; faculty?: any; attackId?: number;
  }) {
    if (!body.ip || !body.switchPort) {
      throw new HttpException('Missing ip or switchPort', HttpStatus.BAD_REQUEST);
    }

    const isolatedPorts: any[] = readJSON(ISOLATED_PORTS_FILE);

    const entry = {
      ip:          body.ip,
      switchPort:  body.switchPort,
      building:    body.building   || 'Unknown',
      floor:       body.floor      || '?',
      portNumber:  body.portNumber || '?',
      faculty:     body.faculty    || null,
      attackId:    body.attackId   || null,
      isolatedAt:  new Date().toISOString(),
      isolatedBy:  'SIEM Dashboard',
      status:      'ISOLATED',
      note:        'Port administratively shut down pending investigation.',
      // In production: would send: `interface GiX/0/Y \n shutdown` via SSH/NETCONF to the switch
      realWorldCmd: `interface ${body.switchPort}\n shutdown\n description [SIEM-BLOCKED: Suspicious Activity]\n`,
    };

    isolatedPorts.push(entry);
    writeJSON(ISOLATED_PORTS_FILE, isolatedPorts);

    this.eventsGateway.server.emit('port_isolated', entry);

    console.log(`[SIEM] 🔌 Port Isolated: ${body.switchPort} (${body.ip})`);
    return { success: true, entry };
  }

  // ── Get Isolated Ports List ───────────────────────────────────────────────
  @Get('isolated-ports')
  getIsolatedPorts() {
    return readJSON(ISOLATED_PORTS_FILE);
  }
}
