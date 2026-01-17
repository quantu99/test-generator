# 🧪 Test Generator

> Intelligent test generator for TypeScript/JavaScript - Generate comprehensive test skeletons with smart flow analysis

[![npm version](https://img.shields.io/npm/v/@callmequantu/test-generator.svg)](https://www.npmjs.com/package/@callmequantu/test-generator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🎯 **Smart Test Generation** - Analyzes code flow and generates comprehensive tests
- 🔄 **Multi-Framework Support** - Jest, Vitest, Mocha
- 📊 **Flow Analysis** - Detects conditions, loops, error handling, external calls
- 🎨 **Multiple Styles** - Basic, Strict (AAA pattern), BDD, Smart
- 🔧 **Auto Mock Detection** - Identifies and generates mock setups
- 📝 **Type-Aware** - Full TypeScript support with type resolution
- ⚡ **Fast & Reliable** - Built with TypeScript compiler API

## 📦 Installation
```bash
# Global installation (recommended)
npm install -g test-generator

# Or local installation
npm install --save-dev test-generator
```

## 🚀 Quick Start

### Basic Usage
```bash
# Generate tests for a file
test-gen generate src/utils.ts

# With options
test-gen generate src/calculator.ts -f jest -s strict -o __tests__/calculator.test.ts

# Preview without writing
test-gen generate src/api.ts --dry-run

# Parse file to see what will be tested
test-gen parse src/helpers.ts
```

### Configuration File

Create `.testgenrc.json` in your project root:
```bash
test-gen init
```
```json
{
  "framework": "jest",
  "style": "smart",
  "includeComments": true,
  "generateMocks": true,
  "testEach": false,
  "ignorePatterns": [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/node_modules/**"
  ]
}
```

## 📖 Test Styles

### Basic Style
Simple test structure with essential cases:
- Happy path
- Edge cases
- Error handling

### Strict Style (AAA Pattern)
Follows Arrange-Act-Assert pattern:
- Explicit setup phase
- Clear action phase
- Comprehensive assertions
- Snapshot testing

### BDD Style
Behavior-driven development approach:
- Given-When-Then structure
- Nested describe blocks
- Readable test names

### Smart Style ⭐
AI-powered analysis generates tests based on:
- **Condition branches** - Tests for all if/switch/ternary paths
- **Loop handling** - Empty arrays, single/multiple items
- **Error scenarios** - All throw statements and try-catch blocks
- **External calls** - Mock verification and argument assertions
- **Complexity analysis** - Additional tests for high-complexity functions

## 🎯 Examples

### Input: TypeScript Function
```typescript
export async function calculateDiscount(
  price: number,
  discountCode?: string
): Promise<number> {
  if (price <= 0) {
    throw new Error('Price must be positive');
  }

  if (!discountCode) {
    return price;
  }

  const discounts: Record<string, number> = {
    SAVE10: 0.1,
    SAVE20: 0.2,
    SAVE50: 0.5,
  };

  const discount = discounts[discountCode];
  if (!discount) {
    throw new Error('Invalid discount code');
  }

  return price * (1 - discount);
}
```

### Generated Test (Smart Style)
```typescript
import { calculateDiscount } from './calculator';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('calculateDiscount', () => {
  // Complexity: 4
  // Conditions: 3
  // Error handling: 2

  it('should throw Error when price must be positive (line 5)', async () => {
    // Arrange: Setup invalid input that triggers error
    const price = -10;
    const discountCode = undefined;

    // Act & Assert
    await expect(calculateDiscount(price, discountCode))
      .rejects.toThrow('Price must be positive');
  });

  it('should handle case when !discountCode is true (line 9)', async () => {
    // Arrange: Setup data that makes condition true
    const price = 100;
    const discountCode = undefined;

    // Act
    const result = await calculateDiscount(price, discountCode);

    // Assert
    expect(result).toBe(100);
  });

  it('should throw Error when Invalid discount code (line 21)', async () => {
    // Arrange
    const price = 100;
    const discountCode = 'INVALID';

    // Act & Assert
    await expect(calculateDiscount(price, discountCode))
      .rejects.toThrow('Invalid discount code');
  });

  it('should successfully complete happy path', async () => {
    // Arrange: Setup valid input
    const price = 100;
    const discountCode = 'SAVE20';

    // Act
    const result = await calculateDiscount(price, discountCode);

    // Assert
    expect(result).toBe(80);
    expect(result).toBeGreaterThan(0);
  });
});
```

## 📚 API

### CLI Commands
```bash
# Generate tests
test-gen generate <file> [options]
test-gen gen <file> [options]  # alias

# Parse file
test-gen parse <file> [options]

# Initialize config
test-gen init [options]
```

### Generate Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --framework` | Test framework (jest/vitest/mocha) | `jest` |
| `-s, --style` | Test style (basic/strict/bdd/smart) | `basic` |
| `-o, --out` | Output file path | `<filename>.test.ts` |
| `--no-comments` | Disable test flow comments | `false` |
| `--dry-run` | Preview without writing | `false` |
| `--mocks` | Auto-generate mocks | `false` |
| `--test-each` | Generate parameterized tests | `false` |

### Parse Options

| Option | Description |
|--------|-------------|
| `-j, --json` | Output as JSON |
| `-v, --verbose` | Show detailed information |

## 🏗️ Supported Constructs

- ✅ Function declarations
- ✅ Arrow functions
- ✅ Class methods (instance & static)
- ✅ Getters & setters
- ✅ Async/await functions
- ✅ Destructured parameters
- ✅ Rest parameters
- ✅ Optional parameters
- ✅ Default parameters
- ✅ Generic types
- ✅ Union & intersection types
- ✅ Tuple types
- ✅ Literal types

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © PaulyDev

## 🐛 Issues

Report issues at: https://github.com/quantu99/test-generator/issues

## 💡 Tips

1. **Use Smart Style** for complex business logic
2. **Configure .testgenrc.json** for consistent team standards
3. **Review generated tests** and add custom assertions
4. **Enable --mocks** for files with external dependencies
5. **Use --dry-run** to preview before committing

## 🔗 Links

- [npm Package](https://www.npmjs.com/package/test-generator)
- [GitHub Repository](https://github.com/quantu99/test-generator)
- [Report Bugs](https://github.com/quantu99/test-generator/issues)

---

Made with ❤️ by PaulyDevs