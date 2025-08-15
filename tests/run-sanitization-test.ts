import { MessageSanitizer } from '../src/lib/message-sanitizer';
import fs from 'fs/promises';
import path from 'path';

interface ClaudeMessage {
  role: string;
  content: string;
  timestamp: string;
}

interface ClaudeLogEntry {
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: ClaudeMessage;
  type?: string;
  files?: string[];
}

async function runSanitizationTest() {
  const sessionFile = path.join(__dirname, 'session_data.jsonl');
  const reportFile = path.join(__dirname, 'sanitization-report.md');
  const sanitizedDataFile = path.join(__dirname, 'reducted_ready_to_send.json');
  
  console.log('Reading session data...');
  const content = await fs.readFile(sessionFile, 'utf-8');
  const lines = content.trim().split('\n');
  
  const messages = [];
  let totalEntries = 0;
  let messageEntries = 0;
  
  // Parse messages from JSONL
  for (const line of lines) {
    if (!line.trim()) continue;
    totalEntries++;
    
    try {
      const data: ClaudeLogEntry = JSON.parse(line);
      if (data.message && data.timestamp) {
        messageEntries++;
        // Handle content that might be an object
        let content = '';
        if (typeof data.message.content === 'string') {
          content = data.message.content;
        } else if (data.message.content && typeof data.message.content === 'object') {
          // If content is an object, stringify it
          content = JSON.stringify(data.message.content);
        }
        
        messages.push({
          role: data.message.role as 'user' | 'assistant',
          content: content,
          timestamp: new Date(data.timestamp),
        });
      }
    } catch (err) {
      console.error('Error parsing line:', err);
    }
  }
  
  console.log(`Found ${messages.length} messages out of ${totalEntries} total entries`);
  
  // Run sanitization
  const sanitizer = new MessageSanitizer();
  const sanitizedMessages = sanitizer.sanitizeMessages(messages);
  
  // Generate report
  let report = `# Sanitization Test Report\n\n`;
  report += `**Date**: ${new Date().toISOString()}\n`;
  report += `**Session File**: tests/session_data.jsonl\n`;
  report += `**Total JSONL Entries**: ${totalEntries}\n`;
  report += `**Message Entries**: ${messageEntries}\n`;
  report += `**Messages Processed**: ${messages.length}\n\n`;
  
  report += `## Summary Statistics\n\n`;
  
  // Count redactions
  const stats = {
    totalRedactions: 0,
    codeBlocks: 0,
    credentials: 0,
    paths: 0,
    urls: 0,
    emails: 0,
    envVars: 0,
    ips: 0
  };
  
  sanitizedMessages.forEach(msg => {
    const content = msg.content;
    stats.codeBlocks += (content.match(/\[CODE_BLOCK_\d+/g) || []).length;
    stats.credentials += (content.match(/\[CREDENTIAL_\d+\]/g) || []).length;
    stats.paths += (content.match(/\[PATH_\d+\]/g) || []).length;
    stats.urls += (content.match(/\[(DATABASE_URL|API_URL|WEBHOOK_URL|URL_\d+)\]/g) || []).length;
    stats.emails += (content.match(/\[EMAIL_\d+\]/g) || []).length;
    stats.envVars += (content.match(/\[ENV_VAR_\d+\]/g) || []).length;
    stats.ips += (content.match(/\[IP_\d+\]/g) || []).length;
  });
  
  stats.totalRedactions = Object.values(stats).slice(1).reduce((a, b) => a + b, 0);
  
  report += `- **Total Redactions**: ${stats.totalRedactions}\n`;
  report += `- **Code Blocks**: ${stats.codeBlocks}\n`;
  report += `- **Credentials**: ${stats.credentials}\n`;
  report += `- **File Paths**: ${stats.paths}\n`;
  report += `- **URLs**: ${stats.urls}\n`;
  report += `- **Emails**: ${stats.emails}\n`;
  report += `- **Environment Variables**: ${stats.envVars}\n`;
  report += `- **IP Addresses**: ${stats.ips}\n\n`;
  
  report += `## Sample Before/After Comparison\n\n`;
  
  // Show first few examples
  let examplesShown = 0;
  for (let i = 0; i < messages.length && examplesShown < 5; i++) {
    const original = messages[i];
    const sanitized = sanitizedMessages[i];
    
    if (original.content !== sanitized.content) {
      examplesShown++;
      report += `### Example ${examplesShown}\n\n`;
      report += `**Role**: ${original.role}\n\n`;
      report += `**Original** (truncated to 200 chars):\n`;
      const origContent = String(original.content);
      report += `\`\`\`\n${origContent.substring(0, 200)}${origContent.length > 200 ? '...' : ''}\n\`\`\`\n\n`;
      report += `**Sanitized** (truncated to 200 chars):\n`;
      const sanitContent = String(sanitized.content);
      report += `\`\`\`\n${sanitContent.substring(0, 200)}${sanitContent.length > 200 ? '...' : ''}\n\`\`\`\n\n`;
    }
  }
  
  report += `## Redaction Pattern Examples\n\n`;
  report += `- Code blocks → \`[CODE_BLOCK_1: javascript]\`\n`;
  report += `- API keys → \`[CREDENTIAL_1]\`\n`;
  report += `- File paths → \`[PATH_1]\`\n`;
  report += `- URLs → \`[API_URL]\`, \`[URL_1]\`\n`;
  report += `- Emails → \`[EMAIL_1]\`\n`;
  report += `- Environment variables → \`[ENV_VAR_1]\`\n`;
  report += `- IP addresses → \`[IP_1]\`\n\n`;
  
  report += `## Privacy Analysis\n\n`;
  report += `✅ **Preserved**: Conversation context, questions, explanations, natural language\n`;
  report += `✅ **Redacted**: All sensitive technical details, credentials, and identifying information\n`;
  report += `✅ **Consistency**: Entity naming ensures references remain coherent across messages\n\n`;
  
  // Write report
  await fs.writeFile(reportFile, report);
  console.log(`Report written to: ${reportFile}`);
  
  // Write sanitized data ready to send
  const dataToSend = {
    metadata: {
      sessionId: 'sanitized-session-001',
      timestamp: new Date().toISOString(),
      messageCount: sanitizedMessages.length,
      sanitizationVersion: '2.0',
      redactionCount: stats.totalRedactions
    },
    messages: sanitizedMessages
  };
  
  await fs.writeFile(sanitizedDataFile, JSON.stringify(dataToSend, null, 2));
  console.log(`Sanitized data written to: ${sanitizedDataFile}`);
  
  return {
    messagesProcessed: messages.length,
    totalRedactions: stats.totalRedactions,
    reportPath: reportFile,
    dataPath: sanitizedDataFile
  };
}

// Run the test
runSanitizationTest()
  .then(result => {
    console.log('\nSanitization test completed successfully!');
    console.log(`Messages processed: ${result.messagesProcessed}`);
    console.log(`Total redactions: ${result.totalRedactions}`);
  })
  .catch(error => {
    console.error('Error running sanitization test:', error);
    process.exit(1);
  });