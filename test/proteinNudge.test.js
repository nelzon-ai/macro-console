import assert from "node:assert/strict";
import test from "node:test";
import { proteinNudge } from "../src/proteinNudge.js";

const recipes = [
  { name: "Example oats", protein: 12 },
  { name: "Example chicken", protein: 40 },
  { name: "Example yogurt", protein: 20 },
  { name: "Example beans", protein: 15 },
];

test("evening protein nudge uses the stored target and stays dismissed for the day", () => {
  const shown = proteinNudge({
    protein: 40,
    target: 160,
    hour: 18,
    dismissedOn: "",
    today: "2026-01-08",
    recipes,
  });
  assert.equal(shown.left, 120);
  assert.deepEqual(shown.ideas.map((idea) => idea.name), ["Example chicken", "Example yogurt", "Example beans"]);
  assert.equal(proteinNudge({ protein: 40, target: 160, hour: 17, dismissedOn: "", today: "2026-01-08", recipes }), null);
  assert.equal(proteinNudge({ protein: 130, target: 160, hour: 19, dismissedOn: "", today: "2026-01-08", recipes }), null);
  assert.equal(proteinNudge({ protein: 40, target: 160, hour: 19, dismissedOn: "2026-01-08", today: "2026-01-08", recipes }), null);
  assert.equal(proteinNudge({ protein: 40, target: 0, hour: 19, dismissedOn: "", today: "2026-01-08", recipes }), null);
});
