export interface Theme {
  amber: (text: string) => string;
  warmGold: (text: string) => string;
  warmGreen: (text: string) => string;
  warmRed: (text: string) => string;
  warmMuted: (text: string) => string;
  divider: (text: string) => string;
  subDivider: (text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
}

export function isColorSupported(): boolean {
  if (typeof process === "undefined") return false;

  if (process.env?.NO_COLOR !== undefined || process.env?.NODE_DISABLE_COLORS === "1") {
    return false;
  }

  if (process.env?.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }

  // During automated tests, avoid injecting escape codes unless explicitly requested
  if (process.env?.NODE_ENV === "test" || process.env?.VITEST === "true") {
    return false;
  }

  return Boolean(process.stdout?.isTTY);
}

export function isTrueColorSupported(): boolean {
  if (!isColorSupported()) return false;
  const term = process.env?.COLORTERM?.toLowerCase();
  if (term === "truecolor" || term === "24bit") return true;
  if (process.platform === "darwin") return true;
  if (
    process.env?.TERM_PROGRAM === "vscode" ||
    process.env?.TERM_PROGRAM === "iTerm.app" ||
    process.env?.TERM_PROGRAM === "Apple_Terminal" ||
    process.env?.TERM_PROGRAM === "ghostty" ||
    process.env?.TERM_PROGRAM === "WarpTerminal"
  ) {
    return true;
  }
  return false;
}

function colorize(text: string, rgb: [number, number, number], fallbackAnsi: number, useColors: boolean, trueColor: boolean): string {
  if (!useColors || text.length === 0) return text;
  if (trueColor) {
    return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[0m`;
  }
  return `\x1b[${fallbackAnsi}m${text}\x1b[0m`;
}

function style(text: string, code: number, useColors: boolean): string {
  if (!useColors || text.length === 0) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export function createTheme(enabled?: boolean): Theme {
  const useColors = enabled ?? isColorSupported();
  const trueColor = isTrueColorSupported();

  return {
    // Warm Amber - Primary brand and top divider accent (#F59E0B)
    amber: (t) => colorize(t, [245, 158, 11], 33, useColors, trueColor),
    // Warm Gold - Durations and timing metrics (#FBBF24)
    warmGold: (t) => colorize(t, [251, 191, 36], 93, useColors, trueColor),
    // Warm Green - Success indicators and checkmarks (#34D399)
    warmGreen: (t) => colorize(t, [52, 211, 153], 32, useColors, trueColor),
    // Warm Coral Red - Error messages and crossmarks (#F87171)
    warmRed: (t) => colorize(t, [248, 113, 113], 31, useColors, trueColor),
    // Warm Muted - Subdued labels, bullets, and secondary notes (#A8A29E)
    warmMuted: (t) => colorize(t, [168, 162, 158], 90, useColors, trueColor),
    // Divider - Prominent border bars (#D97706)
    divider: (t) => colorize(t, [217, 119, 6], 33, useColors, trueColor),
    // SubDivider - Inner separator lines (#78716C)
    subDivider: (t) => colorize(t, [120, 113, 108], 90, useColors, trueColor),
    // Text formatting
    bold: (t) => style(t, 1, useColors),
    dim: (t) => style(t, 2, useColors),
  };
}
