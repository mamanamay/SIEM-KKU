import {MigrationInterface,QueryRunner,Table} from 'typeorm';
export class CveThaiTranslation1792137600000 implements MigrationInterface {
  async up(q:QueryRunner) {
    if(!await q.hasTable('cve_translation'))await q.createTable(new Table({name:'cve_translation',columns:[
      {name:'cacheKey',type:'varchar',length:'64',isPrimary:true},{name:'cveId',type:'varchar',length:'32'},
      {name:'sourceHash',type:'varchar',length:'64'},{name:'translationJson',type:'text'},
      {name:'createdAt',type:q.connection.options.type==='postgres'?'timestamp':'datetime',default:'CURRENT_TIMESTAMP'}
    ]}));
  }
  async down(){throw new Error('Retained CVE translations require a reviewed rollback plan');}
}
