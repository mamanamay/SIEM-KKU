import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,imports={}){
  const source=fs.readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:id=>imports[id]??require(id),URL,URLSearchParams,Date,console});return module.exports;
}
const stream=load('lib/utils/alertStream.ts');
const map=load('lib/utils/wallboardMap.ts',{'./alertStream':stream});
const links=load('lib/utils/incidentLink.ts',{'./alertStream':stream});
const event={id:7,ip:'10.53.45.185',destIp:'10.198.220.109',alertEligible:true,detectionMode:'engine',alertPolicyVersion:'evidence-v1',
  severity:'high',threatScore:80,networkContext:{source:{scope:'organization',organization:'EN — Engineering'},target:{scope:'organization',organization:'CP — Computing'}}};
test('map rings count the initiating faculty and never fall back to the destination',()=>{
  const faculties=[{code:'EN'},{code:'CP'},{code:'SC'}];
  const external={...event,id:8,networkContext:{...event.networkContext,source:{scope:'external',country:'TH'}}};
  const missing={...event,id:9,networkContext:{target:event.networkContext.target}};
  const stats=map.sourceFacultyStats([event,external,missing],faculties);
  assert.equal(stats.EN.count,1);assert.equal(stats.CP.count,0);assert.equal(stats.SC.count,0);assert.equal(stats.EN.events[0].id,7);
});
test('notification links use persisted incident IDs and historical detail loading does not depend on the live list',async()=>{
  const url=new URL(links.incidentUrl(event),'https://fixture.invalid');
  assert.equal(url.pathname,'/dashboard/soar');assert.equal(url.searchParams.get('id'),'7');
  assert.equal(links.incidentUrl({...event,id:undefined}),null);
  let request;
  const loaded=await links.loadLinkedIncident('7','organization','fixture-token',async path=>{request=path;return {ok:true,json:async()=>event};});
  assert.ok(request.includes('/incident/7?'));assert.equal(loaded.id,7);
});
