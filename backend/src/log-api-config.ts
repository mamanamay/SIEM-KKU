export const SINGLE_LOG_API = 'combined';
export interface SingleSelection { config: any | null; inheritedFrom: string | null; ambiguous: boolean; }
/** Never choose arbitrarily between different feeds or different credentials. */
export function chooseSingleConnection(sources: Record<string, any>): SingleSelection {
  if(sources.combined?.url)return {config:{...sources.combined,source:SINGLE_LOG_API},inheritedFrom:null,ambiguous:false};
  const configured=['nginx','firewall'].filter(key=>sources[key]?.url);
  const active=configured.filter(key=>sources[key].enabled);
  const candidates=active.length?active:configured;
  let selected=candidates.length===1?candidates[0]:null;
  if(candidates.length>1){
    const signature=(key:string)=>JSON.stringify([sources[key].url,sources[key].authType,sources[key].authName,
      sources[key].keyEncrypted||null,sources[key].format,sources[key].itemsPath||'',sources[key].rawField||'',
      sources[key].intervalSeconds||30,sources[key].sourceField??'event.module']);
    if(candidates.every(key=>signature(key)===signature(candidates[0])))selected=candidates[0];
  }
  return {config:selected?{...sources[selected],source:SINGLE_LOG_API}:null,inheritedFrom:selected,ambiguous:configured.length>0&&!selected};
}
export function storeSingleConnection(sources: Record<string, any>, connection: any) {
  const retained: Record<string, any>={};
  for(const [key,value] of Object.entries(sources))retained[key]=key!=='combined'&&value&&typeof value==='object'?{...value,enabled:false}:value;
  retained.combined={...connection,source:SINGLE_LOG_API};
  return retained;
}
