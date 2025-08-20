/**
 * Language Extractor Module
 * 
 * This module provides a centralized way to extract programming languages
 * from Claude Code session data. It handles multiple patterns including
 * toolUseResult events and direct tool use calls.
 */

import path from 'path';

/**
 * Comprehensive mapping of file extensions to programming languages
 * Easy to extend - just add new mappings here
 */
export const LANGUAGE_MAPPINGS: Record<string, string> = {
  // JavaScript ecosystem
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  
  // TypeScript
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  
  // Python
  py: 'Python',
  pyw: 'Python',
  pyx: 'Python',
  pyi: 'Python',
  
  // Web technologies
  html: 'HTML',
  htm: 'HTML',
  xhtml: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  styl: 'Stylus',
  
  // Data formats
  json: 'JSON',
  jsonc: 'JSON',
  json5: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  
  // Markdown and documentation
  md: 'Markdown',
  mdx: 'Markdown',
  markdown: 'Markdown',
  rst: 'reStructuredText',
  txt: 'Text',
  
  // Shell scripting
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  fish: 'Fish',
  ps1: 'PowerShell',
  psm1: 'PowerShell',
  psd1: 'PowerShell',
  bat: 'Batch',
  cmd: 'Batch',
  
  // System languages
  c: 'C',
  h: 'C',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  hpp: 'C++',
  hh: 'C++',
  hxx: 'C++',
  
  // JVM languages
  java: 'Java',
  kt: 'Kotlin',
  kts: 'Kotlin',
  scala: 'Scala',
  sc: 'Scala',
  groovy: 'Groovy',
  gradle: 'Groovy',
  
  // .NET languages
  cs: 'C#',
  fs: 'F#',
  fsx: 'F#',
  vb: 'Visual Basic',
  
  // Modern systems languages
  rs: 'Rust',
  go: 'Go',
  zig: 'Zig',
  
  // Mobile development
  swift: 'Swift',
  m: 'Objective-C',  // .m files are typically Objective-C
  mm: 'Objective-C',
  dart: 'Dart',
  
  // Scripting languages
  rb: 'Ruby',
  php: 'PHP',
  pl: 'Perl',
  pm: 'Perl',
  lua: 'Lua',
  
  // Functional languages
  hs: 'Haskell',
  lhs: 'Haskell',
  elm: 'Elm',
  clj: 'Clojure',
  cljs: 'ClojureScript',
  erl: 'Erlang',
  ex: 'Elixir',
  exs: 'Elixir',
  
  // Database
  sql: 'SQL',
  pgsql: 'PostgreSQL',
  mysql: 'MySQL',
  
  // Data science
  r: 'R',
  R: 'R',
  rmd: 'R Markdown',
  ipynb: 'Jupyter Notebook',
  jl: 'Julia',
  mat: 'MATLAB',
  
  // Configuration
  dockerfile: 'Docker',
  Dockerfile: 'Docker',
  dockerignore: 'Docker',
  makefile: 'Makefile',
  Makefile: 'Makefile',
  cmake: 'CMake',
  
  // Web frameworks
  vue: 'Vue',
  svelte: 'Svelte',
  astro: 'Astro',
  
  // Infrastructure
  tf: 'Terraform',
  tfvars: 'Terraform',
  
  // Other
  graphql: 'GraphQL',
  gql: 'GraphQL',
  proto: 'Protocol Buffers',
  wasm: 'WebAssembly',
  wat: 'WebAssembly',
  vim: 'Vim Script',
  el: 'Emacs Lisp',
};

/**
 * Tool names that involve file operations
 * These are the Claude Code tools we check for file paths
 */
const FILE_OPERATION_TOOLS = [
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'Read',
  'Create',
  'Delete',
  'Move',
  'Copy',
];

/**
 * Get the programming language from a file extension
 * @param ext - File extension (with or without dot)
 * @returns The programming language name or the uppercase extension if not found
 */
export function getLanguageFromExtension(ext: string): string {
  // Remove leading dot if present
  const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
  
  // Look up in mappings (case-insensitive for most extensions)
  const language = LANGUAGE_MAPPINGS[cleanExt.toLowerCase()] || 
                  LANGUAGE_MAPPINGS[cleanExt];
  
  // Return mapped language or uppercase extension as fallback
  return language || cleanExt.toUpperCase();
}

/**
 * Extract file path from a tool use event
 * Handles different tool parameter structures
 */
export function extractFilePathFromToolUse(data: any): string | null {
  // Check for toolUseResult pattern (already processed results)
  if (data.toolUseResult) {
    const result = data.toolUseResult;
    
    // Handle file operations in toolUseResult
    if (result.type === 'create' || result.type === 'update') {
      return result.filePath || null;
    }
    
    // Handle text results with file information
    if (result.type === 'text' && result.file?.filePath) {
      return result.file.filePath;
    }
  }
  
  // Check for direct tool use pattern
  if (data.toolUse) {
    const toolUse = data.toolUse;
    
    // Check if it's a file operation tool
    if (FILE_OPERATION_TOOLS.includes(toolUse.name)) {
      // Try different parameter patterns
      const params = toolUse.params || toolUse.parameters || {};
      
      // Common parameter names for file paths
      const filePath = params.file_path || 
                      params.filePath || 
                      params.path ||
                      params.filename ||
                      params.file;
      
      if (filePath) {
        return filePath;
      }
      
      // For MultiEdit, check edits array
      if (toolUse.name === 'MultiEdit' && params.edits) {
        // Return the file being edited (same for all edits in MultiEdit)
        return params.file_path || params.filePath || null;
      }
      
      // For NotebookEdit, check notebook_path
      if (toolUse.name === 'NotebookEdit' && params.notebook_path) {
        return params.notebook_path;
      }
    }
  }
  
  // Check for message content with tool use (alternate format)
  if (data.message?.content && Array.isArray(data.message.content)) {
    for (const item of data.message.content) {
      if (item.type === 'tool_use' && FILE_OPERATION_TOOLS.includes(item.name)) {
        const input = item.input || {};
        const filePath = input.file_path || 
                        input.filePath || 
                        input.path ||
                        input.notebook_path ||
                        input.filename;
        if (filePath) {
          return filePath;
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract all languages from a Claude Code session
 * @param lines - Array of JSONL lines (as strings)
 * @returns Array of unique language names used in the session
 */
export function extractLanguagesFromSession(lines: string[]): string[] {
  const languages = new Set<string>();
  const processedFiles = new Set<string>();
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const data = JSON.parse(line);
      
      // Extract file path from the data
      const filePath = extractFilePathFromToolUse(data);
      
      if (filePath && !processedFiles.has(filePath)) {
        processedFiles.add(filePath);
        
        // Check for special files without extensions (like Dockerfile)
        const basename = path.basename(filePath).toLowerCase();
        if (LANGUAGE_MAPPINGS[basename]) {
          languages.add(LANGUAGE_MAPPINGS[basename]);
        } else {
          // Extract extension and get language
          const ext = path.extname(filePath).slice(1).toLowerCase();
          if (ext) {
            const language = getLanguageFromExtension(ext);
            languages.add(language);
          }
        }
      }
    } catch (err) {
      // Skip invalid JSON lines
      continue;
    }
  }
  
  // Return sorted array of unique languages
  return Array.from(languages).sort();
}

/**
 * Extract languages from a single JSONL entry
 * Useful for processing streaming data
 */
export function extractLanguageFromEntry(data: any): string | null {
  const filePath = extractFilePathFromToolUse(data);
  
  if (filePath) {
    // Check for special files without extensions (like Dockerfile)
    const basename = path.basename(filePath).toLowerCase();
    if (LANGUAGE_MAPPINGS[basename]) {
      return LANGUAGE_MAPPINGS[basename];
    }
    
    // Extract extension and get language
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (ext) {
      return getLanguageFromExtension(ext);
    }
  }
  
  return null;
}

/**
 * Get statistics about languages in a session
 * Returns a map of language to file count
 */
export function getLanguageStatistics(lines: string[]): Map<string, number> {
  const stats = new Map<string, number>();
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const data = JSON.parse(line);
      const filePath = extractFilePathFromToolUse(data);
      
      if (filePath) {
        let language: string | null = null;
        
        // Check for special files without extensions (like Dockerfile)
        const basename = path.basename(filePath).toLowerCase();
        if (LANGUAGE_MAPPINGS[basename]) {
          language = LANGUAGE_MAPPINGS[basename];
        } else {
          // Extract extension and get language
          const ext = path.extname(filePath).slice(1).toLowerCase();
          if (ext) {
            language = getLanguageFromExtension(ext);
          }
        }
        
        if (language) {
          stats.set(language, (stats.get(language) || 0) + 1);
        }
      }
    } catch (err) {
      continue;
    }
  }
  
  return stats;
}

/**
 * Check if a session used a specific language
 */
export function sessionUsesLanguage(lines: string[], targetLanguage: string): boolean {
  const languages = extractLanguagesFromSession(lines);
  return languages.includes(targetLanguage);
}

/**
 * Get all supported file extensions
 * Useful for documentation or UI
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(LANGUAGE_MAPPINGS).sort();
}

/**
 * Get all supported languages
 * Returns unique language names
 */
export function getSupportedLanguages(): string[] {
  const uniqueLanguages = new Set(Object.values(LANGUAGE_MAPPINGS));
  return Array.from(uniqueLanguages).sort();
}