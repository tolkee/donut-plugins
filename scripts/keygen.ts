import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { KEYCHAIN_SERVICE, generateKey, pkcs8Base64, privateKeyFromPkcs8, rawPublicKey } from "./lib/sign.ts";

export const KEYCHAIN_ACCOUNT = "donut";

export function addCommand(privateKey: string): string {
  if (!/^[A-Za-z0-9+/=]+$/.test(privateKey)) throw new Error("the key must be base64");
  return `add-generic-password -s ${KEYCHAIN_SERVICE} -a ${KEYCHAIN_ACCOUNT} -T "" -w ${privateKey}\n`;
}

function securityInteractive(line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("security", ["-i"], { stdio: ["pipe", "ignore", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`security exited with ${code}`))));
    child.stdin.end(line);
  });
}

async function main(): Promise<number> {
  if (process.platform !== "darwin") throw new Error("keygen stores the key in the macOS Keychain");
  const exists = await promisify(execFile)("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE]).then(() => true, () => false);
  if (exists) {
    console.error(`✗ the Keychain already holds "${KEYCHAIN_SERVICE}": keygen never overwrites it`);
    return 1;
  }
  const key = generateKey();
  const privateKey = pkcs8Base64(key);
  await securityInteractive(addCommand(privateKey));

  console.log("Reading the key back: macOS asks for your password, which shows every read prompts.");
  const { stdout } = await promisify(execFile)("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"]);
  if (pkcs8Base64(privateKeyFromPkcs8(stdout)) !== privateKey) throw new Error("the Keychain item doesn't hold the generated key");

  console.log(`\nPublic key for Donut's TRUSTED_KEYS (crates/donut-core/src/plugins/index.rs):\n\n  ${rawPublicKey(key)}\n`);
  console.log("Keep an offline backup now: copy the private key into a password manager entry with");
  console.log(`  security find-generic-password -s ${KEYCHAIN_SERVICE} -w`);
  console.log("Losing it means shipping a Donut update with a new trusted key.");
  return 0;
}

if (import.meta.main) process.exit(await main());
