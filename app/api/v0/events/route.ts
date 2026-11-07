import {env} from 'cloudflare:workers';
import {handleEvent} from '@/lib/licensed-events';

export async function POST(request:Request){return handleEvent(request,env);}
