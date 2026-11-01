// Guided-session helpers. The saved plan is the only prescription.
// A logged weight or rep count is an actual and must not change sets, reps, or weight.

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
