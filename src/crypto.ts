import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const MAGIC = Buffer.from("CLVAULT1");

// PBKDF2 w/ sha512 — intentionally slow to resist brute force
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");
}

// Layout: MAGIC (8) | salt (32) | iv (16) | authTag (16) | ciphertext (...)
export function encrypt(plaintext: string, passphrase: string): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, salt, iv, tag, encrypted]);
}

export function decrypt(data: Buffer, passphrase: string): string {
  const minLen = MAGIC.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
  if (data.length < minLen) {
    throw new Error("File too short to be a valid vault file.");
  }

  const header = data.subarray(0, MAGIC.length);
  if (!header.equals(MAGIC)) {
    throw new Error("Not a vault file (missing CLVAULT1 header).");
  }

  let off = MAGIC.length;
  const salt = data.subarray(off, off + SALT_LENGTH); off += SALT_LENGTH;
  const iv = data.subarray(off, off + IV_LENGTH); off += IV_LENGTH;
  const tag = data.subarray(off, off + TAG_LENGTH); off += TAG_LENGTH;
  const ciphertext = data.subarray(off);

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Decryption failed. Wrong passphrase or corrupted file.");
  }
}

export function isEncrypted(data: Buffer): boolean {
  return data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}
