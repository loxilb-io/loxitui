/**
 * Bidirectional integer <-> string enum mappings.
 * Used by the validator to accept string names in YAML and convert to API integers,
 * and by the exporter to convert API integers back to readable strings.
 *
 * Derived from swagger_new.yml description fields on integer enum properties.
 */

import type { EnumMapEntry } from "../types.js";

/**
 * Enum maps keyed by dotted field path: "Kind.field" or "Kind.wrapper.field"
 */
export const ENUM_MAPS: Record<string, EnumMapEntry> = {
  "LoadBalancer.serviceArguments.mode": {
    toApi: {
      dnat: 0,
      onearm: 1,
      fullnat: 2,
      dsr: 3,
      fullproxy: 4,
      hostonearm: 5,
      aigw: 6,
    },
    fromApi: {
      0: "dnat",
      1: "onearm",
      2: "fullnat",
      3: "dsr",
      4: "fullproxy",
      5: "hostonearm",
      6: "aigw",
    },
  },

  "LoadBalancer.serviceArguments.sel": {
    toApi: {
      rr: 0,
      hash: 1,
      wrr: 2,
      persist: 3,
      lc: 4,
      n2: 5,
      n3: 6,
      chwbl: 8,
      gpuaware: 9,
      "wrr-hash": 10,
    },
    fromApi: {
      0: "rr",
      1: "hash",
      2: "wrr",
      3: "persist",
      4: "lc",
      5: "n2",
      6: "n3",
      7: "reserved",
      8: "chwbl",
      9: "gpuaware",
      10: "wrr-hash",
    },
  },

  "LoadBalancer.serviceArguments.security": {
    toApi: {
      plain: 0,
      https: 1,
      tls: 2,
      e2ehttps: 3,
    },
    fromApi: {
      0: "plain",
      1: "https",
      2: "tls",
      3: "e2ehttps",
    },
  },

  "LoadBalancer.serviceArguments.oper": {
    toApi: {
      create: 0,
      attachEP: 1,
      detachEP: 2,
    },
    fromApi: {
      0: "create",
      1: "attachEP",
      2: "detachEP",
    },
  },

  "LoadBalancer.serviceArguments.chwbl_prefix_hash_level": {
    toApi: {
      Level1: 1,
      "Level1+2": 2,
      "Level1+2+3": 3,
    },
    fromApi: {
      1: "Level1",
      2: "Level1+2",
      3: "Level1+2+3",
    },
  },
};
