import { Controller, Get, Param, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import axios from 'axios';
import { AuthGuard } from './auth.guard';

@Controller('api/cve')
@UseGuards(AuthGuard)
export class CVEController {
  @Get(':id')
  async getCVE(@Param('id') id: string) {
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
