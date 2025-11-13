// Centralized language mapping utility

/**
 * Language mapping configuration
 */
export interface LanguageMapping {
  extensions: string[];
  mimeType: string;
  fenceName: string;
  languageNames: string[];
}

/**
 * Supported language mappings
 */
export const LANGUAGE_MAPPINGS: readonly LanguageMapping[] = [
  {
    extensions: [".py"],
    mimeType: "text/x-python",
    fenceName: "python",
    languageNames: ["python", "py"],
  },
  {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    mimeType: "text/x-typescript",
    fenceName: "ts",
    languageNames: ["typescript", "ts", "tsx", "javascript", "js", "jsx"],
  },
  {
    extensions: [".md"],
    mimeType: "text/markdown",
    fenceName: "markdown",
    languageNames: ["markdown", "md"],
  },
  {
    extensions: [".json"],
    mimeType: "application/json",
    fenceName: "json",
    languageNames: ["json"],
  },
  {
    extensions: [".html", ".htm"],
    mimeType: "text/html",
    fenceName: "html",
    languageNames: ["html"],
  },
  {
    extensions: [".css"],
    mimeType: "text/css",
    fenceName: "css",
    languageNames: ["css"],
  },
  {
    extensions: [".yaml", ".yml"],
    mimeType: "text/yaml",
    fenceName: "yaml",
    languageNames: ["yaml", "yml"],
  },
] as const;

/**
 * Get language info from language name or file path
 */
export function getLanguageInfo(
  lang?: string,
  path?: string
): {
  mimeType: string;
  fenceName: string | undefined;
} {
  const normalizedLang = lang?.toLowerCase();
  const normalizedPath = path?.toLowerCase();

  // First, try to match by language name
  if (normalizedLang) {
    const mapping = LANGUAGE_MAPPINGS.find((m) => m.languageNames.includes(normalizedLang));
    if (mapping) {
      return {
        mimeType: mapping.mimeType,
        fenceName: mapping.fenceName,
      };
    }
  }

  // Then, try to match by file extension
  if (normalizedPath) {
    const mapping = LANGUAGE_MAPPINGS.find((m) =>
      m.extensions.some((ext) => normalizedPath.endsWith(ext))
    );
    if (mapping) {
      return {
        mimeType: mapping.mimeType,
        fenceName: mapping.fenceName,
      };
    }
  }

  // Default to plain text
  return {
    mimeType: "text/plain",
    fenceName: undefined,
  };
}

/**
 * Get MIME type from language or path
 */
export function mimeFromLangOrPath(lang?: string, path?: string): string {
  return getLanguageInfo(lang, path).mimeType;
}

/**
 * Get fence language name from language or path
 */
export function fenceLang(lang?: string, path?: string): string | undefined {
  return getLanguageInfo(lang, path).fenceName;
}
