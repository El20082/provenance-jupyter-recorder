#!/usr/bin/env node
// Runs Vitest from the real path of the working directory.
//
// On Windows a shell can start in `c:\...` while Node resolves modules under `C:\...`.
// Vitest then loads two copies of itself and every suite fails with "Vitest failed to
// find the current suite". realpathSync.native returns the canonical drive-letter case.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

const cwd = realpathSync.native(process.cwd());
const bin = join(cwd, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
