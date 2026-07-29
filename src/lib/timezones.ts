// Curated IANA timezone list with region-level granularity.
// Each entry is a real IANA zone so DST, historical offsets, and multi-timezone
// countries (US, AU, CA, RU, BR, MX, etc.) are handled correctly.

export interface TzEntry {
  timezone: string; // IANA
  city: string;
  country: string;
  region?: string;
}

export const TIMEZONES: TzEntry[] = [
  // North America — USA
  { timezone: "America/New_York", city: "New York", country: "United States", region: "Eastern" },
  { timezone: "America/Detroit", city: "Detroit", country: "United States", region: "Eastern" },
  { timezone: "America/Chicago", city: "Chicago", country: "United States", region: "Central" },
  { timezone: "America/Denver", city: "Denver", country: "United States", region: "Mountain" },
  {
    timezone: "America/Phoenix",
    city: "Phoenix",
    country: "United States",
    region: "Arizona (no DST)",
  },
  {
    timezone: "America/Los_Angeles",
    city: "Los Angeles",
    country: "United States",
    region: "Pacific",
  },
  { timezone: "America/Anchorage", city: "Anchorage", country: "United States", region: "Alaska" },
  { timezone: "Pacific/Honolulu", city: "Honolulu", country: "United States", region: "Hawaii" },

  // Canada
  { timezone: "America/Toronto", city: "Toronto", country: "Canada", region: "Eastern" },
  { timezone: "America/Winnipeg", city: "Winnipeg", country: "Canada", region: "Central" },
  { timezone: "America/Edmonton", city: "Edmonton", country: "Canada", region: "Mountain" },
  { timezone: "America/Vancouver", city: "Vancouver", country: "Canada", region: "Pacific" },
  { timezone: "America/Halifax", city: "Halifax", country: "Canada", region: "Atlantic" },
  { timezone: "America/St_Johns", city: "St. John's", country: "Canada", region: "Newfoundland" },

  // Mexico
  { timezone: "America/Mexico_City", city: "Mexico City", country: "Mexico", region: "Central" },
  { timezone: "America/Cancun", city: "Cancun", country: "Mexico", region: "Eastern" },
  { timezone: "America/Chihuahua", city: "Chihuahua", country: "Mexico", region: "Mountain" },
  { timezone: "America/Tijuana", city: "Tijuana", country: "Mexico", region: "Pacific" },

  // Central & South America
  { timezone: "America/Panama", city: "Panama City", country: "Panama" },
  { timezone: "America/Bogota", city: "Bogotá", country: "Colombia" },
  { timezone: "America/Lima", city: "Lima", country: "Peru" },
  { timezone: "America/Caracas", city: "Caracas", country: "Venezuela" },
  { timezone: "America/Santiago", city: "Santiago", country: "Chile" },
  { timezone: "America/Buenos_Aires", city: "Buenos Aires", country: "Argentina" },
  { timezone: "America/Sao_Paulo", city: "São Paulo", country: "Brazil", region: "Brasília" },
  { timezone: "America/Manaus", city: "Manaus", country: "Brazil", region: "Amazon" },
  { timezone: "America/Noronha", city: "Fernando de Noronha", country: "Brazil" },

  // Europe
  { timezone: "Europe/London", city: "London", country: "United Kingdom" },
  { timezone: "Europe/Dublin", city: "Dublin", country: "Ireland" },
  { timezone: "Europe/Lisbon", city: "Lisbon", country: "Portugal" },
  { timezone: "Europe/Madrid", city: "Madrid", country: "Spain" },
  { timezone: "Europe/Paris", city: "Paris", country: "France" },
  { timezone: "Europe/Brussels", city: "Brussels", country: "Belgium" },
  { timezone: "Europe/Amsterdam", city: "Amsterdam", country: "Netherlands" },
  { timezone: "Europe/Berlin", city: "Berlin", country: "Germany" },
  { timezone: "Europe/Zurich", city: "Zurich", country: "Switzerland" },
  { timezone: "Europe/Rome", city: "Rome", country: "Italy" },
  { timezone: "Europe/Vienna", city: "Vienna", country: "Austria" },
  { timezone: "Europe/Prague", city: "Prague", country: "Czech Republic" },
  { timezone: "Europe/Warsaw", city: "Warsaw", country: "Poland" },
  { timezone: "Europe/Stockholm", city: "Stockholm", country: "Sweden" },
  { timezone: "Europe/Oslo", city: "Oslo", country: "Norway" },
  { timezone: "Europe/Helsinki", city: "Helsinki", country: "Finland" },
  { timezone: "Europe/Athens", city: "Athens", country: "Greece" },
  { timezone: "Europe/Istanbul", city: "Istanbul", country: "Turkey" },
  { timezone: "Europe/Kyiv", city: "Kyiv", country: "Ukraine" },

  // Russia — spans many zones
  { timezone: "Europe/Kaliningrad", city: "Kaliningrad", country: "Russia" },
  { timezone: "Europe/Moscow", city: "Moscow", country: "Russia" },
  { timezone: "Europe/Samara", city: "Samara", country: "Russia" },
  { timezone: "Asia/Yekaterinburg", city: "Yekaterinburg", country: "Russia" },
  { timezone: "Asia/Omsk", city: "Omsk", country: "Russia" },
  { timezone: "Asia/Novosibirsk", city: "Novosibirsk", country: "Russia" },
  { timezone: "Asia/Krasnoyarsk", city: "Krasnoyarsk", country: "Russia" },
  { timezone: "Asia/Irkutsk", city: "Irkutsk", country: "Russia" },
  { timezone: "Asia/Yakutsk", city: "Yakutsk", country: "Russia" },
  { timezone: "Asia/Vladivostok", city: "Vladivostok", country: "Russia" },
  { timezone: "Asia/Magadan", city: "Magadan", country: "Russia" },
  { timezone: "Asia/Kamchatka", city: "Kamchatka", country: "Russia" },

  // Middle East / Africa
  { timezone: "Africa/Cairo", city: "Cairo", country: "Egypt" },
  { timezone: "Africa/Lagos", city: "Lagos", country: "Nigeria" },
  { timezone: "Africa/Johannesburg", city: "Johannesburg", country: "South Africa" },
  { timezone: "Africa/Nairobi", city: "Nairobi", country: "Kenya" },
  { timezone: "Africa/Casablanca", city: "Casablanca", country: "Morocco" },
  { timezone: "Asia/Jerusalem", city: "Jerusalem", country: "Israel" },
  { timezone: "Asia/Dubai", city: "Dubai", country: "United Arab Emirates" },
  { timezone: "Asia/Riyadh", city: "Riyadh", country: "Saudi Arabia" },
  { timezone: "Asia/Tehran", city: "Tehran", country: "Iran" },
  { timezone: "Asia/Baghdad", city: "Baghdad", country: "Iraq" },

  // Asia
  { timezone: "Asia/Karachi", city: "Karachi", country: "Pakistan" },
  { timezone: "Asia/Kolkata", city: "Mumbai / Delhi", country: "India" },
  { timezone: "Asia/Kathmandu", city: "Kathmandu", country: "Nepal" },
  { timezone: "Asia/Dhaka", city: "Dhaka", country: "Bangladesh" },
  { timezone: "Asia/Bangkok", city: "Bangkok", country: "Thailand" },
  { timezone: "Asia/Jakarta", city: "Jakarta", country: "Indonesia", region: "Western" },
  { timezone: "Asia/Makassar", city: "Makassar", country: "Indonesia", region: "Central" },
  { timezone: "Asia/Jayapura", city: "Jayapura", country: "Indonesia", region: "Eastern" },
  { timezone: "Asia/Singapore", city: "Singapore", country: "Singapore" },
  { timezone: "Asia/Kuala_Lumpur", city: "Kuala Lumpur", country: "Malaysia" },
  { timezone: "Asia/Manila", city: "Manila", country: "Philippines" },
  { timezone: "Asia/Hong_Kong", city: "Hong Kong", country: "Hong Kong" },
  { timezone: "Asia/Shanghai", city: "Shanghai", country: "China" },
  { timezone: "Asia/Taipei", city: "Taipei", country: "Taiwan" },
  { timezone: "Asia/Seoul", city: "Seoul", country: "South Korea" },
  { timezone: "Asia/Tokyo", city: "Tokyo", country: "Japan" },

  // Australia — spans multiple
  { timezone: "Australia/Perth", city: "Perth", country: "Australia", region: "Western" },
  { timezone: "Australia/Adelaide", city: "Adelaide", country: "Australia", region: "Central" },
  { timezone: "Australia/Darwin", city: "Darwin", country: "Australia", region: "Central (NT)" },
  {
    timezone: "Australia/Brisbane",
    city: "Brisbane",
    country: "Australia",
    region: "Eastern (QLD)",
  },
  { timezone: "Australia/Sydney", city: "Sydney", country: "Australia", region: "Eastern" },
  { timezone: "Australia/Melbourne", city: "Melbourne", country: "Australia", region: "Eastern" },
  { timezone: "Australia/Hobart", city: "Hobart", country: "Australia", region: "Tasmania" },

  // Pacific / NZ
  { timezone: "Pacific/Auckland", city: "Auckland", country: "New Zealand" },
  { timezone: "Pacific/Fiji", city: "Suva", country: "Fiji" },
  { timezone: "Pacific/Guam", city: "Guam", country: "Guam" },
  { timezone: "Pacific/Port_Moresby", city: "Port Moresby", country: "Papua New Guinea" },

  // UTC reference
  { timezone: "UTC", city: "UTC", country: "Coordinated Universal Time" },
];

export function getOffsetLabel(timezone: string, at: Date = new Date()): string {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    });
    const parts = dtf.formatToParts(at);
    const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // Normalize e.g. "GMT-5" -> "UTC-5"
    return tz.replace(/^GMT/, "UTC") || "UTC";
  } catch {
    return "UTC";
  }
}

export function getHourInZone(timezone: string, at: Date = new Date()): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(at);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const s = Number(parts.find((p) => p.type === "second")?.value ?? 0);
    return h + m / 60 + s / 3600;
  } catch {
    return 0;
  }
}

export function formatTimeInZone(
  timezone: string,
  at: Date = new Date(),
  options?: { hour12?: boolean; seconds?: boolean },
): string {
  const { hour12 = false, seconds = true } = options ?? {};
  try {
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: hour12 ? "numeric" : "2-digit",
      minute: "2-digit",
      hour12,
    };
    if (seconds) opts.second = "2-digit";
    return new Intl.DateTimeFormat("en-US", opts).format(at);
  } catch {
    return "--:--";
  }
}

export function formatDateInZone(timezone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(at);
  } catch {
    return "";
  }
}
