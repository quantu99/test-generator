# test-gen

> **Generate test skeletons & test flows for faster test coverage**

Stop writing repetitive test boilerplate. Generate structured test scaffolds with proper test flows, then fill in your business logic.

[![npm version](https://badge.fury.io/js/test-gen.svg)](https://www.npmjs.com/package/test-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why test-gen?

❌ **Problem:** Writing test boilerplate is repetitive and time-consuming
- Setting up describe/it blocks
- Writing Arrange-Act-Assert structure  
- Handling async/await correctly
- Documenting test flows

✅ **Solution:** Auto-generate test scaffolds with proper structure
- Parses your source code (functions, methods, arrow functions)
- Generates complete test suites with flow comments
- Multiple testing styles (basic, strict, BDD)
- You focus on writing assertions, not boilerplate

## What this is NOT

This is **not** an AI tool that writes your tests for you. This is a **scaffold generator** that:
- Creates structured test files
- Sets up proper test flow patterns
- Handles TypeScript types correctly
- Saves you from repetitive typing

You still write the actual test logic and assertions.

## Features

### 🎯 Comprehensive Parsing

Supports all JavaScript/TypeScript function patterns:

```typescript
// ✅ Function declarations
export function add(a: number, b: number): number {}

// ✅ Arrow functions
export const multiply = (a: number, b: number): number => {}

// ✅ Function expressions
export const divide = function(a: number, b: number): number {}

// ✅ Class methods (public/private/protected)
class Calculator {
  private calculate(a: number): number {}
}

// ✅ Default exports
export default function subtract() {}

// ✅ Destructured parameters
function process({ name, age }: User): void {}

// ✅ Union types & Generics
function fetch<T>(url: string): Promise<T | null> {}
```

### 🎨 Multiple Test Styles

**Basic** - Quick scaffolding:
```typescript
it('should execute successfully with valid inputs', () => {
  // Arrange
  const a = 42;
  const b = 42;
  
  // Act
  const result = add(a, b);
  
  // Assert
  expect(result).toBeDefined();
  // TODO: Add specific assertions
});
```

**Strict** - Type-aware with snapshots:
```typescript
it('should return correct value with valid inputs', () => {
  // Arrange
  const a = 42;
  const b = 42;
  const expected = 42;
  
  // Act
  const result = add(a, b);
  
  // Assert
  expect(result).toEqual(expected);
  expect(result).toMatchSnapshot();
});
```

**BDD** - Behavior-driven style:
```typescript
describe('GIVEN valid inputs', () => {
  it('WHEN function is called THEN it should return expected result', () => {
    // GIVEN: Setup test data
    const a = 42;
    const b = 42;
    
    // WHEN
    const result = add(a, b);
    
    // THEN
    expect(result).toBeDefined();
  });
});
```

### 🔧 Smart Type Handling

Automatically generates appropriate mock values:

```typescript
// Primitives
string → 'test-string'
number → 42
boolean → true

// Complex types
Array<T> → []
Promise<T> → Promise.resolve(...)
Date → new Date()

// Union types
string | number → 'test-string' (picks first)

// Generics
Promise<User> → Promise.resolve({})
```

### 📦 Multiple Framework Support

- Jest
- Vitest
- Mocha

## Installation

```bash
# Global installation
npm install -g test-gen

# Project installation
npm install --save-dev test-gen
```

## Usage

### CLI Commands

#### Generate Tests

```bash
# Basic usage
test-gen gen src/calculator.ts

# Specify framework
test-gen gen src/api.ts -f vitest

# Choose test style
test-gen gen src/utils.ts -s strict

# Custom output path
test-gen gen src/helpers.ts -o tests/helpers.test.ts

# Preview without writing
test-gen gen src/service.ts --dry-run

# Disable comments
test-gen gen src/parser.ts --no-comments
```

#### Parse & Inspect

View parsed function information before generating:

```bash
# Human-readable format
test-gen parse src/calculator.ts

# JSON output (great for tooling)
test-gen parse src/calculator.ts --json
```

Example output:
```
📊 Found 3 functions:

1. add
   Type: arrow
   Exported: true
   Async: false
   Params: 2

2. fetchUser
   Type: function
   Exported: true
   Async: true
   Params: 1

3. Calculator.calculate
   Type: method
   Exported: true
   Async: false
   Params: 1
```

### NPM Scripts Integration

Add to your `package.json`:

```json
{
  "scripts": {
    "test:gen": "test-gen gen",
    "test:gen:all": "find src -name '*.ts' -not -name '*.test.ts' -exec test-gen gen {} \\;",
    "test:gen:strict": "test-gen gen src/**/*.ts -s strict"
  }
}
```

Then run:
```bash
npm run test:gen src/calculator.ts
npm run test:gen:all
```

### Programmatic Usage

```typescript
import { generateTest, parseFile } from 'test-gen';

// Generate test code
const testCode = generateTest('src/calculator.ts', {
  framework: 'jest',
  style: 'strict',
  includeComments: true,
});

// Parse file to get function info (useful for IDE plugins)
const functions = parseFile('src/calculator.ts');
console.log(functions);
// [
//   {
//     name: 'add',
//     kind: 'arrow',
//     params: [...],
//     returnType: { raw: 'number', isUnion: false, ... }
//   }
// ]
```

## Example

**Input** (`calculator.ts`):

```typescript
export const add = (a: number, b: number): number => {
  return a + b;
};

export async function fetchUser(id: string): Promise<User | null> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) return null;
  return response.json();
}

export class Calculator {
  private calculate(value: number): number {
    return value * 2;
  }
}
```

**Output** (`calculator.test.ts`):

```typescript
import { add, fetchUser, Calculator } from './calculator';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('add', () => {
  // Function type: arrow
  // Parameters: a: number, b: number
  // Returns: number

  beforeEach(() => {
    // Setup test dependencies and mocks
  });

  afterEach(() => {
    // Clean up
  });

  it('should return correct value with valid inputs', () => {
    // Arrange
    const a = 42;
    const b = 42;
    const expected = 42;

    // Act
    const result = add(a, b);

    // Assert
    expect(result).toEqual(expected);
    expect(result).toMatchSnapshot();
  });

  it('should handle edge cases', () => {
    // TODO: Test boundary values, empty inputs, etc.
  });

  it('should handle invalid inputs', () => {
    // TODO: Test error cases
  });

});

describe('fetchUser', () => {
  // Function type: function
  // Parameters: id: string
  // Returns: Promise<User | null>

  beforeEach(() => {
    // Setup test dependencies and mocks
  });

  afterEach(() => {
    // Clean up
  });

  it('should return correct value with valid inputs', async () => {
    // Arrange
    const id = 'test-string';
    const expected = Promise.resolve({});

    // Act
    const result = await fetchUser(id);

    // Assert
    expect(result).toEqual(expected);
    expect(result).toMatchSnapshot();
  });

  it('should handle all union type cases', async () => {
    // Test each type in union: User | null
  });

});

describe('Calculator.calculate', () => {
  // Function type: method
  // Access: private
  // Parameters: value: number
  // Returns: number

  beforeEach(() => {
    // Setup test dependencies and mocks
  });

  afterEach(() => {
    // Clean up
  });

  it('should return correct value with valid inputs', () => {
    // Arrange
    const value = 42;
    const expected = 42;

    // Act
    const result = calculate(value);

    // Assert
    expect(result).toEqual(expected);
    expect(result).toMatchSnapshot();
  });

});
```

## Configuration

Create `.testgenrc.json` in your project root:

```json
{
  "framework": "jest",
  "style": "strict",
  "includeComments": true,
  "outputPattern": "{name}.test{ext}"
}
```

## Use Cases

### 1. New Projects
Generate test scaffolds as you write code:
```bash
test-gen gen src/newFeature.ts -s strict
```

### 2. Legacy Projects
Add test coverage to existing code:
```bash
find src -name '*.ts' -not -name '*.test.ts' | xargs -I {} test-gen gen {}
```

### 3. IDE Integration
Use `parseFile()` API to build IDE plugins:
```typescript
import { parseFile } from 'test-gen';

// Get function metadata for autocomplete, navigation, etc.
const functions = parseFile(currentFile);
```

### 4. CI/CD
Check test coverage gaps:
```bash
test-gen parse src/**/*.ts --json | jq '.[] | select(.tested == false)'
```

## Roadmap

- [ ] React component testing support
- [ ] Mock generation for dependencies
- [ ] Integration with coverage tools
- [ ] VSCode extension
- [ ] Custom templates
- [ ] Watch mode

## Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

```bash
git clone https://github.com/yourusername/test-gen.git
cd test-gen
npm install
npm run build
npm test
```

## License

MIT © [Your Name]

## Credits

Built with:
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript)
- [Commander.js](https://github.com/tj/commander.js)

---

**Not using test-gen yet?** Try it on your project:
```bash
npx test-gen gen src/yourFile.ts --dry-run
```

See the generated scaffold before committing! 🚀