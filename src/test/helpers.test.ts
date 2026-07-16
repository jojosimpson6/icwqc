import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
  formatHeight,
  calculateAge,
  formatDate,
  parseLocalDate,
  isLightColor,
  getContrastText,
  getNationFlag,
  getLeagueTierLabel,
} from "@/lib/helpers";

// formatDate/calculateAge parse date-only strings (e.g. "2020-01-05") as UTC
// midnight, then render in the local timezone — force UTC here so the tests
// are deterministic regardless of which timezone this runs in.
beforeAll(() => {
  process.env.TZ = "UTC";
});

describe("formatHeight", () => {
  it("formats inches as feet/inches", () => {
    expect(formatHeight(72)).toBe("6'0\"");
    expect(formatHeight(65)).toBe("5'5\"");
  });
  it("returns em dash for null/zero", () => {
    expect(formatHeight(null)).toBe("—");
    expect(formatHeight(0)).toBe("—");
  });
});

describe("calculateAge", () => {
  afterEach(() => vi.useRealTimers());

  it("returns null for null DOB", () => {
    expect(calculateAge(null)).toBeNull();
  });

  it("computes age relative to the current date, accounting for whether the birthday has occurred yet this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026
    expect(calculateAge("2000-06-14")).toBe(26); // birthday already passed
    expect(calculateAge("2000-06-15")).toBe(26); // birthday is today
    expect(calculateAge("2000-06-16")).toBe(25); // birthday hasn't happened yet
  });
});

describe("formatDate", () => {
  it("formats a date string as 'D Month YYYY'", () => {
    expect(formatDate("2020-01-05")).toMatch(/5 January 2020/);
  });
  it("returns em dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });
});

describe("parseLocalDate", () => {
  it("parses YYYY-MM-DD without a timezone shift", () => {
    const d = parseLocalDate("2024-03-10");
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2); // 0-indexed
    expect(d.getDate()).toBe(10);
  });
});

describe("isLightColor", () => {
  it("identifies light hex colors", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#fff")).toBe(true);
  });
  it("identifies dark hex colors", () => {
    expect(isLightColor("#000000")).toBe(false);
    expect(isLightColor("#142952")).toBe(false);
  });
  it("handles rgb() colors", () => {
    expect(isLightColor("rgb(255,255,255)")).toBe(true);
    expect(isLightColor("rgb(10,10,10)")).toBe(false);
  });
  it("defaults to dark for unparseable/named colors", () => {
    expect(isLightColor("navy")).toBe(false);
  });
});

describe("getContrastText", () => {
  it("returns dark text for light backgrounds and white text for dark backgrounds", () => {
    expect(getContrastText("#ffffff")).toBe("#1a1a1a");
    expect(getContrastText("#000000")).toBe("#ffffff");
  });
  it("returns 'inherit' when no background is given", () => {
    expect(getContrastText(null)).toBe("inherit");
  });
});

describe("getNationFlag", () => {
  it("returns the correct flag for known nations", () => {
    expect(getNationFlag("France")).toBe("🇫🇷");
    expect(getNationFlag("USA")).toBe("🇺🇸");
  });
  it("falls back to a white flag for unknown nations", () => {
    expect(getNationFlag("Wakanda")).toBe("🏳️");
  });
  it("returns an empty string for null", () => {
    expect(getNationFlag(null)).toBe("");
  });
});

describe("getLeagueTierLabel", () => {
  it("maps tiers to their public-facing labels", () => {
    expect(getLeagueTierLabel(0)).toBe("Cup Competition");
    expect(getLeagueTierLabel(1)).toBe("Division I");
    expect(getLeagueTierLabel(2)).toBe("Division II");
  });
  it("falls back to a generic label for unknown/null tiers", () => {
    expect(getLeagueTierLabel(null)).toBe("League");
    expect(getLeagueTierLabel(99)).toBe("League");
  });
  it("never surfaces the old internal 'Popular'/'Other' designators", () => {
    for (const tier of [0, 1, 2, null, 5]) {
      const label = getLeagueTierLabel(tier);
      expect(label.toLowerCase()).not.toContain("popular");
      expect(label.toLowerCase()).not.toContain("other");
    }
  });
});
