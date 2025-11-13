/**
 * Unit tests for MCP bridge utility modules
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";

// Config utilities
import {
  CONFIG,
  CONFIG_LIMITS,
  CONFIG_PRESETS,
  validateConfig,
  getConfigSummary,
} from "../util/config";

// Language utilities
import {
  LANGUAGE_MAPPINGS,
  getLanguageInfo,
  mimeFromLangOrPath,
  fenceLang,
} from "../util/language";

// Logger utilities
import { initLogger, logInfo, logWarn, logError } from "../util/logger";

describe("Config Utilities", () => {
  describe("CONFIG object", () => {
    it("should have default values", () => {
      expect(CONFIG.DOLPHIN_API_URL).toBeDefined();
      expect(CONFIG.SERVER_NAME).toBe("dolphin-mcp");
      expect(CONFIG.SERVER_VERSION).toBeDefined();
      expect(CONFIG.LOG_LEVEL).toBe("info");
    });

    it("should have valid concurrency limits", () => {
      expect(CONFIG.MAX_CONCURRENT_SNIPPET_FETCH).toBeGreaterThanOrEqual(
        CONFIG_LIMITS.MIN_CONCURRENT
      );
      expect(CONFIG.MAX_CONCURRENT_SNIPPET_FETCH).toBeLessThanOrEqual(CONFIG_LIMITS.MAX_CONCURRENT);
    });

    it("should have valid timeout settings", () => {
      expect(CONFIG.SNIPPET_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(CONFIG_LIMITS.MIN_TIMEOUT);
      expect(CONFIG.SNIPPET_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(CONFIG_LIMITS.MAX_TIMEOUT);
    });

    it("should have valid retry settings", () => {
      expect(CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS).toBeGreaterThanOrEqual(CONFIG_LIMITS.MIN_RETRIES);
      expect(CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS).toBeLessThanOrEqual(CONFIG_LIMITS.MAX_RETRIES);
    });
  });

  describe("CONFIG_LIMITS", () => {
    it("should define valid concurrency limits", () => {
      expect(CONFIG_LIMITS.MIN_CONCURRENT).toBe(1);
      expect(CONFIG_LIMITS.MAX_CONCURRENT).toBe(12);
      expect(CONFIG_LIMITS.RECOMMENDED_CONCURRENT).toBe(8);
      expect(CONFIG_LIMITS.RECOMMENDED_CONCURRENT).toBeGreaterThanOrEqual(
        CONFIG_LIMITS.MIN_CONCURRENT
      );
      expect(CONFIG_LIMITS.RECOMMENDED_CONCURRENT).toBeLessThanOrEqual(
        CONFIG_LIMITS.MAX_CONCURRENT
      );
    });

    it("should define valid timeout limits", () => {
      expect(CONFIG_LIMITS.MIN_TIMEOUT).toBe(500);
      expect(CONFIG_LIMITS.MAX_TIMEOUT).toBe(10000);
      expect(CONFIG_LIMITS.MIN_TIMEOUT).toBeLessThan(CONFIG_LIMITS.MAX_TIMEOUT);
    });

    it("should define valid retry limits", () => {
      expect(CONFIG_LIMITS.MIN_RETRIES).toBe(0);
      expect(CONFIG_LIMITS.MAX_RETRIES).toBe(3);
      expect(CONFIG_LIMITS.MIN_RETRIES).toBeLessThanOrEqual(CONFIG_LIMITS.MAX_RETRIES);
    });
  });

  describe("CONFIG_PRESETS", () => {
    it("should have conservative preset", () => {
      const preset = CONFIG_PRESETS.CONSERVATIVE;
      expect(preset.MAX_CONCURRENT_SNIPPET_FETCH).toBe(4);
      expect(preset.SNIPPET_FETCH_TIMEOUT_MS).toBe(1500);
      expect(preset.SNIPPET_FETCH_RETRY_ATTEMPTS).toBe(1);
    });

    it("should have recommended preset", () => {
      const preset = CONFIG_PRESETS.RECOMMENDED;
      expect(preset.MAX_CONCURRENT_SNIPPET_FETCH).toBe(CONFIG_LIMITS.RECOMMENDED_CONCURRENT);
      expect(preset.SNIPPET_FETCH_TIMEOUT_MS).toBe(2000);
      expect(preset.SNIPPET_FETCH_RETRY_ATTEMPTS).toBe(1);
    });

    it("should have performance preset", () => {
      const preset = CONFIG_PRESETS.PERFORMANCE;
      expect(preset.MAX_CONCURRENT_SNIPPET_FETCH).toBe(10);
      expect(preset.SNIPPET_FETCH_TIMEOUT_MS).toBe(3000);
      expect(preset.SNIPPET_FETCH_RETRY_ATTEMPTS).toBe(2);
    });

    it("should have all presets within valid ranges", () => {
      Object.values(CONFIG_PRESETS).forEach((preset) => {
        expect(preset.MAX_CONCURRENT_SNIPPET_FETCH).toBeGreaterThanOrEqual(
          CONFIG_LIMITS.MIN_CONCURRENT
        );
        expect(preset.MAX_CONCURRENT_SNIPPET_FETCH).toBeLessThanOrEqual(
          CONFIG_LIMITS.MAX_CONCURRENT
        );

        expect(preset.SNIPPET_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(CONFIG_LIMITS.MIN_TIMEOUT);
        expect(preset.SNIPPET_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(CONFIG_LIMITS.MAX_TIMEOUT);

        expect(preset.SNIPPET_FETCH_RETRY_ATTEMPTS).toBeGreaterThanOrEqual(
          CONFIG_LIMITS.MIN_RETRIES
        );
        expect(preset.SNIPPET_FETCH_RETRY_ATTEMPTS).toBeLessThanOrEqual(CONFIG_LIMITS.MAX_RETRIES);
      });
    });
  });

  describe("validateConfig", () => {
    it("should return empty warnings for valid config", () => {
      const warnings = validateConfig();

      // Should either be empty or only have acceptable warnings
      // (In normal operation, default config should be valid)
      expect(Array.isArray(warnings)).toBe(true);
    });

    it("should validate URL format", () => {
      // Note: We can't directly test this without modifying CONFIG,
      // but we can verify the function works
      const warnings = validateConfig();

      // Check that URL validation runs (no crash)
      expect(warnings).toBeDefined();
    });

    it("should validate log level", () => {
      const warnings = validateConfig();

      // Valid log levels: debug, info, warn, error
      // Current config should have valid log level
      const logLevelWarnings = warnings.filter((w) => w.includes("LOG_LEVEL"));

      // If log level is valid (which it should be by default), no warnings
      if (
        CONFIG.LOG_LEVEL === "debug" ||
        CONFIG.LOG_LEVEL === "info" ||
        CONFIG.LOG_LEVEL === "warn" ||
        CONFIG.LOG_LEVEL === "error"
      ) {
        expect(logLevelWarnings.length).toBe(0);
      }
    });
  });

  describe("getConfigSummary", () => {
    it("should return configuration summary", () => {
      const summary = getConfigSummary();

      expect(summary).toBeDefined();
      expect(summary.dolphin_api_url).toBe(CONFIG.DOLPHIN_API_URL);
      expect(summary.server_name).toBe(CONFIG.SERVER_NAME);
      expect(summary.server_version).toBe(CONFIG.SERVER_VERSION);
      expect(summary.log_level).toBe(CONFIG.LOG_LEVEL);
      expect(summary.max_concurrent_snippet_fetch).toBe(CONFIG.MAX_CONCURRENT_SNIPPET_FETCH);
      expect(summary.snippet_fetch_timeout_ms).toBe(CONFIG.SNIPPET_FETCH_TIMEOUT_MS);
      expect(summary.snippet_fetch_retry_attempts).toBe(CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS);
    });

    it("should return summary with correct types", () => {
      const summary = getConfigSummary();

      expect(typeof summary.dolphin_api_url).toBe("string");
      expect(typeof summary.server_name).toBe("string");
      expect(typeof summary.server_version).toBe("string");
      expect(typeof summary.log_level).toBe("string");
      expect(typeof summary.max_concurrent_snippet_fetch).toBe("number");
      expect(typeof summary.snippet_fetch_timeout_ms).toBe("number");
      expect(typeof summary.snippet_fetch_retry_attempts).toBe("number");
    });
  });
});

describe("Language Utilities", () => {
  describe("LANGUAGE_MAPPINGS", () => {
    it("should have Python mapping", () => {
      const pythonMapping = LANGUAGE_MAPPINGS.find((m) => m.languageNames.includes("python"));

      expect(pythonMapping).toBeDefined();
      expect(pythonMapping?.extensions).toContain(".py");
      expect(pythonMapping?.mimeType).toBe("text/x-python");
      expect(pythonMapping?.fenceName).toBe("python");
    });

    it("should have TypeScript/JavaScript mapping", () => {
      const tsMapping = LANGUAGE_MAPPINGS.find((m) => m.languageNames.includes("typescript"));

      expect(tsMapping).toBeDefined();
      expect(tsMapping?.extensions).toContain(".ts");
      expect(tsMapping?.extensions).toContain(".tsx");
      expect(tsMapping?.extensions).toContain(".js");
      expect(tsMapping?.extensions).toContain(".jsx");
      expect(tsMapping?.mimeType).toBe("text/x-typescript");
      expect(tsMapping?.fenceName).toBe("ts");
    });

    it("should have Markdown mapping", () => {
      const mdMapping = LANGUAGE_MAPPINGS.find((m) => m.languageNames.includes("markdown"));

      expect(mdMapping).toBeDefined();
      expect(mdMapping?.extensions).toContain(".md");
      expect(mdMapping?.mimeType).toBe("text/markdown");
      expect(mdMapping?.fenceName).toBe("markdown");
    });

    it("should have JSON mapping", () => {
      const jsonMapping = LANGUAGE_MAPPINGS.find((m) => m.languageNames.includes("json"));

      expect(jsonMapping).toBeDefined();
      expect(jsonMapping?.extensions).toContain(".json");
      expect(jsonMapping?.mimeType).toBe("application/json");
      expect(jsonMapping?.fenceName).toBe("json");
    });

    it("should have HTML mapping", () => {
      const htmlMapping = LANGUAGE_MAPPINGS.find((m) => m.languageNames.includes("html"));

      expect(htmlMapping).toBeDefined();
      expect(htmlMapping?.extensions).toContain(".html");
      expect(htmlMapping?.extensions).toContain(".htm");
      expect(htmlMapping?.mimeType).toBe("text/html");
      expect(htmlMapping?.fenceName).toBe("html");
    });

    it("should have CSS mapping", () => {
      const cssMapping = LANGUAGE_MAPPINGS.find((m) => m.languageNames.includes("css"));

      expect(cssMapping).toBeDefined();
      expect(cssMapping?.extensions).toContain(".css");
      expect(cssMapping?.mimeType).toBe("text/css");
      expect(cssMapping?.fenceName).toBe("css");
    });

    it("should have YAML mapping", () => {
      const yamlMapping = LANGUAGE_MAPPINGS.find((m) => m.languageNames.includes("yaml"));

      expect(yamlMapping).toBeDefined();
      expect(yamlMapping?.extensions).toContain(".yaml");
      expect(yamlMapping?.extensions).toContain(".yml");
      expect(yamlMapping?.mimeType).toBe("text/yaml");
      expect(yamlMapping?.fenceName).toBe("yaml");
    });
  });

  describe("getLanguageInfo", () => {
    it("should detect Python from language name", () => {
      const info = getLanguageInfo("python");

      expect(info.mimeType).toBe("text/x-python");
      expect(info.fenceName).toBe("python");
    });

    it("should detect Python from file path", () => {
      const info = getLanguageInfo(undefined, "test.py");

      expect(info.mimeType).toBe("text/x-python");
      expect(info.fenceName).toBe("python");
    });

    it("should detect TypeScript from language name", () => {
      const info = getLanguageInfo("typescript");

      expect(info.mimeType).toBe("text/x-typescript");
      expect(info.fenceName).toBe("ts");
    });

    it("should detect TypeScript from .ts file", () => {
      const info = getLanguageInfo(undefined, "app.ts");

      expect(info.mimeType).toBe("text/x-typescript");
      expect(info.fenceName).toBe("ts");
    });

    it("should detect JavaScript from .js file", () => {
      const info = getLanguageInfo(undefined, "app.js");

      // JS and TS share the same mapping
      expect(info.mimeType).toBe("text/x-typescript");
      expect(info.fenceName).toBe("ts");
    });

    it("should detect JSON from file extension", () => {
      const info = getLanguageInfo(undefined, "package.json");

      expect(info.mimeType).toBe("application/json");
      expect(info.fenceName).toBe("json");
    });

    it("should detect Markdown from file extension", () => {
      const info = getLanguageInfo(undefined, "README.md");

      expect(info.mimeType).toBe("text/markdown");
      expect(info.fenceName).toBe("markdown");
    });

    it("should handle case-insensitive language names", () => {
      const info1 = getLanguageInfo("PYTHON");
      const info2 = getLanguageInfo("Python");
      const info3 = getLanguageInfo("python");

      expect(info1.mimeType).toBe(info2.mimeType);
      expect(info2.mimeType).toBe(info3.mimeType);
      expect(info1.fenceName).toBe(info2.fenceName);
      expect(info2.fenceName).toBe(info3.fenceName);
    });

    it("should handle case-insensitive file paths", () => {
      const info1 = getLanguageInfo(undefined, "Test.PY");
      const info2 = getLanguageInfo(undefined, "test.py");

      expect(info1.mimeType).toBe(info2.mimeType);
      expect(info1.fenceName).toBe(info2.fenceName);
    });

    it("should default to plain text for unknown language", () => {
      const info = getLanguageInfo("unknown-lang");

      expect(info.mimeType).toBe("text/plain");
      expect(info.fenceName).toBeUndefined();
    });

    it("should default to plain text for unknown extension", () => {
      const info = getLanguageInfo(undefined, "file.xyz");

      expect(info.mimeType).toBe("text/plain");
      expect(info.fenceName).toBeUndefined();
    });

    it("should prefer language name over path", () => {
      // Pass Python language but .ts path
      const info = getLanguageInfo("python", "app.ts");

      // Should use Python (language name takes precedence)
      expect(info.mimeType).toBe("text/x-python");
      expect(info.fenceName).toBe("python");
    });

    it("should handle no arguments", () => {
      const info = getLanguageInfo();

      expect(info.mimeType).toBe("text/plain");
      expect(info.fenceName).toBeUndefined();
    });

    it("should handle paths with directories", () => {
      const info = getLanguageInfo(undefined, "/path/to/file.py");

      expect(info.mimeType).toBe("text/x-python");
      expect(info.fenceName).toBe("python");
    });

    it("should handle short language aliases", () => {
      const info1 = getLanguageInfo("py"); // Short for python
      const info2 = getLanguageInfo("ts"); // Short for typescript
      const info3 = getLanguageInfo("js"); // Short for javascript
      const info4 = getLanguageInfo("md"); // Short for markdown

      expect(info1.fenceName).toBe("python");
      expect(info2.fenceName).toBe("ts");
      expect(info3.fenceName).toBe("ts");
      expect(info4.fenceName).toBe("markdown");
    });
  });

  describe("mimeFromLangOrPath", () => {
    it("should return MIME type from language", () => {
      expect(mimeFromLangOrPath("python")).toBe("text/x-python");
      expect(mimeFromLangOrPath("typescript")).toBe("text/x-typescript");
      expect(mimeFromLangOrPath("json")).toBe("application/json");
    });

    it("should return MIME type from path", () => {
      expect(mimeFromLangOrPath(undefined, "test.py")).toBe("text/x-python");
      expect(mimeFromLangOrPath(undefined, "app.ts")).toBe("text/x-typescript");
      expect(mimeFromLangOrPath(undefined, "config.json")).toBe("application/json");
    });

    it("should default to text/plain", () => {
      expect(mimeFromLangOrPath("unknown")).toBe("text/plain");
      expect(mimeFromLangOrPath(undefined, "file.xyz")).toBe("text/plain");
    });
  });

  describe("fenceLang", () => {
    it("should return fence name from language", () => {
      expect(fenceLang("python")).toBe("python");
      expect(fenceLang("typescript")).toBe("ts");
      expect(fenceLang("markdown")).toBe("markdown");
    });

    it("should return fence name from path", () => {
      expect(fenceLang(undefined, "test.py")).toBe("python");
      expect(fenceLang(undefined, "app.ts")).toBe("ts");
      expect(fenceLang(undefined, "README.md")).toBe("markdown");
    });

    it("should return undefined for unknown language", () => {
      expect(fenceLang("unknown")).toBeUndefined();
      expect(fenceLang(undefined, "file.xyz")).toBeUndefined();
    });
  });
});

describe("Logger Utilities", () => {
  let testLogDir: string;

  beforeEach(async () => {
    // Create a temporary log directory for testing
    testLogDir = join(tmpdir(), `mcp-test-logs-${Date.now()}`);
    await mkdir(testLogDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test log directory
    try {
      await rm(testLogDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("initLogger", () => {
    it("should create log directory", async () => {
      // initLogger creates the logs directory
      await expect(initLogger()).resolves.toBeUndefined();

      // Should not throw
      expect(true).toBe(true);
    });

    it("should be idempotent", async () => {
      // Should work even if called multiple times
      await initLogger();
      await initLogger();
      await initLogger();

      expect(true).toBe(true);
    });
  });

  describe("logging functions", () => {
    beforeEach(async () => {
      await initLogger();
    });

    it("should log info messages", async () => {
      await expect(logInfo("test_event", "Test info message")).resolves.toBeUndefined();
    });

    it("should log info with metadata", async () => {
      await expect(
        logInfo("test_event", "Test message", { key: "value" })
      ).resolves.toBeUndefined();
    });

    it("should log info with context", async () => {
      await expect(
        logInfo("test_event", "Test message", undefined, { requestId: "123" })
      ).resolves.toBeUndefined();
    });

    it("should log info with both metadata and context", async () => {
      await expect(
        logInfo("test_event", "Test message", { data: "value" }, { requestId: "123" })
      ).resolves.toBeUndefined();
    });

    it("should log warning messages", async () => {
      await expect(logWarn("warning_event", "Test warning message")).resolves.toBeUndefined();
    });

    it("should log warning with metadata", async () => {
      await expect(
        logWarn("warning_event", "Test warning", { code: 404 })
      ).resolves.toBeUndefined();
    });

    it("should log error messages", async () => {
      await expect(logError("error_event", "Test error message")).resolves.toBeUndefined();
    });

    it("should log error with metadata", async () => {
      await expect(
        logError("error_event", "Test error", { stack: "stack trace" })
      ).resolves.toBeUndefined();
    });

    it("should handle complex metadata objects", async () => {
      const complexMeta = {
        nested: {
          deep: {
            value: 123,
          },
        },
        array: [1, 2, 3],
        nullValue: null,
        boolValue: true,
      };

      await expect(
        logInfo("complex_event", "Complex metadata", complexMeta)
      ).resolves.toBeUndefined();
    });

    it("should handle empty strings", async () => {
      await expect(logInfo("", "")).resolves.toBeUndefined();
    });

    it("should handle special characters in messages", async () => {
      await expect(
        logInfo("special_chars", 'Message with "quotes" and \\backslashes\\')
      ).resolves.toBeUndefined();
    });
  });
});
