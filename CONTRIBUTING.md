# Contributing to Test Generator

Thank you for your interest in contributing to Test Generator! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

### Prerequisites
- Node.js >= 16.0.0
- npm or yarn
- Git

### Setup Development Environment

1. **Fork and clone the repository**
```bash
git clone https://github.com/quantu99/test-generator.git
cd test-generator
```

2. **Install dependencies**
```bash
npm install
```

3. **Build the project**
```bash
npm run build
```

4. **Run tests**
```bash
npm test
```

## 📝 Development Workflow

### Making Changes

1. **Create a new branch**
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

2. **Make your changes**
   - Write clean, readable code
   - Follow the existing code style
   - Add tests for new features
   - Update documentation as needed

3. **Run validation**
```bash
npm run validate
```

This runs:
- TypeScript type checking
- ESLint
- Prettier format check
- All tests

4. **Commit your changes**
```bash
git add .
git commit -m "feat: add new feature" # or "fix: fix bug"
```

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Build/tooling changes

5. **Push and create PR**
```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests
- Place tests in `__tests__/` directory
- Use descriptive test names
- Follow the AAA pattern (Arrange, Act, Assert)
- Test edge cases and error conditions

Example:
```typescript
describe('myFunction', () => {
  it('should handle valid input correctly', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

## 📐 Code Style

### TypeScript
- Use TypeScript strict mode
- Avoid `any` types when possible
- Use interfaces for object shapes
- Document complex types with JSDoc

### Formatting
- Run `npm run format` before committing
- 2 spaces for indentation
- Single quotes for strings
- Semicolons required

### Linting
- Run `npm run lint:fix` to auto-fix issues
- Address all ESLint warnings

## 📚 Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Update CHANGELOG.md following Keep a Changelog format
- Include code examples for new features

## 🐛 Reporting Bugs

When reporting bugs, please include:
- Test Generator version
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages/stack traces

## 💡 Suggesting Features

Feature requests are welcome! Please:
- Check if the feature already exists
- Explain the use case
- Provide examples
- Consider implementation complexity

## 📋 Pull Request Guidelines

### Before Submitting
- [ ] Tests pass (`npm test`)
- [ ] Code is formatted (`npm run format`)
- [ ] No lint errors (`npm run lint`)
- [ ] Types are correct (`npm run typecheck`)
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated

### PR Description
- Describe what changed and why
- Reference related issues
- Include screenshots for UI changes
- List breaking changes if any

## 🏗️ Project Structure

```
test-generator/
├── src/                    # Source code
│   ├── cli.ts             # CLI entry point
│   ├── parser.ts          # TypeScript parser
│   ├── generator.ts       # Test generator
│   ├── smart-generator.ts # Smart test generation
│   ├── flow-analyzer.ts   # Code flow analysis
│   ├── config-loader.ts   # Configuration loader
│   ├── type-resolver.ts   # Type resolution
│   ├── mock-generator.ts  # Mock generation
│   └── types.ts           # Type definitions
├── __tests__/             # Test files
├── dist/                  # Compiled output
└── docs/                  # Documentation
```

## 🤝 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## 📞 Getting Help

- Open an issue for bugs
- Start a discussion for questions
- Check existing issues and PRs

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Test Generator! 🎉
