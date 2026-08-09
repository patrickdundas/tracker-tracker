// src/lib/adapters/tbdev.ts
//
// Functions: parseTbdevCredentials, parseTbdevBytes, parseTbdevProfile, TbdevAdapter
//
// TBDev is the classic PHP tracker codebase (tbdev.org). It exposes NO API, so stats
// come from scraping the logged-in /userdetails.php page.
//
// Auth is by session cookie rather than username/password, and that is deliberate:
// TBDev's login form carries a CAPTCHA, so a programmatic login is not possible. The
// cookies (TBDev sets a `*_uid` / `*_pass` / `*_hash` trio, prefix varies per site,
// plus PHPSESSID) are long-lived, so capturing them once from a browser is the
// practical way in.

import { type HTMLElement as ParsedElement, parse as parseHtml } from "node-html-parser"
import { computeBufferBytes } from "@/lib/data-transforms"
import { classifyFetchError, sanitizeNetworkError } from "@/lib/error-utils"
import { ADAPTER_FETCH_TIMEOUT_MS } from "@/lib/limits"
import { parseBytes } from "@/lib/parser"
import type { DebugApiCall, FetchOptions, TrackerAdapter, TrackerStats } from "./types"

// ---------------------------------------------------------------------------
// Credential handling
// ---------------------------------------------------------------------------

export interface TbdevCredentials {
  /** Raw Cookie header value, copied verbatim from a logged-in browser session. */
  cookie: string
  /** Numeric user id for /userdetails.php?id=… */
  userId: string
}

/**
 * Extract the user id from a TBDev cookie string.
 *
 * The cookie NAME is site-specific — DocsPedia uses `doccook_uid`, stock TBDev uses
 * `uid`, others prefix differently — so match on the suffix rather than a fixed name.
 */
function userIdFromCookie(cookie: string): string | null {
  for (const pair of cookie.split(";")) {
    const eq = pair.indexOf("=")
    if (eq === -1) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (/(^|_)uid$/i.test(name) && /^\d+$/.test(value)) return value
  }
  return null
}

export function parseTbdevCredentials(apiToken: string): TbdevCredentials {
  let parsed: unknown
  try {
    parsed = JSON.parse(apiToken)
  } catch {
    throw new Error(
      'TBDev credentials must be a JSON object, e.g. {"cookie": "uid=123; pass=abc; PHPSESSID=xyz"}'
    )
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("TBDev credentials must be a JSON object with a cookie field")
  }

  const raw = parsed as Record<string, unknown>
  const cookie = typeof raw.cookie === "string" ? raw.cookie.trim() : ""
  if (!cookie) {
    throw new Error("TBDev credentials: cookie cannot be empty")
  }

  const explicitId =
    typeof raw.userId === "string"
      ? raw.userId.trim()
      : typeof raw.userId === "number"
        ? String(raw.userId)
        : ""

  const userId = explicitId || userIdFromCookie(cookie) || ""
  if (!userId) {
    throw new Error(
      "TBDev credentials: could not determine userId — add it explicitly, " +
        'e.g. {"cookie": "…", "userId": "12345"}'
    )
  }
  if (!/^\d+$/.test(userId)) {
    throw new Error(`TBDev credentials: userId must be numeric (got "${userId}")`)
  }

  return { cookie, userId }
}

// ---------------------------------------------------------------------------
// Byte parsing — TBDev's units are binary despite decimal labels
// ---------------------------------------------------------------------------

/**
 * TBDev's mksize() divides by 1024 at every step but labels the result kB/MB/GB/TB:
 *
 *   $bytes/1024              -> " kB"
 *   $bytes/1048576           -> " MB"
 *
 * So a TBDev "1.00 GB" is 1 GiB, not 10^9 bytes. Routing that through parseBytes()
 * unchanged would read it against the DECIMAL table and under-report by ~7% at GB and
 * ~10% at TB. Remap to the binary units before parsing.
 *
 * (parseBytes is also case-sensitive and has no "kB" entry at all, so the lowercase-k
 * form TBDev emits would otherwise throw outright.)
 */
export function parseTbdevBytes(text: string): bigint {
  const trimmed = text.replace(/ /g, " ").trim()
  if (!trimmed) return 0n

  const match = trimmed.match(/^([\d.,]+)\s*([A-Za-z]+)$/)
  if (!match) throw new Error(`Invalid TBDev byte format: "${text}"`)

  const value = match[1].replace(/,/g, "")
  const unit = match[2].toLowerCase()

  const BINARY: Record<string, string> = {
    b: "B",
    kb: "KiB",
    mb: "MiB",
    gb: "GiB",
    tb: "TiB",
    kib: "KiB",
    mib: "MiB",
    gib: "GiB",
    tib: "TiB",
  }

  const mapped = BINARY[unit]
  if (!mapped) throw new Error(`Unknown TBDev unit: "${match[2]}"`)

  return parseBytes(`${value} ${mapped}`)
}

// ---------------------------------------------------------------------------
// Profile page parser
// ---------------------------------------------------------------------------

/** Collapse &nbsp; and runs of whitespace so label matching is stable. */
function norm(s: string | undefined): string {
  return (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim()
}

/**
 * TBDev's userdetails.php body is a two-column table of `<td class="rowhead">Label</td>`
 * followed by the value cell. Labels contain &nbsp; ("Join&nbsp;date"), hence norm().
 */
function buildRowMap(doc: ParsedElement): Map<string, string> {
  const rows = new Map<string, string>()
  for (const tr of doc.querySelectorAll("tr")) {
    const cells = tr.querySelectorAll("td")
    if (cells.length < 2) continue
    const label = norm(cells[0].textContent).toLowerCase()
    if (!label) continue
    if (!rows.has(label)) rows.set(label, norm(cells[1].textContent))
  }
  return rows
}

export function parseTbdevProfile(html: string): TrackerStats {
  // Not authenticated: TBDev bounces to login.php, and the details table never renders.
  if (/<title>[^<]*login/i.test(html) || /name=['"]password['"]/i.test(html)) {
    throw new Error("Session expired — TBDev cookies need to be refreshed")
  }

  const doc = parseHtml(html)
  const rows = buildRowMap(doc)

  if (!rows.has("uploaded") && !rows.has("downloaded")) {
    throw new Error(
      "Could not find profile stats on TBDev page — the page may not be authenticated"
    )
  }

  // Username: the <h1> above the table. Fall back to the page title, which reads
  // "<site> :: Details for <username>".
  let username = norm(doc.querySelector("h1")?.textContent)
  if (!username) {
    const title = norm(doc.querySelector("title")?.textContent)
    username = title.match(/details for\s+(.+)$/i)?.[1]?.trim() ?? ""
  }

  const uploadedBytes = rows.get("uploaded") ? parseTbdevBytes(rows.get("uploaded") as string) : 0n
  const downloadedBytes = rows.get("downloaded")
    ? parseTbdevBytes(rows.get("downloaded") as string)
    : 0n

  // The details table has no ratio row — it lives in the header status bar. Compute
  // from uploaded/downloaded when the header is absent or unparseable.
  const bodyText = norm(doc.textContent)
  let ratio = 0
  const ratioMatch = bodyText.match(/Ratio\s*([\d.]+)/i)
  if (ratioMatch) {
    ratio = parseFloat(ratioMatch[1]) || 0
  } else if (downloadedBytes > 0n) {
    ratio = Number(uploadedBytes) / Number(downloadedBytes)
  }

  // Seeding/leeching also come from the header status bar.
  const seedingCount = parseInt(bodyText.match(/Seeding:\s*(\d[\d,]*)/i)?.[1]?.replace(/,/g, "") ?? "0", 10)
  const leechingCount = parseInt(bodyText.match(/Leeching:\s*(\d[\d,]*)/i)?.[1]?.replace(/,/g, "") ?? "0", 10)

  // TBDev's bonus-point system is "karma points" (mybonus.php).
  const karma = rows.get("karma points") ?? ""
  const seedbonus = karma ? parseFloat(karma.replace(/,/g, "")) || 0 : 0

  const group = rows.get("class") || "User"

  return {
    username,
    group,
    uploadedBytes,
    downloadedBytes,
    ratio,
    bufferBytes: computeBufferBytes(uploadedBytes, downloadedBytes),
    seedingCount: Number.isFinite(seedingCount) ? seedingCount : 0,
    leechingCount: Number.isFinite(leechingCount) ? leechingCount : 0,
    seedbonus,
    // Stock TBDev has no hit-and-run accounting at all — there is no counter on the
    // profile page to read. null (not 0) so the dashboard shows "unknown" rather than
    // asserting a clean record this tracker cannot actually vouch for.
    hitAndRuns: null,
    requiredRatio: null,
    warned: null,
    freeleechTokens: null,
  }
}

// ---------------------------------------------------------------------------
// HTML fetcher
// ---------------------------------------------------------------------------

async function fetchHtml(
  url: string,
  cookies: string,
  proxyAgent?: FetchOptions["proxyAgent"]
): Promise<string> {
  const headers: Record<string, string> = {
    Cookie: cookies,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  }

  if (proxyAgent) {
    const { proxyFetch } = await import("@/lib/tunnel")
    const result = await proxyFetch(url, proxyAgent, { headers })
    if (!result.ok) {
      throw new Error(
        sanitizeNetworkError(
          `${result.status} ${result.statusText}`,
          `TBDev page fetch failed: ${result.status}`
        )
      )
    }
    return (await result.buffer()).toString("utf8")
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(ADAPTER_FETCH_TIMEOUT_MS),
      redirect: "manual",
    })
  } catch (err) {
    throw classifyFetchError(err, new URL(url).hostname)
  }

  // TBDev answers an unauthenticated request with a redirect to login.php.
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Session expired — TBDev cookies need to be refreshed")
  }

  if (!response.ok) {
    throw new Error(
      sanitizeNetworkError(
        `${response.status} ${response.statusText}`,
        `TBDev page fetch failed: ${response.status}`
      )
    )
  }

  return response.text()
}

// ---------------------------------------------------------------------------
// Adapter class
// ---------------------------------------------------------------------------

export class TbdevAdapter implements TrackerAdapter {
  async fetchStats(
    baseUrl: string,
    apiToken: string,
    apiPath: string,
    options?: FetchOptions
  ): Promise<TrackerStats> {
    const creds = parseTbdevCredentials(apiToken)
    const path = apiPath || "/userdetails.php"
    const url = `${baseUrl}${path}?id=${encodeURIComponent(creds.userId)}`
    const html = await fetchHtml(url, creds.cookie, options?.proxyAgent)
    return parseTbdevProfile(html)
  }

  async fetchRaw(
    baseUrl: string,
    apiToken: string,
    apiPath: string,
    options?: FetchOptions
  ): Promise<DebugApiCall[]> {
    const calls: DebugApiCall[] = []
    let endpoint = apiPath || "/userdetails.php"

    try {
      const creds = parseTbdevCredentials(apiToken)
      endpoint = `${endpoint}?id=${creds.userId}`
      const html = await fetchHtml(`${baseUrl}${endpoint}`, creds.cookie, options?.proxyAgent)
      const stats = parseTbdevProfile(html)
      calls.push({ label: "User Details", endpoint, data: stats, error: null })
    } catch (err) {
      calls.push({
        label: "User Details",
        endpoint,
        data: null,
        error: err instanceof Error ? err.message : "Request failed",
      })
    }

    return calls
  }
}
