/**
 * Minimal session context extractor that reuses existing parsing logic
 * Extracts the last assistant message from a Claude session file
 */

import { ClaudeFileSystem } from './claude-fs';
import { logger } from '../utils/logger';

/**
 * Extract the last assistant message from a transcript file
 * Reuses existing file system abstraction - no direct fs imports
 */
export async function extractLastAssistantMessage(
  transcriptPath: string
): Promise<string | null> {
  try {
    // Normalize path (handle ~/ expansion)
    const normalizedPath = transcriptPath.replace(/^~\//, `${process.env.HOME}/`);
    
    // Use existing file system abstraction
    const fs = new ClaudeFileSystem();
    const content = await fs.readSessionFile(normalizedPath);
    
    // Parse JSONL content
    const lines = content.trim().split('\n');
    let lastAssistantMessage: string | null = null;
    
    // Read lines in reverse to find the most recent assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const data = JSON.parse(line);
        
        // Check if this line contains an assistant message
        if (data.message && data.message.role === 'assistant') {
          // Extract text content from the message
          const content = data.message.content;
          
          if (typeof content === 'string') {
            lastAssistantMessage = content;
          } else if (Array.isArray(content)) {
            // Extract text from content array
            const textContent = content
              .filter((item: any) => item.type === 'text')
              .map((item: any) => item.text)
              .join('\n');
            
            if (textContent) {
              lastAssistantMessage = textContent;
            }
          }
          
          if (lastAssistantMessage) {
            logger.debug('Found last assistant message', {
              length: lastAssistantMessage.length,
              preview: lastAssistantMessage.substring(0, 100)
            });
            break;
          }
        }
      } catch (error) {
        // Skip invalid JSON lines
        continue;
      }
    }
    
    return lastAssistantMessage;
    
  } catch (error) {
    logger.debug('Failed to extract context from transcript:', error);
    return null;
  }
}