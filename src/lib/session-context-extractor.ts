/**
 * Session context extractor that reuses existing parsing logic
 * Extracts conversation context from a Claude session file
 */

import { ClaudeFileSystem } from './claude-fs';
import { logger } from '../utils/logger';

/**
 * Extract conversation context (last 2-3 message pairs) from a transcript file
 * Returns formatted conversation history for better context understanding
 */
export async function extractConversationContext(
  transcriptPath: string,
  turnsToExtract: number = 3
): Promise<string | null> {
  try {
    // Normalize path (handle ~/ expansion)
    const normalizedPath = transcriptPath.replace(/^~\//, `${process.env.HOME}/`);
    
    // Use existing file system abstraction
    const fs = new ClaudeFileSystem();
    const content = await fs.readSessionFile(normalizedPath);
    
    // Parse JSONL content
    const lines = content.trim().split('\n');
    const messages: Array<{ role: string; content: string }> = [];
    
    // Read lines in reverse to collect recent messages
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const data = JSON.parse(line);
        
        // Check if this line contains a message (user or assistant)
        if (data.message && (data.message.role === 'assistant' || data.message.role === 'user')) {
          // Skip meta messages and command messages
          if (data.isMeta) continue;
          
          // Extract text content from the message
          let messageContent: string = '';
          const content = data.message.content;
          
          if (typeof content === 'string') {
            messageContent = content;
          } else if (Array.isArray(content)) {
            // Extract text from content array
            messageContent = content
              .filter((item: any) => item.type === 'text')
              .map((item: any) => item.text)
              .join('\n');
          }
          
          // Skip empty messages or command-related messages
          if (messageContent && 
              !messageContent.includes('<command-name>') && 
              !messageContent.includes('Caveat: The messages below were generated')) {
            messages.unshift({
              role: data.message.role,
              content: messageContent.substring(0, 500) // Limit message length
            });
            
            // Stop when we have enough conversation turns
            // Count pairs - we want roughly turnsToExtract exchanges
            const assistantCount = messages.filter(m => m.role === 'assistant').length;
            const userCount = messages.filter(m => m.role === 'user').length;
            const minCount = Math.min(assistantCount, userCount);
            
            if (minCount >= turnsToExtract) {
              break;
            }
          }
        }
      } catch (error) {
        // Skip invalid JSON lines
        continue;
      }
    }
    
    // Format the conversation context
    if (messages.length === 0) {
      return null;
    }
    
    // Build conversation context string
    const contextParts: string[] = [];
    for (const msg of messages) {
      const roleLabel = msg.role === 'assistant' ? 'Previous Assistant' : 'Previous User';
      contextParts.push(`${roleLabel}: ${msg.content}`);
    }
    
    const conversationContext = contextParts.join('\n\n');
    
    logger.debug('Extracted conversation context', {
      messageCount: messages.length,
      contextLength: conversationContext.length,
      preview: conversationContext.substring(0, 200)
    });
    
    return conversationContext;
    
  } catch (error) {
    logger.debug('Failed to extract conversation context from transcript:', error);
    return null;
  }
}