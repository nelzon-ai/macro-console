// Display helpers for the homepage. They do not write logs, plans, or sync state.

// Every main screen. The bottom bar is the way to open each one, including supplements.
export const MAIN_NAV = [
  { view: "console", label: "Today" },
  { view: "book", label: "Log" },
  { view: "workout", label: "Workout" },
  { view: "progress", label: "Progress" },
  { view: "supps", label: "Supps" },
];

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

export function batchFieldsFromForm(raw, previous) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return { batchPortions: null, portionsLeft: null };
  const total = Math.round(Number(text));
  if (!Number.isFinite(total) || total <= 0) return { batchPortions: null, portionsLeft: null };
  const prevTotal = previous && Number(previous.batchPortions);
  const sameBatch = previous && Number.isFinite(prevTotal) && Math.round(prevTotal) === total && previous.portionsLeft != null;
  const left = sameBatch ? Math.max(0, Math.min(total, Math.round(Number(previous.portionsLeft)))) : total;
  return { batchPortions: total, portionsLeft: left };
}
