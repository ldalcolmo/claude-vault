# claude-vault

Encrypt your Claude Code `.md` files at rest. CLAUDE.md, SKILL.md, memory — anything you want private on disk and in git.

## The problem

Claude Code stores project instructions, skills, and memory as plain markdown files. If your repo is public (or if someone has access to your machine), they can read your custom prompts, workflows, and business logic. That's not great.

Same goes for AI memory systems like [obsidian-memory](https://github.com/topics/obsidian-memory) — they store session context, API keys, decisions, and project notes as `.md` files in an Obsidian vault. All readable by anyone who opens the folder.

## What this does

Locks those files with AES-256-GCM. They stay encrypted on disk and in version control. When you start a Claude Code session, they get decrypted. When the session ends, they lock again.

```
CLAUDE.md (readable) --[encrypt]--> binary blob (CLVAULT1 header)
                                        |
                    session starts, hook runs decrypt
                                        |
binary blob --------[decrypt]--> CLAUDE.md (readable, temporarily)
                                        |
                    session ends, hook runs encrypt
                                        |
CLAUDE.md (readable) --[encrypt]--> binary blob
```

## Install

```bash
npm install -g claude-vault
```

## Quick start

One command does everything — creates config, installs Claude Code hooks, encrypts your files:

```bash
export CLAUDE_VAULT_KEY="something-strong-here"
cd your-project
claude-vault setup
```

That's it. From now on, files decrypt when Claude Code reads them and encrypt when the session ends.

## Commands

| Command | What it does |
|---------|-------------|
| `setup` | Full setup: config + hooks + first encrypt. Run this once. |
| `encrypt` | Lock all matching files |
| `decrypt` | Unlock all matching files |
| `status` | Show which files are locked or unlocked |
| `keygen` | Generate a strong random passphrase |
| `clean` | Delete `.bak` backup files after you've confirmed the key works |
| `init` | Create config only (no hooks, no encrypt) |

All commands accept `--root <dir>` to target a specific directory.

## Config

Drop a `.claude-vault` file in your project root to control which files get encrypted:

```
# one pattern per line
CLAUDE.md
SKILL.md
memory/*.md
.claude/**/*.md
```

Without this file, the defaults above are used.

## How hooks work

`claude-vault setup` installs two hooks in `.claude/settings.json`:

- **PreToolUse** — runs `claude-vault hook-decrypt` before Claude reads any file (Read, Grep, Glob)
- **PostSession** — runs `claude-vault hook-encrypt` when the session ends

Hook commands run silently. You don't see output unless something fails.

## Works with Obsidian vaults

If you use an Obsidian-based memory system with Claude Code, claude-vault encrypts the entire vault. Tested with 32 files including `_KEYS.md`, `_DECISIONS.md`, session logs, and project notes — encrypt and decrypt in under a second, content fully preserved after round-trip.

Setup for an Obsidian vault:

```bash
export CLAUDE_VAULT_KEY="your-key"

# create a .claude-vault that catches everything
echo "**/*.md" > /path/to/your/vault/.claude-vault

# run setup
claude-vault setup --root /path/to/your/vault
```

All `.md` files in the vault become encrypted on disk. Obsidian won't be able to read them while locked — which is the point. Claude Code decrypts them when it needs to, and locks them again when done.

## How it works

- AES-256-GCM (authenticated encryption, prevents tampering)
- Key derived from passphrase via PBKDF2 (100k iterations, SHA-512)
- Each encryption gets a unique salt + IV — same file encrypted twice produces different output
- File format: `CLVAULT1` magic header + salt (32B) + IV (16B) + auth tag (16B) + ciphertext

## Things to know

- First `encrypt` creates `.bak` files as safety net. Delete them once you've confirmed your key works.
- **If you lose `CLAUDE_VAULT_KEY`, your files are unrecoverable.** No backdoor.
- Both encrypt and decrypt are idempotent — running twice doesn't break anything.
- The `.bak` files get added to `.gitignore` automatically.
- Hook commands are silent (no output) to avoid polluting Claude Code sessions.

## Dev

```bash
git clone https://github.com/ldalcolmo/claude-vault.git
cd claude-vault
npm install
npm run build
npm test
```

## License

MIT
