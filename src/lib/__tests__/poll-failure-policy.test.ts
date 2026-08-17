import { describe, expect, it } from "vitest"
import {
  isPermanentPollFailure,
  isRateLimitFailure,
  isWithinRetryBackoff,
  POLL_RETRY_BASE_MS,
  POLL_RETRY_MAX_MS,
  pollRetryDelayMs,
} from "@/lib/poll-failure-policy"

describe("isPermanentPollFailure", () => {
  it.each(["Authentication failed", "Session expired", "Invalid credentials"])(
    "treats %s as permanent",
    (msg) => {
      expect(isPermanentPollFailure(msg)).toBe(true)
    }
  )

  // These are exactly the messages the 2026-08-16 outage produced. If any of
  // them ever pauses a tracker again, monitoring can blind itself on a blip.
  it.each([
    "Poll failed",
    "Request timed out",
    "Connection refused",
    "Host not found",
    "Host unreachable",
    "Connection reset",
    "Proxy connection failed",
    "API returned 500",
  ])("treats %s as transient", (msg) => {
    expect(isPermanentPollFailure(msg)).toBe(false)
  })

  it("handles null and empty messages", () => {
    expect(isPermanentPollFailure(null)).toBe(false)
    expect(isPermanentPollFailure(undefined)).toBe(false)
    expect(isPermanentPollFailure("")).toBe(false)
  })
})

describe("isRateLimitFailure", () => {
  it("detects tracker-side throttling", () => {
    expect(isRateLimitFailure("IP temporarily banned by tracker")).toBe(true)
    expect(isRateLimitFailure("rate limit exceeded")).toBe(true)
    expect(isRateLimitFailure("Request timed out")).toBe(false)
  })
})

describe("pollRetryDelayMs", () => {
  it("doubles per failure up to the cap", () => {
    expect(pollRetryDelayMs(1)).toBe(POLL_RETRY_BASE_MS)
    expect(pollRetryDelayMs(2)).toBe(POLL_RETRY_BASE_MS * 2)
    expect(pollRetryDelayMs(3)).toBe(POLL_RETRY_BASE_MS * 4)
    expect(pollRetryDelayMs(4)).toBe(POLL_RETRY_BASE_MS * 8)
    expect(pollRetryDelayMs(5)).toBe(POLL_RETRY_MAX_MS)
  })

  it("never exceeds the cap, even for absurd failure counts", () => {
    expect(pollRetryDelayMs(500)).toBe(POLL_RETRY_MAX_MS)
    expect(Number.isFinite(pollRetryDelayMs(500))).toBe(true)
  })

  it("returns zero when there are no failures", () => {
    expect(pollRetryDelayMs(0)).toBe(0)
    expect(pollRetryDelayMs(-3)).toBe(0)
  })

  it("sends rate-limit failures straight to the cap", () => {
    expect(pollRetryDelayMs(1, "IP temporarily banned by tracker")).toBe(POLL_RETRY_MAX_MS)
  })
})

describe("isWithinRetryBackoff", () => {
  const now = Date.UTC(2026, 7, 17, 12, 0, 0)

  it("is never in backoff with a clean record", () => {
    expect(
      isWithinRetryBackoff({ consecutiveFailures: 0, lastErrorAt: new Date(now) }, now)
    ).toBe(false)
  })

  it("blocks a retry inside the window and allows it after", () => {
    const tracker = {
      consecutiveFailures: 3, // 20 minute backoff
      lastError: "Request timed out",
      lastErrorAt: new Date(now - 19 * 60_000),
    }
    expect(isWithinRetryBackoff(tracker, now)).toBe(true)
    expect(isWithinRetryBackoff({ ...tracker, lastErrorAt: new Date(now - 21 * 60_000) }, now)).toBe(
      false
    )
  })

  it("stays due when lastErrorAt is missing or unparseable", () => {
    expect(isWithinRetryBackoff({ consecutiveFailures: 3, lastErrorAt: null }, now)).toBe(false)
    expect(isWithinRetryBackoff({ consecutiveFailures: 3, lastErrorAt: "nonsense" }, now)).toBe(
      false
    )
  })

  it("recovers within an hour of a long outage ending", () => {
    // 40 consecutive failures pins the delay at the 60 minute cap, so the
    // tracker still gets an attempt every hour and heals on its own.
    const tracker = {
      consecutiveFailures: 40,
      lastError: "Poll failed",
      lastErrorAt: new Date(now - 61 * 60_000),
    }
    expect(isWithinRetryBackoff(tracker, now)).toBe(false)
  })
})
