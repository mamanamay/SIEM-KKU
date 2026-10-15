import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/** Bounded, expiring review workspace. Exported reports keep their own immutable snapshot. */
@Entity()
@Index('IDX_report_draft_owner_expiry',['ownerId', 'expiresAtMs'])
@Index('IDX_report_draft_expiry',['expiresAtMs'])
export class ReportDraft {
  @PrimaryColumn() id: string;
  @Column() ownerId: string;
  @Column() actor: string;
  @Column({type:'bigint'}) expiresAtMs: number;
  @Column({type:'int',default:0}) revision: number;
  @Column({type:'text'}) snapshotJson: string;
  @Column({type:'text',nullable:true}) draftJson: string;
  @Column({type:'text',nullable:true}) revisionHistoryJson: string;
  @Column({type:'text',nullable:true}) html: string;
  @Column({nullable:true}) contentDigest: string;
  @Column({type:'varchar',nullable:true}) validatedDigest: string | null;
  @Column({type:'int',nullable:true}) pageCount: number | null;
}
