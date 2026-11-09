declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values:unknown[]):D1PreparedStatement;
  first<T=unknown>(column?:string):Promise<T|null>;
  run():Promise<{meta:{changes:number}}>;
  all<T=unknown>():Promise<{results:T[]}>;
}
interface D1Database {
  prepare(sql:string):D1PreparedStatement;
  batch(statements:D1PreparedStatement[]):Promise<Array<{meta:{changes:number}}>>;
}
