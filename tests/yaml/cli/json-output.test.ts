import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFormatFlag } from '../../../src/yaml/cli/index.js';
import { runInitCommand } from '../../../src/yaml/cli/init.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yaml-json-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  tempDirs.length = 0;
});

describe('parseFormatFlag', () => {
  test('extracts --format json and returns clean args', () => {
    const result = parseFormatFlag(['--format', 'json', 'validate', 'file.yaml']);
    expect(result.formatJson).toBe(true);
    expect(result.cleanArgs).toEqual(['validate', 'file.yaml']);
  });

  test('returns false when no --format flag', () => {
    const result = parseFormatFlag(['validate', 'file.yaml']);
    expect(result.formatJson).toBe(false);
    expect(result.cleanArgs).toEqual(['validate', 'file.yaml']);
  });

  test('handles --format without json value', () => {
    const result = parseFormatFlag(['--format', 'text', 'validate']);
    expect(result.formatJson).toBe(false);
    expect(result.cleanArgs).toEqual(['--format', 'text', 'validate']);
  });

  test('handles --format json at end of args', () => {
    const result = parseFormatFlag(['validate', '--format', 'json']);
    expect(result.formatJson).toBe(true);
    expect(result.cleanArgs).toEqual(['validate']);
  });

  test('handles empty args', () => {
    const result = parseFormatFlag([]);
    expect(result.formatJson).toBe(false);
    expect(result.cleanArgs).toEqual([]);
  });
});

describe('init command JSON mode', () => {
  test('returns CliResult object (not a number) in jsonMode', async () => {
    const result = await runInitCommand(['--help'], true);
    expect(typeof result).toBe('object');
    expect(typeof result).not.toBe('number');
  });

  test('returns structured data with directory and created list', async () => {
    const tmp = makeTempDir();
    const target = join(tmp, 'json-init');

    const result = await runInitCommand([target], true);

    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.exitCode).toBe(0);
      expect(result.data).toBeDefined();
      const data = result.data as { directory: string; created: string[] };
      expect(data.directory).toBe(target);
      expect(data.created).toBeArray();
      expect(data.created.length).toBe(9);
      expect(data.created).toContain('core');
      expect(data.created).toContain('env');
      expect(data.created).toContain('security');
    }
  });

  test('returns error in jsonMode for non-empty dir without --force', async () => {
    const tmp = makeTempDir();
    const target = join(tmp, 'existing');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(target);
    writeFileSync(join(target, 'file.txt'), 'data');

    const result = await runInitCommand([target], true);

    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.exitCode).toBe(1);
      expect(result.errors).toBeArray();
      expect(result.errors!.length).toBeGreaterThan(0);
    }
  });

  test('--help in jsonMode returns CliResult', async () => {
    const result = await runInitCommand(['--help'], true);

    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.exitCode).toBe(0);
      expect(result.data).toEqual({ help: true });
    }
  });
});
