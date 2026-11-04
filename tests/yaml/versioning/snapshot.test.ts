/**
 * Unit tests for the versioning/snapshot system.
 * Tests getNextRevisionId, listRevisions, pruneRevisions, loadVersionConfig,
 * and loadSnapshotResources using temp directories.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { join } from 'node:path';
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { stringify } from 'yaml';

import { getNextRevisionId, loadSnapshotResources } from '../../../src/yaml/versioning/snapshot.js';
import { listRevisions, pruneRevisions, loadVersionConfig, saveVersionConfig } from '../../../src/yaml/versioning/history.js';
import type { RevisionMetadata, SnapshotConfig } from '../../../src/yaml/versioning/types.js';

// --- Test Helpers ---

let tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loxilb-test-'));
  tempDirs.push(dir);
  return dir;
}

function createRevision(configDir: string, revId: string, metadata: Partial<RevisionMetadata> = {}): void {
  const revDir = join(configDir, 'revisions', revId);
  mkdirSync(revDir, { recursive: true });

  const meta: RevisionMetadata = {
    revisionId: revId,
    timestamp: new Date().toISOString(),
    user: 'testuser',
    description: `Test snapshot ${revId}`,
    operations: ['CREATE LoadBalancer/web-lb'],
    status: 'pre-apply',
    kindsSnapshot: ['LoadBalancer'],
    ...metadata,
  };

  writeFileSync(join(revDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
  tempDirs = [];
});

// --- getNextRevisionId ---

describe('getNextRevisionId', () => {
  test('returns rev-0001 when revisions directory is empty', () => {
    const configDir = createTempDir();
    mkdirSync(join(configDir, 'revisions'), { recursive: true });

    expect(getNextRevisionId(configDir)).toBe('rev-0001');
  });

  test('returns rev-0001 when revisions directory does not exist', () => {
    const configDir = createTempDir();

    expect(getNextRevisionId(configDir)).toBe('rev-0001');
  });

  test('returns rev-0002 when rev-0001 exists', () => {
    const configDir = createTempDir();
    createRevision(configDir, 'rev-0001');

    expect(getNextRevisionId(configDir)).toBe('rev-0002');
  });

  test('handles gaps in sequence (rev-0001, rev-0003 -> rev-0004)', () => {
    const configDir = createTempDir();
    createRevision(configDir, 'rev-0001');
    createRevision(configDir, 'rev-0003');

    expect(getNextRevisionId(configDir)).toBe('rev-0004');
  });

  test('ignores non-revision directories', () => {
    const configDir = createTempDir();
    createRevision(configDir, 'rev-0001');
    mkdirSync(join(configDir, 'revisions', 'temp-dir'), { recursive: true });
    mkdirSync(join(configDir, 'revisions', 'not-a-rev'), { recursive: true });

    expect(getNextRevisionId(configDir)).toBe('rev-0002');
  });
});

// --- listRevisions ---

describe('listRevisions', () => {
  test('returns empty array when revisions directory does not exist', () => {
    const configDir = createTempDir();

    expect(listRevisions(configDir)).toEqual([]);
  });

  test('returns sorted RevisionMetadata[] for existing revisions', () => {
    const configDir = createTempDir();
    createRevision(configDir, 'rev-0002', {
      timestamp: '2025-03-16T10:00:00.000Z',
    });
    createRevision(configDir, 'rev-0001', {
      timestamp: '2025-03-16T09:00:00.000Z',
    });

    const result = listRevisions(configDir);

    expect(result).toHaveLength(2);
    expect(result[0].revisionId).toBe('rev-0001');
    expect(result[1].revisionId).toBe('rev-0002');
  });

  test('skips directories without metadata.json', () => {
    const configDir = createTempDir();
    createRevision(configDir, 'rev-0001');
    mkdirSync(join(configDir, 'revisions', 'rev-0002'), { recursive: true });
    // rev-0002 has no metadata.json

    const result = listRevisions(configDir);
    expect(result).toHaveLength(1);
    expect(result[0].revisionId).toBe('rev-0001');
  });
});

// --- pruneRevisions ---

describe('pruneRevisions', () => {
  test('does nothing when count <= maxRevisions', () => {
    const configDir = createTempDir();
    createRevision(configDir, 'rev-0001');
    createRevision(configDir, 'rev-0002');

    pruneRevisions(configDir, 5);

    const revDir = join(configDir, 'revisions');
    const dirs = readdirSync(revDir);
    expect(dirs).toContain('rev-0001');
    expect(dirs).toContain('rev-0002');
  });

  test('deletes oldest revisions when count exceeds maxRevisions', () => {
    const configDir = createTempDir();
    createRevision(configDir, 'rev-0001');
    createRevision(configDir, 'rev-0002');
    createRevision(configDir, 'rev-0003');

    pruneRevisions(configDir, 2);

    const revDir = join(configDir, 'revisions');
    const dirs = readdirSync(revDir);
    expect(dirs).not.toContain('rev-0001');
    expect(dirs).toContain('rev-0002');
    expect(dirs).toContain('rev-0003');
  });

  test('does nothing when revisions directory does not exist', () => {
    const configDir = createTempDir();
    // Should not throw
    pruneRevisions(configDir, 5);
  });
});

// --- loadVersionConfig ---

describe('loadVersionConfig', () => {
  test('returns defaults when config.json does not exist', () => {
    const configDir = createTempDir();

    const result = loadVersionConfig(configDir);

    expect(result.maxRevisions).toBe(50);
  });

  test('reads existing config.json', () => {
    const configDir = createTempDir();
    const config: SnapshotConfig = { maxRevisions: 25 };
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(config), 'utf-8');

    const result = loadVersionConfig(configDir);

    expect(result.maxRevisions).toBe(25);
  });
});

// --- saveVersionConfig ---

describe('saveVersionConfig', () => {
  test('writes config.json', () => {
    const configDir = createTempDir();
    const config: SnapshotConfig = { maxRevisions: 10 };

    saveVersionConfig(configDir, config);

    expect(existsSync(join(configDir, 'config.json'))).toBe(true);
    const result = loadVersionConfig(configDir);
    expect(result.maxRevisions).toBe(10);
  });
});

// --- loadSnapshotResources ---

describe('loadSnapshotResources', () => {
  test('returns empty array for non-existent directory', () => {
    expect(loadSnapshotResources('/nonexistent')).toEqual([]);
  });

  test('loads YAML resources from domain subdirectories', () => {
    const revDir = createTempDir();
    const coreDir = join(revDir, 'core');
    mkdirSync(coreDir, { recursive: true });

    const resource = {
      apiVersion: 'v1',
      kind: 'LoadBalancer',
      metadata: { name: 'web-lb' },
      spec: { port: 80 },
    };

    writeFileSync(join(coreDir, 'LoadBalancer.yaml'), stringify(resource), 'utf-8');

    const result = loadSnapshotResources(revDir);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('LoadBalancer');
    expect(result[0].metadata.name).toBe('web-lb');
    expect(result[0].spec.port).toBe(80);
  });

  test('handles multi-document YAML', () => {
    const revDir = createTempDir();
    const coreDir = join(revDir, 'core');
    mkdirSync(coreDir, { recursive: true });

    const doc1 = stringify({
      apiVersion: 'v1',
      kind: 'LoadBalancer',
      metadata: { name: 'lb-1' },
      spec: { port: 80 },
    });
    const doc2 = stringify({
      apiVersion: 'v1',
      kind: 'LoadBalancer',
      metadata: { name: 'lb-2' },
      spec: { port: 443 },
    });

    writeFileSync(join(coreDir, 'LoadBalancer.yaml'), `${doc1}---\n${doc2}`, 'utf-8');

    const result = loadSnapshotResources(revDir);

    expect(result).toHaveLength(2);
    expect(result[0].metadata.name).toBe('lb-1');
    expect(result[1].metadata.name).toBe('lb-2');
  });

  test('skips non-YAML files and non-directory entries', () => {
    const revDir = createTempDir();
    const coreDir = join(revDir, 'core');
    mkdirSync(coreDir, { recursive: true });

    writeFileSync(join(coreDir, 'notes.txt'), 'not yaml', 'utf-8');
    writeFileSync(join(revDir, 'metadata.json'), '{}', 'utf-8');

    const result = loadSnapshotResources(revDir);
    expect(result).toHaveLength(0);
  });
});
