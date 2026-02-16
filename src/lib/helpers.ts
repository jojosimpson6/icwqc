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
};

export function getNationFlag(nation: string | null): string {
  if (!nation) return "";
  return nationFlagMap[nation] || "🏳️";
}

export function getLeagueTierLabel(tier: number | null): string {
  switch (tier) {
    case 0: return "Cup Competition";
    case 1: return "Popular League";
    case 2: return "Other League";
    default: return "League";
  }
}
