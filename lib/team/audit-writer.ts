// Copied from KhmerX 77779ae lib/team/audit-writer.ts.
export type AuditDb = {prepare(sql:string): any};
export type AuditWhere = 'always'|'changed'|'changed-positive'|'tenant-exists'|'kyc-followup';
export type AuditConflict = 'none'|'id'|'ignore';

/** Shared append-only audit writer. The caller may add a changes() guard. */
export function auditInsertSql(database:AuditDb,tenant:string,actor:string,action:string,detail:unknown,id=crypto.randomUUID(),where:AuditWhere='always',createdAt=new Date().toISOString(),conflict:AuditConflict='none',whereArgs:unknown[]=[]){
  const encoded=typeof detail==='string'?detail:JSON.stringify(detail);
  const guards:Record<AuditWhere,string>={always:'1=1',changed:'changes()=1','changed-positive':'changes()>0','tenant-exists':'EXISTS (SELECT 1 FROM team_companies WHERE id=? AND active=1)','kyc-followup':'EXISTS (SELECT 1 FROM team_members WHERE id=? AND active=1 AND version=?) AND EXISTS (SELECT 1 FROM team_assignments WHERE tenant_id=? AND customer_id=? AND version=?)'};
  const sql=guards[where];
  const args=where==='tenant-exists'?[id,tenant,actor,action,encoded,createdAt,tenant]:[id,tenant,actor,action,encoded,createdAt,...whereArgs];
  const insert=conflict==='ignore'?'INSERT OR IGNORE INTO':'INSERT INTO';
  return database.prepare(`${insert} team_audit (id,seq,tenant_id,actor,action,detail,created_at) SELECT ?,COALESCE((SELECT MAX(seq) FROM team_audit),0)+1,?,?,?,?,? WHERE ${sql}${conflict==='id'?' ON CONFLICT(id) DO NOTHING':''}`).bind(...args);
}
