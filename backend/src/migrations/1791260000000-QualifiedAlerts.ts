import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class QualifiedAlerts1791260000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    for (const [name,type] of [['detectionMode','varchar'],['alertPolicyVersion','varchar'],['networkContext','text'],
      ['targetScope','varchar'],['srcPort','int'],['destPort','int'],['protocol','varchar']]) {
      if (!await q.hasColumn('attack',name)) await q.addColumn('attack',new TableColumn({name,type,isNullable:true}));
    }
    if (!await q.hasColumn('attack','alertEligible')) await q.addColumn('attack',new TableColumn({name:'alertEligible',type:'boolean',default:'false'}));
    const table=await q.getTable('attack');
    if (!table?.indices.some(i=>i.name==='IDX_attack_visibility_scope')) await q.createIndex('attack',new TableIndex({
      name:'IDX_attack_visibility_scope',columnNames:['alertEligible','targetScope','timestampMs']}));
  }
  async down() { throw new Error('Restore a reviewed backup; alert evidence is not deleted automatically'); }
}
