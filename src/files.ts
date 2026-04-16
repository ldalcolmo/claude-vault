import * as fs from "fs";
import * as path from "path";

const DEFAULT_PATTERNS = [
  "CLAUDE.md",
  "SKILL.md",
  "CONTRIBUTING.md",
  "memory/*.md",
  ".claude/**/*.md",
];

export function loadConfig(root: string): { patterns: string[] } {
  const configPath = path.join(root, ".claude-vault");
  if (!fs.existsSync(configPath)) return { patterns: DEFAULT_PATTERNS };

  const lines = fs.readFileSync(configPath, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));

  return { patterns: lines.length > 0 ? lines : DEFAULT_PATTERNS };
}

export function findFiles(root: string, patterns: string[]): string[] {
  const found: Set<string> = new Set();

  for (const pattern of patterns) {
    if (pattern.includes("**")) {
      const prefix = pattern.split("**")[0];
      const suffix = pattern.split("**")[1]?.replace(/^\//, "") || "";
      const baseDir = path.join(root, prefix);
      if (fs.existsSync(baseDir)) walk(baseDir, suffix, found);
    } else if (pattern.includes("*")) {
      const dir = path.join(root, path.dirname(pattern));
      const glob = path.basename(pattern);
      if (!fs.existsSync(dir)) continue;
      const re = new RegExp("^" + glob.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
      for (const entry of fs.readdirSync(dir)) {
        if (re.test(entry)) found.add(path.join(dir, entry));
      }
    } else {
      const fp = path.join(root, pattern);
      if (fs.existsSync(fp)) found.add(fp);
    }
  }

  return [...found].sort();
}

function walk(dir: string, suffix: string, found: Set<string>): void {
  const re = suffix
    ? new RegExp(suffix.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$")
    : null;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, suffix, found);
    else if (!re || re.test(entry.name)) found.add(full);
  }
}
