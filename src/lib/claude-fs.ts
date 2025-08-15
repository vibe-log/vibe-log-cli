/**
 * File system abstraction for Claude project operations
 * This allows for easy mocking in tests and potential future implementations
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SessionFileInfo } from './claude-project-parser';

/**
 * Interface for Claude file system operations
 */
export interface IClaudeFileSystem {
  /**
   * Check if a path exists and is accessible
   */
  exists(path: string): Promise<boolean>;
  
  /**
   * Get list of project directories in Claude projects folder
   */
  getProjectDirectories(): Promise<string[]>;
  
  /**
   * Get list of session files in a project directory
   */
  getSessionFiles(projectPath: string): Promise<SessionFileInfo[]>;
  
  /**
   * Read content of a session file
   */
  readSessionFile(filePath: string): Promise<string>;
  
  /**
   * Check if a path is a directory
   */
  isDirectory(path: string): Promise<boolean>;
}

/**
 * Default implementation using Node.js fs module
 */
export class ClaudeFileSystem implements IClaudeFileSystem {
  private claudeProjectsPath: string;
  
  constructor() {
    this.claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
  }
  
  async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  
  async getProjectDirectories(): Promise<string[]> {
    if (!await this.exists(this.claudeProjectsPath)) {
      return [];
    }
    
    const entries = await fs.readdir(this.claudeProjectsPath);
    const directories: string[] = [];
    
    for (const entry of entries) {
      const fullPath = path.join(this.claudeProjectsPath, entry);
      if (await this.isDirectory(fullPath)) {
        directories.push(fullPath);
      }
    }
    
    return directories;
  }
  
  async getSessionFiles(projectPath: string): Promise<SessionFileInfo[]> {
    const files = await fs.readdir(projectPath);
    const sessionFiles: SessionFileInfo[] = [];
    
    for (const file of files) {
      if (file.endsWith('.jsonl')) {
        const filePath = path.join(projectPath, file);
        const stats = await fs.stat(filePath);
        sessionFiles.push({
          path: filePath,
          size: stats.size,
          mtime: stats.mtime
        });
      }
    }
    
    return sessionFiles;
  }
  
  async readSessionFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }
  
  async isDirectory(targetPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(targetPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

/**
 * Get Claude home directory path
 */
export function getClaudeHomePath(): string {
  return path.join(os.homedir(), '.claude');
}

/**
 * Get Claude projects directory path
 */
export function getClaudeProjectsPath(): string {
  return path.join(getClaudeHomePath(), 'projects');
}

/**
 * Get global Claude settings path
 */
export function getGlobalSettingsPath(): string {
  return path.join(getClaudeHomePath(), 'settings.json');
}

/**
 * Get project-specific shared settings path
 */
export function getProjectSettingsPath(projectPath: string): string {
  return path.join(projectPath, '.claude', 'settings.json');
}

/**
 * Get project-specific local settings path
 */
export function getProjectLocalSettingsPath(projectPath: string): string {
  return path.join(projectPath, '.claude', 'settings.local.json');
}

/**
 * Get enterprise managed settings path (platform-specific)
 */
export function getEnterpriseManagedSettingsPath(): string | null {
  switch (process.platform) {
    case 'darwin': // macOS
      return '/Library/Application Support/ClaudeCode/managed-settings.json';
    case 'linux':
      return '/etc/claude-code/managed-settings.json';
    case 'win32':
      return 'C:\\ProgramData\\ClaudeCode\\managed-settings.json';
    default:
      return null;
  }
}