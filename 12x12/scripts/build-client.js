#!/usr/bin/env node

/**
 * Runs the CRA build with constrained Node heap so the process
 * stays within low-memory build environments.
 */
const { spawn } = require('child_process');

const env = { ...process.env };
env.NODE_OPTIONS = [env.NODE_OPTIONS, '--max_old_space_size=512']
  .filter(Boolean)
  .join(' ')
  .trim();

const child = spawn(
  'npm',
  ['--prefix', 'client', 'run', 'build'],
  {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32'
  }
);

child.on('exit', code => {
  process.exit(code ?? 0);
});
