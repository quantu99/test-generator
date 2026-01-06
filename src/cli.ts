// src/cli.ts - Enhanced CLI
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { generateTest } from './generator';
import { generateTestWithFlow } from './smart-generator';
import { parseFile } from './parser';
import { TestConfig } from './types';
import { loadConfig, mergeConfigs } from './config-loader';

const program = new Command();

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
  .action((file, options) => {
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
        console.error(`❌ Unsupported file type: ${ext}. Supported: .ts, .tsx, .js, .jsx`);
        process.exit(1);
      }

      // Load config from file
      const projectConfig = loadConfig();
      
      // Merge with CLI options
      const config: TestConfig = mergeConfigs(projectConfig, {
        framework: options.framework as any,
        style: options.style as any,
        includeComments: options.comments,
        outputPath: options.out,
        generateMocks: options.mocks,
        testEach: options.testEach,
      });

      // Validate style
      if (!['basic', 'strict', 'bdd', 'smart'].includes(config.style)) {
        console.error(`❌ Invalid style: ${config.style}. Valid: basic, strict, bdd, smart`);
        process.exit(1);
      }

      // Validate framework
      if (!['jest', 'vitest', 'mocha'].includes(config.framework)) {
        console.error(`❌ Invalid framework: ${config.framework}. Valid: jest, vitest, mocha`);
        process.exit(1);
      }

      let testCode = '';
      
      // Use smart generator for 'smart' style
      if (config.style === 'smart') {
        const functions = parseFile(filePath);
        functions.forEach(func => {
          testCode += generateTestWithFlow(filePath, func, config);
        });
      } else {
        testCode = generateTest(filePath, config);
      }

      if (options.dryRun) {
        console.log('📄 Preview:\n');
        console.log(testCode);
        return;
      }

      const outputPath = options.out || getDefaultOutputPath(filePath);
      
      // Create directory if it doesn't exist
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, testCode);
      
      console.log('✅ Test file generated successfully!');
      console.log(`📁 Location: ${outputPath}`);
      console.log(`📊 Style: ${config.style}`);
      console.log(`🧪 Framework: ${config.framework}`);
      if (config.generateMocks) {
        console.log(`🔧 Mocks: Enabled`);
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message || error);
      if (error.stack && process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('parse')
  .argument('<file>', 'Source file to parse')
  .option('-j, --json', 'Output as JSON')
  .description('Parse file and show function information')
  .action((file, options) => {
    try {
      const filePath = path.resolve(file);
      
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
      }

      const functions = parseFile(filePath);
      
      if (options.json) {
        console.log(JSON.stringify(functions, null, 2));
      } else {
        console.log(`\n📊 Found ${functions.length} functions:\n`);
        functions.forEach((func, i) => {
          console.log(`${i + 1}. ${func.name}`);
          console.log(`   Type: ${func.kind}`);
          console.log(`   Exported: ${func.isExported}`);
          console.log(`   Async: ${func.isAsync}`);
          console.log(`   Params: ${func.params.length}`);
          if (func.className) {
            console.log(`   Class: ${func.className}`);
          }
          if (func.accessModifier) {
            console.log(`   Access: ${func.accessModifier}`);
          }
          if (func.isStatic) {
            console.log(`   Static: true`);
          }
          console.log('');
        });
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message || error);
      if (error.stack && process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

function getDefaultOutputPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  return path.join(dir, `${baseName}.test${ext}`);
}

program.parse();