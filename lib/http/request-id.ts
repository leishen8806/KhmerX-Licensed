// Copied from KhmerX 77779ae lib/http/request-id.ts.
/** Request correlation id resolution (ARC-00 §1). */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const REQUEST_ID_HEADER = 'X-Request-Id';

const REQUEST_ID_KEY = Symbol.for('khmerx.http.requestId');

export function isValidRequestId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

/** Reuse a client-supplied valid UUID v4, otherwise mint a fresh one. */
export function resolveRequestId(request: Request): string {
  const header = request.headers.get(REQUEST_ID_HEADER.toLowerCase());
  return isValidRequestId(header) ? header.toLowerCase() : crypto.randomUUID();
}

export function attachRequestId(request: Request, requestId: string): void {
  Reflect.set(request, REQUEST_ID_KEY, requestId);
}

export function requestIdOf(request: Request): string | undefined {
  return Reflect.get(request, REQUEST_ID_KEY) as string | undefined;
}
// Copied from KhmerX 77779ae lib/http/request-id.ts.
