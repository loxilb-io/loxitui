# Packaging

In-repo [nfpm](https://nfpm.goreleaser.com/) packaging that produces the
`.deb`, `.rpm`, and binary-tarball release artifacts for loxitui.
`release.yml` runs this on every release tag (after code-owner approval of the
`release` Environment); `package-sanity.yml` validates the output before
anything is published.

| File | Purpose |
|------|---------|
| `nfpm.yaml` | Package definition for deb and rpm |
| `build-pkgs.sh` | Driver: build binary → nfpm → tarball |
| `copyright`, `changelog.yaml`, `lintian-overrides` | Debian metadata |

```sh
packaging/build-pkgs.sh --version v0.1.0 --arch amd64   # output in dist/
```

| tag | package version | revision |
| --- | --- | --- |
| `v0.1.0` | `0.1.0` | `1` |
| `v0.1.0-rc.1` | `0.1.0` | `1~rc.1` |
