import {MigrationInterface,QueryRunner,TableIndex} from 'typeorm';

/** Index-only upgrade: skip expired tombstones and bound actor/time evidence lookup. */
export class RetentionIndexes1791262000000 implements MigrationInterface {
  async up(q:QueryRunner) {
    const columns=['status','disposition','contentExpiredAtMs','processedAtMs'];
    const existing=(await q.getTable('raw_event'))?.indices.find(i=>i.name==='IDX_raw_event_expiry');
    if(existing&&existing.columnNames.join()!==columns.join())await q.dropIndex('raw_event',existing);
    if(!existing||existing.columnNames.join()!==columns.join())await q.createIndex('raw_event',new TableIndex({name:'IDX_raw_event_expiry',columnNames:columns}));
    for(const [name,time] of [['IDX_attack_actor_event_time','timestampMs'],['IDX_attack_actor_processed_time','lastProcessedMs']]) {
      if(!(await q.getTable('attack'))?.indices.some(i=>i.name===name))await q.createIndex('attack',new TableIndex({name,columnNames:['ip','alertEligible',time]}));
    }
  }
  async down(){throw new Error('Review the previous query/index contract before rollback; no automatic evidence schema rollback');}
}
