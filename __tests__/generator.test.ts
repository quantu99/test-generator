import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { generateTest, generateFunctionCall, generateMockValueForType } from '../src/generator';
import { createTempFile, cleanupTempFile } from './test-utils';
import { FunctionInfo, TypeInfo } from '../src/types';

describe('generator', () => {
  let tempFile: string;

  afterEach(() => {
    if (tempFile) {
      cleanupTempFile(tempFile);
    }
  });

  describe('generateTest', () => {
    it('should generate basic test structure', () => {
      const code = `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;
      tempFile = createTempFile(code);
      const testCode = generateTest(tempFile, {
        framework: 'jest',
        style: 'basic',
        includeComments: true,
      });

      expect(testCode).toContain('describe');
      expect(testCode).toContain('it');
      expect(testCode).toContain('add');
      expect(testCode).toContain('import');
    });

    it('should generate strict test structure', () => {
      const code = `
        export function multiply(a: number, b: number): number {
          return a * b;
        }
      `;
      tempFile = createTempFile(code);
      const testCode = generateTest(tempFile, {
        framework: 'jest',
        style: 'strict',
        includeComments: true,
      });

      expect(testCode).toContain('toMatchSnapshot');
      expect(testCode).toContain('toEqual');
    });

    it('should generate BDD test structure', () => {
      const code = `
        export function divide(a: number, b: number): number {
          return a / b;
        }
      `;
      tempFile = createTempFile(code);
      const testCode = generateTest(tempFile, {
        framework: 'jest',
        style: 'bdd',
        includeComments: true,
      });

      expect(testCode).toContain('GIVEN');
      expect(testCode).toContain('WHEN');
      expect(testCode).toContain('THEN');
    });

    it('should generate tests without comments when disabled', () => {
      const code = `
        export function test(): void {}
      `;
      tempFile = createTempFile(code);
      const testCode = generateTest(tempFile, {
        framework: 'jest',
        style: 'basic',
        includeComments: false,
      });

      expect(testCode).not.toContain('// Arrange');
      expect(testCode).not.toContain('// Act');
      expect(testCode).not.toContain('// Assert');
    });

    it('should generate vitest imports', () => {
      const code = `
        export function test(): void {}
      `;
      tempFile = createTempFile(code);
      const testCode = generateTest(tempFile, {
        framework: 'vitest',
        style: 'basic',
        includeComments: true,
      });

      expect(testCode).toContain("from 'vitest'");
      expect(testCode).toContain('vi');
    });

    it('should handle async functions', () => {
      const code = `
        export async function fetchData(): Promise<string> {
          return 'data';
        }
      `;
      tempFile = createTempFile(code);
      const testCode = generateTest(tempFile, {
        framework: 'jest',
        style: 'basic',
        includeComments: true,
      });

      expect(testCode).toContain('async');
      expect(testCode).toContain('await');
    });

    it('should generate tests for union types', () => {
      const code = `
        export function process(value: string | number): string {
          return String(value);
        }
      `;
      tempFile = createTempFile(code);
      const testCode = generateTest(tempFile, {
        framework: 'jest',
        style: 'strict',
        includeComments: true,
      });

      expect(testCode).toContain('union type');
    });

    it('should handle optional parameters', () => {
      const code = `
        export function greet(name: string, title?: string): string {
          return title ? \`\${title} \${name}\` : name;
        }
      `;
      tempFile = createTempFile(code);
      const testCode = generateTest(tempFile, {
        framework: 'jest',
        style: 'strict',
        includeComments: true,
      });

      expect(testCode).toContain('optional parameters');
    });
  });

  describe('generateFunctionCall', () => {
    it('should generate call for regular function', () => {
      const func: FunctionInfo = {
        name: 'add',
        params: [],
        returnType: { raw: 'number', isUnion: false, isGeneric: false, isIntersection: false, baseType: 'number' },
        isAsync: false,
        isExported: true,
        isDefaultExport: false,
        kind: 'function',
      };

      const call = generateFunctionCall(func, '1, 2', '');
      expect(call).toBe('add(1, 2)');
    });

    it('should generate call for async function', () => {
      const func: FunctionInfo = {
        name: 'fetchData',
        params: [],
        returnType: { raw: 'Promise<string>', isUnion: false, isGeneric: false, isIntersection: false, baseType: 'Promise' },
        isAsync: true,
        isExported: true,
        isDefaultExport: false,
        kind: 'function',
      };

      const call = generateFunctionCall(func, '', 'await ');
      expect(call).toBe('await fetchData()');
    });

    it('should generate call for class method', () => {
      const func: FunctionInfo = {
        name: 'calculate',
        params: [],
        returnType: { raw: 'number', isUnion: false, isGeneric: false, isIntersection: false, baseType: 'number' },
        isAsync: false,
        isExported: true,
        isDefaultExport: false,
        kind: 'method',
        className: 'Calculator',
      };

      const call = generateFunctionCall(func, '1, 2', '');
      expect(call).toContain('new Calculator()');
      expect(call).toContain('.calculate');
    });

    it('should generate call for static method', () => {
      const func: FunctionInfo = {
        name: 'multiply',
        params: [],
        returnType: { raw: 'number', isUnion: false, isGeneric: false, isIntersection: false, baseType: 'number' },
        isAsync: false,
        isExported: true,
        isDefaultExport: false,
        kind: 'static',
        className: 'Calculator',
      };

      const call = generateFunctionCall(func, '2, 3', '');
      expect(call).toBe('Calculator.multiply(2, 3)');
    });
  });

  describe('generateMockValueForType', () => {
    it('should generate mock for string type', () => {
      const type: TypeInfo = {
        raw: 'string',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'string',
      };

      const mock = generateMockValueForType(type);
      expect(mock).toBe("'test-string'");
    });

    it('should generate mock for number type', () => {
      const type: TypeInfo = {
        raw: 'number',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'number',
      };

      const mock = generateMockValueForType(type);
      expect(mock).toBe('42');
    });

    it('should generate mock for boolean type', () => {
      const type: TypeInfo = {
        raw: 'boolean',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'boolean',
      };

      const mock = generateMockValueForType(type);
      expect(mock).toBe('true');
    });

    it('should generate mock for array type', () => {
      const type: TypeInfo = {
        raw: 'Array<number>',
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        baseType: 'Array',
        genericTypes: ['number'],
      };

      const mock = generateMockValueForType(type);
      expect(mock).toBe('[]');
    });

    it('should generate mock for Promise type', () => {
      const type: TypeInfo = {
        raw: 'Promise<string>',
        isUnion: false,
        isGeneric: true,
        isIntersection: false,
        baseType: 'Promise',
        genericTypes: ['string'],
      };

      const mock = generateMockValueForType(type);
      expect(mock).toContain('Promise.resolve');
    });

    it('should generate mock for union type', () => {
      const type: TypeInfo = {
        raw: 'string | number',
        isUnion: true,
        isGeneric: false,
        isIntersection: false,
        baseType: 'string',
        unionTypes: ['string', 'number'],
      };

      const mock = generateMockValueForType(type);
      expect(mock).toBe("'test-string'"); // Should pick first type
    });

    it('should generate mock for void type', () => {
      const type: TypeInfo = {
        raw: 'void',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'void',
      };

      const mock = generateMockValueForType(type);
      expect(mock).toBe('undefined');
    });

    it('should generate mock for never type', () => {
      const type: TypeInfo = {
        raw: 'never',
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'never',
        isNever: true,
      };

      const mock = generateMockValueForType(type);
      expect(mock).toBe('undefined');
    });

    it('should generate mock for literal type', () => {
      const type: TypeInfo = {
        raw: "'active'",
        isUnion: false,
        isGeneric: false,
        isIntersection: false,
        baseType: 'string',
        isLiteral: true,
        literalValue: 'active',
      };

      const mock = generateMockValueForType(type);
      expect(mock).toBe("'active'");
    });
  });
});
