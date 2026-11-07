// Copied from KhmerX 77779ae lib/http/route.ts.
/**
 * Route wrapper: request id resolution, Origin enforcement, error classification.
 *
 * ARC-00 §4 – every handler returns a response whose X-Request-Id equals the
 * resolved request id; every failure body is {code, error, requestId, params?}.
 * Unknown exceptions become 500 INTERNAL_ERROR with the stack written to the
 * server log only (never to the client).
 */
import {assertAllowedOrigin} from '@/lib/request-security';
import {AuthError} from '@/lib/h5-auth-core';
import {KycError} from '@/lib/kyc/core';
import {ApiError} from './api-error';
import {resolveRequestId, attachRequestId, REQUEST_ID_HEADER} from './request-id';

type KnownError = {
  status: number;
  code: string;
  message: string;
  retryAfter?: number;
  params?: Record<string, unknown>;
};

function knownOf(e: unknown): KnownError | null {
  if (e instanceof ApiError) return {status: e.status, code: e.code, message: e.message, params: e.params, retryAfter: e.retryAfter};
  if (e instanceof AuthError) return {status: e.status, code: e.code, message: e.message, retryAfter: e.retryAfter};
  if (e instanceof KycError) return {status: e.status, code: e.code, message: e.message};
  return null;
}

/** Enforce the Origin allow-list; missing/foreign origins are rejected 403. */
export function requireOrigin(request: Request): void {
  try {
    assertAllowedOrigin(request, true);
  } catch {
    throw new ApiError(403, 'CROSS_SITE_REQUEST', '不允许跨站操作');
  }
}

/** Serialize an error into the ARC-00 failure envelope. */
export function errorResponse(e: unknown, requestId: string): Response {
  const known = knownOf(e);
  const isUnknown = known === null;
  const status = isUnknown ? 500 : known.status;
  const code = isUnknown ? 'INTERNAL_ERROR' : known.code;
  if (isUnknown) {
    // Full stack and correlation id go to the server log only (ARC-00 §8.3).
    console.error(`[http] ${requestId} 500 INTERNAL_ERROR`, e instanceof Error ? e.stack || e : e);
  }
  const body: Record<string, unknown> = {
    code,
    error: isUnknown ? '服务暂时不可用，请稍后重试' : known.message,
    requestId,
  };
  if (known) {
    if (known.retryAfter !== undefined) {
      body.retryAfter = known.retryAfter;
      body.params = {...known.params, retryAfterSeconds: known.retryAfter};
    } else if (known.params) {
      body.params = known.params;
    }
  }
  const headers = new Headers({'Cache-Control': 'no-store', 'Pragma': 'no-cache', [REQUEST_ID_HEADER]: requestId});
  if (known?.retryAfter !== undefined) headers.set('Retry-After', String(known.retryAfter));
  return Response.json(body, {status, headers});
}

/** Shared JSON body reader: origin, content-type, size and shape checks. */
export async function readJsonBody(request: Request, max = 4096): Promise<Record<string, unknown>> {
  requireOrigin(request);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'INVALID_REQUEST', '请求格式无效');
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > max) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求过大');
  }
  const raw = await request.text();
  if (raw.length > max) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求过大');
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST', '请求格式无效');
  }
}

export type RouteHandler = (request: Request) => Response | Promise<Response>;
export interface RouteOptions {
  handler: RouteHandler;
  /** Write interfaces must reject missing origins with 403 CROSS_SITE_REQUEST. */
  origin?: 'required';
}

export function route(options: RouteOptions) {
  return async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(request);
    attachRequestId(request, requestId);
    try {
      if (options.origin === 'required') requireOrigin(request);
      const response = await options.handler(request);
      if (response.headers.get(REQUEST_ID_HEADER) === requestId) return response;
      const headers = new Headers(response.headers);
      headers.set(REQUEST_ID_HEADER, requestId);
      return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
    } catch (e) {
      return errorResponse(e, requestId);
    }
  };
}
