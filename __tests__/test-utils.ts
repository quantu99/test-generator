import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function createTempFile(content: string, extension: string = '.ts'): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gen-'));
  const filePath = path.join(tempDir, `test${extension}`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function cleanupTempFile(filePath: string): void {
  try {
    const dir = path.dirname(filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(dir)) {
      fs.rmdirSync(dir);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-gen-'));
}

export function cleanupTempDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}
