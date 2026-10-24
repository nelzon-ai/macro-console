// Placeholder plan for a new install. Real targets, milestones, supplements,
// and the training split are entered on the phone and stored on the device.
// Nothing in this file is a person's health record.

export const DEFAULT_TARGETS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 70,
  fiber: 30,
  water: 2000,
  steps: 8000,
  goalWeight: null,
  goalBodyFatPct: null,
  startBodyFatPct: null,
  startWeight: null,
};

export const DAILY_TARGET_KEYS = ["calories", "protein", "carbs", "fat", "fiber", "water", "steps"];
export const GOAL_TARGET_KEYS = ["startWeight", "startBodyFatPct", "goalWeight", "goalBodyFatPct"];

export const DEFAULT_MILESTONES = [];
export const DEFAULT_MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snacks"];
export const DEFAULT_SUPPLEMENT_GROUPS = [];
export const DEFAULT_SUPPLEMENT_RULES = [];
export const DEFAULT_WEEKLY_WORKOUT_TARGET = 3;

export const EXERCISE_ICONS = [
  "squat", "hinge2leg", "hinge1leg", "lunge", "overheadpress", "rotatepress", "curl", "tricepext",
  "lateralraise", "row1arm", "row2arm", "reardeltfly", "floorpress", "fly", "calf2leg", "calf1leg",
  "bridge", "splitsquat", "stepup", "legraise", "plank",
];

export const DEFAULT_WORKOUT_DAYS = [
  {
    key: "dayA",
    label: "Day A",
    sub: "Full body",
    mode: "circuit",
    exercises: [
      { icon: "squat", name: "Squat", cue: "Squat down and stand up.", sets: "3×8-12", tag: "Legs", startWeight: "", rest: 90 },
      { icon: "floorpress", name: "Press", cue: "Press the weight up.", sets: "3×8-12", tag: "Chest", startWeight: "", rest: 90 },
      { icon: "row2arm", name: "Row", cue: "Pull the weight toward your ribs.", sets: "3×8-12", tag: "Back", startWeight: "", rest: 90 },
    ],
  },
];

export function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mergeTargets(saved) {
  const merged = { ...DEFAULT_TARGETS };
  if (!saved || typeof saved !== "object") return merged;
  for (const key of [...DAILY_TARGET_KEYS, ...GOAL_TARGET_KEYS]) {
    if (!Object.prototype.hasOwnProperty.call(saved, key)) continue;
    if (GOAL_TARGET_KEYS.includes(key)) {
      merged[key] = finiteOrNull(saved[key]);
      continue;
    }
    const n = finiteOrNull(saved[key]);
    if (n != null) merged[key] = n;
  }
  return merged;
}

export function targetsToForm(targets) {
  const form = { ...mergeTargets(targets) };
  for (const key of GOAL_TARGET_KEYS) {
    if (form[key] == null) form[key] = "";
  }
  return form;
}

export function formToTargets(form) {
  const cleaned = {};
  for (const key of DAILY_TARGET_KEYS) {
    cleaned[key] = finiteOrNull(form[key]) ?? DEFAULT_TARGETS[key];
  }
  for (const key of GOAL_TARGET_KEYS) {
    cleaned[key] = finiteOrNull(form[key]);
  }
  return cleaned;
}

export function normalizeMilestones(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    weight: finiteOrNull(row && row.weight),
    bodyFat: finiteOrNull(row && (row.bodyFat != null ? row.bodyFat : row.bodyFatPct)),
    waist: finiteOrNull(row && row.waist),
  })).filter((row) => row.weight != null || row.bodyFat != null || row.waist != null);
}

export function normalizeMealTypes(value) {
  if (!Array.isArray(value)) return [...DEFAULT_MEAL_TYPES];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const name = String(item || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

function newPlanId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeSupplementGroups(value) {
  if (!Array.isArray(value)) return [];
  return value.map((group, index) => {
    const items = Array.isArray(group && group.items) ? group.items : [];
    return {
      key: String((group && group.key) || `group-${index + 1}`).trim() || `group-${index + 1}`,
      title: String((group && group.title) || "Group").trim() || "Group",
      note: String((group && group.note) || ""),
      items: items.map((item) => ({
        id: String((item && item.id) || newPlanId("item")),
        name: String((item && item.name) || "").trim(),
        dose: String((item && item.dose) || ""),
        detail: String((item && item.detail) || ""),
        reminder: !!(item && item.reminder),
        asNeeded: !!(item && item.asNeeded),
      })).filter((item) => item.name),
    };
  }).filter((group) => group.title);
}

export function normalizeSupplementRules(value) {
  if (!Array.isArray(value)) return [];
  return value.map((rule) => String(rule || "").trim()).filter(Boolean);
}

export function normalizeWeeklyTarget(value) {
  const n = finiteOrNull(value);
  if (n == null) return DEFAULT_WEEKLY_WORKOUT_TARGET;
  return Math.max(0, Math.round(n));
}

export function normalizeWorkoutDays(value) {
  if (!Array.isArray(value)) return [];
  return value.map((day, index) => {
    const exercises = Array.isArray(day && day.exercises) ? day.exercises : [];
    const key = String((day && day.key) || `day-${index + 1}`).trim() || `day-${index + 1}`;
    return {
      key,
      label: String((day && day.label) || `Day ${index + 1}`).trim() || `Day ${index + 1}`,
      sub: String((day && day.sub) || ""),
      mode: day && day.mode === "straight" ? "straight" : "circuit",
      exercises: exercises.map((ex) => {
        const icon = EXERCISE_ICONS.includes(ex && ex.icon) ? ex.icon : "squat";
        const rest = finiteOrNull(ex && ex.rest);
        return {
          icon,
          name: String((ex && ex.name) || "").trim(),
          cue: String((ex && ex.cue) || ""),
          sets: String((ex && ex.sets) || "3×8-12"),
          per: ex && ex.per ? String(ex.per) : "",
          tag: String((ex && ex.tag) || ""),
          startWeight: ex && ex.startWeight != null ? String(ex.startWeight) : "",
          rest: rest == null ? 60 : rest,
        };
      }).filter((ex) => ex.name),
    };
  }).filter((day) => day.label);
}

export function mealTypesForDisplay(configured, recipes) {
  const base = normalizeMealTypes(configured);
  const extras = [];
  for (const recipe of recipes || []) {
    const name = String((recipe && recipe.mealType) || "").trim();
    if (!name || name === "Uncategorized") continue;
    if (base.some((item) => item.toLowerCase() === name.toLowerCase())) continue;
    if (extras.some((item) => item.toLowerCase() === name.toLowerCase())) continue;
    extras.push(name);
  }
  return [...base, ...extras];
}

export function renameRecipes(recipes, renames) {
  if (!Array.isArray(renames) || renames.length === 0) return recipes;
  return (recipes || []).map((recipe) => {
    const hit = renames.find((rename) => rename.from && rename.to && recipe.mealType === rename.from);
    return hit ? { ...recipe, mealType: hit.to } : recipe;
  });
}

// Pulls only plan fields off a settings file or a full backup. Log keys are ignored.
export function planPatchFromObject(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const patch = {};
  if (parsed.targets && typeof parsed.targets === "object" && !Array.isArray(parsed.targets)) {
    patch.targets = mergeTargets(parsed.targets);
  }
  if (Array.isArray(parsed.milestones)) patch.milestones = normalizeMilestones(parsed.milestones);
  if (Array.isArray(parsed.mealTypes)) patch.mealTypes = normalizeMealTypes(parsed.mealTypes);
  if (Array.isArray(parsed.supplementGroups)) patch.supplementGroups = normalizeSupplementGroups(parsed.supplementGroups);
  if (Array.isArray(parsed.supplementRules)) patch.supplementRules = normalizeSupplementRules(parsed.supplementRules);
  if (Array.isArray(parsed.workoutDays)) patch.workoutDays = normalizeWorkoutDays(parsed.workoutDays);
  if (Object.prototype.hasOwnProperty.call(parsed, "weeklyWorkoutTarget")) {
    patch.weeklyWorkoutTarget = normalizeWeeklyTarget(parsed.weeklyWorkoutTarget);
  }
  return patch;
}

export function hasPlanFields(patch) {
  return Object.keys(patch).length > 0;
}
