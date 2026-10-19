# Releasing loxitui

Every release is approved by a code owner. Nothing is built for publication or
attached to a GitHub release until that approval is given.

## Controls

| Control | Where | Effect |
|---|---|---|
| Code-owner review on `main` | branch protection (`scripts/apply-governance.sh`) | PRs merge only with CI green + one approval from a `.github/CODEOWNERS` owner; admins are not exempt |
| Tag ruleset | repo rules | only repository admins can create/move/delete `v*` tags |
| `release` Environment | repo environments | `release.yml` `authorize` job pauses until a required reviewer (code owner) approves; self-approval prevented |

## Steps

1. Open a PR updating `CHANGELOG.md` and `packaging/changelog.yaml`; get CI green and code-owner approval; merge.
2. A maintainer tags the merge commit: `git tag -s vX.Y.Z[-rc.N] && git push origin vX.Y.Z`.
3. The **Release** workflow starts and waits at *authorize release*. A code owner (other than the person who pushed the tag) reviews and approves the pending deployment.
4. After approval the workflow verifies, builds tarballs + `.deb`/`.rpm`, runs package sanity, then publishes the GitHub release with `SHA256SUMS`, a Cosign signature, an SPDX SBOM and build provenance. `-rc.N` tags publish as pre-releases.

Maintainer-only setup: `OWNER_HANDLES="…" scripts/apply-governance.sh --apply`.
