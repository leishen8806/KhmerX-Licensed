// Local implementation: KhmerX origin/main 77779ae has no lib/team/audit-writer.ts.
export function auditInsertSql(db:Pick<D1Database,'prepare'>, action:string, detail:unknown, now=new Date().toISOString()) {
  return db.prepare('INSERT INTO audit (id,action,detail,created_at) VALUES (?,?,?,?)').bind(crypto.randomUUID(), action, JSON.stringify(detail), now);
}
