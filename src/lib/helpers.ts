export function formatHeight(inches: number | null): string {
  if (!inches) return "—";
  const feet = Math.floor(inches / 12);
  const remaining = inches % 12;
  return `${feet}'${remaining}"`;
}

export function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Parse a YYYY-MM-DD string as a local date (no timezone shift)
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Mirrors the database's `match_release_date` function: a match's result becomes
 * public the day AFTER it's played, plus one extra day for every 720 minutes
 * (12 hours) of snitch-catch time — so unusually long matches that run past
 * midnight (or well beyond) don't leak a same-day/next-day score before it's
 * really final. Keep this in sync with supabase/migrations if that function changes.
 */
export function matchReleaseDate(matchday: string, snitchCaughtTime: number | null): Date {
  const d = parseLocalDate(matchday);
  const extraDays = 1 + Math.floor((snitchCaughtTime ?? 0) / 720);
  d.setDate(d.getDate() + extraDays);
  return d;
}

/**
 * Whether a match's result/statistics should be visible yet. Mirrors
 * `match_release_date` — see above. `results` rows are also protected by a
 * matching RLS policy in the database, but the frontend re-checks this
 * independently wherever it aggregates or lists matches client-side (e.g. the
 * schedule calendar, the score ticker) so an admin-preview session — which
 * intentionally bypasses that RLS policy to allow reviewing draft results —
 * never leaks an unreleased score into a page a regular visitor would also see.
 */
export function isMatchReleased(matchday: string | null | undefined, snitchCaughtTime: number | null, now: Date = new Date()): boolean {
  if (!matchday) return false;
  const release = matchReleaseDate(matchday, snitchCaughtTime);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return release.getTime() <= today.getTime();
}

/**
 * Whether an entire domestic (round-robin) season's fixtures have concluded
 * and been released, so it's safe to call a "current leader" the actual
 * champion. Uses the last scheduled matchday for that league+season plus a
 * few days' buffer, so a long final-week match still has time to be released
 * before the season is treated as decided. Needs the full matchdays list for
 * this league+season — with no schedule data for it, we can't safely say the
 * season is over, so this returns false rather than guessing.
 */
export function isSeasonComplete(
  seasonId: number,
  leagueId: number,
  matchdays: { SeasonID: number; LeagueID: number; Matchday: string }[],
  now: Date = new Date()
): boolean {
  let lastMatchday: string | null = null;
  for (const m of matchdays) {
    if (m.SeasonID !== seasonId || m.LeagueID !== leagueId) continue;
    if (!lastMatchday || m.Matchday > lastMatchday) lastMatchday = m.Matchday;
  }
  if (!lastMatchday) return false;
  const last = parseLocalDate(lastMatchday);
  last.setDate(last.getDate() + 3); // buffer for release delay on the final week's matches
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return last.getTime() <= today.getTime();
}

/**
 * Given a hex or named CSS color, return true if it's "light" (luminance > 0.5).
 * Used for choosing readable text on colored backgrounds.
 */
export function isLightColor(color: string): boolean {
  let r = 0, g = 0, b = 0;
  // Handle hex
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (color.startsWith("rgb")) {
    const match = color.match(/(\d+)/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0]);
      g = parseInt(match[1]);
      b = parseInt(match[2]);
    }
  } else {
    // Named colors — assume dark if we can't parse
    return false;
  }
  // Relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55;
}

/**
 * Get a readable text color (black or white) for a given background color.
 */
export function getContrastText(bgColor: string | null): string {
  if (!bgColor) return "inherit";
  return isLightColor(bgColor) ? "#1a1a1a" : "#ffffff";
}

// Country code mapping for flag emojis
const nationFlagMap: Record<string, string> = {
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  Ireland: "🇮🇪",
  "Northern Ireland": "🇬🇧",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  Bulgaria: "🇧🇬",
  Croatia: "🇭🇷",
  Denmark: "🇩🇰",
  Hungary: "🇭🇺",
  Italy: "🇮🇹",
  Lithuania: "🇱🇹",
  Luxembourg: "🇱🇺",
  Moldova: "🇲🇩",
  Netherlands: "🇳🇱",
  Holland: "🇳🇱",
  Norway: "🇳🇴",
  Poland: "🇵🇱",
  Portugal: "🇵🇹",
  Romania: "🇷🇴",
  Russia: "🇷🇺",
  Serbia: "🇷🇸",
  Spain: "🇪🇸",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Turkey: "🇹🇷",
  Estonia: "🇪🇪",
  Finland: "🇫🇮",
  USA: "🇺🇸",
  Canada: "🇨🇦",
  Mexico: "🇲🇽",
  Argentina: "🇦🇷",
  Brazil: "🇧🇷",
  Japan: "🇯🇵",
  Korea: "🇰🇷",
  Australia: "🇦🇺",
  "New Zealand": "🇳🇿",
  India: "🇮🇳",
  China: "🇨🇳",
  Taiwan: "🇹🇼",
  Ethiopia: "🇪🇹",
  Morocco: "🇲🇦",
  "South Africa": "🇿🇦",
  Nigeria: "🇳🇬",
  Kenya: "🇰🇪",
  Iran: "🇮🇷",
  "Saudi Arabia": "🇸🇦",
  Egypt: "🇪🇬",
  Haiti: "🇭🇹",
  Chad: "🇹🇩",
  Benin: "🇧🇯",
  Burundi: "🇧🇮",
  Sudan: "🇸🇩",
  Transylvania: "🇷🇴",
  Bohemia: "🇨🇿",
  Peru: "🇵🇪",
  Colombia: "🇨🇴",
  Uganda: "🇺🇬",
  Tanzania: "🇹🇿",
  Rwanda: "🇷🇼",
  Samoa: "🇼🇸",
  Fiji: "🇫🇯",
  Tonga: "🇹🇴",
  "Papua New Guinea": "🇵🇬",
  Bavaria: "🇩🇪",
  Prussia: "🇩🇪",
  Flanders: "🇧🇪",
  Iceland: "🇮🇸",
  Albania: "🇦🇱",
  Ukraine: "🇺🇦",
  "Cote D'Ivoire": "🇨🇮",
  Greece: "🇬🇷",
  "Beor Republic": "🌍",
  Nyasaland: "🇲🇼",
  Malawi: "🇲🇼",
  Afghanistan: "🇦🇫",
  Algeria: "🇩🇿",
  "American Samoa": "🇦🇸",
  Andorra: "🇦🇩",
  Angola: "🇦🇴",
  Anguilla: "🇦🇮",
  "Antigua and Barbuda": "🇦🇬",
  Armenia: "🇦🇲",
  Aruba: "🇦🇼",
  Azerbaijan: "🇦🇿",
  Bahamas: "🇧🇸",
  Bahrain: "🇧🇭",
  Bangladesh: "🇧🇩",
  Barbados: "🇧🇧",
  Belarus: "🇧🇾",
  Belize: "🇧🇿",
  Bermuda: "🇧🇲",
  Bhutan: "🇧🇹",
  Bolivia: "🇧🇴",
  "Bosnia and Herzegovina": "🇧🇦",
  Botswana: "🇧🇼",
  Brunei: "🇧🇳",
  "Burkina Faso": "🇧🇫",
  Cambodia: "🇰🇭",
  Cameroon: "🇨🇲",
  "Cape Verde": "🇨🇻",
  "Central African Republic": "🇨🇫",
  Chile: "🇨🇱",
  Comoros: "🇰🇲",
  Congo: "🇨🇬",
  "Cook Islands": "🇨🇰",
  "Costa Rica": "🇨🇷",
  Cuba: "🇨🇺",
  Curacao: "🇨🇼",
  Cyprus: "🇨🇾",
  Djibouti: "🇩🇯",
  "Dominican Republic": "🇩🇴",
  Ecuador: "🇪🇨",
  "El Salvador": "🇸🇻",
  "Equatorial Guinea": "🇬🇶",
  Eritrea: "🇪🇷",
  "Faroe Islands": "🇫🇴",
  Gabon: "🇬🇦",
  Gambia: "🇬🇲",
  Georgia: "🇬🇪",
  Ghana: "🇬🇭",
  Gibraltar: "🇬🇮",
  Greenland: "🇬🇱",
  Grenada: "🇬🇩",
  Guam: "🇬🇺",
  Guatemala: "🇬🇹",
  "Guinea-Bissau": "🇬🇼",
  Guyana: "🇬🇾",
  Honduras: "🇭🇳",
  "Hong Kong": "🇭🇰",
  Indonesia: "🇮🇩",
  Iraq: "🇮🇶",
  Israel: "🇮🇱",
  Jamaica: "🇯🇲",
  Jordan: "🇯🇴",
  Kazakhstan: "🇰🇿",
  Kuwait: "🇰🇼",
  Kyrgyzstan: "🇰🇬",
  Laos: "🇱🇦",
  Latvia: "🇱🇻",
  Lebanon: "🇱🇧",
  Lesotho: "🇱🇸",
  Liberia: "🇱🇷",
  Libya: "🇱🇾",
  Liechtenstein: "🇱🇮",
  Macedonia: "🇲🇰",
  Madagascar: "🇲🇬",
  Malaysia: "🇲🇾",
  Mali: "🇲🇱",
  Malta: "🇲🇹",
  Martinique: "🇲🇶",
  Mauritania: "🇲🇷",
  Mauritius: "🇲🇺",
  Micronesia: "🇫🇲",
  Monaco: "🇲🇨",
  Mongolia: "🇲🇳",
  Montenegro: "🇲🇪",
  Mozambique: "🇲🇿",
  Myanmar: "🇲🇲",
  Namibia: "🇳🇦",
  Nepal: "🇳🇵",
  Niger: "🇳🇪",
  Oman: "🇴🇲",
  Pakistan: "🇵🇰",
  Palau: "🇵🇼",
  Panama: "🇵🇦",
  Paraguay: "🇵🇾",
  Phillipines: "🇵🇭",
  Qatar: "🇶🇦",
  "San Marino": "🇸🇲",
  Senegal: "🇸🇳",
  "Sierra Leone": "🇸🇱",
  Singapore: "🇸🇬",
  Slovakia: "🇸🇰",
  Slovenia: "🇸🇮",
  Somalia: "🇸🇴",
  "Sri Lanka": "🇱🇰",
  Suriname: "🇸🇷",
  Swaziland: "🇸🇿",
  Syria: "🇸🇾",
  Tajikistan: "🇹🇯",
  Thailand: "🇹🇭",
  "Timor-Leste": "🇹🇱",
  Togo: "🇹🇬",
  "Trinidad and Tobago": "🇹🇹",
  Tunisia: "🇹🇳",
  Turkmenistan: "🇹🇲",
  Tuvalu: "🇹🇻",
  "United Arab Emirates": "🇦🇪",
  Uruguay: "🇺🇾",
  Uzbekistan: "🇺🇿",
  Vanuatu: "🇻🇺",
  Venezuela: "🇻🇪",
  Vietnam: "🇻🇳",
  Yemen: "🇾🇪",
  Zambia: "🇿🇲",
  Zimbabwe: "🇿🇼",
  Basutoland: "🇱🇸",
  Bechuanaland: "🇧🇼",
  Dahomey: "🇧🇯",
  Darfur: "🇸🇩",
  "French Equitorial Africa": "🌍",
  Hispaniola: "🌎",
  Joseon: "🇰🇷",
  Livonia: "🇱🇻",
  "New France": "🇫🇷",
  "New Spain": "🇪🇸",
  Nicargua: "🇳🇮",
  "Ottoman Empire": "🇹🇷",
  Persia: "🇮🇷",
  Punjab: "🇮🇳",
  "Santo Domingo": "🇩🇴",
  Siam: "🇹🇭",
  Tibet: "🇨🇳",
  Togoland: "🇹🇬",
  Transjordan: "🇯🇴",
  Volta: "🇧🇫",
  Wallachia: "🇷🇴",
  Zanzibar: "🇹🇿",
  Bagirmi: "🇹🇩",
  Antarctica: "🇦🇶",
};

export function getNationFlag(nation: string | null): string {
  if (!nation) return "";
  return nationFlagMap[nation] || "🏳️";
}

export function getLeagueTierLabel(tier: number | null): string {
  switch (tier) {
    case 0: return "Cup Competition";
    case 1: return "Division I";
    case 2: return "Division II";
    default: return "League";
  }
}

// ── Team of the Year / Cup honours-team grouping ──
// A "Team of the Year" (or similar honours-team) award selects 7 players per
// team: 3 Chasers, 2 Beaters, 1 Keeper, 1 Seeker. The `awards` table has no
// position column, so position must come from each player's own record — NOT
// be inferred from array order (which isn't guaranteed to match any particular
// position sequence and silently mislabels players when it doesn't).
export const TOTY_POSITION_ORDER = ["Chaser", "Beater", "Keeper", "Seeker"] as const;

// A "team style" award is detected from its actual data shape — multiple players
// sharing the same placement value WITHIN THE SAME SEASON — rather than matching a
// hardcoded award name like "Team of the Year". This way any similarly-structured
// award (e.g. a cup competition's own "Cup Team of the Year") is picked up
// automatically, even though its name differs from the domestic league's award.
//
// The check MUST be scoped per season: an ordinary individual award (e.g. "Iron Man
// Award", or any top-N leaderboard award) naturally reuses "1st place" once every
// season across its multi-season history — that's expected and is NOT team-style.
// The real signature of a team award is two different PLAYERS sharing the SAME
// placement in the SAME season (e.g. both selected to "1st Team" in 2007-08).
export function isTeamStyleAward(entries: { placement: number; seasonid?: number | null }[]): boolean {
  const bySeasonPlacement = new Map<string, number>();
  entries.forEach(e => {
    const seasonKey = e.seasonid ?? "unknown";
    const key = `${seasonKey}|${e.placement}`;
    bySeasonPlacement.set(key, (bySeasonPlacement.get(key) || 0) + 1);
  });
  return [...bySeasonPlacement.values()].some(c => c > 1);
}

export function totyPositionLabel(position: string): string {
  return position === "Chaser" ? "Chasers" : position === "Beater" ? "Beaters" : position;
}

export function groupTotyByPosition<T extends { playerid: number }>(
  entries: T[],
  positionMap: Map<number, string>
): { label: string; players: T[] }[] {
  const buckets = new Map<string, T[]>();
  entries.forEach(e => {
    const pos = positionMap.get(e.playerid) || "Unknown";
    if (!buckets.has(pos)) buckets.set(pos, []);
    buckets.get(pos)!.push(e);
  });
  const ordered: { label: string; players: T[] }[] = [];
  TOTY_POSITION_ORDER.forEach(pos => {
    const players = buckets.get(pos);
    if (players && players.length > 0) {
      ordered.push({ label: totyPositionLabel(pos), players });
      buckets.delete(pos);
    }
  });
  // Any player whose position couldn't be resolved is still shown (never silently
  // dropped) — just grouped separately rather than mis-slotted into a wrong position.
  buckets.forEach((players, pos) => {
    ordered.push({ label: pos === "Unknown" ? "Other" : totyPositionLabel(pos), players });
  });
  return ordered;
}
