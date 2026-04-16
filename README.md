# claude-vault

Encrypt your Claude Code `.md` files at rest. CLAUDE.md, SKILL.md, memory — anything you want private on disk and in git.

## The problem

Claude Code stores project instructions, skills, and memory as plain markdown files. If your repo is public (or if someone has access to your machine), they can read your custom prompts, workflows, and business logic. That's not great.

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

## Usage

```bash
# set your key (add to .bashrc/.zshrc)
export CLAUDE_VAULT_KEY="something-strong-here"

# first time setup
claude-vault init

# lock everything
claude-vault encrypt

# check what's locked
claude-vault status

# unlock (you normally don't need this manually — hooks do it)
claude-vault decrypt
```

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

## Hooks

The point is to not think about it. Add this to `.claude/settings.json`:

```json
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
```

Files decrypt when Claude reads them, encrypt when the session ends. `claude-vault init` prints this snippet.

## How it works

- AES-256-GCM (authenticated encryption, prevents tampering)
- Key derived from passphrase via PBKDF2 (100k iterations, SHA-512)
- Each encryption gets a unique salt + IV — same file encrypted twice produces different output
- File format: `CLVAULT1` magic header + salt (32B) + IV (16B) + auth tag (16B) + ciphertext

## Things to know

- First `encrypt` creates `.bak` files as safety net. Delete them once you've confirmed your key works.
- **If you lose `CLAUDE_VAULT_KEY`, your files are unrecoverable.** No backdoor.
- Both encrypt and decrypt are idempotent — running twice doesn't break anything.
- The `.bak` files get added to `.gitignore` automatically by `init`.

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
