import { colors, icons, progress as progressChars, padRight, getTerminalWidth } from './styles';

/**
 * Spinner animation frames
 */
const spinners = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  dots2: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
  line: ['─', '\\', '|', '/'],
  circle: ['◐', '◓', '◑', '◒'],
  box: ['▖', '▘', '▝', '▗'],
  arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
  bounce: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
  pulse: ['▁', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃'],
  wave: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂'],
  arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  bouncingBar: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]', '[    ]'],
  clock: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
};

/**
 * Create an animated spinner
 */
export class Spinner {
  private frames: string[];
  private currentFrame: number = 0;
  private message: string;
  private color: typeof colors[keyof typeof colors];
  
  constructor(
    type: keyof typeof spinners = 'dots',
    message: string = 'Loading...',
    color: typeof colors[keyof typeof colors] = colors.primary
  ) {
    this.frames = spinners[type] || spinners.dots;
    this.message = message;
    this.color = color;
  }
  
  next(): string {
    const frame = this.frames[this.currentFrame];
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    return this.color(frame) + ' ' + colors.primary(this.message);
  }
  
  setMessage(message: string): void {
    this.message = message;
  }
}

/**
 * Create a beautiful progress bar
 */
export function createProgressBar(
  current: number,
  total: number,
  options?: {
    width?: number;
    showPercentage?: boolean;
    showNumbers?: boolean;
    label?: string;
    gradient?: boolean;
    style?: 'default' | 'blocks' | 'smooth' | 'ascii';
  }
): string {
  const width = options?.width || Math.min(getTerminalWidth() - 20, 40);
  const percentage = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.floor((percentage / 100) * width);
  
  let bar = '';
  
  switch (options?.style) {
    case 'blocks':
      // Block-style progress bar
      for (let i = 0; i < width; i++) {
        if (i < filled) {
          bar += progressChars.full;
        } else if (i === filled && percentage % (100 / width) !== 0) {
          // Partial block for more precision
          const partial = (percentage % (100 / width)) / (100 / width);
          if (partial > 0.75) bar += progressChars.three_quarters;
          else if (partial > 0.5) bar += progressChars.half;
          else if (partial > 0.25) bar += progressChars.quarter;
          else bar += progressChars.empty;
        } else {
          bar += progressChars.empty;
        }
      }
      break;
      
    case 'smooth': {
      // Smooth gradient bar
      const smoothChars = ['░', '▒', '▓', '█'];
      for (let i = 0; i < width; i++) {
        const position = i / width;
        const fillRatio = percentage / 100;
        if (position < fillRatio) {
          const intensity = Math.min(1, (fillRatio - position) * 4);
          const charIndex = Math.floor(intensity * (smoothChars.length - 1));
          bar += smoothChars[charIndex];
        } else {
          bar += smoothChars[0];
        }
      }
      break;
    }
      
    case 'ascii':
      // ASCII-only progress bar
      bar = '[' + '='.repeat(filled) + '>' + ' '.repeat(Math.max(0, width - filled - 1)) + ']';
      break;
      
    default:
      // Default Unicode bar
      for (let i = 0; i < width; i++) {
        if (i < filled) {
          bar += '█';
        } else {
          bar += '░';
        }
      }
  }
  
  // Apply color gradient if requested
  if (options?.gradient) {
    let coloredBar = '';
    for (let i = 0; i < bar.length; i++) {
      const position = i / bar.length;
      if (position < 0.33) {
        coloredBar += colors.error(bar[i]);
      } else if (position < 0.66) {
        coloredBar += colors.warning(bar[i]);
      } else {
        coloredBar += colors.success(bar[i]);
      }
    }
    bar = coloredBar;
  } else {
    // Standard coloring based on percentage
    if (percentage < 33) {
      bar = colors.error(bar);
    } else if (percentage < 66) {
      bar = colors.warning(bar);
    } else {
      bar = colors.success(bar);
    }
  }
  
  // Build the complete progress display
  let display = '';
  
  if (options?.label) {
    display += colors.primary(options.label) + ' ';
  }
  
  display += bar;
  
  if (options?.showPercentage !== false) {
    display += ' ' + colors.highlight(`${percentage}%`);
  }
  
  if (options?.showNumbers) {
    display += colors.dim(` (${current}/${total})`);
  }
  
  return display;
}

/**
 * Create a multi-progress display for concurrent operations
 */
export function createMultiProgress(
  items: Array<{
    label: string;
    current: number;
    total: number;
    status?: 'active' | 'completed' | 'error' | 'pending';
  }>,
  options?: {
    width?: number;
    showPercentage?: boolean;
  }
): string {
  const width = options?.width || 30;
  const lines: string[] = [];
  
  // Find the longest label for alignment
  const maxLabelLength = Math.max(...items.map(item => item.label.length));
  
  items.forEach(item => {
    const percentage = Math.round((item.current / item.total) * 100);
    const filled = Math.floor((percentage / 100) * width);
    
    // Status icon
    let statusIcon = '';
    switch (item.status) {
      case 'completed':
        statusIcon = colors.success(icons.check);
        break;
      case 'error':
        statusIcon = colors.error(icons.error);
        break;
      case 'active':
        statusIcon = colors.primary(icons.loading);
        break;
      case 'pending':
        statusIcon = colors.dim(icons.clock);
        break;
      default:
        statusIcon = colors.primary(icons.bullet);
    }
    
    // Label
    const label = padRight(item.label, maxLabelLength);
    
    // Progress bar
    let bar = '';
    for (let i = 0; i < width; i++) {
      if (i < filled) {
        bar += progressChars.full;
      } else {
        bar += progressChars.empty;
      }
    }
    
    // Color based on status
    if (item.status === 'completed') {
      bar = colors.success(bar);
    } else if (item.status === 'error') {
      bar = colors.error(bar);
    } else if (item.status === 'active') {
      bar = colors.primary(bar);
    } else {
      bar = colors.dim(bar);
    }
    
    // Percentage
    const percentageText = options?.showPercentage !== false
      ? ' ' + colors.highlight(`${percentage}%`)
      : '';
    
    lines.push(`${statusIcon} ${colors.primary(label)} ${bar}${percentageText}`);
  });
  
  return lines.join('\n');
}

/**
 * Create step-by-step progress indicator
 */
export function createStepProgress(
  steps: Array<{
    label: string;
    status: 'pending' | 'active' | 'completed' | 'error' | 'skipped';
    description?: string;
  }>,
  options?: {
    showNumbers?: boolean;
    compact?: boolean;
  }
): string {
  const lines: string[] = [];
  const totalSteps = steps.length;
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  
  // Header
  if (!options?.compact) {
    const progressBar = createProgressBar(completedSteps, totalSteps, {
      width: 30,
      showNumbers: true,
      style: 'blocks',
    });
    
    lines.push(colors.highlight('Progress: ') + progressBar);
    lines.push('');
  }
  
  // Steps
  steps.forEach((step, index) => {
    const stepNumber = options?.showNumbers !== false ? `${index + 1}. ` : '';
    
    // Status icon and color
    let icon = '';
    let labelColor = colors.primary;
    let descColor = colors.dim;
    
    switch (step.status) {
      case 'completed':
        icon = colors.success(icons.check);
        labelColor = colors.success;
        break;
      case 'active':
        icon = colors.primary(icons.loading);
        labelColor = colors.highlight;
        descColor = colors.primary;
        break;
      case 'error':
        icon = colors.error(icons.error);
        labelColor = colors.error;
        descColor = colors.error;
        break;
      case 'skipped':
        icon = colors.dim(icons.arrow);
        labelColor = colors.dim;
        break;
      case 'pending':
      default:
        icon = colors.dim(icons.bullet);
        labelColor = colors.dim;
    }
    
    // Step line
    let stepLine = `${icon} ${colors.dim(stepNumber)}${labelColor(step.label)}`;
    
    // Add description on same line if compact
    if (options?.compact && step.description) {
      stepLine += colors.dim(' - ') + descColor(step.description);
    }
    
    lines.push(stepLine);
    
    // Add description on new line if not compact
    if (!options?.compact && step.description && step.status !== 'pending') {
      lines.push(`   ${descColor(step.description)}`);
    }
    
    // Add connector line between steps (except after last)
    if (!options?.compact && index < steps.length - 1) {
      const connector = step.status === 'completed' ? colors.success('│') : colors.dim('│');
      lines.push(`   ${connector}`);
    }
  });
  
  return lines.join('\n');
}

/**
 * Create a loading animation with dots
 */
export class LoadingDots {
  private dots = 0;
  private maxDots = 3;
  private message: string;
  
  constructor(message: string = 'Loading') {
    this.message = message;
  }
  
  next(): string {
    this.dots = (this.dots + 1) % (this.maxDots + 1);
    return colors.primary(this.message) + colors.dim('.'.repeat(this.dots)) + ' '.repeat(this.maxDots - this.dots);
  }
  
  setMessage(message: string): void {
    this.message = message;
  }
}

/**
 * Create an indeterminate progress bar (for unknown total)
 */
export class IndeterminateProgress {
  private position = 0;
  private width: number;
  private barWidth = 10;
  private direction = 1;
  
  constructor(width: number = 40) {
    this.width = width;
  }
  
  next(): string {
    // Create the bar
    let bar = '';
    for (let i = 0; i < this.width; i++) {
      if (i >= this.position && i < this.position + this.barWidth) {
        bar += progressChars.full;
      } else {
        bar += progressChars.empty;
      }
    }
    
    // Update position
    this.position += this.direction;
    if (this.position + this.barWidth >= this.width || this.position <= 0) {
      this.direction *= -1;
    }
    
    return '[' + colors.primary(bar) + ']';
  }
}

/**
 * Create a download/upload progress display
 */
export function createTransferProgress(
  bytesTransferred: number,
  totalBytes: number,
  bytesPerSecond: number,
  options?: {
    label?: string;
    showSpeed?: boolean;
    showETA?: boolean;
  }
): string {
  const lines: string[] = [];
  
  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };
  
  // Calculate ETA
  const remainingBytes = totalBytes - bytesTransferred;
  const etaSeconds = bytesPerSecond > 0 ? Math.floor(remainingBytes / bytesPerSecond) : 0;
  const etaMinutes = Math.floor(etaSeconds / 60);
  const etaText = etaMinutes > 0 
    ? `${etaMinutes}m ${etaSeconds % 60}s`
    : `${etaSeconds}s`;
  
  // Progress bar
  const progressBar = createProgressBar(bytesTransferred, totalBytes, {
    width: 40,
    showPercentage: true,
    style: 'blocks',
  });
  
  // Main line
  let mainLine = '';
  if (options?.label) {
    mainLine += colors.primary(options.label) + ' ';
  }
  mainLine += progressBar;
  lines.push(mainLine);
  
  // Details line
  const detailParts: string[] = [];
  
  // Bytes transferred
  detailParts.push(
    colors.dim(`${formatBytes(bytesTransferred)} / ${formatBytes(totalBytes)}`)
  );
  
  // Speed
  if (options?.showSpeed !== false && bytesPerSecond > 0) {
    detailParts.push(
      colors.primary(`${formatBytes(bytesPerSecond)}/s`)
    );
  }
  
  // ETA
  if (options?.showETA !== false && etaSeconds > 0) {
    detailParts.push(
      colors.dim(`ETA: ${etaText}`)
    );
  }
  
  if (detailParts.length > 0) {
    lines.push('  ' + detailParts.join(' | '));
  }
  
  return lines.join('\n');
}

/**
 * Create a circular progress indicator (ASCII art)
 */
export function createCircularProgress(
  percentage: number,
  options?: {
    size?: 'small' | 'medium' | 'large';
    showPercentage?: boolean;
  }
): string {
  const size = options?.size || 'medium';
  const lines: string[] = [];
  
  // Simple ASCII circular progress
  // const segments = 8;
  // const filled = Math.floor((percentage / 100) * segments);
  
  const segmentChars = ['○', '◔', '◑', '◕', '●'];
  const charIndex = Math.floor((percentage / 100) * (segmentChars.length - 1));
  
  if (size === 'small') {
    // Single character representation
    return colors.primary(segmentChars[charIndex]);
  }
  
  // Medium/large circular display
  const circle = ['⢀', '⢠', '⢰', '⢸', '⢼', '⢾', '⢿', '⢷', '⢯', '⢟', '⢏', '⢇', '⢃', '⢁'];
  const circleIndex = Math.floor((percentage / 100) * circle.length);
  
  if (size === 'medium') {
    const char = circle[Math.min(circleIndex, circle.length - 1)];
    return colors.primary(char) + ' ' + colors.highlight(`${percentage}%`);
  }
  
  // Large ASCII art circle (simplified)
  lines.push('    ╭───╮');
  lines.push(`   │ ${colors.highlight(percentage.toString().padStart(3))}% │`);
  lines.push('    ╰───╯');
  
  return lines.join('\n');
}