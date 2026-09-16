// Secret scan for labs/**: a committed agent id, install token, bind secret or
// key would be a map to somebody's credentials. Run: node labs/validate.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PATTERNS = [
  [/\bagt_[a-z0-9]{20,21}\b/, "agent id"],
  [/\batok_[A-Za-z0-9_-]{8,}\b/, "install token"],
  [/\bbsec_[A-Za-z0-9_-]{8,}\b/, "bind secret"],
  [/-----BEGIN (RSA |EC |)PRIVATE KEY-----/, "private key"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/, "uuid (owner id?)"],
];
// Documented examples the README deliberately shows.
const ALLOW = [/atok_…/, /apr_…/];

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const text = readFileSync(p, "utf8");
    for (const [re, what] of PATTERNS) {
      const m = text.match(re);
      if (m && !ALLOW.some((a) => a.test(m[0]))) problems.push(`${p}: looks like a ${what}: ${m[0].slice(0, 12)}…`);
    }
  }
}
walk(ROOT);
if (problems.length) {
  console.error("labs/validate: a real identity or secret appears to be committed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("labs/validate: no identities or secrets in labs/**");
