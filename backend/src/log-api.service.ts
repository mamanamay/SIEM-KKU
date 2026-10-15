import { Injectable, BadRequestException, ConflictException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { SystemConfig } from './entities/system-config.entity';
import { CryptoService } from './crypto.service';
import { LogService } from './log.service';
import { safeHttpStream, StreamResponse } from './outbound-http';
import { MAX_LOG_BYTES, MAX_BATCH_SIZE, MAX_BATCH_BYTES, positiveInt } from './runtime-limits';
import { extractApiEntries, ApiEntry } from './log-api-format';
import { sseFrames, sseHeaderId } from './log-api-sse';
import { chooseSingleConnection, storeSingleConnection } from './log-api-config';
export { extractApiEntries, detectApiSource, classifyLog } from './log-api-format';

const API_MAX_RECORDS = positiveInt('LOG_API_MAX_RECORDS', 1000, 5000);
const API_MAX_BYTES = positiveInt('LOG_API_MAX_RESPONSE_BYTES', 2097152, 10485760);
const API_TIMEOUT = positiveInt('LOG_API_TIMEOUT_MS', 15000, 15000);
const SSE_IDLE_TIMEOUT = positiveInt('LOG_API_SSE_IDLE_TIMEOUT_MS', 120000, 600000);

interface LogApiConfig {
  source: string; enabled: boolean; url: string; authType: 'none' | 'bearer' | 'header' | 'query';
  authName: string; keyEncrypted?: string; format: 'auto' | 'text' | 'json' | 'sse';
  itemsPath: string; rawField: string; sourceField?: string; intervalSeconds: number;
  streamCursor?: { fingerprint: string; id: string };
}
interface LiveHandle {
  controller: AbortController; fingerprint: string; mode: string; promise: Promise<void>;
  ready: Promise<any>; resolve: (state:any)=>void; reject: (error:any)=>void; preview: ApiEntry[];
}

export function logApiSource(value: string) {
  if (value !== 'combined') throw new BadRequestException('Use the single log API connection; per-type connections are no longer supported');
  return value;
}

function field(value: unknown, fallback: string) {
  const path = String(value ?? fallback).trim();
  if (path && (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(path) || path.length > 128 ||
    path.split('.').some(key => ['__proto__', 'constructor', 'prototype'].includes(key)))) throw new BadRequestException('Invalid JSON field path');
  return path;
}

export function extractApiLogs(body: string, config: Pick<LogApiConfig, 'format' | 'itemsPath' | 'rawField'>) {
  return extractApiEntries(body, config).map(entry => entry.raw);
}

@Injectable()
export class LogApiService implements OnModuleInit, OnModuleDestroy {
  private busy = new Set<string>();
  private due = new Map<string, number>();
  private states = new Map<string, any>();
  private live = new Map<string, LiveHandle>();
  private configuring = new Set<string>();
  private stopping = false;
  constructor(@InjectRepository(SystemConfig) private readonly configs: Repository<SystemConfig>,
    private readonly crypto: CryptoService, private readonly logs: LogService) {}

  async onModuleInit() {
    await this.configs.manager.transaction(async manager => {
      const repo = manager.getRepository(SystemConfig);
      const row = await repo.findOne({ where: { id: 1 }, ...(manager.connection.options.type === 'postgres' ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
      if (!row) return;
      const api = JSON.parse(row.apiConfigJson || '{}');
      const selection = chooseSingleConnection(api.logApiSources || {});
      if (!selection.config) return;
      const updated = { ...api, logApiSources: storeSingleConnection(api.logApiSources || {}, selection.config) };
      if (JSON.stringify(updated) !== row.apiConfigJson) { row.apiConfigJson = JSON.stringify(updated); await repo.save(row); }
    });
  }

  private async saved(): Promise<Record<string, LogApiConfig>> {
    const row = await this.configs.findOneBy({ id: 1 });
    return JSON.parse(row?.apiConfigJson || '{}').logApiSources || {};
  }

  private validate(source: string, input: any, previous?: LogApiConfig): LogApiConfig {
    logApiSource(source);
    if (!input || typeof input.enabled !== 'boolean') throw new BadRequestException('enabled must be boolean');
    let url: URL; try { url = new URL(String(input.url || '').trim()); } catch { throw new BadRequestException('Valid source URL required'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash || String(input.url).length > 2048) throw new BadRequestException('Use an HTTP/HTTPS URL without embedded username or password');
    if (!['none', 'bearer', 'header', 'query'].includes(input.authType)) throw new BadRequestException('Invalid authentication method');
    if (!['auto', 'text', 'json', 'sse'].includes(input.format)) throw new BadRequestException('Invalid response format');
    const intervalSeconds = Number(input.intervalSeconds);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 10 || intervalSeconds > 3600) throw new BadRequestException('Polling interval must be 10 to 3600 seconds');
    const authName = String(input.authName || 'X-API-Key').trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(authName) || ['host','cookie','connection','content-length','transfer-encoding'].includes(authName.toLowerCase())) throw new BadRequestException('Invalid authentication header/parameter name');
    let keyEncrypted = previous?.keyEncrypted;
    if (input.apiKey && input.apiKey !== '********') {
      if (typeof input.apiKey !== 'string' || input.apiKey.length > 4096) throw new BadRequestException('Invalid API key');
      keyEncrypted = this.crypto.encrypt(input.apiKey.trim());
    }
    if (input.authType !== 'none' && !keyEncrypted) throw new BadRequestException('Source API key required');
    const config:LogApiConfig = { source, enabled: input.enabled, url: url.toString(), authType: input.authType, authName,
      keyEncrypted, intervalSeconds, format: input.format, itemsPath: field(input.itemsPath, ''), rawField: field(input.rawField, 'raw_log'), sourceField: field(input.sourceField, 'event.module') };
    if(previous?.streamCursor?.fingerprint===this.fingerprint(config))config.streamCursor=previous.streamCursor;
    return config;
  }

  async overview() {
    const configs = await this.saved();
    const connection = { ...this.publicConfig(configs.combined), state: this.states.get('combined') || null };
    const legacyOptions = ['nginx','firewall'].filter(key => configs[key]?.url).map(key => {
      return { ...this.publicConfig(configs[key]), id: key };
    });
    return { formatVersion: 3, receiverVersion: 'single-sse-v4', capabilities: { sse: true, continuous: true, sourceClassification: true }, mode: 'single', connection, sources: [connection],
      migration: { requiresSelection: !configs.combined?.url && chooseSingleConnection(configs).ambiguous, legacyOptions },
      limits: { maxRecords: API_MAX_RECORDS, maxResponseBytes: API_MAX_BYTES, maxLogBytes: MAX_LOG_BYTES, sseIdleTimeoutMs:SSE_IDLE_TIMEOUT } };
  }
  private publicConfig(config?: LogApiConfig) {
    return { source: 'combined', enabled: !!config?.enabled, url: config?.url || '',
      authType: config?.authType || 'header', authName: config?.authName || 'X-API-Key',
      format: config?.format || 'auto', itemsPath: config?.itemsPath || '', rawField: config?.rawField ?? 'raw_log',
      intervalSeconds: config?.intervalSeconds || 30, sourceField: config?.sourceField ?? 'event.module',
      keyConfigured: !!config?.keyEncrypted };
  }

  async save(source: string, input: any) {
    logApiSource(source);
    if(this.configuring.has(source))throw new ConflictException('Source configuration update is already running');
    this.configuring.add(source);
    try {
    const previous = await this.previousFor(input);
    const config = this.validate(source, input, previous);
    await this.stopLive(source);
    await this.configs.manager.transaction(async manager => {
      const repo = manager.getRepository(SystemConfig);
      await repo.createQueryBuilder().insert().values({ id: 1 }).orIgnore().execute();
      const row = await repo.findOneOrFail({ where: { id: 1 }, ...(manager.connection.options.type === 'postgres' ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
      const api = JSON.parse(row.apiConfigJson || '{}');
      row.apiConfigJson = JSON.stringify({ ...api, logApiSources: storeSingleConnection(api.logApiSources || {}, config) });
      await repo.save(row);
    });
    this.states.delete(source);
    this.due.set(source, Date.now());
    if(config.enabled && !this.stopping && process.env.LOG_COLLECTION_MODE!=='file')this.launch(config);
    return this.overview();
    } finally {this.configuring.delete(source);}
  }
  private async previousFor(input: any): Promise<LogApiConfig | undefined> {
    const existing = await this.saved();
    let previous = existing.combined;
    if (input?.reuseFrom) {
      if (!['nginx','firewall'].includes(input.reuseFrom)) throw new BadRequestException('Invalid legacy connection');
      const legacy = existing[input.reuseFrom];
      if (!legacy || legacy.url !== input.url || legacy.authType !== input.authType || legacy.authName !== input.authName)
        throw new BadRequestException('Legacy key reuse requires the same saved URL and authentication settings');
      previous = legacy;
    }
    return previous;
  }

  private fingerprint(config:LogApiConfig):string {
    return createHash('sha256').update(JSON.stringify([config.url,config.authType,config.authName,
      config.keyEncrypted || '',config.format,config.itemsPath,config.rawField,config.sourceField])).digest('hex');
  }
  private request(config:LogApiConfig,controller:AbortController,resume=false) {
    const url = new URL(config.url);
    const headers: Record<string, string> = { Accept: config.format==='sse'?'text/event-stream':'application/json, text/plain, text/event-stream' };
    if (config.authType !== 'none') {
      const key = this.crypto.decrypt(config.keyEncrypted!);
      if (config.authType === 'bearer') headers.Authorization = 'Bearer ' + key;
      else if (config.authType === 'query') url.searchParams.set(config.authName, key);
      else headers[config.authName] = key;
    }
    if(resume && config.streamCursor?.fingerprint===this.fingerprint(config) && config.streamCursor.id)
      headers['Last-Event-ID']=sseHeaderId(config.streamCursor.id);
    return {url:url.toString(),headers,signal:controller.signal,connectTimeoutMs:API_TIMEOUT,idleTimeoutMs:SSE_IDLE_TIMEOUT};
  }
  private entries(body:string,config:LogApiConfig,contentType?:string,streamId?:string) {
    const rows=extractApiEntries(body,{...config,format:config.format==='sse'?'auto':config.format},contentType);
    if (rows.length > API_MAX_RECORDS) throw new BadRequestException('Source returned over ' + API_MAX_RECORDS + ' logs; reduce the API result limit');
    for (const { raw } of rows) {
      const bytes = Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw));
      if (bytes > MAX_LOG_BYTES) throw new BadRequestException('Source contains an oversized log');
    }
    if(streamId)rows.forEach((row,index)=>{if(!row.identity)row.identity='sse:'+streamId+':'+index;});
    return rows;
  }
  private isSse(response:StreamResponse,config:LogApiConfig) {
    const value=String(response.headers['content-type'] || '');
    const sse=/^text\/event-stream(?:\s*;|\s*$)/i.test(value);
    if(config.format==='sse'&&!sse)throw new BadRequestException('Source did not return text/event-stream for the selected SSE format');
    // Reject website Content-Type without reading its entire body.
    if(/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(value))this.entries('',config,value);
    return sse;
  }
  private async snapshot(response:StreamResponse,config:LogApiConfig,controller:AbortController) {
    if(Number(response.headers['content-length'] || 0)>API_MAX_BYTES)
      throw new BadRequestException('Source response exceeds '+API_MAX_BYTES+' bytes; reduce the provider batch size');
    const chunks:Buffer[]=[];let bytes=0;
    const timer=setTimeout(()=>controller.abort(),API_TIMEOUT);
    try {
      for await(const chunk of response.body) {
        const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=buffer.length;
        if(bytes>API_MAX_BYTES)throw new BadRequestException('Source response exceeds '+API_MAX_BYTES+' bytes; reduce the provider batch size');
        chunks.push(buffer);
      }
      return this.entries(Buffer.concat(chunks).toString('utf8'),config,String(response.headers['content-type'] || ''));
    } catch(error) {
      if(controller.signal.aborted)throw new BadRequestException('Source did not complete within '+API_TIMEOUT+' ms');
      throw error;
    } finally {clearTimeout(timer);}
  }
  private previewResult(rows:ApiEntry[],mode:string,existing=false) {
    return {success:true,mode,existingStream:existing,received:rows.length,sourceCounts:this.countSources(rows),
      unknown:rows.filter(row=>row.source==='generic').length,
      preview:rows.slice(0,5).map(({source,raw,origin,issue})=>({source,origin,issue,
        raw:(typeof raw==='string'?raw:JSON.stringify(raw)).slice(0,1500)}))};
  }
  private controlFrame(event:string,rows:ApiEntry[]) {
    return ['ping','heartbeat','keepalive'].includes(event.toLowerCase()) && rows.every(row=>
      row.source==='generic'&&!row.issue&&!row.origin.module&&!row.origin.dataset&&!row.origin.sourceIp&&
      !row.origin.observerName&&!row.origin.observerIp&&!row.raw?.ecs&&!row.raw?.['@timestamp']);
  }
  private aborted(error:any,signal:AbortSignal) {
    return signal.aborted && (error?.name==='AbortError'||['ABORT_ERR','ERR_STREAM_PREMATURE_CLOSE','ECONNRESET'].includes(error?.code));
  }

  private error(error: any) {
    if (error instanceof BadRequestException) return error.message;
    if (['Private/reserved outbound destination rejected', 'HTTP is supported only for an explicitly configured internal log API', 'Unsupported outbound URL', 'DNS lookup timeout'].includes(error.message)) return error.message;
    const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CONNECTION_FAILED';
    if(code==='ERR_STREAM_PREMATURE_CLOSE'||code==='ECONNRESET')return 'Source response stream ended before completion; reconnecting from the last committed SSE event ID when available';
    if(code==='STREAM_IDLE_TIMEOUT')return 'SSE connection was idle for '+SSE_IDLE_TIMEOUT+' ms; reconnecting';
    if(code==='UNSUPPORTED_CONTENT_ENCODING')return 'Source returned an unsupported content encoding';
    if (error.response?.status && (error.response.status < 200 || error.response.status >= 300))
      return 'Source returned HTTP ' + error.response.status;
    if (code === 'ERR_BAD_RESPONSE') {
      if (/^maxContentLength size of \d+ exceeded$/.test(error.message || ''))
        return 'Source response exceeds ' + API_MAX_BYTES + ' bytes; reduce the provider batch size or configure LOG_API_MAX_RESPONSE_BYTES (maximum 10485760)';
      if (error.message === 'stream has been aborted')
        return 'Source response stream ended before completion; check the upstream connection and whether this API is a continuous stream';
      return 'Source response could not be read (ERR_BAD_RESPONSE); check content encoding, response size, and the streaming API contract';
    }
    if (['ECONNABORTED','ETIMEDOUT'].includes(code)) return 'Source did not complete within ' + API_TIMEOUT + ' ms; check whether this API is a continuous stream or reduce its batch size';
    return code;
  }

  async test(source: string, input: any) {
    logApiSource(source);
    const config = this.validate(source, input, await this.previousFor(input));
    const running=this.live.get(source);
    if(running?.mode==='sse'&&running.fingerprint===this.fingerprint(config))return this.previewResult(running.preview,'sse',true);
    try { const sample=await this.sampleRows(config);return this.previewResult(sample.rows,sample.mode); }
    catch (error) { throw new BadRequestException(this.error(error)); }
  }
  /** Bounded read-only sample for CLI diagnostics and Test GET; never commits receipts/cursors. */
  async sampleRows(config:LogApiConfig) {
    const controller=new AbortController();
    return await safeHttpStream(this.request(config,controller),async response=>{
      if(!this.isSse(response,config))return {rows:await this.snapshot(response,config,controller),mode:'snapshot'};
      const rows:ApiEntry[]=[];const timer=setTimeout(()=>controller.abort(),5000);
      try {
        for await(const frame of sseFrames(response.body,API_MAX_BYTES)) {
          if(frame.data===null||!frame.data.trim())continue;
          const entries=this.entries(frame.data,{...config,format:'auto'},undefined,frame.id);
          if(this.controlFrame(frame.event,entries))continue;
          rows.push(...entries.slice(0,5-rows.length));
          if(rows.length>=5)break;
        }
      } catch(error) {if(!this.aborted(error,controller.signal))throw error;}
      finally {clearTimeout(timer);}
      return {rows,mode:'sse'};
    },new URL(config.url).origin);
  }

  async pull(source: string) {
    logApiSource(source);
    if(this.configuring.has(source))throw new ConflictException('Source configuration update is already running');
    const running=this.live.get(source);
    if(running?.mode==='sse')return this.states.get(source);
    if(running?.mode==='connecting')return running.ready;
    if(this.busy.has(source))throw new ConflictException('Source request is already running');
    const config=(await this.saved())[source];
    if(!config)throw new BadRequestException('Save the source configuration first');
    if(this.stopping)throw new BadRequestException('Log API service is stopping');
    return this.launch(config).ready;
  }
  private async commitRows(rows:ApiEntry[],config:LogApiConfig) {
      let batch: any[] = [], bytes = 0, inserted = 0, deduplicated = 0;
      const commit = async () => { if (batch.length) { const ack = await this.logs.ingestLog(batch, undefined, { transport: 'api_get', feedHost: new URL(config.url).hostname }); inserted += Number(ack.inserted ?? ack.accepted ?? 0); deduplicated += Number(ack.deduplicated ?? ack.duplicates ?? 0); } batch = []; bytes = 0; };
      for (const { source: eventSource, raw, identity, origin, issue } of rows) {
        const canonical = typeof raw === 'string' ? raw : JSON.stringify(raw);
        const event_id = 'log-api-' + createHash('sha256').update(canonical + (identity ? '\0' + identity : '')).digest('hex');
        const payload = { source: eventSource, event_id, raw_log: raw,
          ...(eventSource === 'generic' ? { routing_error: 'Cannot identify Firewall/NGINX source; check event.module or source field mapping' } : {}),
          ingest_origin: origin, routing_diagnostics: issue || (eventSource === 'generic' ? 'Cannot identify a supported log source; check source metadata and field mapping' : null) };
        const { ingest_origin: _origin, routing_diagnostics: _routing, ...original } = payload;
        const size = Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(original)) + Buffer.byteLength(JSON.stringify(payload)) + 512;
        if (batch.length >= MAX_BATCH_SIZE || bytes + size > MAX_BATCH_BYTES) await commit();
        batch.push(payload); bytes += size;
      }
      await commit();
      const times = rows.map(row => typeof row.raw === 'object' ? Date.parse(row.raw['@timestamp'] || row.raw.timestamp || '') : NaN).filter(Number.isFinite);
      const latestSourceTimestamp = times.length ? new Date(Math.max(...times)).toISOString() : null;
      return {received:rows.length,inserted,deduplicated,latestSourceTimestamp,sourceCounts:this.countSources(rows),unknown:rows.filter(row=>row.source==='generic').length};
  }
  private async checkpoint(config:LogApiConfig,id:string) {
    const fingerprint=this.fingerprint(config);
    if(config.streamCursor?.fingerprint===fingerprint && config.streamCursor.id===id)return;
    const stored=await this.configs.manager.transaction(async manager=>{
      const repo=manager.getRepository(SystemConfig);
      const row=await repo.findOne({where:{id:1},...(manager.connection.options.type==='postgres'?{lock:{mode:'pessimistic_write' as const}}:{})});
      if(!row)return false;
      const api=JSON.parse(row.apiConfigJson || '{}'), current=api.logApiSources?.combined;
      if(!current||this.fingerprint(current)!==fingerprint)return false;
      current.streamCursor={fingerprint,id};row.apiConfigJson=JSON.stringify(api);await repo.save(row);return true;
    });
    if(!stored)throw new BadRequestException('Source connection changed; restarting the receiver');
    config.streamCursor={fingerprint,id};
  }
  private launch(config:LogApiConfig):LiveHandle {
    const source='combined',existing=this.live.get(source);if(existing)return existing;
    const controller=new AbortController();let resolve!:(state:any)=>void,reject!:(error:any)=>void;
    const ready=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});ready.catch(()=>{});
    const handle:LiveHandle={controller,fingerprint:this.fingerprint(config),mode:'connecting',ready,resolve,reject,preview:[],promise:Promise.resolve()};
    this.live.set(source,handle);this.busy.add(source);
    handle.promise=this.consume(config,handle).finally(()=>{if(this.live.get(source)===handle)this.live.delete(source);this.busy.delete(source);});
    return handle;
  }
  private async consume(config:LogApiConfig,handle:LiveHandle) {
    const source='combined';let reconnectMs=config.intervalSeconds*1000;
    let oneShotTimer:ReturnType<typeof setTimeout>|undefined;
    try {
      await safeHttpStream(this.request(config,handle.controller,true),async response=>{
        if(!this.isSse(response,config)) {
          handle.mode='snapshot';
          const result=await this.commitRows(await this.snapshot(response,config,handle.controller),config);
          const state={...result,ok:true,mode:'snapshot',connected:false,running:false,lastAttempt:new Date().toISOString(),error:null};
          this.states.set(source,state);handle.resolve(state);return;
        }
        handle.mode='sse';
        if(!config.enabled)oneShotTimer=setTimeout(()=>handle.controller.abort(),5000);
        const previous=this.states.get(source);
        let state={...(previous?.mode==='sse'?previous:{}),ok:true,mode:'sse',connected:true,running:true,
          received:previous?.mode==='sse'?previous.received:0,inserted:previous?.mode==='sse'?previous.inserted:0,
          deduplicated:previous?.mode==='sse'?previous.deduplicated:0,unknown:previous?.mode==='sse'?previous.unknown:0,
          sourceCounts:previous?.mode==='sse'?previous.sourceCounts:{},lastAttempt:new Date().toISOString(),error:null,
          resumeAvailable:!!config.streamCursor?.id};
        this.states.set(source,state);if(config.enabled)handle.resolve(state);
        for await(const frame of sseFrames(response.body,API_MAX_BYTES)) {
          if(frame.retryMs!==undefined)reconnectMs=Math.max(config.intervalSeconds*1000,frame.retryMs);
          if(frame.data===null||!frame.data.trim()) {
            if(frame.id!==undefined)await this.checkpoint(config,frame.id);
            continue;
          }
          const rows=this.entries(frame.data,{...config,format:'auto'},undefined,frame.id);
          if(this.controlFrame(frame.event,rows)){if(frame.id!==undefined)await this.checkpoint(config,frame.id);continue;}
          const result=await this.commitRows(rows,config); // Apply backpressure until the durable ACK.
          if(frame.id!==undefined)await this.checkpoint(config,frame.id); // Never advance before receipt commit.
          handle.preview=[...handle.preview,...rows.slice(-5)].slice(-5);
          const counts={...state.sourceCounts};for(const [kind,count] of Object.entries(result.sourceCounts))counts[kind]=(counts[kind] || 0)+count;
          state={...state,received:state.received+result.received,inserted:state.inserted+result.inserted,
            deduplicated:state.deduplicated+result.deduplicated,unknown:state.unknown+result.unknown,sourceCounts:counts,
            lastEventAt:new Date().toISOString(),latestSourceTimestamp:result.latestSourceTimestamp || state.latestSourceTimestamp,
            resumeAvailable:!!config.streamCursor?.id};
          this.states.set(source,state);
          if(!config.enabled){handle.resolve({...state,connected:false,running:false});break;}
        }
        const closed={...state,connected:false,running:false};this.states.set(source,closed);handle.resolve(closed);
      },new URL(config.url).origin);
    } catch(error) {
      const old=this.states.get(source);
      const canceled=this.aborted(error,handle.controller.signal) && handle.mode!=='snapshot';
      const state={...(old || {received:0}),ok:canceled?true:false,mode:handle.mode,connected:false,running:false,
        lastAttempt:new Date().toISOString(),error:canceled?null:this.error(error)};
      this.states.set(source,state);
      if(canceled && handle.mode==='sse' && !config.enabled)handle.resolve(state);
      else handle.reject(new BadRequestException(state.error || 'Source request canceled'));
    } finally {clearTimeout(oneShotTimer);this.due.set(source,Date.now()+reconnectMs);}
  }
  private async stopLive(source:string) {
    const running=this.live.get(source);if(!running)return;
    running.controller.abort();await running.promise;
  }
  async onModuleDestroy() {
    this.stopping=true;await this.stopLive('combined');
  }

  @Interval(10000)
  async poll() {
    if (this.stopping || this.configuring.has('combined') || process.env.LOG_COLLECTION_MODE === 'file') return;
    const configs = await this.saved();
    for (const source of ['combined']) {
      const config = configs[source];
      if (!config?.enabled || this.busy.has(source) || (this.due.get(source) || 0) > Date.now()) continue;
      this.launch(config);
    }
  }
  private countSources(rows: { source: string }[]) {
    return rows.reduce((counts: Record<string, number>, row) => { counts[row.source] = (counts[row.source] || 0) + 1; return counts; }, {});
  }
}
