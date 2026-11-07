// Copied from KhmerX 77779ae lib/request-security.ts.
import {env} from 'cloudflare:workers';

/**
 * Origin policy shared by the browser-facing API handlers.
 *
 * Behind a reverse proxy request.url can contain the private upstream origin,
 * so deriving the allow-list from request.url is unsafe and breaks legitimate
 * production requests. PAYEASE_ALLOWED_ORIGINS is a comma-separated exact
 * allow-list. Local development keeps the old same-origin fallback when the
 * variable is absent.
 */
export function allowedOrigins(request:Request):Set<string>{
 const configured=String((env as unknown as Record<string,unknown>).PAYEASE_ALLOWED_ORIGINS||'')
  .split(',').map(value=>value.trim()).filter(Boolean);
 if(configured.length)return new Set(configured);
 // Standalone deployments may provide bindings through an external config
 // file that predates PAYEASE_ALLOWED_ORIGINS. Keep the production origins
 // explicit so reverse-proxy requests remain valid without opening CORS.
 return new Set([
  new URL(request.url).origin,
  'https://admin.khmerx.org',
  'https://payease.khmerx.org',
 ]);
}

export function assertAllowedOrigin(request:Request,required=true){
 const origin=request.headers.get('origin');
 if(!origin){if(required)throw new Error('MISSING_ORIGIN');return;}
 if(!allowedOrigins(request).has(origin))throw new Error('CROSS_SITE_REQUEST');
}
