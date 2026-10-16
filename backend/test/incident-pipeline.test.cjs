const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const {httpContext} = require('../dist/http-context');
const {cveDetails, CveIntelService, INCIDENT_AI_PROMPT} = require('../dist/cve-intel.service');
const {incidentReportHtml, incidentReportCsv, reportDraftInput} = require('../dist/incident-report-template');

test('HTTP evidence preserves observed hosts and never guesses HTTPS from a port', () => {
  const actual = httpContext({uri:'/probe',http_method:'GET',http_status:200,dst_port:443}, JSON.stringify({host:'portal.example.invalid'}));
  assert.equal(actual.host,'portal.example.invalid'); assert.equal(actual.uri,'/probe'); assert.equal(actual.url,null);
  assert.equal(httpContext({uri:'https://one.example.invalid/a'}).host,'one.example.invalid');
  assert.equal(httpContext({dst_ip:'10.198.220.109',dst_port:443}),null);
  assert.equal(httpContext({uri:'/legacy-ecs'},JSON.stringify({host:{name:'collector-only'},url:{domain:'portal.example.invalid'}})).host,'portal.example.invalid');
});
test('CVE metadata uses real metrics and leaves unknown scores unset', () => {
  assert.equal(cveDetails({containers:{cna:{}}}).cvssScore,null);
  assert.equal(cveDetails({containers:{cna:{metrics:[{cvssV3_1:{baseScore:9.8,baseSeverity:'CRITICAL'}}]}}}).cvssScore,9.8);
  assert.match(INCIDENT_AI_PROMPT,/untrusted data/); assert.match(INCIDENT_AI_PROMPT,/empty candidates array/);
});

const integration = !!process.env.TEST_DATABASE_URL;
let db, map, alerts, evidence, query, attacks, receipts, reports, savedPaths=[];
const day='2026-10-15', start=Date.parse(day+'T10:00:00+07:00');
const period={from:day+'T00:00',to:day+'T23:59:59.999'};
const user={sub:1,username:'isolated-test',role:'admin'};
let en, sc, inbound;
before(async()=>{
  if(!integration)return;
  const url=new URL(process.env.TEST_DATABASE_URL);
  assert.equal(url.pathname,'/codex_test','Tests require a dedicated synthetic database');
  assert.equal(url.username,'codex_test');assert.equal(url.password,'codex_isolated_test_only');
  assert.ok(url.hostname==='db'||(url.hostname==='127.0.0.1'&&url.port==='19532'));
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  db=require('../dist/data-source').default;
  await db.initialize();await db.dropDatabase();await db.runMigrations();
  const {Attack}=require('../dist/entities/attack.entity');
  const {RawEvent}=require('../dist/entities/raw-event.entity');
  const {Report}=require('../dist/entities/report.entity');
  const {NetworkMapService}=require('../dist/network-map.service');
  const {AlertQueryService}=require('../dist/alert-query.service');
  const {IncidentEvidenceService}=require('../dist/incident-evidence.service');
  const {ReportQueryService}=require('../dist/report-query.service');
  const {eventContext}=require('../dist/event-context');
  attacks=db.getRepository(Attack);receipts=db.getRepository(RawEvent);reports=db.getRepository(Report);
  map=new NetworkMapService();alerts=new AlertQueryService(attacks,map);evidence=new IncidentEvidenceService(receipts);query=new ReportQueryService(db);
  async function attack(ip,severity='high'){
    const destIp='10.198.220.109';return attacks.save({ip,destIp,type:'Potential Path Traversal',severity,detail:'Potential Path Traversal',source:'nginx',timeStr:day,
      timestampMs:start,firstSeenMs:start,lastSeenMs:start+1000,hitCount:90,threatScore:85,alertEligible:true,detectionMode:'engine',alertPolicyVersion:'evidence-v1',
      targetScope:'organization',networkContext:eventContext({src_ip:ip,dst_ip:destIp},map),detectionEvidence:{attack_signals:[{kind:'heuristic',rule_id:'TRAVERSAL'}]},outcome:'ALLOW'});
  }
  en=await attack('10.53.45.185');sc=await attack('10.54.58.8','critical');inbound=await attack('27.130.146.22');
  async function receipt(attack,path,offset=0){
    const raw=JSON.stringify({remote_addr:attack?.ip||'10.54.58.8',host:'portal.example.invalid',request_method:'GET',request_uri:path,status:200});
    const id=createHash('sha256').update(raw+offset).digest('hex');
    return receipts.save({id,source:'nginx',rawLog:raw,rawBytes:Buffer.byteLength(raw),rawDigest:createHash('sha256').update(raw).digest('hex'),
      status:'processed',disposition:attack?'detected':'benign',attackId:attack?.id||null,sourceIp:attack?.ip||'10.54.58.8',targetIp:'10.198.220.109',eventTimestampMs:start+offset,
      normalizedJson:JSON.stringify({src_ip:attack?.ip||'10.54.58.8',dst_ip:'10.198.220.109',http_method:'GET',uri:path,http_status:200,
        network_context:eventContext({src_ip:attack?.ip||'10.54.58.8',dst_ip:'10.198.220.109'},map),padding:'x'.repeat(20000)})});
  }
  await receipt(en,'/one');await receipt(en,'/two?signature=CVE-2021-44228',1000);await receipt(en,'/old',-86400000);
  await receipt(sc,'/science');await receipt(inbound,'/external');await receipt(null,'/normal');
});
after(async()=>{for(const p of savedPaths)await fs.unlink(p).catch(()=>{});if(db?.isInitialized)await db.destroy();});

test('additive migration upgrades existing schema and is idempotent',{skip:!integration},async()=>{
  const q=db.createQueryRunner();await q.startTransaction();
  try{
    await q.dropTable('cve_finding');await q.dropColumn('attack','httpContext');await q.dropColumn('attack','aiInvestigation');
    const {IncidentEvidence1792100000000}=require('../dist/migrations/1792100000000-IncidentEvidence');
    const migration=new IncidentEvidence1792100000000();await migration.up(q);await migration.up(q);
    const {CveThaiTranslation1792137600000}=require('../dist/migrations/1792137600000-CveThaiTranslation');
    await q.dropTable('cve_translation');const thaiMigration=new CveThaiTranslation1792137600000();await thaiMigration.up(q);await thaiMigration.up(q);
    assert.equal(await q.hasTable('cve_translation'),true);
    assert.equal(await q.hasColumn('attack','httpContext'),true);assert.equal(await q.hasTable('cve_finding'),true);
    assert.equal(await q.manager.getRepository('Attack').count(),3);
  }finally{await q.rollbackTransaction();await q.release();}
});
test('network ownership resolves EN, SC and CP and keeps source/target distinct',{skip:!integration},()=>{
  assert.match(en.networkContext.source.organization,/EN/);assert.equal(en.networkContext.source.cidr,'10.53.32.0/20');
  assert.match(sc.networkContext.source.organization,/SC/);assert.match(en.networkContext.target.organization,/CP/);
  assert.equal(inbound.networkContext.direction,'inbound');
});
test('legacy receipts recover host and retain multiple URLs per incident',{skip:!integration},async()=>{
  const result=await evidence.forIncident(en.id);
  assert.equal(result.total,3);assert.equal(result.items[0].http.host,'portal.example.invalid');
  assert.equal(new Set(result.items.map(r=>r.http.uri)).size,3);assert.equal(result.items[0].excerpt,undefined);
});
test('raw event search includes benign website access and honors event time/IP/status/pagination',{skip:!integration},async()=>{
  const {ReceiptService}=require('../dist/receipt.service');const service=new ReceiptService(receipts,db);
  const result=await service.searchEvents({from:day+'T00:00:00+07:00',to:day+'T23:59:59+07:00',q:'/normal',srcIp:'10.54.58.8',httpStatus:'200',page:'1',limit:'1'});
  assert.equal(result.total,1);assert.equal(result.items[0].disposition,'benign');assert.equal(result.items[0].httpContext.host,'portal.example.invalid');
  await assert.rejects(service.searchEvents({from:'bad',to:'bad'}));
});
test('report options and immutable snapshots preserve CIDR/type/severity and count only in-period receipts',{skip:!integration},async()=>{
  const filters={ip:'10.53.32.0/20',severity:'high',type:'Traversal'};
  const options=await query.options({...period,filters});assert.deepEqual(options.ips.map(i=>i.ip),[en.ip]);
  const result=await query.snapshot({...period,filters,reportType:'incident',sourcePage:'soar',selectedIPs:[en.ip],incidentId:en.id},user);
  assert.equal(result.snapshot.incidentCount,1);assert.equal(result.snapshot.receiptCount,2);assert.equal(result.snapshot.events[0].verifiedReceiptCount,2);
  assert.equal(result.snapshot.events[0].httpContext.host,'portal.example.invalid');assert.equal(result.snapshot.filters.ip,filters.ip);
  await assert.rejects(query.owned(result.snapshotId,{sub:999}));
  await assert.rejects(query.snapshot({...period,filters,reportType:'executive',sourcePage:'hunting',selectedIPs:[sc.ip]},user));
});
test('AI candidates require persisted supporting quotes, published verification, deduplicate and appear in CVE history feed',{skip:!integration},async()=>{
  const {CveFinding}=require('../dist/entities/cve-finding.entity');
  const ai={callUnifiedAI:async()=>JSON.stringify({analysis:'ผลตอบกลับ HTTP ยังไม่ยืนยันการเจาะสำเร็จ',candidates:[{cveId:'CVE-2021-44228',incidentIds:[en.id],reason:'Specific receipt evidence; asset version unverified',evidenceQuote:'CVE-2021-44228'}]})};
  const intel=new CveIntelService(db.getRepository(CveFinding),db,ai,evidence,alerts);
  intel.lookup=async id=>({details:{cveId:id,state:'PUBLISHED',description:'Synthetic public-record fixture',reference:'https://www.cve.org/CVERecord?id='+id,severity:'CRITICAL',cvssScore:10,affectedProduct:'Fixture'}});
  const one=await intel.analyzeIncident(en.id,user);assert.equal(one.mode,'ai');assert.equal(one.cves.length,1);
  await intel.analyzeIncident(en.id,user);assert.equal((await intel.findings(en.id)).length,1);
  assert.equal((await attacks.findOneBy({id:en.id})).aiInvestigation.cves[0].cveId,'CVE-2021-44228');
  ai.callUnifiedAI=async()=>JSON.stringify({analysis:'Insufficient evidence',candidates:[{cveId:'CVE-2021-44228',incidentIds:[sc.id],reason:'A generic label',evidenceQuote:'not-present-in-any-receipt'}]});
  assert.equal((await intel.analyzeIncident(sc.id,user)).cves.length,0);
  ai.callUnifiedAI=async()=>JSON.stringify({analysis:'A host name alone is insufficient',candidates:[{cveId:'CVE-2021-44228',incidentIds:[sc.id],reason:'A host name',evidenceQuote:'portal.example.invalid'}]});
  assert.equal((await intel.analyzeIncident(sc.id,user)).cves.length,0);
  ai.callUnifiedAI=async()=>{throw new Error('AI unavailable');};const fallback=await intel.analyzeIncident(sc.id,user);
  assert.equal(fallback.mode,'rule-based');assert.doesNotMatch(fallback.analysis,/95%|70%/);
});
test('Wallboard and dashboard sockets use one qualified scope, including legacy callers',{skip:!integration},async()=>{
  const {EventsGateway}=require('../dist/events.gateway');const jwt=require('jsonwebtoken');const {JWT_SECRET}=require('../dist/jwt.config');
  const gateway=new EventsGateway(attacks,{findOne:async()=>({id:1,username:'isolated-test',role:'admin',accountStatus:'active',tokenVersion:0})},alerts,map);
  gateway.server={sockets:{sockets:new Map()}};
  const emitted={},rooms=[];const client={id:'isolated-client',handshake:{auth:{scope:'legacy',token:jwt.sign({sub:1,purpose:'access',role:'admin',tokenVersion:0},JWT_SECRET,{expiresIn:'5m'})}},data:{},join:r=>rooms.push(r),emit:(k,v)=>emitted[k]=v,disconnect:()=>assert.fail('Valid test user disconnected')};
  await gateway.handleConnection(client);assert.deepEqual(rooms,['lan-events']);assert.equal(emitted.initial_data.length,3);
  assert.ok(emitted.initial_data.every(e=>e.networkScope.inScope&&e.networkScope.ruleVersion===map.getVersion()));
  gateway.sendInitialData(client,[en,{...en,id:999,alertEligible:false}]);assert.equal(emitted.initial_data.length,1);
});
test('preview, real PDF validation, export/history and revision guards use the same snapshot',{skip:!integration||!process.env.PDF_RENDER_URL},async()=>{
  const {IncidentReportController}=require('../dist/incident-report.controller');const {ExportService}=require('../dist/export.service');
  const exporter=new ExportService(attacks,reports,{});const controller=new IncidentReportController(query,db,exporter,{validateReportContent:async()=>({valid:true,improvements:[]})});
  for(const reportType of ['executive','incident','technical']){
    const selection=await query.snapshot({...period,reportType,sourcePage:'hunting',selectedIPs:[en.ip],selectedTargetIPs:['10.198.220.109'],incidentId:en.id},user);
    const preview=await controller.preview({snapshotId:selection.snapshotId,revision:0,reportTitle:'TEST incident evidence',reportId:'TEST-'+reportType,
      selectedFields:['type','severity','networkContext'],manualEdits:{rootCause:'Pending evidence',impact:'Unverified',resolution:'Pending verification'},cveSimilarityResults:[{cveId:'CVE-2099-9999',reason:'forged client text'}]}, {user});
    assert.ok(preview.html.includes('10.53.32.0/20'));assert.ok(preview.html.includes('10.198.0.0/16'));assert.ok(preview.html.includes('portal.example.invalid'));
    assert.ok(preview.html.includes('CVE-2021-44228'));assert.ok(!preview.html.includes('CVE-2099-9999'));
    const version={snapshotId:selection.snapshotId,revision:preview.revision,contentDigest:preview.contentDigest};
    await assert.rejects(controller.publish({...version,format:'html'}, {user}, {}));
    const validated=await controller.validate(version,{user});assert.equal(validated.passed,true);assert.ok(validated.pageCount<=3);
    for(const format of ['pdf','html',...(reportType==='technical'?['csv']:[])]){
      let bytes,headers;await controller.publish({...version,format,checklist:{dataVerified:true,aiVerified:true,cveDisclaimer:true}},{user},{set:h=>headers=h,end:b=>bytes=b});
      assert.ok(bytes.length>0);assert.ok(headers['X-Report-Hash']);
      if(format==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
      const saved=await reports.findOne({where:{title:'TEST incident evidence'},order:{id:'DESC'}});savedPaths.push(saved.filePath);
      assert.equal(JSON.parse(saved.snapshotJson).selectedIPs[0],en.ip);assert.equal(JSON.parse(saved.filtersJson).cveFindings[0].id,'CVE-2021-44228');
      if(format==='csv'){assert.ok(bytes.toString().includes('sourceCidr'));assert.ok(bytes.toString().includes('portal.example.invalid'));}
    }
    await assert.rejects(controller.validate({...version,revision:0},{user}));
  }
});

test('real Nest HTTP and Wallboard WebSocket load matching evidence, enforce roles and use persisted incident IDs',{skip:!integration},async()=>{
  process.env.TOTP_ENCRYPTION_KEY='1'.repeat(64);process.env.STATIC_ANALYSIS_MODE='true';
  const {User}=require('../dist/entities/user.entity');
  const password='IsolatedEvidence_2026!';const passwordHash=await require('bcryptjs').hash(password,4);
  const admin=await db.getRepository(User).save({id:1,username:'isolated-test',passwordHash,role:'admin',accountStatus:'active',requirePasswordChange:false});
  const guest=await db.getRepository(User).save({username:'isolated-guest',role:'guest',accountStatus:'active',requirePasswordChange:false});
  const {NestFactory}=require('@nestjs/core');const {AppModule}=require('../dist/app.module');
  const {signAccessToken}=require('../dist/auth-tokens');
  const app=await NestFactory.create(AppModule,{logger:false});
  let ws;
  try {
    await app.listen(0,'127.0.0.1');const base=await app.getUrl();
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:admin.username,password})});
    assert.equal(login.ok,true);const session=await login.json();assert.ok(session.access_token);
    const headers={Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'};
    ws=new WebSocket(base.replace('http:','ws:')+'/socket.io/?EIO=4&transport=websocket');
    const nextSocketEvent=name=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{ws.removeEventListener('message',handler);reject(new Error('Socket event timeout: '+name));},5000);
      function handler(message){const frame=String(message.data);if(!frame.startsWith('42'))return;const [event,payload]=JSON.parse(frame.slice(2));if(event===name){clearTimeout(timer);ws.removeEventListener('message',handler);resolve(payload);}}
      ws.addEventListener('message',handler);
    });
    const initial=nextSocketEvent('initial_data');
    ws.addEventListener('message',message=>{const frame=String(message.data);if(frame.startsWith('0'))ws.send('40'+JSON.stringify({token:signAccessToken(admin),scope:'legacy'}));else if(frame==='2')ws.send('3');});
    const wallboard=await initial;assert.equal(wallboard.length,3);assert.ok(wallboard.every(e=>e.networkScope.inScope&&e.detectionMode==='engine'));
    const detail=await fetch(base+'/api/attacks/incident/'+en.id,{headers});assert.equal(detail.status,200);
    const data=await detail.json();assert.equal(data.httpEvidence.total,3);assert.equal(data.cveFindings.length,1);
    const normal=await fetch(base+'/api/ingest/events?'+new URLSearchParams({from:day+'T00:00:00+07:00',to:day+'T23:59:59+07:00',q:'/normal'}),{headers});
    assert.equal(normal.status,200);assert.equal((await normal.json()).total,1);
    const spoof=await fetch(base+'/api/attacks/analyze-event',{method:'POST',headers,body:JSON.stringify({ip:'spoofed-browser-data'})});assert.equal(spoof.status,400);
    const nextUpdate=nextSocketEvent('new_attack');
    const analysis=await fetch(base+'/api/attacks/analyze-event',{method:'POST',headers,body:JSON.stringify({incidentId:en.id,ip:'spoofed-browser-data'})});
    assert.equal(analysis.ok,true);const result=await analysis.json();assert.equal(result.mode,'rule-based');assert.ok(result.analysis.includes(en.ip));assert.equal(result.cves.length,1);
    assert.equal((await nextUpdate).id,en.id);
    const localAnalysis=await fetch(base+'/api/attacks/analyze-event',{method:'POST',headers,body:JSON.stringify({incidentId:en.id,mode:'local'})});
    assert.equal(localAnalysis.ok,true);const localResult=await localAnalysis.json();
    assert.equal(localResult.mode,'rule-based');assert.equal(localResult.aiStatus,null);assert.ok(localResult.analysis.includes('### 6.'));
    const invalidMode=await fetch(base+'/api/attacks/analyze-event',{method:'POST',headers,body:JSON.stringify({incidentId:en.id,mode:'other'})});assert.equal(invalidMode.status,400);
    const selection=await query.snapshot({...period,reportType:'incident',sourcePage:'soar',selectedIPs:[en.ip],incidentId:en.id},user);
    assert.ok(selection.snapshot.events[0].savedAnalysis.analysis.includes(en.ip));
    const written=await fetch(base+'/api/export/report/write',{method:'POST',headers,body:JSON.stringify({snapshotId:selection.snapshotId,revision:0,mode:'local',snapshot:{events:[{ip:'spoofed'}]}})});
    assert.equal(written.status,201);const prose=await written.json();assert.ok(prose.edits.executiveSummary.includes(en.ip));assert.ok(!prose.edits.executiveSummary.includes('spoofed'));
    const badFinal=await fetch(base+'/api/export/report/preview',{method:'POST',headers,body:JSON.stringify({snapshotId:selection.snapshotId,revision:0,reportStage:'final'})});assert.equal(badFinal.status,400);
    const intel=app.get(CveIntelService),originalLookup=intel.lookup.bind(intel);
    const cveFixture={cveMetadata:{cveId:'CVE-2026-12345',state:'PUBLISHED',dateUpdated:'2026-10-16'},containers:{cna:{descriptions:[{lang:'en',value:'Example 1.2.3 permits file reads.'}],solutions:[],affected:[]}}};
    intel.lookup=async id=>id==='CVE-2026-12345'?{data:cveFixture,details:cveDetails(cveFixture)}:originalLookup(id);
    app.get(require('../dist/ai.service').AiService).callUnifiedAI=async()=>JSON.stringify({descriptionTh:'Example 1.2.3 อาจทำให้มีการอ่านไฟล์ได้ตามเงื่อนไขในต้นฉบับ',solutionsTh:[]});
    const guestThai=await fetch(base+'/api/cve/CVE-2026-12345/thai',{method:'POST',headers:{Authorization:'Bearer '+signAccessToken(guest)}});assert.equal(guestThai.status,403);
    const translated=await fetch(base+'/api/cve/CVE-2026-12345/thai',{method:'POST',headers});assert.equal(translated.status,201);assert.equal((await translated.json()).status,'ready');
    const cached=await fetch(base+'/api/cve/CVE-2026-12345',{headers});const cacheBody=await cached.json();assert.equal(cacheBody.thai.cached,true);assert.equal(cacheBody.siem.description,'Example 1.2.3 permits file reads.');
    const historySave=await fetch(base+'/api/cve/history',{method:'POST',headers,body:JSON.stringify({cveId:'CVE-2026-12345',aiSummary:'spoofed browser prose'})});assert.equal(historySave.status,201);assert.equal((await historySave.json()).aiSummary,cacheBody.thai.descriptionTh);assert.ok(cacheBody.thai.descriptionTh.includes('1.2.3'));
    cveFixture.cveMetadata.dateUpdated='2026-10-17';const invalidated=await fetch(base+'/api/cve/CVE-2026-12345/thai',{headers});assert.equal((await invalidated.json()).status,'not-translated');
    const forbidden=await fetch(base+'/api/ingest/events',{headers:{Authorization:'Bearer '+signAccessToken(guest)}});assert.equal(forbidden.status,403);
  } finally { ws?.close(); await app.close(); }
});
