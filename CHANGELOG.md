# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-01-09

### Fixed
- Fixed `.gitignore` file format (removed bash script syntax)
- Fixed cross-platform compatibility by replacing `rm -rf` with `rimraf`
- Fixed async/await handling in config-loader tests
- Fixed test suite failures - all 57 tests now passing

### Added
- Added `.eslintrc.js` for code linting
- Added `.prettierrc` for code formatting
- Added `.editorconfig` for editor consistency
- Added `rimraf` package for cross-platform file deletion
- Added `format:check` and `validate` npm scripts
- Added comprehensive project analysis documentation

### Changed
- Updated npm scripts to include test files in lint and format commands
- Enhanced `prepublishOnly` script to run tests before publishing
- Improved error handling in config loader

## [2.0.0] - 2025-12-05

### Added
- Smart test generation with flow analysis
- Support for multiple test frameworks (Jest, Vitest, Mocha)
- Support for multiple test styles (basic, strict, BDD, smart)
- Auto mock generation
- Type-aware test generation with TypeScript Compiler API
- CLI with comprehensive options
- Configuration file support (.testgenrc.json)

### Features
- Parse function declarations, arrow functions, class methods
- Support for destructured parameters, rest parameters, optional parameters
- Detect conditions, loops, error handling, external calls
- Generate tests based on code complexity
- Dry-run mode for previewing tests

## [1.0.0] - Initial Release

### Added
- Basic test generation functionality
- TypeScript support
- Jest framework support
