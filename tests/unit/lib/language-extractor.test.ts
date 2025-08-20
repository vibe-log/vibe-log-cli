import { describe, it, expect } from 'vitest';
import {
  getLanguageFromExtension,
  extractFilePathFromToolUse,
  extractLanguagesFromSession,
  extractLanguageFromEntry,
  getLanguageStatistics,
  sessionUsesLanguage,
  getSupportedExtensions,
  getSupportedLanguages,
  LANGUAGE_MAPPINGS
} from '../../../src/lib/language-extractor';

describe('Language Extractor', () => {
  describe('getLanguageFromExtension', () => {
    it('should map common extensions correctly', () => {
      expect(getLanguageFromExtension('js')).toBe('JavaScript');
      expect(getLanguageFromExtension('ts')).toBe('TypeScript');
      expect(getLanguageFromExtension('py')).toBe('Python');
      expect(getLanguageFromExtension('rs')).toBe('Rust');
      expect(getLanguageFromExtension('go')).toBe('Go');
    });

    it('should handle extensions with dots', () => {
      expect(getLanguageFromExtension('.js')).toBe('JavaScript');
      expect(getLanguageFromExtension('.tsx')).toBe('TypeScript');
    });

    it('should handle case variations', () => {
      expect(getLanguageFromExtension('JS')).toBe('JavaScript');
      expect(getLanguageFromExtension('Tsx')).toBe('TypeScript');
      expect(getLanguageFromExtension('PY')).toBe('Python');
    });

    it('should return null for unknown programming extensions', () => {
      expect(getLanguageFromExtension('xyz')).toBe(null);
      expect(getLanguageFromExtension('foo')).toBe(null);
      expect(getLanguageFromExtension('abc')).toBe(null);
    });
    
    it('should return null for non-programming file extensions', () => {
      expect(getLanguageFromExtension('png')).toBe(null);
      expect(getLanguageFromExtension('jpg')).toBe(null);
      expect(getLanguageFromExtension('mp4')).toBe(null);
      expect(getLanguageFromExtension('pdf')).toBe(null);
      expect(getLanguageFromExtension('zip')).toBe(null);
      expect(getLanguageFromExtension('exe')).toBe(null);
    });

    it('should handle special case extensions', () => {
      expect(getLanguageFromExtension('dockerfile')).toBe('Docker');
      expect(getLanguageFromExtension('Dockerfile')).toBe('Docker');
      expect(getLanguageFromExtension('makefile')).toBe('Makefile');
      expect(getLanguageFromExtension('Makefile')).toBe('Makefile');
    });
  });

  describe('extractFilePathFromToolUse', () => {
    it('should extract from toolUseResult with create type', () => {
      const data = {
        toolUseResult: {
          type: 'create',
          filePath: '/path/to/file.ts'
        }
      };
      expect(extractFilePathFromToolUse(data)).toBe('/path/to/file.ts');
    });

    it('should extract from toolUseResult with update type', () => {
      const data = {
        toolUseResult: {
          type: 'update',
          filePath: '/path/to/file.py'
        }
      };
      expect(extractFilePathFromToolUse(data)).toBe('/path/to/file.py');
    });

    it('should extract from toolUseResult with text type', () => {
      const data = {
        toolUseResult: {
          type: 'text',
          file: {
            filePath: '/path/to/file.js'
          }
        }
      };
      expect(extractFilePathFromToolUse(data)).toBe('/path/to/file.js');
    });

    it('should extract from toolUse with Edit tool', () => {
      const data = {
        toolUse: {
          name: 'Edit',
          params: {
            file_path: '/src/index.ts'
          }
        }
      };
      expect(extractFilePathFromToolUse(data)).toBe('/src/index.ts');
    });

    it('should extract from toolUse with Write tool', () => {
      const data = {
        toolUse: {
          name: 'Write',
          parameters: {
            filePath: '/docs/README.md'
          }
        }
      };
      expect(extractFilePathFromToolUse(data)).toBe('/docs/README.md');
    });

    it('should extract from toolUse with MultiEdit tool', () => {
      const data = {
        toolUse: {
          name: 'MultiEdit',
          params: {
            file_path: '/src/component.tsx'
          }
        }
      };
      expect(extractFilePathFromToolUse(data)).toBe('/src/component.tsx');
    });

    it('should extract from toolUse with NotebookEdit tool', () => {
      const data = {
        toolUse: {
          name: 'NotebookEdit',
          params: {
            notebook_path: '/notebooks/analysis.ipynb'
          }
        }
      };
      expect(extractFilePathFromToolUse(data)).toBe('/notebooks/analysis.ipynb');
    });

    it('should extract from message content with tool_use', () => {
      const data = {
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: {
                file_path: '/src/app.js'
              }
            }
          ]
        }
      };
      expect(extractFilePathFromToolUse(data)).toBe('/src/app.js');
    });

    it('should return null for non-file operations', () => {
      expect(extractFilePathFromToolUse({})).toBe(null);
      expect(extractFilePathFromToolUse({ toolUse: { name: 'Bash' } })).toBe(null);
      expect(extractFilePathFromToolUse({ toolUseResult: { type: 'image' } })).toBe(null);
    });
  });

  describe('extractLanguagesFromSession', () => {
    it('should extract languages from a session with multiple files', () => {
      const lines = [
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/src/index.ts'
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'update',
            filePath: '/styles/main.css'
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/server.py'
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual(['CSS', 'Python', 'TypeScript']);
    });

    it('should handle duplicate files', () => {
      const lines = [
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/src/index.ts'
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'update',
            filePath: '/src/index.ts'
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/src/index.ts'
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual(['TypeScript']);
    });

    it('should handle empty sessions', () => {
      expect(extractLanguagesFromSession([])).toEqual([]);
      expect(extractLanguagesFromSession([''])).toEqual([]);
    });

    it('should skip invalid JSON lines', () => {
      const lines = [
        'invalid json',
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/test.js'
          }
        }),
        '{ broken json',
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/test.py'
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual(['JavaScript', 'Python']);
    });

    it('should handle files without extensions', () => {
      const lines = [
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/Dockerfile'  // This should be detected as Docker
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/README'  // This has no extension and isn't a special file
            }
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/Makefile'  // This should be detected as Makefile
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual(['Docker', 'Makefile']);  // Special files are detected
    });
  });

  describe('extractLanguageFromEntry', () => {
    it('should extract language from a single entry', () => {
      const entry = {
        toolUseResult: {
          type: 'create',
          filePath: '/test.rs'
        }
      };
      expect(extractLanguageFromEntry(entry)).toBe('Rust');
    });

    it('should return null for entries without file operations', () => {
      expect(extractLanguageFromEntry({})).toBe(null);
      expect(extractLanguageFromEntry({ message: 'test' })).toBe(null);
    });
  });

  describe('getLanguageStatistics', () => {
    it('should count file operations by language', () => {
      const lines = [
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/src/index.ts'
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'update',
            filePath: '/src/app.ts'
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/test.py'
            }
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/another.ts'
            }
          }
        })
      ];

      const stats = getLanguageStatistics(lines);
      expect(stats.get('TypeScript')).toBe(3);
      expect(stats.get('Python')).toBe(1);
      expect(stats.size).toBe(2);
    });

    it('should return empty map for empty session', () => {
      const stats = getLanguageStatistics([]);
      expect(stats.size).toBe(0);
    });
  });

  describe('sessionUsesLanguage', () => {
    it('should detect if a session uses a specific language', () => {
      const lines = [
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/src/index.ts'
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/test.py'
            }
          }
        })
      ];

      expect(sessionUsesLanguage(lines, 'TypeScript')).toBe(true);
      expect(sessionUsesLanguage(lines, 'Python')).toBe(true);
      expect(sessionUsesLanguage(lines, 'JavaScript')).toBe(false);
      expect(sessionUsesLanguage(lines, 'Rust')).toBe(false);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return sorted list of extensions', () => {
      const extensions = getSupportedExtensions();
      expect(extensions).toContain('js');
      expect(extensions).toContain('ts');
      expect(extensions).toContain('py');
      expect(extensions).toEqual([...extensions].sort());
    });

    it('should match LANGUAGE_MAPPINGS keys', () => {
      const extensions = getSupportedExtensions();
      expect(extensions).toEqual(Object.keys(LANGUAGE_MAPPINGS).sort());
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return unique sorted languages', () => {
      const languages = getSupportedLanguages();
      expect(languages).toContain('JavaScript');
      expect(languages).toContain('TypeScript');
      expect(languages).toContain('Python');
      expect(languages).toEqual([...languages].sort());
    });

    it('should not have duplicates', () => {
      const languages = getSupportedLanguages();
      const uniqueLanguages = [...new Set(languages)];
      expect(languages).toEqual(uniqueLanguages);
    });
  });

  describe('Edge cases', () => {
    it('should handle mixed case file names', () => {
      const lines = [
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/src/App.TSX'  // Mixed case extension
            }
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/Config.JSON'  // Mixed case extension
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toContain('TypeScript');
      expect(languages).toContain('JSON');
    });

    it('should handle deeply nested file paths', () => {
      const lines = [
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/very/deeply/nested/folder/structure/with/many/levels/index.js'
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual(['JavaScript']);
    });

    it('should handle file paths with spaces', () => {
      const lines = [
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/My Documents/Project Name/src/main.py'
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual(['Python']);
    });

    it('should handle file paths with special characters', () => {
      const lines = [
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/src/@components/Button-v2.1.tsx'
            }
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'update',
            filePath: '/src/utils/string_helpers-v1.0.rs'
            }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toContain('TypeScript');
      expect(languages).toContain('Rust');
    });

    it('should handle empty file paths gracefully', () => {
      const lines = [
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: ''
            }
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: null
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              // No file_path at all
              content: 'some content'
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual([]);
    });

    it('should handle malformed tool use structures', () => {
      const lines = [
        JSON.stringify({
          toolUse: null
        }),
        JSON.stringify({
          toolUseResult: {}
        }),
        JSON.stringify({
          toolUse: {
            name: 'Edit'
            // Missing params
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/valid/file.ts'
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual(['TypeScript']);  // Only the valid one
    });

    it('should handle notebook files correctly', () => {
      const lines = [
        JSON.stringify({
          toolUse: {
            name: 'NotebookEdit',
            params: {
              notebook_path: '/analysis/data_exploration.ipynb'
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toEqual(['Jupyter Notebook']);
    });

    it('should handle various config file types', () => {
      const lines = [
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/.eslintrc.json'
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/tsconfig.json'
            }
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/package.json'
            }
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'update',
            filePath: '/docker-compose.yml'
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toContain('JSON');
      expect(languages).toContain('YAML');
    });

    it('should handle dotfiles correctly', () => {
      const lines = [
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/.gitignore'  // No extension - whole name is the file
            }
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/.env'  // No extension - whole name is the file
            }
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/.bashrc'  // No extension - whole name is the file
          }
        }),
        JSON.stringify({
          toolUse: {
            name: 'Edit',
            params: {
              file_path: '/.prettierrc.json'  // This one has .json extension
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      // Dotfiles without extensions are ignored, but .prettierrc.json has JSON extension
      expect(languages).toEqual(['JSON']);
    });
  });

  describe('Integration tests', () => {
    it('should handle real-world JSONL structure', () => {
      const realWorldSession = [
        JSON.stringify({
          sessionId: 'test-session',
          cwd: '/project',
          timestamp: '2024-01-01T00:00:00Z'
        }),
        JSON.stringify({
          message: {
            role: 'user',
            content: 'Create a new React component'
          },
          timestamp: '2024-01-01T00:00:01Z'
        }),
        JSON.stringify({
          toolUse: {
            name: 'Write',
            params: {
              file_path: '/src/components/Button.tsx',
              content: 'import React from "react";'
            }
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/src/styles/button.css'
          }
        }),
        JSON.stringify({
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Edit',
                input: {
                  file_path: '/src/index.js'
                }
              }
            ]
          }
        })
      ];

      const languages = extractLanguagesFromSession(realWorldSession);
      expect(languages).toContain('TypeScript');
      expect(languages).toContain('CSS');
      expect(languages).toContain('JavaScript');
      expect(languages.length).toBe(3);
    });

    it('should handle real-world Claude Code session with actual tool names', () => {
      // This mimics actual Claude Code JSONL structure more closely
      const lines = [
        JSON.stringify({
          sessionId: 'session-123',
          cwd: '/project',
          timestamp: '2024-01-01T00:00:00Z',
          type: 'system'
        }),
        JSON.stringify({
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'I will create a new React component' },
              { 
                type: 'tool_use',
                name: 'Write',
                input: {
                  file_path: '/src/components/NewFeature.tsx',
                  content: 'import React from "react"...'
                }
              }
            ]
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath: '/src/components/NewFeature.tsx'
          }
        }),
        JSON.stringify({
          message: {
            role: 'assistant',
            content: [
              { 
                type: 'tool_use',
                name: 'MultiEdit',
                input: {
                  file_path: '/src/styles/theme.css',
                  edits: [
                    { old_string: 'color: blue', new_string: 'color: green' }
                  ]
                }
              }
            ]
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'update',
            filePath: '/src/styles/theme.css'
          }
        }),
        JSON.stringify({
          message: {
            role: 'assistant', 
            content: [
              {
                type: 'tool_use',
                name: 'Read',
                input: {
                  file_path: '/package.json'
                }
              }
            ]
          }
        }),
        JSON.stringify({
          toolUseResult: {
            type: 'text',
            file: {
              filePath: '/package.json',
              content: '{ "name": "project" }'
            }
          }
        })
      ];

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toContain('TypeScript');
      expect(languages).toContain('CSS');
      expect(languages).toContain('JSON');
      expect(languages.length).toBe(3);

      // Also test statistics
      const stats = getLanguageStatistics(lines);
      expect(stats.get('TypeScript')).toBe(2);  // Created and mentioned again
      expect(stats.get('CSS')).toBe(2);  // MultiEdit and update
      expect(stats.get('JSON')).toBe(2);  // Read and text result
    });

    it('should handle complex multi-language project', () => {
      const files = [
        '/backend/server.py',
        '/backend/models.py',
        '/frontend/src/App.tsx',
        '/frontend/src/styles.css',
        '/infrastructure/deploy.sh',
        '/docker/Dockerfile',
        '/docs/README.md',
        '/config/settings.yaml'
      ];

      const lines = files.map(filePath => 
        JSON.stringify({
          toolUseResult: {
            type: 'create',
            filePath
          }
        })
      );

      const languages = extractLanguagesFromSession(lines);
      expect(languages).toContain('Python');
      expect(languages).toContain('TypeScript');
      expect(languages).toContain('CSS');
      expect(languages).toContain('Shell');
      expect(languages).toContain('Docker');
      expect(languages).toContain('Markdown');
      expect(languages).toContain('YAML');
    });
  });
});