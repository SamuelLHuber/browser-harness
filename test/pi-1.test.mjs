import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand, formatRunResult, pythonString } from '../pi-extension/src/harness.ts';

test('Pi 1 command registrations cannot collide with Playwright', async () => {
  const { loadExtensions } = await import(new URL('./core/extensions/loader.js', import.meta.resolve('@earendil-works/pi-coding-agent')));
  const { resolve } = await import('node:path');
  const result = await loadExtensions([resolve('pi-extension/src/index.ts')], process.cwd());
  assert.deepEqual(result.errors, []);
  const commands = result.extensions[0].commands;
  assert.equal(commands.has('browser'), false);
  assert.equal(commands.has('browser-open'), false);
  assert.equal(commands.has('browser-harness-open'), true);
});

test('subprocess results and quoting retain their contract', async () => {
  const result = await runCommand(process.execPath, ['-e', 'console.log("fixture"); console.error("diagnostic")'], { cwd: process.cwd(), timeoutMs: 1000 });
  assert.equal(result.code, 0);
  assert.equal(result.killed, false);
  assert.match(formatRunResult(result), /fixture.*stderr:/s);
  assert.equal(pythonString('a"b\n'), JSON.stringify('a"b\n'));
});
test('missing executables produce an actionable failure result', async () => {
  const result = await runCommand('/pi-fixture-does-not-exist', [], { cwd: process.cwd(), timeoutMs: 1000 });
  assert.equal(result.code, 127);
  assert.match(result.stderr, /ENOENT/);
});
test('timeout escalates even when the child ignores SIGTERM', async () => {
  const start = Date.now();
  const result = await runCommand(process.execPath, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], { cwd: process.cwd(), timeoutMs: 300 });
  assert.equal(result.killed, true);
  assert.equal(result.code, null);
  assert.ok(Date.now() - start < 8000);
});
test('cancellation closes the child and releases its listener', async () => {
  const controller = new AbortController();
  const pending = runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: process.cwd(), timeoutMs: 10000, signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  const result = await pending;
  assert.equal(result.killed, true);
});
