# syntax=docker/dockerfile:1
#
# loxitui container image.
#
# Build stage always runs on the build host's native platform
# ($BUILDPLATFORM) and cross-compiles for $TARGETARCH, so multi-arch
# images build without QEMU emulation. The runtime stage contains no RUN
# instructions for the same reason.
#
# Run interactively:
#   docker run -it --rm ghcr.io/loxilb-io/loxitui
# Persist configuration:
#   docker run -it --rm -v loxitui-config:/tmp/.config ghcr.io/loxilb-io/loxitui

FROM --platform=$BUILDPLATFORM oven/bun:1.4.4 AS build
WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install --frozen-lockfile

COPY scripts ./scripts
COPY src ./src
COPY swagger_new.yml ./

ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) ./scripts/fetch-platform-deps.sh core-linux-x64 && \
             bun build --compile --minify --target=bun-linux-x64-modern src/cli.tsx --outfile /out/loxitui ;; \
      arm64) ./scripts/fetch-platform-deps.sh core-linux-arm64 && \
             bun build --compile --target=bun-linux-arm64 src/cli.tsx --outfile /out/loxitui ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac

# Runtime: slim Debian (ships ncurses-base terminfo needed by a TUI),
# non-root, no shell commands executed (keeps multi-arch QEMU-free).
FROM debian:bookworm-slim AS runtime

COPY --from=build /out/loxitui /usr/local/bin/loxitui
COPY loxilb-knowledge /usr/local/share/loxitui/loxilb-knowledge
COPY LICENSE NOTICE /usr/local/share/doc/loxitui/

ENV LOXILB_KNOWLEDGE_PATH=/usr/local/share/loxitui/loxilb-knowledge \
    TERM=xterm-256color \
    HOME=/tmp

USER 65534:65534

ENTRYPOINT ["loxitui"]
