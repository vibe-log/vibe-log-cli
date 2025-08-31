/**
 * Session context extractor that reuses existing parsing logic
 * Extracts conversation context from a Claude session file
 */

import { ClaudeFileSystem } from './claude-fs';
import { logger } from '../utils/logger';
import { SessionMetadata } from './prompt-analyzer';

/**
 * Number of conversation turns to extract for context when analyzing prompts
 * Each turn is a user-assistant message pair
 * Increase for more context, decrease for faster analysis
 */
export const DEFAULT_CONVERSATION_TURNS_TO_EXTRACT_AS_CONTEXT = 10;

/**
 * Extract conversation context including first message and recent turns
 * Returns formatted conversation history with original mission and current context
 */
export async function extractConversationContext(
  transcriptPath: string,
  turnsToExtract: number = DEFAULT_CONVERSATION_TURNS_TO_EXTRACT_AS_CONTEXT
): Promise<string | null> {
  try {
    // Normalize path (handle ~/ expansion)
    const normalizedPath = transcriptPath.replace(/^~\//, `${process.env.HOME}/`);
    
    // Use existing file system abstraction
    const fs = new ClaudeFileSystem();
    const content = await fs.readSessionFile(normalizedPath);
    
    // Parse JSONL content
    const lines = content.trim().split('\n');
    let firstUserMessage: { role: string; content: string } | null = null;
    const recentMessages: Array<{ role: string; content: string }> = [];
    
    // First pass: Find the very first user message (original mission)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const data = JSON.parse(line);
        
        // Check if this is the first user message
        if (data.message && data.message.role === 'user' && !data.isMeta) {
          // Extract text content from the message
          let messageContent: string = '';
          const content = data.message.content;
          
          if (typeof content === 'string') {
            messageContent = content;
          } else if (Array.isArray(content)) {
            messageContent = content
              .filter((item: any) => item.type === 'text')
              .map((item: any) => item.text)
              .join('\n');
          }
          
          // Skip command-related messages
          if (messageContent && 
              !messageContent.includes('<command-name>') && 
              !messageContent.includes('Caveat: The messages below were generated')) {
            firstUserMessage = {
              role: 'user',
              content: messageContent.substring(0, 500) // Limit to 500 chars
            };
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    // Second pass: Read lines in reverse to collect recent messages
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
            recentMessages.unshift({
              role: data.message.role,
              content: messageContent.substring(0, 400) // Slightly smaller for recent to save tokens
            });
            
            // Stop when we have enough conversation turns
            // Count pairs - we want roughly turnsToExtract exchanges
            const assistantCount = recentMessages.filter(m => m.role === 'assistant').length;
            const userCount = recentMessages.filter(m => m.role === 'user').length;
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
    
    // Format the conversation context with both original mission and recent context
    if (!firstUserMessage && recentMessages.length === 0) {
      return null;
    }
    
    // Build conversation context string with clear sections
    const contextParts: string[] = [];
    
    // Add the original mission if we found it
    if (firstUserMessage) {
      contextParts.push(`ORIGINAL MISSION: ${firstUserMessage.content}`);
    }
    
    // Add recent conversation context if available
    if (recentMessages.length > 0) {
      contextParts.push('RECENT CONTEXT:');
      
      // Check if the first user message is duplicated in recent messages
      const firstMessageIsDuplicated = firstUserMessage && 
                                       recentMessages.length > 0 && 
                                       recentMessages.some(msg => 
                                         msg.role === 'user' && 
                                         msg.content === firstUserMessage.content);
      
      for (const msg of recentMessages) {
        // Skip the first user message if it's the same as the original mission
        if (firstMessageIsDuplicated && firstUserMessage && msg.role === 'user' && msg.content === firstUserMessage.content) {
          continue;
        }
        
        const roleLabel = msg.role === 'assistant' ? 'Previous Assistant' : 'Previous User';
        contextParts.push(`${roleLabel}: ${msg.content}`);
      }
    }
    
    const conversationContext = contextParts.join('\n\n');
    
    logger.debug('Extracted conversation context', {
      hasOriginalMission: !!firstUserMessage,
      recentMessageCount: recentMessages.length,
      contextLength: conversationContext.length,
      preview: conversationContext.substring(0, 200)
    });
    
    return conversationContext;
    
  } catch (error) {
    logger.debug('Failed to extract conversation context from transcript:', error);
    return null;
  }
}

/**
 * Extract metadata about the session for better context awareness
 * @param transcriptPath - Path to the Claude session JSONL file
 * @param currentPrompt - The current prompt being analyzed
 * @returns SessionMetadata with information about the session state
 */
export async function extractSessionMetadata(
  transcriptPath: string,
  currentPrompt: string
): Promise<SessionMetadata> {
  const metadata: SessionMetadata = {
    messageNumber: 1,
    totalMessages: 0,
    isFirstPrompt: true,
    hasImages: false,
    imageCount: 0,
    lastAssistantEndsWithQuestion: false,
    truncatedMessages: 0
  };

  try {
    // Normalize path (handle ~/ expansion)
    const normalizedPath = transcriptPath.replace(/^~\//, `${process.env.HOME}/`);
    
    // Use existing file system abstraction
    const fs = new ClaudeFileSystem();
    const content = await fs.readSessionFile(normalizedPath);
    
    // Parse JSONL content
    const lines = content.trim().split('\n');
    let userMessageCount = 0;
    let assistantMessageCount = 0;
    let lastAssistantMessage = '';
    let truncatedCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const data = JSON.parse(line);
        
        // Skip meta messages
        if (data.isMeta) continue;
        
        // Count messages
        if (data.message) {
          if (data.message.role === 'user') {
            userMessageCount++;
          } else if (data.message.role === 'assistant') {
            assistantMessageCount++;
            
            // Extract last assistant message text
            let messageContent: string = '';
            const content = data.message.content;
            
            if (typeof content === 'string') {
              messageContent = content;
            } else if (Array.isArray(content)) {
              messageContent = content
                .filter((item: any) => item.type === 'text')
                .map((item: any) => item.text)
                .join('\n');
            }
            
            if (messageContent) {
              lastAssistantMessage = messageContent;
              
              // Check if message was likely truncated (ends with ellipsis or has truncation marker)
              if (messageContent.includes('...') && messageContent.length > 350) {
                truncatedCount++;
              }
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    // Set metadata based on what we found
    metadata.totalMessages = userMessageCount + assistantMessageCount;
    metadata.messageNumber = userMessageCount + 1; // Next user message number
    metadata.isFirstPrompt = userMessageCount === 0;
    metadata.truncatedMessages = truncatedCount;
    
    // Check if last assistant message ends with a question
    if (lastAssistantMessage) {
      // Look for question patterns at the end of the message
      const questionPatterns = [
        /\?\s*$/,                    // Ends with question mark
        /\bor\s+\w+\?\s*$/i,         // "...or X?"
        /\bwhich\s+\w+.*\?\s*$/i,    // "which one?"
        /\bwhat\s+\w+.*\?\s*$/i,     // "what do you think?"
        /\bshould\s+\w+.*\?\s*$/i,   // "should we...?"
        /\bdo\s+you\s+\w+.*\?\s*$/i  // "do you want...?"
      ];
      
      metadata.lastAssistantEndsWithQuestion = questionPatterns.some(pattern => 
        pattern.test(lastAssistantMessage.slice(-200)) // Check last 200 chars
      );
    }
    
    // Check if current prompt contains images
    const imageIndicators = [
      /\[\d+\s+image\s+attachments?\]/i,
      /see\s+(the\s+)?image/i,
      /as\s+shown/i,
      /in\s+the\s+screenshot/i,
      /above\s+image/i,
      /attached\s+image/i
    ];
    
    metadata.hasImages = imageIndicators.some(pattern => pattern.test(currentPrompt));
    
    // Count images if present
    const imageMatch = currentPrompt.match(/\[(\d+)\s+image\s+attachments?\]/i);
    if (imageMatch) {
      metadata.imageCount = parseInt(imageMatch[1], 10);
    } else if (metadata.hasImages) {
      metadata.imageCount = 1; // Assume at least one if indicators present
    }
    
    logger.debug('Extracted session metadata', metadata);
    
    return metadata;
    
  } catch (error) {
    logger.debug('Failed to extract session metadata:', error);
    // Return default metadata on error
    return metadata;
  }
}