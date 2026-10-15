import {EVENT_SCOPE,isVisibleAlert,endpointOrganization} from './alertStream';

export function incidentId(value:any):string|null {
  const id=String(value??'');
  return /^[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id))?id:null;
}
export function incidentUrl(event:any,_legacyScope=EVENT_SCOPE as string):string|null {
  const id=incidentId(event?.id);
  if(!id)return null;
  return '/dashboard/soar?'+new URLSearchParams({id,scope:EVENT_SCOPE});
}
export async function loadLinkedIncident(id:string,scope:string,token:string,fetcher:typeof fetch=fetch,signal?:AbortSignal) {
  if(!incidentId(id))throw new Error('Invalid incident ID');
  if(!['organization','all'].includes(scope))throw new Error('Invalid incident scope');
  const response=await fetcher('/api/attacks/incident/'+id+'?scope='+EVENT_SCOPE,{
    headers:{Authorization:'Bearer '+token},signal});
  if(!response.ok)throw new Error('Incident unavailable ('+response.status+')');
  const event=await response.json();
  if(String(event.id)!==id||!isVisibleAlert(event))throw new Error('Incident identity or scope mismatch');
  return event;
}
export function matchesIncident(event:any,id:string) {return String(event.id)===id;}
export function matchesLegacyIncident(event:any,ip:string,time:string) {
  if(ip&&event.ip!==ip&&event.destIp!==ip)return false;
  if(!time)return !!ip;
  if([event.timeStr,event.time,event.createdAt,event.timestampMs,event.lastSeenMs].some(value=>value!=null&&String(value)===time))return true;
  const target=Date.parse(time);
  return Number.isFinite(target)&&[event.timestampMs,event.lastSeenMs,event.createdAt].some(value=>{
    const stamp=typeof value==='number'||/^\d+$/.test(String(value))?Number(value):Date.parse(value);
    return stamp===target;
  });
}
export function criticalForDisplay(events:any[]) {
  return (events||[]).filter(event=>isVisibleAlert(event)&&event.severity==='critical').map(event=>({
    ...event,organization:endpointOrganization(event.networkContext?.target),
    destIp:event.destIp||event.networkContext?.target?.ip||null,
    timeStr:Number(event.lastSeenMs||event.timestampMs)||event.timeStr||event.createdAt
  }));
}
