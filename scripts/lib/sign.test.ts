import { describe, expect, it } from "vitest";

import vector from "../fixtures/signing-vector.json" with { type: "json" };
import { parseIndex } from "./index.ts";
import { generateKey, pkcs8Base64, privateKeyFromPkcs8, privateKeyFromSeed, rawPublicKey, signBytes, verifyBytes } from "./sign.ts";

describe("ed25519 signing", () => {
  it("matches RFC 8032 test 1 (raw keys, raw signature)", () => {
    const key = privateKeyFromSeed(Buffer.from("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "hex"));
    expect(Buffer.from(rawPublicKey(key), "base64").toString("hex")).toBe("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    expect(Buffer.from(signBytes(Buffer.alloc(0), key), "base64").toString("hex")).toBe(
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    );
  });

  it("round-trips with a generated key stored as PKCS8", () => {
    const key = privateKeyFromPkcs8(pkcs8Base64(generateKey()));
    const body = Buffer.from('{"sequence":1,"plugins":[]}\n');
    const signature = signBytes(body, key);
    expect(verifyBytes(body, signature, rawPublicKey(key))).toBe(true);
    expect(verifyBytes(Buffer.from('{"sequence":2,"plugins":[]}\n'), signature, rawPublicKey(key))).toBe(false);
    expect(verifyBytes(body, signature, rawPublicKey(generateKey()))).toBe(false);
    expect(verifyBytes(body, "not a signature", rawPublicKey(key))).toBe(false);
  });

  it("reproduces the committed vector Donut's index::verify must accept", () => {
    const key = privateKeyFromSeed(Buffer.from(vector.seed, "hex"));
    expect(rawPublicKey(key)).toBe(vector.pub);
    expect(signBytes(Buffer.from(vector.body, "utf8"), key)).toBe(vector.sig);
    expect(verifyBytes(Buffer.from(vector.body, "utf8"), vector.sig, vector.pub)).toBe(true);
    expect(parseIndex(vector.body).plugins[0]?.id).toBe("linear");
  });
});
