/**
 * Mock data generators for Claude Code project testing
 */

import { vi } from 'vitest';

export interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  startTime: string;
  endTime?: string;
  messages: ClaudeMessage[];
  metadata?: SessionMetadata;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: 'file' | 'image' | 'code';
  path?: string;
  content?: string;
}

export interface SessionMetadata {
  filesEdited: number;
  languages: string[];
  linesAdded: number;
  linesRemoved: number;
  commands: string[];
}

export interface ClaudeProject {
  name: string;
  path: string;
  sessions: ClaudeSession[];
  lastActivity: string;
  totalDuration: number;
}

/**
 * Generate mock Claude session data
 */
export function generateMockSession(options: Partial<ClaudeSession> = {}): ClaudeSession {
  const now = new Date();
  const startTime = options.startTime || new Date(now.getTime() - 3600000).toISOString();
  const endTime = options.endTime || now.toISOString();
  
  return {
    sessionId: options.sessionId || `session-${Math.random().toString(36).substr(2, 9)}`,
    projectPath: options.projectPath || '/Users/test/projects/mock-project',
    startTime,
    endTime,
    messages: options.messages || generateMockMessages(),
    metadata: options.metadata || generateMockMetadata(),
  };
}

/**
 * Generate mock messages for a session
 */
export function generateMockMessages(count: number = 5): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];
  const baseTime = new Date();
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(baseTime.getTime() + i * 60000).toISOString();
    
    if (i % 2 === 0) {
      messages.push({
        role: 'user',
        content: generateUserMessage(i),
        timestamp,
      });
    } else {
      messages.push({
        role: 'assistant',
        content: generateAssistantMessage(i),
        timestamp,
        attachments: Math.random() > 0.7 ? generateAttachments() : undefined,
      });
    }
  }
  
  return messages;
}

/**
 * Generate user message content
 */
function generateUserMessage(index: number): string {
  const templates = [
    'Create a function to calculate {task}',
    'Fix the bug in {component}',
    'Add tests for {feature}',
    'Refactor the {module} module',
    'Implement {feature} with TypeScript',
    'Debug why {issue} is happening',
    'Optimize the performance of {function}',
    'Add error handling to {component}',
  ];
  
  const tasks = ['fibonacci', 'sorting', 'authentication', 'validation', 'parsing'];
  const components = ['LoginForm', 'UserService', 'APIClient', 'Database', 'Router'];
  const features = ['user login', 'data export', 'search', 'notifications', 'caching'];
  const modules = ['auth', 'api', 'utils', 'config', 'database'];
  const issues = ['memory leak', 'slow response', 'crash', 'incorrect output', 'timeout'];
  const functions = ['processData', 'validateInput', 'fetchResults', 'renderUI', 'calculate'];
  
  const template = templates[index % templates.length];
  return template
    .replace('{task}', tasks[Math.floor(Math.random() * tasks.length)])
    .replace('{component}', components[Math.floor(Math.random() * components.length)])
    .replace('{feature}', features[Math.floor(Math.random() * features.length)])
    .replace('{module}', modules[Math.floor(Math.random() * modules.length)])
    .replace('{issue}', issues[Math.floor(Math.random() * issues.length)])
    .replace('{function}', functions[Math.floor(Math.random() * functions.length)]);
}

/**
 * Generate assistant message content
 */
function generateAssistantMessage(index: number): string {
  const responses = [
    'I\'ll help you with that. Here\'s the implementation:\n\n```typescript\n// Code implementation\n```',
    'I\'ve identified the issue. The problem is in the configuration. Let me fix it.',
    'Here\'s the refactored version with improved performance:\n\n```typescript\n// Optimized code\n```',
    'I\'ve added comprehensive tests for this feature. The coverage is now at 95%.',
    'The bug has been fixed. The issue was with the async handling.',
    'I\'ve implemented the requested feature with proper error handling.',
    'Here\'s the optimized solution that reduces complexity from O(n²) to O(n log n).',
    'I\'ve added validation and type safety to prevent future issues.',
  ];
  
  return responses[index % responses.length];
}

/**
 * Generate mock attachments
 */
function generateAttachments(): Attachment[] {
  const attachments: Attachment[] = [];
  const count = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < count; i++) {
    const type = ['file', 'code', 'image'][Math.floor(Math.random() * 3)] as Attachment['type'];
    
    attachments.push({
      type,
      path: type === 'file' ? `/path/to/file${i}.ts` : undefined,
      content: type === 'code' ? `console.log('Example code ${i}');` : undefined,
    });
  }
  
  return attachments;
}

/**
 * Generate mock session metadata
 */
export function generateMockMetadata(): SessionMetadata {
  return {
    filesEdited: Math.floor(Math.random() * 10) + 1,
    languages: ['TypeScript', 'JavaScript', 'JSON', 'Markdown'].slice(0, Math.floor(Math.random() * 3) + 1),
    linesAdded: Math.floor(Math.random() * 500) + 50,
    linesRemoved: Math.floor(Math.random() * 200) + 10,
    commands: ['npm test', 'npm run build', 'git status'].slice(0, Math.floor(Math.random() * 3) + 1),
  };
}

/**
 * Generate mock project with multiple sessions
 */
export function generateMockProject(options: Partial<ClaudeProject> = {}): ClaudeProject {
  const sessionCount = Math.floor(Math.random() * 10) + 1;
  const sessions: ClaudeSession[] = [];
  let totalDuration = 0;
  
  for (let i = 0; i < sessionCount; i++) {
    const duration = Math.floor(Math.random() * 7200) + 600; // 10 min to 2 hours
    const startTime = new Date(Date.now() - (i + 1) * 86400000); // Days ago
    const endTime = new Date(startTime.getTime() + duration * 1000);
    
    sessions.push(generateMockSession({
      projectPath: options.path,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    }));
    
    totalDuration += duration;
  }
  
  return {
    name: options.name || 'mock-project',
    path: options.path || '/Users/test/projects/mock-project',
    sessions,
    lastActivity: sessions[0]?.endTime || new Date().toISOString(),
    totalDuration,
  };
}

/**
 * Generate multiple mock projects
 */
export function generateMockProjects(count: number = 5): ClaudeProject[] {
  const projectNames = [
    'vibe-log',
    'web-app',
    'api-service',
    'mobile-app',
    'data-pipeline',
    'ml-model',
    'dashboard',
    'cli-tool',
    'microservice',
    'test-framework',
  ];
  
  const projects: ClaudeProject[] = [];
  
  for (let i = 0; i < count; i++) {
    const name = projectNames[i % projectNames.length] + (i >= projectNames.length ? `-${i}` : '');
    projects.push(generateMockProject({
      name,
      path: `/Users/test/projects/${name}`,
    }));
  }
  
  return projects;
}

/**
 * Mock Claude Code detector
 */
export function mockClaudeCodeDetector() {
  return {
    isClaudeCodeEnvironment: vi.fn().mockReturnValue(true),
    getCurrentProject: vi.fn().mockReturnValue({
      name: 'test-project',
      path: '/Users/test/projects/test-project',
    }),
    getActiveSession: vi.fn().mockReturnValue({
      sessionId: 'active-session-123',
      startTime: new Date().toISOString(),
    }),
    getRecentSessions: vi.fn().mockResolvedValue(generateMockProjects(3)),
  };
}

/**
 * Mock file system for Claude logs
 */
export function mockClaudeFileSystem() {
  const files = new Map<string, any>();
  
  return {
    readFile: vi.fn().mockImplementation((path: string) => {
      if (files.has(path)) {
        return Promise.resolve(JSON.stringify(files.get(path)));
      }
      return Promise.reject(new Error(`File not found: ${path}`));
    }),
    writeFile: vi.fn().mockImplementation((path: string, content: string) => {
      files.set(path, JSON.parse(content));
      return Promise.resolve();
    }),
    exists: vi.fn().mockImplementation((path: string) => {
      return Promise.resolve(files.has(path));
    }),
    readdir: vi.fn().mockImplementation(() => {
      return Promise.resolve(Array.from(files.keys()).map(p => p.split('/').pop()));
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockImplementation((path: string) => {
      files.delete(path);
      return Promise.resolve();
    }),
    clear: () => files.clear(),
    getFiles: () => files,
  };
}

/**
 * Mock terminal dimensions for responsive UI testing
 */
export function mockTerminalDimensions(width: number = 80, height: number = 24) {
  const original = {
    columns: process.stdout.columns,
    rows: process.stdout.rows,
  };
  
  process.stdout.columns = width;
  process.stdout.rows = height;
  
  return {
    restore: () => {
      process.stdout.columns = original.columns;
      process.stdout.rows = original.rows;
    },
    setWidth: (w: number) => { process.stdout.columns = w; },
    setHeight: (h: number) => { process.stdout.rows = h; },
  };
}

/**
 * Mock API responses for vibe-log backend
 */
export function mockApiResponses() {
  return {
    getStreak: vi.fn().mockResolvedValue({
      current: 5,
      longestStreak: 10,
      points: 150,
      totalSessions: 25,
      todaySessions: 2,
    }),
    sendSessions: vi.fn().mockResolvedValue({
      success: true,
      processed: 3,
      failed: 0,
    }),
    getRecentSessions: vi.fn().mockResolvedValue([
      {
        timestamp: new Date().toISOString(),
        duration: 3600,
        projectName: 'test-project',
      },
    ]),
    authenticate: vi.fn().mockResolvedValue({
      token: 'mock-auth-token',
      user: {
        id: 'user-123',
        email: 'test@example.com',
      },
    }),
  };
}

/**
 * Generate edge case scenarios for testing
 */
export const edgeCases = {
  emptyProject: generateMockProject({ sessions: [] }),
  
  largeProject: (() => {
    const project = generateMockProject();
    project.sessions = Array(1000).fill(null).map(() => generateMockSession());
    return project;
  })(),
  
  corruptedSession: {
    sessionId: 'corrupted',
    projectPath: null as any,
    messages: 'not-an-array' as any,
    startTime: 'invalid-date',
  },
  
  unicodeProject: generateMockProject({
    name: '项目-🚀-тест',
    path: '/Users/test/文件夹/проект',
  }),
  
  longProjectName: generateMockProject({
    name: 'a'.repeat(255),
    path: '/Users/test/' + 'very-long-path/'.repeat(20),
  }),
  
  specialCharsProject: generateMockProject({
    name: 'project-with-$p€cial-ch@rs!',
    path: '/Users/test/project (copy) & backup',
  }),
  
  futureTimestamp: generateMockSession({
    startTime: new Date(Date.now() + 86400000).toISOString(),
  }),
  
  ancientTimestamp: generateMockSession({
    startTime: new Date('1970-01-01').toISOString(),
  }),
};