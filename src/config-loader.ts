import * as fs from 'fs';
import * as path from 'path';
import { ProjectConfig, TestConfig } from './types';

const CONFIG_FILES = ['.testgenrc.json', '.testgenrc.js', 'testgen.config.json'];

export class ConfigError extends Error {
  constructor(message: string, public configPath?: string) {
    super(message);
    this.name = 'ConfigError';
    Error.captureStackTrace(this, ConfigError);
  }
}

export function loadConfig(projectRoot?: string): ProjectConfig {
  try {
    const root = projectRoot || findProjectRoot();
    
    if (!root || typeof root !== 'string') {
      return {};
    }

    for (const configFile of CONFIG_FILES) {
      const configPath = path.join(root, configFile);
      
      if (!fs.existsSync(configPath)) {
        continue;
      }

      try {
        if (configFile.endsWith('.json')) {
          const content = fs.readFileSync(configPath, 'utf-8');
          if (!content.trim()) {
            continue; // Skip empty files
          }
          const parsed = JSON.parse(content);
          if (typeof parsed !== 'object' || parsed === null) {
            throw new ConfigError(
              `Config file must export an object: ${configPath}`,
              configPath
            );
          }
          return parsed;
        } else if (configFile.endsWith('.js')) {
          // For .js config files
          try {
            delete require.cache[require.resolve(configPath)];
            const config = require(configPath);
            if (typeof config !== 'object' || config === null) {
              throw new ConfigError(
                `Config file must export an object: ${configPath}`,
                configPath
              );
            }
            return config.default || config;
          } catch (requireError: any) {
            throw new ConfigError(
              `Failed to require config file: ${requireError.message}`,
              configPath
            );
          }
        }
      } catch (error: any) {
        if (error instanceof ConfigError) {
          // Re-throw ConfigError
          throw error;
        }
        // For other errors, log warning and continue
        if (process.env.DEBUG) {
          console.warn(`⚠️  Failed to load config from ${configPath}:`, error.message);
        }
      }
    }
  } catch (error: any) {
    // If it's a ConfigError, re-throw it
    if (error instanceof ConfigError) {
      throw error;
    }
    // For other errors, return empty config
    if (process.env.DEBUG) {
      console.warn('⚠️  Error finding project root:', error.message);
    }
  }
  
  return {};
}

export function mergeConfigs(
  projectConfig: ProjectConfig,
  cliConfig: Partial<TestConfig>
): TestConfig {
  // Validate inputs
  if (!projectConfig) {
    projectConfig = {};
  }
  if (!cliConfig) {
    cliConfig = {};
  }

  // Validate framework
  const validFrameworks = ['jest', 'vitest', 'mocha'];
  const framework = cliConfig.framework || projectConfig.framework || 'jest';
  if (!validFrameworks.includes(framework)) {
    throw new ConfigError(
      `Invalid framework: ${framework}. Valid: ${validFrameworks.join(', ')}`
    );
  }

  // Validate style
  const validStyles = ['basic', 'strict', 'bdd', 'smart'];
  const style = cliConfig.style || projectConfig.style || 'basic';
  if (!validStyles.includes(style)) {
    throw new ConfigError(
      `Invalid style: ${style}. Valid: ${validStyles.join(', ')}`
    );
  }

  return {
    framework: framework as 'jest' | 'vitest' | 'mocha',
    style: style as 'basic' | 'strict' | 'bdd' | 'smart',
    includeComments: cliConfig.includeComments ?? projectConfig.includeComments ?? true,
    generateMocks: cliConfig.generateMocks ?? projectConfig.generateMocks ?? false,
    testEach: cliConfig.testEach ?? projectConfig.testEach ?? false,
    outputPath: cliConfig.outputPath,
    ignorePatterns: cliConfig.ignorePatterns || projectConfig.ignorePatterns || [],
  };
}

function findProjectRoot(): string {
  try {
    let currentDir = process.cwd();
    if (!currentDir) {
      return process.cwd();
    }

    const root = path.parse(currentDir).root;
    
    while (currentDir !== root) {
      try {
        const packageJson = path.join(currentDir, 'package.json');
        if (fs.existsSync(packageJson)) {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // Prevent infinite loop
      }
      currentDir = parentDir;
    }
  } catch (error: any) {
    // Fallback to current working directory
    if (process.env.DEBUG) {
      console.warn('Error finding project root:', error.message);
    }
  }
  
  return process.cwd();
}
