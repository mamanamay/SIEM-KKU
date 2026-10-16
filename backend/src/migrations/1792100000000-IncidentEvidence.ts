import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
export class IncidentEvidence1792100000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    for (const name of ['httpContext', 'aiInvestigation']) if (!await q.hasColumn('attack', name))
      await q.addColumn('attack', new TableColumn({ name, type: 'text', isNullable: true }));
    if (!await q.hasTable('cve_finding')) await q.createTable(new Table({ name: 'cve_finding', columns: [
      { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
      { name: 'incidentId', type: 'integer' }, ...['cveId', 'sourceIp', 'reference', 'actor'].map(name => ({ name, type: 'varchar' })),
      { name: 'targetIp', type: 'varchar', isNullable: true }, { name: 'receiptIds', type: 'text' },
      { name: 'reason', type: 'text' }, { name: 'description', type: 'text', isNullable: true },
      { name: 'affectedProduct', type: 'text', isNullable: true }, { name: 'severity', type: 'varchar', isNullable: true },
      { name: 'cvssScore', type: 'float', isNullable: true }, { name: 'verification', type: 'varchar', default: "'published_cve_similarity'" },
      ...['createdAt', 'updatedAt'].map(name => ({ name, type: q.connection.options.type === 'postgres' ? 'timestamp' : 'datetime', default: 'CURRENT_TIMESTAMP' })),
    ], indices: [{ name: 'UQ_cve_incident', columnNames: ['incidentId', 'cveId'], isUnique: true },
      { name: 'IDX_cve_finding_incident', columnNames: ['incidentId'] }] }));
    // No rewrite of retained originals or replay of ingestion is required.
  }
  async down() { throw new Error('Incident evidence is preserved; rollback requires a reviewed backup plan'); }
}
