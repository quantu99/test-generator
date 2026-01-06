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