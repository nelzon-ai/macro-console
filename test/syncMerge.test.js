import assert from "node:assert/strict";
import test from "node:test";
import { mergeDocuments, mergeWithInbox, stampLocalChanges } from "../src/syncMerge.js";

const NOW = "2026-04-01T12:00:00.000Z";
const EARLIER = "2026-03-01T12:00:00.000Z";
const LATER = "2026-04-02T12:00:00.000Z";

function food(id, name, calories, updatedAt) {
  return { id, name, calories, protein: 1, carbs: 2, fat: 1, fiber: 1, updatedAt };
}

function day(date, foods, extra = {}) {
  return {
    date,
    updatedAt: extra.updatedAt || null,
    day: {
      foods,
      weight: extra.weight ?? null,
      water: extra.water || 0,
      steps: extra.steps ?? null,
      workout: extra.workout || null,
      locked: !!extra.locked,
    },
  };
}

function historyRow(date, extra = {}) {
  return {
    date,
    calories: extra.calories || 0,
    protein: extra.protein || 0,
    carbs: extra.carbs || 0,
    fat: extra.fat || 0,
    fiber: extra.fiber || 0,
    weight: extra.weight ?? null,
    water: extra.water || 0,
    steps: extra.steps ?? null,
    workoutDone: !!extra.workoutDone,
    updatedAt: extra.updatedAt,
  };
}

function base(overrides = {}) {
  return {
    targets: { calories: 2000 },
    meta: { streak: 2 },
    history: [],
    recipes: [],
    bodyComp: [],
    measurements: [],
    milestones: [],
    mealTypes: ["Breakfast"],
    supplementGroups: [],
    supplementRules: [],
    workoutDays: [],
    weeklyWorkoutTarget: 3,
    today: null,
    days: [],
    deleted: [],
    conflicts: [],
    ...overrides,
  };
}

test("adds on both sides all survive", () => {
  const local = base({
    history: [historyRow("2026-01-01", { calories: 100, weight: 150 })],
    recipes: [{ id: "local-recipe", name: "Example oats", calories: 100 }],
    bodyComp: [{ date: "2026-01-01", weight: 150, bodyFatPct: 20 }],
    measurements: [{ date: "2026-01-01", waist: 80 }],
    days: [day("2026-01-01", [food("food-local", "Example oats", 100)])],
  });
  const remote = base({
    targets: { calories: 9999 },
    history: [historyRow("2026-01-02", { calories: 80, weight: 149, workoutDone: true })],
    recipes: [{ id: "remote-recipe", name: "Example stew", calories: 80 }],
    bodyComp: [{ date: "2026-01-02", weight: 149, bodyFatPct: 19 }],
    measurements: [{ date: "2026-01-02", waist: 79 }],
    days: [day("2026-01-02", [food("food-remote", "Example stew", 80)], { workout: { done: true, type: "Example session", duration: 20 } })],
  });
  const { document } = mergeDocuments(local, remote, { now: NOW });
  assert.deepEqual(document.history.map((row) => row.date), ["2026-01-01", "2026-01-02"]);
  assert.deepEqual(document.recipes.map((row) => row.id).sort(), ["local-recipe", "remote-recipe"]);
  assert.deepEqual(document.bodyComp.map((row) => row.date), ["2026-01-01", "2026-01-02"]);
  assert.deepEqual(document.measurements.map((row) => row.date), ["2026-01-01", "2026-01-02"]);
  const ids = document.days.flatMap((rec) => rec.day.foods.map((item) => item.id)).sort();
  assert.deepEqual(ids, ["food-local", "food-remote"]);
  assert.equal(document.days.find((rec) => rec.date === "2026-01-02").day.workout.done, true);
  assert.equal(document.targets.calories, 2000);
});

test("edits on both sides keep the newer copy and retain the older one", () => {
  const local = base({
    recipes: [{ id: "shared", name: "Example oats", calories: 100, updatedAt: LATER }],
    history: [historyRow("2026-01-01", { weight: 150, updatedAt: EARLIER })],
    days: [day("2026-01-01", [food("shared-food", "Example oats", 100, EARLIER)])],
  });
  const remote = base({
    recipes: [{ id: "shared", name: "Example oats", calories: 90, updatedAt: EARLIER }],
    history: [historyRow("2026-01-01", { weight: 140, updatedAt: LATER })],
    days: [day("2026-01-01", [food("shared-food", "Example oats", 80, LATER)])],
  });
  const { document } = mergeDocuments(local, remote, { now: NOW });
  assert.equal(document.recipes.length, 1);
  assert.equal(document.recipes[0].calories, 100);
  assert.equal(document.history[0].weight, 140);
  assert.equal(document.days[0].day.foods[0].calories, 80);
  assert.equal(document.conflicts.some((item) => item.collection === "recipes" && item.dropped.calories === 90), true);
  assert.equal(document.conflicts.some((item) => item.collection === "history" && item.dropped.weight === 150), true);
  assert.equal(document.conflicts.some((item) => item.collection === "foods" && item.dropped.calories === 100), true);
});

test("a delete tombstone removes the entry and a later edit puts it back", () => {
  const local = base({
    recipes: [{ id: "keep", name: "Example stew", calories: 10 }],
    days: [day("2026-01-01", [food("gone", "Example oats", 100, EARLIER), food("back", "Example toast", 50, LATER)])],
    deleted: [{ collection: "foods", id: "gone", date: "2026-01-01", deletedAt: NOW }],
  });
  const remote = base({
    recipes: [{ id: "drop", name: "Example soup", calories: 20 }],
    days: [day("2026-01-01", [food("gone", "Example oats", 100, EARLIER), food("back", "Example toast", 40, EARLIER)])],
    deleted: [{ collection: "recipes", id: "drop", deletedAt: NOW }],
  });
  const { document } = mergeDocuments(local, remote, { now: NOW });
  const foods = document.days[0].day.foods;
  assert.equal(foods.some((item) => item.id === "gone"), false);
  assert.equal(foods.some((item) => item.id === "back"), true);
  assert.equal(foods.find((item) => item.id === "back").calories, 50);
  assert.equal(document.recipes.some((item) => item.id === "drop"), false);
  assert.equal(document.recipes.some((item) => item.id === "keep"), true);
  assert.equal(document.conflicts.some((item) => item.reason === "deleted" && item.dropped && (item.dropped.id === "gone" || (item.dropped.foods || item.dropped.name))), true);
});

test("missing an entry on one side does not delete it", () => {
  const local = base({
    history: [historyRow("2026-01-01", { calories: 100 })],
    recipes: [{ id: "only-local", name: "Example oats", calories: 100 }],
  });
  const remote = base({
    history: [historyRow("2026-01-03", { calories: 50 })],
    measurements: [{ date: "2026-01-03", waist: 70 }],
  });
  const { document } = mergeDocuments(local, remote, { now: NOW });
  assert.equal(document.history.length, 2);
  assert.equal(document.recipes.length, 1);
  assert.equal(document.measurements.length, 1);
  assert.equal(document.deleted.length, 0);
});

test("duplicate ids and duplicate content collapse", () => {
  const dup = food("same", "Example oats", 100, EARLIER);
  const newer = food("same", "Example oats", 110, LATER);
  const local = base({
    days: [day("2026-01-01", [dup, newer, { name: "Example toast", calories: 40, protein: 1, carbs: 2, fat: 1, fiber: 0 }, { name: "Example toast", calories: 40, protein: 1, carbs: 2, fat: 1, fiber: 0 }])],
    recipes: [
      { id: "r", name: "Example stew", calories: 10, updatedAt: EARLIER },
      { id: "r", name: "Example stew", calories: 12, updatedAt: LATER },
    ],
  });
  const { document } = mergeDocuments(local, base(), { now: NOW });
  assert.equal(document.days[0].day.foods.filter((item) => item.id === "same").length, 1);
  assert.equal(document.days[0].day.foods.find((item) => item.id === "same").calories, 110);
  const toast = document.days[0].day.foods.filter((item) => item.name === "Example toast");
  assert.equal(toast.length, 1);
  assert.equal(document.recipes.length, 1);
  assert.equal(document.recipes[0].calories, 12);
});

test("inbox entries union with local rows and a settings patch stays explicit", () => {
  const local = base({
    targets: { calories: 2000, protein: 150 },
    days: [day("2026-01-01", [food("food-local", "Example oats", 100)])],
    history: [historyRow("2026-01-01", { calories: 100 })],
  });
  const inbox = {
    name: "example.json",
    body: JSON.stringify({
      id: "batch-example",
      createdAt: NOW,
      settings: { targets: { calories: 1800, protein: 140, carbs: 150, fat: 60, fiber: 30, water: 2000, steps: 8000 } },
      entries: [
        { type: "food", date: "2026-01-01", id: "food-remote", name: "Example stew", calories: 80, protein: 4, carbs: 6, fat: 2, fiber: 1, updatedAt: NOW },
        { type: "weighIn", date: "2026-01-02", weight: 150, updatedAt: NOW },
        { type: "workout", date: "2026-01-02", done: true, workoutType: "Example session", duration: 30, updatedAt: NOW },
        { type: "measurement", date: "2026-01-02", waist: 80, updatedAt: NOW },
        { type: "bodyComp", date: "2026-01-02", bodyFatPct: 20, updatedAt: NOW },
        { type: "recipe", id: "recipe-remote", name: "Example stew", calories: 80, updatedAt: NOW },
        { type: "delete", collection: "recipes", id: "does-not-exist", deletedAt: NOW },
      ],
    }),
  };
  const merged = mergeWithInbox(local, {}, [inbox], NOW);
  const foods = merged.document.days.find((rec) => rec.date === "2026-01-01").day.foods;
  assert.deepEqual(foods.map((item) => item.id).sort(), ["food-local", "food-remote"]);
  assert.equal(merged.document.history.find((row) => row.date === "2026-01-02").weight, 150);
  assert.equal(merged.document.history.find((row) => row.date === "2026-01-02").workoutDone, true);
  assert.equal(merged.document.measurements[0].waist, 80);
  assert.equal(merged.document.bodyComp[0].bodyFatPct, 20);
  assert.equal(merged.document.recipes.some((item) => item.id === "recipe-remote"), true);
  assert.equal(merged.document.recipes.find((item) => item.id === "recipe-remote").batchPortions, undefined);
  const withBatch = mergeWithInbox(local, {}, [inboxFile("batch.json", [
    { type: "food", date: "2026-01-03", id: "food-plain", name: "Example oats", calories: 100, protein: 5, carbs: 10, fat: 2, fiber: 1, updatedAt: NOW },
    { type: "recipe", id: "recipe-chili", name: "Example chili", calories: 400, batchPortions: 4, portionsLeft: 2, updatedAt: NOW },
  ])], NOW);
  assert.equal(withBatch.document.days.find((rec) => rec.date === "2026-01-03").day.foods[0].name, "Example oats");
  assert.equal(withBatch.document.days.find((rec) => rec.date === "2026-01-03").day.foods[0].batchPortions, undefined);
  const chili = withBatch.document.recipes.find((item) => item.id === "recipe-chili");
  assert.equal(chili.batchPortions, 4);
  assert.equal(chili.portionsLeft, 2);
  assert.equal(merged.settings.targets.calories, 1800);
  assert.equal(merged.accepted.length, 1);
  const broken = mergeWithInbox(local, local, [{ name: "bad.json", body: "{nope" }], NOW);
  assert.equal(broken.skipped.length, 1);
  assert.equal(broken.document.recipes.length, local.recipes.length);
});

test("an inbox edit with a time beats an unstamped phone row", () => {
  const local = base({
    days: [day("2026-01-01", [food("food-1", "Example oats", 100)])],
    history: [historyRow("2026-01-01", { calories: 100 })],
  });
  const inbox = {
    name: "edit.json",
    body: JSON.stringify({
      entries: [{
        type: "food",
        date: "2026-01-01",
        id: "food-1",
        name: "Example oats",
        calories: 90,
        protein: 1,
        carbs: 2,
        fat: 1,
        fiber: 1,
        updatedAt: NOW,
      }],
    }),
  };
  const merged = mergeWithInbox(local, {}, [inbox], NOW);
  assert.equal(merged.document.days[0].day.foods[0].calories, 90);
  assert.equal(merged.document.conflicts.some((item) => item.collection === "foods" && item.dropped.calories === 100), true);
});

function inboxFile(name, entries) {
  return { name, body: JSON.stringify({ id: name, createdAt: NOW, entries }) };
}

test("water adds to the day total once, and other history stays put", () => {
  const foodA = food("food-1", "Example oats", 100, EARLIER);
  const local = base({
    history: [
      historyRow("2026-01-07", { calories: 50, water: 100, steps: 2000 }),
      historyRow("2026-01-08", { calories: 100, water: 400, steps: 3000, weight: 150 }),
    ],
    days: [
      day("2026-01-07", [], { water: 100, steps: 2000 }),
      day("2026-01-08", [foodA], { water: 400, steps: 3000, weight: 150 }),
    ],
    recipes: [{ id: "recipe-1", name: "Example oats", calories: 100 }],
  });
  const file = inboxFile("water.json", [
    { type: "water", date: "2026-01-08", id: "water-example-1", updatedAt: NOW, amount: 250 },
  ]);
  const once = mergeWithInbox(local, local, [file], NOW);
  const day8 = once.document.days.find((rec) => rec.date === "2026-01-08");
  const day7 = once.document.days.find((rec) => rec.date === "2026-01-07");
  assert.equal(day8.day.water, 650);
  assert.equal(once.document.history.find((row) => row.date === "2026-01-08").water, 650);
  assert.equal(once.document.history.find((row) => row.date === "2026-01-08").calories, 100);
  assert.equal(once.document.history.find((row) => row.date === "2026-01-08").weight, 150);
  assert.equal(day8.day.steps, 3000);
  assert.equal(day8.day.foods.length, 1);
  assert.equal(day8.day.foods[0].name, "Example oats");
  assert.deepEqual(Object.keys(day8.day).sort(), ["foods", "locked", "steps", "water", "weight", "workout"]);
  assert.equal(day7.day.water, 100);
  assert.equal(once.document.history.find((row) => row.date === "2026-01-07").calories, 50);
  assert.equal(once.document.recipes.length, 1);
  assert.equal(once.document.applied.some((item) => item.id === "water-example-1" && item.amount === 250), true);

  const twice = mergeWithInbox(once.document, once.document, [file], NOW);
  assert.equal(twice.document.days.find((rec) => rec.date === "2026-01-08").day.water, 650);
  assert.equal(twice.document.history.find((row) => row.date === "2026-01-08").calories, 100);
  assert.equal(twice.document.days.find((rec) => rec.date === "2026-01-07").day.water, 100);
});

test("deleting a water credit removes only that amount", () => {
  const local = base({
    history: [historyRow("2026-01-08", { calories: 100, water: 400 })],
    days: [day("2026-01-08", [food("food-1", "Example oats", 100)], { water: 400 })],
  });
  const added = mergeWithInbox(local, {}, [inboxFile("water.json", [
    { type: "water", date: "2026-01-08", id: "water-example-1", updatedAt: NOW, amount: 250 },
  ])], NOW);
  const removed = mergeWithInbox(added.document, {}, [inboxFile("delete-water.json", [
    { type: "delete", collection: "water", id: "water-example-1", date: "2026-01-08", deletedAt: LATER },
  ])], LATER);
  assert.equal(removed.document.days[0].day.water, 400);
  assert.equal(removed.document.history[0].calories, 100);
  assert.equal(removed.document.days[0].day.foods[0].id, "food-1");
  assert.equal(removed.document.applied.some((item) => item.id === "water-example-1"), false);
});

test("steps keep the higher day total unless the entry says to add", () => {
  const local = base({
    history: [historyRow("2026-01-08", { calories: 80, steps: 3000, water: 100 })],
    days: [day("2026-01-08", [], { steps: 3000, water: 100 })],
  });
  const raised = mergeWithInbox(local, {}, [inboxFile("steps.json", [
    { type: "steps", date: "2026-01-08", id: "steps-example-1", updatedAt: NOW, count: 8000 },
  ])], NOW);
  assert.equal(raised.document.days[0].day.steps, 8000);
  assert.equal(raised.document.days[0].day.water, 100);
  assert.equal(raised.document.history[0].calories, 80);
  const again = mergeWithInbox(raised.document, raised.document, [inboxFile("steps.json", [
    { type: "steps", date: "2026-01-08", id: "steps-example-1", updatedAt: NOW, count: 8000 },
  ])], NOW);
  assert.equal(again.document.days[0].day.steps, 8000);
  const lower = mergeWithInbox(again.document, {}, [inboxFile("steps-low.json", [
    { type: "steps", date: "2026-01-08", id: "steps-example-1", updatedAt: LATER, count: 1000 },
  ])], LATER);
  assert.equal(lower.document.days[0].day.steps, 8000);
  const added = mergeWithInbox(local, {}, [inboxFile("steps-add.json", [
    { type: "steps", date: "2026-01-08", id: "steps-add-1", updatedAt: NOW, count: 500, mode: "add" },
  ])], NOW);
  assert.equal(added.document.days[0].day.steps, 3500);
  const addedTwice = mergeWithInbox(added.document, added.document, [inboxFile("steps-add.json", [
    { type: "steps", date: "2026-01-08", id: "steps-add-1", updatedAt: NOW, count: 500, mode: "add" },
  ])], NOW);
  assert.equal(addedTwice.document.days[0].day.steps, 3500);
  assert.equal(addedTwice.document.days[0].day.water, 100);
});

test("a saved water credit is added only if the earlier total is still showing", () => {
  const local = base({
    history: [historyRow("2026-01-08", { calories: 100, water: 400 })],
    days: [day("2026-01-08", [food("food-1", "Example oats", 100)], { water: 400 })],
  });
  const file = inboxFile("water.json", [
    { type: "water", date: "2026-01-08", id: "water-example-1", updatedAt: NOW, amount: 250 },
  ]);
  const once = mergeWithInbox(local, {}, [file], NOW);
  const rolled = JSON.parse(JSON.stringify(once.document));
  const baseWater = rolled.applied[0].base;
  rolled.days[0].day.water = baseWater;
  rolled.history[0].water = baseWater;
  const repaired = mergeWithInbox(rolled, rolled, [file], NOW);
  assert.equal(repaired.document.days[0].day.water, baseWater + 250);
  assert.equal(repaired.document.history[0].calories, 100);
  const again = mergeWithInbox(repaired.document, repaired.document, [file], NOW);
  assert.equal(again.document.days[0].day.water, baseWater + 250);
  assert.equal(again.document.days[0].day.foods[0].id, "food-1");
});

test("a merge with no inbox leaves existing totals and rows unchanged", () => {
  const local = base({
    history: [historyRow("2026-01-08", { calories: 100, water: 400, steps: 3000, weight: 150 })],
    days: [day("2026-01-08", [food("food-1", "Example oats", 100)], { water: 400, steps: 3000, weight: 150 })],
    recipes: [{ id: "recipe-1", name: "Example stew", calories: 80 }],
  });
  const merged = mergeWithInbox(local, local, [], NOW);
  assert.equal(merged.document.days[0].day.water, 400);
  assert.equal(merged.document.days[0].day.steps, 3000);
  assert.equal(merged.document.days[0].day.weight, 150);
  assert.equal(merged.document.history[0].calories, 100);
  assert.equal(merged.document.days[0].day.foods[0].calories, 100);
  assert.equal(merged.document.recipes[0].name, "Example stew");
  assert.equal(merged.document.applied.length, 0);
});

test("stampLocalChanges marks an edit and leaves untouched rows alone", () => {
  const previous = base({
    history: [historyRow("2026-01-01", { calories: 100, updatedAt: EARLIER })],
    days: [day("2026-01-01", [food("food-1", "Example oats", 100, EARLIER)])],
  });
  const untouched = stampLocalChanges(base({
    history: [historyRow("2026-01-01", { calories: 100 })],
    days: [day("2026-01-01", [food("food-1", "Example oats", 100)])],
  }), null, NOW);
  assert.equal(untouched.history[0].updatedAt, undefined);
  const stamped = stampLocalChanges(base({
    history: [historyRow("2026-01-01", { calories: 90 })],
    days: [day("2026-01-01", [food("food-1", "Example oats", 90)])],
  }), previous, NOW);
  assert.equal(stamped.history[0].updatedAt, NOW);
  assert.equal(stamped.days[0].day.foods[0].updatedAt, NOW);
});

test("workoutPlan replaces the saved plan, keeps the previous one, and does not touch logs", () => {
  const previous = [{
    key: "dayA",
    label: "Day A",
    sub: "",
    mode: "straight",
    exercises: [{ icon: "floorpress", name: "Press", cue: "", sets: "3×8-12", tag: "Chest", startWeight: "20", rest: 90 }],
  }];
  const logs = [{ exercise: "Press", weight: 20, reps: 8, setNumber: 1, date: "2026-01-08" }];
  const local = base({ workoutDays: previous, weeklyWorkoutTarget: 3, workoutPlanBackups: [] });
  const remote = base({
    workoutDays: [],
    workoutPlanBackups: [{ savedAt: "2026-01-01T00:00:00.000Z", workoutDays: previous, weeklyWorkoutTarget: 2 }],
  });
  const file = {
    name: "plan.json",
    body: JSON.stringify({
      entries: [{
        type: "workoutPlan",
        updatedAt: NOW,
        weeklyWorkoutTarget: 4,
        workoutDays: [{
          key: "dayA",
          label: "Day A",
          sub: "Push",
          mode: "straight",
          notes: "Example day note",
          exercises: [{
            icon: "floorpress",
            name: "Press",
            cue: "Press up.",
            sets: "4×8-12",
            startWeight: "25",
            rest: 90,
            notes: "Example exercise note",
          }],
        }],
      }],
    }),
  };
  const once = mergeWithInbox(local, remote, [file], NOW);
  assert.equal(once.document.workoutDays[0].exercises[0].startWeight, "25");
  assert.equal(once.document.workoutDays[0].exercises[0].sets, "4×8-12");
  assert.equal(once.document.workoutDays[0].exercises[0].notes, "Example exercise note");
  assert.equal(once.document.workoutDays[0].notes, "Example day note");
  assert.equal(once.document.weeklyWorkoutTarget, 4);
  assert.equal(once.document.workoutPlanBackups.length, 2);
  const fresh = once.document.workoutPlanBackups.find((item) => item.savedAt === NOW);
  assert.equal(fresh.workoutDays[0].exercises[0].startWeight, "20");
  assert.equal(fresh.workoutDays[0].exercises[0].sets, "3×8-12");
  assert.equal(once.document.exerciseWeightLog, undefined);
  const twice = mergeWithInbox(once.document, once.document, [file], LATER);
  assert.equal(twice.document.workoutPlanBackups.length, 2);
  assert.equal(twice.document.workoutDays[0].exercises[0].startWeight, "25");
  assert.equal(JSON.stringify(logs), JSON.stringify([{ exercise: "Press", weight: 20, reps: 8, setNumber: 1, date: "2026-01-08" }]));
});

test("an empty local backup list does not drop remote workout plan backups", () => {
  const remote = base({
    workoutPlanBackups: [{
      savedAt: "2026-01-01T00:00:00.000Z",
      workoutDays: [{ key: "dayA", label: "Day A", sub: "", mode: "circuit", exercises: [] }],
      weeklyWorkoutTarget: 3,
    }],
  });
  const merged = mergeDocuments(base({ workoutPlanBackups: [] }), remote, { now: NOW }).document;
  assert.equal(merged.workoutPlanBackups.length, 1);
  assert.equal(merged.workoutPlanBackups[0].savedAt, "2026-01-01T00:00:00.000Z");
});
