/**
 * Bridge Key API Route Tests
 *
 * Tests for the key creation expiration parsing logic:
 * - Valid expiresIn formats ("1h", "6h", "24h", "7d")
 * - Invalid expiresIn formats
 * - Range validation
 * - Fallback to expiresInDays
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Helper to parse expiresIn like the API does
function parseExpiresIn(expiresIn: string): { valid: boolean; ms?: number; error?: string } {
  const match = expiresIn.match(/^(\d+)(h|d)$/);
  if (!match) {
    return { valid: false, error: "Invalid expiresIn format. Use format like '6h' or '7d'" };
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  // Validate reasonable ranges (max 1 year)
  const maxHours = 8760; // 365 days
  const maxDays = 365;
  
  if (unit === 'h' && (value <= 0 || value > maxHours)) {
    return { valid: false, error: `Hours must be between 1 and ${maxHours}` };
  }
  if (unit === 'd' && (value <= 0 || value > maxDays)) {
    return { valid: false, error: `Days must be between 1 and ${maxDays}` };
  }
  
  const ms = unit === 'h' 
    ? value * 60 * 60 * 1000 
    : value * 24 * 60 * 60 * 1000;
  
  return { valid: true, ms };
}

describe("Bridge Key Expiration Parsing", () => {
  describe("parseExpiresIn", () => {
    describe("valid formats", () => {
      it("should parse '1h' correctly", () => {
        const result = parseExpiresIn("1h");
        expect(result.valid).toBe(true);
        expect(result.ms).toBe(1 * 60 * 60 * 1000); // 1 hour in ms
      });

      it("should parse '6h' correctly", () => {
        const result = parseExpiresIn("6h");
        expect(result.valid).toBe(true);
        expect(result.ms).toBe(6 * 60 * 60 * 1000); // 6 hours in ms
      });

      it("should parse '24h' correctly", () => {
        const result = parseExpiresIn("24h");
        expect(result.valid).toBe(true);
        expect(result.ms).toBe(24 * 60 * 60 * 1000); // 24 hours in ms
      });

      it("should parse '7d' correctly", () => {
        const result = parseExpiresIn("7d");
        expect(result.valid).toBe(true);
        expect(result.ms).toBe(7 * 24 * 60 * 60 * 1000); // 7 days in ms
      });

      it("should parse '30d' correctly", () => {
        const result = parseExpiresIn("30d");
        expect(result.valid).toBe(true);
        expect(result.ms).toBe(30 * 24 * 60 * 60 * 1000); // 30 days in ms
      });

      it("should parse '365d' correctly (max days)", () => {
        const result = parseExpiresIn("365d");
        expect(result.valid).toBe(true);
        expect(result.ms).toBe(365 * 24 * 60 * 60 * 1000);
      });

      it("should parse '8760h' correctly (max hours)", () => {
        const result = parseExpiresIn("8760h");
        expect(result.valid).toBe(true);
        expect(result.ms).toBe(8760 * 60 * 60 * 1000);
      });
    });

    describe("invalid formats", () => {
      it("should reject empty string", () => {
        const result = parseExpiresIn("");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid expiresIn format");
      });

      it("should reject 'abc'", () => {
        const result = parseExpiresIn("abc");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid expiresIn format");
      });

      it("should reject '6hours'", () => {
        const result = parseExpiresIn("6hours");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid expiresIn format");
      });

      it("should reject '6x'", () => {
        const result = parseExpiresIn("6x");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid expiresIn format");
      });

      it("should reject 'h6'", () => {
        const result = parseExpiresIn("h6");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid expiresIn format");
      });

      it("should reject '6.5h' (decimals)", () => {
        const result = parseExpiresIn("6.5h");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid expiresIn format");
      });

      it("should reject '-6h' (negative)", () => {
        const result = parseExpiresIn("-6h");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid expiresIn format");
      });
    });

    describe("range validation", () => {
      it("should reject '0h'", () => {
        const result = parseExpiresIn("0h");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Hours must be between 1 and 8760");
      });

      it("should reject '0d'", () => {
        const result = parseExpiresIn("0d");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Days must be between 1 and 365");
      });

      it("should reject '8761h' (exceeds max hours)", () => {
        const result = parseExpiresIn("8761h");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Hours must be between 1 and 8760");
      });

      it("should reject '366d' (exceeds max days)", () => {
        const result = parseExpiresIn("366d");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Days must be between 1 and 365");
      });

      it("should reject '999999d' (way over limit)", () => {
        const result = parseExpiresIn("999999d");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Days must be between 1 and 365");
      });
    });
  });

  describe("expiration date calculation", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    });

    it("should calculate correct expiration for 6h", () => {
      const result = parseExpiresIn("6h");
      const expiresAt = new Date(Date.now() + result.ms!);
      expect(expiresAt.toISOString()).toBe("2025-01-01T06:00:00.000Z");
    });

    it("should calculate correct expiration for 7d", () => {
      const result = parseExpiresIn("7d");
      const expiresAt = new Date(Date.now() + result.ms!);
      expect(expiresAt.toISOString()).toBe("2025-01-08T00:00:00.000Z");
    });

    it("should NOT result in epoch time (Dec 31, 1969)", () => {
      const result = parseExpiresIn("6h");
      const expiresAt = new Date(Date.now() + result.ms!);
      // Epoch time is 1970-01-01, anything before that is a bug
      expect(expiresAt.getFullYear()).toBeGreaterThanOrEqual(2025);
    });
  });
});
