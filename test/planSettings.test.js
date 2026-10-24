import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  mergeTargets,
  mealTypesForDisplay,
  planPatchFromObject,
  hasPlanFields,
  normalizeMilestones,
  DEFAULT_TARGETS,
} from "../src/planSettings.js";

test("saved targets win over generic placeholders", () => {
  const saved = { calories: 1999, protein: 140, goalWeight: null, startWeight: 175 };
  const merged = mergeTargets(saved);
  assert.equal(merged.calories, 1999);
  assert.equal(merged.protein, 140);
  assert.equal(merged.goalWeight, null);
  assert.equal(merged.startWeight, 175);
  assert.equal(merged.carbs, DEFAULT_TARGETS.carbs);
  assert.equal(merged.water, DEFAULT_TARGETS.water);
});

test("blank daily fields fall back, blank goals stay empty", () => {
  const merged = mergeTargets({ calories: "", goalWeight: "" });
  assert.equal(merged.calories, DEFAULT_TARGETS.calories);
  assert.equal(merged.goalWeight, null);
});

test("recipes keep a meal type that is not in the configured list", () => {
  const shown = mealTypesForDisplay(["Breakfast", "Lunch"], [
    { mealType: "Lunch" },
    { mealType: "Packed lunch" },
    { mealType: "Packed lunch" },
  ]);
  assert.deepEqual(shown, ["Breakfast", "Lunch", "Packed lunch"]);
});

test("settings import ignores logs and tokens", () => {
  const patch = planPatchFromObject({
    targets: { calories: 1800, goalWeight: 160 },
    milestones: [],
    mealTypes: ["Breakfast", "Lunch"],
    history: [{ date: "2026-01-01", weight: 175 }],
    today: { date: "2026-01-02" },
    token: "not-a-real-token",
    sync: { token: "also-not-real" },
  });
  assert.equal(hasPlanFields(patch), true);
  assert.equal(patch.targets.calories, 1800);
  assert.equal(patch.targets.goalWeight, 160);
  assert.deepEqual(patch.milestones, []);
  assert.equal(patch.history, undefined);
  assert.equal(patch.token, undefined);
  assert.equal(patch.today, undefined);
  assert.deepEqual(normalizeMilestones("nope"), []);
});

test("public tree does not contain the removed personal strings", () => {
  const banned = [
    ["Piri", "nase"],
    ["piri", "nase"],
    ["anti", "histamine"],
    ["Anti", "histamine"],
    ["Oaks", " Park"],
    ["nelzon@", "gmail.com"],
    ["31", ".2"],
    ["196", ".6"],
    ["28", ".4"],
    ["90", ".5"],
    ["83", ".5"],
  ].map((parts) => parts.join(""));
  const roots = ["src", "test", ".github"];
  const files = ["README.md", "SYNC.md", "SETTINGS.md", "package.json", "vite.config.js", "index.html"];
  const text = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist") continue;
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(js|jsx|md|json|yml|html|css)$/.test(name)) text.push(readFileSync(full, "utf8"));
    }
  }
  for (const root of roots) walk(root);
  for (const file of files) text.push(readFileSync(file, "utf8"));
  const blob = text.join("\n");
  for (const needle of banned) {
    assert.equal(blob.includes(needle), false, needle);
  }
  assert.equal(new RegExp("\\b" + "20" + "8" + "\\b").test(blob), false);
});
