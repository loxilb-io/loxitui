import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtempSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInitCommand } from '../../../src/yaml/cli/init.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yaml-init-test-'));
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

const EXPECTED_DIRS = [
  'env', 'core', 'network', 'security', 'bgp',
  'ipsec', 'ai-gateway', 'observability', 'system',
];

describe('runInitCommand', () => {
  test('creates all 9 subdirectories in target path', async () => {
    const tmp = makeTempDir();
    const target = join(tmp, 'my-config');

    const exitCode = await runInitCommand([target]);
    expect(exitCode).toBe(0);

    const entries = readdirSync(target);
    for (const dir of EXPECTED_DIRS) {
      expect(entries).toContain(dir);
    }
    expect(entries.length).toBe(EXPECTED_DIRS.length);
  });

  test('creates README.md in each subdirectory', async () => {
    const tmp = makeTempDir();
    const target = join(tmp, 'cfg');

    await runInitCommand([target]);

    for (const dir of EXPECTED_DIRS) {
      const readmePath = join(target, dir, 'README.md');
      expect(existsSync(readmePath)).toBe(true);
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toContain(`# ${dir}`);
      expect(content).toContain('Place your .yaml configuration files here.');
    }
  });

  test('defaults to ./loxilb-config when no path given', async () => {
    const tmp = makeTempDir();
    const origCwd = process.cwd();
    try {
      process.chdir(tmp);
      const exitCode = await runInitCommand([]);
      expect(exitCode).toBe(0);
      expect(existsSync(join(tmp, 'loxilb-config'))).toBe(true);
    } finally {
      process.chdir(origCwd);
    }
  });

  test('returns 1 on non-empty directory without --force', async () => {
    const tmp = makeTempDir();
    const target = join(tmp, 'existing');
    mkdirSync(target);
    writeFileSync(join(target, 'something.txt'), 'data');

    const exitCode = await runInitCommand([target]);
    expect(exitCode).toBe(1);
  });

  test('returns 0 on non-empty directory with --force', async () => {
    const tmp = makeTempDir();
    const target = join(tmp, 'existing');
    mkdirSync(target);
    writeFileSync(join(target, 'something.txt'), 'data');

    const exitCode = await runInitCommand([target, '--force']);
    expect(exitCode).toBe(0);

    // Verify subdirs were created
    for (const dir of EXPECTED_DIRS) {
      expect(existsSync(join(target, dir))).toBe(true);
    }
  });

  test('does not overwrite existing README.md with --force', async () => {
    const tmp = makeTempDir();
    const target = join(tmp, 'existing');
    mkdirSync(join(target, 'core'), { recursive: true });
    writeFileSync(join(target, 'core', 'README.md'), 'custom content');

    await runInitCommand([target, '--force']);

    const content = readFileSync(join(target, 'core', 'README.md'), 'utf-8');
    expect(content).toBe('custom content');
  });

  test('--help returns 0', async () => {
    const exitCode = await runInitCommand(['--help']);
    expect(exitCode).toBe(0);
  });

  test('returns 0 on empty existing directory', async () => {
    const tmp = makeTempDir();
    const target = join(tmp, 'empty');
    mkdirSync(target);

    const exitCode = await runInitCommand([target]);
    expect(exitCode).toBe(0);
  });
});
