import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class StreamingDetection1791936000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    for (const column of [
      { name: 'leaseToken', type: 'varchar', length: '40', isNullable: true },
      { name: 'leaseUntilMs', type: 'bigint', default: '0' },
      { name: 'processingMode', type: 'varchar', default: "'live'" },
    ]) if (!await q.hasColumn('raw_event', column.name)) await q.addColumn('raw_event', new TableColumn(column));
    for (const index of [
      { name: 'IDX_receipt_claim', columnNames: ['status', 'leaseUntilMs', 'nextAttemptMs', 'receivedAt'] },
      { name: 'IDX_receipt_received', columnNames: ['receivedAt', 'source', 'status'] },
    ]) if (!(await q.getTable('raw_event'))?.indices.some(i => i.name === index.name)) await q.createIndex('raw_event', new TableIndex(index));
    if (q.connection.options.type === 'postgres') {
      await q.query(`CREATE INDEX IF NOT EXISTS "IDX_receipt_pending_order" ON raw_event ("receivedAt",id) WHERE status='pending'`);
      await q.query(`CREATE INDEX IF NOT EXISTS "IDX_receipt_expired_lease" ON raw_event ("leaseUntilMs","receivedAt",id) WHERE status='processing'`);
      await q.query(`CREATE INDEX IF NOT EXISTS "IDX_attack_source_scope" ON attack ((CAST("networkContext" AS jsonb)->'source'->>'scope'), "alertEligible", "timestampMs")`);
      await q.query('CREATE INDEX IF NOT EXISTS "IDX_attack_detection_processed" ON attack ("detectionMode","alertPolicyVersion","lastProcessedMs" DESC,id DESC)');
      // Statement transition tables aggregate a whole batch, avoiding a separate
      // counter write and network round trip per log. Counters stay transactional.
      await q.query(`CREATE TABLE IF NOT EXISTS ingest_counts (
        bucket bigint NOT NULL, source varchar(32) NOT NULL, status varchar(20) NOT NULL,
        disposition varchar(50) NOT NULL DEFAULT '', records bigint NOT NULL DEFAULT 0,
        PRIMARY KEY(bucket,source,status,disposition))`);
      await q.query('CREATE INDEX IF NOT EXISTS IDX_ingest_counts_status ON ingest_counts(status,bucket)');
      await q.query('CREATE INDEX IF NOT EXISTS IDX_ingest_counts_active_status ON ingest_counts(status,bucket) WHERE records > 0');
      await q.query('LOCK TABLE raw_event IN SHARE ROW EXCLUSIVE MODE');
      await q.query(`INSERT INTO ingest_counts(bucket,source,status,disposition,records)
        SELECT floor(extract(epoch from "receivedAt")/60)::bigint,source,status,COALESCE(disposition,''),count(*)
        FROM raw_event GROUP BY 1,2,3,4 ON CONFLICT(bucket,source,status,disposition) DO UPDATE SET records=EXCLUDED.records`);
      for (const [operation, tables, delta] of [
        ['insert', 'NEW TABLE AS new_rows', `SELECT floor(extract(epoch from "receivedAt")/60)::bigint AS bucket,source,status,COALESCE(disposition,'') AS disposition,count(*)::bigint AS n FROM new_rows GROUP BY 1,2,3,4`],
        ['delete', 'OLD TABLE AS old_rows', `SELECT floor(extract(epoch from "receivedAt")/60)::bigint AS bucket,source,status,COALESCE(disposition,'') AS disposition,-count(*)::bigint AS n FROM old_rows GROUP BY 1,2,3,4`],
        ['update', 'OLD TABLE AS old_rows NEW TABLE AS new_rows', `SELECT bucket,source,status,disposition,sum(n)::bigint AS n FROM (
          SELECT floor(extract(epoch from "receivedAt")/60)::bigint AS bucket,source,status,COALESCE(disposition,'') AS disposition,count(*)::bigint AS n FROM new_rows GROUP BY 1,2,3,4
          UNION ALL SELECT floor(extract(epoch from "receivedAt")/60)::bigint,source,status,COALESCE(disposition,''),-count(*)::bigint FROM old_rows GROUP BY 1,2,3,4) changes GROUP BY 1,2,3,4 HAVING sum(n)<>0`],
      ]) {
        await q.query(`CREATE OR REPLACE FUNCTION siem_ingest_count_${operation}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          INSERT INTO ingest_counts(bucket,source,status,disposition,records) ${delta}
          ON CONFLICT(bucket,source,status,disposition) DO UPDATE SET records=ingest_counts.records+EXCLUDED.records;
          RETURN NULL; END $$`);
        await q.query(`DROP TRIGGER IF EXISTS siem_ingest_count_${operation} ON raw_event`);
        await q.query(`CREATE TRIGGER siem_ingest_count_${operation} AFTER ${operation.toUpperCase()} ON raw_event REFERENCING ${tables}
          FOR EACH STATEMENT EXECUTE FUNCTION siem_ingest_count_${operation}()`);
      }
    }
    // Existing evidence keeps its original target snapshot. Direction is queried
    // from the snapshot, including source ownership, without rewriting originals.
  }
  async down() { throw new Error('Streaming migration preserves receipts and evidence; no automatic destructive rollback'); }
}
