import {env} from 'cloudflare:workers';
import {readJsonBody,route} from '@/lib/http/route';
import {staffIdentity} from '@/lib/team/auth';
import {listDeadPartnerOutbox,requeuePartnerOutbox} from '@/lib/partner-outbox';

const db=()=> (env as unknown as {DB:D1Database}).DB;
export const GET=route({handler:async request=>listDeadPartnerOutbox(db(),await staffIdentity(db(),request.headers.get('cookie')))});
export const POST=route({origin:'required',handler:async request=>requeuePartnerOutbox(db(),await staffIdentity(db(),request.headers.get('cookie')),await readJsonBody(request))});
