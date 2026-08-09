import { describe, it, expect } from 'bun:test';
import { join } from 'node:path';
import {
  substituteVariables,
  detectUnresolvedVariables,
  parseYamlString,
  parseYamlFile,
  loadValuesFile,
  YamlParseError,
  type VariableContext,
} from '../../src/yaml/parser.js';

const fixturesDir = join(import.meta.dir, 'fixtures');

const emptyCtx: VariableContext = {
  setOverrides: {},
  valuesFile: {},
  env: {},
};

describe('substituteVariables', () => {
  it('resolves ${VAR} from setOverrides', () => {
    const result = substituteVariables('port: ${PORT}', {
      setOverrides: { PORT: '443' },
      valuesFile: {},
      env: {},
    });
    expect(result).toBe('port: 443');
  });

  it('resolves ${VAR} from valuesFile when not in setOverrides', () => {
    const result = substituteVariables('port: ${PORT}', {
      setOverrides: {},
      valuesFile: { PORT: '8080' },
      env: {},
    });
    expect(result).toBe('port: 8080');
  });

  it('resolves ${VAR} from env when not in setOverrides or valuesFile', () => {
    const result = substituteVariables('port: ${PORT}', {
      setOverrides: {},
      valuesFile: {},
      env: { PORT: '3000' },
    });
    expect(result).toBe('port: 3000');
  });

  it('uses default value from ${VAR:-default} when not found anywhere', () => {
    const result = substituteVariables('port: ${PORT:-8080}', emptyCtx);
    expect(result).toBe('port: 8080');
  });

  it('leaves ${VAR} unresolved when not in any source and no default', () => {
    const result = substituteVariables('port: ${MISSING}', emptyCtx);
    expect(result).toBe('port: ${MISSING}');
  });

  it('handles multiple variables on the same line', () => {
    const result = substituteVariables('${HOST}:${PORT}', {
      setOverrides: { HOST: 'localhost', PORT: '443' },
      valuesFile: {},
      env: {},
    });
    expect(result).toBe('localhost:443');
  });

  it('setOverrides takes precedence over valuesFile', () => {
    const result = substituteVariables('port: ${PORT}', {
      setOverrides: { PORT: '443' },
      valuesFile: { PORT: '8080' },
      env: { PORT: '3000' },
    });
    expect(result).toBe('port: 443');
  });

  it('valuesFile takes precedence over env', () => {
    const result = substituteVariables('port: ${PORT}', {
      setOverrides: {},
      valuesFile: { PORT: '8080' },
      env: { PORT: '3000' },
    });
    expect(result).toBe('port: 8080');
  });
});

describe('detectUnresolvedVariables', () => {
  it('returns empty array when all variables resolved', () => {
    const result = detectUnresolvedVariables('port: 443', 'test.yaml');
    expect(result).toEqual([]);
  });

  it('returns entries with correct variable name, file, and line number', () => {
    const text = 'line1: ok\nport: ${MISSING}\nline3: ok';
    const result = detectUnresolvedVariables(text, 'test.yaml');
    expect(result).toEqual([
      { variable: 'MISSING', file: 'test.yaml', line: 2 },
    ]);
  });

  it('detects multiple unresolved variables across lines', () => {
    const text = 'ip: ${VIP}\nport: ${PORT}';
    const result = detectUnresolvedVariables(text, 'config.yaml');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ variable: 'VIP', file: 'config.yaml', line: 1 });
    expect(result[1]).toEqual({ variable: 'PORT', file: 'config.yaml', line: 2 });
  });
});

describe('parseYamlString', () => {
  it('parses single-document YAML into YamlResource[1]', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: test-lb
spec:
  port: 443`;
    const result = parseYamlString(yaml, emptyCtx);
    expect(result).toHaveLength(1);
    expect(result[0].apiVersion).toBe('loxilb.io/v1');
    expect(result[0].kind).toBe('LoadBalancer');
    expect(result[0].metadata.name).toBe('test-lb');
    expect(result[0].spec.port).toBe(443);
  });

  it('parses multi-document YAML into YamlResource[N]', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: BgpGlobal
metadata:
  name: bgp-config
spec:
  routerId: "10.0.0.1"
---
apiVersion: loxilb.io/v1
kind: BgpNeighbor
metadata:
  name: peer-1
spec:
  ipAddress: "10.0.0.2"`;
    const result = parseYamlString(yaml, emptyCtx);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('BgpGlobal');
    expect(result[1].kind).toBe('BgpNeighbor');
  });

  it('skips empty documents from trailing ---', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: test-lb
spec:
  port: 443
---
`;
    const result = parseYamlString(yaml, emptyCtx);
    expect(result).toHaveLength(1);
  });

  it('throws YamlParseError for missing apiVersion', () => {
    const yaml = `kind: LoadBalancer
metadata:
  name: test
spec:
  port: 443`;
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(YamlParseError);
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(/apiVersion/);
  });

  it('throws YamlParseError for missing kind', () => {
    const yaml = `apiVersion: loxilb.io/v1
metadata:
  name: test
spec:
  port: 443`;
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(YamlParseError);
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(/kind/);
  });

  it('throws YamlParseError for missing metadata.name', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  labels:
    env: prod
spec:
  port: 443`;
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(YamlParseError);
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(/metadata\.name/);
  });

  it('throws YamlParseError for missing spec', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: test`;
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(YamlParseError);
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(/spec/);
  });

  it('throws YamlParseError for unresolved variables', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: test
spec:
  port: \${MISSING_PORT}`;
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(YamlParseError);
    expect(() => parseYamlString(yaml, emptyCtx)).toThrow(/Unresolved/);
  });

  it('correctly sets _source with file and documentIndex', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: BgpGlobal
metadata:
  name: bgp
spec:
  routerId: "10.0.0.1"
---
apiVersion: loxilb.io/v1
kind: BgpNeighbor
metadata:
  name: peer
spec:
  ipAddress: "10.0.0.2"`;
    const result = parseYamlString(yaml, emptyCtx, 'config.yaml');
    expect(result[0]._source).toEqual({ file: 'config.yaml', documentIndex: 0 });
    expect(result[1]._source).toEqual({ file: 'config.yaml', documentIndex: 1 });
  });

  it('preserves numeric types through variable substitution', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: test
spec:
  port: \${PORT}`;
    const result = parseYamlString(yaml, {
      setOverrides: { PORT: '443' },
      valuesFile: {},
      env: {},
    });
    expect(result[0].spec.port).toBe(443);
    expect(typeof result[0].spec.port).toBe('number');
  });

  it('preserves boolean types through variable substitution', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: test
spec:
  monitor: \${MON}`;
    const result = parseYamlString(yaml, {
      setOverrides: { MON: 'true' },
      valuesFile: {},
      env: {},
    });
    expect(result[0].spec.monitor).toBe(true);
    expect(typeof result[0].spec.monitor).toBe('boolean');
  });

  it('resolves variables before parsing using context', () => {
    const yaml = `apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: test
spec:
  externalIP: "\${VIP}"
  port: \${PORT:-443}`;
    const result = parseYamlString(yaml, {
      setOverrides: { VIP: '10.0.0.1' },
      valuesFile: {},
      env: {},
    });
    expect(result[0].spec.externalIP).toBe('10.0.0.1');
    expect(result[0].spec.port).toBe(443);
  });
});

describe('loadValuesFile', () => {
  it('parses YAML mapping into Record<string, string>', () => {
    const result = loadValuesFile(join(fixturesDir, 'values-prod.yaml'));
    expect(result.EXTERNAL_VIP).toBe('10.0.0.1');
    expect(result.LB_PORT).toBe('443');
    expect(result.BACKEND_1).toBe('192.168.1.10');
  });

  it('converts numeric values to strings', () => {
    const result = loadValuesFile(join(fixturesDir, 'values-prod.yaml'));
    expect(typeof result.LB_PORT).toBe('string');
    expect(typeof result.BACKEND_PORT).toBe('string');
  });

  it('throws YamlParseError for array content', () => {
    // Create a temporary fixture-like test inline
    const { writeFileSync, unlinkSync } = require('node:fs');
    const tmpFile = join(fixturesDir, '_test_array.yaml');
    writeFileSync(tmpFile, '- item1\n- item2\n');
    try {
      expect(() => loadValuesFile(tmpFile)).toThrow(YamlParseError);
      expect(() => loadValuesFile(tmpFile)).toThrow(/mapping/);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

describe('parseYamlFile', () => {
  it('reads multi-doc.yaml fixture and returns 2 YamlResource objects', () => {
    const result = parseYamlFile(join(fixturesDir, 'multi-doc.yaml'), emptyCtx);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('BgpGlobal');
    expect(result[0].metadata.name).toBe('bgp-config');
    expect(result[1].kind).toBe('BgpNeighbor');
    expect(result[1].metadata.name).toBe('peer-1');
  });

  it('reads variables.yaml with context and returns resolved resource', () => {
    const values = loadValuesFile(join(fixturesDir, 'values-prod.yaml'));
    const result = parseYamlFile(join(fixturesDir, 'variables.yaml'), {
      setOverrides: {},
      valuesFile: values,
      env: {},
    });
    expect(result).toHaveLength(1);
    expect(result[0].spec.externalIP).toBe('10.0.0.1');
    expect(result[0].spec.port).toBe(443);
  });
});
