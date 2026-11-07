// Copied from KhmerX 77779ae lib/http/api-error.ts.
/**
 * Explicit server-side API error carrying a stable machine code (ARC-00 §4).
 *
 * Unknown exceptions must never be turned into ApiError; the route wrapper
 * classifies them as INTERNAL_ERROR/500 and logs the stack server-side only.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly params?: Record<string, unknown>;
  readonly retryAfter?: number;
  constructor(
    status: number,
    code: string,
    message: string,
    params?: Record<string, unknown>,
    retryAfter?: number,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
    this.retryAfter = retryAfter;
  }
}
