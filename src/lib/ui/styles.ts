import chalk from 'chalk';

// Color palette - optimized for visibility on dark terminals
export const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,  // Changed from blue to cyan for better visibility
  muted: chalk.hex('#808080'),  // Brighter gray for better visibility on black terminals
  accent: chalk.magenta,
  highlight: chalk.bold.white,
  dim: chalk.hex('#606060'),  // Custom gray instead of chalk.dim for consistency
  
  // Semantic helpers for better readability
  subdued: chalk.hex('#707070'),  // For secondary text
  hint: chalk.hex('#6B7280'),     // For help text and instructions
  inactive: chalk.hex('#4B5563'),  // For disabled/inactive items
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
  const textLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, Math.floor((width - textLength) / 2));
  return ' '.repeat(padding) + text;
}

export function padRight(text: string, width: number): string {
  const textLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, width - textLength);
  return text + ' '.repeat(padding);
}

export function padLeft(text: string, width: number): string {
  const textLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, width - textLength);
  return ' '.repeat(padding) + text;
}

export function truncate(text: string, maxLength: number): string {
  const cleanText = text.replace(/\x1b\[[0-9;]*m/g, '');
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
  const titleLength = titleWithSpaces.replace(/\x1b\[[0-9;]*m/g, '').length;
  const leftWidth = Math.floor((width - titleLength) / 2);
  const rightWidth = width - titleLength - leftWidth;
  
  return colors.muted(
    box.horizontal.repeat(Math.max(0, leftWidth)) +
    colors.primary(titleWithSpaces) +
    box.horizontal.repeat(Math.max(0, rightWidth))
  );
}