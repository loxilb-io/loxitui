PROJECT     := loxitui
VERSION     := 0.1.0
BIN_DIR     := bin
DIST_DIR    := dist

# Platform targets
LINUX_AMD64 := $(DIST_DIR)/$(PROJECT)-linux-amd64
LINUX_ARM64 := $(DIST_DIR)/$(PROJECT)-linux-arm64
MACOS_AMD64 := $(DIST_DIR)/$(PROJECT)-darwin-amd64
MACOS_ARM64 := $(DIST_DIR)/$(PROJECT)-darwin-arm64

.PHONY: all dev build build-all build-linux build-macos test lint typecheck clean install

## Default: build for the current platform
all: build

## Run in development mode (live reload via bun --watch)
dev:
	bun --watch src/cli.tsx

## Build for current platform into bin/
build:
	@mkdir -p $(BIN_DIR)
	bun build src/cli.tsx --compile --outfile $(BIN_DIR)/$(PROJECT)
	@echo "Binary: $(BIN_DIR)/$(PROJECT)"

## Build for all supported platforms
build-all: build-linux build-macos

build-linux:
	@mkdir -p $(DIST_DIR)
	bun build src/cli.tsx --compile --target bun-linux-x64 --outfile $(LINUX_AMD64)
	bun build src/cli.tsx --compile --target bun-linux-arm64 --outfile $(LINUX_ARM64)
	@echo "Linux binaries: $(LINUX_AMD64) $(LINUX_ARM64)"

build-macos:
	@mkdir -p $(DIST_DIR)
	bun build src/cli.tsx --compile --target bun-darwin-x64 --outfile $(MACOS_AMD64)
	bun build src/cli.tsx --compile --target bun-darwin-arm64 --outfile $(MACOS_ARM64)
	@echo "macOS binaries: $(MACOS_AMD64) $(MACOS_ARM64)"

## Run tests
test:
	bun test tests/

## TypeScript type check (no emit)
typecheck:
	bun run typecheck

## Lint with Biome
lint:
	bunx biome check src/ tests/

## Install to /usr/local/bin (requires root or sudo)
install: build
	cp $(BIN_DIR)/$(PROJECT) /usr/local/bin/$(PROJECT)
	@echo "Installed: /usr/local/bin/$(PROJECT)"

## Install to ~/.local/bin (user-local, no sudo)
install-user: build
	@mkdir -p $$HOME/.local/bin
	cp $(BIN_DIR)/$(PROJECT) $$HOME/.local/bin/$(PROJECT)
	@echo "Installed: $$HOME/.local/bin/$(PROJECT)"

## Remove build artifacts
clean:
	rm -rf $(BIN_DIR) $(DIST_DIR)

## Show help
help:
	@grep -E '^##' $(MAKEFILE_LIST) | sed 's/## //'
