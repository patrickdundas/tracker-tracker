// src/data/trackers/simurg.ts

import type { TrackerRegistryEntry } from "@/data/tracker-registry"

export const simurg: TrackerRegistryEntry = {
  // ── Identity ────────────────────────────────────────────────────────
  slug: "simurg",
  name: "Simurg",
  abbreviation: "SMG",
  url: "https://simurg.world",
  description:
    "Small, curation-focused Gazelle tracker for books, audiobooks and comics, launched August 2026. Explicitly not trying to be MAM or Bibliotik — it aims for a hand-picked library rather than every book in existence. Whole catalogue is freeleech at launch and there is no minimum seed time.",

  // ── Platform & API ──────────────────────────────────────────────────
  platform: "gazelle",
  gazelleEnrich: true,
  apiPath: "/ajax.php",

  // ── Content ─────────────────────────────────────────────────────────
  specialty: "E-Books / Audiobooks",
  contentCategories: ["Books", "Audiobooks", "Comics"],
  language: "English",

  // ── Visual ──────────────────────────────────────────────────────────
  // Taken from the logo colour in the site's own public index.php.
  color: "#c8b89a",
  logo: "",

  // ── External Links ──────────────────────────────────────────────────
  trackerHubSlug: "",
  statusPageUrl: "",

  // ── Community ───────────────────────────────────────────────────────
  // Promotions are automatic and re-checked hourly. Requirements are
  // cumulative and must all be met at the same time. "Effective upload" is
  // tracker upload credit plus qualifying request-vote bounty.
  userClasses: [
    { name: "User", requirements: "Starting class. Can download, upload, vote on requests" },
    {
      name: "Member",
      requirements: "1 week, 10 GiB effective upload, 0.70 ratio",
      perks: [
        { type: "custom", label: "Requests, bookmarks, collages, ZIP collector" },
        { type: "invite", label: "May PURCHASE invites with BP (not granted free)" },
      ],
    },
    {
      name: "Power User",
      requirements: "2 weeks, 25 GiB effective upload, 1.05 ratio, 5 uploads",
      perks: [{ type: "custom", label: "Upload notifications, collages, polls, PU forum" }],
    },
    {
      name: "Elite",
      requirements: "4 weeks, 100 GiB effective upload, 1.05 ratio, 50 uploads",
      perks: [
        { type: "custom", label: "Edit torrent/release metadata, delete tags, Elite forum" },
        { type: "custom", label: "Access to the Invitations forum" },
      ],
    },
    {
      name: "Torrent Master",
      requirements: "8 weeks, 500 GiB effective upload, 1.05 ratio, 500 uploads",
      perks: [{ type: "custom", label: "TM forum, free custom title" }],
    },
    {
      name: "Power TM / Elite TM / Ultimate TM",
      requirements: "Exist but are not yet documented by the site",
    },
  ],
  releaseGroups: [],
  bannedGroups: [],
  notableMembers: [],

  // ── Rules ───────────────────────────────────────────────────────────
  rules: {
    // Not a target — this is the DEMOTION floor. Below 0.65 any class above
    // User is dropped back to User. Power User and above also drop to Member
    // below 0.95 ratio or under 25 GiB effective upload. The ratio you are
    // actually held to is personalised and shown live on the account.
    minimumRatio: 0.65,
    // Deliberately zero. "Seeding Rules: There aren't any." Simurg states it
    // has no minimum seed time and no cap on concurrent torrents. This is the
    // first tracker here where that is true, so do NOT copy a floor from
    // another entry.
    seedTimeHours: 0,
    // UNKNOWN, and deliberately not guessed. Accounts must log in regularly or
    // be disabled, and SEEDING DOES NOT COUNT as activity, but the threshold is
    // configurable and the wiki explicitly says to rely on the warning email
    // and current site notice rather than a copied number. Confirm on site and
    // set this properly.
    loginIntervalDays: 0,
    fullRulesMarkdown: [
      "## The one that changes how we run it",
      "",
      "**Rule 5.3 — freeleech autosnatching is PROHIBITED.** Not 'via approved tools',",
      "prohibited outright, with a dedicated Freeleech Autosnatching Policy article.",
      "Because the entire catalogue is currently freeleech, this effectively rules out",
      "autobrr for this tracker. Sister Gazelle sites carve out autodl-irssi/autobrr;",
      "**Simurg does not**. Manual adds only until the policy or the freeleech state changes.",
      "",
      "## Seeding",
      "",
      "- **No minimum seed time and no concurrent-torrent cap.** Stated outright.",
      "- No hit-and-run system. The adapter reports `hitAndRuns: null` for Gazelle anyway.",
      "- Credited seed time is cumulative observed hours, not an unbroken streak.",
      "  Going offline pauses accrual but never erases banked hours.",
      "- A torrent only counts if it is complete, loaded, active and able to announce.",
      "",
      "## Ratio",
      "",
      "- Required ratio is **personalised** — it depends on counted download volume and",
      "  how consistently you seed. Read the live value from the account, never assume.",
      "- The first 5 GiB of counted downloads is protected.",
      "- Falling below the required ratio starts a 2-week ratio watch. Downloading a",
      "  further 10 GiB while on watch removes leeching privileges early. The account",
      "  stays enabled and privileges return automatically once the ratio recovers.",
      "- Everything is freeleech at launch, so downloads do not currently count at all.",
      "  Upload still counts normally on a freeleech torrent.",
      "",
      "## Bonus points",
      "",
      "Simurg pays for *contribution and preservation*, not for volume — the opposite",
      "shape to MAM, where a big pile of seeded torrents is the whole game.",
      "",
      "- **1,000 BP per new upload**, immediately, same for books/audiobooks/comics.",
      "  That is also exactly the price of a freeleech token.",
      "- Seeding pays a floor of **0.05 BP/hour per torrent**, regardless of size.",
      "- Scarcity multiplier: last seeder 2.00x, 2 seeders 1.50x, 3-5 seeders 1.25x,",
      "  6+ seeders 1.00x.",
      "- Longevity multiplier on cumulative credited seed time: 1.00x to 30 days,",
      "  1.50x after 30, 2.00x after 90, 3.00x after 180, **5.00x after 365 days**.",
      "  These stack with scarcity.",
      "- A size-based reward is computed in parallel and the site pays **whichever is",
      "  higher**. The two are never added.",
      "",
      "Consequence for retention: never cycle Simurg torrents. Longevity multipliers",
      "reset the benefit of a re-add, and the tiny size of books makes holding them",
      "essentially free.",
      "",
      "## Automation and access",
      "",
      "- **API limit is 5 requests per 10-second window.** Hourly polling is far inside",
      "  this; the adapter's enrichment pause of 1.5s between its two calls is fine.",
      "- HTML scraping is prohibited. All automated access must go through the API.",
      "- Paid VPNs, self-hosted VPNs and seedbox-supplied VPNs are allowed.",
      "  **Free VPN/proxy services and Tor are not.**",
      "- Clients must be on the Client Whitelist, and a version being unlisted is not",
      "  the same as it being safe. Verify the qBittorrent version before adding.",
      "- Never edit a Simurg .torrent or merge its announce URL with another tracker's.",
      "  Cross-seeding is allowed only as separate .torrent files against the same payload.",
      "",
      "## Golden rules worth remembering",
      "",
      "- One account per person per lifetime. Never re-register, even if disabled.",
      "- Do not request invites. They may be offered in the Invites forum, which is",
      "  restricted to Elite and above.",
      "- Log in regularly. **Seeding is not a substitute for logging in.**",
      "- No AI-written books or AI-narrated audiobooks.",
    ],
  },

  // ── Status ──────────────────────────────────────────────────────────
  warning: false,
  warningNote: "",

  // ── Flags ───────────────────────────────────────────────────────────
  draft: false,
  supportsTransitPapers: false,
  profileUrlPattern: "/user.php?id={id}",
}
