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