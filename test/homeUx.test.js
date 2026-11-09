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
  portionsLeftLabel,
  decrementPortion,
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
  const fresh = batchFieldsFromForm("4", null);
  assert.deepEqual(fresh, { batchPortions: 4, portionsLeft: 4 });
  const kept = batchFieldsFromForm("4", { batchPortions: 4, portionsLeft: 2 });
  assert.deepEqual(kept, { batchPortions: 4, portionsLeft: 2 });
  const cleared = batchFieldsFromForm("", { batchPortions: 4, portionsLeft: 2 });
  assert.deepEqual(cleared, { batchPortions: null, portionsLeft: null });
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
