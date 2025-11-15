import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
    coverage: {
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: [
        // Default exclusions
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',

        // CLI entry points (hard to unit test)
        'bin/**',
        'src/index.ts',

        // Build/dev scripts and tooling
        'scripts/**',
        '.eslintrc.js',
        'test/**',

        // Interactive UI components (require E2E testing)
        'src/lib/ui/main-menu.ts',
        'src/lib/ui/menu-builder.ts',
        'src/lib/ui/hooks-menu.ts',
        'src/lib/ui/status-line-menu.ts',
        'src/lib/ui/cloud-setup-wizard.ts',
        'src/lib/ui/first-time-welcome.ts',
        'src/lib/ui/interactive-*.ts',
        'src/lib/ui/*-menu.ts',
        'src/lib/ui/*-selector.ts',
        'src/lib/ui/*-creator.ts',
        'src/lib/ui/*-tester.ts',
        'src/lib/ui/*-installer.ts',
        'src/lib/ui/hooks-status.ts',
        'src/lib/ui/status-sections.ts',
        'src/lib/ui/local-report-generator.ts',
        'src/lib/ui/privacy-notice.ts',
        'src/lib/ui/help-content.ts',
        'src/lib/ui/*-receipt.ts',

        // Interactive command handlers
        'src/commands/analyze-prompt.ts',
        'src/commands/auth.ts',
        'src/commands/config.ts',
        'src/commands/detect-validation.ts',
        'src/commands/hooks-log.ts',
        'src/commands/hooks-manage.ts',
        'src/commands/install-auto-sync.ts',
        'src/commands/install-hooks.ts',
        'src/commands/logout.ts',
        'src/commands/privacy.ts',
        'src/commands/pushup-challenge.ts',
        'src/commands/standup*.ts',
        'src/commands/statusline*.ts',
        'src/commands/verify-hooks.ts',
        'src/commands/test-personality.ts',
        'src/commands/refresh-*.ts',
        'src/commands/pushup-*.ts',

        // Static content/templates
        'src/lib/ui/*-tips.ts',
        'src/lib/promotional-tips.ts',

        // Report generation (complex integration)
        'src/lib/report-executor.ts',
        'src/lib/report-generator.ts',
        'src/lib/reports/**',
        'src/lib/standup-*.ts',

        // Hook testing/stats (meta features)
        'src/lib/hooks/hooks-stats.ts',
        'src/lib/hooks/hooks-tester.ts',
        'src/lib/hooks/hooks-controller-unified.ts',

        // Specialized features (low priority for unit testing)
        'src/lib/personality-*.ts',
        'src/lib/prompt-analyzer.ts',
        'src/lib/push-up-*.ts',
        'src/lib/ccusage-*.ts',

        // Utilities that are hard to unit test
        'src/utils/claude-executor.ts',
        'src/utils/spawn.ts',
        'src/lib/utils/file-utils.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});