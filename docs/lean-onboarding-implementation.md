# Lean CLI Onboarding Implementation Plan

## Overview
Minimal changes to maximize cloud adoption by reordering the first-time menu and emphasizing immediate value through the standup feature.

## Goals
- **Primary**: Drive cloud adoption without being pushy
- **Secondary**: Show immediate value within 2 minutes
- **Tertiary**: Simplify menu structure and reduce complexity

## Implementation Changes

### 1. First-Time Menu Reordering
**File**: `src/lib/ui/first-time-welcome.ts`
**Lines**: ~20-75

#### Current Structure
```typescript
// Current order:
1. Status Line (Recommended)
2. Local Productivity Reports
3. Cloud Dashboard - FREE FOREVER
4. Help
5. Exit
```

#### New Structure
```typescript
// New order:
1. Prepare for standup (2 min) - NEW!
2. Generate Local Reports
3. Set up - Cloud Dashboard
4. Install CC Co-Pilot Statline
5. Help
6. Exit
```

#### Specific Code Changes
```typescript
// Around line 20-60, update the choices array:
const choices = [
  {
    name: `📋 ${colors.accent('Prepare for standup (2 min) - NEW!')}
    ${colors.success('└─ 🤖 AI-generated standup summary from your sessions')}
    ${colors.success('└─ ✨ Ready for your daily meeting in minutes')}
    ${colors.success('└─ 📝 Uses Claude Code locally')}`,
    value: 'standup' as const,
    short: 'Standup'
  },
  {
    name: `📊 ${colors.primary('Generate Local Reports')}
    ${colors.muted('└─ Using your Claude Code')}
    ${colors.muted('└─ 4-10 minute generation')}
    ${colors.muted('└─ Local HTML reports')}`,
    value: 'local' as const,
    short: 'Local reports'
  },
  {
    name: `☁️ ${colors.accent('Set up - Cloud Dashboard')}
    ${colors.success('└─ ✓ Uses 0 tokens (our infrastructure)')}
    ${colors.success('└─ 📧 Daily standup emails')}
    ${colors.success('└─ 📊 Weekly summary every Monday')}
    ${colors.success('└─ 🎯 Interactive dashboard and detailed coaching plans')}`,
    value: 'cloud' as const,
    short: 'Cloud mode'
  },
  {
    name: `💬 ${colors.primary('Install CC Co-Pilot Statline')}
    ${colors.muted('└─ 📊 Analyzes your prompts')}
    ${colors.muted('└─ 💡 Shows feedback in Claude Code')}
    ${colors.muted('└─ 🧠 Personalized Guidance')}
    ${colors.muted('└─ 🤝 Keeps You & Claude focused')}`,
    value: 'statusline' as const,
    short: 'Status line'
  },
  {
    name: `${colors.primary('Help')}
    ${colors.muted('└─ Documentation and support')}`,
    value: 'help' as const,
    short: 'Help'
  },
  {
    name: `${colors.muted('Exit')}`,
    value: 'exit' as const,
    short: 'Exit'
  }
];
```

### 2. Add Standup Handler to Main Menu
**File**: `src/lib/ui/main-menu.ts`
**Lines**: ~63-125 (in showMainMenu function)

#### Add Standup Case
The standup case needs to be added to the switch statement in `showFirstTimeWelcome()` function:

```typescript
// In showMainMenu function, around line 63-90
case 'standup': {
  // Run standup command directly
  const { standup } = await import('../../commands/standup');
  await standup();

  // After standup completes, offer cloud setup if not authenticated
  const { isAuthenticated } = await import('../auth/token');
  if (!await isAuthenticated()) {
    console.log(); // Add spacing
    const { setupCloud } = await inquirer.prompt([{
      type: 'confirm',
      name: 'setupCloud',
      message: 'Enable cloud for daily email summaries?',
      default: true
    }]);

    if (setupCloud) {
      showSetupMessage('cloud');
      const { guidedCloudSetup } = await import('./cloud-setup-wizard');
      await guidedCloudSetup();
    }
  }
  break;
}
```

### 3. Update Main Menu for Authenticated Users
**File**: `src/lib/ui/main-menu.ts`
**Lines**: ~180-200 (menu items generation)

#### Simplified Cloud User Menu
Replace complex menu structure with simplified version:

```typescript
// For authenticated users (check state.hasAuth)
if (state.hasAuth) {
  const menuItems = [
    { label: '📋 Today\'s standup', action: 'standup' },
    { separator: true },
    { label: '🌐 Open dashboard', action: 'dashboard' },
    { label: '🔄 Sync sessions manually', action: 'manual-sync' },
    { label: '⚙️ Configure auto-sync (Claude Code hooks)', action: 'manage-hooks' },
    { separator: true },
    { label: '💬 Install CC Co-Pilot (enhance your prompts)', action: 'status-line' },
    { label: '📊 Generate local report', action: 'report' },
  ];

  // Add sub-agents management if installed
  if (state.agentCount > 0) {
    menuItems.push({ label: '🤖 Manage sub-agents', action: 'install-agents' });
  }

  menuItems.push(
    { separator: true },
    { label: '🚪 Logout', action: 'logout' },
    { label: '❌ Exit', action: 'exit' }
  );
}
```

### 4. Update Standup Command Output
**File**: `src/commands/standup.ts`
**Lines**: ~375-378

#### Current Cloud Upsell
```typescript
// Already implemented correctly:
console.log(chalk.yellow('\n💡 Tip: Stop wasting tokens and time!'));
console.log(chalk.cyan('   Switch to Cloud Mode for automated daily summaries!'));
```

**No changes needed** - the upsell already exists!

### 5. Local Reports with Sub-Agents Management
**File**: `src/lib/ui/local-report-generator.ts`

#### Add Management Options
When generating local report, check for sub-agents and provide management:

```typescript
export async function generateLocalReportInteractive(): Promise<void> {
  // Check if sub-agents installed
  const { checkInstalledSubAgents } = await import('../sub-agents/manager');
  const subAgentStatus = await checkInstalledSubAgents();

  if (subAgentStatus.missing.length > 0) {
    // Show installation prompt
    console.log('📊 Generate Local Report\n');
    console.log('This feature requires vibe-log sub-agents to be installed.');
    console.log('Sub-agents are local AI components that analyze your sessions.\n');
    console.log('Current status: Not installed\n');
    console.log('This is a one-time installation (~2 minutes).\n');

    const { install } = await inquirer.prompt([{
      type: 'confirm',
      name: 'install',
      message: 'Install sub-agents and continue?',
      default: true
    }]);

    if (install) {
      const { installSubAgentsInteractive } = await import('./sub-agents-installer');
      await installSubAgentsInteractive();
    }
  } else {
    // Show report options with management
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Select an option:',
      choices: [
        'Generate weekly summary',
        'Generate daily report',
        'Generate custom range',
        new inquirer.Separator('───────────────────'),
        'Manage sub-agents',
        '← Back to main menu'
      ]
    }]);

    // Handle selection
    switch(action) {
      case 'Manage sub-agents':
        await showSubAgentsManagement();
        break;
      // ... handle other cases
    }
  }
}

async function showSubAgentsManagement(): Promise<void> {
  console.log('🤖 Sub-Agents Management');
  console.log('Current status: ✓ Installed\n');

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      'Update sub-agents',
      'Reinstall sub-agents',
      'Uninstall sub-agents',
      '← Back'
    ]
  }]);

  // Handle management actions
  const { updateSubAgents, reinstallSubAgents, uninstallSubAgents } =
    await import('../sub-agents/manager');

  switch(action) {
    case 'Update sub-agents':
      await updateSubAgents();
      break;
    case 'Reinstall sub-agents':
      await reinstallSubAgents();
      break;
    case 'Uninstall sub-agents':
      await uninstallSubAgents();
      break;
  }
}
```

## Testing Checklist

- [ ] First-time user sees standup as first option
- [ ] Standup runs without authentication
- [ ] Cloud upsell appears after standup completion
- [ ] Cloud setup wizard works unchanged
- [ ] Authenticated users see simplified menu
- [ ] Sub-agents install when needed for reports
- [ ] Sub-agents management accessible after installation
- [ ] Status line option remains accessible
- [ ] Logout functionality works correctly

## Migration Notes

### For Existing Users
- No breaking changes
- Existing authenticated users see new simplified menu
- Sub-agents remain installed if already present

### For New Users
- Standup is the default entry point
- Cloud benefits emphasized through email features
- Progressive disclosure of complex features