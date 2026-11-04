// Guided-session helpers. The saved plan is the only prescription.
// A logged weight or rep count is an actual and must not change sets, reps, or weight.
// The logging boxes may open on the previous session's actuals. That prefill is
// edited in the box and is stored only when the set is logged. It does not
// change the plan, and these helpers never write the log.

export function parseSetsCount(setsStr) {
  const match = String(setsStr || "").match(/^(\d+)\s*[×xX*]/);
  return match ? Number(match[1]) : 1;
}

export function parseRepRange(setsStr) {
  const match = String(setsStr || "").match(/[×xX*]\s*(\d+)\s*-\s*(\d+)/);
  return match ? { lo: Number(match[1]), hi: Number(match[2]) } : null;
}

export function planWeightLb(ex) {
  if (!ex || ex.startWeight == null) return null;
  const raw = String(ex.startWeight).trim();
  if (!raw || raw.toLowerCase() === "bodyweight") return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const weight = Number(match[0]);
  return Number.isFinite(weight) ? weight : null;
}

export function prescriptionOf(ex) {
  return {
    sets: ex && ex.sets != null ? String(ex.sets) : "",
    startWeight: ex && ex.startWeight != null ? String(ex.startWeight) : "",
    weightLb: planWeightLb(ex),
    reps: parseRepRange(ex && ex.sets),
  };
}

// Last-logged weight and any stored override are ignored on purpose.
export function prescribedWeightLb(ex) {
  return planWeightLb(ex);
}

export function setsLoggedToday(log, name, date) {
  return (log || []).filter((entry) => entry && entry.exercise === name && entry.date === date).length;
}

export function displaySetNumber(step, loggedCount) {
  const total = Math.max(1, Number(step && step.totalSets) || 1);
  const done = Math.max(0, Number(loggedCount) || 0);
  const queued = Math.max(1, Number(step && step.setNumber) || 1);
  return Math.min(total, Math.max(queued, done + 1));
}

export function buildSessionQueue(day, mode, loggedByName = {}) {
  const exercises = (day && Array.isArray(day.exercises) ? day.exercises : []);
  const remaining = exercises.map((ex) => {
    const totalSets = parseSetsCount(ex && ex.sets);
    const done = Math.min(totalSets, Math.max(0, Number(loggedByName[ex && ex.name]) || 0));
    return { ex, totalSets, done, left: totalSets - done };
  }).filter((item) => item.ex && item.ex.name && item.left > 0);
  if (!remaining.length) return [];
  const queue = [];
  if (mode === "circuit") {
    const maxLeft = Math.max(...remaining.map((item) => item.left));
    for (let round = 1; round <= maxLeft; round++) {
      remaining.forEach((item) => {
        if (round <= item.left) {
          queue.push({
            ex: item.ex,
            dayKey: day.key,
            setNumber: item.done + round,
            totalSets: item.totalSets,
          });
        }
      });
    }
    return queue;
  }
  remaining.forEach((item) => {
    for (let i = 1; i <= item.left; i++) {
      queue.push({
        ex: item.ex,
        dayKey: day.key,
        setNumber: item.done + i,
        totalSets: item.totalSets,
      });
    }
  });
  return queue;
}

function isDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isBodyweight(ex) {
  return String(ex && ex.startWeight != null ? ex.startWeight : "").trim().toLowerCase() === "bodyweight";
}

function positiveNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (value == null) return null;
  const match = String(value).trim().match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 1000) / 1000);
}

function setNumberOf(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// Most recent day before today for this exercise. Today is the session being
// logged, so its sets are not reused as the next box. A shorter or longer
// previous day is still that session; callers fall back per set.
export function previousSessionEntries(log, exerciseName, today) {
  const name = String(exerciseName || "");
  if (!name) return [];
  const cutoff = isDay(today) ? today : null;
  const prior = (Array.isArray(log) ? log : []).filter((entry) => {
    if (!entry || entry.exercise !== name || !isDay(entry.date)) return false;
    if (cutoff && entry.date >= cutoff) return false;
    return true;
  });
  if (!prior.length) return [];
  let latest = prior[0].date;
  for (const entry of prior) {
    if (entry.date > latest) latest = entry.date;
  }
  return prior.filter((entry) => entry.date === latest);
}

// Match the set number when the previous session recorded one. Otherwise use
// log order. Extra sets repeat the last logged set. A gap uses the closest
// lower set, and a set before any numbered set uses the lightest numbered one.
export function entryForSet(entries, setNumber) {
  const session = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!session.length) return null;
  const n = setNumberOf(setNumber) || 1;
  let exact = null;
  for (const entry of session) {
    if (setNumberOf(entry.setNumber) === n) exact = entry;
  }
  if (exact) return exact;
  const numbered = session.filter((entry) => setNumberOf(entry.setNumber) != null);
  if (!numbered.length) return session[Math.min(n, session.length) - 1];
  let bestNumber = -1;
  let best = null;
  for (const entry of numbered) {
    const sn = setNumberOf(entry.setNumber);
    if (sn <= n && sn >= bestNumber) {
      bestNumber = sn;
      best = entry;
    }
  }
  if (best) return best;
  let low = Infinity;
  let lowEntry = numbered[0];
  for (const entry of numbered) {
    const sn = setNumberOf(entry.setNumber);
    if (sn < low) {
      low = sn;
      lowEntry = entry;
    }
  }
  return lowEntry;
}

// Box defaults only. `weight` and `reps` are input strings. Nothing here is written.
export function loggedSetDefaults(ex, log, setNumber, today) {
  const planned = planWeightLb(ex);
  const bodyweight = isBodyweight(ex);
  const entry = entryForSet(previousSessionEntries(log, ex && ex.name, today), setNumber);
  const loggedWeight = entry ? positiveNumber(entry.weight) : null;
  const loggedReps = entry ? positiveNumber(entry.reps) : null;
  const useLoggedWeight = !bodyweight && loggedWeight != null;
  const useLoggedReps = loggedReps != null;
  return {
    weight: useLoggedWeight ? formatCount(loggedWeight) : (planned != null ? formatCount(planned) : ""),
    reps: useLoggedReps ? formatCount(loggedReps) : "",
    fromPreviousSession: !!(entry && (useLoggedWeight || useLoggedReps)),
  };
}

// Display copy for the saved plan. An agreed next weight, when one is already
// stored, is mentioned beside the plan. This does not select a new prescription.
export function recommendationText(ex, agreedWeightLb) {
  if (!ex) return "";
  const sets = String(ex.sets || "").trim();
  const per = String(ex.per || "").trim();
  const scheme = [sets, per && !sets.toLowerCase().includes(per.toLowerCase()) ? per : ""].filter(Boolean).join(" ");
  const raw = String(ex.startWeight == null ? "" : ex.startWeight).trim();
  if (isBodyweight(ex)) {
    return `Recommended: ${scheme ? `${scheme} · bodyweight` : "bodyweight"}`;
  }
  const planLb = planWeightLb(ex);
  const agreed = positiveNumber(agreedWeightLb);
  const shownLb = planLb != null ? planLb : agreed;
  const extra = planLb != null && agreed != null && agreed !== planLb ? ` · next ${formatCount(agreed)} lb` : "";
  if (scheme && shownLb != null) return `Recommended: ${scheme} @ ${formatCount(shownLb)} lb${extra}`;
  if (scheme && raw) return `Recommended: ${scheme} @ ${raw}`;
  if (scheme) return `Recommended: ${scheme}`;
  if (shownLb != null) return `Recommended: ${formatCount(shownLb)} lb${extra}`;
  if (raw) return `Recommended: ${raw}`;
  return "";
}
