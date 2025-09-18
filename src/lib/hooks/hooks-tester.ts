import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../../utils/logger';
import { getCliPath } from '../config';
import { getHooksStatus } from './hooks-controller';
import { recordHookExecution } from './hooks-stats';

const execAsync = promisify(exec);

/**
 * Test result for a single hook
 */
export interface HookTestResult {
  hookType: 'sessionstart' | 'precompact' | 'sessionend';
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
  steps: TestStep[];
}

/**
 * Individual test step
 */
export interface TestStep {
  name: string;
  success: boolean;
  message?: string;
  duration?: number;
}

/**
 * Test a specific hook
 */
export async function testHook(
  hookType: 'sessionstart' | 'precompact' | 'sessionend',
  options: { verbose?: boolean; record?: boolean } = {}
): Promise<HookTestResult> {
  const startTime = Date.now();
  const steps: TestStep[] = [];
  const spinner = options.verbose ? null : ora(`Testing ${hookType} hook...`).start();
  
  try {
    // Step 1: Check if hook is installed
    const stepStart = Date.now();
    const status = await getHooksStatus();
    const hookStatus = hookType === 'sessionstart' ? status.sessionStartHook :
                       hookType === 'precompact' ? status.preCompactHook :
                       status.sessionEndHook;
    
    if (!hookStatus.installed) {
      steps.push({
        name: 'Check installation',
        success: false,
        message: 'Hook not installed',
        duration: Date.now() - stepStart
      });
      
      if (spinner) spinner.fail(`${hookType} hook not installed`);
      
      return {
        hookType,
        success: false,
        duration: Date.now() - startTime,
        error: 'Hook not installed',
        steps
      };
    }
    
    steps.push({
      name: 'Check installation',
      success: true,
      message: `Hook found (v${hookStatus.version})`,
      duration: Date.now() - stepStart
    });
    
    // Step 2: Validate CLI path
    const cliStepStart = Date.now();
    const cliPath = getCliPath();
    
    try {
      await execAsync(`${cliPath} --version`, { timeout: 5000 });
      steps.push({
        name: 'Validate CLI path',
        success: true,
        message: `CLI found at ${cliPath}`,
        duration: Date.now() - cliStepStart
      });
    } catch (error) {
      steps.push({
        name: 'Validate CLI path',
        success: false,
        message: `CLI not found at ${cliPath}`,
        duration: Date.now() - cliStepStart
      });
      
      if (spinner) spinner.fail('CLI path validation failed');
      
      return {
        hookType,
        success: false,
        duration: Date.now() - startTime,
        error: 'CLI path not valid',
        steps
      };
    }
    
    // Step 3: Test hook execution
    const execStepStart = Date.now();
    const testCommand = `${cliPath} send --dry --silent --hook-trigger=${hookType} --test`;
    
    if (options.verbose) {
      console.log(chalk.gray(`Executing: ${testCommand}`));
    }
    
    try {
      const { stdout, stderr } = await execAsync(testCommand, {
        timeout: 30000,
        env: { ...process.env }
      });
      
      steps.push({
        name: 'Execute hook command',
        success: true,
        message: 'Command executed successfully',
        duration: Date.now() - execStepStart
      });
      
      // Step 4: Validate output
      const validateStepStart = Date.now();
      const output = stdout || stderr || '';
      
      // Check for common success indicators
      const hasSuccess = output.toLowerCase().includes('success') ||
                        output.toLowerCase().includes('complete') ||
                        output.toLowerCase().includes('dry run');
      
      if (hasSuccess || output.length > 0) {
        steps.push({
          name: 'Validate output',
          success: true,
          message: 'Output validated',
          duration: Date.now() - validateStepStart
        });
      } else {
        steps.push({
          name: 'Validate output',
          success: false,
          message: 'No output received',
          duration: Date.now() - validateStepStart
        });
      }
      
      const duration = Date.now() - startTime;
      
      if (spinner) spinner.succeed(`${hookType} hook test completed (${(duration / 1000).toFixed(1)}s)`);
      
      // Record execution if requested
      if (options.record) {
        await recordHookExecution({
          hookType,
          timestamp: new Date(),
          success: true,
          duration,
          project: 'test'
        });
      }
      
      return {
        hookType,
        success: true,
        duration,
        output: options.verbose ? output : undefined,
        steps
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      steps.push({
        name: 'Execute hook command',
        success: false,
        message: errorMessage,
        duration: Date.now() - execStepStart
      });
      
      if (spinner) spinner.fail(`${hookType} hook test failed`);
      
      // Record failure if requested
      if (options.record) {
        await recordHookExecution({
          hookType,
          timestamp: new Date(),
          success: false,
          duration: Date.now() - startTime,
          project: 'test',
          error: errorMessage
        });
      }
      
      return {
        hookType,
        success: false,
        duration: Date.now() - startTime,
        error: errorMessage,
        steps
      };
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (spinner) spinner.fail(`${hookType} hook test failed`);
    
    return {
      hookType,
      success: false,
      duration: Date.now() - startTime,
      error: errorMessage,
      steps
    };
  }
}

/**
 * Test all installed hooks
 */
export async function testAllHooks(
  options: { verbose?: boolean; record?: boolean } = {}
): Promise<HookTestResult[]> {
  const results: HookTestResult[] = [];
  
  // Get hook status
  const status = await getHooksStatus();
  
  // Test SessionStart hook if installed
  if (status.sessionStartHook.installed) {
    if (options.verbose) {
      console.log(chalk.cyan('\nTesting SessionStart Hook...'));
    }
    const result = await testHook('sessionstart', options);
    results.push(result);
    
    if (options.verbose) {
      displayTestResult(result);
    }
  }
  
  // Test PreCompact hook if installed
  if (status.preCompactHook.installed) {
    if (options.verbose) {
      console.log(chalk.cyan('\nTesting PreCompact Hook...'));
    }
    const result = await testHook('precompact', options);
    results.push(result);

    if (options.verbose) {
      displayTestResult(result);
    }
  }

  // Test SessionEnd hook if installed
  if (status.sessionEndHook.installed) {
    if (options.verbose) {
      console.log(chalk.cyan('\nTesting SessionEnd Hook...'));
    }
    const result = await testHook('sessionend', options);
    results.push(result);

    if (options.verbose) {
      displayTestResult(result);
    }
  }
  
  if (results.length === 0) {
    console.log(chalk.yellow('No hooks installed to test'));
  }
  
  return results;
}

/**
 * Display a test result with formatting
 */
export function displayTestResult(result: HookTestResult): void {
  const hookName = result.hookType === 'sessionstart' ? 'SessionStart Hook' :
                   result.hookType === 'precompact' ? 'PreCompact Hook' :
                   'SessionEnd Hook';
  
  console.log('');
  if (result.success) {
    console.log(chalk.green(`✅ ${hookName} Test Passed`));
  } else {
    console.log(chalk.red(`❌ ${hookName} Test Failed`));
  }
  
  // Display steps
  result.steps.forEach(step => {
    const icon = step.success ? '✓' : '✗';
    const color = step.success ? chalk.green : chalk.red;
    const duration = step.duration ? ` (${step.duration}ms)` : '';
    
    console.log(color(`  ${icon} ${step.name}${duration}`));
    if (step.message) {
      console.log(chalk.gray(`    └─ ${step.message}`));
    }
  });
  
  // Display total duration
  console.log(chalk.dim(`  Total time: ${(result.duration / 1000).toFixed(1)}s`));
  
  // Display error if any
  if (result.error) {
    console.log(chalk.red(`  Error: ${result.error}`));
  }
  
  // Display output if verbose
  if (result.output) {
    console.log(chalk.dim('\n  Output:'));
    result.output.split('\n').forEach(line => {
      if (line.trim()) {
        console.log(chalk.dim(`    ${line}`));
      }
    });
  }
}

/**
 * Simulate a hook trigger for testing
 */
export async function simulateHookTrigger(
  hookType: 'sessionstart' | 'precompact' | 'sessionend',
  projectPath?: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const cliPath = getCliPath();
    const command = `${cliPath} send --dry --silent --hook-trigger=${hookType}${projectPath ? ` --project="${projectPath}"` : ''}`;
    
    logger.debug(`Simulating ${hookType} hook trigger: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      env: { ...process.env }
    });
    
    return {
      success: true,
      output: stdout || stderr || 'Command completed successfully'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Hook simulation failed: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}