# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public issue.** Instead, email security concerns to info@theaiconsultingnetwork.com with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if you have one)

I'll acknowledge receipt within 48 hours and work with you on a fix before any public disclosure.

## Scope

This project is a reference architecture and simulation framework. It does not process real financial data or connect to external APIs by default. The offline simulation and dashboard storage write local files under `data/`.

Optional live Codex runs are different: they send selected prompts and deal context through OpenAI Codex CLI using the user's ChatGPT-authenticated session. Do not run live Codex workflows on confidential deal data unless that data is approved for that environment. If you extend the project with real API integrations or production deal data, standard application security practices apply.

Codex authentication is intentionally local. The dashboard's **Login to ChatGPT** button starts `codex login` on the user's machine and the status API reports only booleans such as `installed`, `loggedIn`, and `usingChatGpt`. It does not expose access tokens, refresh tokens, API keys, cookies, or credential file contents. Runtime outputs under `data/` are ignored by git.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.5.x   | Yes       |
| 2.4.x   | Security fixes only |
| 2.3.x and older | End of life |
