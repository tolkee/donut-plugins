import { type KeyObject, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

export const KEYCHAIN_SERVICE = "donut-plugins-index";

const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

export function privateKeyFromSeed(seed: Uint8Array): KeyObject {
  if (seed.length !== 32) throw new Error("an ed25519 seed is 32 bytes");
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
}

export function privateKeyFromPkcs8(base64: string): KeyObject {
  const key = createPrivateKey({ key: Buffer.from(base64.trim(), "base64"), format: "der", type: "pkcs8" });
  if (key.asymmetricKeyType !== "ed25519") throw new Error(`the key is ${key.asymmetricKeyType}, not ed25519`);
  return key;
}

export function pkcs8Base64(key: KeyObject): string {
  return key.export({ format: "der", type: "pkcs8" }).toString("base64");
}

export function rawPublicKey(key: KeyObject): string {
  const spki = createPublicKey(key).export({ format: "der", type: "spki" });
  return spki.subarray(spki.length - 32).toString("base64");
}

export function publicKeyFromRaw(base64: string): KeyObject {
  const raw = Buffer.from(base64, "base64");
  if (raw.length !== 32) throw new Error("an ed25519 public key is 32 bytes");
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519, raw]), format: "der", type: "spki" });
}

export function signBytes(bytes: Uint8Array, key: KeyObject): string {
  return sign(null, bytes, key).toString("base64");
}

export function verifyBytes(bytes: Uint8Array, signature: string, publicKey: string): boolean {
  const raw = Buffer.from(signature.trim(), "base64");
  return raw.length === 64 && verify(null, bytes, publicKeyFromRaw(publicKey), raw);
}

export function generateKey(): KeyObject {
  return generateKeyPairSync("ed25519").privateKey;
}
