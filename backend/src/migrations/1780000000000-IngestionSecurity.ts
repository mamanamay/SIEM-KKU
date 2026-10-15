import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/** Additive upgrade. Existing evidence/credentials are never rewritten. */
export class IngestionSecurity1780000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const userExists = await q.hasTable('user'), attackExists = await q.hasTable('attack');
    if (!userExists && !attackExists) {
      // Only an empty application DB gets the current baseline schema.
      // PostgreSQL getTables() also returns pg_catalog/information_schema.
      // Those built-in objects do not make an application database non-empty.
      const tables: { name: string }[] = q.connection.options.type === 'postgres'
        ? (await q.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')"))
        : await q.getTables();
      if (tables.some(t => !['migrations', 'typeorm_metadata'].includes(t.name))) throw new Error('Refusing baseline initialization in a non-empty database');
      await q.connection.driver.createSchemaBuilder().build();
      return;
    }
    if (!userExists || !attackExists) throw new Error('Incomplete baseline schema; restore/repair before upgrading');
    if (!await q.hasTable('raw_event')) {
      await q.createTable(new Table({ name: 'raw_event', columns: [
        { name: 'id', type: 'varchar', length: '64', isPrimary: true },
        { name: 'source', type: 'varchar' }, { name: 'rawLog', type: 'text' },
        { name: 'payloadJson', type: 'text', isNullable: true }, { name: 'rawBytes', type: 'int' },
        { name: 'status', type: 'varchar', default: "'pending'" }, { name: 'attempts', type: 'int', default: '0' },
        { name: 'nextAttemptMs', type: 'bigint', default: '0' },
        ...['error', 'normalizedJson', 'detectionJson'].map(name => ({ name, type: 'text', isNullable: true })),
        { name: 'disposition', type: 'varchar', isNullable: true }, { name: 'attackId', type: 'int', isNullable: true },
        { name: 'receivedAt', type: q.connection.options.type === 'postgres' ? 'timestamp' : 'datetime', default: 'CURRENT_TIMESTAMP' },
      ] }));
      await q.createIndex('raw_event', new TableIndex({ name: 'IDX_raw_event_pending', columnNames: ['status', 'nextAttemptMs'] }));
    }
    for (const [name, type] of [
      ['aggregationKey', 'varchar'], ['source', 'varchar'], ['eventId', 'varchar'],
      ['firstSeenMs', 'bigint'], ['lastSeenMs', 'bigint'], ['correlationChain', 'text'],
      ['detectionEvidence', 'text'], ['killChainPhase', 'varchar'], ['ruleId', 'varchar'], ['outcome', 'varchar'],
    ]) if (!await q.hasColumn('attack', name)) await q.addColumn('attack', new TableColumn({ name, type, isNullable: true }));
    const attack = await q.getTable('attack');
    if (!attack?.indices.some(i => i.isUnique && i.columnNames.join() === 'aggregationKey') &&
        !attack?.uniques.some(i => i.columnNames.join() === 'aggregationKey')) {
      await q.createIndex('attack', new TableIndex({ name: 'UQ_attack_aggregation', columnNames: ['aggregationKey'], isUnique: true }));
    }
    if (!await q.hasColumn('user', 'tokenVersion')) await q.addColumn('user', new TableColumn({ name: 'tokenVersion', type: 'int', default: '0' }));
    if (!await q.hasColumn('user', 'preAuthNonce')) await q.addColumn('user', new TableColumn({ name: 'preAuthNonce', type: 'varchar', isNullable: true }));
  }
  async down(): Promise<void> {
    throw new Error('Evidence-preserving migration: use a verified backup and reviewed rollback plan; no automatic table deletion');
  }
}
