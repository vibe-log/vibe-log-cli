import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CursorHooksConfig {
  version: number;
  hooks: {
    [hookName: string]: Array<{
      command: string;
    }>;
  };
}

export class CursorHookInstaller {
  private static getHooksPath(): string {
    return path.join(os.homedir(), '.cursor', 'hooks.json');
  }

  /**
   * Initialize hooks.json file if it doesn't exist
   * Creates an empty hooks configuration ready for use
   */
  static initializeHooksFile(): void {
    const hooksPath = this.getHooksPath();

    // Only create if doesn't exist
    if (!fs.existsSync(hooksPath)) {
      const dir = path.dirname(hooksPath);

      // Ensure .cursor directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create empty hooks file
      const emptyConfig: CursorHooksConfig = {
        version: 1,
        hooks: {}
      };

      fs.writeFileSync(hooksPath, JSON.stringify(emptyConfig, null, 2));
    }
  }

  /**
   * Install afterAgentResponse hook for push-up challenge
   */
  static async installPushUpHook(): Promise<void> {
    const hooksPath = this.getHooksPath();

    // Read existing hooks or create new
    let config: CursorHooksConfig;
    if (fs.existsSync(hooksPath)) {
      config = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
    } else {
      config = { version: 1, hooks: {} };
    }

    // Initialize afterAgentResponse array if it doesn't exist
    if (!config.hooks.afterAgentResponse) {
      config.hooks.afterAgentResponse = [];
    }

    // Check if our hook is already installed
    const pushupCommand = 'npx vibe-log-cli cursor-hook-pushup';
    const alreadyInstalled = config.hooks.afterAgentResponse.some(
      (hook) => hook.command === pushupCommand
    );

    // Add our hook only if not already present
    if (!alreadyInstalled) {
      config.hooks.afterAgentResponse.push({
        command: pushupCommand,
      });
    }

    // Ensure directory exists
    const dir = path.dirname(hooksPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write hooks file
    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
  }

  /**
   * Install stop hook for smart uploads
   */
  static async installSmartUploadHook(): Promise<void> {
    const hooksPath = this.getHooksPath();

    let config: CursorHooksConfig;
    if (fs.existsSync(hooksPath)) {
      config = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
    } else {
      config = { version: 1, hooks: {} };
    }

    // Initialize stop array if it doesn't exist
    if (!config.hooks.stop) {
      config.hooks.stop = [];
    }

    // Check if our hook is already installed
    const uploadCommand = 'npx vibe-log-cli cursor-hook-upload --silent';
    const alreadyInstalled = config.hooks.stop.some(
      (hook) => hook.command === uploadCommand
    );

    // Add our hook only if not already present
    if (!alreadyInstalled) {
      config.hooks.stop.push({
        command: uploadCommand,
      });
    }

    const dir = path.dirname(hooksPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
  }

  /**
   * Install both hooks
   */
  static async installAllHooks(): Promise<void> {
    const hooksPath = this.getHooksPath();

    let config: CursorHooksConfig;
    if (fs.existsSync(hooksPath)) {
      config = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
    } else {
      config = { version: 1, hooks: {} };
    }

    // Initialize arrays if they don't exist
    if (!config.hooks.afterAgentResponse) {
      config.hooks.afterAgentResponse = [];
    }
    if (!config.hooks.stop) {
      config.hooks.stop = [];
    }

    // Add push-up hook if not already present
    const pushupCommand = 'npx vibe-log-cli cursor-hook-pushup';
    if (!config.hooks.afterAgentResponse.some((hook) => hook.command === pushupCommand)) {
      config.hooks.afterAgentResponse.push({
        command: pushupCommand,
      });
    }

    // Add upload hook if not already present
    const uploadCommand = 'npx vibe-log-cli cursor-hook-upload --silent';
    if (!config.hooks.stop.some((hook) => hook.command === uploadCommand)) {
      config.hooks.stop.push({
        command: uploadCommand,
      });
    }

    const dir = path.dirname(hooksPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
  }

  /**
   * Uninstall specific or all hooks
   */
  static async uninstallHooks(
    hookType: 'pushup' | 'upload' | 'all' = 'all'
  ): Promise<void> {
    const hooksPath = this.getHooksPath();

    if (!fs.existsSync(hooksPath)) {
      return;
    }

    const config: CursorHooksConfig = JSON.parse(
      fs.readFileSync(hooksPath, 'utf-8')
    );

    // Remove only vibe-log hooks from the arrays, not the entire arrays
    if (hookType === 'pushup' || hookType === 'all') {
      if (config.hooks.afterAgentResponse) {
        config.hooks.afterAgentResponse = config.hooks.afterAgentResponse.filter(
          (hook) => !hook.command.includes('cursor-hook-pushup')
        );
        // Remove the array if it's now empty
        if (config.hooks.afterAgentResponse.length === 0) {
          delete config.hooks.afterAgentResponse;
        }
      }
    }

    if (hookType === 'upload' || hookType === 'all') {
      if (config.hooks.stop) {
        config.hooks.stop = config.hooks.stop.filter(
          (hook) => !hook.command.includes('cursor-hook-upload')
        );
        // Remove the array if it's now empty
        if (config.hooks.stop.length === 0) {
          delete config.hooks.stop;
        }
      }
    }

    // Always write back the file, even if empty
    // This preserves the hooks.json file structure and allows other tools to use it
    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
  }

  /**
   * Check what's installed
   */
  static getInstalledHooks(): {
    pushup: boolean;
    upload: boolean;
  } {
    const hooksPath = this.getHooksPath();

    if (!fs.existsSync(hooksPath)) {
      return { pushup: false, upload: false };
    }

    try {
      const config: CursorHooksConfig = JSON.parse(
        fs.readFileSync(hooksPath, 'utf-8')
      );

      return {
        pushup:
          config.hooks.afterAgentResponse?.some((h) =>
            h.command.includes('cursor-hook-pushup')
          ) ?? false,
        upload:
          config.hooks.stop?.some((h) => h.command.includes('cursor-hook-upload')) ??
          false,
      };
    } catch {
      return { pushup: false, upload: false };
    }
  }
}
