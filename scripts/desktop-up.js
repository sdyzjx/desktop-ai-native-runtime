#!/usr/bin/env node
const path = require('node:path');
const { spawn } = require('node:child_process');

const electronBinary = require('electron');

const entry = path.join(__dirname, '..', 'apps', 'desktop-live2d', 'main', 'electronMain.js');
const child = spawn(electronBinary, [entry], {
  cwd: path.join(__dirname, '..'),
  env: process.env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('[desktop:up] failed to start electron:', err.message || err);
  process.exit(1);
});
