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
        framework: options.framework,
        style: options.style,
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