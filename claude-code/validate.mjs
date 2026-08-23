// This example ships config, not code, so there is no behaviour to smoke-test.
// What CAN break a reader is the config itself: malformed JSON, an invocation
// that has drifted from what the CLI generates, or — worst — a real agent
// identity committed by accident. Those are all checkable.
//
// Run: node validate.mjs
import { readFileSync } from "node:fs";

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

let cfg;
try {
  cfg = JSON.parse(readFileSync(new URL("./.mcp.json", import.meta.url), "utf8"));
} catch (err) {
  console.error(`.mcp.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

const server = cfg?.mcpServers?.agentvalet;
check(!!server, "no mcpServers.agentvalet entry");

// The canonical invocation, matching apps/cli/src/config/ide.ts. `@latest` is
// deliberate: an unversioned specifier lets npx reuse a stale global install
// that shadows the current build.
const EXPECTED = ["-y", "@agentvalet/register@latest", "mcp-server"];
check(server?.command === "npx", `command should be "npx", got ${JSON.stringify(server?.command)}`);
check(
  JSON.stringify(server?.args) === JSON.stringify(EXPECTED),
  `args drifted from what the CLI generates.\n    expected ${JSON.stringify(EXPECTED)}\n    got      ${JSON.stringify(server?.args)}`,
);

// A committed identity is the one failure here with real consequences: an agent
// id plus a key path is a map to somebody's credentials.
const env = server?.env ?? {};
for (const [key, value] of Object.entries(env)) {
  if (key === "PROXY_URL") continue;
  check(
    /^REPLACE_WITH/.test(String(value)),
    `${key} must be a placeholder, not a real value (got ${JSON.stringify(value)})`,
  );
}
check(!/agt_[a-z0-9]{8,}/i.test(JSON.stringify(cfg)), "a real agent id (agt_…) is committed in .mcp.json");
check(
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(JSON.stringify(cfg)),
  "a real uuid (owner id?) is committed in .mcp.json",
);

// The routing block is the whole point of this example: without it an agent
// that finds a GITHUB_TOKEN in the environment will just use it.
const claudeMd = readFileSync(new URL("./CLAUDE.md", import.meta.url), "utf8");
check(claudeMd.includes("list_platforms"), "CLAUDE.md does not tell the agent to check list_platforms first");

if (problems.length) {
  console.error("claude-code config is not shippable:\n");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("claude-code config OK — valid JSON, canonical invocation, placeholders only, routing block present.");
