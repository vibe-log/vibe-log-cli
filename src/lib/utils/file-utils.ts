import { promises as fs } from 'fs';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

/**
 * Safely read a file, returning null if it doesn't exist or on error
 */
export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error: any) {
    // Return null for file not found or permission errors
    if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'EPERM') {
      return null;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Synchronously read a file, returning null if it doesn't exist or on error
 */
export function safeReadFileSync(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content;
  } catch (error: any) {
    // Return null for file not found or permission errors
    if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'EPERM') {
      return null;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Read and parse a JSON file
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const content = await safeReadFile(filePath);
  if (!content) return null;
  
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    // Return null for invalid JSON
    return null;
  }
}

/**
 * Synchronously read and parse a JSON file
 */
export function readJsonFileSync<T>(filePath: string): T | null {
  const content = safeReadFileSync(filePath);
  if (!content) return null;
  
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    // Return null for invalid JSON
    return null;
  }
}

/**
 * Read and parse a JSONL (JSON Lines) file
 */
export async function readJsonlFile(filePath: string): Promise<any[]> {
  const content = await safeReadFile(filePath);
  if (!content) return [];
  
  const lines = content.split('\n').filter(line => line.trim());
  const results: any[] = [];
  
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      results.push(parsed);
    } catch (error) {
      // Skip invalid JSON lines
      continue;
    }
  }
  
  return results;
}

/**
 * Synchronously read and parse a JSONL (JSON Lines) file
 */
export function readJsonlFileSync(filePath: string): any[] {
  const content = safeReadFileSync(filePath);
  if (!content) return [];
  
  const lines = content.split('\n').filter(line => line.trim());
  const results: any[] = [];
  
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      results.push(parsed);
    } catch (error) {
      // Skip invalid JSON lines
      continue;
    }
  }
  
  return results;
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    // Ignore if directory already exists
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Get the size of a file in bytes
 */
export async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    return null;
  }
}

/**
 * Write data to a file safely
 */
export async function safeWriteFile(filePath: string, data: string): Promise<boolean> {
  try {
    // Ensure the directory exists
    const dir = path.dirname(filePath);
    await ensureDirectory(dir);
    
    // Write the file
    await fs.writeFile(filePath, data, 'utf-8');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Write JSON data to a file
 */
export async function writeJsonFile<T>(filePath: string, data: T, pretty = false): Promise<boolean> {
  const jsonString = pretty 
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
  
  return safeWriteFile(filePath, jsonString);
}