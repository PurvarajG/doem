import { describe, expect, it } from "vitest";
import { resolveDensity } from "@/components/useDensity";

describe("resolveDensity", () => {
  it("Auto is Compact on laptop screens and 1080p displays", () => {
    expect(resolveDensity("auto", 956)).toBe("compact"); // 13" Air
    expect(resolveDensity("auto", 982)).toBe("compact"); // 14" Pro
    expect(resolveDensity("auto", 1117)).toBe("compact"); // 16" Pro
    expect(resolveDensity("auto", 1080)).toBe("compact"); // 1080p display
  });

  it("Auto is Comfortable on large displays", () => {
    expect(resolveDensity("auto", 1440)).toBe("comfortable");
    expect(resolveDensity("auto", 1200)).toBe("comfortable");
  });

  it("an explicit choice wins over the screen", () => {
    expect(resolveDensity("comfortable", 982)).toBe("comfortable");
    expect(resolveDensity("compact", 1440)).toBe("compact");
  });
});
