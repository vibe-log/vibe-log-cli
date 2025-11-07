import chalk from 'chalk';
import { appendFileSync } from 'fs';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;
  private outputFile: string | undefined;

  constructor() {
    this.level = this.getLogLevel();
    this.outputFile = process.env.VIBE_LOG_OUTPUT;
  }

  setLevel(level: string | LogLevel): void {
    if (typeof level === 'string') {
      switch (level.toLowerCase()) {
        case 'debug':
          this.level = LogLevel.DEBUG;
          break;
        case 'info':
          this.level = LogLevel.INFO;
          break;
        case 'warn':
          this.level = LogLevel.WARN;
          break;
        case 'error':
          this.level = LogLevel.ERROR;
          break;
        default:
          this.level = LogLevel.INFO;
      }
    } else {
      this.level = level;
    }

    // Re-read output file in case it was set after logger initialization
    this.outputFile = process.env.VIBE_LOG_OUTPUT;
  }

  private getLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (process.env.DEBUG || process.env.VIBELOG_DEBUG) {
      return LogLevel.DEBUG;
    }
    
    switch (envLevel) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  private writeToFile(message: string): void {
    if (this.outputFile) {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${message}\n`;
      try {
        appendFileSync(this.outputFile, logLine);
      } catch (error) {
        // Silently fail if can't write to file
      }
    }
  }

  debug(message: string, data?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      const logMessage = `[DEBUG] ${message}`;
      if (this.outputFile) {
        this.writeToFile(logMessage);
        if (data) {
          this.writeToFile(JSON.stringify(data, null, 2));
        }
      } else {
        console.log(chalk.gray(logMessage));
        if (data) {
          console.log(chalk.gray(JSON.stringify(data, null, 2)));
        }
      }
    }
  }

  info(message: string): void {
    if (this.level <= LogLevel.INFO) {
      if (this.outputFile) {
        this.writeToFile(`[INFO] ${message}`);
      } else {
        console.log(chalk.cyan(message));
      }
    }
  }

  warn(message: string): void {
    if (this.level <= LogLevel.WARN) {
      if (this.outputFile) {
        this.writeToFile(`[WARN] ${message}`);
      } else {
        console.log(chalk.yellow(`⚠️  ${message}`));
      }
    }
  }

  error(message: string, error?: any): void {
    if (this.level <= LogLevel.ERROR) {
      if (this.outputFile) {
        this.writeToFile(`[ERROR] ${message}`);
        if (error && this.level === LogLevel.DEBUG) {
          this.writeToFile(error.stack || error.toString());
        }
      } else {
        console.error(chalk.red(`❌ ${message}`));
        if (error && this.level === LogLevel.DEBUG) {
          console.error(chalk.gray(error.stack || error));
        }
      }
    }
  }

  success(message: string): void {
    if (this.outputFile) {
      this.writeToFile(`[SUCCESS] ${message}`);
    } else {
      console.log(chalk.green(`✅ ${message}`));
    }
  }
}

export const logger = new Logger();