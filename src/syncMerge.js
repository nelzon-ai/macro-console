// Pure merge for two-way sync. Absence is never a deletion: an entry is removed
// only by an explicit tombstone, and only when that tombstone is not older than
// the entry. Conflicting edits keep the winner in the live log and the other
// copy under `conflicts`, which is stored in the private repo.

import { normalizeWeeklyTarget, normalizeWorkoutDays } from "./planSettings.js";

const MACRO_KEYS = ["calories", "protein", "carbs", "fat", "fiber"];
const HISTORY_FIELDS = [...MACRO_KEYS, "weight", "water", "steps", "workoutDone"];
const MEASURE_KEYS = ["waist", "chest", "thigh", "arm", "neck", "hips"];

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function emptyDocument(partial = {}) {
  const source = isObject(partial) ? partial : {};
  return {
    exportedAt: source.exportedAt || null,
    targets: source.targets ?? null,
    meta: source.meta ?? null,
    history: Array.isArray(source.history) ? clone(source.history) : [],
    recipes: Array.isArray(source.recipes) ? clone(source.recipes) : [],
    bodyComp: Array.isArray(source.bodyComp) ? clone(source.bodyComp) : [],
    measurements: Array.isArray(source.measurements) ? clone(source.measurements) : [],
    milestones: Array.isArray(source.milestones) ? clone(source.milestones) : [],
    mealTypes: Array.isArray(source.mealTypes) ? clone(source.mealTypes) : [],
    supplementGroups: Array.isArray(source.supplementGroups) ? clone(source.supplementGroups) : [],
    supplementRules: Array.isArray(source.supplementRules) ? clone(source.supplementRules) : [],
    workoutDays: Array.isArray(source.workoutDays) ? clone(source.workoutDays) : [],
    weeklyWorkoutTarget: source.weeklyWorkoutTarget != null ? source.weeklyWorkoutTarget : null,
    workoutPlanBackups: Array.isArray(source.workoutPlanBackups) ? clone(source.workoutPlanBackups) : [],
    today: isObject(source.today) ? clone(source.today) : null,
    days: Array.isArray(source.days) ? clone(source.days) : [],
    deleted: Array.isArray(source.deleted) ? clone(source.deleted) : [],
    conflicts: Array.isArray(source.conflicts) ? clone(source.conflicts) : [],
    applied: Array.isArray(source.applied) ? clone(source.applied) : [],
    credits: Array.isArray(source.credits) ? clone(source.credits) : [],
  };
}

function timeOf(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function newerSide(localAt, remoteAt) {
  const local = timeOf(localAt);
  const remote = timeOf(remoteAt);
  if (local == null && remote == null) return "tie";
  if (local == null) return "remote";
  if (remote == null) return "local";
  if (remote > local) return "remote";
  if (local > remote) return "local";
  return "tie";
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).filter((key) => key !== "updatedAt").sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameValue(left, right) {
  return stable(left) === stable(right);
}

function emptyScalar(value) {
  return value == null || value === "";
}

function dateKey(entry) {
  const date = entry && typeof entry.date === "string" ? entry.date.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function keptKey(keyFn) {
  return (entry) => {
    if (!entry || typeof entry !== "object") return "";
    return keyFn(entry) || `raw:${stable(entry)}`;
  };
}

function recipeKey(recipe) {
  if (!recipe || typeof recipe !== "object") return "";
  if (recipe.id) return `id:${String(recipe.id)}`;
  const name = String(recipe.name || "").trim().toLowerCase();
  return name ? `name:${name}` : "";
}

function foodKey(food, date) {
  if (!food || typeof food !== "object") return "";
  if (food.id) return `id:${String(food.id)}`;
  const name = String(food.name || "").trim().toLowerCase();
  if (!name) return "";
  const nums = MACRO_KEYS.map((key) => Number(food[key]) || 0).join(",");
  return `content:${date}:${name}:${nums}`;
}

function tombstoneKey(tomb) {
  if (!tomb || !tomb.collection) return "";
  const collection = String(tomb.collection);
  if (collection === "recipes") {
    if (tomb.id) return `recipes:id:${tomb.id}`;
    if (tomb.name) return `recipes:name:${String(tomb.name).trim().toLowerCase()}`;
    return "";
  }
  if (collection === "foods") {
    if (!tomb.id) return "";
    return `foods:${tomb.date || ""}:${tomb.id}`;
  }
  if (collection === "water" || collection === "steps") {
    if (!tomb.id) return "";
    return `${collection}:${tomb.id}`;
  }
  if (!tomb.date) return "";
  return `${collection}:${tomb.date}`;
}

function entryMatchesTombstone(tomb, collection, identity, date) {
  if (!tomb || tomb.collection !== collection) return false;
  if (collection === "foods") {
    if (!tomb.id || tomb.id !== identity) return false;
    if (tomb.date && date && tomb.date !== date) return false;
    return true;
  }
  if (collection === "recipes") {
    if (tomb.id && identity === `id:${tomb.id}`) return true;
    if (!tomb.id && tomb.name && identity === `name:${String(tomb.name).trim().toLowerCase()}`) return true;
    return false;
  }
  if (collection === "water" || collection === "steps") {
    return !!tomb.id && tomb.id === identity;
  }
  return tomb.date && tomb.date === identity;
}

function tombstoneWins(tombstones, collection, identity, date, updatedAt) {
  const hits = tombstones.filter((tomb) => entryMatchesTombstone(tomb, collection, identity, date));
  if (hits.length === 0) return null;
  const newest = hits.reduce((best, tomb) => {
    const t = timeOf(tomb.deletedAt) || 0;
    return t >= best.t ? { t, tomb } : best;
  }, { t: -1, tomb: null });
  const deletedAt = timeOf(newest.tomb && newest.tomb.deletedAt);
  const editedAt = timeOf(updatedAt);
  if (editedAt != null && deletedAt != null && editedAt > deletedAt) return null;
  if (editedAt != null && deletedAt == null) return null;
  return newest.tomb;
}

function pushConflict(conflicts, record) {
  const key = `${record.collection}|${record.identity}|${record.resolution}|${stable(record.dropped)}`;
  if (conflicts.some((item) => `${item.collection}|${item.identity}|${item.resolution}|${stable(item.dropped)}` === key)) return;
  conflicts.push(record);
}

function mergeTombstones(localList, remoteList) {
  const byKey = new Map();
  for (const tomb of [...(localList || []), ...(remoteList || [])]) {
    const key = tombstoneKey(tomb);
    if (!key || !tomb.deletedAt) continue;
    const prev = byKey.get(key);
    if (!prev || (timeOf(tomb.deletedAt) || 0) >= (timeOf(prev.deletedAt) || 0)) {
      byKey.set(key, {
        collection: tomb.collection,
        id: tomb.id || undefined,
        name: tomb.name || undefined,
        date: tomb.date || undefined,
        deletedAt: tomb.deletedAt,
      });
    }
  }
  return [...byKey.values()];
}

function chooseUpdatedAt(localAt, remoteAt, _now, side) {
  if (side === "remote") return remoteAt || localAt || null;
  return localAt || remoteAt || null;
}

function mergeScalar(local, remote, localAt, remoteAt, mode) {
  if (sameValue(local, remote)) return { value: local !== undefined ? local : remote, conflict: false };
  const side = newerSide(localAt, remoteAt);
  if (emptyScalar(local) && !emptyScalar(remote)) {
    if (side === "local" && timeOf(localAt) != null) return { value: local, conflict: true, dropped: remote, resolution: "local" };
    return { value: remote, conflict: !emptyScalar(local), dropped: local, resolution: "remote" };
  }
  if (emptyScalar(remote) && !emptyScalar(local)) {
    if (side === "remote" && timeOf(remoteAt) != null) return { value: remote, conflict: true, dropped: local, resolution: "remote" };
    return { value: local, conflict: false };
  }
  if (side === "remote") return { value: remote, conflict: true, dropped: local, resolution: "remote" };
  if (side === "local") return { value: local, conflict: true, dropped: remote, resolution: "local" };
  if (mode === "max") {
    const ln = Number(local) || 0;
    const rn = Number(remote) || 0;
    if (rn > ln) return { value: remote, conflict: true, dropped: local, resolution: "remote" };
    if (ln > rn) return { value: local, conflict: true, dropped: remote, resolution: "local" };
  }
  if (mode === "or") {
    if (remote === true && local !== true) return { value: true, conflict: true, dropped: local, resolution: "remote" };
    return { value: local === true || remote === true, conflict: local !== remote, dropped: remote, resolution: "local" };
  }
  return { value: local, conflict: true, dropped: remote, resolution: "local" };
}

function indexBy(entries, keyFn) {
  const map = new Map();
  for (const entry of entries || []) {
    const key = keyFn(entry);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }
  return map;
}

function collapseSide(entries, keyFn) {
  const map = indexBy(entries, keyFn);
  const out = [];
  for (const [key, group] of map) {
    let chosen = group[0];
    for (const item of group.slice(1)) {
      const side = newerSide(chosen.updatedAt, item.updatedAt);
      if (side === "remote") chosen = item;
      else if (side === "tie" && !sameValue(chosen, item)) chosen = item;
    }
    out.push({ key, entry: chosen, dupes: group.length > 1 ? group : null });
  }
  return out;
}

function recordFieldConflict(conflicts, collection, identity, date, resolution, dropped, now) {
  if (dropped == null || !conflicts) return;
  pushConflict(conflicts, {
    at: now,
    collection,
    identity,
    date: date || undefined,
    resolution,
    reason: "edit",
    dropped,
  });
}

function mergeHistoryRecords(local, remote, conflicts, now) {
  const out = { date: local.date || remote.date };
  const localAt = local.updatedAt;
  const remoteAt = remote.updatedAt;
  const fields = new Set([
    ...HISTORY_FIELDS,
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);
  fields.delete("date");
  fields.delete("updatedAt");
  for (const field of fields) {
    const mode = MACRO_KEYS.includes(field) || field === "water" || field === "steps"
      ? "max"
      : field === "workoutDone"
        ? "or"
        : "local";
    const merged = mergeScalar(local[field], remote[field], localAt, remoteAt, mode);
    if (merged.value !== undefined) out[field] = merged.value;
    if (merged.conflict) {
      recordFieldConflict(conflicts, "history", out.date, out.date, merged.resolution, { [field]: merged.dropped }, now);
    }
  }
  out.updatedAt = chooseUpdatedAt(localAt, remoteAt, now, newerSide(localAt, remoteAt));
  return out;
}

function mergeMeasurementRecords(local, remote, conflicts, now, collection = "measurements") {
  const out = { date: local.date || remote.date };
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)].filter((key) => key !== "updatedAt" && key !== "date"));
  for (const field of keys) {
    const merged = mergeScalar(local[field], remote[field], local.updatedAt, remote.updatedAt, "local");
    if (!emptyScalar(merged.value)) out[field] = merged.value;
    else if (merged.value != null) out[field] = merged.value;
    if (merged.conflict) {
      recordFieldConflict(conflicts, collection, out.date, out.date, merged.resolution, { [field]: merged.dropped }, now);
    }
  }
  out.updatedAt = chooseUpdatedAt(local.updatedAt, remote.updatedAt, now, newerSide(local.updatedAt, remote.updatedAt));
  return out;
}

function mergeWholeEntry(local, remote, conflicts, collection, identity, date, now) {
  if (sameValue(local, remote)) {
    return { ...clone(local), updatedAt: local.updatedAt || remote.updatedAt || null };
  }
  const side = newerSide(local.updatedAt, remote.updatedAt);
  const winner = side === "remote" ? remote : local;
  const loser = winner === local ? remote : local;
  pushConflict(conflicts, {
    at: now,
    collection,
    identity,
    date: date || undefined,
    resolution: winner === local ? "local" : "remote",
    reason: "edit",
    dropped: clone(loser),
  });
  return { ...clone(winner), updatedAt: chooseUpdatedAt(local.updatedAt, remote.updatedAt, now, side) };
}

function mergeKeyedCollection(localEntries, remoteEntries, keyFn, mergePair, collection, conflicts, tombstones, now, dateOf) {
  const localCollapsed = collapseSide(localEntries, keyFn);
  const remoteCollapsed = collapseSide(remoteEntries, keyFn);
  const remoteByKey = new Map(remoteCollapsed.map((item) => [item.key, item.entry]));
  const seen = new Set();
  const out = [];
  const consider = (key, local, remote) => {
    seen.add(key);
    const date = dateOf ? dateOf(local, remote, key) : (local && local.date) || (remote && remote.date) || "";
    const updatedAt = newerSide(local && local.updatedAt, remote && remote.updatedAt) === "remote"
      ? remote && remote.updatedAt
      : (local && local.updatedAt) || (remote && remote.updatedAt);
    const identity = collection === "recipes" || collection === "foods" ? key.replace(/^id:/, "").replace(/^content:.*$/, key) : date || key;
    const matchId = collection === "foods"
      ? (key.startsWith("id:") ? key.slice(3) : "")
      : collection === "recipes"
        ? (key.startsWith("id:") ? key.slice(3) : "")
        : date || key;
    const tombIdentity = collection === "recipes" ? key : collection === "foods" ? matchId : (date || key);
    const tomb = tombstoneWins(tombstones, collection, collection === "recipes" ? key : tombIdentity, date, updatedAt);
    const present = local || remote;
    if (tomb) {
      pushConflict(conflicts, {
        at: now,
        collection,
        identity: key,
        date: date || undefined,
        resolution: "deleted",
        reason: "deleted",
        deletedAt: tomb.deletedAt,
        dropped: clone(present),
      });
      return;
    }
    if (local && remote) out.push(mergePair(local, remote));
    else out.push({ ...clone(local || remote), updatedAt: (local || remote).updatedAt || null });
  };
  for (const item of localCollapsed) consider(item.key, item.entry, remoteByKey.get(item.key) || null);
  for (const item of remoteCollapsed) {
    if (!seen.has(item.key)) consider(item.key, null, item.entry);
  }
  return out;
}

function sumMacros(foods) {
  return (foods || []).reduce((acc, food) => ({
    calories: acc.calories + (Number(food.calories) || 0),
    protein: acc.protein + (Number(food.protein) || 0),
    carbs: acc.carbs + (Number(food.carbs) || 0),
    fat: acc.fat + (Number(food.fat) || 0),
    fiber: acc.fiber + (Number(food.fiber) || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

function mergeFoodLists(localFoods, remoteFoods, date, conflicts, tombstones, now) {
  const merged = mergeKeyedCollection(
    localFoods || [],
    remoteFoods || [],
    (food) => foodKey(food, date),
    (local, remote) => mergeWholeEntry(local, remote, conflicts, "foods", foodKey(local, date), date, now),
    "foods",
    conflicts,
    tombstones,
    now,
    () => date,
  );
  return merged.sort((a, b) => String(a.id || a.name || "").localeCompare(String(b.id || b.name || "")));
}

function mergeWorkout(localWorkout, remoteWorkout, localAt, remoteAt, conflicts, date, tombstones, now) {
  const tomb = tombstoneWins(tombstones, "workouts", date, date, newerSide(localAt, remoteAt) === "remote" ? remoteAt : localAt);
  if (tomb) {
    if (localWorkout || remoteWorkout) {
      pushConflict(conflicts, {
        at: now,
        collection: "workouts",
        identity: date,
        date,
        resolution: "deleted",
        reason: "deleted",
        deletedAt: tomb.deletedAt,
        dropped: clone(localWorkout || remoteWorkout),
      });
    }
    return null;
  }
  if (!localWorkout && !remoteWorkout) return null;
  if (!localWorkout || !remoteWorkout) {
    const only = localWorkout || remoteWorkout;
    const onlyAt = localWorkout ? localAt : remoteAt;
    const otherAt = localWorkout ? remoteAt : localAt;
    if (!localWorkout && newerSide(localAt, remoteAt) === "local" && timeOf(localAt) != null && emptyScalar(remoteWorkout)) {
      return null;
    }
    if (!remoteWorkout && newerSide(localAt, remoteAt) === "remote" && timeOf(remoteAt) != null) return null;
    return { ...clone(only), updatedAt: only.updatedAt || onlyAt || otherAt || null };
  }
  if (sameValue(localWorkout, remoteWorkout)) {
    return { ...clone(localWorkout), updatedAt: localWorkout.updatedAt || remoteWorkout.updatedAt || null };
  }
  const side = newerSide(localWorkout.updatedAt || localAt, remoteWorkout.updatedAt || remoteAt);
  const done = mergeScalar(!!localWorkout.done, !!remoteWorkout.done, localAt, remoteAt, "or");
  const type = mergeScalar(localWorkout.type, remoteWorkout.type, localAt, remoteAt, "local");
  const duration = mergeScalar(localWorkout.duration, remoteWorkout.duration, localAt, remoteAt, "max");
  if (type.conflict) recordFieldConflict(conflicts, "workouts", date, date, type.resolution, { type: type.dropped }, now);
  if (duration.conflict) recordFieldConflict(conflicts, "workouts", date, date, duration.resolution, { duration: duration.dropped }, now);
  return {
    done: !!done.value,
    type: type.value || "Strength",
    duration: duration.value ?? 0,
    updatedAt: chooseUpdatedAt(localWorkout.updatedAt || localAt, remoteWorkout.updatedAt || remoteAt, now, side),
  };
}

function blankDay() {
  return { foods: [], weight: null, water: 0, steps: null, workout: null, locked: false };
}

function mergeDayRecords(localRec, remoteRec, conflicts, tombstones, now) {
  const date = (localRec && localRec.date) || (remoteRec && remoteRec.date);
  const localDay = (localRec && localRec.day) || blankDay();
  const remoteDay = (remoteRec && remoteRec.day) || blankDay();
  const localAt = (localRec && localRec.updatedAt) || localDay.updatedAt;
  const remoteAt = (remoteRec && remoteRec.updatedAt) || remoteDay.updatedAt;
  const foods = mergeFoodLists(localDay.foods, remoteDay.foods, date, conflicts, tombstones, now);
  const weight = mergeScalar(localDay.weight, remoteDay.weight, localAt, remoteAt, "local");
  const water = mergeScalar(localDay.water, remoteDay.water, localAt, remoteAt, "max");
  const steps = mergeScalar(localDay.steps, remoteDay.steps, localAt, remoteAt, "max");
  const locked = mergeScalar(!!localDay.locked, !!remoteDay.locked, localAt, remoteAt, "or");
  if (weight.conflict) recordFieldConflict(conflicts, "days", date, date, weight.resolution, { weight: weight.dropped }, now);
  const workout = mergeWorkout(localDay.workout, remoteDay.workout, localAt, remoteAt, conflicts, date, tombstones, now);
  const day = {
    foods,
    weight: weight.value == null ? null : weight.value,
    water: Number(water.value) || 0,
    steps: steps.value == null ? null : steps.value,
    workout,
    locked: !!locked.value,
  };
  return {
    date,
    updatedAt: chooseUpdatedAt(localAt, remoteAt, now, newerSide(localAt, remoteAt)),
    day,
  };
}

function foldToday(doc) {
  if (!doc.today || !doc.today.date || !doc.today.day) return doc;
  const days = (doc.days || []).filter((item) => item && item.date !== doc.today.date);
  days.push({
    date: doc.today.date,
    updatedAt: doc.today.updatedAt || doc.today.day.updatedAt || null,
    day: clone(doc.today.day),
  });
  return { ...doc, days };
}

function dayHasSignal(day) {
  if (!day) return false;
  if (day.foods && day.foods.length > 0) return true;
  if (day.weight != null) return true;
  if (day.water) return true;
  if (day.steps) return true;
  if (day.workout && day.workout.done) return true;
  return false;
}

function enforceWorkoutTombstones(days, history, tombstones) {
  for (const tomb of tombstones) {
    if (!tomb || tomb.collection !== "workouts" || !tomb.date) continue;
    const rec = days.find((item) => item.date === tomb.date);
    const row = history.find((item) => item.date === tomb.date);
    const updatedAt = (rec && rec.updatedAt) || (row && row.updatedAt);
    if (!tombstoneWins([tomb], "workouts", tomb.date, tomb.date, updatedAt)) continue;
    if (rec && rec.day) rec.day.workout = null;
    if (row) row.workoutDone = false;
  }
}

function raiseHistoryFromFoods(history, days) {
  const byDate = new Map(history.map((entry) => [entry.date, entry]));
  for (const rec of days) {
    if (!rec || !rec.date || !rec.day) continue;
    const foods = rec.day.foods || [];
    let row = byDate.get(rec.date);
    if (!row && dayHasSignal(rec.day)) {
      row = {
        date: rec.date,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        weight: rec.day.weight ?? null,
        water: rec.day.water || 0,
        steps: rec.day.steps ?? null,
        workoutDone: !!(rec.day.workout && rec.day.workout.done),
        updatedAt: rec.updatedAt,
      };
      history.push(row);
      byDate.set(rec.date, row);
    }
    if (!row) continue;
    if (foods.length > 0) {
      const sum = sumMacros(foods);
      for (const key of MACRO_KEYS) {
        if (sum[key] > (Number(row[key]) || 0)) row[key] = sum[key];
      }
    }
    if (row.weight == null && rec.day.weight != null) row.weight = rec.day.weight;
    if (rec.day.weight == null && row.weight != null) rec.day.weight = row.weight;
    if ((row.water || 0) < (rec.day.water || 0)) row.water = rec.day.water;
    if ((rec.day.water || 0) < (row.water || 0)) rec.day.water = row.water || 0;
    if (row.steps == null && rec.day.steps != null) row.steps = rec.day.steps;
    if (rec.day.steps == null && row.steps != null) rec.day.steps = row.steps;
    if (rec.day.workout && rec.day.workout.done) row.workoutDone = true;
    if (row.workoutDone && !rec.day.workout) {
      rec.day.workout = { done: true, type: "Strength", duration: 0 };
    }
  }
  history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return history;
}

function dropTombstonedDates(entries, collection, tombstones, conflicts, now) {
  return (entries || []).filter((entry) => {
    const date = entry.date;
    const tomb = tombstoneWins(tombstones, collection, date, date, entry.updatedAt);
    if (!tomb) return true;
    pushConflict(conflicts, {
      at: now,
      collection,
      identity: date,
      date,
      resolution: "deleted",
      reason: "deleted",
      deletedAt: tomb.deletedAt,
      dropped: clone(entry),
    });
    return false;
  });
}

export function mergeDocuments(localRaw, remoteRaw, options = {}) {
  const now = options.now || new Date().toISOString();
  const local = foldToday(emptyDocument(localRaw));
  const remote = foldToday(emptyDocument(remoteRaw));
  const conflicts = [];
  for (const existing of [...local.conflicts, ...remote.conflicts]) {
    if (existing && existing.collection && existing.dropped !== undefined) conflicts.push(clone(existing));
  }
  const deleted = mergeTombstones(
    [...local.deleted, ...(options.tombstones || [])],
    remote.deleted,
  );

  let history = mergeKeyedCollection(
    local.history,
    remote.history,
    keptKey(dateKey),
    (a, b) => mergeHistoryRecords(a, b, conflicts, now),
    "history",
    conflicts,
    deleted,
    now,
  );
  history = dropTombstonedDates(history, "history", deleted, conflicts, now);

  const bodyComp = dropTombstonedDates(
    mergeKeyedCollection(
      local.bodyComp,
      remote.bodyComp,
      keptKey(dateKey),
      (a, b) => {
        const merged = mergeMeasurementRecords(a, b, conflicts, now, "bodyComp");
        merged.date = a.date || b.date;
        return merged;
      },
      "bodyComp",
      conflicts,
      deleted,
      now,
    ),
    "bodyComp",
    deleted,
    conflicts,
    now,
  );

  const measurements = dropTombstonedDates(
    mergeKeyedCollection(
      local.measurements,
      remote.measurements,
      keptKey(dateKey),
      (a, b) => mergeMeasurementRecords(a, b, conflicts, now),
      "measurements",
      conflicts,
      deleted,
      now,
    ),
    "measurements",
    deleted,
    conflicts,
    now,
  );

  const recipes = mergeKeyedCollection(
    local.recipes,
    remote.recipes,
    keptKey(recipeKey),
    (a, b) => mergeWholeEntry(a, b, conflicts, "recipes", recipeKey(a), "", now),
    "recipes",
    conflicts,
    deleted,
    now,
  ).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  let days = mergeKeyedCollection(
    local.days,
    remote.days,
    keptKey(dateKey),
    (a, b) => mergeDayRecords(a, b, conflicts, deleted, now),
    "days",
    conflicts,
    deleted,
    now,
  );
  days = days.filter((rec) => {
    const tomb = tombstoneWins(deleted, "days", rec.date, rec.date, rec.updatedAt);
    if (!tomb) return true;
    pushConflict(conflicts, {
      at: now,
      collection: "days",
      identity: rec.date,
      date: rec.date,
      resolution: "deleted",
      reason: "deleted",
      deletedAt: tomb.deletedAt,
      dropped: clone(rec),
    });
    return false;
  });
  days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  days = days.map((rec) => {
    const foods = mergeFoodLists((rec.day && rec.day.foods) || [], [], rec.date, conflicts, deleted, now);
    return { ...rec, day: { ...(rec.day || blankDay()), foods } };
  });
  history = raiseHistoryFromFoods(history, days);
  enforceWorkoutTombstones(days, history, deleted);
  const applied = applyActivityCredits({
    days,
    history,
    applied: [...(local.applied || []), ...(remote.applied || [])],
    credits: [...(local.credits || []), ...(remote.credits || [])],
    tombstones: deleted,
    conflicts,
    now,
  });

  const todayDate = local.today && local.today.date;
  let today = local.today ? clone(local.today) : null;
  if (todayDate) {
    const found = days.find((rec) => rec.date === todayDate);
    if (found) today = { date: found.date, day: clone(found.day), updatedAt: found.updatedAt };
  }

  const document = {
    exportedAt: now,
    targets: clone(local.targets),
    meta: clone(local.meta),
    history,
    recipes,
    bodyComp: bodyComp.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    measurements: measurements.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    milestones: clone(local.milestones),
    mealTypes: clone(local.mealTypes),
    supplementGroups: clone(local.supplementGroups),
    supplementRules: clone(local.supplementRules),
    workoutDays: clone(local.workoutDays),
    weeklyWorkoutTarget: local.weeklyWorkoutTarget,
    workoutPlanBackups: unionPlanBackups(local.workoutPlanBackups, remote.workoutPlanBackups),
    today,
    days,
    deleted,
    conflicts,
    applied,
    credits: [],
  };
  return { document };
}

function activityKey(item) {
  if (!item || !item.kind || !item.id) return "";
  return `${item.kind}:${item.id}`;
}

function ensureActivityRows(days, history, date) {
  let rec = days.find((item) => item.date === date);
  if (!rec) {
    rec = { date, updatedAt: null, day: blankDay() };
    days.push(rec);
  }
  if (!rec.day) rec.day = blankDay();
  let row = history.find((item) => item.date === date);
  if (!row) {
    row = {
      date,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      weight: null,
      water: Number(rec.day.water) || 0,
      steps: rec.day.steps == null ? null : rec.day.steps,
      workoutDone: !!(rec.day.workout && rec.day.workout.done),
    };
    history.push(row);
  }
  return { rec, row };
}

function readActivityTotal(rec, row, kind) {
  if (kind === "water") return Number(rec.day.water || row.water) || 0;
  const value = rec.day.steps != null ? rec.day.steps : row.steps;
  return Number(value) || 0;
}

function writeActivityTotal(rec, row, kind, value) {
  const next = Math.max(0, Number(value) || 0);
  if (kind === "water") {
    rec.day.water = next;
    row.water = next;
    return;
  }
  rec.day.steps = next;
  row.steps = next;
}

function applyActivityCredits({ days, history, applied, credits, tombstones, conflicts, now }) {
  const byKey = new Map();
  for (const item of applied || []) {
    const key = activityKey(item);
    if (!key) continue;
    byKey.set(key, { ...item });
  }
  const ordered = [...(credits || [])].filter((item) => activityKey(item)).sort((a, b) => activityKey(a).localeCompare(activityKey(b)));
  for (const credit of ordered) {
    const key = activityKey(credit);
    const existing = byKey.get(key);
    const tomb = tombstoneWins(tombstones, credit.kind, credit.id, credit.date, credit.updatedAt);
    if (tomb) {
      if (existing && (existing.kind === "water" || existing.mode === "add")) {
        const rows = ensureActivityRows(days, history, existing.date || credit.date);
        const current = readActivityTotal(rows.rec, rows.row, existing.kind);
        writeActivityTotal(rows.rec, rows.row, existing.kind, current - (Number(existing.amount) || 0));
      }
      if (existing) {
        pushConflict(conflicts, {
          at: now,
          collection: credit.kind,
          identity: credit.id,
          date: existing.date || credit.date,
          resolution: "deleted",
          reason: "deleted",
          deletedAt: tomb.deletedAt,
          dropped: clone(existing),
        });
        byKey.delete(key);
      }
      continue;
    }
    if (credit.mode === "add") {
      const amount = Number(credit.amount) || 0;
      const rows = ensureActivityRows(days, history, credit.date);
      const current = readActivityTotal(rows.rec, rows.row, credit.kind);
      if (existing && existing.date === credit.date) {
        const base = existing.base == null ? null : Number(existing.base);
        // base is the total before this id was added. If the phone still shows
        // that total, the add never landed and it is safe to add once.
        if (base != null && base === current) {
          writeActivityTotal(rows.rec, rows.row, credit.kind, current + amount);
        } else if (base == null && existing.amount !== amount && newerSide(existing.updatedAt, credit.updatedAt) !== "local") {
          writeActivityTotal(rows.rec, rows.row, credit.kind, current + (amount - (Number(existing.amount) || 0)));
        }
        byKey.set(key, {
          kind: credit.kind,
          id: credit.id,
          date: credit.date,
          amount,
          mode: "add",
          base: base == null ? current - (Number(existing.amount) || 0) : base,
          updatedAt: credit.updatedAt || existing.updatedAt || null,
        });
        continue;
      }
      if (existing && existing.date && existing.date !== credit.date) {
        if (newerSide(existing.updatedAt, credit.updatedAt) === "local") {
          byKey.set(key, existing);
          continue;
        }
        const oldRows = ensureActivityRows(days, history, existing.date);
        const oldTotal = readActivityTotal(oldRows.rec, oldRows.row, credit.kind);
        writeActivityTotal(oldRows.rec, oldRows.row, credit.kind, oldTotal - (Number(existing.amount) || 0));
      }
      writeActivityTotal(rows.rec, rows.row, credit.kind, current + amount);
      byKey.set(key, {
        kind: credit.kind,
        id: credit.id,
        date: credit.date,
        amount,
        mode: "add",
        base: current,
        updatedAt: credit.updatedAt || null,
      });
      continue;
    }
    const rows = ensureActivityRows(days, history, credit.date);
    const current = readActivityTotal(rows.rec, rows.row, "steps");
    if ((Number(credit.amount) || 0) > current) writeActivityTotal(rows.rec, rows.row, "steps", credit.amount);
    byKey.set(key, {
      kind: "steps",
      id: credit.id,
      date: credit.date,
      amount: credit.amount,
      mode: "max",
      updatedAt: credit.updatedAt || null,
    });
  }
  for (const tomb of tombstones || []) {
    if (!tomb || (tomb.collection !== "water" && tomb.collection !== "steps") || !tomb.id) continue;
    const key = `${tomb.collection}:${tomb.id}`;
    const existing = byKey.get(key);
    if (!existing) continue;
    if (!tombstoneWins([tomb], tomb.collection, tomb.id, existing.date, existing.updatedAt)) continue;
    if (existing.kind === "water" || existing.mode === "add") {
      const rows = ensureActivityRows(days, history, existing.date);
      const current = readActivityTotal(rows.rec, rows.row, existing.kind);
      writeActivityTotal(rows.rec, rows.row, existing.kind, current - (Number(existing.amount) || 0));
    }
    pushConflict(conflicts, {
      at: now,
      collection: tomb.collection,
      identity: tomb.id,
      date: existing.date,
      resolution: "deleted",
      reason: "deleted",
      deletedAt: tomb.deletedAt,
      dropped: clone(existing),
    });
    byKey.delete(key);
  }
  days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return [...byKey.values()];
}

function requireDate(entry) {
  return dateKey(entry);
}

function withStamp(entry, fallback) {
  return entry.updatedAt || fallback;
}

export function documentFromInbox(inbox, now) {
  const doc = emptyDocument({ exportedAt: (inbox && inbox.createdAt) || now });
  const settings = {};
  let workoutPlan = null;
  if (!isObject(inbox)) return { document: doc, settings, workoutPlan };
  if (isObject(inbox.settings)) Object.assign(settings, inbox.settings);
  const entries = Array.isArray(inbox.entries) ? inbox.entries : [];
  for (const entry of entries) {
    if (!isObject(entry) || !entry.type) continue;
    const stamp = withStamp(entry, inbox.createdAt || now);
    if (entry.type === "settings" && isObject(entry.settings)) {
      Object.assign(settings, entry.settings);
      continue;
    }
    if (entry.type === "delete") {
      const tomb = {
        collection: entry.collection,
        id: entry.id || undefined,
        name: entry.name || undefined,
        date: entry.date || undefined,
        deletedAt: entry.deletedAt || stamp,
      };
      if (tombstoneKey(tomb)) doc.deleted.push(tomb);
      continue;
    }
    if (entry.type === "food") {
      const date = requireDate(entry);
      if (!date || !String(entry.name || "").trim()) continue;
      const food = {
        id: entry.id || undefined,
        name: String(entry.name).trim(),
        calories: Number(entry.calories) || 0,
        protein: Number(entry.protein) || 0,
        carbs: Number(entry.carbs) || 0,
        fat: Number(entry.fat) || 0,
        fiber: Number(entry.fiber) || 0,
        updatedAt: stamp,
      };
      if (Array.isArray(entry.components)) food.components = clone(entry.components);
      const rec = doc.days.find((item) => item.date === date);
      if (rec) rec.day.foods.push(food);
      else doc.days.push({ date, updatedAt: stamp, day: { ...blankDay(), foods: [food] } });
      continue;
    }
    if (entry.type === "weighIn") {
      const date = requireDate(entry);
      if (!date || entry.weight == null || entry.weight === "") continue;
      const weight = Number(entry.weight);
      if (!Number.isFinite(weight)) continue;
      upsertInboxHistory(doc, date, { weight, updatedAt: stamp });
      upsertInboxDay(doc, date, stamp, (day) => { day.weight = weight; });
      continue;
    }
    if (entry.type === "workout") {
      const date = requireDate(entry);
      if (!date) continue;
      const workout = {
        done: entry.done !== false,
        type: entry.workoutType || entry.workoutName || "Strength",
        duration: Number(entry.duration) || 0,
        updatedAt: stamp,
      };
      upsertInboxHistory(doc, date, { workoutDone: !!workout.done, updatedAt: stamp });
      upsertInboxDay(doc, date, stamp, (day) => { day.workout = workout; });
      continue;
    }
    if (entry.type === "measurement") {
      const date = requireDate(entry);
      if (!date) continue;
      const measurement = { date, updatedAt: stamp };
      let any = false;
      for (const key of MEASURE_KEYS) {
        if (entry[key] == null || entry[key] === "") continue;
        const n = Number(entry[key]);
        if (!Number.isFinite(n)) continue;
        measurement[key] = n;
        any = true;
      }
      if (!any) continue;
      const existing = doc.measurements.find((item) => item.date === date);
      if (existing) Object.assign(existing, measurement);
      else doc.measurements.push(measurement);
      continue;
    }
    if (entry.type === "bodyComp") {
      const date = requireDate(entry);
      if (!date) continue;
      const scan = { date, updatedAt: stamp };
      const keys = ["weight", "bodyFatPct", "bmi", "muscleMass", "heartRate", "bmr", "waterPct", "bodyFatMass", "leanBodyMass", "boneMass", "visceralFat", "proteinPct", "skeletalMuscleMass", "subcutaneousFatPct", "bodyAge"];
      let any = false;
      for (const key of keys) {
        if (entry[key] == null || entry[key] === "") continue;
        const n = Number(entry[key]);
        if (!Number.isFinite(n)) continue;
        scan[key] = n;
        any = true;
      }
      if (entry.bodyType) {
        scan.bodyType = String(entry.bodyType);
        any = true;
      }
      if (!any) continue;
      const existing = doc.bodyComp.find((item) => item.date === date);
      if (existing) Object.assign(existing, scan);
      else doc.bodyComp.push(scan);
      if (scan.weight != null) {
        upsertInboxHistory(doc, date, { weight: scan.weight, updatedAt: stamp });
        upsertInboxDay(doc, date, stamp, (day) => { day.weight = scan.weight; });
      }
      continue;
    }
    if (entry.type === "water" || entry.type === "steps") {
      const credit = creditFromInbox(entry, stamp);
      if (credit) doc.credits.push(credit);
      continue;
    }
    if (entry.type === "workoutPlan") {
      if (!Array.isArray(entry.workoutDays)) continue;
      workoutPlan = {
        workoutDays: clone(entry.workoutDays),
        weeklyWorkoutTarget: Object.prototype.hasOwnProperty.call(entry, "weeklyWorkoutTarget") ? entry.weeklyWorkoutTarget : undefined,
      };
      continue;
    }
    if (entry.type === "recipe") {
      if (!String(entry.name || "").trim() && !entry.id) continue;
      doc.recipes.push({
        id: entry.id || undefined,
        name: String(entry.name || "").trim(),
        servings: Number(entry.servings) || 1,
        calories: Number(entry.calories) || 0,
        protein: Number(entry.protein) || 0,
        carbs: Number(entry.carbs) || 0,
        fat: Number(entry.fat) || 0,
        fiber: Number(entry.fiber) || 0,
        ingredients: Array.isArray(entry.ingredients) ? clone(entry.ingredients) : [],
        method: entry.method || "",
        mealType: entry.mealType || "Uncategorized",
        updatedAt: stamp,
      });
    }
  }
  return { document: doc, settings, workoutPlan };
}

function unionPlanBackups(localList, remoteList) {
  const out = [];
  const seen = new Set();
  for (const item of [...(Array.isArray(localList) ? localList : []), ...(Array.isArray(remoteList) ? remoteList : [])]) {
    if (!item || typeof item !== "object" || !Array.isArray(item.workoutDays)) continue;
    const savedAt = typeof item.savedAt === "string" ? item.savedAt : "";
    const key = `${savedAt}|${stable(item.workoutDays)}|${item.weeklyWorkoutTarget == null ? "" : item.weeklyWorkoutTarget}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      savedAt,
      workoutDays: clone(item.workoutDays),
      weeklyWorkoutTarget: item.weeklyWorkoutTarget != null ? item.weeklyWorkoutTarget : null,
    });
  }
  return out;
}

export function applyWorkoutPlanUpdate(doc, plan, now) {
  const next = emptyDocument(doc);
  if (!plan || !Array.isArray(plan.workoutDays)) return next;
  const incomingDays = normalizeWorkoutDays(plan.workoutDays);
  const currentDays = normalizeWorkoutDays(next.workoutDays);
  const hasTarget = plan.weeklyWorkoutTarget != null && plan.weeklyWorkoutTarget !== "";
  const incomingTarget = hasTarget ? normalizeWeeklyTarget(plan.weeklyWorkoutTarget) : next.weeklyWorkoutTarget;
  const sameDays = stable(currentDays) === stable(incomingDays);
  const sameTarget = incomingTarget === next.weeklyWorkoutTarget;
  if (!(sameDays && sameTarget)) {
    const worthKeeping = currentDays.some((day) => day.exercises && day.exercises.length) || next.weeklyWorkoutTarget != null;
    if (worthKeeping) {
      const snapshot = {
        savedAt: now,
        workoutDays: clone(currentDays),
        weeklyWorkoutTarget: next.weeklyWorkoutTarget,
      };
      const already = (next.workoutPlanBackups || []).some((item) => stable(item.workoutDays) === stable(snapshot.workoutDays) && item.weeklyWorkoutTarget === snapshot.weeklyWorkoutTarget);
      if (!already) next.workoutPlanBackups = [...(next.workoutPlanBackups || []), snapshot];
    }
  }
  next.workoutDays = incomingDays;
  if (hasTarget) next.weeklyWorkoutTarget = incomingTarget;
  return next;
}

function creditFromInbox(entry, stamp) {
  const date = dateKey(entry);
  const id = entry.id ? String(entry.id) : "";
  if (!date || !id) return null;
  if (entry.type === "water") {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { kind: "water", id, date, amount, mode: "add", updatedAt: stamp };
  }
  const count = Number(entry.count != null ? entry.count : entry.amount);
  if (!Number.isFinite(count) || count <= 0) return null;
  const mode = entry.mode === "add" ? "add" : "max";
  return { kind: "steps", id, date, amount: count, mode, updatedAt: stamp };
}

function upsertInboxHistory(doc, date, patch) {
  let row = doc.history.find((item) => item.date === date);
  if (!row) {
    row = {
      date,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      weight: null,
      water: 0,
      steps: null,
      workoutDone: false,
    };
    doc.history.push(row);
  }
  Object.assign(row, patch);
}

function upsertInboxDay(doc, date, stamp, mutate) {
  let rec = doc.days.find((item) => item.date === date);
  if (!rec) {
    rec = { date, updatedAt: stamp, day: blankDay() };
    doc.days.push(rec);
  }
  rec.updatedAt = stamp;
  mutate(rec.day);
}

export function applySettingsOntoDocument(doc, patch) {
  const next = emptyDocument(doc);
  next.exportedAt = doc.exportedAt;
  next.history = doc.history;
  next.recipes = doc.recipes;
  next.bodyComp = doc.bodyComp;
  next.measurements = doc.measurements;
  next.today = doc.today;
  next.days = doc.days;
  next.deleted = doc.deleted;
  next.conflicts = doc.conflicts;
  if (!isObject(patch)) return next;
  for (const key of ["targets", "milestones", "mealTypes", "supplementGroups", "supplementRules", "workoutDays", "weeklyWorkoutTarget"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = clone(patch[key]);
  }
  return next;
}

export function mergeWithInbox(local, remote, inboxFiles, now) {
  let { document } = mergeDocuments(local, remote || {}, { now });
  const accepted = [];
  const skipped = [];
  let settings = {};
  let workoutPlan = null;
  const files = [...(inboxFiles || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  for (const file of files) {
    let parsed;
    try {
      parsed = typeof file.body === "string" ? JSON.parse(file.body) : file.body;
      if (!isObject(parsed)) throw new Error("inbox file must be a JSON object");
    } catch {
      skipped.push(file);
      continue;
    }
    const built = documentFromInbox(parsed, file.createdAt || now);
    document = mergeDocuments(document, built.document, { now }).document;
    if (built.settings && Object.keys(built.settings).length) {
      settings = { ...settings, ...built.settings };
    }
    if (built.workoutPlan) workoutPlan = built.workoutPlan;
    accepted.push(file);
  }
  if (workoutPlan) document = applyWorkoutPlanUpdate(document, workoutPlan, now);
  return { document, settings, workoutPlan, accepted, skipped };
}

function stripUpdatedAt(value) {
  if (Array.isArray(value)) return value.map(stripUpdatedAt);
  if (!isObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value)) {
    if (key === "updatedAt") continue;
    out[key] = stripUpdatedAt(value[key]);
  }
  return out;
}

function stampEntries(localEntries, previousEntries, keyFn, now) {
  const previous = indexBy(previousEntries || [], keyFn);
  return (localEntries || []).map((entry) => {
    const key = keyFn(entry);
    const prevGroup = key ? previous.get(key) : null;
    const prev = prevGroup ? prevGroup[prevGroup.length - 1] : null;
    if (!prev) return { ...entry, updatedAt: entry.updatedAt || now };
    if (sameValue(stripUpdatedAt(entry), stripUpdatedAt(prev))) {
      return { ...entry, updatedAt: entry.updatedAt || prev.updatedAt || null };
    }
    return { ...entry, updatedAt: now };
  });
}

export function stampLocalChanges(localRaw, lastMergedRaw, now) {
  const local = emptyDocument(localRaw);
  if (!lastMergedRaw) return local;
  const prev = foldToday(emptyDocument(lastMergedRaw));
  const folded = foldToday(local);
  folded.history = stampEntries(folded.history, prev.history, keptKey(dateKey), now);
  folded.recipes = stampEntries(folded.recipes, prev.recipes, keptKey(recipeKey), now);
  folded.bodyComp = stampEntries(folded.bodyComp, prev.bodyComp, keptKey(dateKey), now);
  folded.measurements = stampEntries(folded.measurements, prev.measurements, keptKey(dateKey), now);
  folded.days = stampEntries(folded.days, prev.days, keptKey(dateKey), now).map((rec) => {
    const prevRec = (prev.days || []).find((item) => item.date === rec.date);
    const prevFoods = prevRec && prevRec.day ? prevRec.day.foods : [];
    const day = rec.day || blankDay();
    return {
      ...rec,
      day: {
        ...day,
        foods: stampEntries(day.foods || [], prevFoods, (food) => foodKey(food, rec.date), now),
      },
    };
  });
  if (folded.today && folded.today.date && folded.today.day) {
    const match = folded.days.find((item) => item.date === folded.today.date);
    if (match) folded.today = { date: match.date, day: clone(match.day), updatedAt: match.updatedAt };
  }
  return folded;
}

export function dataSignature(doc) {
  const source = emptyDocument(doc);
  return stable({
    history: source.history,
    recipes: source.recipes,
    bodyComp: source.bodyComp,
    measurements: source.measurements,
    days: source.days,
    today: source.today,
    deleted: source.deleted,
    applied: source.applied,
    targets: source.targets,
    meta: source.meta,
    milestones: source.milestones,
    mealTypes: source.mealTypes,
    supplementGroups: source.supplementGroups,
    supplementRules: source.supplementRules,
    workoutDays: source.workoutDays,
    weeklyWorkoutTarget: source.weeklyWorkoutTarget,
    workoutPlanBackups: source.workoutPlanBackups,
  });
}
