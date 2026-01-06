import * as fs from 'fs';
import * as path from 'path';
import { ProjectConfig, TestConfig } from './types';

const CONFIG_FILES = ['.testgenrc.json', '.testgenrc.js', 'testgen.config.json', 'testgen.config.js'];

export class ConfigError extends Error {
  constructor(message: string, public configPath?: string) {
    super(message);
    this.name = 'ConfigError';
    Error.captureStackTrace(this, ConfigError);
  }
}

export async function loadConfig(projectRoot?: string): Promise<ProjectConfig> {
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
          
          let parsed;
          try {
            parsed = JSON.parse(content);
          } catch (parseError: any) {
            throw new ConfigError(
              `Invalid JSON in config file: ${parseError.message}`,
              configPath
            );
          }
          
          if (typeof parsed !== 'object' || parsed === null) {
            throw new ConfigError(
              `Config file must export an object: ${configPath}`,
              configPath
            );
          }
          
          return validateConfig(parsed, configPath);
        } else if (configFile.endsWith('.js')) {
          // For .js config files, use dynamic import instead of require
          try {
            // Add timestamp to bust cache
            const importPath = `${configPath}?t=${Date.now()}`;
            const module = await import(importPath);
            const config = module.default || module;
            
            if (typeof config !== 'object' || config === null) {
              throw new ConfigError(
                `Config file must export an object: ${configPath}`,
                configPath
              );
            }
            
            return validateConfig(config, configPath);
          } catch (importError: any) {
            // Fallback to require for CommonJS modules
            try {
              // Clear require cache
              const resolvedPath = require.resolve(configPath);
              delete require.cache[resolvedPath];
              
              const config = require(configPath);
              const actualConfig = config.default || config;
              
              if (typeof actualConfig !== 'object' || actualConfig === null) {
                throw new ConfigError(
                  `Config file must export an object: ${configPath}`,
                  configPath
                );
              }
              
              return validateConfig(actualConfig, configPath);
            } catch (requireError: any) {
              throw new ConfigError(
                `Failed to load config file: ${requireError.message}`,
                configPath
              );
            }
          }
        }
      } catch (error: any) {
        if (error instanceof ConfigError) {
          throw error;
        }
        
        if (process.env.DEBUG) {
          console.warn(`⚠️  Failed to load config from ${configPath}:`, error.message);
        }
      }
    }
  } catch (error: any) {
    if (error instanceof ConfigError) {
      throw error;
    }
    
    if (process.env.DEBUG) {
      console.warn('⚠️  Error finding project root:', error.message);
    }
  }
  
  return {};
}

/**
 * Validate config object
 */
function validateConfig(config: any, configPath: string): ProjectConfig {
  const validFrameworks = ['jest', 'vitest', 'mocha'];
  const validStyles = ['basic', 'strict', 'bdd', 'smart'];
  
  if (config.framework && !validFrameworks.includes(config.framework)) {
    throw new ConfigError(
      `Invalid framework "${config.framework}" in config. Valid options: ${validFrameworks.join(', ')}`,
      configPath
    );
  }
  
  if (config.style && !validStyles.includes(config.style)) {
    throw new ConfigError(
      `Invalid style "${config.style}" in config. Valid options: ${validStyles.join(', ')}`,
      configPath
    );
  }
  
  if (config.includeComments !== undefined && typeof config.includeComments !== 'boolean') {
    throw new ConfigError(
      `includeComments must be a boolean, got ${typeof config.includeComments}`,
      configPath
    );
  }
  
  if (config.generateMocks !== undefined && typeof config.generateMocks !== 'boolean') {
    throw new ConfigError(
      `generateMocks must be a boolean, got ${typeof config.generateMocks}`,
      configPath
    );
  }
  
  if (config.ignorePatterns !== undefined && !Array.isArray(config.ignorePatterns)) {
    throw new ConfigError(
      `ignorePatterns must be an array, got ${typeof config.ignorePatterns}`,
      configPath
    );
  }
  
  return config as ProjectConfig;
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

  // Validate and get framework
  const validFrameworks = ['jest', 'vitest', 'mocha'] as const;
  const framework = cliConfig.framework || projectConfig.framework || 'jest';
  
  if (!isValidFramework(framework)) {
    throw new ConfigError(
      `Invalid framework: ${framework}. Valid options: ${validFrameworks.join(', ')}`
    );
  }

  // Validate and get style
  const validStyles = ['basic', 'strict', 'bdd', 'smart'] as const;
  const style = cliConfig.style || projectConfig.style || 'basic';
  
  if (!isValidStyle(style)) {
    throw new ConfigError(
      `Invalid style: ${style}. Valid options: ${validStyles.join(', ')}`
    );
  }

  return {
    framework,
    style,
    includeComments: cliConfig.includeComments ?? projectConfig.includeComments ?? true,
    generateMocks: cliConfig.generateMocks ?? projectConfig.generateMocks ?? false,
    testEach: cliConfig.testEach ?? projectConfig.testEach ?? false,
    outputPath: cliConfig.outputPath,
    ignorePatterns: cliConfig.ignorePatterns || projectConfig.ignorePatterns || [],
  };
}

/**
 * Type guard for framework
 */
function isValidFramework(value: string): value is 'jest' | 'vitest' | 'mocha' {
  return ['jest', 'vitest', 'mocha'].includes(value);
}

/**
 * Type guard for style
 */
function isValidStyle(value: string): value is 'basic' | 'strict' | 'bdd' | 'smart' {
  return ['basic', 'strict', 'bdd', 'smart'].includes(value);
}

/**
 * Find project root with safeguards against infinite loops
 */
function findProjectRoot(): string {
  const MAX_DEPTH = 50;
  const visited = new Set<string>();
  
  try {
    let currentDir = process.cwd();
    if (!currentDir) {
      return process.cwd();
    }

    const root = path.parse(currentDir).root;
    let depth = 0;
    
    while (currentDir !== root && depth < MAX_DEPTH) {
      // Check for circular symlinks
      const realPath = fs.realpathSync(currentDir);
      if (visited.has(realPath)) {
        if (process.env.DEBUG) {
          console.warn('⚠️  Circular symlink detected, stopping search');
        }
        break;
      }
      visited.add(realPath);
      
      try {
        const packageJson = path.join(currentDir, 'package.json');
        if (fs.existsSync(packageJson)) {
          return currentDir;
        }
      } catch (e) {
        // Continue searching
        if (process.env.DEBUG) {
          console.warn(`⚠️  Error checking ${currentDir}:`, e);
        }
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached root or stuck
        break;
      }
      
      currentDir = parentDir;
      depth++;
    }
    
    if (depth >= MAX_DEPTH) {
      console.warn('⚠️  Max depth reached while searching for project root');
    }
  } catch (error: any) {
    if (process.env.DEBUG) {
      console.warn('⚠️  Error finding project root:', error.message);
    }
  }
  
  return process.cwd();
}

/**
 * Get similar file names for better error messages
 */
export function getSimilarFiles(targetPath: string): string[] {
  try {
    const dir = path.dirname(targetPath);
    const baseName = path.basename(targetPath).toLowerCase();
    
    if (!fs.existsSync(dir)) {
      return [];
    }
    
    const files = fs.readdirSync(dir);
    const similar = files.filter(file => {
      const fileLower = file.toLowerCase();
      // Check for similar names (Levenshtein distance <= 3 or contains substring)
      return fileLower.includes(baseName.slice(0, -3)) || 
             baseName.includes(fileLower.slice(0, -3));
    });
    
    return similar.slice(0, 5); // Return max 5 suggestions
  } catch {
    return [];
  }
}