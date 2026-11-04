# Releasing loxitui

Every release is approved by a code owner. Nothing is built for publication or
attached to a GitHub release until that approval is given.

## Controls

| Control | Where | Effect |
|---|---|---|
| Code-owner review on `main` | branch protection (`scripts/apply-governance.sh`) | PRs merge only with CI green + one approval from a `.github/CODEOWNERS` owner; admins are not exempt |
| Tag ruleset | repo rules | only repository admins can create/move/delete `v*` tags |
| `release` Environment | repo environments | `release.yml` `release` job pauses until a required reviewer (code owner) approves; self-approval prevented |

## Steps

1. Open a PR updating `CHANGELOG.md` and the version in `package.json`, `src/cli.tsx` and `Makefile` (the Release workflow refuses a tag whose base version differs from `package.json`); get CI green and code-owner approval; merge.
2. A maintainer tags the merge commit: `git tag -s vX.Y.Z[-rc.N] && git push origin vX.Y.Z[-rc.N]`.
3. The **Release** workflow starts and waits for the `release` Environment approval. A code owner (other than the person who pushed the tag) reviews and approves the pending deployment.
4. After approval the workflow compiles the Linux/macOS binaries, smoke-tests the linux-x64 binary, gates the container image on a Trivy scan, then publishes the tarballs with `SHA256SUMS`, the multi-arch image to GHCR with a Cosign signature, an SPDX SBOM and build provenance. `-rc.N` tags publish as pre-releases.

Maintainer-only setup: `OWNER_HANDLES="…" scripts/apply-governance.sh --apply`.
