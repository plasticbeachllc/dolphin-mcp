/**
 * Configuration management for Dolphin MCP Bridge
 *
 * This module provides centralized configuration handling with validation,
 * environment variable parsing, and configuration limits for the parallel
 * snippet fetching feature.
 */

/**
 * Configuration limits and validation constants
 */
export const CONFIG_LIMITS = {
  MIN_CONCURRENT: 1,
  RECOMMENDED_CONCURRENT: 8,
  MAX_CONCURRENT: 12, // Upper bound (FastAPI can handle more)
  MIN_TIMEOUT: 500,
  MAX_TIMEOUT: 10000,
  MIN_RETRIES: 0,
  MAX_RETRIES: 3,
} as const;

/**
 * Get integer configuration from environment with validation
 */
function getIntConfig(
  envVar: string | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  const value = envVar ? parseInt(envVar, 10) : defaultValue;

  if (isNaN(value)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(max, value));
}

/**
 * Get string configuration from environment
 */
function getStringConfig(envVar: string | undefined, defaultValue: string): string {
  return envVar?.trim() || defaultValue;
}

/**
 * Centralized configuration object
 */
export const CONFIG = {
  // API Configuration
  DOLPHIN_API_URL: getStringConfig(
    process.env.DOLPHIN_API_URL || process.env.KB_REST_BASE_URL,
    "http://127.0.0.1:7777"
  ),

  // Server Configuration
  SERVER_NAME: getStringConfig(process.env.SERVER_NAME, "dolphin-mcp"),
  SERVER_VERSION: getStringConfig(process.env.SERVER_VERSION, "1.0.0"),

  // Logging Configuration
  LOG_LEVEL: getStringConfig(process.env.LOG_LEVEL, "info"),

  // Parallel Snippet Fetching Configuration
  MAX_CONCURRENT_SNIPPET_FETCH: getIntConfig(
    process.env.MAX_CONCURRENT_SNIPPET_FETCH,
    CONFIG_LIMITS.RECOMMENDED_CONCURRENT,
    CONFIG_LIMITS.MIN_CONCURRENT,
    CONFIG_LIMITS.MAX_CONCURRENT
  ),

  SNIPPET_FETCH_TIMEOUT_MS: getIntConfig(
    process.env.SNIPPET_FETCH_TIMEOUT_MS,
    1500,
    CONFIG_LIMITS.MIN_TIMEOUT,
    CONFIG_LIMITS.MAX_TIMEOUT
  ),

  SNIPPET_FETCH_RETRY_ATTEMPTS: getIntConfig(
    process.env.SNIPPET_FETCH_RETRY_ATTEMPTS,
    1,
    CONFIG_LIMITS.MIN_RETRIES,
    CONFIG_LIMITS.MAX_RETRIES
  ),
} as const;

/**
 * Validate current configuration and return any warnings
 */
export function validateConfig(): string[] {
  const warnings: string[] = [];

  // Validate DOLPHIN_API_URL format
  try {
    new URL(CONFIG.DOLPHIN_API_URL);
  } catch {
    warnings.push(`Invalid DOLPHIN_API_URL format: ${CONFIG.DOLPHIN_API_URL}`);
  }

  // Validate LOG_LEVEL
  const validLogLevels = ["debug", "info", "warn", "error"];
  if (!validLogLevels.includes(CONFIG.LOG_LEVEL)) {
    warnings.push(`Invalid LOG_LEVEL: ${CONFIG.LOG_LEVEL}. Valid: ${validLogLevels.join(", ")}`);
  }

  // Validate concurrency settings
  if (CONFIG.MAX_CONCURRENT_SNIPPET_FETCH < CONFIG_LIMITS.MIN_CONCURRENT) {
    warnings.push(
      `MAX_CONCURRENT_SNIPPET_FETCH too low: ${CONFIG.MAX_CONCURRENT_SNIPPET_FETCH}. Min: ${CONFIG_LIMITS.MIN_CONCURRENT}`
    );
  }

  if (CONFIG.MAX_CONCURRENT_SNIPPET_FETCH > CONFIG_LIMITS.MAX_CONCURRENT) {
    warnings.push(
      `MAX_CONCURRENT_SNIPPET_FETCH too high: ${CONFIG.MAX_CONCURRENT_SNIPPET_FETCH}. Max: ${CONFIG_LIMITS.MAX_CONCURRENT}`
    );
  }

  // Validate timeout settings
  if (CONFIG.SNIPPET_FETCH_TIMEOUT_MS < CONFIG_LIMITS.MIN_TIMEOUT) {
    warnings.push(
      `SNIPPET_FETCH_TIMEOUT_MS too low: ${CONFIG.SNIPPET_FETCH_TIMEOUT_MS}. Min: ${CONFIG_LIMITS.MIN_TIMEOUT}ms`
    );
  }

  if (CONFIG.SNIPPET_FETCH_TIMEOUT_MS > CONFIG_LIMITS.MAX_TIMEOUT) {
    warnings.push(
      `SNIPPET_FETCH_TIMEOUT_MS too high: ${CONFIG.SNIPPET_FETCH_TIMEOUT_MS}. Max: ${CONFIG_LIMITS.MAX_TIMEOUT}ms`
    );
  }

  // Validate retry settings
  if (CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS < CONFIG_LIMITS.MIN_RETRIES) {
    warnings.push(
      `SNIPPET_FETCH_RETRY_ATTEMPTS too low: ${CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS}. Min: ${CONFIG_LIMITS.MIN_RETRIES}`
    );
  }

  if (CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS > CONFIG_LIMITS.MAX_RETRIES) {
    warnings.push(
      `SNIPPET_FETCH_RETRY_ATTEMPTS too high: ${CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS}. Max: ${CONFIG_LIMITS.MAX_RETRIES}`
    );
  }

  return warnings;
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary(): Record<string, unknown> {
  return {
    dolphin_api_url: CONFIG.DOLPHIN_API_URL,
    server_name: CONFIG.SERVER_NAME,
    server_version: CONFIG.SERVER_VERSION,
    log_level: CONFIG.LOG_LEVEL,
    max_concurrent_snippet_fetch: CONFIG.MAX_CONCURRENT_SNIPPET_FETCH,
    snippet_fetch_timeout_ms: CONFIG.SNIPPET_FETCH_TIMEOUT_MS,
    snippet_fetch_retry_attempts: CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS,
  };
}

/**
 * Configuration presets for different use cases
 */
export const CONFIG_PRESETS = {
  CONSERVATIVE: {
    MAX_CONCURRENT_SNIPPET_FETCH: 4,
    SNIPPET_FETCH_TIMEOUT_MS: 1500,
    SNIPPET_FETCH_RETRY_ATTEMPTS: 1,
  },

  RECOMMENDED: {
    MAX_CONCURRENT_SNIPPET_FETCH: CONFIG_LIMITS.RECOMMENDED_CONCURRENT,
    SNIPPET_FETCH_TIMEOUT_MS: 2000,
    SNIPPET_FETCH_RETRY_ATTEMPTS: 1,
  },

  PERFORMANCE: {
    MAX_CONCURRENT_SNIPPET_FETCH: 10,
    SNIPPET_FETCH_TIMEOUT_MS: 3000,
    SNIPPET_FETCH_RETRY_ATTEMPTS: 2,
  },
} as const;

/**
 * Type definitions for configuration
 */
export type Config = typeof CONFIG;
export type ConfigPreset = keyof typeof CONFIG_PRESETS;
