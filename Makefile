# loxitui Makefile
# VERSION is DERIVED from the git tag, never pinned in source.
GIT_DESCRIBE := $(shell git describe --tags --match 'v[0-9]*' 2>/dev/null)
VERSION      ?= $(if $(GIT_DESCRIBE),$(GIT_DESCRIBE),dev)
LDFLAGS       = -X 'github.com/loxilb-io/loxitui/internal/version.Version=$(VERSION)'
BIN           = bin/loxitui

.PHONY: build test lint version clean
build:
	@go build -trimpath -ldflags "$(LDFLAGS)" -o $(BIN) ./cmd/loxitui
	@echo "Built version: $(VERSION)"

test:
	go test ./...

lint:
	@test -z "$$(gofmt -l .)" || (gofmt -l . && echo "gofmt needed" && exit 1)
	go vet ./...

version:
	@echo $(VERSION)

clean:
	rm -rf bin dist packaging/.staging
