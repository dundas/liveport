import { describe, it, expect } from "vitest";
import {
  generateBridgeKey,
  getKeyPrefix,
  isValidKeyFormat,
  maskKey,
} from "./index";

describe("Bridge Key Utilities", () => {
  describe("generateBridgeKey", () => {
    it("should generate a key with lpk_ prefix", () => {
      const key = generateBridgeKey();
      expect(key.startsWith("lpk_")).toBe(true);
    });

    it("should generate a key with correct length (36 chars total)", () => {
      const key = generateBridgeKey();
      // lpk_ (4) + 32 random chars = 36
      expect(key.length).toBe(36);
    });

    it("should generate unique keys", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateBridgeKey());
      }
      expect(keys.size).toBe(100);
    });

    it("should only contain valid characters", () => {
      const key = generateBridgeKey();
      // nanoid uses A-Za-z0-9_- by default
      expect(key).toMatch(/^lpk_[A-Za-z0-9_-]+$/);
    });
  });

  describe("getKeyPrefix", () => {
    it("should return first 12 characters", () => {
      const key = "lpk_abcd1234efgh5678ijkl9012mnop";
      const prefix = getKeyPrefix(key);
      expect(prefix).toBe("lpk_abcd1234");
      expect(prefix.length).toBe(12);
    });

    it("should work with generated keys", () => {
      const key = generateBridgeKey();
      const prefix = getKeyPrefix(key);
      expect(prefix.startsWith("lpk_")).toBe(true);
      expect(prefix.length).toBe(12);
    });
  });

  describe("isValidKeyFormat", () => {
    it("should return true for valid key format", () => {
      const key = generateBridgeKey();
      expect(isValidKeyFormat(key)).toBe(true);
    });

    it("should return false for key without lpk_ prefix", () => {
      expect(isValidKeyFormat("abc_12345678901234567890123456789012")).toBe(false);
      expect(isValidKeyFormat("12345678901234567890123456789012")).toBe(false);
    });

    it("should return false for key with wrong length", () => {
      expect(isValidKeyFormat("lpk_short")).toBe(false);
      expect(isValidKeyFormat("lpk_toolongkeywithtoomanycharacters12345")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isValidKeyFormat("")).toBe(false);
    });

    it("should return true for exactly 36 character key with lpk_ prefix", () => {
      // lpk_ (4) + 32 chars = 36
      const validKey = "lpk_" + "a".repeat(32);
      expect(validKey.length).toBe(36);
      expect(isValidKeyFormat(validKey)).toBe(true);
    });
  });

  describe("maskKey", () => {
    it("should mask middle characters of key", () => {
      const key = "lpk_abcd1234efgh5678ijkl9012mnop";
      const masked = maskKey(key);
      expect(masked).toBe("lpk_abcd...mnop");
    });

    it("should show first 8 and last 4 characters", () => {
      const key = generateBridgeKey();
      const masked = maskKey(key);

      expect(masked.startsWith(key.substring(0, 8))).toBe(true);
      expect(masked.endsWith(key.substring(key.length - 4))).toBe(true);
      expect(masked).toContain("...");
    });

    it("should return original key if too short", () => {
      const shortKey = "lpk_abc";
      expect(maskKey(shortKey)).toBe(shortKey);
    });

    it("should handle keys of exactly 16 characters", () => {
      const key = "lpk_abcdefghijkl"; // 16 chars
      const masked = maskKey(key);
      expect(masked).toBe("lpk_abcd...ijkl");
    });
  });
});
