// Evening reminder only. The grams target is whatever is stored on the phone.

export const PROTEIN_NUDGE_DISMISSED_KEY = "macroConsole.ui.proteinNudgeDismissed";

export function proteinNudge({ protein, target, hour, dismissedOn, today, recipes }) {
  const goal = Number(target);
  const eaten = Number(protein) || 0;
  if (!today || dismissedOn === today) return null;
  if (!(Number(hour) >= 18)) return null;
  if (!(goal > 0) || eaten >= goal * 0.75) return null;
  const left = Math.max(0, Math.round(goal - eaten));
  if (left < 20) return null;
  const ideas = [...(recipes || [])]
    .filter((recipe) => recipe && recipe.name && Number(recipe.protein) > 0)
    .sort((a, b) => (Number(b.protein) - Number(a.protein)) || String(a.name).localeCompare(String(b.name)))
    .slice(0, 3)
    .map((recipe) => ({ name: String(recipe.name), protein: Math.round(Number(recipe.protein)) }));
  return { left, ideas };
}
