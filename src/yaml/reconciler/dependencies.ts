/**
 * Dependency graph for resource kinds and topological sort.
 * Ensures CREATE operations respect dependency order and DELETE operations
 * use reverse order to prevent API errors from missing prerequisites.
 */

/**
 * Static dependency graph mapping kind -> kinds it depends on.
 * A kind not listed here has no dependencies.
 */
export const DEPENDENCY_GRAPH: Record<string, string[]> = {
  BgpNeighbor: ["BgpGlobal"],
  BgpPolicyDefinition: ["BgpPolicyDefinedSet"],
  BgpPolicyApply: ["BgpNeighbor", "BgpPolicyDefinition"],
  VlanMember: ["Vlan"],
  VxlanPeer: ["VxlanTunnel"],
};

/**
 * Topological sort using Kahn's algorithm.
 * Returns kinds ordered so dependencies come before dependents.
 * Kinds not in the dependency graph are appended at the end in original order.
 * Throws if a circular dependency is detected.
 */
export function topologicalSort(kinds: string[]): string[] {
  const kindSet = new Set(kinds);

  // Separate kinds that are in the dependency graph from those that aren't
  const graphKinds: string[] = [];
  const independentKinds: string[] = [];

  for (const kind of kinds) {
    // A kind is "in the graph" if it has dependencies or is depended upon
    const hasDeps = DEPENDENCY_GRAPH[kind] !== undefined;
    const isDependedUpon = Object.values(DEPENDENCY_GRAPH).some((deps) => deps.includes(kind));

    if (hasDeps || isDependedUpon) {
      graphKinds.push(kind);
    } else {
      independentKinds.push(kind);
    }
  }

  if (graphKinds.length === 0) {
    return [...kinds]; // No graph kinds, preserve original order
  }

  // Build adjacency list and in-degree map (only for kinds in input)
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const kind of graphKinds) {
    if (!adjList.has(kind)) adjList.set(kind, []);
    if (!inDegree.has(kind)) inDegree.set(kind, 0);
  }

  for (const kind of graphKinds) {
    const deps = DEPENDENCY_GRAPH[kind];
    if (!deps) continue;

    for (const dep of deps) {
      if (!kindSet.has(dep)) continue; // Only consider deps present in input
      if (!adjList.has(dep)) adjList.set(dep, []);
      if (!inDegree.has(dep)) inDegree.set(dep, 0);
      adjList.get(dep)!.push(kind);
      inDegree.set(kind, (inDegree.get(kind) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [kind, degree] of inDegree) {
    if (degree === 0) queue.push(kind);
  }
  // Sort queue for deterministic output
  queue.sort();

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const neighbors = adjList.get(current) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        // Insert in sorted position for determinism
        const insertIdx = queue.findIndex((q) => q > neighbor);
        if (insertIdx === -1) {
          queue.push(neighbor);
        } else {
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }
  }

  // Cycle detection
  if (sorted.length < graphKinds.length) {
    const cycleKinds = graphKinds.filter((k) => !sorted.includes(k));
    throw new Error(`Circular dependency detected among kinds: ${cycleKinds.join(", ")}`);
  }

  // Append independent kinds at the end in original order
  return [...sorted, ...independentKinds];
}

/**
 * Reverse topological sort — used for DELETE ordering.
 * Dependents are deleted before their dependencies.
 */
export function reverseSort(kinds: string[]): string[] {
  return topologicalSort(kinds).reverse();
}
