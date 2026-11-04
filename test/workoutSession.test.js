import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSetsCount,
  buildSessionQueue,
  displaySetNumber,
  prescriptionOf,
  prescribedWeightLb,
  setsLoggedToday,
  loggedSetDefaults,
  recommendationText,
  workoutSummary,
} from "../src/workoutSession.js";

const day = {
  key: "dayA",
  mode: "straight",
  exercises: [
    { name: "Press", sets: "4×8-12", startWeight: "20", cue: "Press up." },
    { name: "Row", sets: "4x8-12", startWeight: "15 lb", cue: "Pull in." },
  ],
};

test("set counter resumes from sets already logged today", () => {
  const logs = [
    { exercise: "Press", date: "2026-01-08", weight: 20, reps: 8, setNumber: 1 },
  ];
  assert.equal(setsLoggedToday(logs, "Press", "2026-01-08"), 1);
  const straight = buildSessionQueue(day, "straight", { Press: 1 });
  assert.equal(straight[0].ex.name, "Press");
  assert.equal(straight[0].setNumber, 2);
  assert.equal(straight[0].totalSets, 4);
  assert.equal(straight[3].ex.name, "Row");
  assert.equal(straight[3].setNumber, 1);
  assert.equal(displaySetNumber(straight[0], 1), 2);
  assert.equal(displaySetNumber({ setNumber: 1, totalSets: 4 }, 2), 3);
  assert.equal(displaySetNumber({ setNumber: 1, totalSets: 4 }, 3), 4);

  const circuit = buildSessionQueue(day, "circuit", { Press: 1 });
  assert.equal(circuit[0].ex.name, "Press");
  assert.equal(circuit[0].setNumber, 2);
  assert.equal(circuit[1].ex.name, "Row");
  assert.equal(circuit[1].setNumber, 1);
  assert.equal(parseSetsCount("4x8-12"), 4);
  assert.equal(parseSetsCount("4×8-12"), 4);
  assert.equal(parseSetsCount("4*8"), 4);
});

test("logging a set does not change the saved prescription", () => {
  const plan = JSON.parse(JSON.stringify(day));
  const before = JSON.stringify(plan);
  const logged = { exercise: "Press", date: "2026-01-08", weight: 24, reps: 12, setNumber: 2 };
  const shown = prescriptionOf(plan.exercises[0]);
  assert.equal(prescribedWeightLb(plan.exercises[0]), 20);
  assert.equal(shown.sets, "4×8-12");
  assert.equal(shown.startWeight, "20");
  assert.deepEqual(shown.reps, { lo: 8, hi: 12 });
  assert.equal(prescribedWeightLb(plan.exercises[1]), 15);
  buildSessionQueue(plan, "straight", { Press: logged.setNumber });
  assert.equal(JSON.stringify(plan), before);
  assert.notEqual(logged.weight, shown.weightLb);
  assert.equal(plan.exercises[0].sets, "4×8-12");
  assert.equal(plan.exercises[0].startWeight, "20");
});

const press = { name: "Press", sets: "4×8-12", startWeight: "60", per: "" };

test("no previous session keeps the plan weight and leaves reps empty", () => {
  const todayOnly = [
    { exercise: "Press", date: "2026-02-02", weight: 70, reps: 11, setNumber: 1 },
  ];
  const fromToday = loggedSetDefaults(press, todayOnly, 1, "2026-02-02");
  assert.equal(fromToday.weight, "60");
  assert.equal(fromToday.reps, "");
  assert.equal(fromToday.fromPreviousSession, false);
  const empty = loggedSetDefaults(press, [], 2, "2026-02-02");
  assert.equal(empty.weight, "60");
  assert.equal(empty.reps, "");
  assert.equal(recommendationText(press), "Recommended: 4×8-12 @ 60 lb");
  assert.equal(prescribedWeightLb(press), 60);
});

test("each set opens on that set from the most recent previous session", () => {
  const log = [
    { exercise: "Press", date: "2026-01-01", weight: 40, reps: 12, setNumber: 1 },
    { exercise: "Press", date: "2026-01-01", weight: 40, reps: 12, setNumber: 2 },
    { exercise: "Press", date: "2026-01-01", weight: 40, reps: 12, setNumber: 3 },
    { exercise: "Press", date: "2026-01-01", weight: 40, reps: 12, setNumber: 4 },
    { exercise: "Row", date: "2026-02-01", weight: 99, reps: 5, setNumber: 1 },
    { exercise: "Press", date: "2026-02-01", weight: 55, reps: 10, setNumber: 1 },
    { exercise: "Press", date: "2026-02-01", weight: 55, reps: 9, setNumber: 2 },
    { exercise: "Press", date: "2026-02-01", weight: 50, reps: 8, setNumber: 2 },
    { exercise: "Press", date: "2026-02-02", weight: 80, reps: 3, setNumber: 1 },
  ];
  const before = JSON.stringify({ press, log });
  assert.deepEqual(loggedSetDefaults(press, log, 1, "2026-02-02"), {
    weight: "55", reps: "10", fromPreviousSession: true,
  });
  assert.deepEqual(loggedSetDefaults(press, log, 2, "2026-02-02"), {
    weight: "50", reps: "8", fromPreviousSession: true,
  });
  assert.equal(JSON.stringify({ press, log }), before);
  assert.equal(press.startWeight, "60");
  assert.equal(recommendationText(press, 65), "Recommended: 4×8-12 @ 60 lb · next 65 lb");
  assert.equal(recommendationText(press, 60), "Recommended: 4×8-12 @ 60 lb");
});

test("a different set count falls back within the previous session", () => {
  const log = [
    { exercise: "Press", date: "2026-02-01", weight: 42.5, reps: 8 },
    { exercise: "Press", date: "2026-02-01", weight: 42.5, reps: 7 },
  ];
  assert.equal(loggedSetDefaults(press, log, 1, "2026-02-08").weight, "42.5");
  assert.equal(loggedSetDefaults(press, log, 1, "2026-02-08").reps, "8");
  assert.equal(loggedSetDefaults(press, log, 2, "2026-02-08").reps, "7");
  const extra = loggedSetDefaults(press, log, 4, "2026-02-08");
  assert.equal(extra.weight, "42.5");
  assert.equal(extra.reps, "7");

  const numbered = [
    { exercise: "Press", date: "2026-02-01", weight: 30, reps: 12, setNumber: 1 },
    { exercise: "Press", date: "2026-02-01", weight: 35, reps: 10, setNumber: 3 },
  ];
  assert.equal(loggedSetDefaults(press, numbered, 2, "2026-02-08").weight, "30");
  assert.equal(loggedSetDefaults(press, numbered, 3, "2026-02-08").weight, "35");
  assert.equal(loggedSetDefaults(press, numbered, 4, "2026-02-08").reps, "10");
  assert.equal(loggedSetDefaults(press, [
    { exercise: "Press", date: "2026-02-01", weight: 70, reps: 5, setNumber: 2 },
  ], 1, "2026-02-08").weight, "70");
});

test("a finished session sums volume, spots bests, and keeps the plan", () => {
  const press = { name: "Press", sets: "4×8-12", startWeight: "60" };
  const before = JSON.stringify(press);
  const summary = workoutSummary({
    sessionEntries: [
      { exercise: "Press", date: "2026-02-08", weight: 60, reps: 14, setNumber: 1 },
      { exercise: "Press", date: "2026-02-08", weight: 70, reps: 8, setNumber: 2 },
      { exercise: "Plank", date: "2026-02-08", reps: 30, setNumber: 1 },
    ],
    priorEntries: [
      { exercise: "Press", date: "2026-02-01", weight: 60, reps: 12, setNumber: 1 },
      { exercise: "Press", date: "2026-02-01", weight: 65, reps: 8, setNumber: 2 },
    ],
    exercises: [press],
    overrides: { Press: 65 },
  });
  assert.equal(summary.volume, 60 * 14 + 70 * 8);
  assert.equal(summary.bodyweightSets, 1);
  assert.ok(summary.bests.some((best) => best.kind === "weight" && best.text.includes("70")));
  assert.ok(summary.bests.some((best) => best.kind === "reps" && best.text.includes("14 reps at 60")));
  assert.equal(summary.next[0].text, "Recommended: 4×8-12 @ 60 lb · next 65 lb");
  assert.equal(JSON.stringify(press), before);
  assert.equal(press.startWeight, "60");
});

test("recommendation line follows the plan and leaves bodyweight exercises alone", () => {
  const side = { name: "Split squat", sets: "3×8-12", startWeight: "15 lb", per: "per side" };
  assert.equal(recommendationText(side), "Recommended: 3×8-12 per side @ 15 lb");
  const bw = { name: "Plank", sets: "3×20-40", startWeight: "bodyweight" };
  const logged = [{ exercise: "Plank", date: "2026-02-01", weight: 25, reps: 30, setNumber: 1 }];
  const defaults = loggedSetDefaults(bw, logged, 1, "2026-02-08");
  assert.equal(defaults.weight, "");
  assert.equal(defaults.reps, "30");
  assert.equal(recommendationText(bw, 40), "Recommended: 3×20-40 · bodyweight");
  assert.equal(recommendationText({ name: "Curl", sets: "3×8-12", startWeight: "" }), "Recommended: 3×8-12");
  assert.equal(bw.startWeight, "bodyweight");
});
