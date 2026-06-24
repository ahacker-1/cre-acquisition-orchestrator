#!/usr/bin/env node
const path = require('path');
const { getCodexStatus } = require('./lib/codex-cli');

const BASE_DIR = path.resolve(__dirname, '..');

function main() {
  const status = getCodexStatus(BASE_DIR);
  if (!status.installed) {
    console.error('Codex CLI is not installed.');
    console.error('Install it with: npm install -g @openai/codex');
    if (status.error) console.error(status.error);
    process.exit(1);
  }

  console.log(`Codex CLI: ${status.version}`);
  console.log(`Login: ${status.loginStatus || 'unknown'}`);

  if (!status.loggedIn) {
    console.error('Codex is installed but not logged in.');
    console.error('Run: codex login');
    process.exit(1);
  }

  console.log(`ChatGPT auth: ${status.usingChatGpt ? 'confirmed' : 'not confirmed'}`);
  console.log(`Live agents ready: ${status.usingChatGpt ? 'yes' : 'no'}`);

  if (!status.usingChatGpt) {
    console.warn('Codex is logged in, but the status did not confirm ChatGPT auth.');
    console.warn('For subscription-based usage, run codex logout, then codex login and choose ChatGPT.');
  }
}

main();
