// src/lib/poll-failure-policy.ts
//
// Functions: isPermanentPollFailure, isRateLimitFailure, pollRetryDelayMs
//
// Decides whether a failed poll should permanently stop a tracker, or merely
// slow it down.
//
// Background: the circuit breaker used to auto-pause any tracker after
// POLL_FAILURE_THRESHOLD consecutive failures, regardless of cause, and a
// paused tracker only resumes when a human clicks Resume. Since a failed poll
// leaves lastPolledAt untouched, a failing tracker is retried on every 5-minute
// scheduler tick, so four failures take only ~20 minutes to accumulate. A home
// internet outage of twenty minutes was therefore enough to permanently
// disable monitoring for every tracker at once, which is exactly what happened
// on 2026-08-16: all six trackers paused, nothing resumed them, and the fault
// went unnoticed for 33.5 hours because the container itself stayed up.
//
// The fix inverts the default. Only a failure a human must actually fix -- bad
// or expired credentials -- pauses a tracker. Everything else is assumed
// transient and retried forever under exponential backoff, so connectivity
// problems heal by themselves once the network returns.

/**
 * Failures that will never resolve on their own, because they need someone to
 * supply a new credential. Matched against the output of sanitizeNetworkError,
 * which has already normalised the raw error into a fixed set of phrases.
 */
const PERMANENT_FAILURES = [
  "Authentication failed",
  "Session expired",
  "Invalid credentials",
] as const

/**
 * Backoff bounds. The base matches the scheduler tick, so the first retry is
 * unchanged from the old behaviour and only sustained failure slows down. The
 * cap is the default poll interval -- during a long outage a tracker retries
 * hourly, which is frequent enough to recover promptly and quiet enough not to
 * hammer a tracker that may be rate-limiting us.
 */
export const POLL_RETRY_BASE_MS = 5 * 60 * 1000
export const POLL_RETRY_MAX_MS = 60 * 60 * 1000

export function isPermanentPollFailure(message: string | null | undefined): boolean {
  if (!message) return false
  return PERMANENT_FAILURES.some((phrase) => message.includes(phrase))
}

/**
 * A tracker that is rate-limiting or IP-banning us is transient -- it clears on
 * its own -- but retrying at the normal cadence is what caused it. These jump
 * straight to the maximum backoff instead of ramping up to it.
 */
export function isRateLimitFailure(message: string | null | undefined): boolean {
  if (!message) return false
  return /IP temporarily banned|rate.?limit/i.test(message)
}

/**
 * Exponential backoff for a tracker that keeps failing transiently.
 * 1 failure -> 5m, 2 -> 10m, 3 -> 20m, 4 -> 40m, 5 or more -> 60m.
 */
export function pollRetryDelayMs(
  consecutiveFailures: number,
  lastError?: string | null
): number {
  if (consecutiveFailures <= 0) return 0
  if (isRateLimitFailure(lastError)) return POLL_RETRY_MAX_MS
  // clamp the exponent before shifting so a large failure count can't overflow
  const steps = Math.min(consecutiveFailures - 1, 20)
  return Math.min(POLL_RETRY_BASE_MS * 2 ** steps, POLL_RETRY_MAX_MS)
}

/**
 * True when a tracker is still inside its backoff window and should be skipped
 * this cycle. A tracker with no recorded failures is always due.
 */
export function isWithinRetryBackoff(
  tracker: { consecutiveFailures: number; lastError?: string | null; lastErrorAt?: Date | string | null },
  now: number
): boolean {
  if (tracker.consecutiveFailures <= 0) return false
  if (!tracker.lastErrorAt) return false
  const lastErrorAt = new Date(tracker.lastErrorAt).getTime()
  if (!Number.isFinite(lastErrorAt)) return false
  return now - lastErrorAt < pollRetryDelayMs(tracker.consecutiveFailures, tracker.lastError)
}
