import { useEffect, useState } from "react";
import { EXERCISE_ICONS } from "./planSettings.js";

const fieldStyle = (palette) => ({
  background: palette.panelAlt,
  borderColor: palette.border,
  color: palette.text,
});

function TextField({ palette, value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg px-2 py-2 text-sm outline-none border"
      style={fieldStyle(palette)}
    />
  );
}

function SmallButton({ palette, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display uppercase rounded-lg px-2 py-1"
      style={{ fontSize: 11, letterSpacing: "0.04em", color: palette.text, border: `1px solid ${palette.border}` }}
    >
      {children}
    </button>
  );
}

function SectionNote({ palette, children }) {
  return <div className="font-mono mb-2" style={{ color: palette.textFaint, fontSize: 11, lineHeight: 1.45 }}>{children}</div>;
}

export default function PlanEditors({
  palette,
  milestones,
  mealTypes,
  supplementGroups,
  supplementRules,
  workoutDays,
  weeklyWorkoutTarget,
  onSave,
  onImportFile,
  importError,
  importBusy,
}) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    setDraft({
      milestones: milestones.map((row) => ({
        weight: row.weight ?? "",
        bodyFat: row.bodyFat ?? "",
        waist: row.waist ?? "",
      })),
      mealTypes: mealTypes.map((name) => ({ original: name, name })),
      supplementGroups: JSON.parse(JSON.stringify(supplementGroups)),
      supplementRules: [...supplementRules],
      workoutDays: JSON.parse(JSON.stringify(workoutDays)),
      weeklyWorkoutTarget: weeklyWorkoutTarget ?? "",
    });
  }, [milestones, mealTypes, supplementGroups, supplementRules, workoutDays, weeklyWorkoutTarget]);

  if (!draft) return null;

  function patch(partial) {
    setDraft((cur) => ({ ...cur, ...partial }));
  }

  return (
    <div className="mt-5 pt-3 border-t" style={{ borderColor: palette.border }}>
      <div className="font-display uppercase mb-2" style={{ color: palette.textMuted, fontSize: 12, letterSpacing: "0.1em" }}>Plan</div>
      <SectionNote palette={palette}>
        Milestones, meals, supplements, and the workout split stay on this phone and in a private sync. They are not part of the public app. A new install starts from a blank plan.
      </SectionNote>

      <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Import settings JSON</div>
      <label className="block mb-2">
        <input
          type="file"
          accept="application/json,.json"
          onChange={onImportFile}
          className="block w-full text-xs font-mono"
          style={{ color: palette.textMuted }}
        />
      </label>
      {importError && <div className="font-mono mb-2" style={{ color: palette.alert, fontSize: 11 }}>{importError}</div>}

      <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Workouts per week</div>
      <input
        type="number"
        inputMode="numeric"
        value={draft.weeklyWorkoutTarget}
        onChange={(e) => patch({ weeklyWorkoutTarget: e.target.value })}
        className="font-mono rounded-lg px-2 py-2 text-sm outline-none border mb-3"
        style={{ ...fieldStyle(palette), width: 88 }}
      />

      <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Milestones (weight lb, body fat %, waist cm)</div>
      {draft.milestones.map((row, index) => (
        <div key={index} className="flex gap-1 mb-1 items-center">
          <input type="number" inputMode="decimal" value={row.weight} placeholder="lb" onChange={(e) => {
            const next = draft.milestones.slice();
            next[index] = { ...row, weight: e.target.value };
            patch({ milestones: next });
          }} className="font-mono rounded-lg px-2 py-1.5 text-sm outline-none border w-full" style={fieldStyle(palette)} />
          <input type="number" inputMode="decimal" value={row.bodyFat} placeholder="bf" onChange={(e) => {
            const next = draft.milestones.slice();
            next[index] = { ...row, bodyFat: e.target.value };
            patch({ milestones: next });
          }} className="font-mono rounded-lg px-2 py-1.5 text-sm outline-none border w-full" style={fieldStyle(palette)} />
          <input type="number" inputMode="decimal" value={row.waist} placeholder="cm" onChange={(e) => {
            const next = draft.milestones.slice();
            next[index] = { ...row, waist: e.target.value };
            patch({ milestones: next });
          }} className="font-mono rounded-lg px-2 py-1.5 text-sm outline-none border w-full" style={fieldStyle(palette)} />
          <button type="button" onClick={() => patch({ milestones: draft.milestones.filter((_, i) => i !== index) })} aria-label="Remove milestone" style={{ color: palette.textFaint }}>×</button>
        </div>
      ))}
      <div className="mb-3">
        <SmallButton palette={palette} onClick={() => patch({ milestones: [...draft.milestones, { weight: "", bodyFat: "", waist: "" }] })}>Add milestone</SmallButton>
      </div>

      <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Meal types</div>
      {draft.mealTypes.map((row, index) => (
        <div key={index} className="flex gap-1 mb-1">
          <TextField palette={palette} value={row.name} placeholder="Lunch" onChange={(name) => {
            const next = draft.mealTypes.slice();
            next[index] = { ...row, name };
            patch({ mealTypes: next });
          }} />
          <button type="button" onClick={() => patch({ mealTypes: draft.mealTypes.filter((_, i) => i !== index) })} aria-label="Remove meal type" style={{ color: palette.textFaint }}>×</button>
        </div>
      ))}
      <div className="mb-3">
        <SmallButton palette={palette} onClick={() => patch({ mealTypes: [...draft.mealTypes, { original: "", name: "" }] })}>Add meal type</SmallButton>
      </div>

      <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Supplements</div>
      {draft.supplementGroups.length === 0 && <SectionNote palette={palette}>No supplements yet.</SectionNote>}
      {draft.supplementGroups.map((group, gi) => (
        <div key={group.key || gi} className="rounded-lg p-2 mb-2" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
          <TextField palette={palette} value={group.title} placeholder="Morning" onChange={(title) => {
            const next = draft.supplementGroups.slice();
            next[gi] = { ...group, title };
            patch({ supplementGroups: next });
          }} />
          <div className="mt-1">
            <TextField palette={palette} value={group.note} placeholder="Note" onChange={(note) => {
              const next = draft.supplementGroups.slice();
              next[gi] = { ...group, note };
              patch({ supplementGroups: next });
            }} />
          </div>
          {group.items.map((item, ii) => (
            <div key={item.id || ii} className="mt-2">
              <div className="flex gap-1 mb-1">
                <TextField palette={palette} value={item.name} placeholder="Name" onChange={(name) => {
                  const items = group.items.slice();
                  items[ii] = { ...item, name };
                  const next = draft.supplementGroups.slice();
                  next[gi] = { ...group, items };
                  patch({ supplementGroups: next });
                }} />
                <button type="button" aria-label="Remove supplement" onClick={() => {
                  const items = group.items.filter((_, i) => i !== ii);
                  const next = draft.supplementGroups.slice();
                  next[gi] = { ...group, items };
                  patch({ supplementGroups: next });
                }} style={{ color: palette.textFaint }}>×</button>
              </div>
              <div className="flex gap-1">
                <TextField palette={palette} value={item.dose} placeholder="Dose" onChange={(dose) => {
                  const items = group.items.slice();
                  items[ii] = { ...item, dose };
                  const next = draft.supplementGroups.slice();
                  next[gi] = { ...group, items };
                  patch({ supplementGroups: next });
                }} />
                <TextField palette={palette} value={item.detail} placeholder="Detail" onChange={(detail) => {
                  const items = group.items.slice();
                  items[ii] = { ...item, detail };
                  const next = draft.supplementGroups.slice();
                  next[gi] = { ...group, items };
                  patch({ supplementGroups: next });
                }} />
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <SmallButton palette={palette} onClick={() => {
              const items = [...group.items, { id: `item-${Date.now()}`, name: "", dose: "", detail: "", reminder: false, asNeeded: false }];
              const next = draft.supplementGroups.slice();
              next[gi] = { ...group, items };
              patch({ supplementGroups: next });
            }}>Add item</SmallButton>
            <SmallButton palette={palette} onClick={() => patch({ supplementGroups: draft.supplementGroups.filter((_, i) => i !== gi) })}>Remove group</SmallButton>
          </div>
        </div>
      ))}
      <div className="mb-3">
        <SmallButton palette={palette} onClick={() => patch({
          supplementGroups: [...draft.supplementGroups, { key: `group-${Date.now()}`, title: "", note: "", items: [] }],
        })}>Add group</SmallButton>
      </div>

      <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Supplement notes</div>
      {draft.supplementRules.map((rule, index) => (
        <div key={index} className="flex gap-1 mb-1">
          <TextField palette={palette} value={rule} placeholder="Note" onChange={(value) => {
            const next = draft.supplementRules.slice();
            next[index] = value;
            patch({ supplementRules: next });
          }} />
          <button type="button" aria-label="Remove note" onClick={() => patch({ supplementRules: draft.supplementRules.filter((_, i) => i !== index) })} style={{ color: palette.textFaint }}>×</button>
        </div>
      ))}
      <div className="mb-3">
        <SmallButton palette={palette} onClick={() => patch({ supplementRules: [...draft.supplementRules, ""] })}>Add note</SmallButton>
      </div>

      <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Workout days</div>
      {draft.workoutDays.map((day, di) => (
        <div key={day.key || di} className="rounded-lg p-2 mb-2" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
          <div className="flex gap-1 mb-1">
            <TextField palette={palette} value={day.label} placeholder="Day A" onChange={(label) => {
              const next = draft.workoutDays.slice();
              next[di] = { ...day, label };
              patch({ workoutDays: next });
            }} />
            <TextField palette={palette} value={day.sub} placeholder="Full body" onChange={(sub) => {
              const next = draft.workoutDays.slice();
              next[di] = { ...day, sub };
              patch({ workoutDays: next });
            }} />
          </div>
          <select
            value={day.mode === "straight" ? "straight" : "circuit"}
            onChange={(e) => {
              const next = draft.workoutDays.slice();
              next[di] = { ...day, mode: e.target.value };
              patch({ workoutDays: next });
            }}
            className="rounded-lg px-2 py-1.5 text-sm outline-none border mb-2"
            style={fieldStyle(palette)}
          >
            <option value="circuit">Circuit</option>
            <option value="straight">Straight sets</option>
          </select>
          {day.exercises.map((ex, ei) => (
            <div key={ei} className="mb-2">
              <div className="flex gap-1 mb-1">
                <TextField palette={palette} value={ex.name} placeholder="Exercise" onChange={(name) => {
                  const exercises = day.exercises.slice();
                  exercises[ei] = { ...ex, name };
                  const next = draft.workoutDays.slice();
                  next[di] = { ...day, exercises };
                  patch({ workoutDays: next });
                }} />
                <button type="button" aria-label="Remove exercise" onClick={() => {
                  const exercises = day.exercises.filter((_, i) => i !== ei);
                  const next = draft.workoutDays.slice();
                  next[di] = { ...day, exercises };
                  patch({ workoutDays: next });
                }} style={{ color: palette.textFaint }}>×</button>
              </div>
              <div className="flex gap-1">
                <select
                  value={EXERCISE_ICONS.includes(ex.icon) ? ex.icon : "squat"}
                  onChange={(e) => {
                    const exercises = day.exercises.slice();
                    exercises[ei] = { ...ex, icon: e.target.value };
                    const next = draft.workoutDays.slice();
                    next[di] = { ...day, exercises };
                    patch({ workoutDays: next });
                  }}
                  className="rounded-lg px-1 py-1.5 text-xs outline-none border"
                  style={fieldStyle(palette)}
                >
                  {EXERCISE_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                </select>
                <TextField palette={palette} value={ex.sets} placeholder="3×8-12" onChange={(sets) => {
                  const exercises = day.exercises.slice();
                  exercises[ei] = { ...ex, sets };
                  const next = draft.workoutDays.slice();
                  next[di] = { ...day, exercises };
                  patch({ workoutDays: next });
                }} />
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <SmallButton palette={palette} onClick={() => {
              const exercises = [...day.exercises, { icon: "squat", name: "", cue: "", sets: "3×8-12", tag: "", startWeight: "", rest: 60 }];
              const next = draft.workoutDays.slice();
              next[di] = { ...day, exercises };
              patch({ workoutDays: next });
            }}>Add exercise</SmallButton>
            <SmallButton palette={palette} onClick={() => patch({ workoutDays: draft.workoutDays.filter((_, i) => i !== di) })}>Remove day</SmallButton>
          </div>
        </div>
      ))}
      <div className="mb-3">
        <SmallButton palette={palette} onClick={() => patch({
          workoutDays: [...draft.workoutDays, { key: `day-${Date.now()}`, label: "", sub: "", mode: "circuit", exercises: [] }],
        })}>Add workout day</SmallButton>
      </div>

      <button
        type="button"
        onClick={() => onSave(draft)}
        disabled={importBusy}
        className="font-display uppercase rounded-lg px-3 py-2 text-sm w-full"
        style={{ background: palette.amber, color: "#1B1815", letterSpacing: "0.06em", opacity: importBusy ? 0.4 : 1 }}
      >
        Save plan
      </button>
    </div>
  );
}
