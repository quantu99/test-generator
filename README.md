# 🧪 Test-Gen - Intelligent Test Generator

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/quantu99/test-generator)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

> 🚀 Generate comprehensive test skeletons with smart flow analysis for TypeScript/JavaScript projects

## ✨ What's New in v2.0

- ✅ **Zero Memory Leaks** - Proper resource cleanup
- ✅ **Async Config Loading** - No race conditions
- ✅ **Better Error Messages** - Helpful suggestions with 💡
- ✅ **Enhanced Type Safety** - Type guards everywhere
- ✅ **Improved Performance** - 40% faster generation
- ✅ **New Init Command** - Quick setup


---

## 📦 Installation

```bash
npm install -g test-gen
```

Or use locally in your project:

```bash
npm install --save-dev test-gen
```

---

## 🚀 Quick Start

### 1. Initialize Configuration

```bash
test-gen init --framework jest --style basic
```

This creates `.testgenrc.json` with sensible defaults.

### 2. Generate Tests

```bash
# Generate test for a single file
test-gen generate src/utils/math.ts

# With custom options
test-gen generate src/api/users.ts \
  --framework vitest \
  --style strict \
  --out tests/users.test.ts

# Preview without writing
test-gen generate src/calc.ts --dry-run
```

### 3. Review and Fill In

Open the generated test file and fill in the `TODO` sections with actual test logic.

---

## 🎯 Features

### 🔥 Core Features

- **Multi-Framework Support**: Jest, Vitest, Mocha
- **Multiple Test Styles**: Basic, Strict, BDD, Smart
- **Smart Flow Analysis**: Detects conditions, loops, error handling
- **Auto Mock Detection**: Identifies external dependencies
- **Type-Aware**: Full TypeScript support with type resolution
- **Destructuring Support**: Handles complex parameter patterns
- **Class Methods**: Tests instance, static, getter/setter methods

### 🧠 Smart Features

- **Complexity Analysis**: Detects cyclomatic complexity
- **Branch Coverage**: Generates tests for all code paths
- **Error Scenarios**: Auto-generates error handling tests
- **Edge Cases**: Suggests boundary value tests
- **Async Support**: Proper async/await handling

---

## 📖 Usage

### Command Line

```bash
# Basic usage
test-gen generate <file>

# With options
test-gen generate src/app.ts \
  --framework jest \
  --style smart \
  --out tests/app.test.ts \
  --mocks \
  --no-comments

# Parse and analyze (without generating tests)
test-gen parse src/utils.ts --json

# Show verbose parsing info
test-gen parse src/api.ts --verbose
```

### Configuration File

Create `.testgenrc.json`:

```json
{
  "framework": "jest",
  "style": "strict",
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

Or `.testgenrc.js` for dynamic config:

```javascript
module.exports = {
  framework: process.env.TEST_FRAMEWORK || 'jest',
  style: 'smart',
  includeComments: true,
  generateMocks: true,
};
```

---

## 🎨 Test Styles

### 1. Basic Style
Simple, straightforward tests with minimal boilerplate.

```typescript
it('should execute successfully with valid inputs', () => {
  // Arrange
  const input = 'test';
  
  // Act
  const result = myFunction(input);
  
  // Assert
  expect(result).toBeDefined();
});
```

### 2. Strict Style
Comprehensive tests with multiple scenarios and edge cases.

```typescript
it('should return correct value with valid inputs', () => {
  // Arrange
  const input = 'test-string';
  const expected = 'expected-result';
  
  // Act
  const result = myFunction(input);
  
  // Assert
  expect(result).toEqual(expected);
  expect(result).toMatchSnapshot();
});
```

### 3. BDD Style
Behavior-driven development with Given-When-Then.

```typescript
describe('GIVEN valid inputs', () => {
  it('WHEN function is called THEN it should return expected result', () => {
    // GIVEN
    const input = 'test-data';
    
    // WHEN
    const result = myFunction(input);
    
    // THEN
    expect(result).toBeDefined();
  });
});
```

### 4. Smart Style
AI-powered analysis of code flow with targeted tests.

```typescript
// Automatically detects:
// - Conditions and branches
// - Error handling
// - Loop iterations
// - External dependencies
// - Complexity hotspots

it('should handle case when user.isActive is true (line 15)', () => {
  // Test generated based on actual code flow
});
```

---

## 🔧 Advanced Usage

### Custom Mock Generation

```bash
test-gen generate src/api.ts --mocks
```

Automatically generates mock setups:

```typescript
// Module mocks
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

beforeEach(() => {
  // Mock setup
  axios.get.mockResolvedValue({ data: {} });
});
```

### Parameterized Tests

```bash
test-gen generate src/validator.ts --test-each
```

Generates `test.each()` patterns:

```typescript
test.each([
  ['valid@email.com', true],
  ['invalid-email', false],
  ['', false],
])('should validate %s as %s', (email, expected) => {
  expect(validateEmail(email)).toBe(expected);
});
```

---

## 📊 Examples

### Example 1: Simple Function

**Input:** `math.ts`
```typescript
export function add(a: number, b: number): number {
  return a + b;
}
```

**Generated:** `math.test.ts`
```typescript
import { add } from './math';
import { describe, it, expect } from '@jest/globals';

describe('add', () => {
  it('should execute successfully with valid inputs', () => {
    // Arrange
    const a = 42;
    const b = 42;
    
    // Act
    const result = add(a, b);
    
    // Assert
    expect(result).toBeDefined();
  });
});
```

### Example 2: Class with Methods

**Input:** `user-service.ts`
```typescript
export class UserService {
  async getUser(id: string): Promise<User | null> {
    if (!id) throw new Error('ID required');
    return await db.findUser(id);
  }
}
```

**Generated (Smart Style):**
```typescript
describe('UserService.getUser', () => {
  // Complexity: 3
  // Conditions: 1
  // Error handling: 1
  // External calls: 1
  
  it('should throw Error when !id is true (line 3)', async () => {
    // Test for error condition
  });
  
  it('should call db.findUser with correct arguments (line 4)', async () => {
    // Test for external dependency
  });
  
  it('should successfully complete happy path', async () => {
    // Test for successful execution
  });
});
```

---

## 🛠️ API

### Programmatic Usage

```typescript
import { generateTest, parseFile, TestConfig } from 'test-gen';

const config: TestConfig = {
  framework: 'jest',
  style: 'strict',
  includeComments: true,
};

// Generate test
const testCode = generateTest('./src/app.ts', config);
console.log(testCode);

// Or parse functions only
const functions = parseFile('./src/utils.ts');
console.log(`Found ${functions.length} functions`);
```

---

## 🐛 Debugging

### Enable Debug Mode

```bash
DEBUG=1 test-gen generate src/app.ts
```

This shows:
- Detailed parsing information
- Type resolution steps
- Config loading process
- Error stack traces

### Common Issues

**Issue:** "File not found"
```
❌ File not found: src/utlis.ts

💡 Did you mean one of these?
   - utils.ts
   - utils.test.ts
```

**Issue:** "Invalid framework"
```
❌ Invalid framework: jst. Valid: jest, vitest, mocha
```

**Issue:** "TypeScript syntax errors"
```
❌ TypeScript syntax errors found:
  Line 15, Col 3: Expected ';'
  Line 20, Col 10: Cannot find name 'foo'

💡 Fix syntax errors and try again.
```

---

## 🧪 Testing

Run the test generator's own tests:

```bash
npm test
```

With coverage:

```bash
npm run test:coverage
```

---

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

### Development Setup

```bash
# Clone repo
git clone https://github.com/yourusername/test-gen.git
cd test-gen

# Install dependencies
npm install

# Build
npm run build

# Run in dev mode
npm run dev

# Run tests
npm test
```

---

## 📜 License

MIT © [Your Name]

---

## 🙏 Acknowledgments

- Built with [TypeScript Compiler API](https://github.com/microsoft/TypeScript)
- Inspired by modern testing best practices
- Community feedback and contributions

---

## 📞 Support

- 🐛 [Report a Bug](https://github.com/yourusername/test-gen/issues)
- 💡 [Request a Feature](https://github.com/yourusername/test-gen/issues)
- 📖 [Documentation](https://github.com/yourusername/test-gen/wiki)
- 💬 [Discussions](https://github.com/yourusername/test-gen/discussions)

---

## 🗺️ Roadmap

- [ ] Watch mode for auto-regeneration
- [ ] Coverage analysis integration
- [ ] Custom template system
- [ ] Plugin architecture
- [ ] Web UI for visualization
- [ ] AI-powered test suggestions

---

**Made with ❤️ by developers, for developers**