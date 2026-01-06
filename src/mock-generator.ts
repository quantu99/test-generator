import * as ts from 'typescript';
import * as fs from 'fs';
import { FunctionInfo, MockInfo, TypeInfo } from './types';
import { generateMockValueForType } from './generator';

export function detectMocks(sourceCode: string, func: FunctionInfo): MockInfo[] {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const mocks: MockInfo[] = [];
  const visitedCalls = new Set<string>();

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

  function analyzeNode(node: ts.Node) {
    // Find import statements
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
      
      if (node.importClause) {
        // Named imports
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach(element => {
              const importedName = element.name?.getText() || '';
              const localName = element.propertyName?.getText() || importedName;
              
              if (!visitedCalls.has(`${moduleSpecifier}:${localName}`)) {
                mocks.push({
                  moduleName: moduleSpecifier,
                  functionName: localName,
                  isDefault: false,
                  mockType: 'function',
                });
                visitedCalls.add(`${moduleSpecifier}:${localName}`);
              }
            });
          }
        }
        
        // Default import
        if (node.importClause.name) {
          const defaultName = node.importClause.name.getText();
          if (!visitedCalls.has(`${moduleSpecifier}:default`)) {
            mocks.push({
              moduleName: moduleSpecifier,
              functionName: defaultName,
              isDefault: true,
              mockType: 'function',
            });
            visitedCalls.add(`${moduleSpecifier}:default`);
          }
        }
      }
    }

    // Find function calls that might need mocking
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      
      if (ts.isIdentifier(expression)) {
        const functionName = expression.getText();
        
        // Skip built-ins and local variables
        const builtins = ['console', 'Math', 'Date', 'JSON', 'Object', 'Array', 'Promise', 'setTimeout', 'setInterval'];
        if (!builtins.some(b => functionName.startsWith(b))) {
          // Check if it's imported (would need more sophisticated analysis)
          // For now, we'll add it as a potential mock
          if (!visitedCalls.has(`local:${functionName}`)) {
            mocks.push({
              moduleName: 'local',
              functionName,
              isDefault: false,
              mockType: 'function',
            });
            visitedCalls.add(`local:${functionName}`);
          }
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        const objectName = expression.expression.getText();
        const methodName = expression.name.getText();
        
        // Check if it's a module import (e.g., fs.readFile)
        if (!visitedCalls.has(`${objectName}:${methodName}`)) {
          mocks.push({
            moduleName: objectName,
            functionName: methodName,
            isDefault: false,
            mockType: 'function',
          });
          visitedCalls.add(`${objectName}:${methodName}`);
        }
      }
    }

    ts.forEachChild(node, analyzeNode);
  }

  const functionBody = findFunctionBody(sourceFile);
  if (functionBody) {
    analyzeNode(functionBody);
  }

  return mocks;
}

export function generateMockSetup(mocks: MockInfo[], framework: 'jest' | 'vitest' | 'mocha'): string {
  if (mocks.length === 0) {
    return '';
  }

  let setup = '';
  const mockFn = framework === 'vitest' ? 'vi.fn()' : 'jest.fn()';
  const mockModule = framework === 'vitest' ? 'vi.mock' : 'jest.mock';
  const mockSpy = framework === 'vitest' ? 'vi.spyOn' : 'jest.spyOn';

  // Group mocks by module
  const mocksByModule = new Map<string, MockInfo[]>();
  mocks.forEach(mock => {
    if (!mocksByModule.has(mock.moduleName)) {
      mocksByModule.set(mock.moduleName, []);
    }
    mocksByModule.get(mock.moduleName)!.push(mock);
  });

  // Generate module mocks
  mocksByModule.forEach((moduleMocks, moduleName) => {
    if (moduleName === 'local') {
      // Local mocks go in beforeEach
      return;
    }

    setup += `\n// Mock ${moduleName}\n`;
    setup += `${mockModule}('${moduleName}', () => ({\n`;
    
    moduleMocks.forEach(mock => {
      if (mock.isDefault) {
        setup += `  __esModule: true,\n`;
        setup += `  default: ${mockFn},\n`;
      } else {
        setup += `  ${mock.functionName}: ${mockFn},\n`;
      }
    });
    
    setup += `}));\n`;
  });

  // Generate beforeEach setup for local mocks
  const localMocks = mocks.filter(m => m.moduleName === 'local');
  if (localMocks.length > 0) {
    setup += `\nbeforeEach(() => {\n`;
    localMocks.forEach(mock => {
      setup += `  // Mock ${mock.functionName}\n`;
      setup += `  // ${mock.functionName} = ${mockFn};\n`;
    });
    setup += `});\n`;
  }

  return setup;
}

export function generateMockImports(mocks: MockInfo[], framework: 'jest' | 'vitest' | 'mocha'): string {
  if (mocks.length === 0) {
    return '';
  }

  const imports = new Set<string>();
  
  mocks.forEach(mock => {
    if (mock.moduleName !== 'local' && !mock.moduleName.startsWith('.')) {
      // External module - might need to import for type checking
      // For now, we'll just note it in comments
    }
  });

  if (imports.size > 0) {
    return Array.from(imports).join('\n') + '\n';
  }

  return '';
}
