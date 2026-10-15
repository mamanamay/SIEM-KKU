import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/** Additive migration: preserves existing evidence and account credentials. */
export class DeveloperApi1791500000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    const postgres = q.connection.options.type === 'postgres';
    const timestamp = postgres ? 'timestamp' : 'datetime';
    const id = { name: 'id', type: postgres ? 'uuid' : 'varchar', isPrimary: true,
      ...(postgres ? { default: 'uuid_generate_v4()' } : {}) };
    const nullableDate = (name: string) => ({ name, type: timestamp, isNullable: true });
    const tables: Table[] = [
      new Table({ name: 'api_tokens', columns: [id,
        { name: 'userId', type: 'int' }, { name: 'name', type: 'varchar', length: '80' },
        { name: 'prefix', type: 'varchar', length: '40' },
        { name: 'tokenHash', type: 'varchar', length: '64', isUnique: true },
        { name: 'scopes', type: 'text' }, { name: 'allowedCidrs', type: 'text' },
        { name: 'expiresAt', type: timestamp }, nullableDate('revokedAt'), nullableDate('lastUsedAt'),
        { name: 'windowStartMs', type: 'bigint', default: '0' },
        { name: 'windowCount', type: 'int', default: '0' },
        { name: 'createdAt', type: timestamp, default: 'CURRENT_TIMESTAMP' } ] }),
      new Table({ name: 'integration_observations', columns: [
        { name: 'fingerprint', type: 'varchar', length: '64', isPrimary: true },
        { name: 'kind', type: 'varchar', length: '32' }, { name: 'origin', type: 'varchar', length: '255' },
        ...['requests','successes','failures','lastDurationMs'].map(name => ({ name, type: 'int', default: '0' })),
        { name: 'lastStatus', type: 'int', isNullable: true }, { name: 'lastSeenAt', type: timestamp },
        nullableDate('lastSuccessAt'), nullableDate('lastFailureAt') ] }),
      new Table({ name: 'alert_notifications', columns: [id,
        { name: 'incidentKey', type: 'varchar', length: '64' }, { name: 'channelKey', type: 'varchar', length: '64' },
        { name: 'severity', type: 'varchar', length: '10' },
        { name: 'status', type: 'varchar', length: '20', default: "'queued'" }, { name: 'summary', type: 'text' },
        { name: 'hitCount', type: 'int', default: '1' }, { name: 'attempts', type: 'int', default: '0' },
        { name: 'nextAttemptAt', type: timestamp }, nullableDate('sentAt'),
        { name: 'lastHttpStatus', type: 'int', isNullable: true },
        { name: 'createdAt', type: timestamp, default: 'CURRENT_TIMESTAMP' } ] }),
      new Table({ name: 'alert_policies', columns: [
        { name: 'id', type: 'int', isPrimary: true }, { name: 'enabled', type: 'boolean', default: postgres ? 'true' : '1' },
        ...Object.entries({ minHighScore: 80, maxPerMinute: 5, cooldownSeconds: 600, highGroupSeconds: 60 })
          .map(([name, value]) => ({ name, type: 'int', default: String(value) })), nullableDate('channelPauseUntil') ] })
    ];
    if (postgres) await q.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    for (const table of tables) if (!await q.hasTable(table.name)) await q.createTable(table);
    for (const column of [new TableColumn({ name: 'actorUserId', type: 'int', isNullable: true }),
      new TableColumn({ name: 'credentialId', type: 'varchar', isNullable: true })]) {
      if (!await q.hasColumn('api_logs', column.name)) await q.addColumn('api_logs', column);
    }
    for (const [table, column] of [['api_tokens', 'userId'], ['alert_notifications', 'incidentKey'],
      ['alert_notifications', 'status'], ['alert_notifications', 'createdAt']]) {
      const name = `IDX_developer_${table}_${column}`;
      if (!(await q.getTable(table))?.indices.some(i => i.name === name))
        await q.createIndex(table, new TableIndex({ name, columnNames: [column] }));
    }
  }
  async down() { throw new Error('Token and notification history requires a reviewed rollback; automatic deletion is disabled'); }
}
