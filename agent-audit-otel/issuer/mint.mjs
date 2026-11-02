#!/usr/bin/env node
// A throwaway token issuer for the lab. Node 18+, no dependencies.
//
//   node mint.mjs init                              writes keys/private.pem and keys/jwks.json
//   node mint.mjs token --agent support-bot         an agent acting for nobody
//   node mint.mjs token --agent support-bot --user alice@example.com
//
// The token follows the RFC 8693 delegation shape: when the agent acts for a
// person, `sub` is that person and `act.sub` is the agent. When it acts for
// nobody, `sub` is the agent and there is no `act`. The gateway config reads
// both, so the access log names the agent and the user in separate fields.
// Real identity providers differ; see the README for the claims to use.
import { generateKeyPairSync, createPrivateKey, sign, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const keyDir = process.env.KEY_DIR || join(here, "keys");
const ISSUER = process.env.ISSUER || "http://issuer.lab";
const AUDIENCE = process.env.AUDIENCE || "agent-audit-otel";
const KID = "lab-1";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function init() {
  mkdirSync(keyDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(join(keyDir, "private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
  writeFileSync(join(keyDir, "jwks.json"), JSON.stringify({ keys: [jwk] }, null, 2) + "\n");
  console.error(`wrote ${join(keyDir, "private.pem")} and ${join(keyDir, "jwks.json")}`);
}

function token(args) {
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const agent = opt("agent");
  if (!agent) throw new Error("--agent is required");
  const user = opt("user");
  const ttl = Number(opt("ttl") || 3600);
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + ttl,
    jti: randomUUID(),
    ...(user ? { sub: user, act: { sub: agent } } : { sub: agent }),
  };
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = createPrivateKey(readFileSync(join(keyDir, "private.pem")));
  const sig = sign("sha256", Buffer.from(input), key);
  process.stdout.write(`${input}.${b64url(sig)}\n`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "init") init();
else if (cmd === "token") token(rest);
else {
  console.error("usage: mint.mjs init | token --agent NAME [--user EMAIL] [--ttl SECONDS]");
  process.exit(2);
}
