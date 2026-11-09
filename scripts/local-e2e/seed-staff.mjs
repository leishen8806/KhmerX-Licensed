import {DatabaseSync} from 'node:sqlite';
import {existsSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makePassword,protectMfaSecret} from '../../lib/team/auth.ts';

if(String(process.env.PAYEASE_ENV||'').toLowerCase()!=='local')throw new Error('seed-staff requires PAYEASE_ENV=local');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dir=join(root,'.wrangler','state','v3','d1','miniflare-D1DatabaseObject');
if(!existsSync(dir))throw new Error('local D1 state not found; run npm run migrate:local first');
let db;
for(const file of readdirSync(dir)){if(!file.endsWith('.sqlite'))continue;const candidate=new DatabaseSync(join(dir,file));if(candidate.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='team_members'").get()){db=candidate;break;}candidate.close();}
if(!db)throw new Error('local D1 with team_members not found; run npm run migrate:local first');
const authSecret=String(process.env.PAYEASE_AUTH_SECRET||'');if(authSecret.length<32)throw new Error('PAYEASE_AUTH_SECRET must be at least 32 characters');
const password=`Synthetic-${crypto.randomUUID().slice(0,8)}!`;
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const randomBase32=()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));let out='';for(const byte of bytes)out+=alphabet[byte%alphabet.length];return out;};
const stamp=new Date().toISOString();
const staff=[['lender@example.test','lender'],['checker@example.test','checker'],['admin@example.test','admin']];
for(const [email,role] of staff){
 const mfaSecret=randomBase32();
 const id=crypto.randomUUID(),hash=await makePassword(password),protectedSecret=await protectMfaSecret(mfaSecret,authSecret);
 db.prepare('INSERT INTO team_members (id,email,role,active,version,mfa_enabled,mfa_secret,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET active=1,role=excluded.role,mfa_enabled=1,mfa_secret=excluded.mfa_secret,updated_at=excluded.updated_at').run(id,email,role,1,1,1,protectedSecret,stamp,stamp);
 const member=db.prepare('SELECT id FROM team_members WHERE email=?').get(email);
 db.prepare('INSERT INTO team_staff_credentials (member_id,password_hash,version,updated_at) VALUES (?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at').run(member.id,hash,1,stamp);
 console.log(JSON.stringify({email,role,password,mfaSecret}));
}
db.close();
