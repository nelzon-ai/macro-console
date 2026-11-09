// Display helpers for the homepage. They do not write logs, plans, or sync state.

// Every main screen. The bottom bar is the way to open each one, including supplements.
export const MAIN_NAV = [
  { view: "console", label: "Today" },
  { view: "book", label: "Log" },
  { view: "workout", label: "Workout" },
  { view: "progress", label: "Progress" },
  { view: "supps", label: "Supps" },
];

// Consumed calories fill the ring from empty toward the daily target.
export function calorieProgress(eaten, target) {
  const consumed = Math.max(0, Math.round(Number(eaten) || 0));
  const goal = Math.max(0, Math.round(Number(target) || 0));
  const overBy = Math.max(0, consumed - goal);
  const percent = goal > 0 ? Math.max(0, Math.min(100, (consumed / goal) * 100)) : 0;
  return {
    consumed,
    goal,
    percent,
    over: overBy > 0 && goal > 0,
    overBy,
    toGo: goal > 0 ? Math.max(0, goal - consumed) : 0,
  };
}

export function remainder(value, target) {
  const eaten = Number(value) || 0;
  const goal = Number(target) || 0;
  const left = Math.round(goal - eaten);
  const over = left < 0;
  return {
    left,
    over,
    amount: Math.abs(left),
    percentLeft: goal > 0 ? Math.max(0, Math.min(100, (Math.max(left, 0) / goal) * 100)) : 0,
  };
}

// Leftward swipe (negative dx) moves to the next day. Vertical drags do not count.
export function swipeDayDelta(dx, dy, threshold = 56) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.25) return 0;
  return dx < 0 ? 1 : -1;
}

export function batchState(recipe) {
  const total = Number(recipe && recipe.batchPortions);
  if (!Number.isFinite(total) || total <= 0) return null;
  const rounded = Math.round(total);
  const rawLeft = recipe.portionsLeft == null ? rounded : Number(recipe.portionsLeft);
  const left = Number.isFinite(rawLeft) ? Math.max(0, Math.min(rounded, Math.round(rawLeft))) : rounded;
  return { total: rounded, left };
}

// Cook day plus the next two days. Hidden once the calendar age reaches 3.
export const LEFTOVER_VISIBLE_DAYS = 3;

export function calendarDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return formatLocalDate(value);
  }
  const text = String(value == null ? "" : value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return "";
    return formatLocalDate(parsed);
  }
  return "";
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(start, today) {
  const from = calendarDate(start);
  const to = calendarDate(today);
  if (!from || !to) return null;
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Explicit cook date, otherwise the recipe's updatedAt. Blank when neither is a date.
export function batchStartDate(recipe) {
  if (!recipe) return "";
  return calendarDate(recipe.batchStartedAt) || calendarDate(recipe.updatedAt) || "";
}

// Shown while a portion remains and the batch is younger than 3 calendar days.
// No date at all is not treated as old.
export function leftoverVisible(recipe, today) {
  const batch = batchState(recipe);
  if (!batch || batch.left <= 0) return false;
  const start = batchStartDate(recipe);
  if (!start) return true;
  const age = daysBetween(start, today);
  if (age == null || age < 0) return true;
  return age < LEFTOVER_VISIBLE_DAYS;
}

export function portionsLeftLabel(recipe) {
  const batch = batchState(recipe);
  if (!batch) return "";
  return `${batch.left} of ${batch.total} portion${batch.total === 1 ? "" : "s"} left`;
}

// Returns the recipe after one portion is logged. Does not touch the food log.
export function decrementPortion(recipe) {
  const batch = batchState(recipe);
  if (!batch || batch.left <= 0) return { recipe, logged: false };
  return {
    recipe: { ...recipe, batchPortions: batch.total, portionsLeft: batch.left - 1 },
    logged: true,
  };
}

export const USUAL_LIMIT = 8;

export function recipeNameKey(name) {
  return String(name || "").replace(/\s*\(\d+(?:\.\d+)?x\)$/i, "").trim().toLowerCase();
}

// The day's log is the foods array in the order they were added. Meal type is not a section.
export function dayLogEntries(foods) {
  return (Array.isArray(foods) ? foods : []).filter((food) => food);
}

export const PORTION_PRESETS = [0.5, 1, 1.5, 2];

function portionBaseOf(food) {
  if (food && food.portionBase && typeof food.portionBase === "object") return food.portionBase;
  const components = Array.isArray(food && food.components) ? food.components.map((item) => ({
    id: item.id,
    name: item.name,
    calories: Number(item.calories) || 0,
    protein: Number(item.protein) || 0,
    carbs: Number(item.carbs) || 0,
    fat: Number(item.fat) || 0,
    fiber: Number(item.fiber) || 0,
  })) : undefined;
  return {
    calories: Number(food && food.calories) || 0,
    protein: Number(food && food.protein) || 0,
    carbs: Number(food && food.carbs) || 0,
    fat: Number(food && food.fat) || 0,
    fiber: Number(food && food.fiber) || 0,
    components,
  };
}

function scaleMacro(value, multiplier) {
  return Math.round((Number(value) || 0) * multiplier);
}

// Scales from the entry's original amounts. Later presets do not compound.
// The id is kept. Recipe leftovers are not part of this update.
export function scaleLoggedFood(food, multiplier, now) {
  const mult = Number(multiplier);
  if (!food || !Number.isFinite(mult) || mult <= 0) return food;
  const base = portionBaseOf(food);
  const next = {
    ...food,
    id: food.id,
    calories: scaleMacro(base.calories, mult),
    protein: scaleMacro(base.protein, mult),
    carbs: scaleMacro(base.carbs, mult),
    fat: scaleMacro(base.fat, mult),
    fiber: scaleMacro(base.fiber, mult),
    portion: mult,
    portionBase: base,
    updatedAt: now || new Date().toISOString(),
  };
  if (Array.isArray(base.components)) {
    next.components = base.components.map((item) => ({
      ...item,
      calories: scaleMacro(item.calories, mult),
      protein: scaleMacro(item.protein, mult),
      carbs: scaleMacro(item.carbs, mult),
      fat: scaleMacro(item.fat, mult),
      fiber: scaleMacro(item.fiber, mult),
    }));
  }
  return next;
}

// A manual macro edit becomes the new base. The portion multiplier starts over.
export function withEditedMacros(food, macros, now) {
  const next = {
    ...food,
    name: macros.name != null ? macros.name : food.name,
    calories: Number(macros.calories) || 0,
    protein: Number(macros.protein) || 0,
    carbs: Number(macros.carbs) || 0,
    fat: Number(macros.fat) || 0,
    fiber: Number(macros.fiber) || 0,
    updatedAt: now || new Date().toISOString(),
  };
  delete next.portion;
  delete next.portionBase;
  return next;
}

// One pending day snapshot. A later schedule replaces the earlier one.
// flush writes immediately so a day change or a closing app does not drop it.
export function createDaySaver({ write, sync, delay = 700, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null;
  let pending = null;
  function run() {
    timer = null;
    const job = pending;
    pending = null;
    if (!job) return null;
    const wrote = write(job.day, job.date);
    if (sync) sync();
    return wrote;
  }
  return {
    schedule(day, date) {
      pending = { day, date };
      if (timer) cancel(timer);
      timer = schedule(run, delay);
    },
    flush() {
      if (timer) cancel(timer);
      timer = null;
      if (!pending) return null;
      return run();
    },
    drop() {
      if (timer) cancel(timer);
      timer = null;
      pending = null;
    },
  };
}

export function collectLoggedFoods(dayRecords, current) {
  const foods = [];
  const currentDate = current && current.date;
  for (const rec of dayRecords || []) {
    if (!rec || (currentDate && rec.date === currentDate)) continue;
    const list = rec.day && rec.day.foods;
    if (Array.isArray(list)) foods.push(...list);
  }
  if (current && Array.isArray(current.foods)) foods.push(...current.foods);
  return foods;
}

// Pinned recipes first, then the names logged most often. The full book stays out of the list.
export function usualRecipes(recipes, foods, pinnedIds, limit = USUAL_LIMIT) {
  const pinned = new Set((pinnedIds || []).map((id) => String(id)));
  const counts = new Map();
  for (const food of foods || []) {
    const key = recipeNameKey(food && food.name);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const pinnedRows = [];
  const frequent = [];
  for (const recipe of recipes || []) {
    if (!recipe || !recipe.name) continue;
    const key = recipeNameKey(recipe.name);
    const count = counts.get(key) || 0;
    const id = recipe.id != null ? String(recipe.id) : key;
    if (pinned.has(id)) pinnedRows.push({ recipe, count, id });
    else if (count > 0) frequent.push({ recipe, count, id });
  }
  pinnedRows.sort((a, b) => b.count - a.count || a.recipe.name.localeCompare(b.recipe.name));
  frequent.sort((a, b) => b.count - a.count || a.recipe.name.localeCompare(b.recipe.name));
  const chosen = [];
  const seen = new Set();
  for (const row of [...pinnedRows, ...frequent]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    chosen.push(row.recipe);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

export function searchRecipes(recipes, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  return (recipes || []).filter((recipe) => recipe && recipeNameKey(recipe.name).includes(q));
}

export function batchFieldsFromForm(raw, previous, today) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return { batchPortions: null, portionsLeft: null, batchStartedAt: null };
  const total = Math.round(Number(text));
  if (!Number.isFinite(total) || total <= 0) return { batchPortions: null, portionsLeft: null, batchStartedAt: null };
  const prevTotal = previous && Number(previous.batchPortions);
  const sameBatch = previous && Number.isFinite(prevTotal) && Math.round(prevTotal) === total && previous.portionsLeft != null;
  const left = sameBatch ? Math.max(0, Math.min(total, Math.round(Number(previous.portionsLeft)))) : total;
  const started = sameBatch
    ? (calendarDate(previous && previous.batchStartedAt) || null)
    : (calendarDate(today) || formatLocalDate(new Date()));
  return { batchPortions: total, portionsLeft: left, batchStartedAt: started };
}

// A newer recipe edit must not drop the cook date of the same batch.
export function preserveBatchStartedAt(winner, loser) {
  if (!winner || calendarDate(winner.batchStartedAt)) return winner;
  const kept = calendarDate(loser && loser.batchStartedAt);
  if (!kept) return winner;
  const winnerTotal = Number(winner.batchPortions);
  const loserTotal = Number(loser && loser.batchPortions);
  if (!Number.isFinite(winnerTotal) || winnerTotal <= 0) return winner;
  if (!Number.isFinite(loserTotal) || Math.round(winnerTotal) !== Math.round(loserTotal)) return winner;
  return { ...winner, batchStartedAt: kept };
}
