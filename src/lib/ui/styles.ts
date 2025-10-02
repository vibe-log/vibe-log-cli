import chalk from 'chalk';

// Helper function to safely use chalk.hex with fallback
const safeHex = (color: string, fallback: any) => {
  try {
    return chalk.hex ? chalk.hex(color) : fallback;
  } catch {
    return fallback;
  }
};

// Color palette - optimized for visibility on both dark and light terminals
export const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,  // Changed from blue to cyan for better visibility
  muted: safeHex('#808080', chalk.gray),  // Brighter gray for better visibility on black terminals
  accent: chalk.magenta,
  highlight: chalk.bold.cyan,  // Changed from white to cyan for visibility on light terminals
  dim: safeHex('#606060', chalk.dim),  // Custom gray instead of chalk.dim for consistency

  // Semantic helpers for better readability
  subdued: safeHex('#909090', chalk.gray),  // Increased contrast for better readability
  hint: safeHex('#7A8290', chalk.gray),     // Slightly brighter for better visibility
  inactive: safeHex('#4B5563', chalk.dim),  // For disabled/inactive items
};

// Icons
export const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠️',
  info: 'ℹ️',
  bullet: '•',
  arrow: '→',
  cloud: '☁️',
  local: '💻',
  folder: '📁',
  file: '📄',
  clock: '🕐',
  fire: '🔥',
  star: '⭐',
  chart: '📊',
  chartUp: '📈',
  check: '✅',
  cross: '❌',
  loading: '⏳',
  sync: '🔄',
  lock: '🔒',
  unlock: '🔓',
  package: '📦',
  rocket: '🚀',
  sparkles: '✨',
  search: '🔍',  // Added missing search icon
  refresh: '🔄',  // Added refresh icon for retry
  settings: '🔧',  // Settings/configuration icon
  plus: '➕',  // Add/install icon
  minus: '➖',  // Remove/uninstall icon
  flask: '🧪',  // Test/experiment icon
};

// Box drawing characters
export const box = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  cross: '┼',
  tLeft: '├',
  tRight: '┤',
  tTop: '┬',
  tBottom: '┴',
  doubleHorizontal: '═',
  doubleVertical: '║',
  doubleTopLeft: '╔',
  doubleTopRight: '╗',
  doubleBottomLeft: '╚',
  doubleBottomRight: '╝',
  doubleTLeft: '╠',
  doubleTRight: '╣',
};

// Progress bar characters
export const progress = {
  full: '█',
  three_quarters: '▓',
  half: '▒',
  quarter: '░',
  empty: '░',
};

// Formatters
export const format = {
  bold: chalk.bold,
  dim: chalk.dim,
  italic: chalk.italic,
  underline: chalk.underline,
  inverse: chalk.inverse,
  strikethrough: chalk.strikethrough,
};

// Utility functions
export function center(text: string, width: number): string {
  // eslint-disable-next-line no-control-regex
  const textLength = text.replace(/\u001b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, Math.floor((width - textLength) / 2));
  return ' '.repeat(padding) + text;
}

export function padRight(text: string, width: number): string {
  // eslint-disable-next-line no-control-regex
  const textLength = text.replace(/\u001b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, width - textLength);
  return text + ' '.repeat(padding);
}

export function padLeft(text: string, width: number): string {
  // eslint-disable-next-line no-control-regex
  const textLength = text.replace(/\u001b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, width - textLength);
  return ' '.repeat(padding) + text;
}

export function truncate(text: string, maxLength: number): string {
  // eslint-disable-next-line no-control-regex
  const cleanText = text.replace(/\u001b\[[0-9;]*m/g, '');
  if (cleanText.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Terminal width helper
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

// Create a horizontal line
export function horizontalLine(char: string = box.horizontal, width?: number): string {
  const w = width || getTerminalWidth();
  return char.repeat(w);
}

// Create a section divider
export function sectionDivider(title?: string): string {
  const width = getTerminalWidth();
  if (!title) {
    return colors.muted(horizontalLine(box.horizontal, width));
  }
  
  const titleWithSpaces = ` ${title} `;
  // eslint-disable-next-line no-control-regex
  const titleLength = titleWithSpaces.replace(/\u001b\[[0-9;]*m/g, '').length;
  const leftWidth = Math.floor((width - titleLength) / 2);
  const rightWidth = width - titleLength - leftWidth;
  
  return colors.muted(
    box.horizontal.repeat(Math.max(0, leftWidth)) +
    colors.primary(titleWithSpaces) +
    box.horizontal.repeat(Math.max(0, rightWidth))
  );
}