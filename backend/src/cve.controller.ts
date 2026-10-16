import { Controller, Get, Post, Param, Body, UseGuards, Query, Req, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AuthGuard } from './auth.guard';
import { CveHistory } from './entities/cve-history.entity';
import { CveIntelService, cveId } from './cve-intel.service';
import { Roles } from './roles.guard';

@Controller('api/cve')
@UseGuards(AuthGuard)
export class CVEController {
  constructor(@InjectRepository(CveHistory) private readonly history: Repository<CveHistory>,
    private readonly intel: CveIntelService) {}

  @Get('history') getHistory() { return this.history.find({ order: { createdAt: 'DESC' }, take: 100 }); }
  @Get('findings') findings(@Query('incidentId') id?: string) { return this.intel.findings(id === undefined ? undefined : Number(id)); }

  @Post('similarity')
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter')
  similarity(@Body() body: any, @Req() req: any) { return this.intel.analyzeSnapshot(body.snapshotId, req.user); }

  @Post('history')
  async saveHistory(@Body() body: any) {
    const id = cveId(body.cveId), { details } = await this.intel.lookup(id);
    if (details.state !== 'PUBLISHED') throw new BadRequestException('Only published CVEs can be saved to search history');
    const existing = await this.history.findOne({ where: { cveId: id }, order: { createdAt: 'DESC' } });
    return this.history.save({ ...existing, cveId: id, description: details.description, severity: details.severity,
      cvssScore: details.cvssScore, aiSummary: typeof body.aiSummary === 'string' ? body.aiSummary.slice(0, 6000) : details.description,
      createdAt: new Date() });
  }

  @Post('history/delete')
  @Roles('admin', 'analyst', 'analyst_l2', 'threat_hunter')
  async deleteHistory(@Body() body: any) {
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 100) throw new BadRequestException('Select 1–100 CVEs');
    return this.history.delete({ cveId: In(body.ids.map(cveId)) });
  }

  @Get(':id') async getCVE(@Param('id') id: string) {
    const result = await this.intel.lookup(id);
    return { ...result.data, siem: result.details };
  }
}
