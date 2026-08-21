// src/lib/adapters/unit3d.ts
import { parseBytes } from "@/lib/parser"
import { adapterFetch } from "./adapter-fetch"
import type { DebugApiCall, FetchOptions, TrackerAdapter, TrackerStats } from "./types"

// UNIT3D deployments disagree about the JSON types of these fields. Seed Pool
// and DarkPeers send formatted strings ("1.5 TiB", "2.31"); Blutopia sends bare
// numbers (uploaded: 53687091200, ratio: 50). Both shapes are valid UNIT3D, so
// the numeric ones are typed as unions and normalised below rather than being
// assumed to be strings.
interface Unit3dApiResponse {
  username: string
  group: string
  uploaded: string | number
  downloaded: string | number
  ratio: string | number
  buffer: string | number
  seeding: number
  leeching: number
  seedbonus: string | number
  hit_and_runs: number
}

/** parseFloat() only accepts a string; a UNIT3D number field is already one. */
function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value !== "string") return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export class Unit3dAdapter implements TrackerAdapter {
  async fetchStats(
    baseUrl: string,
    apiToken: string,
    apiPath: string,
    options?: FetchOptions
  ): Promise<TrackerStats> {
    const url = new URL(apiPath, baseUrl)
    const hostname = new URL(baseUrl).hostname

    const headers: Record<string, string> =
      options?.unit3dAuthStyle === "bearer" ? { Authorization: `Bearer ${apiToken}` } : {}

    if (options?.unit3dAuthStyle !== "bearer") {
      url.searchParams.set("api_token", apiToken)
    }

    const data = await adapterFetch<Unit3dApiResponse>(url.toString(), hostname, options, headers)

    return {
      username: data.username,
      group: data.group,
      uploadedBytes: parseBytes(data.uploaded),
      downloadedBytes: parseBytes(data.downloaded),
      ratio: toNumber(data.ratio),
      bufferBytes: parseBytes(data.buffer),
      seedingCount: data.seeding,
      leechingCount: data.leeching,
      seedbonus: toNumber(data.seedbonus),
      hitAndRuns: data.hit_and_runs,
      requiredRatio: null,
      warned: null,
      freeleechTokens: null,
    }
  }

  async fetchRaw(
    baseUrl: string,
    apiToken: string,
    apiPath: string,
    options?: FetchOptions
  ): Promise<DebugApiCall[]> {
    const url = new URL(apiPath, baseUrl)
    const hostname = new URL(baseUrl).hostname

    const headers: Record<string, string> =
      options?.unit3dAuthStyle === "bearer" ? { Authorization: `Bearer ${apiToken}` } : {}

    if (options?.unit3dAuthStyle !== "bearer") {
      url.searchParams.set("api_token", apiToken)
    }

    try {
      const data = await adapterFetch<Record<string, unknown>>(
        url.toString(),
        hostname,
        options,
        headers
      )
      return [{ label: "User Stats", endpoint: apiPath, data, error: null }]
    } catch (err) {
      return [
        {
          label: "User Stats",
          endpoint: apiPath,
          data: null,
          error: err instanceof Error ? err.message : "Request failed",
        },
      ]
    }
  }
}
