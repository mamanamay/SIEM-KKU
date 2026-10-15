import { BadRequestException } from '@nestjs/common';
import { isIP } from 'net';

export interface LogOrigin {
  module: string | null; dataset: string | null; observerName: string | null;
  observerIp: string | null; vendor: string | null; product: string | null;
  hostName: string | null; agentName: string | null; sourceIp: string | null;
  basis: string; transport?: string; feedHost?: string;
}
export interface Classification { source: string; basis: string; issue?: string; origin: LogOrigin; }
export interface ApiEntry extends Classification { raw: any; identity?: string; }
export interface ApiFormat { source?: string; format: string; itemsPath: string; rawField: string; sourceField?: string; }
export function jsonField(value: any, path: string): any {
  for (const key of path.split('.').filter(Boolean)) {
    if (['__proto__','constructor','prototype'].includes(key)) return undefined;
    if (value == null || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
function text(value: any): string | null { return typeof value === 'string' && value.trim() ? value.trim().slice(0,128) : null; }
function ip(value: any): string | null {
  if (Array.isArray(value)) value = value.length === 1 ? value[0] : null;
  return typeof value === 'string' && isIP(value) ? value : null;
}
function namedSource(value: any): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().toLowerCase().split('.')[0];
  if (['nginx','revproxy','reverse_proxy'].includes(name)) return 'nginx';
  if (['firewall','fortinet','fortigate','fortinet_fortigate'].includes(name)) return 'firewall';
  if (['cowrie','wazuh','suricata','webtrap','server'].includes(name)) return name;
}
export function classifyLog(raw: any, sourceField = 'event.module'): Classification {
  let source = 'generic', basis = 'unrecognized_format', issue: string | undefined;
  const evidence: { source: string; basis: string }[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [path,value] of [[sourceField,jsonField(raw,sourceField)],['source',raw.source],
      ['event.module',raw.event?.module],['event.dataset',raw.event?.dataset],
      ['observer.product',raw.observer?.product],['observer.vendor',raw.observer?.vendor]] as [string,any][]) {
      const identified = namedSource(value); if (identified) evidence.push({source:identified,basis:path});
    }
    // ECS rule.id can be a firewall policy ID. Only native Wazuh envelopes are inferred.
    if (typeof raw.eventid === 'string' && raw.eventid.startsWith('cowrie.')) evidence.push({source:'cowrie',basis:'eventid'});
    if (!raw.ecs && !raw['@timestamp'] && raw.rule?.id != null && (raw.agent || raw.data)) evidence.push({source:'wazuh',basis:'wazuh_envelope'});
    if (raw.event_type && (raw.alert?.signature || raw.flow_id || raw.src_ip)) evidence.push({source:'suricata',basis:'suricata_envelope'});
    if (new Set(evidence.map(item=>item.source)).size > 1) {
      issue='Conflicting source metadata'; basis='conflicting_metadata';
    } else if (evidence.length) ({source,basis}=evidence[0]);
    else if (raw.http?.request?.method || raw.remote_addr && raw.request_method) { source='nginx';basis='web_access_fields'; }
    else if (raw.fortinet?.firewall || raw.srcip && raw.dstip && raw.action) {source='firewall';basis='firewall_fields';}
    if ((raw.ecs || raw['@timestamp']) && ['wazuh','suricata','cowrie','webtrap','server'].includes(source) &&
      !raw.src_ip && !raw.data?.srcip && !raw.data?.src_ip) {
      source='generic';basis='unsupported_ecs_fields';issue='ECS source needs a supported sensor parser';
    }
  } else if (typeof raw === 'string') {
    if (/\b(?:srcip|src_ip)=\S+/.test(raw) && /\b(?:dstip|dst_ip)=\S+/.test(raw)) {source='firewall';basis='firewall_key_value';}
    else if (/"(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+HTTP\//.test(raw)) {source='nginx';basis='web_access_text';}
    else if (/\bsshd(?:\[\d+\])?:\s+(?:Failed password|Invalid user|authentication failure)/i.test(raw)) {source='server';basis='sshd_syslog';}
    const parsed: Record<string,string> = {};
    for (const match of raw.matchAll(/\b(devname|devid|srcip)=("[^"]*"|\S+)/g)) parsed[match[1]]=match[2].replace(/^"|"$/g,'');
    return {source,basis,origin:{module:null,dataset:null,observerName:text(parsed.devname),observerIp:null,
      vendor:null,product:null,hostName:null,agentName:null,sourceIp:ip(parsed.srcip),basis}};
  }
  return {source,basis,...(issue?{issue}:{}),origin:{
    module:text(raw?.event?.module)||text(raw?.source),dataset:text(raw?.event?.dataset),
    observerName:text(raw?.observer?.name)||text(raw?.observer?.hostname)||text(raw?.devname),
    observerIp:ip(raw?.observer?.ip),vendor:text(raw?.observer?.vendor),product:text(raw?.observer?.product),
    hostName:text(raw?.host?.name)||text(raw?.host?.hostname),agentName:text(raw?.agent?.name),
    sourceIp:ip(raw?.source?.ip)||ip(raw?.remote_addr)||ip(raw?.srcip)||ip(raw?.src_ip),basis}};
}
export function detectApiSource(raw: any, sourceField = 'event.module'): string { return classifyLog(raw,sourceField).source; }
export function extractApiEntries(body: string, config: ApiFormat, contentType?: string): ApiEntry[] {
  // HTTP 200 can be a website/login page. Never turn its HTML lines into receipts.
  // Do not match HTML inside valid JSON or access-log request strings.
  if (/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(contentType?.trim() || '') ||
    /^\s*(?:\uFEFF\s*)?(?:<!doctype\s+html\b|<html\b)/i.test(body)) {
    throw new BadRequestException('Source returned HTML instead of logs; use the JSON/raw log API endpoint (a website or login page was returned)');
  }
  if (!body.trim()) return [];
  let data: any;
  if (config.format !== 'text') {
    try { data=JSON.parse(body); }
    catch {
      try {data=body.split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line));}
      catch {if(config.format==='json')throw new BadRequestException('Source did not return JSON or NDJSON');}
    }
  }
  if (data===undefined)data=body.split(/\r?\n/).filter(line=>line.trim());
  if(config.itemsPath){data=jsonField(data,config.itemsPath);if(data===undefined)throw new BadRequestException('Configured JSON items path was not found');}
  else if(!Array.isArray(data)&&data&&typeof data==='object'){
    for(const path of ['logs','data.logs','items','results','data','hits.hits']){const rows=jsonField(data,path);if(Array.isArray(rows)){data=rows;break;}}
  }
  const entries:ApiEntry[]=[];
  const visit=(item:any,group?:string,depth=0)=>{
    if(depth>8)throw new BadRequestException('Source nesting exceeds supported depth');
    if(Array.isArray(item)){item.forEach(row=>visit(row,group,depth+1));return;}
    if(!item||!['object','string'].includes(typeof item))throw new BadRequestException('Source contains an invalid log entry');
    if(typeof item==='object'){
      const groups=['nginx','firewall','cowrie','wazuh','suricata','webtrap'].filter(key=>Array.isArray(item[key]));
      if(groups.length){groups.forEach(key=>visit(item[key],key,depth+1));return;}
    }
    const outer=item;if(item?._source&&typeof item._source==='object')item=item._source;
    const ecs=item&&typeof item==='object'&&(item.ecs||item.event?.module||item['@timestamp']);
    const value=ecs?item:typeof item==='object'?(config.rawField?jsonField(item,config.rawField):undefined)??item.raw_log??item:item;
    const values=typeof value==='string'?value.split(/\r?\n/).filter(line=>line.trim()):[value];
    values.forEach((raw,index)=>{
      const inner=classifyLog(raw,config.sourceField),wrapper=classifyLog(item,config.sourceField);
      const declared=group|| (wrapper.source!=='generic'?wrapper.source:null);
      let classification=inner.source!=='generic'||inner.issue?inner:wrapper;
      if(declared&&inner.source!=='generic'&&declared!==inner.source)classification={...inner,source:'generic',basis:'conflicting_metadata',issue:'Conflicting source metadata'};
      else if(classification.source==='generic'&&!classification.issue&&group)classification={...classification,source:group,basis:'response_group'};
      const origin={...wrapper.origin,...Object.fromEntries(Object.entries(inner.origin).filter(([,value])=>value!=null)),basis:classification.basis} as LogOrigin;
      const identity=outer?._id??item?.event?.id??item?.event_id;
      entries.push({...classification,origin,raw,...(identity!=null?{identity:String(identity)+':'+index}:{})});
    });
  };
  visit(data);return entries;
}
