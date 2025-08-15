export const claudeSessionFixtures = {
  validSessionFile: `{"sessionId":"session-123","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z","type":"start"}
{"message":{"role":"user","content":"Create a React component","timestamp":"2024-01-15T10:01:00Z"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","content":"I'll create a React component for you","timestamp":"2024-01-15T10:02:00Z"},"timestamp":"2024-01-15T10:02:00Z"}
{"toolUseResult":{"type":"create","filePath":"src/components/Button.tsx"},"timestamp":"2024-01-15T10:03:00Z"}
{"message":{"role":"user","content":"Add props to the component","timestamp":"2024-01-15T10:05:00Z"},"timestamp":"2024-01-15T10:05:00Z"}
{"message":{"role":"assistant","content":"I'll add props to the component","timestamp":"2024-01-15T10:06:00Z"},"timestamp":"2024-01-15T10:06:00Z"}`,

  emptySessionFile: `{"sessionId":"empty-session","cwd":"/home/user/empty","timestamp":"2024-01-15T10:00:00Z"}`,

  invalidJsonFile: `{"sessionId":"invalid-session","cwd":"/home/user/invalid"
{invalid json here}
{"message":{"role":"user","content":"test"},"timestamp":"2024-01-15T10:00:00Z"}`,

  longSessionFile: (() => {
    const lines = [`{"sessionId":"long-session","cwd":"/home/user/long-project","timestamp":"2024-01-15T09:00:00Z"}`];
    
    // Generate 100 message pairs over 3 hours
    for (let i = 0; i < 100; i++) {
      const userTime = new Date(`2024-01-15T09:${String(i % 60).padStart(2, '0')}:00Z`);
      const assistantTime = new Date(userTime.getTime() + 30000); // 30 seconds later
      
      lines.push(
        `{"message":{"role":"user","content":"Request ${i + 1}","timestamp":"${userTime.toISOString()}"},"timestamp":"${userTime.toISOString()}"}`,
        `{"message":{"role":"assistant","content":"Response ${i + 1}","timestamp":"${assistantTime.toISOString()}"},"timestamp":"${assistantTime.toISOString()}"}`
      );
      
      if (i % 10 === 0) {
        lines.push(
          `{"toolUseResult":{"type":"create","filePath":"src/file${i}.ts"},"timestamp":"${assistantTime.toISOString()}"}`,
          `{"toolUseResult":{"type":"update","filePath":"src/file${i}.test.ts"},"timestamp":"${assistantTime.toISOString()}"}`
        );
      }
    }
    
    return lines.join('\n');
  })(),

  multiLanguageSession: `{"sessionId":"multi-lang","cwd":"/home/user/fullstack","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":"Create a full-stack app","timestamp":"2024-01-15T10:01:00Z"},"timestamp":"2024-01-15T10:01:00Z"}
{"toolUseResult":{"type":"create","filePath":"backend/server.py"},"timestamp":"2024-01-15T10:02:00Z"}
{"toolUseResult":{"type":"update","filePath":"backend/models.py"},"timestamp":"2024-01-15T10:02:00Z"}
{"toolUseResult":{"type":"create","filePath":"frontend/App.tsx"},"timestamp":"2024-01-15T10:03:00Z"}
{"toolUseResult":{"type":"update","filePath":"frontend/components/Header.tsx"},"timestamp":"2024-01-15T10:03:00Z"}
{"toolUseResult":{"type":"create","filePath":"database/schema.sql"},"timestamp":"2024-01-15T10:04:00Z"}
{"toolUseResult":{"type":"create","filePath":"database/migrations/001_init.sql"},"timestamp":"2024-01-15T10:04:00Z"}
{"toolUseResult":{"type":"create","filePath":"docker-compose.yml"},"timestamp":"2024-01-15T10:05:00Z"}
{"toolUseResult":{"type":"create","filePath":"Dockerfile"},"timestamp":"2024-01-15T10:05:00Z"}
{"toolUseResult":{"type":"create","filePath":"tests/api.test.js"},"timestamp":"2024-01-15T10:06:00Z"}
{"toolUseResult":{"type":"update","filePath":"tests/ui.test.ts"},"timestamp":"2024-01-15T10:06:00Z"}`,

  corruptedSession: `{"sessionId":"corrupted","cwd":"/test","timestamp":"invalid-date"}
{"message":{"role":"invalid-role","content":"test"},"timestamp":"2024-01-15T10:00:00Z"}
{"message":{"content":"missing role"},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"user"},"timestamp":"2024-01-15T10:02:00Z"}`,

  // Sessions with image attachments
  sessionWithSingleImage: `{"sessionId":"image-session-1","cwd":"/home/user/project","timestamp":"2024-01-15T10:00:00Z"}
{"message":{"role":"user","content":[{"type":"text","text":"Here's a screenshot of the error"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}}]},"timestamp":"2024-01-15T10:01:00Z"}
{"message":{"role":"assistant","content":"I can see the error in your screenshot. Let me help you fix it."},"timestamp":"2024-01-15T10:02:00Z"}`,

  sessionWithMultipleImages: `{"sessionId":"image-session-2","cwd":"/home/user/design-project","timestamp":"2024-01-15T11:00:00Z"}
{"message":{"role":"user","content":[{"type":"text","text":"Check these mockups"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}},{"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}}]},"timestamp":"2024-01-15T11:01:00Z"}
{"message":{"role":"assistant","content":"I see three mockups you've shared. They look great!"},"timestamp":"2024-01-15T11:02:00Z"}`,

  sessionWithMixedContent: `{"sessionId":"mixed-session","cwd":"/home/user/debug-project","timestamp":"2024-01-15T12:00:00Z"}
{"message":{"role":"user","content":[{"type":"text","text":"The error happens here"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}},{"type":"text","text":"and also in this function"}]},"timestamp":"2024-01-15T12:01:00Z"}
{"message":{"role":"assistant","content":"I can see the issue from your screenshot and description. Let me analyze both problems."},"timestamp":"2024-01-15T12:02:00Z"}
{"message":{"role":"user","content":"Can you fix it?"},"timestamp":"2024-01-15T12:03:00Z"}
{"message":{"role":"assistant","content":[{"type":"text","text":"Yes, here's the solution"}]},"timestamp":"2024-01-15T12:04:00Z"}`,

  sessionWithOnlyImages: `{"sessionId":"image-only","cwd":"/home/user/visual-project","timestamp":"2024-01-15T13:00:00Z"}
{"message":{"role":"user","content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}}]},"timestamp":"2024-01-15T13:01:00Z"}
{"message":{"role":"assistant","content":"I see the image you've shared. What would you like me to help with?"},"timestamp":"2024-01-15T13:02:00Z"}`,

  // Large base64 data simulation (would be 500KB+ in reality)
  sessionWithLargeImage: `{"sessionId":"large-image","cwd":"/home/user/heavy-project","timestamp":"2024-01-15T14:00:00Z"}
{"message":{"role":"user","content":[{"type":"text","text":"Analyze this data"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"${'A'.repeat(100000)}"}}]},"timestamp":"2024-01-15T14:01:00Z"}
{"message":{"role":"assistant","content":"I've analyzed the data visualization you provided."},"timestamp":"2024-01-15T14:02:00Z"}`,
};

export const claudeProjectStructure = {
  standard: {
    'project1/session1.jsonl': claudeSessionFixtures.validSessionFile,
    'project1/session2.jsonl': claudeSessionFixtures.multiLanguageSession,
    'project2/session3.jsonl': claudeSessionFixtures.longSessionFile,
    'empty-project/empty.jsonl': claudeSessionFixtures.emptySessionFile,
  },
  
  withErrors: {
    'project1/good.jsonl': claudeSessionFixtures.validSessionFile,
    'project1/corrupted.jsonl': claudeSessionFixtures.corruptedSession,
    'project2/invalid.jsonl': claudeSessionFixtures.invalidJsonFile,
  },
  
  empty: {},
};