// Runs every fault through the scripted mock agent with auto-approval and
// checks that the correct fix restores service. Run with: npm run simulate
process.env.MOCK_AGENT = "1";
import { advance, decide, newRun, publicView } from "../src/lib/agent";
import { SCENARIOS } from "../src/lib/infra";

const verbose = process.argv.includes("--verbose");

async function main() {
  let pass = 0;
  for (const s of SCENARIOS) {
    const state = newRun(s.id);
    const emit = () => {};
    await advance(state, emit);
    while (state.pending) await decide(state, true, emit);
    const v = publicView(state);
    const ok = v.result?.restored === true;
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${s.title}: restored=${v.result?.restored} calls=${v.result?.toolCalls}`);
    if (verbose) for (const e of state.events) if (e.type === "check" || e.type === "change") console.log(`\n--- ${e.label} ${e.target}\n${e.output}`);
  }
  console.log(`\n${pass}/${SCENARIOS.length} faults restored by their correct fix`);
  if (pass !== SCENARIOS.length) process.exit(1);
}
main();
