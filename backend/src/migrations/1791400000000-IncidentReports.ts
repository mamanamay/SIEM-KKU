import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
export class IncidentReports1791400000000 implements MigrationInterface {
  async up(q:QueryRunner) {
    if(!await q.hasTable('report_draft'))await q.createTable(new Table({name:'report_draft',columns:[
      {name:'id',type:'varchar',isPrimary:true},{name:'ownerId',type:'varchar'},{name:'actor',type:'varchar'},
      {name:'expiresAtMs',type:'bigint'},{name:'revision',type:'int',default:'0'},{name:'snapshotJson',type:'text'},
      {name:'draftJson',type:'text',isNullable:true},{name:'html',type:'text',isNullable:true},
      {name:'contentDigest',type:'varchar',isNullable:true},{name:'validatedDigest',type:'varchar',isNullable:true},
      {name:'pageCount',type:'int',isNullable:true}]}));
    const table=await q.getTable('report_draft');
    if(!await q.hasColumn('report_draft','revisionHistoryJson'))await q.addColumn('report_draft',new TableColumn({name:'revisionHistoryJson',type:'text',isNullable:true}));
    if(!table?.indices.some(i=>i.name==='IDX_report_draft_owner_expiry'))await q.createIndex('report_draft',new TableIndex({name:'IDX_report_draft_owner_expiry',columnNames:['ownerId','expiresAtMs']}));
    if(!table?.indices.some(i=>i.name==='IDX_report_draft_expiry'))await q.createIndex('report_draft',new TableIndex({name:'IDX_report_draft_expiry',columnNames:['expiresAtMs']}));
    for(const [name,type] of [['snapshotJson','text'],['reviewJson','text'],['contentDigest','varchar'],['pageCount','int']])
      if(!await q.hasColumn('report',name))await q.addColumn('report',new TableColumn({name,type,isNullable:true}));
    if(!(await q.getTable('raw_event'))?.indices.some(i=>i.name==='IDX_raw_event_attack_time'))await q.createIndex('raw_event',new TableIndex({name:'IDX_raw_event_attack_time',columnNames:['attackId','eventTimestampMs']}));
  }
  async down(){throw new Error('Report evidence and approvals require a reviewed rollback; no automatic evidence deletion');}
}
