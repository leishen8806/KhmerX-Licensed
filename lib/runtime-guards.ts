// Copied from KhmerX 77779ae lib/runtime-guards.ts.
import {env} from 'cloudflare:workers';

/**
 * Single point of truth for the test-mode switch and the production marker (S3).
 *
 * KHMERX_TEST_MODE simultaneously lowers MFA step-up, dual-control approvals,
 * file scanning and password issuance guards in lib/team/server.ts and
 * lib/kyc/server.ts. Production is detected with the same semantic the rest
 * of the worker already uses (PAYEASE_IDENTITY_PROOF_REQUIRED=true, see
 * app/chatgpt-auth.ts); deploy/standalone/server.mjs additionally refuses to
 * boot while KHMERX_TEST_MODE=true. Keeping the reads here makes the blast
 * radius auditable and lets a readiness probe advertise the runtime state.
 */
export function isTestMode(): boolean {
  return (env as unknown as Record<string, unknown>).KHMERX_TEST_MODE === 'true';
}

export function isProduction(): boolean {
  return (env as unknown as Record<string, unknown>).PAYEASE_IDENTITY_PROOF_REQUIRED === 'true';
}

/** Refuse to run a production worker that still has the test-mode switch on. */
export function assertProductionSafe(): void {
  if (isTestMode() && isProduction()) {
    throw new Error('KHMERX_TEST_MODE must be disabled while PAYEASE_IDENTITY_PROOF_REQUIRED=true');
  }
}

/** Readiness-facing snapshot of the runtime guards. */
export function runtimeGuardStatus(): {testMode: boolean; production: boolean; blocked: boolean} {
  const testMode = isTestMode();
  const production = isProduction();
  return {testMode, production, blocked: testMode && production};
}
