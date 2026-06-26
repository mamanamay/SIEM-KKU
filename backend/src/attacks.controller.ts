import { Controller, Patch, Post, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attack } from './entities/attack.entity';
import { EventsGateway } from './events.gateway';
import { LogService } from './log.service';

@Controller('api/attacks')
export class AttacksController {
  constructor(
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
    private eventsGateway: EventsGateway,
    private logService: LogService
  ) {}

  @Post('ip-map')
  mapIp(@Body() body: { realIp: string }) {
    if (body.realIp) {
      this.logService.registerIpMap(body.realIp);
      return { success: true };
    }
    throw new HttpException('Missing parameters', HttpStatus.BAD_REQUEST);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    if (!['Opened', 'In Progress', 'Closed'].includes(status)) {
      throw new HttpException('Invalid status', HttpStatus.BAD_REQUEST);
    }

    const attack = await this.attackRepository.findOne({ where: { id: parseInt(id) } });
    if (!attack) {
      throw new HttpException('Attack not found', HttpStatus.NOT_FOUND);
    }

    attack.status = status;
    await this.attackRepository.save(attack);

    // Broadcast the update to connected clients
    this.eventsGateway.server.emit('status_updated', { id: attack.id, status: attack.status });

    return attack;
  }
}
