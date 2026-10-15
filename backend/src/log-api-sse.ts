import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import { StringDecoder } from 'string_decoder';

export interface SseFrame { data: string | null; event: string; id?: string; retryMs?: number; }
/** UTF-8, BOM, LF/CRLF/CR, comments and multiline data; incomplete EOF frames are discarded. */
export async function* sseFrames(stream: Readable, maxFrameBytes: number): AsyncGenerator<SseFrame> {
  const decoder=new StringDecoder('utf8');
  let line='', data:string[]=[], event='', id:string|undefined, retryMs:number|undefined;
  let bytes=0, first=true, skipLf=false;
  function lineDone(): SseFrame | null {
    const value=line;line='';
    if(value==='') {
      const frame={data:data.length?data.join('\n'):null,event:event || 'message',...(id!==undefined?{id}:{}),...(retryMs!==undefined?{retryMs}:{})};
      data=[];event='';id=undefined;retryMs=undefined;bytes=0;return frame;
    }
    if(value.startsWith(':'))return null;
    const colon=value.indexOf(':');
    const name=colon<0?value:value.slice(0,colon);
    let field=colon<0?'':value.slice(colon+1);if(field.startsWith(' '))field=field.slice(1);
    if(name==='data')data.push(field);
    else if(name==='event')event=field;
    else if(name==='id'&&!field.includes('\0')) {
      if(Buffer.byteLength(field)>512 || /[\x01-\x1f\x7f]/.test(field))throw new BadRequestException('Source SSE event ID exceeds supported header limits');
      id=field;
    } else if(name==='retry'&&/^\d+$/.test(field))retryMs=Math.min(Math.max(Number(field),1000),3600000);
    return null;
  }
  for await(const chunk of stream) {
    const text=decoder.write(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
    for(const character of text) {
      if(first){first=false;if(character==='\uFEFF')continue;}
      if(skipLf){skipLf=false;if(character==='\n')continue;}
      bytes+=Buffer.byteLength(character);if(bytes>maxFrameBytes)throw new BadRequestException('Source SSE frame exceeds '+maxFrameBytes+' bytes; reduce the provider event batch size');
      if(character==='\r'||character==='\n') { const frame=lineDone();if(character==='\r')skipLf=true;if(frame)yield frame; }
      else line+=character;
    }
  }
  // SSE requires a blank line to dispatch; never acknowledge a truncated final event.
  decoder.end();
}

export function sseHeaderId(value:string):string { return Buffer.from(value,'utf8').toString('latin1'); }
