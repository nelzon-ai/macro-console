import assert from "node:assert/strict";
import test from "node:test";
import {
  MAIN_NAV,
  remainder,
  calorieProgress,
  swipeDayDelta,
  usualRecipes,
  searchRecipes,
  collectLoggedFoods,
  dayLogEntries,
  scaleLoggedFood,
  withEditedMacros,
  createDaySaver,
  portionsLeftLabel,
  decrementPortion,
  leftoverVisible,
  batchFieldsFromForm,
} from "../src/homeUx.js";
import { syncIndicator } from "../src/githubSync.js";

test("every screen, including supplements, is on the bottom navigation", () => {
  const views = MAIN_NAV.map((item) => item.view);
  for (const view of ["console", "book", "workout", "progress", "supps"]) {
    assert.ok(views.includes(view), `${view} is missing from navigation`);
  }
  assert.equal(new Set(views).size, views.length);
  assert.equal(MAIN_NAV.find((item) => item.view === "supps").label, "Supps");
  assert.ok(MAIN_NAV.every((item) => item.label && item.view));
});

test("calorie progress fills from zero toward the daily target", () => {
  const start = calorieProgress(0, 2000);
  assert.equal(start.consumed, 0);
  assert.equal(start.percent, 0);
  assert.equal(start.toGo, 2000);
  assert.equal(start.over, false);
  const mid = calorieProgress(400, 2000);
  assert.equal(mid.consumed, 400);
  assert.equal(mid.percent, 20);
  assert.equal(mid.toGo, 1600);
  const over = calorieProgress(2200, 2000);
  assert.equal(over.percent, 100);
  assert.equal(over.over, true);
  assert.equal(over.overBy, 200);
  assert.ok(mid.percent > start.percent);
});

test("remainder is what is left of the stored target", () => {
  const calories = remainder(1620, 2000);
  assert.equal(calories.amount, 380);
  assert.equal(calories.over, false);
  assert.equal(calories.percentLeft, 19);
  const protein = remainder(150, 150);
  assert.equal(protein.amount, 0);
  assert.equal(protein.over, false);
  const over = remainder(2100, 2000);
  assert.equal(over.over, true);
  assert.equal(over.amount, 100);
  assert.equal(over.percentLeft, 0);
});

test("horizontal swipes change the day and vertical drags do not", () => {
  assert.equal(swipeDayDelta(-80, 10), 1);
  assert.equal(swipeDayDelta(80, 4), -1);
  assert.equal(swipeDayDelta(-20, 0), 0);
  assert.equal(swipeDayDelta(-40, 80), 0);
});

test("a day's log stays in the order items were logged", () => {
  const foods = [
    { id: "first", name: "Example oats", mealType: "Breakfast", calories: 300, protein: 12, carbs: 40, fat: 6, fiber: 5 },
    { id: "second", name: "Example chili", mealType: "Dinner", calories: 400, protein: 30, carbs: 35, fat: 12, fiber: 8 },
    { id: "third", name: "Example toast", mealType: "Breakfast", calories: 150, protein: 6, carbs: 22, fat: 3, fiber: 2 },
  ];
  const rows = dayLogEntries(foods);
  assert.deepEqual(rows.map((food) => food.id), ["first", "second", "third"]);
  assert.equal(rows[0].mealType, "Breakfast");
  assert.equal(rows[1].mealType, "Dinner");
  assert.equal(dayLogEntries(null).length, 0);
});

test("a portion change scales the same entry from its original amounts", () => {
  const food = {
    id: "oats",
    name: "Example oats",
    calories: 200,
    protein: 10,
    carbs: 30,
    fat: 4,
    fiber: 2,
    mealType: "Breakfast",
    updatedAt: "2026-11-09T10:00:00.000Z",
    components: [{ id: "grain", name: "Example grain", calories: 200, protein: 10, carbs: 30, fat: 4, fiber: 2 }],
  };
  const twice = scaleLoggedFood(food, 2, "2026-11-09T12:00:00.000Z");
  assert.equal(twice.id, "oats");
  assert.equal(twice.name, "Example oats");
  assert.equal(twice.mealType, "Breakfast");
  assert.equal(twice.calories, 400);
  assert.equal(twice.protein, 20);
  assert.equal(twice.components[0].calories, 400);
  assert.equal(twice.updatedAt > food.updatedAt, true);
  assert.equal(Object.prototype.hasOwnProperty.call(twice, "portionsLeft"), false);
  const half = scaleLoggedFood(twice, 0.5, "2026-11-09T12:05:00.000Z");
  assert.equal(half.id, "oats");
  assert.equal(half.calories, 100);
  assert.equal(half.protein, 5);
  assert.equal(half.components[0].calories, 100);
  assert.equal(scaleLoggedFood(food, 0, "2026-11-09T12:00:00.000Z"), food);
  const edited = withEditedMacros(twice, { name: "Example oats", calories: 250, protein: 12, carbs: 20, fat: 8, fiber: 3 }, "2026-11-09T13:00:00.000Z");
  assert.equal(edited.id, "oats");
  assert.equal(edited.portion, undefined);
  assert.equal(edited.portionBase, undefined);
  const again = scaleLoggedFood(edited, 2, "2026-11-09T13:05:00.000Z");
  assert.equal(again.calories, 500);
  assert.equal(again.protein, 24);
});

test("a day save waits, then writes the latest snapshot, and a flush writes immediately", () => {
  const writes = [];
  const syncs = [];
  let queued = null;
  const saver = createDaySaver({
    write: (day, date) => writes.push([date, day.foods.map((food) => food.id)]),
    sync: () => syncs.push("sync"),
    delay: 700,
    schedule: (fn) => { queued = fn; return 1; },
    cancel: () => { queued = null; },
  });
  saver.schedule({ foods: [{ id: "a" }] }, "2026-11-09");
  saver.schedule({ foods: [{ id: "a" }, { id: "b" }] }, "2026-11-09");
  assert.equal(writes.length, 0);
  queued();
  assert.deepEqual(writes, [["2026-11-09", ["a", "b"]]]);
  assert.deepEqual(syncs, ["sync"]);
  saver.schedule({ foods: [{ id: "c" }] }, "2026-11-08");
  assert.equal(queued != null, true);
  saver.flush();
  assert.deepEqual(writes[1], ["2026-11-08", ["c"]]);
  assert.equal(syncs.length, 2);
  assert.equal(saver.flush(), null);
});

test("usuals are pinned recipes plus the names logged most often", () => {
  const recipes = [
    { id: "oats", name: "Example oats" },
    { id: "chili", name: "Example chili" },
    { id: "soup", name: "Example soup" },
    { id: "rare", name: "Example rare" },
  ];
  const foods = [
    { name: "Example chili" },
    { name: "Example chili (2x)" },
    { name: "Example oats" },
    { name: "Example soup" },
    { name: "Example soup" },
    { name: "Example soup" },
  ];
  const usuals = usualRecipes(recipes, foods, ["oats"], 3);
  assert.deepEqual(usuals.map((recipe) => recipe.id), ["oats", "soup", "chili"]);
  assert.equal(searchRecipes(recipes, "").length, 0);
  assert.deepEqual(searchRecipes(recipes, "chi").map((recipe) => recipe.id), ["chili"]);
  const days = [{ date: "2026-01-01", day: { foods: [{ name: "Example oats" }] } }];
  const collected = collectLoggedFoods(days, { date: "2026-01-02", foods: [{ name: "Example soup" }] });
  assert.deepEqual(collected.map((food) => food.name), ["Example oats", "Example soup"]);
});

test("a batch shows portions left and logging one decrements it", () => {
  const chili = { id: "chili", name: "Example chili", calories: 400, batchPortions: 4, portionsLeft: 4 };
  assert.equal(portionsLeftLabel(chili), "4 of 4 portions left");
  const once = decrementPortion(chili);
  assert.equal(once.logged, true);
  assert.equal(once.recipe.portionsLeft, 3);
  assert.equal(once.recipe.calories, 400);
  assert.equal(portionsLeftLabel(once.recipe), "3 of 4 portions left");
  const empty = decrementPortion({ ...chili, portionsLeft: 0 });
  assert.equal(empty.logged, false);
  assert.equal(empty.recipe.portionsLeft, 0);
  assert.equal(portionsLeftLabel({ name: "Oats", servings: 2 }), "");
});

test("editing a batch keeps portions already used", () => {
  const fresh = batchFieldsFromForm("4", null, "2026-11-09");
  assert.deepEqual(fresh, { batchPortions: 4, portionsLeft: 4, batchStartedAt: "2026-11-09" });
  const kept = batchFieldsFromForm("4", { batchPortions: 4, portionsLeft: 2, batchStartedAt: "2026-11-07" }, "2026-11-09");
  assert.deepEqual(kept, { batchPortions: 4, portionsLeft: 2, batchStartedAt: "2026-11-07" });
  const reset = batchFieldsFromForm("6", { batchPortions: 4, portionsLeft: 1, batchStartedAt: "2026-11-01" }, "2026-11-09");
  assert.deepEqual(reset, { batchPortions: 6, portionsLeft: 6, batchStartedAt: "2026-11-09" });
  const cleared = batchFieldsFromForm("", { batchPortions: 4, portionsLeft: 2, batchStartedAt: "2026-11-07" }, "2026-11-09");
  assert.deepEqual(cleared, { batchPortions: null, portionsLeft: null, batchStartedAt: null });
});

test("the last portion and a three-day-old batch leave leftovers without deleting the recipe", () => {
  const chili = {
    id: "chili",
    name: "Example chili",
    calories: 400,
    batchPortions: 2,
    portionsLeft: 1,
    batchStartedAt: "2026-11-09",
  };
  assert.equal(leftoverVisible(chili, "2026-11-09"), true);
  const last = decrementPortion(chili);
  assert.equal(last.logged, true);
  assert.equal(last.recipe.portionsLeft, 0);
  assert.equal(last.recipe.batchPortions, 2);
  assert.equal(last.recipe.batchStartedAt, "2026-11-09");
  assert.equal(last.recipe.name, "Example chili");
  assert.equal(last.recipe.calories, 400);
  assert.equal(leftoverVisible(last.recipe, "2026-11-09"), false);

  const soup = { name: "Example soup", batchPortions: 3, portionsLeft: 2, batchStartedAt: "2026-11-07" };
  assert.equal(leftoverVisible(soup, "2026-11-07"), true);
  assert.equal(leftoverVisible(soup, "2026-11-08"), true);
  assert.equal(leftoverVisible(soup, "2026-11-09"), true);
  assert.equal(leftoverVisible(soup, "2026-11-10"), false);
  assert.equal(soup.batchPortions, 3);
  assert.equal(soup.portionsLeft, 2);

  const recent = { name: "Example oats", batchPortions: 2, portionsLeft: 2, updatedAt: "2026-11-08T15:00:00.000Z" };
  assert.equal(leftoverVisible(recent, "2026-11-09"), true);
  const old = { name: "Example oats", batchPortions: 2, portionsLeft: 2, updatedAt: "2026-11-01T15:00:00.000Z" };
  assert.equal(leftoverVisible(old, "2026-11-09"), false);
  const undated = { name: "Example oats", batchPortions: 2, portionsLeft: 2 };
  assert.equal(leftoverVisible(undated, "2026-11-09"), true);
});

test("sync indicator is green when synced, amber while waiting, and red only on a real failure", () => {
  assert.deepEqual(syncIndicator(null, { state: "idle", pending: false }), { tone: "idle", text: "" });
  assert.equal(syncIndicator(null, { state: "pending", pending: true, code: "offline", message: "You're offline." }).tone, "pending");
  assert.equal(syncIndicator({ ok: false, problem: "Latest upload failed" }, { state: "pending", pending: true, code: "network" }).tone, "pending");
  assert.equal(syncIndicator({ ok: false, problem: "Latest upload failed" }, { state: "error", pending: false, message: "Paste a token first." }).tone, "error");
  const synced = syncIndicator(
    { ok: false, problem: "Daily snapshot failed", at: "2026-11-01T12:00:00.000Z" },
    { state: "synced", pending: false, lastSyncedAt: "2026-11-04T12:00:00.000Z" },
  );
  assert.equal(synced.tone, "ok");
  assert.match(synced.text, /^Synced/);
  const partial = syncIndicator(
    { ok: false, partial: true, problem: "Inbox file not moved" },
    { state: "synced", pending: false },
  );
  assert.equal(partial.tone, "ok");
  assert.match(partial.text, /Inbox file not moved/);
});
