import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as stores from 'svelte/store';
const require=createRequire(import.meta.url);
function load(path, imports={}, globals={}) {
  const source=fs.readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:id=>imports[id]??require(id),console,Date,URL,JSON,setInterval,clearInterval,...globals});
  return module.exports;
}
const stream=load('lib/utils/alertStream.ts');
const workflow=load('lib/ReportEngine/reportWorkflow.ts');
const event=(id,extra={})=>({id,ip:'10.53.45.185',destIp:'10.198.220.109',severity:'high',threatScore:80,alertEligible:true,detectionMode:'engine',alertPolicyVersion:'evidence-v1',timestampMs:Date.parse('2026-10-15T16:05:35Z'),
  networkContext:{source:{scope:'organization',organization:'EN — Engineering',cidr:'10.53.32.0/20'},target:{scope:'organization',organization:'CP — Computing',cidr:'10.198.0.0/16'},direction:'internal'},...extra});
test('report date defaults follow the selected historical data in Bangkok',()=>{
  const range=workflow.reportRangeFromData([event(1)]);
  assert.equal(range.from,'2026-10-15T00:00');assert.equal(range.to,'2026-10-15T23:59:59.999');
  assert.equal(workflow.reportRangeFromData([event(1)],{from:'2026-10-14T00:00'}).from,'2026-10-14T00:00');
});
test('report revision signatures include the page filters',()=>{
  const base={dateRange:{from:'a',to:'b'},filters:{severity:'high'},reportType:'executive',sourcePage:'hunting',selectedIPs:['10.53.45.185'],selectedTargetIPs:[],selectedIncidentId:null};
  assert.notEqual(workflow.reportSelectionKey(base),workflow.reportSelectionKey({...base,filters:{severity:'critical'}}));
});
test('Wallboard shares live scope, replaces snapshots, deduplicates updates and clears stale state',async()=>{
  const sockets=[];
  const io=options=>{const handlers={};const socket={connected:true,on:(key,handler)=>handlers[key]=handler,emit:()=>{},disconnect:()=>{},handlers,options};sockets.push(socket);return socket;};
  const networkPolicyState=stores.writable({loaded:true,version:'r1',error:''});
  const module=load('stores/events.ts',{'svelte/store':stores,'socket.io-client':{io},'./faculties':{networkPolicyState,refreshNetworkPolicy:async()=>true,isInternalIP:ip=>ip.startsWith('10.')},'../lib/utils/alertStream':stream},
    {window:{location:{pathname:'/wallboard'}},localStorage:{getItem:key=>({token:'synthetic-test-session',username:'test',role:'admin'})[key]||null}});
  module.initSocket();await Promise.resolve();const socket=sockets[0];assert.equal(socket.options.auth.scope,'lan');
  socket.handlers.connect();socket.handlers.new_attack(event(9));
  socket.handlers.initial_data([event(1)]);assert.equal(stores.get(module.eventsStore).length,2,'A live update arriving during the initial query must survive');
  assert.equal(stores.get(module.initialDataLoaded),true);
  socket.handlers.initial_data([event(1),event(2)]);assert.equal(stores.get(module.lanEventsStore).length,2);
  assert.equal(stores.get(module.eventsStore)[0].sourceOrganization,'EN — Engineering');
  assert.equal(module.enrichEventWithCVE(event(5,{timestampMs:'1792080335000'})).timestampMs,1792080335000);
  socket.handlers.initial_data([event(2)]);assert.equal(stores.get(module.eventsStore).length,1);
  socket.handlers.new_attack(event(2,{hitCount:2}));socket.handlers.new_attack(event(3,{severity:'low',threatScore:10}));
  assert.equal(stores.get(module.eventsStore).length,1);assert.equal(stores.get(module.eventsStore)[0].hitCount,2);
  module.isHistoricalMode.set(true);socket.handlers.new_attack(event(4));assert.equal(stores.get(module.eventsStore).length,1);
  module.resumeLiveEvents();assert.equal(stores.get(module.isHistoricalMode),false);assert.equal(sockets.length,2);
  module.disconnectSocket();assert.equal(stores.get(module.eventsStore).length,0);assert.equal(stores.get(module.connectionState),false);
});
