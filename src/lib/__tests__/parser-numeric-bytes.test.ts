import { describe, expect, it } from "vitest"
import { parseBytes } from "@/lib/parser"

// Blutopia's UNIT3D returns raw byte counts as JSON numbers while Seed Pool and
// DarkPeers return formatted strings. Before this was handled, parseBytes threw
// "formatted.trim is not a function" and the UI reported a misleading
// "tracker test failed" that looked like a rejected API key.
describe("parseBytes with numeric input", () => {
  it("accepts the exact values Blutopia's /api/user returned", () => {
    expect(parseBytes(53687091200)).toBe(53687091200n) // 50 GiB uploaded
    expect(parseBytes(1073741824)).toBe(1073741824n) // 1 GiB downloaded
    expect(parseBytes(133143986176)).toBe(133143986176n) // 124 GiB buffer
  })

  it("still parses the formatted strings other UNIT3D sites send", () => {
    expect(parseBytes("50 GiB")).toBe(53687091200n)
    expect(parseBytes("1 GiB")).toBe(1073741824n)
  })

  it("treats zero and truncates fractional byte counts", () => {
    expect(parseBytes(0)).toBe(0n)
    expect(parseBytes(1024.9)).toBe(1024n)
  })

  it("rejects negative numbers the same way it rejects negative strings", () => {
    expect(() => parseBytes(-1)).toThrow(/Negative byte values/)
  })

  it("returns zero for non-finite numbers rather than throwing on BigInt()", () => {
    expect(parseBytes(Number.POSITIVE_INFINITY)).toBe(0n)
    expect(parseBytes(Number.NaN)).toBe(0n)
  })
})
