#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";
import { encrypt, decrypt, isEncrypted } from "./crypto";
import { findFiles, loadConfig } from "./files";

const USAGE = `claude-vault — encrypt markdown files at rest

Usage:
  claude-vault setup   [--root <dir>]    Full setup: config + hooks + first encrypt
  claude-vault encrypt [--root <dir>]    Lock files
  claude-vault decrypt [--root <dir>]    Unlock files
  claude-vault status  [--root <dir>]    Show lock state
  claude-vault keygen                    Generate a strong random key
  claude-vault clean   [--root <dir>]    Delete .bak backup files
  claude-vault init    [--root <dir>]    Create config only (no hooks, no encrypt)
  claude-vault hook-decrypt              Pre-tool hook (internal)
  claude-vault hook-encrypt              Post-session hook (internal)

Environment:
  CLAUDE_VAULT_KEY    Passphrase. Required. Min 8 chars.`;

function getKey(): string {
  const key = process.env.CLAUDE_VAULT_KEY;
  if (!key) {
    console.error("CLAUDE_VAULT_KEY not set. Export it first.");
    process.exit(1);
  }
  if (key.length < 8) {
    console.error("CLAUDE_VAULT_KEY too short (min 8 chars).");
    process.exit(1);
  }
  return key;
}

function getRoot(args: string[]): string {
  const i = args.indexOf("--root");
  return (i !== -1 && args[i + 1]) ? path.resolve(args[i + 1]) : process.cwd();
}

function cmdEncrypt(root: string, quiet = false) {
  const key = getKey();
  const { patterns } = loadConfig(root);
  const files = findFiles(root, patterns);

  if (!files.length) { if (!quiet) console.log("No files matched."); return; }

  let locked = 0, skipped = 0;
  for (const f of files) {
    const buf = fs.readFileSync(f);
    if (isEncrypted(buf)) { skipped++; continue; }

    const bak = f + ".bak";
    if (!fs.existsSync(bak)) fs.writeFileSync(bak, buf);

    fs.writeFileSync(f, encrypt(buf.toString("utf8"), key));
    locked++;
    if (!quiet) console.log(`  locked: ${path.relative(root, f)}`);
  }

  if (!quiet) console.log(`\n${locked} locked, ${skipped} already locked.`);
}

function cmdDecrypt(root: string, quiet = false) {
  const key = getKey();
  const { patterns } = loadConfig(root);
  const files = findFiles(root, patterns);

  if (!files.length) { if (!quiet) console.log("No files matched."); return; }

  let unlocked = 0, skipped = 0;
  for (const f of files) {
    const buf = fs.readFileSync(f);
    if (!isEncrypted(buf)) { skipped++; continue; }

    fs.writeFileSync(f, decrypt(buf, key), "utf8");
    unlocked++;
    if (!quiet) console.log(`  unlocked: ${path.relative(root, f)}`);
  }

  if (!quiet) console.log(`\n${unlocked} unlocked, ${skipped} already unlocked.`);
}

function cmdStatus(root: string) {
  const { patterns } = loadConfig(root);
  const files = findFiles(root, patterns);

  if (!files.length) { console.log("No files matched."); return; }

  let lk = 0, ul = 0;
  for (const f of files) {
    const buf = fs.readFileSync(f);
    const state = isEncrypted(buf);
    const rel = path.relative(root, f);
    console.log(`  ${state ? "[locked]  " : "[unlocked]"} ${rel}`);
    state ? lk++ : ul++;
  }
  console.log(`\n${lk} locked, ${ul} unlocked.`);
}

function cmdInit(root: string) {
  const cfgPath = path.join(root, ".claude-vault");
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, [
      "# files to encrypt (one pattern per line)",
      "CLAUDE.md",
      "SKILL.md",
      "CONTRIBUTING.md",
      "memory/*.md",
      ".claude/**/*.md",
    ].join("\n") + "\n");
    console.log("Created .claude-vault");
  }

  const giPath = path.join(root, ".gitignore");
  let gi = fs.existsSync(giPath) ? fs.readFileSync(giPath, "utf8") : "";
  if (!gi.includes("*.bak")) {
    gi += "\n# claude-vault backups\n*.bak\n";
    fs.writeFileSync(giPath, gi);
    console.log("Added *.bak to .gitignore");
  }
}

function installHooks(root: string) {
  // find or create .claude/settings.json
  const claudeDir = path.join(root, ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");

  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch { settings = {}; }
  }

  if (!settings.hooks) settings.hooks = {};

  // PreToolUse — decrypt before Claude reads anything
  const preHook = {
    matcher: "Read|Grep|Glob",
    hook: `claude-vault hook-decrypt --root "${root}"`,
  };

  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  const hasPreHook = settings.hooks.PreToolUse.some((h: any) =>
    typeof h.hook === "string" && h.hook.includes("claude-vault")
  );
  if (!hasPreHook) {
    settings.hooks.PreToolUse.push(preHook);
    console.log("Added PreToolUse hook (decrypt before read).");
  }

  // PostSession — encrypt when session ends
  const postHook = {
    hook: `claude-vault hook-encrypt --root "${root}"`,
  };

  if (!settings.hooks.PostSession) settings.hooks.PostSession = [];
  const hasPostHook = settings.hooks.PostSession.some((h: any) =>
    typeof h.hook === "string" && h.hook.includes("claude-vault")
  );
  if (!hasPostHook) {
    settings.hooks.PostSession.push(postHook);
    console.log("Added PostSession hook (encrypt on exit).");
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`Hooks saved to ${settingsPath}`);
}

function cmdSetup(root: string) {
  console.log(`claude-vault setup — ${root}\n`);

  // step 1: config
  cmdInit(root);

  // step 2: hooks
  installHooks(root);

  // step 3: first encrypt
  console.log("");
  cmdEncrypt(root);

  console.log("\nDone. Files are locked. Hooks will auto-decrypt/encrypt on Claude Code sessions.");
}

function cmdClean(root: string) {
  const { patterns } = loadConfig(root);
  const files = findFiles(root, patterns);
  let removed = 0;

  for (const f of files) {
    const bak = f + ".bak";
    if (fs.existsSync(bak)) {
      fs.unlinkSync(bak);
      removed++;
      console.log(`  removed: ${path.relative(root, bak)}`);
    }
  }
  console.log(removed > 0 ? `\n${removed} backup(s) deleted.` : "No backups found.");
}

function cmdKeygen() {
  const key = randomBytes(32).toString("base64url");
  console.log(key);
  console.log(`\nAdd to your shell profile:\n  export CLAUDE_VAULT_KEY="${key}"`);
}

// ---

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === "--help" || cmd === "-h") { console.log(USAGE); }
else if (cmd === "setup") cmdSetup(getRoot(args));
else if (cmd === "keygen") cmdKeygen();
else if (cmd === "clean") cmdClean(getRoot(args));
else if (cmd === "encrypt") cmdEncrypt(getRoot(args));
else if (cmd === "decrypt") cmdDecrypt(getRoot(args));
else if (cmd === "status") cmdStatus(getRoot(args));
else if (cmd === "init") cmdInit(getRoot(args));
else if (cmd === "hook-decrypt") { if (!process.env.CLAUDE_VAULT_KEY) process.exit(0); cmdDecrypt(getRoot(args), true); }
else if (cmd === "hook-encrypt") { if (!process.env.CLAUDE_VAULT_KEY) process.exit(0); cmdEncrypt(getRoot(args), true); }
else { console.error(`Unknown: ${cmd}`); console.log(USAGE); process.exit(1); }
