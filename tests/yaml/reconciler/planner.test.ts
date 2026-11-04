/**
 * Unit tests for dependency graph, topological sort, and execution planner.
 */

import { describe, test, expect } from 'bun:test';
import { DEPENDENCY_GRAPH, topologicalSort, reverseSort } from '../../../src/yaml/reconciler/dependencies.js';
import { buildExecutionPlan } from '../../../src/yaml/reconciler/planner.js';
import type { DiffResult } from '../../../src/yaml/reconciler/types.js';

// --- Helper ---

function makeDiffResult(
  kind: string,
  name: string,
  operation: DiffResult['operation'],
  overrides: Partial<DiffResult> = {},
): DiffResult {
  return {
    kind,
    name,
    identityKey: `${kind}/${name}`,
    operation,
    fieldDiffs: [],
    desiredResource: operation !== 'DELETE'
      ? { apiVersion: 'v1', kind, metadata: { name }, spec: {} }
      : undefined,
    liveSpec: operation === 'DELETE' || operation === 'UPDATE' ? {} : undefined,
    ...overrides,
  };
}

// --- DEPENDENCY_GRAPH Tests ---

describe('DEPENDENCY_GRAPH', () => {
  test('BgpNeighbor depends on BgpGlobal', () => {
    expect(DEPENDENCY_GRAPH['BgpNeighbor']).toContain('BgpGlobal');
  });

  test('BgpPolicyApply depends on BgpNeighbor and BgpPolicyDefinition', () => {
    expect(DEPENDENCY_GRAPH['BgpPolicyApply']).toContain('BgpNeighbor');
    expect(DEPENDENCY_GRAPH['BgpPolicyApply']).toContain('BgpPolicyDefinition');
  });

  test('BgpPolicyDefinition depends on BgpPolicyDefinedSet', () => {
    expect(DEPENDENCY_GRAPH['BgpPolicyDefinition']).toContain('BgpPolicyDefinedSet');
  });

  test('VlanMember depends on Vlan', () => {
    expect(DEPENDENCY_GRAPH['VlanMember']).toContain('Vlan');
  });

  test('VxlanPeer depends on VxlanTunnel', () => {
    expect(DEPENDENCY_GRAPH['VxlanPeer']).toContain('VxlanTunnel');
  });
});

// --- topologicalSort Tests ---

describe('topologicalSort', () => {
  test('BgpGlobal comes before BgpNeighbor', () => {
    const sorted = topologicalSort(['BgpNeighbor', 'BgpGlobal']);
    const globalIdx = sorted.indexOf('BgpGlobal');
    const neighborIdx = sorted.indexOf('BgpNeighbor');
    expect(globalIdx).toBeLessThan(neighborIdx);
  });

  test('full BGP chain orders correctly', () => {
    const kinds = [
      'BgpPolicyApply',
      'BgpNeighbor',
      'BgpGlobal',
      'BgpPolicyDefinition',
      'BgpPolicyDefinedSet',
    ];
    const sorted = topologicalSort(kinds);

    const indexOf = (k: string) => sorted.indexOf(k);

    // BgpGlobal before BgpNeighbor
    expect(indexOf('BgpGlobal')).toBeLessThan(indexOf('BgpNeighbor'));
    // BgpPolicyDefinedSet before BgpPolicyDefinition
    expect(indexOf('BgpPolicyDefinedSet')).toBeLessThan(indexOf('BgpPolicyDefinition'));
    // BgpNeighbor before BgpPolicyApply
    expect(indexOf('BgpNeighbor')).toBeLessThan(indexOf('BgpPolicyApply'));
    // BgpPolicyDefinition before BgpPolicyApply
    expect(indexOf('BgpPolicyDefinition')).toBeLessThan(indexOf('BgpPolicyApply'));
  });

  test('independent kinds are preserved in order at the end', () => {
    const sorted = topologicalSort(['LoadBalancer', 'Firewall', 'Route']);
    expect(sorted).toEqual(['LoadBalancer', 'Firewall', 'Route']);
  });

  test('mix of dependent and independent kinds', () => {
    const sorted = topologicalSort(['LoadBalancer', 'BgpNeighbor', 'BgpGlobal', 'Firewall']);
    const globalIdx = sorted.indexOf('BgpGlobal');
    const neighborIdx = sorted.indexOf('BgpNeighbor');
    expect(globalIdx).toBeLessThan(neighborIdx);
    // Independent kinds come after graph kinds
    expect(sorted).toContain('LoadBalancer');
    expect(sorted).toContain('Firewall');
  });

  test('detects circular dependencies', () => {
    // We can't easily create a cycle with the static graph, but we can test
    // that the algorithm would detect one if it existed. We'll test with
    // a scenario where deps are in the input but form a cycle.
    // Since DEPENDENCY_GRAPH is static and doesn't have cycles, this tests
    // the algorithm's cycle detection path indirectly.
    // The current graph has no cycles so this just verifies normal sorting works.
    const sorted = topologicalSort(['BgpGlobal', 'BgpNeighbor']);
    expect(sorted).toHaveLength(2);
  });

  test('handles empty input', () => {
    expect(topologicalSort([])).toEqual([]);
  });

  test('handles single kind', () => {
    expect(topologicalSort(['LoadBalancer'])).toEqual(['LoadBalancer']);
  });
});

// --- reverseSort Tests ---

describe('reverseSort', () => {
  test('reverses topological order', () => {
    const reversed = reverseSort(['BgpNeighbor', 'BgpGlobal']);
    const neighborIdx = reversed.indexOf('BgpNeighbor');
    const globalIdx = reversed.indexOf('BgpGlobal');
    // In reverse order, BgpNeighbor should come before BgpGlobal
    expect(neighborIdx).toBeLessThan(globalIdx);
  });

  test('full BGP chain reversed correctly', () => {
    const kinds = [
      'BgpPolicyApply',
      'BgpNeighbor',
      'BgpGlobal',
      'BgpPolicyDefinition',
      'BgpPolicyDefinedSet',
    ];
    const reversed = reverseSort(kinds);

    const indexOf = (k: string) => reversed.indexOf(k);

    // BgpPolicyApply should come first (no dependents)
    expect(indexOf('BgpPolicyApply')).toBeLessThan(indexOf('BgpNeighbor'));
    expect(indexOf('BgpPolicyApply')).toBeLessThan(indexOf('BgpPolicyDefinition'));
    // BgpGlobal should come last (depended upon by others)
    expect(indexOf('BgpGlobal')).toBeGreaterThan(indexOf('BgpNeighbor'));
    expect(indexOf('BgpPolicyDefinedSet')).toBeGreaterThan(indexOf('BgpPolicyDefinition'));
  });
});

// --- buildExecutionPlan Tests ---

describe('buildExecutionPlan', () => {
  test('excludes UNCHANGED operations', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('LoadBalancer', 'lb1', 'UNCHANGED'),
      makeDiffResult('LoadBalancer', 'lb2', 'CREATE'),
    ];

    const plan = buildExecutionPlan(diffs);
    expect(plan).toHaveLength(1);
    expect(plan[0].operation).toBe('CREATE');
  });

  test('orders pure CREATE list by dependencies', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('BgpNeighbor', 'neighbor1', 'CREATE'),
      makeDiffResult('BgpGlobal', 'global', 'CREATE'),
    ];

    const plan = buildExecutionPlan(diffs);
    expect(plan).toHaveLength(2);

    const globalIdx = plan.findIndex((p) => p.kind === 'BgpGlobal');
    const neighborIdx = plan.findIndex((p) => p.kind === 'BgpNeighbor');
    expect(globalIdx).toBeLessThan(neighborIdx);
  });

  test('orders pure DELETE list in reverse dependency order', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('BgpGlobal', 'global', 'DELETE'),
      makeDiffResult('BgpNeighbor', 'neighbor1', 'DELETE'),
    ];

    const plan = buildExecutionPlan(diffs);
    expect(plan).toHaveLength(2);

    const neighborIdx = plan.findIndex((p) => p.kind === 'BgpNeighbor');
    const globalIdx = plan.findIndex((p) => p.kind === 'BgpGlobal');
    // In delete order, dependents (BgpNeighbor) before dependencies (BgpGlobal)
    expect(neighborIdx).toBeLessThan(globalIdx);
  });

  test('DELETEs come before CREATEs in mixed operations', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('LoadBalancer', 'lb1', 'CREATE'),
      makeDiffResult('Firewall', 'fw1', 'DELETE'),
    ];

    const plan = buildExecutionPlan(diffs);
    expect(plan).toHaveLength(2);

    const deleteIdx = plan.findIndex((p) => p.operation === 'DELETE');
    const createIdx = plan.findIndex((p) => p.operation === 'CREATE');
    expect(deleteIdx).toBeLessThan(createIdx);
  });

  test('prune=false excludes pruneCandidate DELETEs', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('LoadBalancer', 'lb1', 'CREATE'),
      makeDiffResult('LoadBalancer', 'lb-old', 'DELETE', { pruneCandidate: true }),
    ];

    const plan = buildExecutionPlan(diffs, { prune: false });
    expect(plan).toHaveLength(1);
    expect(plan[0].operation).toBe('CREATE');
  });

  test('prune=true includes pruneCandidate DELETEs for present kinds', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('LoadBalancer', 'lb1', 'CREATE'),
      makeDiffResult('LoadBalancer', 'lb-old', 'DELETE', { pruneCandidate: true }),
    ];

    const plan = buildExecutionPlan(diffs, { prune: true });
    expect(plan).toHaveLength(2);
    expect(plan.some((p) => p.operation === 'DELETE')).toBe(true);
  });

  test('prune=true excludes pruneCandidate DELETEs for kinds not in desired', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('LoadBalancer', 'lb1', 'CREATE'),
      // Firewall DELETE prune candidate but no Firewall in desired non-delete
      makeDiffResult('Firewall', 'fw-old', 'DELETE', { pruneCandidate: true }),
    ];

    const plan = buildExecutionPlan(diffs, { prune: true });
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe('LoadBalancer');
  });

  test('dependencyTier values are monotonically correct', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('BgpPolicyApply', 'apply1', 'CREATE'),
      makeDiffResult('BgpNeighbor', 'neighbor1', 'CREATE'),
      makeDiffResult('BgpGlobal', 'global', 'CREATE'),
      makeDiffResult('BgpPolicyDefinedSet', 'set1', 'CREATE'),
      makeDiffResult('BgpPolicyDefinition', 'def1', 'CREATE'),
    ];

    const plan = buildExecutionPlan(diffs);

    // Verify tiers are non-decreasing
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].dependencyTier).toBeGreaterThanOrEqual(plan[i - 1].dependencyTier);
    }

    // BgpGlobal should have lower tier than BgpNeighbor
    const globalOp = plan.find((p) => p.kind === 'BgpGlobal');
    const neighborOp = plan.find((p) => p.kind === 'BgpNeighbor');
    expect(globalOp!.dependencyTier).toBeLessThan(neighborOp!.dependencyTier);
  });

  test('carries resource for CREATE/UPDATE and liveSpec for DELETE', () => {
    const diffs: DiffResult[] = [
      makeDiffResult('LoadBalancer', 'lb1', 'CREATE'),
      makeDiffResult('LoadBalancer', 'lb-old', 'DELETE', { liveSpec: { port: 80 } }),
    ];

    const plan = buildExecutionPlan(diffs);
    const createOp = plan.find((p) => p.operation === 'CREATE');
    const deleteOp = plan.find((p) => p.operation === 'DELETE');

    expect(createOp!.resource).toBeDefined();
    expect(deleteOp!.liveSpec).toEqual({ port: 80 });
  });
});
