// Step 5 — deny by default, as a dry run. evaluate() asks the broker what it
// WOULD decide for a scope this agent was never granted, without attempting
// the call, so no failed call clutters your audit log on your first day.
import { loadClient } from "./lib.mjs";

const av = loadClient();
const decision = await av.evaluate("stripe", "charge");
console.log("evaluate(stripe, charge) →", JSON.stringify(decision));
console.log("\nNo grant, no call. The broker holds nothing for Stripe, so there is nothing an agent could use even if it tried.");
