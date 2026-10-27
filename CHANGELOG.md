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
- Typed API clients for the 42 operations the gateway added: AI objectives,
  network identities, JWT auth profiles, per-user and default rate limits,
  model profiles, KV inventory and KV-exact status, API key PATCH,
  readiness, capabilities, diagnostics, maintenance, half-close, the
  management audit trail, sockmap reset and DPU debug.
- YAML kinds `AiObjective`, `AiNetIdentity`, `AiJwtAuthProfile`,
  `AiUserRateLimit`, `AiRateLimitDefaults`, `HalfClose`, `AuditPolicy` and
  `AuditSink`.
- AI tabs for model profiles, objectives, network identities and JWT auth
  profiles; KV-exact state in the LB detail pane; a gateway health line on
  the dashboard.
- Twelve read-only assistant/MCP tools for the new reads.

### Changed
- YAML CRUD paths aligned with the gateway router; guides and the bundled
  knowledge base re-synced with the reduced feature set.
- Bundled `swagger_new.yml` synced to the current gateway API, with
  `swagger-extras.yml` vendored beside it for the raw-handler routes.
- LoadBalancer `security` follows the gateway's 0-2 numbering (`https`/`tls`
  map to 1, `e2ehttps` to 2), and `mode` 6 (`aigw`) is no longer accepted.
- Deleting a LoadBalancer rule names its `model_name`, so rules on one
  VIP/port/protocol that differ only by model are told apart (YAML identity,
  TUI delete, `:delete lb ... --model`).

### Removed
- Unstable surfaces dropped from the TUI, YAML kinds, and API client:
  SynFlood, LLM catalogs, PII detection, LlamaFirewall, topology
  (nodegraph), log archives, and session-ULCL.

### Fixed
- The test suite and the schema generator run on Windows.

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
