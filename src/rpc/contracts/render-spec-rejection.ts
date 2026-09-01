import { loadRejectionCases, type RejectionCase } from "./rejection-cases.js";

/**
 * Phase 3 typed rejection loader — wraps the shared JSON harness
 * (D-29) with a closed-typed facade. The Python parametrize suite
 * reads the same fixture file; vitest and pytest stay one source.
 *
 * The wrapper exists because the rejection harness lives in
 * `rejection-cases.ts` which Phase 1/2 callers still import; adding
 * the optional `expect_code` typing there would force every older
 * caller to also know about it. The Phase 3 surface keeps the
 * inheritance behind a typed loader.
 */

export type Phase3RejectionCaseContract = "render-spec" | "lottie-json";

export interface Phase3RejectionCase extends RejectionCase {
  /** Closed RPC code the gate is expected to emit; null when omitted. */
  readonly expect_code: import("./rejection-cases.js").RejectionExpectCode | null;
}

/**
 * Load every Phase 3 rejection case from the shared JSON harness.
 * The wrapper pins the contract name to the literal the callers use
 * (no stringly-typed mistakes), and returns the same-case shape with
 * the `expect_code` field already validated against the closed enum.
 *
 * The loader fails loud at import-time if the contract name is not a
 * member of the Phase 3 surface (`render-spec` | `lottie-json`) — a
 * generic over `K` would force every caller to know the type system
 * is transparent. Static error surface keeps the contract literal.
 */
export function loadRenderSpecRejectionCases(
  contract: Phase3RejectionCaseContract,
): Phase3RejectionCase[] {
  return loadRejectionCases(contract) as Phase3RejectionCase[];
}
