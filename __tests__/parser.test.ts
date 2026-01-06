import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { parseFile } from '../src/parser';
import { createTempFile, cleanupTempFile } from './test-utils';

describe('parser', () => {
  let tempFile: string;

  afterEach(() => {
    if (tempFile) {
      cleanupTempFile(tempFile);
    }
  });

  describe('parseFile', () => {
    it('should parse function declarations', () => {
      const code = `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('add');
      expect(functions[0].kind).toBe('function');
      expect(functions[0].isExported).toBe(true);
      expect(functions[0].params).toHaveLength(2);
      expect(functions[0].params[0].name).toBe('a');
      expect(functions[0].params[0].type.baseType).toBe('number');
    });

    it('should parse arrow functions', () => {
      const code = `
        export const multiply = (a: number, b: number): number => {
          return a * b;
        };
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('multiply');
      expect(functions[0].kind).toBe('arrow');
      expect(functions[0].isExported).toBe(true);
    });

    it('should parse async functions', () => {
      const code = `
        export async function fetchData(url: string): Promise<string> {
          return fetch(url).then(r => r.text());
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].isAsync).toBe(true);
      expect(functions[0].returnType.baseType.toLowerCase()).toContain('promise');
    });

    it('should parse class methods', () => {
      const code = `
        export class Calculator {
          public add(a: number, b: number): number {
            return a + b;
          }
          private subtract(a: number, b: number): number {
            return a - b;
          }
          static multiply(a: number, b: number): number {
            return a * b;
          }
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions.length).toBeGreaterThanOrEqual(3);
      const addMethod = functions.find(f => f.name === 'add');
      expect(addMethod).toBeDefined();
      expect(addMethod?.accessModifier).toBe('public');
      expect(addMethod?.className).toBe('Calculator');

      const subtractMethod = functions.find(f => f.name === 'subtract');
      expect(subtractMethod?.accessModifier).toBe('private');

      const multiplyMethod = functions.find(f => f.name === 'multiply');
      expect(multiplyMethod?.kind).toBe('static');
      expect(multiplyMethod?.isStatic).toBe(true);
    });

    it('should parse getters and setters', () => {
      const code = `
        class User {
          private _name: string = '';
          get name(): string {
            return this._name;
          }
          set name(value: string) {
            this._name = value;
          }
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      const getter = functions.find(f => f.name === 'name' && f.kind === 'getter');
      const setter = functions.find(f => f.name === 'name' && f.kind === 'setter');
      
      expect(getter).toBeDefined();
      expect(setter).toBeDefined();
      expect(getter?.params).toHaveLength(0);
      expect(setter?.params).toHaveLength(1);
    });

    it('should parse destructured parameters', () => {
      const code = `
        export function processUser({ name, age }: { name: string; age: number }): void {
          console.log(name, age);
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].params[0].isDestructured).toBe(true);
      expect(functions[0].params[0].destructuredProps).toContain('name');
      expect(functions[0].params[0].destructuredProps).toContain('age');
    });

    it('should parse optional parameters', () => {
      const code = `
        export function greet(name: string, title?: string): string {
          return title ? \`\${title} \${name}\` : name;
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].params[1].optional).toBe(true);
    });

    it('should parse parameters with default values', () => {
      const code = `
        export function greet(name: string = 'Guest'): string {
          return \`Hello, \${name}\`;
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].params[0].defaultValue).toBeDefined();
    });

    it('should parse rest parameters', () => {
      const code = `
        export function sum(...numbers: number[]): number {
          return numbers.reduce((a, b) => a + b, 0);
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].params[0].isRest).toBe(true);
    });

    it('should parse union types', () => {
      const code = `
        export function process(value: string | number): string {
          return String(value);
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].params[0].type.isUnion).toBe(true);
      expect(functions[0].params[0].type.unionTypes).toContain('string');
      expect(functions[0].params[0].type.unionTypes).toContain('number');
    });

    it('should parse generic types', () => {
      const code = `
        export function identity<T>(value: T): T {
          return value;
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      // Generic parsing might need type resolver
    });

    it('should handle empty files', () => {
      tempFile = createTempFile('');
      const functions = parseFile(tempFile);
      expect(functions).toHaveLength(0);
    });

    it('should handle files with only comments', () => {
      const code = `
        // This is a comment
        /* Another comment */
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);
      expect(functions).toHaveLength(0);
    });

    it('should parse default exports', () => {
      const code = `
        export default function main(): void {
          console.log('main');
        }
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions).toHaveLength(1);
      expect(functions[0].isDefaultExport).toBe(true);
    });

    it('should handle object methods', () => {
      const code = `
        export const utils = {
          add(a: number, b: number): number {
            return a + b;
          }
        };
      `;
      tempFile = createTempFile(code);
      const functions = parseFile(tempFile);

      expect(functions.length).toBeGreaterThan(0);
      const addMethod = functions.find(f => f.name.includes('add'));
      expect(addMethod).toBeDefined();
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        parseFile('/non/existent/file.ts');
      }).toThrow();
    });
  });
});
