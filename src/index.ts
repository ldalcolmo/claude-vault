#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { encrypt, decrypt, isEncrypted } from "./crypto";
import { findFiles, loadConfig } from "./files";

const USAGE = `claude-vault — encrypt markdown files at rest

Usage:
  claude-vault encrypt [--root <dir>]    Lock files
  claude-vault decrypt [--root <dir>]    Unlock files
  claude-vault status  [--root <dir>]    Show lock state
  claude-vault init    [--root <dir>]    Setup config + gitignore
  claude-vault hook-decrypt              Pre-session hook (internal)
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

function cmdEncrypt(root: string) {
  const key = getKey();
  const { patterns } = loadConfig(root);
  const files = findFiles(root, patterns);

  if (!files.length) { console.log("No files matched."); return; }

  let locked = 0, skipped = 0;
  for (const f of files) {
    const buf = fs.readFileSync(f);
    if (isEncrypted(buf)) { skipped++; continue; }

    // first-time backup
    const bak = f + ".bak";
    if (!fs.existsSync(bak)) fs.writeFileSync(bak, buf);

    fs.writeFileSync(f, encrypt(buf.toString("utf8"), key));
    locked++;
    console.log(`  locked: ${path.relative(root, f)}`);
  }

  console.log(`\n${locked} locked, ${skipped} already locked.`);
}

function cmdDecrypt(root: string) {
  const key = getKey();
  const { patterns } = loadConfig(root);
  const files = findFiles(root, patterns);

  if (!files.length) { console.log("No files matched."); return; }

  let unlocked = 0, skipped = 0;
  for (const f of files) {
    const buf = fs.readFileSync(f);
    if (!isEncrypted(buf)) { skipped++; continue; }

    fs.writeFileSync(f, decrypt(buf, key), "utf8");
    unlocked++;
    console.log(`  unlocked: ${path.relative(root, f)}`);
  }

  console.log(`\n${unlocked} unlocked, ${skipped} already unlocked.`);
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

  // .gitignore
  const giPath = path.join(root, ".gitignore");
  let gi = fs.existsSync(giPath) ? fs.readFileSync(giPath, "utf8") : "";
  if (!gi.includes("*.bak")) {
    gi += "\n# claude-vault backups\n*.bak\n";
    fs.writeFileSync(giPath, gi);
    console.log("Added *.bak to .gitignore");
  }

  console.log(`
Add to .claude/settings.json for auto-lock:

{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Read|Grep|Glob",
      "hook": "claude-vault hook-decrypt"
    }],
    "PostSession": [{
      "hook": "claude-vault hook-encrypt"
    }]
  }
}
`);
}

// ---

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === "--help" || cmd === "-h") { console.log(USAGE); }
else if (cmd === "encrypt" || cmd === "hook-encrypt") cmdEncrypt(getRoot(args));
else if (cmd === "decrypt" || cmd === "hook-decrypt") cmdDecrypt(getRoot(args));
else if (cmd === "status") cmdStatus(getRoot(args));
else if (cmd === "init") cmdInit(getRoot(args));
else { console.error(`Unknown: ${cmd}`); console.log(USAGE); process.exit(1); }
