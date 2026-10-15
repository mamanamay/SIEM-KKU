import * as fs from 'fs';
import * as v8 from 'v8';

export function cgroupMemory(read:(path:string)=>string=path=>fs.readFileSync(path,'utf8')) {
  const value=(path:string)=>{try {const text=read(path).trim(),n=Number(text);return text!=='max'&&Number.isFinite(n)&&n>=0?n:null;}catch{return null;}};
  for(const [version,base,currentFile,limitFile] of [
    [2,'/sys/fs/cgroup','memory.current','memory.max'],
    [1,'/sys/fs/cgroup/memory','memory.usage_in_bytes','memory.limit_in_bytes'],
  ] as const) {
    const currentBytes=value(base+'/'+currentFile);if(currentBytes===null)continue;
    const configured=value(base+'/'+limitFile);
    // v1 uses an enormous integer sentinel for "unlimited".
    const limitBytes=configured!==null&&configured<2**60?configured:null;
    let stat:Record<string,number>={};
    try {stat=Object.fromEntries(read(base+'/memory.stat').trim().split('\n').map(line=>{const [key,n]=line.trim().split(/\s+/);return [key,Number(n)];}));}catch{}
    const fileBytes=stat.file??stat.total_cache??stat.cache??null;
    const anonymousBytes=stat.anon??stat.total_rss??stat.rss??null;
    const inactiveFileBytes=stat.inactive_file??stat.total_inactive_file??0;
    return {version,currentBytes,limitBytes,anonymousBytes,fileBytes,inactiveFileBytes,
      workingSetBytes:Math.max(0,currentBytes-inactiveFileBytes)};
  }
  return null;
}

export function runtimeMemory() {
  return {pid:process.pid,uptimeSeconds:process.uptime(),node:process.version,
    process:process.memoryUsage(),heapLimitBytes:v8.getHeapStatistics().heap_size_limit,cgroup:cgroupMemory()};
}
