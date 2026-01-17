import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, mergeConfigs } from '../src/config-loader';
import { createTempDir, cleanupTempDir } from './test-utils';

describe('config-loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    process.chdir(tempDir);
  });

  afterEach(() => {
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
    process.chdir(require('os').tmpdir());
  });

  describe('loadConfig', () => {
    it('should return empty object when no config file exists', async () => {
      const config = await loadConfig(tempDir);
      expect(config).toEqual({});
    });

    it('should load config from .testgenrc.json', async () => {
      const configContent = {
        framework: 'vitest' as const,
        style: 'strict' as const,
        includeComments: false,
      };
      fs.writeFileSync(
        path.join(tempDir, '.testgenrc.json'),
        JSON.stringify(configContent),
        'utf-8'
      );

      const config = await loadConfig(tempDir);
      expect(config.framework).toBe('vitest');
      expect(config.style).toBe('strict');
      expect(config.includeComments).toBe(false);
    });

    it('should handle invalid JSON gracefully', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.testgenrc.json'),
        '{ invalid json }',
        'utf-8'
      );

      // Should throw ConfigError for invalid JSON
      await expect(loadConfig(tempDir)).rejects.toThrow('Invalid JSON in config file');
    });

    it('should prioritize .testgenrc.json over other config files', async () => {
      const jsonConfig = { framework: 'jest' };
      const jsConfig = { framework: 'vitest' };

      fs.writeFileSync(
        path.join(tempDir, '.testgenrc.json'),
        JSON.stringify(jsonConfig),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(tempDir, 'testgen.config.json'),
        JSON.stringify(jsConfig),
        'utf-8'
      );

      const config = await loadConfig(tempDir);
      expect(config.framework).toBe('jest');
    });
  });

  describe('mergeConfigs', () => {
    it('should merge project config with CLI config', () => {
      const projectConfig = {
        framework: 'jest' as const,
        style: 'basic' as const,
        includeComments: true,
      };

      const cliConfig = {
        style: 'strict' as const,
        generateMocks: true,
      };

      const merged = mergeConfigs(projectConfig, cliConfig);
      expect(merged.framework).toBe('jest'); // From project
      expect(merged.style).toBe('strict'); // From CLI (overrides)
      expect(merged.includeComments).toBe(true); // From project
      expect(merged.generateMocks).toBe(true); // From CLI
    });

    it('should use defaults when both configs are empty', () => {
      const merged = mergeConfigs({}, {});
      expect(merged.framework).toBe('jest');
      expect(merged.style).toBe('basic');
      expect(merged.includeComments).toBe(true);
    });

    it('should handle undefined values correctly', () => {
      const projectConfig = {
        framework: 'jest' as const,
        includeComments: false,
      };

      const cliConfig = {
        framework: undefined,
        style: 'strict' as const,
      };

      const merged = mergeConfigs(projectConfig, cliConfig);
      expect(merged.framework).toBe('jest'); // Should keep project value
      expect(merged.style).toBe('strict');
      expect(merged.includeComments).toBe(false);
    });

    it('should handle null values correctly', () => {
      const projectConfig = {
        framework: 'jest' as const,
      };

      const cliConfig = {
        includeComments: false,
        generateMocks: false,
      };

      const merged = mergeConfigs(projectConfig, cliConfig);
      expect(merged.includeComments).toBe(false);
      expect(merged.generateMocks).toBe(false);
    });
  });
});
