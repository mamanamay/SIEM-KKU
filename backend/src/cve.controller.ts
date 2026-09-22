import { Controller, Get, Post, Param, Body, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { AuthGuard } from './auth.guard';
import { CveHistory } from './entities/cve-history.entity';

@Controller('api/cve')
@UseGuards(AuthGuard)
export class CVEController {

  constructor(
    @InjectRepository(CveHistory)
    private cveHistoryRepo: Repository<CveHistory>,
  ) {}

  @Get('history')
  async getHistory() {
    return await this.cveHistoryRepo.find({
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  @Post('history')
  async saveHistory(@Body() body: any) {
    if (!body.cveId) {
      throw new HttpException('Missing cveId', HttpStatus.BAD_REQUEST);
    }
    const history = this.cveHistoryRepo.create({
      cveId: body.cveId,
      description: body.description,
      severity: body.severity,
      cvssScore: body.cvssScore,
      aiSummary: body.aiSummary,
    });
    return await this.cveHistoryRepo.save(history);
  }

  @Get(':id')
  async getCVE(@Param('id') id: string) {
    if (id === 'history') return; // Prevent clash
    try {
      // Proxy to MITRE to bypass CORS
      const mitreRes = await axios.get(`https://cveawg.mitre.org/api/cve/${id}`, { timeout: 5000 });
      return mitreRes.data;
    } catch (e: any) {
      if (e.response && e.response.status === 404) {
        throw new HttpException('CVE not found', HttpStatus.NOT_FOUND);
      }
      // Fallback to NVD if MITRE fails? MITRE is usually fine.
      throw new HttpException('Failed to fetch CVE data from upstream API', HttpStatus.BAD_GATEWAY);
    }
  }
}
