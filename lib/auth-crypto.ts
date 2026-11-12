import { scryptAsync } from "@noble/hashes/scrypt.js";

const encoder = new TextEncoder();
const options = { N: 32768, r: 8, p: 3, dkLen: 32, maxmem: 40 * 1024 * 1024 };
const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) =>
  Uint8Array.from(value.match(/../g) ?? [], (s) => parseInt(s, 16));

export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function tokenHash(value: string) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await scryptAsync(encoder.encode(password), salt, options);
  return `scrypt$32768$8$3$${hex(salt)}$${hex(key)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  if (!/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded))
    return false;
  const [, , , , salt, expected] = encoded.split("$");
  const actual = await scryptAsync(
    encoder.encode(password),
    unhex(salt),
    options,
  );
  const target = unhex(expected);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ target[i];
  return difference === 0;
}

// Verify a real KDF even for an unknown email, without revealing account existence.
export const dummyPasswordHash = `scrypt$32768$8$3$${"0".repeat(32)}$${"0".repeat(64)}`;
