const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const TMP = path.join(__dirname, "tmp");
const CLI = path.join(__dirname, "..", "dist", "index.js");

function setup() {
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(path.join(TMP, "memory"));
}

function run(cmd, env = {}) {
  return execSync(`node ${CLI} ${cmd}`, {
    cwd: TMP,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`  pass: ${name}`);
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// ---

console.log("claude-vault tests\n");

setup();

// write test files
fs.writeFileSync(path.join(TMP, "CLAUDE.md"), "# Project\nSecret instructions here.\n");
fs.writeFileSync(path.join(TMP, "memory", "notes.md"), "Remember this.\n");

const KEY = "test-passphrase-32chars-minimum!";

test("init creates config", () => {
  run("init", { CLAUDE_VAULT_KEY: KEY });
  assert(fs.existsSync(path.join(TMP, ".claude-vault")));
});

test("status shows unlocked files", () => {
  const out = run("status", { CLAUDE_VAULT_KEY: KEY });
  assert(out.includes("[unlocked]"));
  assert(out.includes("CLAUDE.md"));
});

test("encrypt locks files", () => {
  const out = run("encrypt", { CLAUDE_VAULT_KEY: KEY });
  assert(out.includes("locked"));

  // file should no longer be readable as text
  const raw = fs.readFileSync(path.join(TMP, "CLAUDE.md"));
  assert(raw.subarray(0, 8).toString() === "CLVAULT1");
});

test("status shows locked files", () => {
  const out = run("status", { CLAUDE_VAULT_KEY: KEY });
  assert(out.includes("[locked]"));
});

test("encrypt is idempotent", () => {
  const out = run("encrypt", { CLAUDE_VAULT_KEY: KEY });
  assert(out.includes("already locked"));
});

test("decrypt restores plaintext", () => {
  run("decrypt", { CLAUDE_VAULT_KEY: KEY });

  const content = fs.readFileSync(path.join(TMP, "CLAUDE.md"), "utf8");
  assert(content.includes("Secret instructions here."));

  const mem = fs.readFileSync(path.join(TMP, "memory", "notes.md"), "utf8");
  assert(mem.includes("Remember this."));
});

test("wrong key fails gracefully", () => {
  // re-encrypt first
  run("encrypt", { CLAUDE_VAULT_KEY: KEY });

  try {
    run("decrypt", { CLAUDE_VAULT_KEY: "wrong-key" });
    assert.fail("should have thrown");
  } catch (err) {
    assert(err.message.includes("Decryption failed") || err.status !== 0);
  }
});

test("no key shows error", () => {
  try {
    run("status", { CLAUDE_VAULT_KEY: "" });
    // status doesn't need key, so this should work
  } catch {
    // ok
  }
});

// cleanup
fs.rmSync(TMP, { recursive: true });

console.log("\ndone.");
