import { colors } from './styles';

/**
 * Display the help content for vibe-log
 * Shared between main menu and first-time welcome
 */
export function showHelpContent(): void {
  console.log('');
  console.log(colors.primary('📊 Vibe-Log - Measure, Learn & Improve Your AI Coding'));
  console.log('');
  console.log(colors.subdued('Understand how you work with Claude Code. Track patterns, measure'));
  console.log(colors.subdued('productivity, and discover what makes your AI coding sessions effective.'));
  console.log('');
  console.log(colors.accent('🎯 Why Track Your AI Coding?'));
  console.log('  • ' + colors.highlight('Measure Patterns') + ' - See when and how you\'re most productive');
  console.log('  • ' + colors.highlight('Learn From Data') + ' - Understand what makes sessions successful');
  console.log('  • ' + colors.highlight('Improve Workflow') + ' - Identify bottlenecks and optimize your process');
  console.log('  • ' + colors.highlight('Track Progress') + ' - Monitor project velocity and completion rates');
  console.log('  • ' + colors.highlight('Privacy First') + ' - Your code never leaves your machine, only metadata tracked');
  console.log('');
  console.log(colors.accent('🔄 Choose How to Analyze:'));
  console.log('  • ' + colors.success('Cloud Mode (Recommended)') + ' - Automatic tracking & insights');
  console.log('    └─ Dashboard with trends, patterns, and productivity metrics');
  console.log('    └─ Zero setup, GitHub auth, no tokens needed');
  console.log('  • ' + colors.info('Local Mode') + ' - Self-hosted analysis on your machine');
  console.log('    └─ Generate AI reports using Claude Code sub-agents');
  console.log('    └─ 100% offline, uses your Claude tokens');
  console.log('');
  console.log(colors.accent('⚡ Getting Started:'));
  console.log('  1. Run ' + colors.primary('npx vibe-log-cli') + ' to open this menu');
  console.log('  2. Choose your analysis mode (Cloud or Local)');
  console.log('  3. Start coding with Claude - vibe-log tracks automatically');
  console.log('  4. Review insights to improve your AI coding workflow');
  console.log('');
  console.log(colors.accent('📚 Learn More:'));
  console.log('  • Documentation: ' + colors.primary('https://vibe-log.dev'));
  console.log('  • View Dashboard: ' + colors.primary('https://app.vibe-log.dev'));
  console.log('  • GitHub: ' + colors.primary('https://github.com/vibe-log'));
  console.log('');
}