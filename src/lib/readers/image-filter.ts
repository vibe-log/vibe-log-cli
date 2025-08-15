/**
 * Filters images from Claude Code message content
 * Replaces base64-encoded images with placeholders to prevent them from being uploaded
 * This dramatically improves performance by avoiding regex operations on 500KB+ strings
 */

/**
 * Filter images from message content and replace with placeholder text
 * @param content - The raw message content (can be string, array, or object)
 * @returns Filtered content as a string with image placeholders
 */
export function filterImageContent(content: any): string {
  // Handle null or undefined content
  if (content === null || content === undefined) {
    return '';
  }

  // If content is already a string, return as-is
  if (typeof content === 'string') {
    return content;
  }

  // Handle structured content arrays (Claude's format for messages with images)
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    let imageCount = 0;

    for (const item of content) {
      if (typeof item === 'object' && item !== null) {
        // Extract text content
        if (item.type === 'text' && item.text) {
          textParts.push(item.text);
        } 
        // Count images but don't include their data
        else if (item.type === 'image') {
          imageCount++;
        }
      } else if (typeof item === 'string') {
        // Handle plain string items in array
        textParts.push(item);
      }
    }

    // Combine text parts and add image count indicator
    let result = textParts.join(' ').trim();
    if (imageCount > 0) {
      const attachment = imageCount === 1 ? 'attachment' : 'attachments';
      result = result ? `${result} [${imageCount} image ${attachment}]` : `[${imageCount} image ${attachment}]`;
    }
    
    return result || '';
  }

  // For any other object type, stringify it (shouldn't normally happen)
  if (typeof content === 'object') {
    // Check if it's a single image object
    if (content.type === 'image') {
      return '[1 image attachment]';
    }
    // Check if it's a text object
    if (content.type === 'text' && content.text) {
      return content.text;
    }
    // Fall back to stringification for unknown objects
    return JSON.stringify(content);
  }

  // Fall back to string conversion for any other type
  return String(content);
}

/**
 * Check if content contains images (for logging/debugging purposes)
 * @param content - The raw message content
 * @returns True if content contains images
 */
export function containsImages(content: any): boolean {
  if (!content || typeof content !== 'object') {
    return false;
  }

  if (Array.isArray(content)) {
    return content.some(item => 
      typeof item === 'object' && 
      item !== null && 
      item.type === 'image'
    );
  }

  return content.type === 'image';
}

/**
 * Get count of images in content
 * @param content - The raw message content
 * @returns Number of images found
 */
export function countImages(content: any): number {
  if (!content || typeof content !== 'object') {
    return 0;
  }

  if (Array.isArray(content)) {
    return content.filter(item => 
      typeof item === 'object' && 
      item !== null && 
      item.type === 'image'
    ).length;
  }

  return content.type === 'image' ? 1 : 0;
}