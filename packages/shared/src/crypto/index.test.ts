import { describe, it, expect } from "vitest";
import {
  hashKey,
  verifyKey,
  legacySha256Hash,
  isBcryptHash,
} from "./index";

describe("Crypto Utilities", () => {
  describe("hashKey", () => {
    it("should generate a bcrypt hash", async () => {
      const hash = await hashKey("test-key");
      expect(hash.startsWith("$2")).toBe(true);
    });

    it("should generate different hashes for same input (salted)", async () => {
      const hash1 = await hashKey("test-key");
      const hash2 = await hashKey("test-key");
      expect(hash1).not.toBe(hash2);
    });

    it("should generate hash with correct bcrypt format", async () => {
      const hash = await hashKey("test-key");
      // bcrypt format: $2a$rounds$salt+hash or $2b$rounds$salt+hash
      expect(hash).toMatch(/^\$2[aby]?\$\d{2}\$.{53}$/);
    });

    it("should use specified rounds", async () => {
      const hash = await hashKey("test-key", 10);
      expect(hash).toContain("$10$");
    });

    it("should use default rounds (12)", async () => {
      const hash = await hashKey("test-key");
      expect(hash).toContain("$12$");
    });
  });

  describe("verifyKey", () => {
    it("should return true for matching key and hash", async () => {
      const key = "my-secret-key";
      const hash = await hashKey(key);
      const isValid = await verifyKey(key, hash);
      expect(isValid).toBe(true);
    });

    it("should return false for non-matching key", async () => {
      const hash = await hashKey("correct-key");
      const isValid = await verifyKey("wrong-key", hash);
      expect(isValid).toBe(false);
    });

    it("should return false for empty key", async () => {
      const hash = await hashKey("test-key");
      const isValid = await verifyKey("", hash);
      expect(isValid).toBe(false);
    });

    it("should handle special characters in key", async () => {
      const key = "key!@#$%^&*()_+-=[]{}|;':\",./<>?";
      const hash = await hashKey(key);
      const isValid = await verifyKey(key, hash);
      expect(isValid).toBe(true);
    });

    it("should handle unicode characters", async () => {
      const key = "key🔑ключ密钥";
      const hash = await hashKey(key);
      const isValid = await verifyKey(key, hash);
      expect(isValid).toBe(true);
    });
  });

  describe("legacySha256Hash", () => {
    it("should generate consistent hash for same input", async () => {
      const hash1 = await legacySha256Hash("test-key");
      const hash2 = await legacySha256Hash("test-key");
      expect(hash1).toBe(hash2);
    });

    it("should generate 64 character hex string", async () => {
      const hash = await legacySha256Hash("test-key");
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("should generate different hashes for different inputs", async () => {
      const hash1 = await legacySha256Hash("key1");
      const hash2 = await legacySha256Hash("key2");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty string", async () => {
      const hash = await legacySha256Hash("");
      // Known SHA-256 hash of empty string
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });
  });

  describe("isBcryptHash", () => {
    it("should return true for $2a hashes", () => {
      expect(isBcryptHash("$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.FeUV9R/RxOxEGO")).toBe(true);
    });

    it("should return true for $2b hashes", () => {
      expect(isBcryptHash("$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.FeUV9R/RxOxEGO")).toBe(true);
    });

    it("should return true for $2y hashes", () => {
      expect(isBcryptHash("$2y$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.FeUV9R/RxOxEGO")).toBe(true);
    });

    it("should return false for SHA-256 hex hashes", () => {
      expect(isBcryptHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isBcryptHash("")).toBe(false);
    });

    it("should return false for random strings", () => {
      expect(isBcryptHash("not-a-hash")).toBe(false);
      expect(isBcryptHash("12345")).toBe(false);
    });
  });
});
