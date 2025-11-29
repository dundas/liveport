/**
 * Config Tests
 *
 * Tests for CLI configuration management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock fs module
vi.mock("fs");
vi.mock("os");

const mockFs = vi.mocked(fs);
const mockOs = vi.mocked(os);

describe("config", () => {
  const mockHomeDir = "/mock/home";
  const mockConfigDir = path.join(mockHomeDir, ".liveport");
  const mockConfigFile = path.join(mockConfigDir, "config.json");

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockOs.homedir.mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadConfig", () => {
    it("should return empty config when file does not exist", async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig } = await import("./config");
      const config = loadConfig();

      expect(config).toEqual({});
    });

    it("should return parsed config when file exists", async () => {
      const mockConfig = { key: "lpk_test123", server: "https://example.com" };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const { loadConfig } = await import("./config");
      const config = loadConfig();

      expect(config).toEqual(mockConfig);
    });

    it("should return empty config on parse error", async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue("invalid json");

      const { loadConfig } = await import("./config");
      const config = loadConfig();

      expect(config).toEqual({});
    });
  });

  describe("saveConfig", () => {
    it("should create config directory if it does not exist", async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockReturnValue(undefined);
      mockFs.chmodSync.mockReturnValue(undefined);
      mockFs.writeFileSync.mockReturnValue(undefined);

      const { saveConfig } = await import("./config");
      saveConfig({ key: "lpk_test" });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockConfigDir, {
        recursive: true,
        mode: 0o700,
      });
    });

    it("should explicitly set permissions to override umask", async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.chmodSync.mockReturnValue(undefined);
      mockFs.writeFileSync.mockReturnValue(undefined);

      const { saveConfig } = await import("./config");
      saveConfig({ key: "lpk_test" });

      // Verify chmod is called for both directory and file
      expect(mockFs.chmodSync).toHaveBeenCalledWith(mockConfigDir, 0o700);
      expect(mockFs.chmodSync).toHaveBeenCalledWith(mockConfigFile, 0o600);
    });

    it("should write config with restricted permissions", async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.chmodSync.mockReturnValue(undefined);
      mockFs.writeFileSync.mockReturnValue(undefined);

      const { saveConfig } = await import("./config");
      const config = { key: "lpk_test", server: "https://example.com" };
      saveConfig(config);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockConfigFile,
        JSON.stringify(config, null, 2),
        { mode: 0o600 }
      );
    });

    it("should throw error on write failure", async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.chmodSync.mockReturnValue(undefined);
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const { saveConfig } = await import("./config");

      expect(() => saveConfig({ key: "test" })).toThrow(
        "Failed to save config: Permission denied"
      );
    });
  });

  describe("getConfigValue", () => {
    it("should prioritize CLI value over env and config", async () => {
      process.env.LIVEPORT_KEY = "env_key";
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ key: "config_key" }));

      const { getConfigValue } = await import("./config");
      const value = getConfigValue("key", "cli_key", "LIVEPORT_KEY");

      expect(value).toBe("cli_key");

      delete process.env.LIVEPORT_KEY;
    });

    it("should use env value when CLI value is not provided", async () => {
      process.env.LIVEPORT_KEY = "env_key";
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ key: "config_key" }));

      const { getConfigValue } = await import("./config");
      const value = getConfigValue("key", undefined, "LIVEPORT_KEY");

      expect(value).toBe("env_key");

      delete process.env.LIVEPORT_KEY;
    });

    it("should use config value when CLI and env are not provided", async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ key: "config_key" }));

      const { getConfigValue } = await import("./config");
      const value = getConfigValue("key", undefined, "LIVEPORT_KEY");

      expect(value).toBe("config_key");
    });

    it("should return undefined when no value is available", async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { getConfigValue } = await import("./config");
      const value = getConfigValue("key", undefined, "LIVEPORT_KEY");

      expect(value).toBeUndefined();
    });
  });

  describe("getConfigPath", () => {
    it("should return the config file path", async () => {
      const { getConfigPath } = await import("./config");
      const configPath = getConfigPath();

      expect(configPath).toBe(mockConfigFile);
    });
  });
});
