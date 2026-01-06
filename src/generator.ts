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