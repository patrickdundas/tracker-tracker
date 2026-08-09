// src/lib/adapters/tbdev.test.ts

import { describe, expect, it } from "vitest"
import { parseTbdevBytes, parseTbdevCredentials, parseTbdevProfile } from "./tbdev"

// Trimmed from a real DocsPedia.world /userdetails.php response (TBDev), 2026-08-08.
// Secrets scrubbed; the Passkey row is empty on the real page too.
const PROFILE_HTML = `<!DOCTYPE html><html><head>
<meta name='generator' content='TBDev.net' />
<title>DocsPedia.world :: Details for evergreen99</title>
</head><body>
<div class='statusbar'>
  <div>Welcome back <a href='/userdetails.php?id=25971'><span>evergreen99</span></a> [User]</div>
  <div><a href='/mybonus.php'> 200.0</a>
       <a href='/invite.php'> Invites 1</a></div>
  <div>
    <span><font color='#2471ff'>Ratio</font>&nbsp;1.25</span>
    <span> Seeding: 12</span>
    <span>Leeching: 3</span>
  </div>
</div>
<table class='main'><tr><td class='embedded'><h1 style='margin:0px'>evergreen99</h1></td></tr></table>
<table width='100%' border='1'>
  <tr><td class='rowhead' width='1%'>Join&nbsp;date</td><td align='left'>Jul 28 2026, 02:40 AM</td></tr>
  <tr><td class='rowhead'>Last&nbsp;seen</td><td align='left'>&lt; 1 minute ago</td></tr>
  <tr><td class='rowhead'>Passkey</td><td align='left'></td></tr>
  <tr><td class='rowhead'>Uploaded</td><td align='left'>12.50 GB</td></tr>
  <tr><td class='rowhead'>Downloaded</td><td align='left'>10.00 GB</td></tr>
  <tr><td class='rowhead'>Buffer</td><td align='left'>2.50 GB</td></tr>
  <tr><td class='rowhead'>Class</td><td align='left'>Power User</td></tr>
  <tr><td class='rowhead'>Karma points</td><td align='left'>200</td></tr>
</table></body></html>`

// The account as it actually stood on 2026-08-08: brand new, everything zero.
const FRESH_HTML = PROFILE_HTML.replace("12.50 GB", "0.00 kB")
  .replace("10.00 GB", "0.00 kB")
  .replace("2.50 GB", "0.00 kB")
  .replace("&nbsp;1.25", "&nbsp;0.00")
  .replace("Seeding: 12", "Seeding: 0")
  .replace("Leeching: 3", "Leeching: 0")
  .replace("Power User", "User")

describe("parseTbdevBytes", () => {
  it("treats TBDev's decimal labels as binary units", () => {
    // TBDev's mksize() divides by 1024 but writes "GB", so 1.00 GB is one GiB.
    expect(parseTbdevBytes("1.00 GB")).toBe(1073741824n)
    expect(parseTbdevBytes("1.00 MB")).toBe(1048576n)
    expect(parseTbdevBytes("1.00 TB")).toBe(1099511627776n)
  })

  it("accepts the lowercase kB that parseBytes rejects outright", () => {
    expect(parseTbdevBytes("1.00 kB")).toBe(1024n)
    expect(parseTbdevBytes("0.00 kB")).toBe(0n)
  })

  it("handles nbsp separators, thousands commas and plain bytes", () => {
    expect(parseTbdevBytes("512 B")).toBe(512n)
    expect(parseTbdevBytes("1,024.00 kB")).toBe(1048576n)
  })

  it("returns zero for empty input and throws on garbage", () => {
    expect(parseTbdevBytes("")).toBe(0n)
    expect(() => parseTbdevBytes("lots")).toThrow(/Invalid TBDev byte format/)
    expect(() => parseTbdevBytes("5 parsecs")).toThrow(/Unknown TBDev unit/)
  })
})

describe("parseTbdevCredentials", () => {
  it("derives the user id from a site-prefixed uid cookie", () => {
    const creds = parseTbdevCredentials(
      JSON.stringify({ cookie: "doccook_uid=25971; doccook_pass=abc; PHPSESSID=xyz" })
    )
    expect(creds.userId).toBe("25971")
    expect(creds.cookie).toContain("PHPSESSID=xyz")
  })

  it("also handles a bare uid cookie from stock TBDev", () => {
    expect(parseTbdevCredentials(JSON.stringify({ cookie: "uid=42; pass=abc" })).userId).toBe("42")
  })

  it("prefers an explicit userId over the cookie", () => {
    const creds = parseTbdevCredentials(
      JSON.stringify({ cookie: "doccook_uid=25971; pass=abc", userId: "999" })
    )
    expect(creds.userId).toBe("999")
  })

  it("does not mistake other cookies for the uid", () => {
    // `doccook_hash` ends in neither `uid` nor `_uid`; a loose match would grab it.
    expect(() =>
      parseTbdevCredentials(JSON.stringify({ cookie: "doccook_hash=deadbeef; PHPSESSID=xyz" }))
    ).toThrow(/could not determine userId/)
  })

  it("rejects empty, malformed and non-numeric input", () => {
    expect(() => parseTbdevCredentials("not json")).toThrow(/must be a JSON object/)
    expect(() => parseTbdevCredentials(JSON.stringify({ cookie: "  " }))).toThrow(
      /cookie cannot be empty/
    )
    expect(() =>
      parseTbdevCredentials(JSON.stringify({ cookie: "uid=1", userId: "abc" }))
    ).toThrow(/must be numeric/)
  })
})

describe("parseTbdevProfile", () => {
  it("reads the full profile", () => {
    const stats = parseTbdevProfile(PROFILE_HTML)
    expect(stats.username).toBe("evergreen99")
    expect(stats.group).toBe("Power User")
    expect(stats.uploadedBytes).toBe(13421772800n) // 12.50 GiB
    expect(stats.downloadedBytes).toBe(10737418240n) // 10.00 GiB
    expect(stats.bufferBytes).toBe(2684354560n)
    expect(stats.ratio).toBeCloseTo(1.25)
    expect(stats.seedingCount).toBe(12)
    expect(stats.leechingCount).toBe(3)
    expect(stats.seedbonus).toBe(200)
  })

  it("reports hitAndRuns as unknown, not zero", () => {
    // Stock TBDev has no HnR accounting; 0 would falsely assert a clean record.
    expect(parseTbdevProfile(PROFILE_HTML).hitAndRuns).toBeNull()
  })

  it("parses the real day-one account without throwing on 0.00 kB", () => {
    const stats = parseTbdevProfile(FRESH_HTML)
    expect(stats.uploadedBytes).toBe(0n)
    expect(stats.downloadedBytes).toBe(0n)
    expect(stats.ratio).toBe(0)
    expect(stats.seedingCount).toBe(0)
    expect(stats.group).toBe("User")
    expect(stats.seedbonus).toBe(200)
  })

  it("falls back to the page title when the h1 is missing", () => {
    const noH1 = PROFILE_HTML.replace(
      "<h1 style='margin:0px'>evergreen99</h1>",
      "<span>evergreen99</span>"
    )
    expect(parseTbdevProfile(noH1).username).toBe("evergreen99")
  })

  it("computes ratio from bytes when the header status bar is absent", () => {
    const noHeader = PROFILE_HTML.replace(/<div class='statusbar'>[\s\S]*?<\/div>\n<table/, "<table")
    const stats = parseTbdevProfile(noHeader)
    expect(stats.ratio).toBeCloseTo(1.25)
  })

  it("rejects an unauthenticated page instead of reporting zeroes", () => {
    const login = `<html><head><title>DocsPedia.world :: Login</title></head>
      <body><form><input name='password' type='password'/></form></body></html>`
    expect(() => parseTbdevProfile(login)).toThrow(/Session expired/)
  })

  it("throws when the details table is missing entirely", () => {
    expect(() => parseTbdevProfile("<html><body><p>nothing here</p></body></html>")).toThrow(
      /Could not find profile stats/
    )
  })
})
