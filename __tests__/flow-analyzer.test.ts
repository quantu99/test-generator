import { describe, it, expect } from '@jest/globals';
import { analyzeBusinessFlow } from '../src/flow-analyzer';

describe('flow-analyzer', () => {
  describe('analyzeBusinessFlow', () => {
    it('should detect if statements', () => {
      const code = `
        function test(value: number): string {
          if (value > 0) {
            return 'positive';
          }
          return 'negative';
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'test');
      expect(analysis.conditions.length).toBeGreaterThan(0);
      expect(analysis.conditions[0].type).toBe('if');
      expect(analysis.complexity).toBeGreaterThan(1);
    });

    it('should detect switch statements', () => {
      const code = `
        function getStatus(code: number): string {
          switch (code) {
            case 200:
              return 'ok';
            case 404:
              return 'not found';
            default:
              return 'unknown';
          }
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'getStatus');
      const switchCondition = analysis.conditions.find(c => c.type === 'switch');
      expect(switchCondition).toBeDefined();
    });

    it('should detect ternary operators', () => {
      const code = `
        function getValue(flag: boolean): string {
          return flag ? 'yes' : 'no';
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'getValue');
      const ternary = analysis.conditions.find(c => c.type === 'ternary');
      expect(ternary).toBeDefined();
    });

    it('should detect loops', () => {
      const code = `
        function sum(numbers: number[]): number {
          let total = 0;
          for (const num of numbers) {
            total += num;
          }
          return total;
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'sum');
      expect(analysis.loops.length).toBeGreaterThan(0);
    });

    it('should detect array methods', () => {
      const code = `
        function processItems(items: string[]): string[] {
          return items.map(item => item.toUpperCase());
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'processItems');
      const mapLoop = analysis.loops.find(l => l.type === 'map');
      expect(mapLoop).toBeDefined();
    });

    it('should detect throw statements', () => {
      const code = `
        function validate(value: number): void {
          if (value < 0) {
            throw new Error('Value must be positive');
          }
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'validate');
      expect(analysis.errorHandling.length).toBeGreaterThan(0);
      expect(analysis.errorHandling[0].type).toBe('throw');
      expect(analysis.errorHandling[0].errorType).toBe('Error');
    });

    it('should detect try-catch blocks', () => {
      const code = `
        function safeOperation(): string {
          try {
            return riskyOperation();
          } catch (error) {
            return 'error';
          }
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'safeOperation');
      const tryCatch = analysis.errorHandling.find(e => e.type === 'try-catch');
      expect(tryCatch).toBeDefined();
    });

    it('should detect external function calls', () => {
      const code = `
        function fetchUser(id: string): Promise<User> {
          return api.getUser(id);
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'fetchUser');
      expect(analysis.externalCalls.length).toBeGreaterThan(0);
    });

    it('should detect return statements', () => {
      const code = `
        function getValue(flag: boolean): string {
          if (flag) {
            return 'yes';
          }
          return 'no';
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'getValue');
      expect(analysis.returnStatements.length).toBeGreaterThan(0);
    });

    it('should calculate complexity correctly', () => {
      const code = `
        function complex(value: number): string {
          if (value > 0) {
            if (value > 10) {
              return 'large';
            }
            return 'small';
          }
          return 'negative';
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'complex');
      expect(analysis.complexity).toBeGreaterThan(2);
    });

    it('should handle empty functions', () => {
      const code = `
        function empty(): void {
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'empty');
      expect(analysis.complexity).toBe(1);
      expect(analysis.conditions.length).toBe(0);
      expect(analysis.loops.length).toBe(0);
    });

    it('should handle functions with no conditions', () => {
      const code = `
        function simple(value: number): number {
          return value * 2;
        }
      `;

      const analysis = analyzeBusinessFlow(code, 'simple');
      expect(analysis.conditions.length).toBe(0);
      expect(analysis.returnStatements.length).toBe(1);
    });
  });
});
