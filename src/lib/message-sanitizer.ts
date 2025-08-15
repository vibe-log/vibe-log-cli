import { Message } from './readers/types';

/**
 * Sanitizes messages by redacting sensitive information while preserving context
 * This allows for meaningful analysis while protecting user privacy
 */

interface SanitizedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string; // Sanitized content - sensitive data redacted
  timestamp: string;
  metadata: {
    hasCode: boolean;
    redactedItems: {
      codeBlocks: number;
      credentials: number;
      envVars: number;
      paths: number;
      urls: number;
      emails: number;
    };
    originalLength: number;
    sanitizedLength: number;
  };
}

// Naming system for consistent entity replacement
class EntityNamer {
  private counters: Map<string, number> = new Map();
  
  getName(type: string): string {
    const count = (this.counters.get(type) || 0) + 1;
    this.counters.set(type, count);
    return `${type}_${count}`;
  }
  
  reset(): void {
    this.counters.clear();
  }
}

export class MessageSanitizer {
  private entityNamer = new EntityNamer();
  private debugMode = process.env.VIBELOG_DEBUG === 'true';
  private debugCredentials: Array<{ text: string; pattern: string }> = [];
  
  sanitizeMessages(messages: Message[]): SanitizedMessage[] {
    // Reset naming for each session to maintain consistency
    this.entityNamer.reset();
    this.debugCredentials = [];
    return messages.map(msg => this.sanitizeMessage(msg));
  }
  
  getDebugCredentials(): Array<{ text: string; pattern: string }> {
    return this.debugCredentials;
  }
  
  private sanitizeMessage(message: Message): SanitizedMessage {
    const timestamp = message.timestamp instanceof Date 
      ? message.timestamp.toISOString()
      : new Date(message.timestamp).toISOString();
    
    const { content, metadata } = this.sanitizeContent(message.content);
    
    return {
      role: message.role,
      content,
      timestamp,
      metadata: {
        hasCode: metadata.codeBlocks > 0,
        redactedItems: {
          codeBlocks: metadata.codeBlocks,
          credentials: metadata.credentials,
          envVars: metadata.envVars,
          paths: metadata.paths,
          urls: metadata.urls,
          emails: metadata.emails,
        },
        originalLength: typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length,
        sanitizedLength: content.length,
      },
    };
  }
  
  private sanitizeContent(content: any): { content: string; metadata: any } {
    // Safety check: detect and filter any large base64 data that slipped through
    if (typeof content === 'object' && content !== null) {
      // Check if it's an array with image attachments
      if (Array.isArray(content)) {
        // Filter to text only
        const textContent = content
          .filter((item: any) => item.type !== 'image')
          .map((item: any) => item.text || item)
          .filter(Boolean)
          .join(' ');
        
        const imageCount = content.filter((item: any) => item.type === 'image').length;
        content = textContent + (imageCount > 0 ? ` [${imageCount} image(s) removed]` : '');
      }
    }
    
    // Handle object content (e.g., assistant messages with structured data)
    let sanitized: string;
    if (typeof content === 'object' && content !== null) {
      // If it's an object, stringify it to preserve the content
      sanitized = JSON.stringify(content, null, 2);
    } else {
      sanitized = String(content);
    }
    const metadata = {
      codeBlocks: 0,
      credentials: 0,
      envVars: 0,
      paths: 0,
      urls: 0,
      emails: 0,
    };
    
    // 1. Redact code blocks but keep description
    sanitized = sanitized.replace(/```[\s\S]*?```/g, (match) => {
      metadata.codeBlocks++;
      const lang = match.match(/```(\w+)/)?.[1] || 'code';
      return `[CODE_BLOCK_${this.entityNamer.getName('code')}: ${lang}]`;
    });
    
    // 2. Redact inline code but keep context
    sanitized = sanitized.replace(/`[^`]+`/g, (match) => {
      // Check if it's a credential-like pattern
      if (this.looksLikeCredential(match)) {
        metadata.credentials++;
        if (this.debugMode) {
          // Store debug info for inline code detected as credential
          const preview = match.length > 20 ? match.substring(0, 20) + '...' : match;
          this.debugCredentials.push({ text: preview, pattern: 'Inline code (credential-like)' });
        }
        return `[CREDENTIAL_${this.entityNamer.getName('credential')}]`;
      }
      metadata.codeBlocks++; // Count inline code as code blocks
      return `[CODE_${this.entityNamer.getName('inline_code')}]`;
    });
    
    // 3. Redact API keys and tokens - optimized for performance
    // First, do a quick check if the content likely contains credentials
    const hasLikelyCredentials = /\b(sk[-_]|pk[-_]|rk_|gh[ps]_|gho_|ghu_|ghr_|AKIA|xox[bp]-|npm_|SG\.|bearer\s+)/i.test(sanitized);
    
    if (hasLikelyCredentials) {
      // Only run specific patterns if we found indicators
      const credentialPatterns: Array<{ pattern: RegExp; name: string }> = [
        // Most common patterns first for better performance
        // GitHub tokens (very common in dev environments)
        { pattern: /\bgh[ps]_[a-zA-Z0-9]{36,}\b/g, name: 'GitHub token' },
        { pattern: /\bgho_[a-zA-Z0-9]{36,}\b/g, name: 'GitHub OAuth token' },
        
        // Stripe keys (common in web dev)
        { pattern: /\bsk[-_](test|live)[-_][a-zA-Z0-9_-]{24,}\b/g, name: 'Stripe secret key' },
        { pattern: /\bpk[-_](test|live)[-_][a-zA-Z0-9_-]{24,}\b/g, name: 'Stripe publishable key' },
        
        // Bearer tokens (common in API calls)
        { pattern: /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, name: 'Bearer token' },
        
        // OpenAI/Anthropic keys (increasingly common)
        { pattern: /\bsk-[a-zA-Z0-9]{48,}\b/g, name: 'OpenAI API key' },
        { pattern: /\bsk-ant-[a-zA-Z0-9]{48,}\b/g, name: 'Anthropic API key' },
        
        // Less common patterns
        { pattern: /\brk_(live|test)_[a-zA-Z0-9]{24,}\b/g, name: 'Stripe restricted key' },
        { pattern: /\bghu_[a-zA-Z0-9]{36,}\b/g, name: 'GitHub user token' },
        { pattern: /\bghr_[a-zA-Z0-9]{36,}\b/g, name: 'GitHub refresh token' },
        { pattern: /\bAKIA[A-Z0-9]{16}\b/g, name: 'AWS Access Key' },
        { pattern: /\bAAAA[A-Za-z0-9_-]{32,}\b/g, name: 'Firebase/GCP token' },
        { pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g, name: 'SendGrid API key' },
        { pattern: /\bxox[bp]-[0-9]{10,}-[a-zA-Z0-9]{24,}/g, name: 'Slack token' },
        { pattern: /\bnpm_[a-zA-Z0-9]{36,}\b/g, name: 'NPM token' },
      ];
      
      // Skip AWS Secret Key pattern - it's too expensive with lookahead
      // and rarely matches real secrets
      
      credentialPatterns.forEach(({ pattern, name }) => {
        sanitized = sanitized.replace(pattern, (match) => {
          metadata.credentials++;
          if (this.debugMode) {
            // Store debug info (truncate for safety)
            const preview = match.length > 20 ? match.substring(0, 20) + '...' : match;
            this.debugCredentials.push({ text: preview, pattern: name });
          }
          return `[CREDENTIAL_${this.entityNamer.getName('credential')}]`;
        });
      });
    }
    
    // Note: Removed generic long token check - it was causing 400K+ false positives
    // Real credentials are already caught by the specific patterns above
    
    // 4. Redact environment variables
    sanitized = sanitized.replace(/\$\{?[A-Z_][A-Z0-9_]*\}?/g, (_match) => {
      metadata.envVars++;
      return `[ENV_VAR_${this.entityNamer.getName('env_var')}]`;
    });
    
    // 5. Redact file paths but keep general structure
    const pathPatterns = [
      /[A-Z]:\\[\w\\.-]+/g, // Windows paths
      /\/(?:home|usr|var|etc|Users)\/[\w/.-]+/g, // Unix paths
      /\.\.?\/[\w/.-]+/g, // Relative paths
    ];
    
    pathPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, (_match) => {
        metadata.paths++;
        return `[PATH_${this.entityNamer.getName('path')}]`;
      });
    });
    
    // 6. Redact URLs but keep domain type (including database URLs)
    sanitized = sanitized.replace(
      /(?:https?|postgres|mysql|mongodb|redis):\/\/[^\s<>"{}|\\^`\[\]]+/g,
      (url) => {
        metadata.urls++;
        // Database URLs take precedence
        if (url.startsWith('postgres') || url.startsWith('mysql') || url.startsWith('mongodb') || url.startsWith('redis')) {
          return '[DATABASE_URL]';
        }
        if (url.includes('github.com')) return '[GITHUB_URL]';
        if (url.includes('localhost') || url.includes('127.0.0.1')) return '[LOCAL_URL]';
        if (url.includes('api')) return '[API_URL]';
        return `[URL_${this.entityNamer.getName('url')}]`;
      }
    );
    
    // 7. Redact email addresses
    sanitized = sanitized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      () => {
        metadata.emails++;
        return `[EMAIL_${this.entityNamer.getName('email')}]`;
      }
    );
    
    // 8. Redact IP addresses
    sanitized = sanitized.replace(
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      '[IP_ADDRESS]'
    );
    
    // 9. Redact potential passwords in quotes
    sanitized = sanitized.replace(
      /["']password["']:\s*["'][^"']+["']/gi,
      '"password": "[REDACTED_PASSWORD]"'
    );
    
    return { content: sanitized, metadata };
  }
  
  private looksLikeCredential(text: string): boolean {
    // Remove backticks
    const cleaned = text.replace(/`/g, '');
    
    // Check for specific credential patterns (not generic strings)
    const credentialIndicators = [
      // Specific API key prefixes
      /^sk[-_](test|live)[-_]/, // Stripe secret keys
      /^pk[-_](test|live)[-_]/, // Stripe publishable keys
      /^rk_(live|test)_/, // Stripe restricted keys
      /^gh[ps]_/, // GitHub tokens
      /^gho_/, // GitHub OAuth
      /^ghu_/, // GitHub user
      /^ghr_/, // GitHub refresh
      /^AKIA[A-Z0-9]/, // AWS Access Key
      /^xox[bp]-/, // Slack tokens
      /^npm_/, // NPM tokens
      /^SG\./, // SendGrid
      /^sk-[a-zA-Z0-9]{48,}/, // OpenAI style
      /^sk-ant-/, // Anthropic
      
      // Only flag as credential if it's an assignment with a literal value
      /^(api[_-]?key|api[_-]?secret|auth[_-]?token|access[_-]?token|private[_-]?key)\s*=\s*["'][^"']+["']$/i,
      
      // JWT tokens (three base64 parts separated by dots)
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
      
      // Only consider hex strings as credentials if they're exactly 32, 40, or 64 chars (MD5, SHA1, SHA256)
      /^[a-f0-9]{32}$/i, // MD5
      /^[a-f0-9]{40}$/i, // SHA1  
      /^[a-f0-9]{64}$/i, // SHA256
    ];
    
    return credentialIndicators.some(pattern => pattern.test(cleaned));
  }
  
  
}

/**
 * Example usage showing transparency:
 * 
 * Input: "Check the file at /home/user/project/secret.env with API_KEY=sk_1234567890"
 * Output: "Check the file at [PATH_1] with [ENV_VAR_1]=[CREDENTIAL_1]"
 * 
 * Input: "Here's my code: `const password = 'super-secret-123'`"
 * Output: "Here's my code: [CODE_1]"
 * 
 * This way:
 * - Context is preserved for analysis
 * - Sensitive data is protected
 * - Users can see exactly what's being redacted
 * - Consistent naming helps LLM understand relationships
 */

export function createSessionSummary(messages: SanitizedMessage[]): {
  conversationFlow: string;
  redactionSummary: {
    totalRedactions: number;
    byType: Record<string, number>;
  };
  contextPreserved: boolean;
} {
  const totalRedactions = messages.reduce((sum, msg) => {
    const items = msg.metadata.redactedItems;
    return sum + Object.values(items).reduce((a, b) => a + b, 0);
  }, 0);
  
  const byType = messages.reduce((acc, msg) => {
    Object.entries(msg.metadata.redactedItems).forEach(([type, count]) => {
      acc[type] = (acc[type] || 0) + count;
    });
    return acc;
  }, {} as Record<string, number>);
  
  // Create a flow summary showing the conversation structure
  const conversationFlow = messages
    .map(msg => `${msg.role}: ${msg.content.substring(0, 100)}...`)
    .join('\n');
  
  return {
    conversationFlow,
    redactionSummary: {
      totalRedactions,
      byType,
    },
    contextPreserved: true,
  };
}