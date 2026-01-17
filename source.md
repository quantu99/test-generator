# C:\Users\DELL OS\Desktop\test-gen\src\cli.ts
#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { generateTest } from './generator';
import { generateTestWithFlow } from './smart-generator';
import { parseFile } from './parser';
import { TestConfig } from './types';
import { loadConfig, mergeConfigs } from './config-loader';
import { TypeResolver } from './type-resolver';

const program = new Command();

// Global cleanup handlers
let activeTypeResolvers: TypeResolver[] = [];

process.on('exit', () => {
  cleanupResources();
});

process.on('SIGINT', () => {
  cleanupResources();
  process.exit(130);
});

process.on('SIGTERM', () => {
  cleanupResources();
  process.exit(143);
});

function cleanupResources() {
  activeTypeResolvers.forEach(resolver => {
    try {
      if (!resolver.isDisposed()) {
        resolver.dispose();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  activeTypeResolvers = [];
}

program
  .name('test-gen')
  .description('Generate test skeletons & test flows for faster test coverage')
  .version('1.0.0');

program
  .command('generate')
  .alias('gen')
  .argument('<file>', 'Source file to generate tests for')
  .option('-f, --framework <framework>', 'Test framework (jest, vitest, mocha)', 'jest')
  .option('-s, --style <style>', 'Test style (basic, strict, bdd, smart)', 'basic')
  .option('-o, --out <path>', 'Output file path')
  .option('--no-comments', 'Disable test flow comments')
  .option('--dry-run', 'Preview without writing file')
  .option('--mocks', 'Auto-generate mocks for dependencies')
  .option('--test-each', 'Generate parameterized tests with test.each')
  .action(async (file, options) => {
    try {
      // Validate file path
      const filePath = path.resolve(file);
      
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
      }

      // Validate file extension
      const ext = path.extname(filePath).toLowerCase();
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        console.error(`❌ Unsupported file type: ${ext}`);
        console.error(`💡 Supported types: .ts, .tsx, .js, .jsx`);
        process.exit(1);
      }

      // Load config from file (now async)
      const projectConfig = await loadConfig();
      
      // Validate framework before merging
      const validFrameworks = ['jest', 'vitest', 'mocha'];
      if (options.framework && !validFrameworks.includes(options.framework)) {
        console.error(`❌ Invalid framework: ${options.framework}`);
        console.error(`💡 Valid options: ${validFrameworks.join(', ')}`);
        process.exit(1);
      }

      // Validate style before merging
      const validStyles = ['basic', 'strict', 'bdd', 'smart'];
      if (options.style && !validStyles.includes(options.style)) {
        console.error(`❌ Invalid style: ${options.style}`);
        console.error(`💡 Valid options: ${validStyles.join(', ')}`);
        process.exit(1);
      }
      
      // Merge with CLI options
      const config: TestConfig = mergeConfigs(projectConfig, {
        framework: options.framework as any,
        style: options.style as any,
        includeComments: options.comments,
        outputPath: options.out,
        generateMocks: options.mocks,
        testEach: options.testEach,
      });

      let testCode = '';
      
      console.log(`🔄 Generating tests...`);
      console.log(`   Framework: ${config.framework}`);
      console.log(`   Style: ${config.style}`);
      
      // Use smart generator for 'smart' style
      if (config.style === 'smart') {
        const sourceCode = fs.readFileSync(filePath, 'utf-8');
        const functions = parseFile(filePath);
        
        if (functions.length === 0) {
          console.error(`❌ No functions found in ${filePath}`);
          console.error(`💡 Make sure the file contains exported functions or classes`);
          process.exit(1);
        }
        
        console.log(`   Found ${functions.length} function(s)`);
        
        functions.forEach(func => {
          testCode += generateTestWithFlow(sourceCode, func, config);
        });
      } else {
        testCode = generateTest(filePath, config);
      }

      if (options.dryRun) {
        console.log('\n📄 Preview:\n');
        console.log(testCode);
        console.log('\n💡 Run without --dry-run to save the file');
        return;
      }

      const outputPath = options.out || getDefaultOutputPath(filePath);
      
      // Create directory if it doesn't exist
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, testCode);
      
      console.log('\n✅ Test file generated successfully!');
      console.log(`📁 Location: ${outputPath}`);
      console.log(`📏 Size: ${(testCode.length / 1024).toFixed(2)} KB`);
      
      if (config.generateMocks) {
        console.log(`🔧 Mocks: Enabled`);
      }
      
      console.log('\n💡 Next steps:');
      console.log(`   1. Review the generated test file`);
      console.log(`   2. Fill in the TODO sections with actual test logic`);
      console.log(`   3. Run tests: npm test ${path.basename(outputPath)}`);
      
    } catch (error: any) {
      console.error('\n❌ Error:', error.message || error);
      
      if (error.configPath) {
        console.error(`   Config file: ${error.configPath}`);
      }
      
      if (error.filePath) {
        console.error(`   File: ${error.filePath}`);
      }
      
      if (error.line && error.column) {
        console.error(`   Location: Line ${error.line}, Column ${error.column}`);
      }
      
      if (process.env.DEBUG && error.stack) {
        console.error('\n🐛 Stack trace:');
        console.error(error.stack);
      } else {
        console.error('\n💡 Run with DEBUG=1 for more details');
      }
      
      process.exit(1);
    } finally {
      // Cleanup resources
      cleanupResources();
    }
  });

program
  .command('parse')
  .argument('<file>', 'Source file to parse')
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed information')
  .description('Parse file and show function information')
  .action((file, options) => {
    try {
      const filePath = path.resolve(file);
      
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
      }

      console.log(`🔍 Parsing ${path.basename(filePath)}...\n`);
      
      const functions = parseFile(filePath);
      
      if (functions.length === 0) {
        console.log('⚠️  No functions found in this file');
        console.log('💡 Make sure the file contains:');
        console.log('   - Exported functions');
        console.log('   - Class methods');
        console.log('   - Arrow functions');
        return;
      }
      
      if (options.json) {
        console.log(JSON.stringify(functions, null, 2));
      } else {
        console.log(`📊 Found ${functions.length} function(s):\n`);
        
        functions.forEach((func, i) => {
          console.log(`${i + 1}. ${func.name}`);
          console.log(`   Type: ${func.kind}`);
          console.log(`   Exported: ${func.isExported ? '✓' : '✗'}`);
          
          if (func.isAsync) {
            console.log(`   Async: ✓`);
          }
          
          if (func.params.length > 0) {
            console.log(`   Parameters (${func.params.length}):`);
            func.params.forEach(p => {
              const optional = p.optional ? '?' : '';
              const defaultVal = p.defaultValue ? ` = ${p.defaultValue}` : '';
              const rest = p.isRest ? '...' : '';
              console.log(`      - ${rest}${p.name}${optional}: ${p.type.raw}${defaultVal}`);
            });
          }
          
          console.log(`   Returns: ${func.returnType.raw}`);
          
          if (func.className) {
            console.log(`   Class: ${func.className}`);
          }
          
          if (func.accessModifier) {
            console.log(`   Access: ${func.accessModifier}`);
          }
          
          if (func.isStatic) {
            console.log(`   Static: ✓`);
          }
          
          if (func.decorators && func.decorators.length > 0) {
            console.log(`   Decorators: ${func.decorators.join(', ')}`);
          }
          
          if (options.verbose && func.jsdoc) {
            console.log(`   JSDoc:\n${func.jsdoc.split('\n').map(l => '      ' + l).join('\n')}`);
          }
          
          console.log('');
        });
        
        // Summary statistics
        const exported = functions.filter(f => f.isExported).length;
        const async = functions.filter(f => f.isAsync).length;
        const withParams = functions.filter(f => f.params.length > 0).length;
        
        console.log('📈 Summary:');
        console.log(`   Exported: ${exported}/${functions.length}`);
        console.log(`   Async: ${async}/${functions.length}`);
        console.log(`   With parameters: ${withParams}/${functions.length}`);
      }
    } catch (error: any) {
      console.error('\n❌ Error:', error.message || error);
      
      if (error.filePath) {
        console.error(`   File: ${error.filePath}`);
      }
      
      if (error.line && error.column) {
        console.error(`   Location: Line ${error.line}, Column ${error.column}`);
      }
      
      if (process.env.DEBUG && error.stack) {
        console.error('\n🐛 Stack trace:');
        console.error(error.stack);
      }
      
      process.exit(1);
    } finally {
      cleanupResources();
    }
  });

program
  .command('init')
  .description('Initialize test-gen configuration file')
  .option('-f, --framework <framework>', 'Default framework', 'jest')
  .option('-s, --style <style>', 'Default style', 'basic')
  .action(async (options) => {
    try {
      const configPath = path.join(process.cwd(), '.testgenrc.json');
      
      if (fs.existsSync(configPath)) {
        console.error('❌ Config file already exists: .testgenrc.json');
        console.log('💡 Remove it first or edit it manually');
        process.exit(1);
      }
      
      const config = {
        framework: options.framework,
        style: options.style,
        includeComments: true,
        generateMocks: false,
        testEach: false,
        ignorePatterns: [
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/node_modules/**'
        ]
      };
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      console.log('✅ Configuration file created: .testgenrc.json');
      console.log('\n📝 Config:');
      console.log(JSON.stringify(config, null, 2));
      console.log('\n💡 You can now run: test-gen generate <file>');
      
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

function getDefaultOutputPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  return path.join(dir, `${baseName}.test${ext}`);
}

// Validation helper (used inline above)
function validateInput<T extends string>(
  value: T,
  validOptions: readonly T[],
  name: string
): asserts value is T {
  if (!validOptions.includes(value)) {
    throw new Error(
      `Invalid ${name}: ${value}. Valid options: ${validOptions.join(', ')}`
    );
  }
}

program.parse();

# C:\Users\DELL OS\Desktop\test-gen\src\config-loader.ts
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

# C:\Users\DELL OS\Desktop\test-gen\src\flow-analyzer.ts
import * as ts from 'typescript';

export interface FlowAnalysis {
  conditions: ConditionInfo[];
  loops: LoopInfo[];
  errorHandling: ErrorInfo[];
  externalCalls: CallInfo[];
  returnStatements: ReturnInfo[];
  complexity: number;
}

export interface ConditionInfo {
  type: 'if' | 'switch' | 'ternary';
  condition: string;
  consequence: string;
  alternative?: string;
  line: number;
}

export interface LoopInfo {
  type: 'for' | 'while' | 'forEach' | 'map' | 'filter' | 'reduce';
  variable?: string;
  line: number;
}

export interface ErrorInfo {
  type: 'throw' | 'try-catch' | 'reject';
  errorType?: string;
  errorMessage?: string;
  line: number;
}

export interface CallInfo {
  functionName: string;
  isAsync: boolean;
  line: number;
}

export interface ReturnInfo {
  type: string;
  condition?: string;
  line: number;
}

export function analyzeBusinessFlow(
  sourceCode: string,
  functionName: string
): FlowAnalysis {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const analysis: FlowAnalysis = {
    conditions: [],
    loops: [],
    errorHandling: [],
    externalCalls: [],
    returnStatements: [],
    complexity: 1,
  };

  function analyzeNode(node: ts.Node) {
    // Analyze if statements
    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText();
      const consequence = node.thenStatement.getText().substring(0, 50);
      const alternative = node.elseStatement?.getText().substring(0, 50);
      
      analysis.conditions.push({
        type: 'if',
        condition,
        consequence,
        alternative,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity++;
    }

    // Analyze switch statements
    if (ts.isSwitchStatement(node)) {
      analysis.conditions.push({
        type: 'switch',
        condition: node.expression.getText(),
        consequence: `${node.caseBlock.clauses.length} cases`,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity += node.caseBlock.clauses.length;
    }

    // Analyze ternary operators
    if (ts.isConditionalExpression(node)) {
      analysis.conditions.push({
        type: 'ternary',
        condition: node.condition.getText(),
        consequence: node.whenTrue.getText(),
        alternative: node.whenFalse.getText(),
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity++;
    }

    // Analyze loops
    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const variable = ts.isForOfStatement(node) || ts.isForInStatement(node)
        ? node.initializer.getText()
        : '';
      
      analysis.loops.push({
        type: 'for',
        variable,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity += 2;
    }

    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      analysis.loops.push({
        type: 'while',
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity += 2;
    }

    // Analyze array methods (forEach, map, filter, reduce)
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      
      if (ts.isPropertyAccessExpression(expression)) {
        const methodName = expression.name.getText();
        
        if (['forEach', 'map', 'filter', 'reduce', 'find', 'some', 'every'].includes(methodName)) {
          analysis.loops.push({
            type: methodName as any,
            variable: expression.expression.getText(),
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          });
          
          analysis.complexity++;
        }
      }
    }

    // Analyze throw statements
    if (ts.isThrowStatement(node)) {
      let errorMessage = '';
      let errorType = 'Error';
      
      if (ts.isNewExpression(node.expression)) {
        const errorClass = node.expression.expression.getText();
        errorType = errorClass;
        
        if (node.expression.arguments && node.expression.arguments.length > 0) {
          errorMessage = node.expression.arguments[0].getText().replace(/['"]/g, '');
        }
      }
      
      analysis.errorHandling.push({
        type: 'throw',
        errorType,
        errorMessage,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity++;
    }

    // Analyze try-catch blocks
    if (ts.isTryStatement(node)) {
      const errorType = node.catchClause?.variableDeclaration?.type?.getText() || 'any';
      
      analysis.errorHandling.push({
        type: 'try-catch',
        errorType,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      
      analysis.complexity++;
    }

    // Analyze function calls (potential external dependencies)
    if (ts.isCallExpression(node)) {
      const functionName = node.expression.getText();
      
      // Skip built-in methods
      const builtins = ['console', 'Math', 'Date', 'JSON', 'Object', 'Array'];
      const isBuiltin = builtins.some(b => functionName.startsWith(b));
      
      if (!isBuiltin && !functionName.includes('.length') && !functionName.includes('.toString')) {
        // Check if it's an await call (async)
        const parent = node.parent;
        const isAsync = parent && ts.isAwaitExpression(parent);
        
        analysis.externalCalls.push({
          functionName,
          isAsync: !!isAsync,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      }
    }

    // Analyze return statements
    if (ts.isReturnStatement(node)) {
      const returnValue = node.expression?.getText() || 'void';
      
      // Check if return is conditional
      let condition: string | undefined;
      let current: ts.Node | undefined = node.parent;
      
      while (current) {
        if (ts.isIfStatement(current)) {
          condition = current.expression.getText();
          break;
        }
        current = current.parent;
      }
      
      analysis.returnStatements.push({
        type: returnValue,
        condition,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }

    ts.forEachChild(node, analyzeNode);
  }

  // Find the target function and analyze it
  function findAndAnalyzeFunction(node: ts.Node) {
    const isTargetFunction = 
      (ts.isFunctionDeclaration(node) && node.name?.getText() === functionName) ||
      (ts.isVariableStatement(node) && 
        node.declarationList.declarations.some(d => d.name.getText() === functionName)) ||
      (ts.isMethodDeclaration(node) && node.name?.getText() === functionName);

    if (isTargetFunction) {
      analyzeNode(node);
      return;
    }

    ts.forEachChild(node, findAndAnalyzeFunction);
  }

  findAndAnalyzeFunction(sourceFile);

  return analysis;
}

# C:\Users\DELL OS\Desktop\test-gen\src\generator.ts
// src/generator.ts - Enhanced generator with fixes
import * as path from 'path';
import { parseFile } from './parser';
import { FunctionInfo, ParamInfo, TestConfig, TypeInfo } from './types';

export class GenerationError extends Error {
  constructor(
    message: string,
    public filePath?: string,
    public functionName?: string
  ) {
    super(message);
    this.name = 'GenerationError';
    Error.captureStackTrace(this, GenerationError);
  }
}

export function generateTest(
  filePath: string,
  config: TestConfig = {
    framework: 'jest',
    style: 'basic',
    includeComments: true,
  }
): string {
  // Validate inputs
  if (!filePath || typeof filePath !== 'string') {
    throw new GenerationError('Invalid file path provided');
  }

  if (!config) {
    throw new GenerationError('Config is required');
  }

  // Validate config
  const validFrameworks = ['jest', 'vitest', 'mocha'];
  if (!validFrameworks.includes(config.framework)) {
    throw new GenerationError(
      `Invalid framework: ${config.framework}. Valid: ${validFrameworks.join(', ')}`
    );
  }

  const validStyles = ['basic', 'strict', 'bdd', 'smart'];
  if (!validStyles.includes(config.style)) {
    throw new GenerationError(
      `Invalid style: ${config.style}. Valid: ${validStyles.join(', ')}`
    );
  }

  let functions;
  try {
    functions = parseFile(filePath);
  } catch (error: any) {
    if (error instanceof Error) {
      throw new GenerationError(
        `Failed to parse file: ${error.message}`,
        filePath
      );
    }
    throw error;
  }

  if (functions.length === 0) {
    throw new GenerationError(
      'No functions found in file. Make sure the file contains exported functions, methods, or classes.',
      filePath
    );
  }

  try {
    const fileName = path.basename(filePath, path.extname(filePath));
    const relativePath = `./${fileName}`;

    let testCode = generateImports(relativePath, functions, config.framework);
    
    functions.forEach((func) => {
      try {
        testCode += generateTestSuite(func, config);
      } catch (error: any) {
        throw new GenerationError(
          `Failed to generate test for function ${func.name}: ${error.message}`,
          filePath,
          func.name
        );
      }
    });

    return testCode;
  } catch (error: any) {
    if (error instanceof GenerationError) {
      throw error;
    }
    throw new GenerationError(
      `Unexpected error during generation: ${error.message}`,
      filePath
    );
  }
}

function generateImports(
  importPath: string,
  functions: FunctionInfo[],
  framework: string
): string {
  const exportedFuncs = functions
    .filter((f) => f.isExported && !f.isDefaultExport && f.kind !== 'method')
    .map((f) => f.name);

  const defaultExport = functions.find(f => f.isDefaultExport);
  const classes = [...new Set(functions.filter(f => f.className).map(f => f.className))];

  let imports = '';
  
  if (exportedFuncs.length > 0 || classes.length > 0) {
    const allImports = [...exportedFuncs, ...classes].filter(Boolean);
    if (allImports.length > 0) {
      imports += `import { ${allImports.join(', ')} } from '${importPath}';\n`;
    }
  }

  if (defaultExport) {
    imports += `import ${defaultExport.name} from '${importPath}';\n`;
  }

  if (framework === 'jest') {
    imports += `import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';\n`;
  } else if (framework === 'vitest') {
    imports += `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';\n`;
  }

  return imports + '\n';
}

function generateTestSuite(func: FunctionInfo, config: TestConfig): string {
  const { name, params, returnType, isAsync, className } = func;
  
  const suiteName = className ? `${className}.${name}` : name;
  let suite = `describe('${suiteName}', () => {\n`;
  
  if (config.includeComments) {
    suite += `  // Function type: ${func.kind}\n`;
    if (func.accessModifier) {
      suite += `  // Access: ${func.accessModifier}\n`;
    }
    suite += `  // Parameters: ${formatParamsComment(params)}\n`;
    suite += `  // Returns: ${returnType.raw}\n\n`;
  }

  suite += `  beforeEach(() => {\n`;
  suite += `    // Setup test dependencies and mocks\n`;
  suite += `  });\n\n`;

  suite += `  afterEach(() => {\n`;
  suite += `    // Clean up\n`;
  suite += `  });\n\n`;

  // Generate tests based on style
  switch (config.style) {
    case 'strict':
      suite += generateStrictTests(func, config);
      break;
    case 'bdd':
      suite += generateBDDTests(func, config);
      break;
    default:
      suite += generateBasicTests(func, config);
  }

  suite += `});\n\n`;
  return suite;
}

function formatParamsComment(params: ParamInfo[]): string {
  if (params.length === 0) return 'none';
  
  return params.map(p => {
    if (p.isDestructured && p.destructuredProps) {
      return `{ ${p.destructuredProps.join(', ')} }: ${p.type.raw}`;
    }
    if (p.isRest) {
      return `...${p.name}: ${p.type.raw}[]`;
    }
    const optional = p.optional ? '?' : '';
    const defaultVal = p.defaultValue ? ` = ${p.defaultValue}` : '';
    return `${p.name}${optional}: ${p.type.raw}${defaultVal}`;
  }).join(', ');
}

export function generateFunctionCall(func: FunctionInfo, args: string, awaitPrefix: string): string {
  if (func.kind === 'method' && func.className) {
    // For instance methods, create instance and call method
    const instanceName = func.className.charAt(0).toLowerCase() + func.className.slice(1);
    return `${awaitPrefix}new ${func.className}().${func.name}(${args})`;
  } else if (func.kind === 'static' && func.className) {
    // For static methods, call on class
    return `${awaitPrefix}${func.className}.${func.name}(${args})`;
  } else if (func.kind === 'getter' && func.className) {
    // For getters, access property
    return `new ${func.className}().${func.name}`;
  } else if (func.kind === 'setter' && func.className) {
    // For setters, assign property
    return `new ${func.className}().${func.name} = ${args}`;
  } else if (func.name.includes('.')) {
    // For object methods (obj.method)
    return `${awaitPrefix}${func.name}(${args})`;
  }
  // For regular functions, call directly
  return `${awaitPrefix}${func.name}(${args})`;
}

function generateBasicTests(func: FunctionInfo, config: TestConfig): string {
  const { isAsync } = func;
  const asyncPrefix = isAsync ? 'async ' : '';
  const awaitPrefix = isAsync ? 'await ' : '';
  
  let tests = '';
  
  // Test 1: Happy path
  tests += `  it('should execute successfully with valid inputs', ${asyncPrefix}() => {\n`;
  tests += generateTestBody(func, 'basic', awaitPrefix, config.includeComments);
  tests += `  });\n\n`;

  // Test 2: Edge cases
  tests += `  it('should handle edge cases', ${asyncPrefix}() => {\n`;
  tests += `    // TODO: Test boundary values, empty inputs, etc.\n`;
  tests += `  });\n\n`;

  // Test 3: Errors
  tests += `  it('should handle invalid inputs', ${asyncPrefix}() => {\n`;
  tests += `    // TODO: Test error cases\n`;
  tests += `  });\n\n`;

  return tests;
}

function generateStrictTests(func: FunctionInfo, config: TestConfig): string {
  const { isAsync, params, returnType } = func;
  const asyncPrefix = isAsync ? 'async ' : '';
  const awaitPrefix = isAsync ? 'await ' : '';
  
  let tests = '';
  
  tests += `  it('should return correct value with valid inputs', ${asyncPrefix}() => {\n`;
  
  if (config.includeComments) {
    tests += `    // Arrange\n`;
  }
  
  params.forEach(param => {
    const mockValue = generateMockValueForType(param.type);
    tests += `    const ${param.name} = ${mockValue};\n`;
  });
  
  const expectedValue = generateExpectedValueForType(returnType);
  tests += `    const expected = ${expectedValue};\n\n`;
  
  if (config.includeComments) {
    tests += `    // Act\n`;
  }
  
  const args = generateFunctionArgs(params);
  const functionCall = generateFunctionCall(func, args, awaitPrefix);
  tests += `    const result = ${functionCall};\n\n`;
  
  if (config.includeComments) {
    tests += `    // Assert\n`;
  }
  
  if (returnType.baseType === 'void') {
    tests += `    expect(result).toBeUndefined();\n`;
  } else {
    tests += `    expect(result).toEqual(expected);\n`;
    tests += `    expect(result).toMatchSnapshot();\n`;
  }
  
  tests += `  });\n\n`;

  // Type-specific tests
  if (returnType.isUnion && returnType.unionTypes && returnType.unionTypes.length > 1) {
    returnType.unionTypes.forEach((unionType) => {
      tests += `  it('should handle union type case: ${unionType}', ${asyncPrefix}() => {\n`;
      tests += `    // Arrange\n`;
      params.forEach(param => {
        const mockValue = generateMockValueForType(param.type);
        tests += `    const ${param.name} = ${mockValue};\n`;
      });
      tests += `\n    // Act\n`;
      const args = generateFunctionArgs(params);
      const functionCall = generateFunctionCall(func, args, awaitPrefix);
      tests += `    const result = ${functionCall};\n\n`;
      tests += `    // Assert: Result should be of type ${unionType}\n`;
      tests += `    expect(result).toBeDefined();\n`;
      tests += `    // TODO: Add type-specific assertions for ${unionType}\n`;
      tests += `  });\n\n`;
    });
  }

  // Test with optional parameters omitted
  const optionalParams = params.filter(p => p.optional);
  if (optionalParams.length > 0) {
    tests += `  it('should work with optional parameters omitted', ${asyncPrefix}() => {\n`;
    tests += `    // Arrange: Only required parameters\n`;
    const requiredParams = params.filter(p => !p.optional);
    requiredParams.forEach(param => {
      const mockValue = generateMockValueForType(param.type);
      tests += `    const ${param.name} = ${mockValue};\n`;
    });
    tests += `\n    // Act\n`;
    const requiredArgs = generateFunctionArgs(requiredParams);
    const functionCall = generateFunctionCall(func, requiredArgs, awaitPrefix);
    tests += `    const result = ${functionCall};\n\n`;
    tests += `    // Assert\n`;
    tests += `    expect(result).toBeDefined();\n`;
    tests += `  });\n\n`;
  }

  // Test with default values
  const paramsWithDefaults = params.filter(p => p.defaultValue);
  if (paramsWithDefaults.length > 0) {
    tests += `  it('should use default parameter values when not provided', ${asyncPrefix}() => {\n`;
    tests += `    // Arrange: Omit parameters with defaults\n`;
    const paramsWithoutDefaults = params.filter(p => !p.defaultValue);
    paramsWithoutDefaults.forEach(param => {
      const mockValue = generateMockValueForType(param.type);
      tests += `    const ${param.name} = ${mockValue};\n`;
    });
    tests += `\n    // Act: Function should use defaults\n`;
    const argsWithoutDefaults = generateFunctionArgs(paramsWithoutDefaults);
    const functionCall = generateFunctionCall(func, argsWithoutDefaults, awaitPrefix);
    tests += `    const result = ${functionCall};\n\n`;
    tests += `    // Assert\n`;
    tests += `    expect(result).toBeDefined();\n`;
    tests += `  });\n\n`;
  }

  return tests;
}

function generateBDDTests(func: FunctionInfo, config: TestConfig): string {
  const { isAsync } = func;
  const asyncPrefix = isAsync ? 'async ' : '';
  const awaitPrefix = isAsync ? 'await ' : '';
  
  let tests = '';
  
  tests += `  describe('GIVEN valid inputs', () => {\n`;
  tests += `    it('WHEN function is called THEN it should return expected result', ${asyncPrefix}() => {\n`;
  
  if (config.includeComments) {
    tests += `      // GIVEN: Setup test data\n`;
  }
  tests += generateTestBody(func, 'bdd', awaitPrefix, config.includeComments);
  tests += `    });\n`;
  tests += `  });\n\n`;

  tests += `  describe('GIVEN edge case inputs', () => {\n`;
  tests += `    it('WHEN function is called THEN it should handle gracefully', ${asyncPrefix}() => {\n`;
  tests += `      // TODO: Implement edge case tests\n`;
  tests += `    });\n`;
  tests += `  });\n\n`;

  tests += `  describe('GIVEN invalid inputs', () => {\n`;
  tests += `    it('WHEN function is called THEN it should throw error', ${asyncPrefix}() => {\n`;
  tests += `      // TODO: Implement error tests\n`;
  tests += `    });\n`;
  tests += `  });\n\n`;

  return tests;
}

function generateTestBody(func: FunctionInfo, style: string, awaitPrefix: string, includeComments: boolean): string {
  let body = '';
  const indent = style === 'bdd' ? '      ' : '    ';
  
  if (style === 'bdd' && includeComments) {
    body += `${indent}// GIVEN\n`;
  } else if (includeComments) {
    body += `${indent}// Arrange\n`;
  }

  func.params.forEach(param => {
    if (param.isDestructured && param.destructuredProps) {
      // Handle destructured parameters - create proper object
      const destructuredObj: Record<string, string> = {};
      param.destructuredProps.forEach(prop => {
        destructuredObj[prop] = generateMockValueForType({ 
          raw: 'any', 
          isUnion: false, 
          isGeneric: false, 
          isIntersection: false,
          baseType: 'any' 
        });
      });
      body += `${indent}const ${param.name} = ${JSON.stringify(destructuredObj, null, 2).replace(/"/g, '').replace(/\n/g, '\n' + indent)};\n`;
    } else if (param.isRest) {
      // Handle rest parameters
      const mockValue = generateMockValueForType(param.type);
      body += `${indent}const ${param.name} = [${mockValue}];\n`;
    } else {
      const mockValue = generateMockValueForType(param.type);
      body += `${indent}const ${param.name} = ${mockValue};\n`;
    }
  });

  body += '\n';
  
  if (style === 'bdd' && includeComments) {
    body += `${indent}// WHEN\n`;
  } else if (includeComments) {
    body += `${indent}// Act\n`;
  }

  const args = generateFunctionArgs(func.params);
  const functionCall = generateFunctionCall(func, args, awaitPrefix);
  body += `${indent}const result = ${functionCall};\n\n`;
  
  if (style === 'bdd' && includeComments) {
    body += `${indent}// THEN\n`;
  } else if (includeComments) {
    body += `${indent}// Assert\n`;
  }

  if (func.returnType.baseType === 'void') {
    body += `${indent}expect(result).toBeUndefined();\n`;
  } else {
    body += `${indent}expect(result).toBeDefined();\n`;
  }
  body += `${indent}// TODO: Add specific assertions based on your logic\n`;

  return body;
}

/**
 * FIXED: Generate proper function arguments with destructuring support
 */
export function generateFunctionArgs(params: ParamInfo[]): string {
  return params.map(p => {
    if (p.isDestructured) {
      // For destructured params, pass the variable that holds the object
      return p.name;
    } else if (p.isRest) {
      // For rest params, spread the array
      return `...${p.name}`;
    } else {
      return p.name;
    }
  }).join(', ');
}

export function generateMockValueForType(type: TypeInfo): string {
  // Handle never type
  if (type.isNever) {
    return 'undefined';
  }

  // Handle null/undefined types
  if (type.isNull) {
    return 'null';
  }
  if (type.isUndefined) {
    return 'undefined';
  }

  // Handle literal types
  if (type.isLiteral && type.literalValue !== undefined) {
    if (typeof type.literalValue === 'string') {
      return `'${type.literalValue}'`;
    }
    return String(type.literalValue);
  }

  // Handle union types - pick first type
  if (type.isUnion && type.unionTypes && type.unionTypes.length > 0) {
    return generateMockValueForType({ 
      ...type, 
      isUnion: false, 
      baseType: type.unionTypes[0],
      unionTypes: undefined
    });
  }

  // Handle intersection types - use first type
  if (type.isIntersection && type.intersectionTypes && type.intersectionTypes.length > 0) {
    return generateMockValueForType({ 
      ...type, 
      isIntersection: false, 
      baseType: type.intersectionTypes[0],
      intersectionTypes: undefined
    });
  }

  // Handle tuple types
  if (type.isTuple && type.tupleTypes) {
    const tupleValues = type.tupleTypes.map(t => generateMockValueForType(t)).join(', ');
    return `[${tupleValues}]`;
  }

  // Handle generic types
  if (type.isGeneric && type.genericTypes) {
    const baseType = type.baseType.toLowerCase();
    
    if (baseType === 'promise') {
      const innerType = type.genericTypes[0];
      return `Promise.resolve(${generateMockValueForType({ 
        raw: innerType, 
        isUnion: false, 
        isGeneric: false, 
        isIntersection: false,
        baseType: innerType 
      })})`;
    }
    
    if (baseType === 'array' || baseType.includes('array')) {
      if (type.genericTypes.length > 0) {
        const elementType = type.genericTypes[0];
        return `[${generateMockValueForType({ 
          raw: elementType, 
          isUnion: false, 
          isGeneric: false, 
          isIntersection: false,
          baseType: elementType 
        })}]`;
      }
      return '[]';
    }

    if (baseType === 'map') {
      return 'new Map()';
    }

    if (baseType === 'set') {
      return 'new Set()';
    }

    // For other generics, try to resolve inner type
    const innerType = type.genericTypes[0];
    return generateMockValueForType({ 
      raw: innerType, 
      isUnion: false, 
      isGeneric: false, 
      isIntersection: false,
      baseType: innerType 
    });
  }

  const baseType = type.baseType.toLowerCase();

  const typeMap: Record<string, string> = {
    'string': "'test-string'",
    'number': '42',
    'boolean': 'true',
    'array': '[]',
    'object': '{}',
    'date': 'new Date()',
    'any': 'null',
    'unknown': 'null',
    'void': 'undefined',
    'never': 'undefined',
    'null': 'null',
    'undefined': 'undefined',
    'map': 'new Map()',
    'set': 'new Set()',
    'regexp': '/test/',
    'error': 'new Error("test")',
    'function': '() => {}',
    'symbol': 'Symbol("test")',
    'bigint': '42n',
  };

  // Exact match first
  if (typeMap[baseType]) {
    return typeMap[baseType];
  }

  // Partial match
  for (const [key, value] of Object.entries(typeMap)) {
    if (baseType.includes(key)) return value;
  }

  // For custom types/interfaces, return empty object
  if (type.resolvedType) {
    return '{}';
  }

  // Default fallback
  return '{}';
}

function generateExpectedValueForType(type: TypeInfo): string {
  return generateMockValueForType(type);
}

# C:\Users\DELL OS\Desktop\test-gen\src\index.ts
export { generateTest, generateFunctionCall, generateFunctionArgs, generateMockValueForType, GenerationError } from './generator';
export { parseFile, ParseError } from './parser';
export { generateTestWithFlow, generateSmartTests } from './smart-generator';
export { analyzeBusinessFlow } from './flow-analyzer';
export { loadConfig, mergeConfigs, ConfigError } from './config-loader';
export { TypeResolver } from './type-resolver';
export { detectMocks, generateMockSetup, generateMockImports } from './mock-generator';
export * from './types';

# C:\Users\DELL OS\Desktop\test-gen\src\mock-generator.ts
import * as ts from 'typescript';
import * as fs from 'fs';
import { FunctionInfo, MockInfo, TypeInfo } from './types';
import { generateMockValueForType } from './generator';

/**
 * Comprehensive list of global objects to exclude from mocking
 */
const GLOBAL_OBJECTS = new Set([
  // Standard built-in objects (ES2023)
  'Object', 'Function', 'Boolean', 'Symbol', 'Error',
  'AggregateError', 'EvalError', 'RangeError', 'ReferenceError',
  'SyntaxError', 'TypeError', 'URIError',
  'Number', 'BigInt', 'Math', 'Date', 'String', 'RegExp',
  'Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
  'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'Map', 'Set', 'WeakMap', 'WeakSet',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
  'Atomics', 'JSON', 'Promise', 'Proxy', 'Reflect',
  'FinalizationRegistry', 'WeakRef',
  
  // Console and timers
  'console', 'setTimeout', 'setInterval', 'clearTimeout', 
  'clearInterval', 'setImmediate', 'clearImmediate',
  'queueMicrotask',
  
  // Node.js globals
  'process', 'Buffer', 'global', '__dirname', '__filename',
  'require', 'module', 'exports',
  
  // Browser globals
  'window', 'document', 'navigator', 'location', 'history',
  'localStorage', 'sessionStorage', 'indexedDB',
  'fetch', 'XMLHttpRequest', 'WebSocket',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback',
  'performance', 'crypto', 'Intl',
  
  // URL and encoding
  'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'atob', 'btoa', 'encodeURI', 'decodeURI',
  'encodeURIComponent', 'decodeURIComponent',
  
  // Testing globals
  'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach',
  'beforeAll', 'afterAll', 'jest', 'vi', 'vitest',
]);

/**
 * Check if a name is a built-in/global object
 */
function isBuiltin(name: string): boolean {
  const parts = name.split('.');
  const rootName = parts[0];
  
  // Check direct match
  if (GLOBAL_OBJECTS.has(rootName)) {
    return true;
  }
  
  // Check for common method patterns
  const builtinPatterns = [
    /^[A-Z]/, // Constructor functions (capitalized)
    /^[a-z]+\.(length|toString|valueOf|constructor)$/, // Common properties
  ];
  
  return builtinPatterns.some(pattern => pattern.test(name));
}

export function detectMocks(sourceCode: string, func: FunctionInfo): MockInfo[] {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const mocks: MockInfo[] = [];
  const visitedCalls = new Set<string>();
  const imports = new Map<string, { module: string; isDefault: boolean }>();

  function findFunctionBody(node: ts.Node): ts.Node | null {
    if (ts.isFunctionDeclaration(node) && node.name?.getText() === func.name) {
      return node.body || null;
    }
    if (ts.isMethodDeclaration(node) && node.name?.getText() === func.name) {
      return node.body || null;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      return node.body || null;
    }

    let found: ts.Node | null = null;
    ts.forEachChild(node, (child) => {
      if (!found) {
        found = findFunctionBody(child);
      }
    });
    return found;
  }

  function collectImports(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
      
      if (node.importClause) {
        // Named imports
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach(element => {
              const importedName = element.name?.getText() || '';
              const localName = element.propertyName?.getText() || importedName;
              imports.set(localName, { module: moduleSpecifier, isDefault: false });
            });
          }
          // Namespace imports: import * as foo from 'module'
          if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            const namespaceName = node.importClause.namedBindings.name.getText();
            imports.set(namespaceName, { module: moduleSpecifier, isDefault: false });
          }
        }
        
        // Default import
        if (node.importClause.name) {
          const defaultName = node.importClause.name.getText();
          imports.set(defaultName, { module: moduleSpecifier, isDefault: true });
        }
      }
    }
    
    ts.forEachChild(node, collectImports);
  }

  function analyzeCallsInBody(node: ts.Node) {
    // Find function calls that might need mocking
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      
      if (ts.isIdentifier(expression)) {
        const functionName = expression.getText();
        
        // Check if it's a built-in or already visited
        if (isBuiltin(functionName)) {
          // Skip built-ins
          ts.forEachChild(node, analyzeCallsInBody);
          return;
        }
        
        const mockKey = `function:${functionName}`;
        if (!visitedCalls.has(mockKey)) {
          const importInfo = imports.get(functionName);
          
          if (importInfo) {
            // It's an imported function
            mocks.push({
              moduleName: importInfo.module,
              functionName,
              isDefault: importInfo.isDefault,
              mockType: 'function',
            });
          } else {
            // Local function or untracked import
            mocks.push({
              moduleName: 'local',
              functionName,
              isDefault: false,
              mockType: 'function',
            });
          }
          
          visitedCalls.add(mockKey);
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        const objectName = expression.expression.getText();
        const methodName = expression.name.getText();
        const fullName = `${objectName}.${methodName}`;
        
        // Check if it's a built-in
        if (isBuiltin(fullName)) {
          ts.forEachChild(node, analyzeCallsInBody);
          return;
        }
        
        const mockKey = `method:${fullName}`;
        if (!visitedCalls.has(mockKey)) {
          const importInfo = imports.get(objectName);
          
          if (importInfo) {
            // It's an imported module/object
            mocks.push({
              moduleName: importInfo.module,
              functionName: methodName,
              isDefault: importInfo.isDefault,
              mockType: 'function',
            });
          } else {
            // Could be a module import or local object
            mocks.push({
              moduleName: objectName,
              functionName: methodName,
              isDefault: false,
              mockType: 'function',
            });
          }
          
          visitedCalls.add(mockKey);
        }
      }
    }
    
    // Detect class instantiations: new SomeClass()
    if (ts.isNewExpression(node)) {
      const className = node.expression.getText();
      
      if (!isBuiltin(className)) {
        const mockKey = `class:${className}`;
        if (!visitedCalls.has(mockKey)) {
          const importInfo = imports.get(className);
          
          if (importInfo) {
            mocks.push({
              moduleName: importInfo.module,
              functionName: className,
              isDefault: importInfo.isDefault,
              mockType: 'class',
            });
          } else {
            mocks.push({
              moduleName: 'local',
              functionName: className,
              isDefault: false,
              mockType: 'class',
            });
          }
          
          visitedCalls.add(mockKey);
        }
      }
    }

    ts.forEachChild(node, analyzeCallsInBody);
  }

  // First pass: collect all imports
  collectImports(sourceFile);

  // Second pass: analyze function body for calls
  const functionBody = findFunctionBody(sourceFile);
  if (functionBody) {
    analyzeCallsInBody(functionBody);
  }

  // Filter out duplicates and sort
  const uniqueMocks = Array.from(
    new Map(
      mocks.map(m => [
        `${m.moduleName}:${m.functionName}:${m.isDefault}`,
        m
      ])
    ).values()
  );

  return uniqueMocks;
}

export function generateMockSetup(
  mocks: MockInfo[], 
  framework: 'jest' | 'vitest' | 'mocha'
): string {
  if (mocks.length === 0) {
    return '';
  }

  let setup = '';
  const mockFn = framework === 'vitest' ? 'vi.fn()' : 'jest.fn()';
  const mockModule = framework === 'vitest' ? 'vi.mock' : 'jest.mock';

  // Group mocks by module
  const mocksByModule = new Map<string, MockInfo[]>();
  mocks.forEach(mock => {
    if (!mocksByModule.has(mock.moduleName)) {
      mocksByModule.set(mock.moduleName, []);
    }
    mocksByModule.get(mock.moduleName)!.push(mock);
  });

  // Generate module mocks (skip 'local' for now)
  const externalMocks = Array.from(mocksByModule.entries())
    .filter(([moduleName]) => moduleName !== 'local');

  if (externalMocks.length > 0) {
    setup += '// Module mocks\n';
    
    externalMocks.forEach(([moduleName, moduleMocks]) => {
      setup += `${mockModule}('${moduleName}', () => ({\n`;
      
      moduleMocks.forEach(mock => {
        if (mock.isDefault) {
          setup += `  default: ${mockFn},\n`;
        } else {
          setup += `  ${mock.functionName}: ${mockFn},\n`;
        }
      });
      
      setup += `}));\n\n`;
    });
  }

  // Generate beforeEach setup for local mocks
  const localMocks = mocks.filter(m => m.moduleName === 'local');
  if (localMocks.length > 0) {
    setup += 'beforeEach(() => {\n';
    setup += '  // Setup local mocks\n';
    localMocks.forEach(mock => {
      setup += `  // TODO: Mock ${mock.functionName}\n`;
      setup += `  // ${mock.functionName} = ${mockFn};\n`;
    });
    setup += '});\n\n';
  }

  return setup;
}

export function generateMockImports(
  mocks: MockInfo[], 
  framework: 'jest' | 'vitest' | 'mocha'
): string {
  if (mocks.length === 0) {
    return '';
  }

  const imports = new Set<string>();
  
  // Add imports for external modules that need mocking
  mocks.forEach(mock => {
    if (mock.moduleName !== 'local' && !mock.moduleName.startsWith('.')) {
      // For type checking, we might want to import types
      // This is optional and depends on the use case
    }
  });

  if (imports.size > 0) {
    return '// Mock imports\n' + Array.from(imports).join('\n') + '\n\n';
  }

  return '';
}

/**
 * Generate smart mock return values based on usage context
 */
export function generateSmartMockReturn(
  callExpression: ts.CallExpression,
  checker?: ts.TypeChecker
): string {
  if (!checker) {
    return 'undefined';
  }

  try {
    const type = checker.getTypeAtLocation(callExpression);
    const typeString = checker.typeToString(type);
    
    // Generate appropriate mock based on type
    if (typeString.startsWith('Promise<')) {
      const innerType = typeString.match(/Promise<(.+)>/)?.[1] || 'unknown';
      return `Promise.resolve(${generateMockValueForType({ 
        raw: innerType,
        baseType: innerType,
        isUnion: false,
        isGeneric: false,
        isIntersection: false
      })})`;
    }
    
    return generateMockValueForType({
      raw: typeString,
      baseType: typeString,
      isUnion: false,
      isGeneric: false,
      isIntersection: false
    });
  } catch {
    return 'undefined';
  }
}

# C:\Users\DELL OS\Desktop\test-gen\src\parser.ts
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { FunctionInfo, ParamInfo, TypeInfo } from './types';
import { TypeResolver } from './type-resolver';
import { getSimilarFiles } from './config-loader';

let typeResolver: TypeResolver | null = null;

export class ParseError extends Error {
  constructor(
    message: string,
    public filePath: string,
    public line?: number,
    public column?: number
  ) {
    super(message);
    this.name = 'ParseError';
    Error.captureStackTrace(this, ParseError);
  }
}

export function parseFile(filePath: string): FunctionInfo[] {
  // Validate file path
  if (!filePath || typeof filePath !== 'string') {
    throw new ParseError('Invalid file path provided', filePath || 'unknown');
  }

  // Check if file exists with better error message
  if (!fs.existsSync(filePath)) {
    const similarFiles = getSimilarFiles(filePath);
    const suggestion = similarFiles.length > 0
      ? `\n\n💡 Did you mean one of these?\n${similarFiles.map(f => `   - ${f}`).join('\n')}`
      : '\n\n💡 Check the file path and try again.';
    
    throw new ParseError(
      `File not found: ${filePath}${suggestion}`,
      filePath
    );
  }

  // Check if it's a file (not directory)
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error: any) {
    throw new ParseError(
      `Cannot access file: ${error.message}`,
      filePath
    );
  }

  if (!stats.isFile()) {
    throw new ParseError(
      `Path is not a file: ${filePath}\n\n💡 Please provide a path to a file, not a directory.`,
      filePath
    );
  }

  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  const validExtensions = ['.ts', '.tsx', '.js', '.jsx'];
  if (!validExtensions.includes(ext)) {
    throw new ParseError(
      `Unsupported file extension: ${ext}\n\n💡 Supported extensions: ${validExtensions.join(', ')}`,
      filePath
    );
  }

  let sourceCode: string;
  try {
    sourceCode = fs.readFileSync(filePath, 'utf-8');
  } catch (error: any) {
    throw new ParseError(
      `Failed to read file: ${error.message}`,
      filePath
    );
  }

  // Validate file is not empty
  if (!sourceCode.trim()) {
    return [];
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );
  } catch (error: any) {
    throw new ParseError(
      `Failed to parse TypeScript source: ${error.message}`,
      filePath
    );
  }

  // Check for syntax errors with better messages
  try {
    const program = ts.createProgram([filePath], {
      noEmit: true,
      skipLibCheck: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
    
    if (errors.length > 0) {
      const errorMessages = errors.slice(0, 3).map(e => {
        const message = ts.flattenDiagnosticMessageText(e.messageText, '\n');
        if (e.file && e.start !== undefined) {
          const { line, character } = e.file.getLineAndCharacterOfPosition(e.start);
          return `  Line ${line + 1}, Col ${character + 1}: ${message}`;
        }
        return `  ${message}`;
      }).join('\n');
      
      const moreErrors = errors.length > 3 ? `\n  ... and ${errors.length - 3} more errors` : '';
      
      throw new ParseError(
        `TypeScript syntax errors found:\n${errorMessages}${moreErrors}\n\n💡 Fix syntax errors and try again.`,
        filePath
      );
    }
  } catch (error: any) {
    if (error instanceof ParseError) {
      throw error;
    }
    // If type checking fails, continue with parsing
    if (process.env.DEBUG) {
      console.warn('⚠️  Type checking failed, continuing with parsing:', error.message);
    }
  }

  // Initialize type resolver with cleanup
  let shouldDisposeResolver = false;
  try {
    if (!typeResolver || typeResolver.isDisposed()) {
      const projectRoot = findProjectRoot(filePath);
      typeResolver = new TypeResolver(projectRoot);
      shouldDisposeResolver = true;
    }
  } catch (error: any) {
    if (process.env.DEBUG) {
      console.warn('⚠️  Type resolution disabled:', error.message);
    }
    typeResolver = null;
  }

  const functions: FunctionInfo[] = [];

  try {
    function visit(node: ts.Node, className?: string) {
      // 1. Function declarations
      if (ts.isFunctionDeclaration(node)) {
        const func = extractFunctionInfo(node, 'function', className, sourceFile);
        if (func) functions.push(func);
      }
      
      // 2. Arrow functions as const/let/var
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach(decl => {
          if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
            const func = extractArrowFunctionInfo(decl, node, sourceFile);
            if (func) functions.push(func);
          }
          // Function expression: const foo = function() {}
          if (decl.initializer && ts.isFunctionExpression(decl.initializer)) {
            const func = extractFunctionExpressionInfo(decl, node, sourceFile);
            if (func) functions.push(func);
          }
        });
      }

      // 3. Object methods: const obj = { method() {} }
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach(decl => {
          if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
            const objName = decl.name.getText();
            decl.initializer.properties.forEach(prop => {
              if (ts.isMethodDeclaration(prop) || ts.isPropertyAssignment(prop)) {
                const func = extractObjectMethodInfo(prop, objName, node, sourceFile);
                if (func) functions.push(func);
              }
            });
          }
        });
      }

      // 4. Class methods
      if (ts.isClassDeclaration(node)) {
        const currentClassName = node.name?.getText() || 'Anonymous';
        node.members.forEach(member => {
          if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
            const func = extractMethodInfo(member, currentClassName, sourceFile);
            if (func) functions.push(func);
          } else if (ts.isGetAccessorDeclaration(member)) {
            const func = extractGetterInfo(member, currentClassName, sourceFile);
            if (func) functions.push(func);
          } else if (ts.isSetAccessorDeclaration(member)) {
            const func = extractSetterInfo(member, currentClassName, sourceFile);
            if (func) functions.push(func);
          }
        });
      }

      // 5. Export default function
      if (ts.isExportAssignment(node)) {
        if (ts.isFunctionExpression(node.expression)) {
          const func = extractDefaultExportFunction(node.expression, sourceFile);
          if (func) functions.push(func);
        } else if (ts.isArrowFunction(node.expression)) {
          const func = extractDefaultExportArrowFunction(node.expression, sourceFile);
          if (func) functions.push(func);
        }
      }

      ts.forEachChild(node, (child) => visit(child, className));
    }

    visit(sourceFile);
    
    return functions;
  } finally {
    // Cleanup type resolver if we created it
    if (shouldDisposeResolver && typeResolver) {
      typeResolver.dispose();
      typeResolver = null;
    }
  }
}

/**
 * Find project root with safeguards (uses same logic as config-loader)
 */
function findProjectRoot(filePath: string): string {
  const MAX_DEPTH = 50;
  const visited = new Set<string>();
  
  try {
    let currentDir = path.dirname(path.resolve(filePath));
    const root = path.parse(currentDir).root;
    let depth = 0;
    
    while (currentDir !== root && depth < MAX_DEPTH) {
      const realPath = fs.realpathSync(currentDir);
      if (visited.has(realPath)) {
        break;
      }
      visited.add(realPath);
      
      const packageJson = path.join(currentDir, 'package.json');
      try {
        if (fs.existsSync(packageJson)) {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      
      currentDir = parentDir;
      depth++;
    }
  } catch (error: any) {
    if (process.env.DEBUG) {
      console.warn('⚠️  Error finding project root:', error.message);
    }
  }
  
  return process.cwd();
}

function extractFunctionInfo(
  node: ts.FunctionDeclaration,
  kind: 'function' | 'method',
  className: string | undefined,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = node.name?.getText();
  if (!name) return null;

  const params = extractParams(node.parameters, sourceFile);
  const returnType = extractTypeInfo(node.type, sourceFile);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
  const isExported = hasModifier(node, ts.SyntaxKind.ExportKeyword);
  const isDefaultExport = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
  const decorators = extractDecorators(node);
  const jsdoc = extractJSDoc(node);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported,
    isDefaultExport,
    kind,
    className,
    decorators,
    jsdoc,
  };
}

function extractArrowFunctionInfo(
  decl: ts.VariableDeclaration,
  statement: ts.VariableStatement,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = decl.name.getText();
  const arrowFunc = decl.initializer as ts.ArrowFunction;

  const params = extractParams(arrowFunc.parameters, sourceFile);
  const returnType = extractTypeInfo(arrowFunc.type, sourceFile);
  const isAsync = hasModifier(arrowFunc, ts.SyntaxKind.AsyncKeyword);
  const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  const jsdoc = extractJSDoc(statement);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported,
    isDefaultExport: false,
    kind: 'arrow',
    jsdoc,
  };
}

function extractFunctionExpressionInfo(
  decl: ts.VariableDeclaration,
  statement: ts.VariableStatement,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = decl.name.getText();
  const funcExpr = decl.initializer as ts.FunctionExpression;

  const params = extractParams(funcExpr.parameters, sourceFile);
  const returnType = extractTypeInfo(funcExpr.type, sourceFile);
  const isAsync = hasModifier(funcExpr, ts.SyntaxKind.AsyncKeyword);
  const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  const jsdoc = extractJSDoc(statement);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported,
    isDefaultExport: false,
    kind: 'function',
    jsdoc,
  };
}

function extractObjectMethodInfo(
  prop: ts.MethodDeclaration | ts.PropertyAssignment,
  objName: string,
  statement: ts.VariableStatement,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  let name: string;
  let params: ParamInfo[];
  let returnType: TypeInfo;
  let isAsync = false;

  if (ts.isMethodDeclaration(prop)) {
    name = prop.name?.getText() || '';
    params = extractParams(prop.parameters, sourceFile);
    returnType = extractTypeInfo(prop.type, sourceFile);
    isAsync = hasModifier(prop, ts.SyntaxKind.AsyncKeyword);
  } else if (ts.isPropertyAssignment(prop)) {
    name = prop.name?.getText() || '';
    if (ts.isArrowFunction(prop.initializer)) {
      const arrowFunc = prop.initializer;
      params = extractParams(arrowFunc.parameters, sourceFile);
      returnType = extractTypeInfo(arrowFunc.type, sourceFile);
      isAsync = hasModifier(arrowFunc, ts.SyntaxKind.AsyncKeyword);
    } else if (ts.isFunctionExpression(prop.initializer)) {
      const funcExpr = prop.initializer;
      params = extractParams(funcExpr.parameters, sourceFile);
      returnType = extractTypeInfo(funcExpr.type, sourceFile);
      isAsync = hasModifier(funcExpr, ts.SyntaxKind.AsyncKeyword);
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!name) return null;

  const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);

  return {
    name: `${objName}.${name}`,
    params,
    returnType,
    isAsync,
    isExported,
    isDefaultExport: false,
    kind: 'method',
    className: objName,
  };
}

function extractMethodInfo(
  node: ts.MethodDeclaration | ts.ConstructorDeclaration,
  className: string,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = ts.isConstructorDeclaration(node) 
    ? 'constructor' 
    : node.name?.getText() || '';
  
  if (!name) return null;

  const params = extractParams(node.parameters, sourceFile);
  const returnType = ts.isConstructorDeclaration(node) 
    ? { raw: className, isUnion: false, isGeneric: false, isIntersection: false, baseType: className }
    : extractTypeInfo(node.type, sourceFile);
  
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
  const accessModifier = getAccessModifier(node);
  const isStatic = hasModifier(node, ts.SyntaxKind.StaticKeyword);
  const decorators = extractDecorators(node);
  const jsdoc = extractJSDoc(node);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported: true,
    isDefaultExport: false,
    kind: isStatic ? 'static' : (ts.isConstructorDeclaration(node) ? 'constructor' : 'method'),
    accessModifier,
    className,
    isStatic,
    decorators,
    jsdoc,
  };
}

function extractGetterInfo(
  node: ts.GetAccessorDeclaration,
  className: string,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = node.name?.getText() || '';
  if (!name) return null;

  const returnType = extractTypeInfo(node.type, sourceFile);
  const accessModifier = getAccessModifier(node);
  const isStatic = hasModifier(node, ts.SyntaxKind.StaticKeyword);
  const decorators = extractDecorators(node);
  const jsdoc = extractJSDoc(node);

  return {
    name,
    params: [],
    returnType,
    isAsync: false,
    isExported: true,
    isDefaultExport: false,
    kind: isStatic ? 'static' : 'getter',
    accessModifier,
    className,
    isStatic,
    decorators,
    jsdoc,
  };
}

function extractSetterInfo(
  node: ts.SetAccessorDeclaration,
  className: string,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = node.name?.getText() || '';
  if (!name) return null;

  const params = extractParams(node.parameters, sourceFile);
  const returnType = { raw: 'void', isUnion: false, isGeneric: false, isIntersection: false, baseType: 'void' };
  const accessModifier = getAccessModifier(node);
  const isStatic = hasModifier(node, ts.SyntaxKind.StaticKeyword);
  const decorators = extractDecorators(node);
  const jsdoc = extractJSDoc(node);

  return {
    name,
    params,
    returnType,
    isAsync: false,
    isExported: true,
    isDefaultExport: false,
    kind: isStatic ? 'static' : 'setter',
    accessModifier,
    className,
    isStatic,
    decorators,
    jsdoc,
  };
}

function extractDefaultExportFunction(
  node: ts.FunctionExpression,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = node.name?.getText() || 'default';
  const params = extractParams(node.parameters, sourceFile);
  const returnType = extractTypeInfo(node.type, sourceFile);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported: true,
    isDefaultExport: true,
    kind: 'function',
  };
}

function extractDefaultExportArrowFunction(
  node: ts.ArrowFunction,
  sourceFile: ts.SourceFile
): FunctionInfo | null {
  const name = 'default';
  const params = extractParams(node.parameters, sourceFile);
  const returnType = extractTypeInfo(node.type, sourceFile);
  const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported: true,
    isDefaultExport: true,
    kind: 'arrow',
  };
}

function extractParams(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile
): ParamInfo[] {
  return parameters.map(param => {
    const name = param.name.getText();
    const type = extractTypeInfo(param.type, sourceFile);
    const optional = !!param.questionToken;
    const defaultValue = param.initializer?.getText();
    
    // Check for destructuring
    const isDestructured = ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name);
    let destructuredProps: string[] | undefined;
    
    if (ts.isObjectBindingPattern(param.name)) {
      const bindingPattern = param.name as ts.ObjectBindingPattern;
      destructuredProps = bindingPattern.elements.map(el => {
        if (ts.isBindingElement(el)) {
          return el.name?.getText() || '';
        }
        return '';
      }).filter(Boolean);
    } else if (ts.isArrayBindingPattern(param.name)) {
      const bindingPattern = param.name as ts.ArrayBindingPattern;
      destructuredProps = bindingPattern.elements.map(el => {
        if (ts.isBindingElement(el)) {
          return el.name?.getText() || '';
        }
        return '';
      }).filter(Boolean);
    }

    // Check for rest parameters
    const isRest = !!param.dotDotDotToken;

    return {
      name,
      type,
      optional,
      defaultValue,
      isDestructured,
      destructuredProps,
      isRest,
    };
  });
}

function extractTypeInfo(typeNode: ts.TypeNode | undefined, sourceFile: ts.SourceFile): TypeInfo {
  if (!typeNode) {
    return { raw: 'any', isUnion: false, isGeneric: false, isIntersection: false, baseType: 'any' };
  }

  // Use type resolver if available
  if (typeResolver && !typeResolver.isDisposed()) {
    try {
      return typeResolver.resolveType(typeNode, sourceFile);
    } catch (e) {
      if (process.env.DEBUG) {
        console.warn('Type resolution failed, using fallback:', e);
      }
    }
  }

  // Fallback to basic type extraction
  return fallbackExtractTypeInfo(typeNode);
}

function fallbackExtractTypeInfo(typeNode: ts.TypeNode): TypeInfo {
  const raw = typeNode.getText();
  
  // Check for union types
  if (ts.isUnionTypeNode(typeNode)) {
    const unionTypes = typeNode.types.map(t => t.getText());
    return {
      raw,
      isUnion: true,
      isGeneric: false,
      isIntersection: false,
      baseType: unionTypes[0],
      unionTypes,
    };
  }

  // Check for intersection types
  if (ts.isIntersectionTypeNode(typeNode)) {
    const intersectionTypes = typeNode.types.map(t => t.getText());
    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: true,
      baseType: intersectionTypes[0],
      intersectionTypes,
    };
  }

  // Check for tuple types
  if (ts.isTupleTypeNode(typeNode)) {
    const tupleTypes = typeNode.elements.map(t => fallbackExtractTypeInfo(t));
    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: false,
      baseType: 'tuple',
      isTuple: true,
      tupleTypes,
    };
  }

  // Check for literal types
  if (ts.isLiteralTypeNode(typeNode)) {
    const literal = typeNode.literal;
    let value: string | number | boolean | undefined;
    
    if (ts.isStringLiteral(literal)) {
      value = literal.text;
    } else if (ts.isNumericLiteral(literal)) {
      value = parseFloat(literal.text);
    } else if (literal.kind === ts.SyntaxKind.TrueKeyword) {
      value = true;
    } else if (literal.kind === ts.SyntaxKind.FalseKeyword) {
      value = false;
    }

    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: false,
      baseType: typeof value,
      isLiteral: true,
      literalValue: value,
    };
  }

  // Check for generic types
  if (ts.isTypeReferenceNode(typeNode) && typeNode.typeArguments) {
    const baseType = typeNode.typeName.getText();
    const genericTypes = typeNode.typeArguments.map(t => t.getText());
    return {
      raw,
      isUnion: false,
      isGeneric: true,
      isIntersection: false,
      baseType,
      genericTypes,
    };
  }

  return {
    raw,
    isUnion: false,
    isGeneric: false,
    isIntersection: false,
    baseType: raw,
  };
}

function extractDecorators(node: ts.Node): string[] | undefined {
  if (!ts.canHaveDecorators(node)) {
    return undefined;
  }
  
  const decorators = ts.getDecorators(node);
  if (!decorators || decorators.length === 0) {
    return undefined;
  }

  return decorators.map(dec => dec.getText());
}

function extractJSDoc(node: ts.Node): string | undefined {
  const jsdoc = ts.getJSDocCommentsAndTags(node);
  if (jsdoc && jsdoc.length > 0) {
    return jsdoc.map(doc => doc.getText()).join('\n');
  }
  return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.getModifiers(node as ts.HasModifiers);
  return modifiers?.some(mod => mod.kind === kind) || false;
}

function getAccessModifier(node: ts.Node): 'public' | 'private' | 'protected' | undefined {
  if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) return 'private';
  if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) return 'protected';
  if (hasModifier(node, ts.SyntaxKind.PublicKeyword)) return 'public';
  return undefined;
}

# C:\Users\DELL OS\Desktop\test-gen\src\smart-generator.ts

import { FunctionInfo, TestConfig } from './types';
import {
  analyzeBusinessFlow,
  CallInfo,
  ConditionInfo,
  ErrorInfo,
  FlowAnalysis,
} from './flow-analyzer';
import { generateFunctionCall, generateFunctionArgs, generateMockValueForType } from './generator';

/**
 * Generate smart tests based on source code (pass source code directly)
 */
export function generateSmartTests(
  sourceCode: string,
  func: FunctionInfo,
  framework: string = 'jest',
): string {
  const flowAnalysis = analyzeBusinessFlow(sourceCode, func.name);

  let tests = '';

  // Generate test suite header
  tests += `describe('${func.name}', () => {\n`;
  tests += `  // Complexity: ${flowAnalysis.complexity}\n`;
  tests += `  // Conditions: ${flowAnalysis.conditions.length}\n`;
  tests += `  // Error handling: ${flowAnalysis.errorHandling.length}\n`;
  tests += `  // External calls: ${flowAnalysis.externalCalls.length}\n\n`;

  // Setup mocks for external calls
  if (flowAnalysis.externalCalls.length > 0) {
    tests += `  beforeEach(() => {\n`;
    flowAnalysis.externalCalls.forEach((call) => {
      const mockFn = framework === 'vitest' ? 'vi.fn()' : 'jest.fn()';
      tests += `    // Mock ${call.functionName}\n`;
      tests += `    // ${call.functionName} = ${mockFn};\n`;
    });
    tests += `  });\n\n`;
  }

  // 1. Generate tests for error handling
  flowAnalysis.errorHandling.forEach((error) => {
    if (error.type === 'throw') {
      tests += generateErrorTest(func, error, framework);
    }
  });

  // 2. Generate tests for each condition branch
  flowAnalysis.conditions.forEach((condition, index) => {
    tests += generateConditionTests(func, condition, index, framework);
  });

  // 3. Generate tests for loops
  if (flowAnalysis.loops.length > 0) {
    tests += generateLoopTests(func, flowAnalysis.loops, framework);
  }

  // 4. Generate tests for external calls
  flowAnalysis.externalCalls.forEach((call) => {
    tests += generateExternalCallTest(func, call, framework);
  });

  // 5. Generate happy path test
  tests += generateHappyPathTest(func, flowAnalysis, framework);

  // 6. Generate edge case tests based on complexity
  if (flowAnalysis.complexity > 5) {
    tests += generateComplexityTest(func, flowAnalysis);
  }

  tests += `});\n\n`;

  return tests;
}

function generateErrorTest(
  func: FunctionInfo,
  error: ErrorInfo,
  framework: string,
): string {
  const asyncPrefix = func.isAsync ? 'async ' : '';
  const awaitPrefix = func.isAsync ? 'await ' : '';

  let test = `  it('should throw ${error.errorType} when ${
    error.errorMessage || 'invalid input'
  }', ${asyncPrefix}() => {\n`;
  test += `    // Arrange: Setup invalid input that triggers error on line ${error.line}\n`;
  
  // Generate mock invalid inputs
  func.params.forEach(param => {
    test += `    const ${param.name} = null; // Invalid input\n`;
  });
  
  test += `\n    // Act & Assert\n`;

  const args = generateFunctionArgs(func.params);
  const functionCall = generateFunctionCall(func, args, '');
  
  if (func.isAsync) {
    test += `    await expect(${functionCall}).rejects.toThrow('${error.errorMessage || ''}');\n`;
  } else {
    test += `    expect(() => ${functionCall}).toThrow('${error.errorMessage || ''}');\n`;
  }

  test += `  });\n\n`;
  return test;
}

function generateConditionTests(
  func: FunctionInfo,
  condition: ConditionInfo,
  index: number,
  framework: string,
): string {
  const asyncPrefix = func.isAsync ? 'async ' : '';
  const awaitPrefix = func.isAsync ? 'await ' : '';

  let tests = '';

  // Test true branch
  tests += `  it('should handle case when ${condition.condition} is true (line ${condition.line})', ${asyncPrefix}() => {\n`;
  tests += `    // Arrange: Setup data that makes condition true\n`;
  
  func.params.forEach(param => {
    const mockValue = generateMockValueForType(param.type);
    tests += `    const ${param.name} = ${mockValue};\n`;
  });
  
  tests += `    // TODO: Adjust values to make ${condition.condition} = true\n\n`;
  tests += `    // Act\n`;
  
  const args = generateFunctionArgs(func.params);
  const functionCall = generateFunctionCall(func, args, awaitPrefix);
  tests += `    const result = ${functionCall};\n\n`;
  tests += `    // Assert: Verify consequence branch executed\n`;
  tests += `    expect(result).toBeDefined();\n`;
  tests += `    // TODO: Verify specific behavior from consequence\n`;
  tests += `  });\n\n`;

  // Test false branch if exists
  if (condition.alternative) {
    tests += `  it('should handle case when ${condition.condition} is false (line ${condition.line})', ${asyncPrefix}() => {\n`;
    tests += `    // Arrange: Setup data that makes condition false\n`;
    
    func.params.forEach(param => {
      const mockValue = generateMockValueForType(param.type);
      tests += `    const ${param.name} = ${mockValue};\n`;
    });
    
    tests += `    // TODO: Adjust values to make ${condition.condition} = false\n\n`;
    tests += `    // Act\n`;
    
    const functionCall2 = generateFunctionCall(func, args, awaitPrefix);
    tests += `    const result = ${functionCall2};\n\n`;
    tests += `    // Assert: Verify alternative branch executed\n`;
    tests += `    expect(result).toBeDefined();\n`;
    tests += `    // TODO: Verify specific behavior from alternative\n`;
    tests += `  });\n\n`;
  }

  return tests;
}

function generateLoopTests(
  func: FunctionInfo,
  loops: any[],
  framework: string,
): string {
  const asyncPrefix = func.isAsync ? 'async ' : '';
  const awaitPrefix = func.isAsync ? 'await ' : '';

  let tests = '';

  // Test with empty array
  tests += `  it('should handle empty array/collection', ${asyncPrefix}() => {\n`;
  tests += `    // Arrange: Setup with empty array\n`;
  
  func.params.forEach(param => {
    if (param.type.baseType.toLowerCase().includes('array')) {
      tests += `    const ${param.name} = [];\n`;
    } else {
      const mockValue = generateMockValueForType(param.type);
      tests += `    const ${param.name} = ${mockValue};\n`;
    }
  });
  
  tests += `\n    // Act\n`;
  const args = generateFunctionArgs(func.params);
  const functionCall = generateFunctionCall(func, args, awaitPrefix);
  tests += `    const result = ${functionCall};\n\n`;
  tests += `    // Assert\n`;
  tests += `    expect(result).toBeDefined();\n`;
  tests += `  });\n\n`;

  // Test with multiple items
  tests += `  it('should iterate correctly over multiple items', ${asyncPrefix}() => {\n`;
  tests += `    // Arrange: Setup with array of items\n`;
  
  func.params.forEach(param => {
    if (param.type.baseType.toLowerCase().includes('array')) {
      tests += `    const ${param.name} = [{}, {}, {}]; // TODO: Specify item structure\n`;
    } else {
      const mockValue = generateMockValueForType(param.type);
      tests += `    const ${param.name} = ${mockValue};\n`;
    }
  });
  
  tests += `\n    // Act\n`;
  const functionCall2 = generateFunctionCall(func, args, awaitPrefix);
  tests += `    const result = ${functionCall2};\n\n`;
  tests += `    // Assert: Verify all items processed\n`;
  tests += `    expect(result).toBeDefined();\n`;
  tests += `  });\n\n`;

  return tests;
}

function generateExternalCallTest(
  func: FunctionInfo,
  call: CallInfo,
  framework: string,
): string {
  const asyncPrefix = func.isAsync ? 'async ' : '';
  const awaitPrefix = func.isAsync ? 'await ' : '';
  const mockVerify = framework === 'vitest' ? 'vi.mocked' : 'jest.mocked';

  let test = `  it('should call ${call.functionName} with correct arguments (line ${call.line})', ${asyncPrefix}() => {\n`;
  test += `    // Arrange\n`;
  
  func.params.forEach(param => {
    const mockValue = generateMockValueForType(param.type);
    test += `    const ${param.name} = ${mockValue};\n`;
  });

  if (call.isAsync) {
    test += `    ${call.functionName}.mockResolvedValue({});\n\n`;
  } else {
    test += `    ${call.functionName}.mockReturnValue({});\n\n`;
  }

  test += `    // Act\n`;
  const args = generateFunctionArgs(func.params);
  const functionCall = generateFunctionCall(func, args, awaitPrefix);
  test += `    ${functionCall};\n\n`;
  test += `    // Assert: Verify external call\n`;
  test += `    expect(${call.functionName}).toHaveBeenCalled();\n`;
  test += `    // TODO: Add specific argument assertions\n`;
  test += `  });\n\n`;

  return test;
}

function generateHappyPathTest(
  func: FunctionInfo,
  flow: FlowAnalysis,
  framework: string,
): string {
  const asyncPrefix = func.isAsync ? 'async ' : '';
  const awaitPrefix = func.isAsync ? 'await ' : '';

  let test = `  it('should successfully complete happy path', ${asyncPrefix}() => {\n`;
  test += `    // Arrange: Setup valid input that passes all conditions\n`;

  // Generate hints based on flow analysis
  if (flow.conditions.length > 0) {
    test += `    // Make sure: ${flow.conditions
      .map((c) => c.condition)
      .slice(0, 3)
      .join(', ')}\n`;
  }

  func.params.forEach(param => {
    const mockValue = generateMockValueForType(param.type);
    test += `    const ${param.name} = ${mockValue};\n`;
  });

  // Mock external calls
  if (flow.externalCalls.length > 0) {
    test += `\n    // Mock external dependencies\n`;
    flow.externalCalls.forEach((call) => {
      if (call.isAsync) {
        test += `    ${call.functionName}.mockResolvedValue({});\n`;
      } else {
        test += `    ${call.functionName}.mockReturnValue({});\n`;
      }
    });
  }

  test += `\n    // Act\n`;
  const args = generateFunctionArgs(func.params);
  const functionCall = generateFunctionCall(func, args, awaitPrefix);
  test += `    const result = ${functionCall};\n\n`;
  test += `    // Assert\n`;
  test += `    expect(result).toBeDefined();\n`;

  // Add return value checks
  if (flow.returnStatements.length > 0) {
    const returnTypes = [...new Set(flow.returnStatements.map((r) => r.type))];
    test += `    // Expected return types: ${returnTypes.join(' | ')}\n`;
  }

  test += `  });\n\n`;

  return test;
}

function generateComplexityTest(
  func: FunctionInfo,
  flow: FlowAnalysis,
): string {
  let test = `  it('should handle complex scenario with multiple branches', async () => {\n`;
  test += `    // This function has high complexity (${flow.complexity})\n`;
  test += `    // Consider testing combinations of:\n`;

  flow.conditions.slice(0, 5).forEach((c, i) => {
    test += `    // - Condition ${i + 1}: ${c.condition}\n`;
  });

  if (flow.conditions.length > 5) {
    test += `    // - ... and ${flow.conditions.length - 5} more conditions\n`;
  }

  test += `    \n`;
  test += `    // TODO: Create comprehensive test covering edge cases\n`;
  test += `    // Consider using test.each() for multiple scenarios\n`;
  test += `  });\n\n`;

  return test;
}

/**
 * Main entry point: Generate test with flow analysis
 * FIXED: Pass sourceCode instead of re-reading file
 */
export function generateTestWithFlow(
  sourceCode: string,
  func: FunctionInfo,
  config: TestConfig,
): string {
  let testCode = '';

  // Import statements
  testCode += generateImports(func, config.framework);

  // Generate smart tests based on business flow
  testCode += generateSmartTests(sourceCode, func, config.framework);

  return testCode;
}

function generateImports(func: FunctionInfo, framework: string): string {
  let imports = '';
  
  // Import the function/class
  if (func.className) {
    imports += `import { ${func.className} } from './${func.className.toLowerCase()}';\n`;
  } else if (func.isDefaultExport) {
    imports += `import ${func.name} from './${func.name}';\n`;
  } else {
    imports += `import { ${func.name} } from './${func.name}';\n`;
  }

  if (framework === 'jest') {
    imports += `import { describe, it, expect, beforeEach, jest } from '@jest/globals';\n`;
  } else if (framework === 'vitest') {
    imports += `import { describe, it, expect, beforeEach, vi } from 'vitest';\n`;
  } else if (framework === 'mocha') {
    imports += `import { describe, it } from 'mocha';\n`;
    imports += `import { expect } from 'chai';\n`;
  }

  return imports + '\n';
}

# C:\Users\DELL OS\Desktop\test-gen\src\type-resolver.ts
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { TypeInfo } from './types';

export class TypeResolver {
  private program?: ts.Program;
  private checker?: ts.TypeChecker;
  private projectRoot: string;
  private disposed = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.initializeTypeChecker();
  }

  private initializeTypeChecker() {
    try {
      const tsConfigPath = ts.findConfigFile(
        this.projectRoot,
        ts.sys.fileExists,
        'tsconfig.json'
      );

      if (tsConfigPath) {
        const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
        const parsedConfig = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          path.dirname(tsConfigPath)
        );
        
        this.program = ts.createProgram(
          parsedConfig.fileNames,
          parsedConfig.options
        );
        this.checker = this.program.getTypeChecker();
      }
    } catch (error) {
      // If TypeScript compiler API fails, continue without type resolution
      if (process.env.DEBUG) {
        console.warn('⚠️  Type resolution disabled:', error);
      }
    }
  }

  /**
   * Dispose resources to prevent memory leaks
   */
  public dispose(): void {
    if (this.disposed) return;
    
    this.program = undefined;
    this.checker = undefined;
    this.disposed = true;
  }

  /**
   * Check if resolver is disposed
   */
  public isDisposed(): boolean {
    return this.disposed;
  }

  resolveType(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): TypeInfo {
    if (this.disposed) {
      throw new Error('TypeResolver has been disposed');
    }

    if (!typeNode) {
      return {
        raw: 'any',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'any',
      };
    }

    if (!this.checker) {
      return this.fallbackTypeInfo(typeNode);
    }

    try {
      const type = this.checker.getTypeFromTypeNode(typeNode);
      if (!type) {
        return this.fallbackTypeInfo(typeNode);
      }
      return this.typeToTypeInfo(type, typeNode.getText());
    } catch (error: any) {
      // Fallback to basic parsing if type resolution fails
      return this.fallbackTypeInfo(typeNode);
    }
  }

  private typeToTypeInfo(type: ts.Type, raw: string): TypeInfo {
    if (!type || !this.checker) {
      return {
        raw: raw || 'any',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: raw || 'any',
      };
    }

    try {
      const flags = type.getFlags();
      
      // Handle never type
      if (flags & ts.TypeFlags.Never) {
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: 'never',
          isNever: true,
        };
      }

      // Handle null/undefined
      if (flags & ts.TypeFlags.Null) {
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: 'null',
          isNull: true,
        };
      }

      if (flags & ts.TypeFlags.Undefined) {
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: 'undefined',
          isUndefined: true,
        };
      }

      // Handle union types
      if (type.isUnion()) {
        const unionTypes = type.types.map(t => this.checker!.typeToString(t));
        return {
          raw,
          isUnion: true,
          isGeneric: false,
          isIntersection: false,
          baseType: unionTypes[0],
          unionTypes,
        };
      }

      // Handle intersection types
      if (type.isIntersection()) {
        const intersectionTypes = type.types.map(t => this.checker!.typeToString(t));
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: true,
          baseType: intersectionTypes[0],
          intersectionTypes,
        };
      }

      // Handle literal types
      if (flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral)) {
        const value = (type as ts.LiteralType).value;
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: typeof value,
          isLiteral: true,
          literalValue: value as string | number | boolean,
        };
      }

      // Handle tuple types
      if (this.checker!.isTupleType(type)) {
        const tupleType = type as ts.TupleType;
        let elementTypes: ts.Type[] = [];
        
        try {
          // Try multiple ways to get tuple element types
          if ('elementTypes' in tupleType && Array.isArray((tupleType as any).elementTypes)) {
            elementTypes = (tupleType as any).elementTypes;
          } else if ('target' in tupleType && (tupleType as any).target) {
            const target = (tupleType as any).target;
            if (target && 'elementTypes' in target && Array.isArray(target.elementTypes)) {
              elementTypes = target.elementTypes;
            }
          }
          
          // Fallback: try to get from type arguments
          if (elementTypes.length === 0 && 'typeArguments' in tupleType) {
            const typeArgs = (tupleType as any).typeArguments;
            if (Array.isArray(typeArgs)) {
              elementTypes = typeArgs;
            }
          }
        } catch (e) {
          // If we can't get element types, continue with empty array
          if (process.env.DEBUG) {
            console.warn('Failed to extract tuple element types:', e);
          }
        }
        
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: 'tuple',
          isTuple: true,
          tupleTypes: elementTypes.map((t: ts.Type) => ({
            raw: this.checker!.typeToString(t),
            isUnion: false,
            isGeneric: false,
            isIntersection: false,
            baseType: this.checker!.typeToString(t),
          })),
        };
      }

      // Handle generic types
      const symbol = type.getSymbol();
      if (symbol) {
        const typeName = symbol.getName();
        
        // Check if it's a generic type reference
        if (type.aliasSymbol) {
          const aliasTypeArgs = type.aliasTypeArguments;
          if (aliasTypeArgs && aliasTypeArgs.length > 0) {
            return {
              raw,
              isUnion: false,
              isGeneric: true,
              isIntersection: false,
              baseType: typeName,
              genericTypes: aliasTypeArgs.map(t => this.checker!.typeToString(t)),
            };
          }
        }

        // Check for generic type parameters
        const typeArgs = (type as any).typeArguments;
        if (typeArgs && Array.isArray(typeArgs) && typeArgs.length > 0) {
          return {
            raw,
            isUnion: false,
            isGeneric: true,
            isIntersection: false,
            baseType: typeName,
            genericTypes: typeArgs.map((t: ts.Type) => this.checker!.typeToString(t)),
          };
        }

        // Resolve custom types/interfaces
        const resolvedType = this.resolveCustomType(symbol);
        if (resolvedType) {
          return {
            raw,
            isUnion: false,
            isGeneric: false,
            isIntersection: false,
            baseType: typeName,
            resolvedType,
          };
        }
      }

      try {
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: this.checker!.typeToString(type),
        };
      } catch (error: any) {
        // Fallback if typeToString fails
        return {
          raw,
          isUnion: false,
          isGeneric: false,
          isIntersection: false,
          baseType: raw,
        };
      }
    } catch (error: any) {
      // Fallback if anything fails in typeToTypeInfo
      if (process.env.DEBUG) {
        console.warn('Type resolution failed, using fallback:', error.message);
      }
      return {
        raw: raw || 'any',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: raw || 'any',
      };
    }
  }

  private resolveCustomType(symbol: ts.Symbol): string | undefined {
    try {
      const declarations = symbol.getDeclarations();
      if (!declarations || declarations.length === 0) {
        return undefined;
      }

      const declaration = declarations[0];
      if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
        // Return a simplified representation
        const text = declaration.getText();
        return text.length > 200 ? text.substring(0, 200) + '...' : text;
      }

      return undefined;
    } catch (e) {
      if (process.env.DEBUG) {
        console.warn('Failed to resolve custom type:', e);
      }
      return undefined;
    }
  }

  private fallbackTypeInfo(typeNode: ts.TypeNode): TypeInfo {
    const raw = typeNode.getText();
    
    // Basic parsing without TypeScript compiler API
    if (ts.isUnionTypeNode(typeNode)) {
      const unionTypes = typeNode.types.map(t => t.getText());
      return {
        raw,
        isUnion: true,
        isGeneric: false,
        isIntersection: false,
        baseType: unionTypes[0],
        unionTypes,
      };
    }

    if (ts.isIntersectionTypeNode(typeNode)) {
      const intersectionTypes = typeNode.types.map(t => t.getText());
      return {
        raw,
        isUnion: false,
        isGeneric: false,
        isIntersection: true,
        baseType: intersectionTypes[0],
        intersectionTypes,
      };
    }

    if (ts.isTypeReferenceNode(typeNode) && typeNode.typeArguments) {
      const baseType = typeNode.typeName.getText();
      const genericTypes = typeNode.typeArguments.map(t => t.getText());
      return {
        raw,
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        baseType,
        genericTypes,
      };
    }

    if (ts.isLiteralTypeNode(typeNode)) {
      const literal = typeNode.literal;
      let value: string | number | boolean | undefined;
      
      if (ts.isStringLiteral(literal)) {
        value = literal.text;
      } else if (ts.isNumericLiteral(literal)) {
        value = parseFloat(literal.text);
      } else if (literal.kind === ts.SyntaxKind.TrueKeyword) {
        value = true;
      } else if (literal.kind === ts.SyntaxKind.FalseKeyword) {
        value = false;
      }

      return {
        raw,
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: typeof value,
        isLiteral: true,
        literalValue: value,
      };
    }

    if (ts.isTupleTypeNode(typeNode)) {
      const tupleTypes = typeNode.elements.map(t => this.fallbackTypeInfo(t));
      return {
        raw,
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'tuple',
        isTuple: true,
        tupleTypes,
      };
    }

    return {
      raw,
      isUnion: false,
      isGeneric: false,
      isIntersection: false,
      baseType: raw,
    };
  }

  /**
   * Infer type from variable usage patterns
   */
  private inferTypeFromUsage(node: ts.Node): TypeInfo {
    const usages: string[] = [];
    
    function visit(n: ts.Node) {
      if (ts.isPropertyAccessExpression(n)) {
        usages.push(n.name.getText());
      }
      if (ts.isCallExpression(n)) {
        usages.push('callable');
      }
      if (ts.isElementAccessExpression(n)) {
        usages.push('indexable');
      }
      ts.forEachChild(n, visit);
    }
    
    const parent = node.parent;
    if (parent) {
      visit(parent);
    }
    
    // Infer from usage patterns
    if (usages.includes('length') && (usages.includes('push') || usages.includes('pop'))) {
      return { 
        raw: 'Array<unknown>', 
        baseType: 'Array', 
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        genericTypes: ['unknown']
      };
    }
    
    if (usages.includes('then') && usages.includes('catch')) {
      return { 
        raw: 'Promise<unknown>', 
        baseType: 'Promise',
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        genericTypes: ['unknown']
      };
    }
    
    if (usages.includes('size') && (usages.includes('set') || usages.includes('get'))) {
      return { 
        raw: 'Map<unknown, unknown>', 
        baseType: 'Map',
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        genericTypes: ['unknown', 'unknown']
      };
    }
    
    return { 
      raw: 'unknown', 
      baseType: 'unknown',
      isUnion: false,
      isGeneric: false,
      isIntersection: false
    };
  }
}

# C:\Users\DELL OS\Desktop\test-gen\src\types.ts
// src/types.ts - Enhanced type definitions
export interface FunctionInfo {
  name: string;
  params: ParamInfo[];
  returnType: TypeInfo;
  isAsync: boolean;
  isExported: boolean;
  isDefaultExport: boolean;
  kind: 'function' | 'arrow' | 'method' | 'constructor' | 'getter' | 'setter' | 'static';
  accessModifier?: 'public' | 'private' | 'protected';
  className?: string;
  isStatic?: boolean;
  decorators?: string[];
  jsdoc?: string;
  overloads?: FunctionInfo[];
}

export interface ParamInfo {
  name: string;
  type: TypeInfo;
  optional: boolean;
  defaultValue?: string;
  isDestructured: boolean;
  destructuredProps?: string[];
  isRest?: boolean;
}

export interface TypeInfo {
  raw: string;
  isUnion: boolean;
  isGeneric: boolean;
  isIntersection: boolean;
  baseType: string;
  genericTypes?: string[];
  unionTypes?: string[];
  intersectionTypes?: string[];
  isLiteral?: boolean;
  literalValue?: string | number | boolean;
  isTuple?: boolean;
  tupleTypes?: TypeInfo[];
  isNever?: boolean;
  isNull?: boolean;
  isUndefined?: boolean;
  resolvedType?: string; // For custom types/interfaces
}

export interface TestConfig {
  framework: 'jest' | 'vitest' | 'mocha';
  style: 'basic' | 'strict' | 'bdd' | 'smart';
  outputPath?: string;
  includeComments: boolean;
  generateMocks?: boolean;
  testEach?: boolean;
  customTemplate?: string;
  ignorePatterns?: string[];
}

export interface ProjectConfig {
  framework?: 'jest' | 'vitest' | 'mocha';
  style?: 'basic' | 'strict' | 'bdd' | 'smart';
  includeComments?: boolean;
  generateMocks?: boolean;
  testEach?: boolean;
  outputPattern?: string;
  ignorePatterns?: string[];
  typeResolution?: {
    paths?: Record<string, string[]>;
    baseUrl?: string;
  };
}

export interface MockInfo {
  moduleName: string;
  functionName: string;
  isDefault?: boolean;
  mockType: 'function' | 'class' | 'object';
  returnType?: TypeInfo;
}


# C:\Users\DELL OS\Desktop\test-gen\jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  verbose: true,
};

# C:\Users\DELL OS\Desktop\test-gen\package.json
{
  "name": "@callmequantu/test-generator",
  "version": "2.0.0",
  "description": "Intelligent test generator for TypeScript/JavaScript - Generate comprehensive test skeletons with smart flow analysis",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "test-gen": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "prepublishOnly": "npm run clean && npm run build",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "test",
    "generator",
    "testing",
    "jest",
    "vitest",
    "mocha",
    "typescript",
    "javascript",
    "cli",
    "automation",
    "test-skeleton",
    "tdd",
    "bdd",
    "code-coverage"
  ],
  "author": "PaulyDev",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/quantu99/test-generator"
  },
  "engines": {
    "node": ">=14.0.0"
  },
  "dependencies": {
    "commander": "^11.1.0",
    "typescript": "^5.3.3"
  },
  "devDependencies": {
    "@types/node": "^20.10.6",
    "@types/jest": "^29.5.11",
    "@typescript-eslint/eslint-plugin": "^6.17.0",
    "@typescript-eslint/parser": "^6.17.0",
    "eslint": "^8.56.0",
    "jest": "^29.7.0",
    "prettier": "^3.1.1",
    "ts-jest": "^29.1.1",
    "ts-node": "^10.9.2"
  },
  "peerDependencies": {
    "@jest/globals": "^29.0.0",
    "vitest": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "@jest/globals": {
      "optional": true
    },
    "vitest": {
      "optional": true
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ]
}

# C:\Users\DELL OS\Desktop\test-gen\tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}