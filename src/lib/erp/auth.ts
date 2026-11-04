const ITERATIONS = 210_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function hashPassword(password: string, salt?: string) {
  const saltBytes = salt ? base64ToBytes(salt) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes as BufferSource, iterations: ITERATIONS },
    material,
    256,
  );
  return {
    passwordHash: bytesToBase64(new Uint8Array(bits)),
    passwordSalt: bytesToBase64(saltBytes),
  };
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const actual = await hashPassword(password, salt);
  const left = base64ToBytes(actual.passwordHash);
  const right = base64ToBytes(expected);
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left[index] ^ right[index];
  return different === 0;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    return "Password must include a letter and a number.";
  return null;
}

/** Deterministic regression check used by browser smoke tests. */
export async function testCredentialRoundTrip(): Promise<boolean> {
  const password = "RoundTrip123";
  const fixedSalt = "AAECAwQFBgcICQoLDA0ODw==";
  const credential = await hashPassword(password, fixedSalt);
  return (
    credential.passwordSalt === fixedSalt &&
    (await verifyPassword(password, credential.passwordSalt, credential.passwordHash)) &&
    !(await verifyPassword("WrongPassword1", credential.passwordSalt, credential.passwordHash))
  );
}
