# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- JWT authentication (`username`/`password` login via `/auth/login`), per-rule
  LB statistics, gateway lifecycle commands, and AI-ops API coverage.
- Live-gateway E2E test suite (`tests/e2e`) with a per-PR containerised run
  and a nightly full practical cycle on a hardware testbed.
- CI enforcement of the DCO `Signed-off-by` requirement documented in
  CONTRIBUTING.md.

### Changed
- YAML CRUD paths aligned with the gateway router; guides and the bundled
  knowledge base re-synced with the reduced feature set.

### Removed
- Unstable surfaces dropped from the TUI, YAML kinds, and API client:
  SynFlood, LLM catalogs, PII detection, LlamaFirewall, topology
  (nodegraph), log archives, and session-ULCL.

## [0.1.0-rc.1] - 2026-08-01

### Added
- Initial import of loxitui: a Bun/TypeScript/React terminal UI for LoxiLB
  and the LoxiLB inference gateway.
  - Live monitoring panels (dashboard, load balancers, endpoints, sessions,
    firewall, BGP, logs) over the LoxiLB REST API.
  - CRUD forms for LoxiLB resources.
  - Prometheus metrics panel.
  - Declarative YAML configuration management: validate, diff, apply,
    rollback, export, snapshot versioning.
  - Optional AI assistant sidebar (Claude CLI or Ollama) with a bundled
    LoxiLB knowledge base; fully functional without any AI provider.
  - MCP (Model Context Protocol) server mode.
- User and developer documentation: user guide, YAML config guide,
  keyboard reference, AI sidebar guide (AI-optional by design), MCP server
  guide, and developer guide under `docs/`; README with architecture
  diagram, install paths (release binaries / container / source), and
  scope statement.
- LoxiLB knowledge base synced against the loxilb-inference-gateway
  documentation and API spec, with per-file provenance headers.
- Project governance: Apache-2.0 LICENSE and NOTICE, CONTRIBUTING (DCO,
  Conventional Commits), Code of Conduct (Contributor Covenant 2.1),
  SECURITY policy, GOVERNANCE, MAINTAINERS, issue/PR templates, CODEOWNERS,
  Dependabot, secret-scan and release-hygiene tooling.
- Container image publishing and a signed, gated release pipeline
  (per-target binaries, `SHA256SUMS`, SPDX SBOM, SLSA build provenance,
  Cosign-signed multi-arch images).

[Unreleased]: https://github.com/loxilb-io/loxitui/compare/v0.1.0-rc.1...HEAD
[0.1.0-rc.1]: https://github.com/loxilb-io/loxitui/releases/tag/v0.1.0-rc.1
