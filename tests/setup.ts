// Test setup preload — runs before all test files (see bunfig.toml).
//
// Restore all spyOn() mocks after every test. Several suites spy on shared
// singletons (schemaRegistry, adapterRegistry) in beforeEach without
// restoring; bun test executes files in filesystem-discovery order, which
// differs across platforms (macOS vs Linux CI), so a leaked spy poisons
// whichever files happen to run later. This global hook makes test order
// irrelevant.
import { afterEach, mock } from "bun:test";

afterEach(() => {
  mock.restore();
});
