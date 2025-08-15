import { describe, it, expect, beforeEach } from 'vitest';
import { MessageSanitizer, createSessionSummary } from '../../../src/lib/message-sanitizer';
import { Message } from '../../../src/lib/readers/types';

describe('Message Sanitizer V2', () => {
  let sanitizer: MessageSanitizer;
  
  beforeEach(() => {
    sanitizer = new MessageSanitizer();
  });
  
  describe('sanitizeMessages', () => {
    it('should redact sensitive data but preserve message context', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Here is my API key: sk-test_1234567890abcdefghijklmnop',
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          role: 'assistant',
          content: 'I see your API key. Let me help you with that.',
          timestamp: new Date('2024-01-01T10:00:30Z'),
        },
      ];

      const sanitized = sanitizer.sanitizeMessages(messages);
      
      // Debug output
      console.log('Sanitized content:', sanitized[0].content);
      console.log('Metadata:', sanitized[0].metadata);

      // Check that sensitive data is redacted
      expect(sanitized[0].content).toContain('[CREDENTIAL_');
      expect(sanitized[0].content).toContain('Here is my API key:');
      expect(sanitized[0].content).not.toContain('sk-test_1234567890abcdefghijklmnop');
      
      // Check that context is preserved
      expect(sanitized[1].content).toContain('I see your API key');
      expect(sanitized[1].content).toContain('Let me help you with that');
      
      // Check structure is preserved
      expect(sanitized).toHaveLength(2);
      expect(sanitized[0].role).toBe('user');
      expect(sanitized[0].metadata.redactedItems.credentials).toBe(1);
    });

    it('should redact code blocks while preserving context', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Can you help me with this function?\n```js\nfunction add(a, b) { return a + b; }\n```',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: 'Sure! Here\'s an improved version:\n```js\nconst add = (a, b) => a + b;\n```',
          timestamp: new Date(),
        },
        {
          role: 'user',
          content: 'What about error handling?',
          timestamp: new Date(),
        },
      ];

      const sanitized = sanitizer.sanitizeMessages(messages);

      // Check code blocks are redacted
      expect(sanitized[0].content).toContain('[CODE_BLOCK_code_1: js]');
      expect(sanitized[0].content).toContain('Can you help me with this function?');
      expect(sanitized[0].content).not.toContain('function add');
      
      expect(sanitized[1].content).toContain('[CODE_BLOCK_code_2: js]');
      expect(sanitized[1].content).toContain('Sure! Here\'s an improved version:');
      
      // Check metadata
      expect(sanitized[0].metadata.hasCode).toBe(true);
      expect(sanitized[1].metadata.hasCode).toBe(true);
      expect(sanitized[2].metadata.hasCode).toBe(false);
      expect(sanitized[0].metadata.redactedItems.codeBlocks).toBe(1);
      expect(sanitized[1].metadata.redactedItems.codeBlocks).toBe(1);
      expect(sanitized[2].metadata.redactedItems.codeBlocks).toBe(0);
    });

    it('should redact file paths while preserving context', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Please check the file at /home/user/project/secret.env',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: 'I\'ll examine the config.json file for you.',
          timestamp: new Date(),
        },
        {
          role: 'user',
          content: 'Thanks for your help!',
          timestamp: new Date(),
        },
      ];

      const sanitized = sanitizer.sanitizeMessages(messages);

      // Check paths are redacted
      expect(sanitized[0].content).toContain('[PATH_path_1]');
      expect(sanitized[0].content).toContain('Please check the file at');
      expect(sanitized[0].content).not.toContain('/home/user/project/secret.env');
      
      // Note: 'config.json' alone is not detected as a path
      expect(sanitized[1].content).toContain('config.json');
      
      // Check metadata
      expect(sanitized[0].metadata.redactedItems.paths).toBe(1);
      expect(sanitized[1].metadata.redactedItems.paths).toBe(0);
      expect(sanitized[2].metadata.redactedItems.paths).toBe(0);
    });

    it('should preserve message content while redacting code', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'How do I implement authentication?',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: 'You can implement authentication using JWT tokens...' + 'a'.repeat(200),
          timestamp: new Date(),
        },
        {
          role: 'user',
          content: '```js\nconst token = jwt.sign(payload, secret);\n```',
          timestamp: new Date(),
        },
      ];

      const sanitized = sanitizer.sanitizeMessages(messages);

      // Check content is preserved
      expect(sanitized[0].content).toBe('How do I implement authentication?');
      expect(sanitized[1].content).toContain('You can implement authentication using JWT tokens...');
      expect(sanitized[2].content).toBe('[CODE_BLOCK_code_1: js]');
      
      // Check metadata
      expect(sanitized[2].metadata.hasCode).toBe(true);
      expect(sanitized[2].metadata.redactedItems.codeBlocks).toBe(1);
    });

    it('should handle sensitive data in code blocks', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: `Here's my database connection:
\`\`\`js
const connection = {
  host: 'prod.database.com',
  user: 'admin',
  password: 'super_secret_password_123',
  database: 'production_db'
};
\`\`\``,
          timestamp: new Date(),
        },
      ];

      const sanitized = sanitizer.sanitizeMessages(messages);

      // Check code block is completely redacted
      expect(sanitized[0].content).toContain('Here\'s my database connection:');
      expect(sanitized[0].content).toContain('[CODE_BLOCK_code_1: js]');
      expect(sanitized[0].content).not.toContain('prod.database.com');
      expect(sanitized[0].content).not.toContain('admin');
      expect(sanitized[0].content).not.toContain('super_secret_password_123');
      expect(sanitized[0].content).not.toContain('production_db');
      
      // Check metadata
      expect(sanitized[0].metadata.hasCode).toBe(true);
      expect(sanitized[0].metadata.redactedItems.codeBlocks).toBe(1);
    });
  });

  describe('createSessionSummary', () => {
    it('should create privacy-safe summary', () => {
      const messages: Message[] = [
        { role: 'user', content: 'My API key is sk-test_1234567890abcdefghijklmnop and database at postgres://localhost', timestamp: new Date() },
        { role: 'assistant', content: 'Answer with code: `console.log()`', timestamp: new Date() },
        { role: 'user', content: 'Another question?', timestamp: new Date() },
        { role: 'assistant', content: 'Simple answer', timestamp: new Date() },
      ];

      const sanitized = sanitizer.sanitizeMessages(messages);
      const summary = createSessionSummary(sanitized);

      expect(summary.redactionSummary.totalRedactions).toBeGreaterThan(0);
      expect(summary.contextPreserved).toBe(true);
      expect(summary.redactionSummary.byType).toBeDefined();
      
      // Ensure sensitive data is redacted but context preserved
      expect(summary.conversationFlow).toContain('My API key is');
      expect(summary.conversationFlow).not.toContain('sk-test_1234567890abcdefghijklmnop');
      expect(summary.conversationFlow).toContain('[CREDENTIAL_');
      expect(summary.conversationFlow).toContain('[DATABASE_URL]');
      expect(summary.conversationFlow).toContain('[CODE_');
    });

    it('should calculate correct redaction statistics', () => {
      const messages: Message[] = Array(10).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 3 === 0 ? '```js\ncode here\n```' : 'Regular message of various lengths...',
        timestamp: new Date(),
      } as Message));

      const sanitized = sanitizer.sanitizeMessages(messages);
      const summary = createSessionSummary(sanitized);

      expect(summary.redactionSummary.totalRedactions).toBeGreaterThan(0);
      expect(summary.redactionSummary.byType.codeBlocks).toBeGreaterThan(0);
      expect(summary.contextPreserved).toBe(true);
      expect(summary.conversationFlow).toBeDefined();
      expect(summary.conversationFlow.split('\n')).toHaveLength(10);
    });
  });
  
  describe('additional redaction patterns', () => {
    it('should redact environment variables', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Set $DATABASE_URL and $API_KEY in your .env file',
          timestamp: new Date(),
        },
      ];
      
      const sanitized = sanitizer.sanitizeMessages(messages);
      
      expect(sanitized[0].content).toContain('[ENV_VAR_env_var_1]');
      expect(sanitized[0].content).toContain('[ENV_VAR_env_var_2]');
      expect(sanitized[0].content).not.toContain('$DATABASE_URL');
      expect(sanitized[0].content).not.toContain('$API_KEY');
      expect(sanitized[0].metadata.redactedItems.envVars).toBe(2);
    });
    
    it('should redact various URL types', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Connect to postgres://user:pass@localhost:5432/db or https://api.stripe.com',
          timestamp: new Date(),
        },
      ];
      
      const sanitized = sanitizer.sanitizeMessages(messages);
      
      expect(sanitized[0].content).toContain('[DATABASE_URL]'); // postgres://...
      expect(sanitized[0].content).toContain('[API_URL]'); // https://api.stripe.com
      expect(sanitized[0].content).not.toContain('postgres://');
      expect(sanitized[0].content).not.toContain('user:pass');
      expect(sanitized[0].metadata.redactedItems.urls).toBe(2);
    });
    
    it('should redact emails and IP addresses', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Contact john.doe@example.com or connect to 192.168.1.1',
          timestamp: new Date(),
        },
      ];
      
      const sanitized = sanitizer.sanitizeMessages(messages);
      
      expect(sanitized[0].content).toContain('[EMAIL_email_1]');
      expect(sanitized[0].content).toContain('[IP_ADDRESS]');
      expect(sanitized[0].content).not.toContain('john.doe@example.com');
      expect(sanitized[0].content).not.toContain('192.168.1.1');
      expect(sanitized[0].metadata.redactedItems.emails).toBe(1);
    });
  });
});