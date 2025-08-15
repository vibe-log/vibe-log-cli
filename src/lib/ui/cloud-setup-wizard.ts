import inquirer from 'inquirer';
import { colors } from './styles';
import { auth } from '../../commands/auth';
import { sendWithTimeout } from '../../commands/send';
import { showSessionSelector, SelectedSessionInfo } from './session-selector';
import { showPrivacyPreview } from './privacy-preview';
import { MessageSanitizer } from '../message-sanitizer';
import { getDashboardUrl } from '../config';
import path from 'path';
import fs from 'fs/promises';
import open from 'open';

/**
 * Guided cloud setup flow for first-time users
 * NEW FLOW: Session Selection → Privacy Preview → Authentication → Upload
 * Users see concrete sessions BEFORE being asked to authenticate
 */
export async function guidedCloudSetup(): Promise<void> {
  // Step 1: Session Selection (NO AUTH REQUIRED)
  console.clear();
  const { showLogo } = await import('../ui');
  await showLogo();
  console.log(colors.accent('\n👀 Step 1: Let\'s See What You\'ve Been Building\n'));
  
  console.log(colors.primary('Take a peek at your recent Claude Code sessions - no commitment required.'));
  console.log(colors.subdued('Browse freely! We\'ll only ask for authentication if you decide to proceed.\n'));
  
  // Show session selector - works without auth
  const selectedSessions = await showSessionSelector();
  
  if (selectedSessions.length === 0) {
    console.log(colors.warning('\n⚠ No sessions selected'));
    console.log(colors.subdued('You can set up cloud mode later when you have sessions to analyze.'));
    return;
  }
  
  console.log(colors.success(`\n✓ ${selectedSessions.length} session(s) selected`));
  
  // Step 2: Privacy Preview - Show what will be redacted
  console.clear();
  await showLogo();
  console.log(colors.accent('\n🔒 Step 2: Privacy Preview\n'));
  
  console.log(colors.primary('Your code never leaves your machine - we only analyze patterns and redacted metadata.'));
  console.log(colors.subdued('This is open source - you can verify exactly what we redact. Your actual code stays private.\n'));
  
  // Process sessions to show redaction preview
  const apiSessions = await processSessionsForPreview(selectedSessions);
  
  // Show privacy preview with actual redaction counts and session context
  const proceed = await showPrivacyPreview(apiSessions, selectedSessions);
  
  if (!proceed) {
    console.log(colors.warning('\nSetup cancelled.'));
    console.log(colors.subdued('Your sessions remain on your local machine.'));
    return;
  }
  
  // Step 3: Just-in-time Authentication
  console.clear();
  await showLogo();
  console.log(colors.accent('\n🔐 Step 3: Authentication\n'));
  
  console.log(colors.primary('Now we need to authenticate to upload your sessions.'));
  console.log(colors.subdued('This is a one-time setup using your GitHub account.\n'));
  
  console.log(colors.info('Authenticating with GitHub...'));
  
  try {
    await auth({ wizardMode: true });
  } catch (error) {
    console.log(colors.error('\n✗ Authentication failed'));
    console.log(colors.subdued('Please try again from the main menu.'));
    return;
  }
  
  // Step 4: Upload Sessions
  console.clear();
  await showLogo();
  console.log(colors.accent('\n📤 Uploading Your Sessions\n'));
  
  // Show privacy processing message
  console.log(colors.dim('Preparing sessions for privacy-safe upload...'));
  
  // Use the send command with selected sessions, skipping the action menu since we already confirmed
  try {
    await sendWithTimeout({ selectedSessions, skipActionMenu: true });
    
    // Show dashboard link after successful upload
    console.log('');
    console.log(colors.primary('🎉 Your sessions have been uploaded successfully!'));
    console.log('');
    console.log(colors.accent('Your AI analysis is now processing. You can view insights at:'));
    console.log(colors.primary(getDashboardUrl()));
    console.log('');
    
    // Prompt to view dashboard
    const { viewDashboard } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'viewDashboard',
        message: 'Would you like to view your dashboard? (Y/n)',
        default: true,
      },
    ]);
    
    if (viewDashboard) {
      console.log(colors.info('Opening dashboard in your browser...'));
      await open(getDashboardUrl());
      console.log('');
      console.log(colors.subdued('Take a moment to explore your productivity insights!'));
      console.log('');
      
      // Brief pause to let user see the message
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // After dashboard viewing, offer hooks setup
    const { setupHooks } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupHooks',
        message: 'Would you like to enable automatic session sync?',
        default: true,
      },
    ]);
    
    if (setupHooks) {
      console.clear();
      await showLogo();
      console.log(colors.accent('\n🔧 Optional: Configure Auto-sync\n'));
      
      const hooksInstalled = await showHooksManagementMenuGuided();
      
      if (hooksInstalled) {
        console.log(colors.success('\n✓ Auto-sync enabled!'));
        console.log(colors.subdued('Your future Claude Code sessions will be automatically synced.'));
      } else {
        console.log(colors.muted('\n○ Auto-sync skipped'));
        console.log(colors.subdued('You can enable this later from the main menu.'));
      }
    }
  } catch (error) {
    console.log(colors.error('\n✗ Failed to upload sessions'));
    console.log(colors.subdued('You can try again from the main menu.'));
    return;
  }
  
  // Final success message
  console.clear();
  await showLogo();
  console.log(colors.success('\n🎉 Cloud Setup Complete!\n'));
  
  console.log(colors.primary('Your vibe-log is now active!'));
  console.log('');
  console.log(colors.success('  ✓ Sessions uploaded and being analyzed'));
  console.log(colors.success('  ✓ Dashboard ready with your productivity insights'));
  console.log(colors.success('  ✓ Cloud authentication successful'));
  
  console.log('');
  console.log(colors.accent('Dashboard URL:'));
  console.log(colors.primary(getDashboardUrl()));
  console.log('');
  console.log(colors.subdued('Press Enter to continue...'));
  await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
  
  // Return control to the calling function (main-menu.ts will handle the menu)
}

/**
 * Process selected sessions to generate API format for preview
 * Re-reads the session files and sanitizes them for privacy preview
 */
async function processSessionsForPreview(selectedInfo: SelectedSessionInfo[]): Promise<any[]> {
  const sanitizer = new MessageSanitizer();
  const apiSessions = [];
  
  for (const info of selectedInfo) {
    try {
      const filePath = path.join(info.projectPath, info.sessionFile);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      const messages: any[] = [];
      let metadata: any = null;
      
      // Parse session file to extract messages
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const data = JSON.parse(line);
          
          // Extract metadata from first valid entry
          if (!metadata && data.sessionId) {
            metadata = {
              sessionId: data.sessionId,
              cwd: data.cwd,
              timestamp: data.timestamp,
            };
          }
          
          // Collect messages
          if (data.message) {
            messages.push({
              role: data.message.role,
              content: data.message.content,
              timestamp: data.timestamp,
            });
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
      
      // Sanitize messages for privacy
      const sanitizedMessages = sanitizer.sanitizeMessages(messages);
      
      // Create API session format
      apiSessions.push({
        tool: 'claude',
        timestamp: info.timestamp.toISOString(),
        duration: info.duration,
        data: {
          projectName: info.displayName,
          messageSummary: JSON.stringify(sanitizedMessages),
          messageCount: messages.length,
        },
      });
    } catch (error) {
      // Skip sessions that can't be read
      console.log(colors.warning(`Failed to process session: ${info.sessionFile}`));
    }
  }
  
  return apiSessions;
}

/**
 * Show hooks management in guided mode
 */
async function showHooksManagementMenuGuided(): Promise<boolean> {
  const { showHooksManagementMenu: showHooks } = await import('./hooks-menu');
  const result = await showHooks(true); // Pass guided mode flag
  return result ?? false; // Default to false if void
}