import { MigrationInterface,QueryRunner,TableColumn,TableIndex } from 'typeorm';
export class RawContentRetention1791261000000 implements MigrationInterface {
  async up(q:QueryRunner) {
    for(const [name,type]of [['rawDigest','varchar'],['sourceIp','varchar'],['targetIp','varchar'],
      ['eventTimestampMs','bigint'],['processedAtMs','bigint'],['contentExpiredAtMs','bigint']]) {
      if(!await q.hasColumn('raw_event',name))await q.addColumn('raw_event',new TableColumn({name,type,isNullable:true,...(name==='rawDigest'?{length:'64'}:{})}));
    }
    if(!await q.hasColumn('attack','lastProcessedMs'))await q.addColumn('attack',new TableColumn({name:'lastProcessedMs',type:'bigint',isNullable:true}));
    const table=await q.getTable('raw_event');
    if(!table?.indices.some(i=>i.name==='IDX_raw_event_expiry'))await q.createIndex('raw_event',new TableIndex({name:'IDX_raw_event_expiry',columnNames:['status','disposition','contentExpiredAtMs','processedAtMs']}));
    for(const [name,field]of [['IDX_raw_event_target_time','targetIp'],['IDX_raw_event_source_time','sourceIp']]) {
      if(!table?.indices.some(i=>i.name===name))await q.createIndex('raw_event',new TableIndex({name,columnNames:[field,'eventTimestampMs']}));
    }
  }
  async down(){throw new Error('Review a backup before rollback; expiry cannot reconstruct purged normal content');}
}
