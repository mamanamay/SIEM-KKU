import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface SubnetRecord {
  "Net-Address": string;
  Mask: number;
  Route: string;
  "Faculty/Dept": string;
  Type: string;
}

@Injectable()
export class NetworkMapService {
  private readonly logger = new Logger(NetworkMapService.name);
  private subnets: SubnetRecord[] = [];

  constructor() {
    this.loadSubnets();
  }

  private loadSubnets() {
    try {
      const dataFilePath = path.join(process.cwd(), 'src/ip_records.json');
      
      if (fs.existsSync(dataFilePath)) {
        const rawData = fs.readFileSync(dataFilePath, 'utf-8');
        this.subnets = JSON.parse(rawData);
        
        // Sort by longest prefix match (highest mask first)
        this.subnets.sort((a, b) => b.Mask - a.Mask);
        this.logger.log(`Loaded ${this.subnets.length} subnet records for Network Map matching.`);
      } else {
        this.logger.warn(`Network map file not found at ${dataFilePath}`);
      }
    } catch (err) {
      this.logger.error(`Failed to load network map: ${err.message}`);
    }
  }

  public getOrganization(ip: string, fallbackCountry?: string): string {
    if (!ip) return fallbackCountry || 'Unknown';
    
    for (const subnet of this.subnets) {
      if (this.isIpInSubnet(ip, subnet['Net-Address'], subnet.Mask)) {
        return subnet['Faculty/Dept'];
      }
    }
    
    return fallbackCountry || 'Unknown';
  }

  public isInLan(ip: string): boolean {
    if (!ip) return false;
    for (const subnet of this.subnets) {
      if (this.isIpInSubnet(ip, subnet['Net-Address'], subnet.Mask)) {
        return true;
      }
    }
    return false;
  }

  private isIpInSubnet(ip: string, subnetIp: string, mask: number): boolean {
    try {
      const ipLong = this.ipToLong(ip);
      const subnetLong = this.ipToLong(subnetIp);
      const maskLong = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
      
      return (ipLong & maskLong) === (subnetLong & maskLong);
    } catch {
      return false;
    }
  }

  private ipToLong(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }
}
