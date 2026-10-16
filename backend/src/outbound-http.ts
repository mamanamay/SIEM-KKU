import axios, { AxiosRequestConfig } from 'axios';
import { lookup } from 'dns/promises';
import { Agent } from 'https';
import { Agent as HttpAgent } from 'http';
import { request as httpRequest, IncomingHttpHeaders } from 'http';
import { request as httpsRequest } from 'https';
import { Readable } from 'stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'zlib';
import { BlockList, isIP } from 'net';

const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
blockedV6.addSubnet('2001:db8::', 32, 'ipv6');
blockedV6.addSubnet('2001::', 32, 'ipv6');
blockedV6.addSubnet('2002::', 16, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
}

const internal = new BlockList();
internal.addSubnet('10.0.0.0', 8, 'ipv4');
internal.addSubnet('172.16.0.0', 12, 'ipv4');
internal.addSubnet('192.168.0.0', 16, 'ipv4');
internal.addSubnet('fc00::', 7, 'ipv6');

function configuredSsoHost(): string | null {
  try {
    const url = new URL(process.env.SSO_API_URL || 'https://ssonext-api.kku.ac.th');
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      ? url.hostname.toLowerCase() : null;
  } catch { return null; }
}

export function permitsInternalAddress(hostname: string, address: string): boolean {
  // These are operator-configured service endpoints, independent of user-supplied URLs.
  const trusted = ['gen.ai.kku.ac.th', configuredSsoHost(),
    ...(process.env.OUTBOUND_PRIVATE_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)];
  const family = isIP(address);
  return trusted.includes(hostname.toLowerCase()) && (family === 4 ? internal.check(address, 'ipv4')
    : family === 6 && internal.check(address, 'ipv6'));
}

export async function vettedTarget(value: string, operatorOrigin?: string) {
  const url = new URL(value);
  const operatorTarget = !!operatorOrigin && url.origin === operatorOrigin;
  if (url.username || url.password || (operatorTarget ? !['https:', 'http:'].includes(url.protocol)
    : url.protocol !== 'https:' || (url.port && url.port !== '443'))) throw new Error('Unsupported outbound URL');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const allowed = (process.env.OUTBOUND_ALLOWED_HOSTS || 'gen.ai.kku.ac.th,hooks.slack.com,.webhook.office.com,ssonext-api.kku.ac.th,cveawg.mitre.org')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  const ssoHost = configuredSsoHost();
  if (!operatorTarget && hostname !== ssoHost && !allowed.some(h => h.startsWith('.') ? hostname.endsWith(h) && hostname.length > h.length : hostname === h)) throw new Error('Outbound hostname is not allowlisted');
  let timer: NodeJS.Timeout;
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS lookup timeout')), 5000); }),
  ]).finally(() => clearTimeout(timer!));
  const privateAddress = (a: { address: string; family: number }) => a.family === 4 ? internal.check(a.address, 'ipv4') : a.family === 6 && internal.check(a.address, 'ipv6');
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address) && !(operatorTarget && privateAddress(a)) && !permitsInternalAddress(hostname, a.address))) throw new Error('Private/reserved outbound destination rejected');
  if (url.protocol === 'http:' && (!operatorTarget || addresses.some(a => !privateAddress(a)))) throw new Error('HTTP is supported only for an explicitly configured internal log API');
  return { url, resolved: addresses[0] };
}

const active = { sso: 0, source: 0, integration: 0, ai: 0 };
/** DNS is resolved once, vetted, then pinned to the TLS connection. No redirects. */
export async function safeHttp(config: AxiosRequestConfig & { url: string }, operatorOrigin?: string) {
  const purpose = operatorOrigin ? 'source' : new URL(config.url).hostname === configuredSsoHost() ? 'sso' : 'integration';
  return safeRequest(config, operatorOrigin, purpose, 15000);
}

/** AI has its own bounded budget; allow generation without extending log/SSO timeouts. */
export async function safeAiHttp(config: AxiosRequestConfig & { url: string }) {
  return safeRequest(config, undefined, 'ai', 45000);
}

async function safeRequest(config: AxiosRequestConfig & { url: string }, operatorOrigin: string | undefined,
  purpose: keyof typeof active, timeoutCap: number) {
  if (active[purpose] >= 2) throw new Error('Outbound concurrency budget exhausted');
  active[purpose]++;
  try {
    const { url, resolved } = await vettedTarget(config.url, operatorOrigin);
    const agentOptions = { lookup: ((_host: string, options: any, cb: any) => {
      if (options?.all) cb(null, [resolved]); else cb(null, resolved.address, resolved.family);
    }) as any };
    const agent = url.protocol === 'https:' ? new Agent(agentOptions) : new HttpAgent(agentOptions);
    try {
      return await axios.request({ ...config, url: url.toString(), ...(url.protocol === 'https:' ? { httpsAgent: agent } : { httpAgent: agent }), proxy: false,
        maxRedirects: 0, timeout: Math.min(config.timeout || timeoutCap, timeoutCap),
        maxContentLength: Math.min(config.maxContentLength ?? 2097152, 10485760), maxBodyLength: 2097152 });
    } finally { agent.destroy(); }
  } finally { active[purpose]--; }
}

export interface StreamResponse { body: Readable; status: number; headers: IncomingHttpHeaders; }
/** Keep the vetted socket and concurrency slot until the consumer finishes. */
export async function safeHttpStream<T>(config: { url: string; headers?: Record<string,string>;
  signal: AbortSignal; connectTimeoutMs: number; idleTimeoutMs: number },
  consume: (response: StreamResponse) => Promise<T>, operatorOrigin: string): Promise<T> {
  if (active.source >= 2) throw new Error('Outbound concurrency budget exhausted');
  active.source++;
  let agent: Agent | HttpAgent | undefined;
  let request: ReturnType<typeof httpRequest> | undefined;
  let body: Readable | undefined;
  let headerTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => { const error = new Error('Outbound stream canceled'); Object.assign(error,{code:'ABORT_ERR'}); request?.destroy(error); body?.destroy(error); };
  try {
    const {url,resolved} = await vettedTarget(config.url,operatorOrigin);
    if (config.signal.aborted) { const error=new Error('Outbound stream canceled');Object.assign(error,{code:'ABORT_ERR'});throw error; }
    const options = {lookup:((_host:string,lookupOptions:any,callback:any)=>lookupOptions?.all
      ? callback(null,[resolved]) : callback(null,resolved.address,resolved.family)) as any};
    agent = url.protocol==='https:' ? new Agent(options) : new HttpAgent(options);
    config.signal.addEventListener('abort',abort,{once:true});
    const response = await new Promise<StreamResponse>((resolve,reject)=>{
      request=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method:'GET',agent,
        headers:{'Accept-Encoding':'identity',...config.headers}},res=>{
        clearTimeout(headerTimer);
        const status=res.statusCode || 0;
        if(status<200 || status>=300) {
          res.resume(); const error=new Error('Source returned HTTP '+status);Object.assign(error,{response:{status}});reject(error);return;
        }
        request!.setTimeout(config.idleTimeoutMs,()=>{
          const error=new Error('Source stream idle timeout');Object.assign(error,{code:'STREAM_IDLE_TIMEOUT'});request!.destroy(error);
        });
        const encoding=String(res.headers['content-encoding'] || 'identity').toLowerCase();
        const decoder=encoding==='gzip'?createGunzip():encoding==='deflate'?createInflate():encoding==='br'?createBrotliDecompress():null;
        if(!decoder && encoding!=='identity') {
          res.destroy();const error=new Error('Unsupported source content encoding');Object.assign(error,{code:'UNSUPPORTED_CONTENT_ENCODING'});reject(error);return;
        }
        body=decoder || res;
        if(decoder){res.on('error',error=>decoder.destroy(error));res.on('aborted',()=>decoder.destroy(Object.assign(new Error('Source stream interrupted'),{code:'ERR_STREAM_PREMATURE_CLOSE'})));res.pipe(decoder);}
        resolve({body,status,headers:res.headers});
      });
      request.on('error',reject);
      headerTimer=setTimeout(()=>{
        const error=new Error('Source headers timeout');Object.assign(error,{code:'ETIMEDOUT'});request!.destroy(error);
      },Math.min(config.connectTimeoutMs,15000));
      request.end();
    });
    return await consume(response);
  } finally {
    clearTimeout(headerTimer);config.signal.removeEventListener('abort',abort);
    body?.destroy();request?.destroy();agent?.destroy();active.source--;
  }
}
