import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSetsCount,
  buildSessionQueue,
  displaySetNumber,
  prescriptionOf,
  prescribedWeightLb,
  setsLoggedToday,
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
