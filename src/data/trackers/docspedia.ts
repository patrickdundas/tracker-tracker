// src/data/trackers/docspedia.ts

import type { TrackerRegistryEntry } from "@/data/tracker-registry"

export const docspedia: TrackerRegistryEntry = {
  // ── Identity ────────────────────────────────────────────────────────
  slug: "docspedia",
  name: "DocsPedia",
  abbreviation: "DP",
  url: "https://www.docspedia.world",
  description:
    "Invite-only tracker for documents, ebooks and educational material. Runs TBDev with an XBT tracker backend.",

  // ── Platform & API ──────────────────────────────────────────────────
  platform: "tbdev",
  apiPath: "/userdetails.php",

  // ── Content ─────────────────────────────────────────────────────────
  specialty: "Books",
  contentCategories: ["Books"],
  language: "English",

  // ── Visual ──────────────────────────────────────────────────────────
  color: "#8b6f47",
  logo: "",

  // ── External Links ──────────────────────────────────────────────────
  trackerHubSlug: "",
  statusPageUrl: "",

  // ── Community ───────────────────────────────────────────────────────
  userClasses: [],
  releaseGroups: [],
  bannedGroups: [],
  notableMembers: [],

  // ── Rules ───────────────────────────────────────────────────────────
  rules: {
    // "Low ratio may result in severe consequences, including banning in extreme
    // cases (low ratio <0.4 and more than 25GB downloads)." The 0.4 figure is the
    // ban threshold, not a target — the site also asks for 1:1 on every torrent.
    minimumRatio: 0.4,
    // "Torrents must be seeded at least 48 hours or until ratio 1:1!"
    seedTimeHours: 48,
    // "Accounts without activity in the first 28 days will be deleted automatically
    // by the system." Stated for the first 28 days; treated as a standing interval
    // because the downside of logging in too often is nil.
    loginIntervalDays: 28,
  },

  // ── Status ──────────────────────────────────────────────────────────
  warning: false,
  warningNote: "",

  // ── Flags ───────────────────────────────────────────────────────────
  draft: false,
  supportsTransitPapers: false,
  profileUrlPattern: "/userdetails.php?id={userId}",
}
