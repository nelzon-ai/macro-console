import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  ChevronLeft, ChevronRight, ChevronDown, Settings, Flame, Scale, Droplets,
  Footprints, Dumbbell, Plus, Minus, X, Loader2, Lock, Unlock, BookOpen, LayoutDashboard,
  TrendingUp, Copy, Send, Sparkles, Upload, Camera, Activity, Ruler, Pencil, BookmarkPlus, Images, Play, Pause, Check, Volume2, VolumeX, Pill
} from "lucide-react";

// ---------------------------------------------------------------------------
// Palette / tokens — warm charcoal "instrument console" theme.
// Custom colors go through inline style (no Tailwind arbitrary values,
// since this environment has no JIT compiler).
// ---------------------------------------------------------------------------
const palette = {
  bg: "#161412",
  panel: "#211E1A",
  panelAlt: "#28241F",
  border: "#3A342C",
  borderSoft: "#2C2822",
  text: "#F2ECE1",
  textMuted: "#9C9186",
  textFaint: "#6E645A",
  amber: "#E0A83E",
  rust: "#C1704F",
  olive: "#93AC79",
  steel: "#6E93AB",
  plum: "#9C86B0",
  alert: "#C1543F",
};

const DEFAULT_TARGETS = { calories: 2150, protein: 195, carbs: 208, fat: 60, fiber: 35, water: 3500, steps: 12000, goalWeight: 162, goalBodyFatPct: 13, startBodyFatPct: 31.2, startWeight: 208 };
// From the Recomposition Plan doc's weight/body-fat/waist projection table.
const WEIGHT_MILESTONES = [
  { weight: 196.6, bodyFat: 28.4, waist: 90.5 },
  { weight: 191, bodyFat: 25, waist: 88 },
  { weight: 183, bodyFat: 22, waist: 86 },
  { weight: 177, bodyFat: 19, waist: 83.5 },
  { weight: 170, bodyFat: 16, waist: 81 },
  { weight: 164, bodyFat: 13, waist: 79 },
];
const TARGETS_VERSION = 2; // bump when defaults change, so existing saved targets get a one-time upgrade
const WORKOUT_TYPES = ["Strength", "Cardio", "Mobility", "Sport", "Rest day (active)", "Other"];
const MEAL_TYPES = ["Usuals", "Breakfast", "Oaks Park", "Dinners", "Sides", "Fulfil", "Fibre One", "Fridge Raiders", "Peperami", "Lindt", "Kallo", "Itsu", "Waitrose", "Tesco", "Sainsburys", "Other Snacks", "Chocolate Bars", "Drinks", "Yoghurts", "M&S", "MyProtein"];
// Old category names from before the renames — mapped on load so no recipe is orphaned.
// Daily supplement routine — ticks reset each new day.
const SUPPLEMENT_GROUPS = [
  { key: "morning", title: "Morning", note: "On waking", items: [
    { id: "pirinase", name: "Pirinase nasal spray", dose: "2 sprays", detail: "Each nostril", reminder: true },
  ] },
  { key: "shake", title: "Breakfast shake", note: "Powders — into the shake, not pill-box", items: [
    { id: "creatine", name: "MyProtein Creatine", dose: "5 g", detail: "Weigh it — the scoop is only 3g", reminder: true },
    { id: "psyllium", name: "Whole Food Earth Psyllium", dose: "10 g", detail: "Add last, 400ml+ liquid, drink straight away. 5g in week one", reminder: true },
  ] },
  { key: "lunch", title: "Lunch", note: "With food · 2h+ after shake", items: [
    { id: "d3k2", name: "Bandini D3/K2", dose: "1 tab", detail: "2,000 IU D3 + 200µg K2" },
    { id: "omega-am", name: "Nutravita Omega 3", dose: "2 gels", detail: "1,100mg EPA+DHA" },
    { id: "multi-am", name: "Igennus Multivitamin", dose: "1 tab", detail: "Iron-free" },
    { id: "antihistamine", name: "Antihistamine", dose: "1 tab", detail: "" },
    { id: "theanine", name: "Nutricost L-Theanine", dose: "1 cap", detail: "Demanding or stressful days, with your coffee", asNeeded: true },
  ] },
  { key: "evening", title: "Evening", note: "With or after dinner", items: [
    { id: "omega-pm", name: "Nutravita Omega 3", dose: "2 gels", detail: "Skip on sardine days" },
    { id: "multi-pm", name: "Igennus Multivitamin", dose: "1 tab", detail: "Second daily dose" },
    { id: "ashwa", name: "ESN Ashwa+", dose: "2 caps", detail: "600mg KSM-66. 8 weeks on, 2-4 weeks off" },
    { id: "mag", name: "Incite Magnesium Glycinate", dose: "1-2 caps", detail: "1 while on Ashwa+ (it adds 60mg), 2 in weeks off" },
  ] },
  { key: "bed", title: "Before bed", note: "30-60 min before sleep", items: [
    { id: "glycine", name: "Bulk Glycine", dose: "3 g", detail: "Weigh it, in a little water or herbal tea", reminder: true },
  ] },
];
const SUPPLEMENT_RULES = [
  "Keep psyllium 2 hours away from your pills — it blocks absorption.",
  "Sardine or mackerel day: skip the evening omega-3.",
  "Total supplemental magnesium stays at or under about 250mg.",
  "Fill a 7-day pill organiser on Sunday; carry the lunch pod to work.",
  "Blood test when you can: vitamin D, ferritin, B12, thyroid (TSH), lipids.",
];
const MEAL_TYPE_RENAMES = { Lunch: "Oaks Park", Dinner: "Dinners", Snack: "Other Snacks", Snacks: "Other Snacks", Balloon: "Kallo" };
function normalizeMealType(mt) { return MEAL_TYPE_RENAMES[mt] || mt; }
// ---------------------------------------------------------------------------
// Workout diagram system — ported from the standalone Workout Guide artifact.
// Two-frame stick-figure poses (start -> end) plus a shared dumbbell glyph
// and a reusable bent-over torso shape, so form and diagrams live here too.
// ---------------------------------------------------------------------------
function dumbbell(cx, cy, rot) {
  return `<g transform="translate(${cx},${cy}) rotate(${rot || 0})"><circle cx="-5" cy="0" r="3" fill="var(--steel)" stroke="none"/><rect x="-5" y="-1.3" width="10" height="2.6" fill="var(--steel)" stroke="none"/><circle cx="5" cy="0" r="3" fill="var(--steel)" stroke="none"/></g>`;
}
function bentTorso() {
  return `<circle cx="72" cy="20" r="8" fill="var(--amber)" stroke="none" /><line x1="68" y1="28" x2="72" y2="22" /><line x1="50" y1="54" x2="68" y2="28" /><line x1="50" y1="54" x2="44" y2="92" /><line x1="50" y1="54" x2="56" y2="92" />`;
}

const WORKOUT_POSES = {
  squat: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="40" y2="40" /><line x1="50" y1="26" x2="60" y2="40" />${dumbbell(50,42,90)}<line x1="50" y1="50" x2="42" y2="92" /><line x1="50" y1="50" x2="58" y2="92" />`,
    end: `<line x1="50" y1="26" x2="40" y2="40" /><line x1="50" y1="26" x2="60" y2="40" />${dumbbell(50,42,90)}<polyline points="50,52 34,68 32,92" /><polyline points="50,52 66,68 68,92" /><circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" />`,
  },
  hinge2leg: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="50" y2="54" /><line x1="50" y1="28" x2="44" y2="54" />${dumbbell(44,57)}<line x1="50" y1="28" x2="56" y2="54" />${dumbbell(56,57)}<line x1="50" y1="54" x2="44" y2="92" /><line x1="50" y1="54" x2="56" y2="92" />`,
    end: `${bentTorso()}<line x1="68" y1="28" x2="58" y2="55" />${dumbbell(58,58)}<line x1="68" y1="28" x2="65" y2="58" />${dumbbell(65,61)}`,
  },
  hinge1leg: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="50" y2="54" /><line x1="50" y1="28" x2="45" y2="54" />${dumbbell(45,57)}<line x1="50" y1="54" x2="44" y2="92" /><line x1="50" y1="54" x2="56" y2="92" />`,
    end: `<line x1="50" y1="55" x2="74" y2="42" /><circle cx="78" cy="36" r="7" fill="var(--amber)" stroke="none" /><line x1="74" y1="42" x2="78" y2="37" /><line x1="50" y1="55" x2="26" y2="42" /><line x1="50" y1="55" x2="46" y2="92" /><line x1="74" y1="42" x2="60" y2="62" />${dumbbell(58,65)}`,
  },
  lunge: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="50" />${dumbbell(42,53)}<line x1="50" y1="26" x2="58" y2="50" />${dumbbell(58,53)}<line x1="50" y1="50" x2="44" y2="92" /><line x1="50" y1="50" x2="56" y2="92" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="50" />${dumbbell(42,53)}<line x1="50" y1="26" x2="58" y2="50" />${dumbbell(58,53)}<polyline points="50,52 38,66 30,90" /><polyline points="50,52 66,60 80,86" />`,
  },
  overheadpress: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="38" y2="32" />${dumbbell(34,30)}<line x1="50" y1="26" x2="62" y2="32" />${dumbbell(66,30)}<line x1="50" y1="50" x2="42" y2="92" /><line x1="50" y1="50" x2="58" y2="92" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="38" y2="10" />${dumbbell(34,8)}<line x1="50" y1="26" x2="62" y2="10" />${dumbbell(66,8)}<line x1="50" y1="52" x2="42" y2="92" /><line x1="50" y1="52" x2="58" y2="92" />`,
  },
  rotatepress: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="38" y2="32" />${dumbbell(34,30,90)}<line x1="50" y1="26" x2="62" y2="32" />${dumbbell(66,30,90)}<line x1="50" y1="50" x2="42" y2="92" /><line x1="50" y1="50" x2="58" y2="92" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="38" y2="10" />${dumbbell(34,8)}<line x1="50" y1="26" x2="62" y2="10" />${dumbbell(66,8)}<line x1="50" y1="52" x2="42" y2="92" /><line x1="50" y1="52" x2="58" y2="92" />`,
  },
  curl: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="52" />${dumbbell(42,55,90)}<line x1="50" y1="26" x2="58" y2="52" />${dumbbell(58,55,90)}<line x1="50" y1="50" x2="42" y2="92" /><line x1="50" y1="50" x2="58" y2="92" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><polyline points="50,26 42,44 48,28" />${dumbbell(48,25,90)}<polyline points="50,26 58,44 52,28" />${dumbbell(52,25,90)}<line x1="50" y1="52" x2="42" y2="92" /><line x1="50" y1="52" x2="58" y2="92" />`,
  },
  tricepext: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><polyline points="50,26 44,14 52,4" />${dumbbell(53,2,90)}<polyline points="50,26 56,14 60,4" /><line x1="50" y1="52" x2="42" y2="92" /><line x1="50" y1="52" x2="58" y2="92" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="47" y2="4" />${dumbbell(47,2,90)}<line x1="50" y1="52" x2="42" y2="92" /><line x1="50" y1="52" x2="58" y2="92" />`,
  },
  lateralraise: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="52" />${dumbbell(42,55,90)}<line x1="50" y1="26" x2="58" y2="52" />${dumbbell(58,55,90)}<line x1="50" y1="50" x2="42" y2="92" /><line x1="50" y1="50" x2="58" y2="92" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="28" x2="22" y2="26" />${dumbbell(18,26,90)}<line x1="50" y1="28" x2="78" y2="26" />${dumbbell(82,26,90)}<line x1="50" y1="52" x2="42" y2="92" /><line x1="50" y1="52" x2="58" y2="92" />`,
  },
  row1arm: {
    start: `${bentTorso()}<line x1="68" y1="28" x2="58" y2="54" />${dumbbell(58,57)}<line x1="68" y1="28" x2="46" y2="50" />`,
    end: `${bentTorso()}<polyline points="68,28 54,38 50,20" />${dumbbell(48,18)}<line x1="68" y1="28" x2="46" y2="50" />`,
  },
  row2arm: {
    start: `${bentTorso()}<line x1="68" y1="28" x2="58" y2="54" />${dumbbell(58,57)}<line x1="68" y1="28" x2="76" y2="52" />${dumbbell(76,55)}`,
    end: `${bentTorso()}<polyline points="68,28 54,38 50,20" />${dumbbell(48,18)}<polyline points="68,28 80,36 84,18" />${dumbbell(86,16)}`,
  },
  reardeltfly: {
    start: `${bentTorso()}<line x1="68" y1="28" x2="58" y2="54" />${dumbbell(58,57)}<line x1="68" y1="28" x2="78" y2="52" />${dumbbell(78,55)}`,
    end: `${bentTorso()}<line x1="68" y1="28" x2="46" y2="16" />${dumbbell(44,14)}<line x1="68" y1="28" x2="90" y2="40" />${dumbbell(92,42)}`,
  },
  floorpress: {
    start: `<circle cx="18" cy="55" r="8" fill="var(--amber)" stroke="none" /><line x1="26" y1="55" x2="78" y2="55" /><polyline points="78,55 87,68 76,73" /><line x1="40" y1="52" x2="40" y2="44" />${dumbbell(40,41,90)}<line x1="55" y1="52" x2="55" y2="44" />${dumbbell(55,41,90)}`,
    end: `<circle cx="18" cy="55" r="8" fill="var(--amber)" stroke="none" /><line x1="26" y1="55" x2="78" y2="55" /><polyline points="78,55 87,68 76,73" /><line x1="40" y1="52" x2="40" y2="24" />${dumbbell(40,20,90)}<line x1="55" y1="52" x2="55" y2="24" />${dumbbell(55,20,90)}`,
  },
  fly: {
    start: `<circle cx="18" cy="55" r="8" fill="var(--amber)" stroke="none" /><line x1="26" y1="55" x2="78" y2="55" /><polyline points="78,55 87,68 76,73" /><line x1="40" y1="52" x2="40" y2="24" />${dumbbell(40,20,90)}<line x1="55" y1="52" x2="55" y2="24" />${dumbbell(55,20,90)}`,
    end: `<circle cx="18" cy="55" r="8" fill="var(--amber)" stroke="none" /><line x1="26" y1="55" x2="78" y2="55" /><polyline points="78,55 87,68 76,73" /><line x1="40" y1="52" x2="20" y2="64" />${dumbbell(16,66,90)}<line x1="55" y1="52" x2="75" y2="64" />${dumbbell(79,66,90)}`,
  },
  calf2leg: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="50" />${dumbbell(42,53)}<line x1="50" y1="26" x2="58" y2="50" />${dumbbell(58,53)}<line x1="50" y1="50" x2="44" y2="92" /><line x1="50" y1="50" x2="56" y2="92" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="50" />${dumbbell(42,53)}<line x1="50" y1="26" x2="58" y2="50" />${dumbbell(58,53)}<line x1="50" y1="52" x2="44" y2="84" /><line x1="44" y1="84" x2="39" y2="90" /><line x1="50" y1="52" x2="56" y2="84" /><line x1="56" y1="84" x2="61" y2="90" />`,
  },
  calf1leg: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="50" />${dumbbell(42,53)}<line x1="50" y1="26" x2="58" y2="50" />${dumbbell(58,53)}<line x1="50" y1="50" x2="46" y2="92" /><polyline points="50,50 60,66 66,74" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="50" />${dumbbell(42,53)}<line x1="50" y1="26" x2="58" y2="50" />${dumbbell(58,53)}<line x1="50" y1="50" x2="45" y2="84" /><line x1="45" y1="84" x2="40" y2="90" /><polyline points="50,50 60,66 66,74" />`,
  },
  bridge: {
    start: `<circle cx="18" cy="60" r="8" fill="var(--amber)" stroke="none" /><line x1="26" y1="60" x2="50" y2="60" /><polyline points="50,60 65,58 78,72" /><line x1="26" y1="60" x2="12" y2="60" />`,
    end: `<circle cx="18" cy="60" r="8" fill="var(--amber)" stroke="none" /><line x1="26" y1="60" x2="55" y2="42" /><polyline points="55,42 70,55 85,58" /><line x1="26" y1="60" x2="12" y2="60" />${dumbbell(55,37,90)}`,
  },
  splitsquat: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="40" y2="50" />${dumbbell(40,53)}<line x1="50" y1="26" x2="60" y2="50" />${dumbbell(60,53)}<line x1="50" y1="50" x2="42" y2="90" /><line x1="50" y1="50" x2="68" y2="60" /><line x1="74" y1="62" x2="94" y2="62" stroke-width="4" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="40" y2="50" />${dumbbell(40,53)}<line x1="50" y1="26" x2="60" y2="50" />${dumbbell(60,53)}<polyline points="50,52 40,66 32,90" /><polyline points="50,52 68,58 82,64" /><line x1="74" y1="62" x2="94" y2="62" stroke-width="4" />`,
  },
  stepup: {
    start: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="50" />${dumbbell(42,53)}<line x1="50" y1="26" x2="58" y2="50" />${dumbbell(58,53)}<rect x="28" y="80" width="30" height="10" rx="2" fill="var(--panelAlt)" stroke="var(--textFaint)" stroke-width="3" /><line x1="50" y1="50" x2="42" y2="90" /><line x1="50" y1="50" x2="60" y2="80" />`,
    end: `<circle cx="50" cy="16" r="8" fill="var(--amber)" stroke="none" /><line x1="50" y1="26" x2="42" y2="50" />${dumbbell(42,53)}<line x1="50" y1="26" x2="58" y2="50" />${dumbbell(58,53)}<rect x="28" y="80" width="30" height="10" rx="2" fill="var(--panelAlt)" stroke="var(--textFaint)" stroke-width="3" /><polyline points="50,52 46,66 44,80" /><line x1="50" y1="52" x2="64" y2="92" />`,
  },
  legraise: {
    start: `<circle cx="18" cy="55" r="8" fill="var(--amber)" stroke="none" /><line x1="26" y1="55" x2="60" y2="55" /><line x1="60" y1="55" x2="88" y2="58" /><line x1="26" y1="55" x2="12" y2="58" />`,
    end: `<circle cx="18" cy="55" r="8" fill="var(--amber)" stroke="none" /><line x1="26" y1="55" x2="60" y2="55" /><line x1="60" y1="55" x2="60" y2="12" /><line x1="26" y1="55" x2="12" y2="58" />`,
  },
  plank: {
    hold: `<circle cx="16" cy="50" r="7" fill="var(--amber)" stroke="none" /><line x1="24" y1="50" x2="82" y2="50" /><line x1="30" y1="50" x2="30" y2="64" /><line x1="82" y1="50" x2="92" y2="58" />`,
  },
};

const WORKOUT_DAYS = [
  { key: "lowerA", label: "Mon", sub: "Lower A", exercises: [
    { icon: "squat", name: "Goblet Squat", cue: "One weight at your chest, squat down.", sets: "4×12-20", tag: "Legs", startWeight: "20-24 lb", rest: 120 },
    { icon: "hinge2leg", name: "Straight-Leg Deadlift", cue: "Two weights, hinge forward, flat back.", sets: "4×12-15", tag: "Legs", startWeight: "15-20 lb/hand", rest: 120 },
    { icon: "lunge", name: "Walking Lunge", cue: "Step forward, alternate legs.", sets: "3×12-15", per: "/leg", tag: "Legs", startWeight: "10-15 lb/hand", rest: 90 },
    { icon: "calf2leg", name: "Calf Raise", cue: "Weight in each hand, rise onto your toes.", sets: "3×15-25", tag: "Legs", startWeight: "15-20 lb/hand", rest: 60 },
    { icon: "bridge", name: "Glute Bridge", cue: "One weight on your hips, push up.", sets: "3×15-20", tag: "Glutes", startWeight: "15-20 lb", rest: 75 },
  ]},
  { key: "upperA", label: "Tue", sub: "Upper A", exercises: [
    { icon: "floorpress", name: "Chest Press", cue: "Press straight up, lower slowly.", sets: "4×10-15", tag: "Chest", startWeight: "15-20 lb/hand", rest: 120 },
    { icon: "row1arm", name: "One-Arm Row", cue: "One weight only, support with the other hand.", sets: "4×12-15", per: "/side", tag: "Back", startWeight: "15-20 lb", rest: 90 },
    { icon: "overheadpress", name: "Shoulder Press", cue: "Press straight overhead, lower slowly.", sets: "3×10-15", tag: "Shoulders", startWeight: "10-15 lb/hand", rest: 120 },
    { icon: "curl", name: "Bicep Curl", cue: "Curl up to your shoulders, lower slowly.", sets: "3×12-15", tag: "Arms", startWeight: "10-12 lb/hand", rest: 60 },
    { icon: "tricepext", name: "Triceps Extension", cue: "Lower behind your head, press straight up.", sets: "3×12-15", tag: "Arms", startWeight: "12-15 lb", rest: 60 },
    { icon: "lateralraise", name: "Side Raise", cue: "Raise to shoulder height, lower slowly.", sets: "3×15-20", tag: "Shoulders", startWeight: "6-8 lb/hand", rest: 60 },
  ]},
  { key: "lowerB", label: "Thu", sub: "Lower B", exercises: [
    { icon: "splitsquat", name: "Rear-Foot-Elevated Lunge", cue: "Back foot up on a bench, lower down.", sets: "4×10-12", per: "/leg", tag: "Legs", startWeight: "10-15 lb/hand", rest: 90 },
    { icon: "hinge1leg", name: "One-Leg Deadlift", cue: "One weight, other leg lifts straight back.", sets: "3×10-12", per: "/leg", tag: "Legs", startWeight: "10-12 lb", rest: 90 },
    { icon: "stepup", name: "Step-Up", cue: "Weight in each hand, step up fully.", sets: "3×12-15", per: "/leg", tag: "Legs", startWeight: "10-15 lb/hand", rest: 90 },
    { icon: "squat", name: "Wide-Stance Squat", cue: "One weight, wide stance, squat down.", sets: "3×15-20", tag: "Legs", startWeight: "20-24 lb", rest: 120 },
    { icon: "calf1leg", name: "One-Leg Calf Raise", cue: "Weight in each hand, balance on one foot.", sets: "3×15-25", per: "/leg", tag: "Legs", startWeight: "12-15 lb", rest: 60 },
  ]},
  { key: "upperB", label: "Fri", sub: "Upper B", exercises: [
    { icon: "fly", name: "Chest Fly", cue: "Open arms wide, bring back together.", sets: "3×12-15", tag: "Chest", startWeight: "10-12 lb/hand", rest: 75 },
    { icon: "row2arm", name: "Two-Arm Row", cue: "Two weights together, pull to your ribs.", sets: "4×10-12", tag: "Back", startWeight: "15-20 lb/hand", rest: 120 },
    { icon: "rotatepress", name: "Rotating Shoulder Press", cue: "Palms face you, rotate forward as you press.", sets: "3×10-15", tag: "Shoulders", startWeight: "10-15 lb/hand", rest: 120 },
    { icon: "curl", name: "Hammer Curl", cue: "Curl up, palms facing each other.", sets: "3×12-15", tag: "Arms", startWeight: "10-12 lb/hand", rest: 60 },
    { icon: "floorpress", name: "Narrow Chest Press", cue: "Elbows in tight, press up.", sets: "3×10-15", tag: "Arms", startWeight: "12-15 lb/hand", rest: 90 },
    { icon: "reardeltfly", name: "Rear Shoulder Raise", cue: "Bent forward, raise arms out to sides.", sets: "3×15-20", tag: "Shoulders", startWeight: "6-8 lb/hand", rest: 60 },
  ]},
  { key: "bonus", label: "Bonus", sub: "Optional", exercises: [
    { icon: "squat", name: "Wide-Stance Squat", cue: "One weight, wide stance, squat down.", sets: "3×15-20", tag: "Legs", startWeight: "20-24 lb", rest: 120 },
    { icon: "calf2leg", name: "Calf Raise", cue: "Weight in each hand, rise onto your toes.", sets: "3×15-25", tag: "Legs", startWeight: "15-20 lb/hand", rest: 60 },
    { icon: "curl", name: "Bicep Curl", cue: "Curl up to your shoulders, lower slowly.", sets: "3×12-15", tag: "Arms", startWeight: "10-12 lb/hand", rest: 60 },
    { icon: "tricepext", name: "Triceps Extension", cue: "Lower behind your head, press straight up.", sets: "3×12-15", tag: "Arms", startWeight: "12-15 lb", rest: 60 },
  ]},
  { key: "core", label: "Core", sub: "Optional", exercises: [
    { icon: "plank", name: "Plank", cue: "Hold a straight line, forearms and toes down.", sets: "3×30-45", per: "sec", tag: "Core", startWeight: "bodyweight", rest: 45 },
    { icon: "legraise", name: "Leg Raise", cue: "Raise straight legs up, lower slowly.", sets: "3×12-15", tag: "Core", startWeight: "bodyweight", rest: 60 },
  ]},
];
const DUMBBELL_SETTINGS = [6, 9, 12, 15, 18, 21, 24];
function nextDumbbellSetting(current) {
  for (let i = 0; i < DUMBBELL_SETTINGS.length; i++) {
    if (DUMBBELL_SETTINGS[i] > current) return DUMBBELL_SETTINGS[i];
  }
  return null;
}

const DAY_DEFAULT_MODE = { upperA: "circuit", lowerA: "straight", upperB: "circuit", lowerB: "straight", bonus: "circuit", core: "circuit" };

const WORKOUT_TAG_STYLES = {
  Chest: { background: "rgba(193,112,79,0.18)", color: "#D98868" },
  Back: { background: "rgba(110,147,171,0.2)", color: "#8FB0C6" },
  Shoulders: { background: "rgba(156,134,176,0.2)", color: "#B49FC4" },
  Arms: { background: "rgba(224,168,62,0.2)", color: "#E0A83E" },
  Legs: { background: "rgba(147,172,121,0.2)", color: "#A9C293" },
  Glutes: { background: "rgba(147,172,121,0.35)", color: "#C3DBB0" },
  Core: { background: "rgba(110,147,171,0.35)", color: "#AFCBDD" },
};
const FORM_DETAILS = {
  "Chest Press": {
    setup: "Lie on your back, knees bent, feet flat. Dumbbells at chest level, elbows bent out to the sides, palms facing your feet.",
    execution: "Press straight up until arms are extended, weights nearly touching above your chest. Lower with control until your upper arms touch the floor — the floor is your depth stop.",
    avoid: "Don't flare your elbows to a full 90° at the bottom — keep closer to 45° to protect your shoulders. Don't bounce the weights off the floor.",
    breathe: "Inhale on the way down, exhale as you press up.",
  },
  "One-Arm Row": {
    setup: "One knee and hand on a bench (or brace on your thigh). Dumbbell in the other hand, arm hanging straight down, back flat and roughly parallel to the floor.",
    execution: "Pull the dumbbell straight up toward your hip, elbow driving back and up, squeeze your shoulder blade at the top. Lower with control to a full stretch.",
    avoid: "Don't twist your torso to help lift — the pull comes from your back, not momentum. Don't let your lower back round.",
    breathe: "Exhale as you pull up, inhale as you lower.",
  },
  "Shoulder Press": {
    setup: "Sit or stand tall, dumbbells at shoulder height, palms facing forward, elbows slightly in front of your torso.",
    execution: "Press straight overhead until arms are extended, weights nearly touching above your head. Lower with control back to shoulder height.",
    avoid: "Don't arch your lower back to help press up — keep your core braced. Don't let the weights drift forward or behind your head at the top.",
    breathe: "Exhale as you press up, inhale as you lower.",
  },
  "Bicep Curl": {
    setup: "Stand tall, dumbbells at your sides, palms facing forward, elbows close to your torso.",
    execution: "Curl up toward your shoulders, elbows pinned at your sides. Squeeze at the top, lower with control all the way down.",
    avoid: "Don't swing your body or heave the weight up — if you need to, it's too heavy. Don't let your elbows drift forward as you curl.",
    breathe: "Exhale as you curl up, inhale as you lower.",
  },
  "Triceps Extension": {
    setup: "Hold one dumbbell with both hands, cupping the top end, arms extended straight overhead.",
    execution: "Keeping your upper arms still and close to your ears, bend your elbows to lower the weight behind your head. Extend back to straight, squeezing your triceps at the top.",
    avoid: "Don't let your elbows flare out wide — keep them pointing forward/up. Don't move your upper arms, only your forearms should swing.",
    breathe: "Inhale as you lower behind your head, exhale as you press up.",
  },
  "Side Raise": {
    setup: "Stand tall, dumbbells at your sides, a slight bend in your elbows.",
    execution: "Raise both arms out to the sides until roughly level with your shoulders, leading with your elbows, not your hands. Lower with control.",
    avoid: "Don't use momentum or shrug your shoulders up — go lighter if you need to. Don't raise above shoulder height.",
    breathe: "Exhale as you raise, inhale as you lower.",
  },
  "Goblet Squat": {
    setup: "One dumbbell held vertically against your chest, cupping the top end. Feet shoulder-width, toes slightly turned out.",
    execution: "Send your hips back and bend your knees to squat down, chest up, weight close to your body. Go as low as you comfortably can with good form. Drive through your whole foot to stand.",
    avoid: "Don't let your knees cave inward — track them in line with your toes. Don't round your lower back at the bottom. Don't let your heels lift.",
    breathe: "Inhale on the way down, exhale as you drive up.",
  },
  "Straight-Leg Deadlift": {
    setup: "Stand tall, a dumbbell in each hand in front of your thighs, feet hip-width, knees very slightly bent.",
    execution: "Hinge at your hips — push your hips back, keep your back flat, lower the weights down the front of your legs until you feel a hamstring stretch (around shin height). Drive your hips forward to stand.",
    avoid: "Don't round your back — this is the most important cue here. Don't bend your knees more as you go down (that turns it into a squat).",
    breathe: "Inhale as you hinge down, exhale as you stand up.",
  },
  "Walking Lunge": {
    setup: "Stand tall, a dumbbell in each hand at your sides.",
    execution: "Step forward into a lunge, lowering until your back knee nearly touches the floor and your front thigh is roughly parallel to the ground. Push off your front foot into the next lunge, alternating legs.",
    avoid: "Don't let your front knee cave inward or shoot far past your toes. Don't lean your torso far forward.",
    breathe: "Inhale as you step down, exhale as you drive up.",
  },
  "Calf Raise": {
    setup: "Stand tall, a dumbbell in each hand at your sides, feet hip-width apart.",
    execution: "Rise onto your toes as high as you can, pause briefly, then lower slowly until you feel a stretch in your calves.",
    avoid: "Don't rush the lowering phase — that's where a lot of the benefit comes from. Don't bounce at the bottom.",
    breathe: "Exhale as you rise, inhale as you lower.",
  },
  "Glute Bridge": {
    setup: "Lie on your back, knees bent, feet flat close to your glutes. Rest a dumbbell across your hip crease, holding it with both hands.",
    execution: "Push through your heels and squeeze your glutes to drive your hips up to a straight line from shoulders to knees. Pause and squeeze at the top, lower with control.",
    avoid: "Don't overarch your lower back at the top — the movement comes from your hips and glutes. Don't let your knees splay outward.",
    breathe: "Exhale as you push up, inhale as you lower.",
  },
  "Chest Fly": {
    setup: "Lie on your back, dumbbells above your chest, arms extended with a slight, fixed bend in your elbows.",
    execution: "Lower the weights out to the sides in a wide arc, like opening your arms for a hug, keeping the elbow bend fixed. Go until you feel a chest stretch, bring back together using the same arc.",
    avoid: "Don't let your elbows straighten or bend further mid-movement. Don't lower too far if you feel shoulder strain — stop at chest level.",
    breathe: "Inhale as you open your arms, exhale as you bring them together.",
  },
  "Two-Arm Row": {
    setup: "Hinge forward at your hips until your torso is close to parallel with the floor, back flat, dumbbells hanging straight down.",
    execution: "Pull both dumbbells up toward your ribs together, elbows driving up and back, squeeze your shoulder blades together at the top. Lower with control.",
    avoid: "Don't round your back — brace your core and keep a flat spine. Don't use your legs to heave the weight up.",
    breathe: "Exhale as you pull up, inhale as you lower.",
  },
  "Rotating Shoulder Press": {
    setup: "Sit or stand, dumbbells at shoulder height, palms facing you, elbows in front of your body.",
    execution: "As you press overhead, rotate your wrists so your palms face forward at the top. Reverse the rotation as you lower.",
    avoid: "Don't rush the rotation — it should happen smoothly through the whole press, not as a separate step. Don't arch your lower back to help press up.",
    breathe: "Exhale as you press and rotate up, inhale as you lower and rotate back.",
  },
  "Hammer Curl": {
    setup: "Stand tall, dumbbells at your sides, palms facing your body — this grip stays fixed throughout.",
    execution: "Curl up toward your shoulders, palms facing inward the whole time, elbows pinned at your sides. Lower with control.",
    avoid: "Don't rotate your wrists mid-movement — that turns it into a regular curl. Don't swing your body for momentum.",
    breathe: "Exhale as you curl up, inhale as you lower.",
  },
  "Narrow Chest Press": {
    setup: "Lie on your back, knees bent. Dumbbells at chest level, elbows tucked close to your sides, weights nearly touching each other.",
    execution: "Press straight up, keeping the weights close together and elbows tucked in, until arms are extended. Lower with control, brushing your sides.",
    avoid: "Don't let your elbows flare out — that shifts work away from your triceps. Don't let the weights drift apart.",
    breathe: "Inhale as you lower, exhale as you press up.",
  },
  "Rear Shoulder Raise": {
    setup: "Hinge forward at your hips until your torso is close to parallel with the floor, dumbbells hanging straight down, slight elbow bend.",
    execution: "Raise both arms out to the sides, leading with your elbows, squeeze your shoulder blades together at the top. Lower with control.",
    avoid: "Don't stand up out of the hinge as you raise — keep your torso still and bent forward. Don't use momentum to swing the weights.",
    breathe: "Exhale as you raise, inhale as you lower.",
  },
  "Rear-Foot-Elevated Lunge": {
    setup: "Stand a couple feet in front of a bench, facing away. Rest the top of one foot on the bench behind you. Dumbbell in each hand.",
    execution: "Lower straight down by bending your front knee until your front thigh is roughly parallel to the floor. Drive through your front foot to stand. Finish all reps one side before switching.",
    avoid: "Don't let your front knee cave inward or travel too far past your toes. Keep your torso fairly upright.",
    breathe: "Inhale as you lower, exhale as you drive up.",
  },
  "One-Leg Deadlift": {
    setup: "Stand on one leg, slight knee bend, one dumbbell in the opposite hand.",
    execution: "Hinge forward at your hips while your free leg extends straight back behind you, back flat — aim for a straight line from head to heel. Lower the weight toward the floor, reverse to stand. Finish all reps one side before switching.",
    avoid: "Don't round your back. Don't let your hips rotate open — keep them square. Use a wall or chair for balance while you're learning it.",
    breathe: "Inhale as you hinge down, exhale as you stand up.",
  },
  "Step-Up": {
    setup: "Stand in front of a sturdy chair, bench, or step, a dumbbell in each hand.",
    execution: "Place one foot fully on top. Push through that foot to stand all the way up, bringing your other foot to meet it. Step back down with control, same foot leading. Finish all reps one side before switching.",
    avoid: "Don't push off your back foot to help yourself up — the working leg on the step should do the work. Don't let your front knee cave inward.",
    breathe: "Exhale as you step up, inhale as you step down.",
  },
  "Wide-Stance Squat": {
    setup: "One dumbbell held vertically against your chest. Feet wider than shoulder-width, toes turned out roughly 30-45°.",
    execution: "Sit your hips down and back, chest up, knees tracking the same direction as your toes. Squat as low as you comfortably can, drive through your feet to stand.",
    avoid: "Don't let your knees cave inward — they should track over your toes. Don't round your lower back at the bottom.",
    breathe: "Inhale on the way down, exhale as you drive up.",
  },
  "One-Leg Calf Raise": {
    setup: "Stand on one leg, a dumbbell in each hand for balance and load. Lightly touch a wall for balance if needed.",
    execution: "Rise onto your toes as high as you can on the working leg, pause at the top, lower slowly until you feel a stretch. Finish all reps one side before switching.",
    avoid: "Don't rush the lowering phase. Don't let your ankle wobble side to side — control it.",
    breathe: "Exhale as you rise, inhale as you lower.",
  },
  "Plank": {
    setup: "Lie face down, prop yourself onto your forearms and toes, elbows directly under your shoulders.",
    execution: "Hold a straight line from head to heels — brace your core and squeeze your glutes to stop your hips sagging or piking up. Hold for the target time.",
    avoid: "Don't let your hips sag toward the floor (loads your lower back). Don't let your hips pike up too high (reduces core engagement). Don't hold your breath.",
    breathe: "Keep breathing steadily throughout — don't hold it.",
  },
  "Leg Raise": {
    setup: "Lie on your back, legs straight, hands tucked under your lower back for support.",
    execution: "Keeping legs straight (or a slight bend if needed), raise them toward the ceiling until vertical. Lower slowly, stopping just before your heels touch the floor, without your lower back arching off the ground.",
    avoid: "Don't let your lower back arch up as you lower your legs — that means you've gone too low for now. Don't use momentum to swing your legs up.",
    breathe: "Exhale as you raise, inhale as you lower.",
  },
};
const INGREDIENT_UNITS = ["", "each", "g", "kg", "ml", "l", "tsp", "tbsp", "cup", "oz", "lb", "pinch"];
const BC_FIELDS = [
  ["weight", "Weight", " lbs"], ["bmi", "BMI", ""], ["bodyFatPct", "Body fat", "%"],
  ["heartRate", "Heart rate", " bpm"], ["muscleMass", "Muscle mass", " lbs"], ["bmr", "BMR", " kcal"],
  ["waterPct", "Water", "%"], ["bodyFatMass", "Body fat mass", " lbs"], ["leanBodyMass", "Lean body mass", " lbs"],
  ["boneMass", "Bone mass", " lbs"], ["visceralFat", "Visceral fat", ""], ["proteinPct", "Protein", "%"],
  ["skeletalMuscleMass", "Skeletal muscle", " lbs"], ["subcutaneousFatPct", "Subcut. fat", "%"],
  ["bodyAge", "Body age", ""], ["bodyType", "Body type", ""],
];
const MEASURE_FIELDS = [
  ["waist", "Waist"], ["chest", "Chest"], ["thigh", "Thigh"], ["arm", "Arm"], ["neck", "Neck"], ["hips", "Hips"],
];
function emptyMeasureForm() {
  return { waist: "", chest: "", thigh: "", arm: "", neck: "", hips: "" };
}

// ---------------------------------------------------------------------------
// Date helpers — kept in local time throughout, never UTC, to avoid
// off-by-one date shifts near midnight.
// ---------------------------------------------------------------------------
function toDs(date) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function fromDs(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayStr() { return toDs(new Date()); }
function addDays(ds, delta) { const d = fromDs(ds); d.setDate(d.getDate() + delta); return toDs(d); }
function prettyDate(ds) {
  const d = fromDs(ds);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function shortDate(ds) {
  const d = fromDs(ds);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function emptyDay() { return { foods: [], weight: null, water: 0, steps: null, workout: null, locked: false }; }
function sumMacros(foods) {
  return foods.reduce((acc, f) => ({
    calories: acc.calories + (Number(f.calories) || 0),
    protein: acc.protein + (Number(f.protein) || 0),
    carbs: acc.carbs + (Number(f.carbs) || 0),
    fat: acc.fat + (Number(f.fat) || 0),
    fiber: acc.fiber + (Number(f.fiber) || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}
function buildSummary(ds, day) {
  const sum = sumMacros(day.foods || []);
  return {
    date: ds, calories: sum.calories, protein: sum.protein, carbs: sum.carbs, fat: sum.fat, fiber: sum.fiber,
    weight: day.weight ?? null, water: day.water || 0, steps: day.steps ?? null,
    workoutDone: !!(day.workout && day.workout.done),
  };
}
function lastKnownWeight(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].weight != null) return history[i].weight;
  }
  return null;
}
function upsertHistory(history, summary) {
  const filtered = history.filter((h) => h.date !== summary.date);
  return [...filtered, summary].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
}
function upsertBodyComp(entries, entry) {
  const filtered = entries.filter((e) => e.date !== entry.date);
  return [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
}
function upsertMeasurements(entries, entry) {
  const filtered = entries.filter((e) => e.date !== entry.date);
  return [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
}
function upsertRecipe(recipes, recipe) {
  const filtered = recipes.filter((r) => r.name.toLowerCase() !== recipe.name.toLowerCase());
  return [...filtered, recipe].sort((a, b) => a.name.localeCompare(b.name));
}
function upsertRecipeById(recipes, recipe) {
  const filtered = recipes.filter((r) => r.id !== recipe.id);
  return [...filtered, recipe].sort((a, b) => a.name.localeCompare(b.name));
}
function emptyIngredient() {
  return {
    id: genId(), name: "", amount: "", unit: "",
    basisAmount: "", basisUnit: "", basisCalories: "", basisProtein: "", basisCarbs: "", basisFat: "", basisFiber: "",
  };
}
function emptyRecipeForm() {
  return { id: null, name: "", servings: "1", calories: "", protein: "", carbs: "", fat: "", fiber: "", ingredients: [emptyIngredient()], method: "", mealType: "Uncategorized" };
}

const PHOTO_ANGLES = ["Front", "Side", "Back"];

// Resize + compress a photo before it goes into storage — progress photos are
// only for visual comparison, so a smaller JPEG keeps storage usage sane.
function compressImage(file, maxDim = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const match = dataUrl.match(/^data:(.*);base64,(.*)$/);
        if (match) resolve({ dataUrl, mediaType: match[1], base64: match[2] });
        else reject(new Error("compression failed"));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


// ---------------------------------------------------------------------------
// Claude API helpers — used for conversational food logging and the stats
// Q&A box. Both call the same /v1/messages endpoint; the logging one asks
// for strict JSON back, the stats one just wants a short plain-text answer.
// ---------------------------------------------------------------------------
const AI_ENABLED = false; // standalone app: no Claude API
const WEB_SEARCH_TOOL = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
async function callClaudeText(messages, system, opts = {}) {
  if (!AI_ENABLED) throw new Error("AI features are not available in the offline app");
  const body = { model: "claude-sonnet-4-6", max_tokens: opts.tools ? 2000 : 1000, system, messages };
  if (opts.tools) body.tools = opts.tools;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.type === "error") {
    throw new Error((data.error && data.error.message) || `API error ${response.status}`);
  }
  const texts = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "");
  // With web search the model narrates between searches — the answer is the last text block.
  return (opts.tools ? (texts.filter((t) => t.includes("{")).pop() || texts.join("")) : texts.join("")).trim();
}
async function callClaudeJSON(messages, system, opts) {
  const raw = await callClaudeText(messages, system, opts);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // The model occasionally wraps the JSON in a sentence — pull out the object itself.
    const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
    if (a !== -1 && b > a) {
      try { return JSON.parse(cleaned.slice(a, b + 1)); } catch (e2) {}
    }
    // The model answered in plain words instead of JSON (usually a question or a
    // "can't find that product" note) — show it as a reply rather than failing.
    if (cleaned) return { needsClarification: true, reply: cleaned, meals: [], entry: null, suggestSaveRecipe: null };
    throw e;
  }
}
// Turns the on-screen chat into a valid API message list: drops local error notes,
// never sends an empty message (photo-only turns have no text), and keeps strict
// user/assistant alternation starting with a user turn.
function buildApiHistory(messages) {
  const out = [];
  messages.forEach((m) => {
    if (m.isError) return;
    const content = (typeof m.content === "string" && m.content.trim()) ? m.content : (m.role === "user" ? "(photo only)" : "OK");
    if (out.length && out[out.length - 1].role === m.role) {
      const prev = out[out.length - 1];
      if (typeof prev.content === "string") prev.content += "\n" + content;
      return;
    }
    out.push({ role: m.role, content });
  });
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
function buildLogSystemPrompt(recipes) {
  const known = recipes.map((r) => ({ name: r.name, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber }));
  return [
    "You are the food-logging assistant embedded in a fitness console. The person describes what they ate, sometimes attaching one or more photos of the meal or a nutrition label instead of or alongside text, possibly across a few messages.",
    "When images are attached, identify the food(s) shown across all of them and estimate macros from what's visible — portion size, visible ingredients, or label numbers if readable — combined with any accompanying text as extra context. Multiple photos in the same message might be different angles of the same plate, or several separate items being logged together — use the accompanying text and visual content to judge which, and ask if it's genuinely unclear.",
    "Group foods the person describes as one meal or dish (e.g. \"eggs and cottage cheese on toast\") into a single meal entry with each ingredient listed as a component. Log foods described as separate, unrelated items as separate meal entries.",
    "For each component, estimate calories, protein (g), carbs (g), fat (g), and fiber (g) using standard nutrition knowledge.",
    "If a component closely matches one of the saved recipes below, use that recipe's exact macros for it rather than re-estimating.",
    "Brand and specific product matter a lot for accuracy on packaged, manufactured, or restaurant/fast-food items — protein bars, protein powder, cereal, frozen meals, sauces, snack foods, takeout, fast food, and similar — since nutrition varies widely between brands of the same food type. If the person names one of these without a brand or restaurant, ask which one before estimating rather than defaulting to a generic guess. Brand doesn't matter for plain whole foods (fruit, vegetables, plain meat, rice, eggs, etc.) — estimate those normally without asking.",
    "If a description or photo is otherwise genuinely ambiguous — unclear quantity or unclear preparation — do not guess either; ask instead.",
    "When more than one thing in the same message needs clarifying (e.g. two branded items with no brand given), ask about all of them together in a single combined question rather than one at a time across separate turns.",
    "Once you know a brand or restaurant item, use its known published nutrition facts if you're confident of them; otherwise give your best estimate and say in your reply that it's approximate.",
    "You have a web search tool. If a product, flavour or menu item is unfamiliar, or may be newer than your training knowledge, search the web for its published nutrition facts (per serving or per pack as the person ate it) rather than guessing, and mention in your reply that you looked it up. Don't search for plain whole foods or items you already know well.",
    "Set suggestSaveRecipe to {\"name\": ...} when one of the logged meals is either a specific multi-ingredient dish, or a single specific packaged/branded product (e.g. a named protein bar, a specific snack or drink), and it isn't already in the saved recipes list — using that meal's name. This only offers to save it for later reuse; never save automatically. Otherwise null.",
    "Respond with ONLY JSON, no other text, in exactly this shape. This applies even after a web search, and even if you couldn't find the product or need a photo of the label — in that case set needsClarification to true and put your question or note in reply:",
    '{"needsClarification": boolean, "reply": string, "meals": [{"name": string, "components": [{"name": string, "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number}]}], "suggestSaveRecipe": null | {"name": string}}',
    "If needsClarification is true, meals must be an empty array and reply is the question(s).",
    "If false, meals has one entry per distinct meal just logged — a single food is a meal with one component — and reply is a short one-sentence confirmation naming what was logged.",
    `Saved recipes: ${JSON.stringify(known)}`,
  ].join("\n");
}
function buildBodyScanSystemPrompt() {
  return [
    "You read smart body-composition scale screenshots or photos and extract the metrics shown into structured data.",
    "Look for: weight (lbs), BMI, body fat percent, heart rate (bpm), muscle mass (lbs), BMR (kcal), water percent, body fat mass (lbs), lean body mass (lbs), bone mass (lbs), visceral fat rating, protein percent, skeletal muscle mass (lbs), subcutaneous fat percent, body age, and body type label.",
    "Only include a field if it is actually visible in the image or text. Use null for anything not shown — never estimate or guess a value that isn't there.",
    "If the image doesn't look like a body-composition or scale reading, set needsClarification to true and explain briefly what you saw instead.",
    "Respond with ONLY JSON, no other text, in exactly this shape:",
    '{"needsClarification": boolean, "reply": string, "entry": null | {"weight": number|null, "bmi": number|null, "bodyFatPct": number|null, "heartRate": number|null, "muscleMass": number|null, "bmr": number|null, "waterPct": number|null, "bodyFatMass": number|null, "leanBodyMass": number|null, "boneMass": number|null, "visceralFat": number|null, "proteinPct": number|null, "skeletalMuscleMass": number|null, "subcutaneousFatPct": number|null, "bodyAge": number|null, "bodyType": string|null}}',
    "If needsClarification is true, entry must be null and reply holds the question or explanation.",
    "If false, entry holds the extracted values and reply is a short one-sentence confirmation naming the weight reading.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Gauge — the signature element. Hand-drawn semicircular instrument dial
// using SVG pathLength normalization so the dash math stays simple.
// ---------------------------------------------------------------------------
function Gauge({ label, value, target, unit, color, size = "lg", ready }) {
  const cfg = size === "lg"
    ? { vb: "0 0 220 130", r: 90, cx: 110, cy: 112, sw: 16, maxW: 260 }
    : { vb: "0 0 150 95", r: 58, cx: 75, cy: 76, sw: 12, maxW: 118 };
  const percent = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
  const path = `M ${cfg.cx - cfg.r} ${cfg.cy} A ${cfg.r} ${cfg.r} 0 0 1 ${cfg.cx + cfg.r} ${cfg.cy}`;
  const diff = Math.round(target - value);
  const overBy = Math.round(value - target);
  const shown = ready ? percent : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full" style={{ maxWidth: cfg.maxW }}>
        <svg viewBox={cfg.vb} className="w-full h-auto">
          <path d={path} pathLength="100" fill="none" stroke={palette.border} strokeWidth={cfg.sw} strokeLinecap="round" />
          <path
            d={path} pathLength="100" fill="none" stroke={color} strokeWidth={cfg.sw} strokeLinecap="round"
            strokeDasharray={`${shown} ${100 - shown}`}
            style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end" style={{ paddingBottom: size === "lg" ? 8 : 2 }}>
          <span className={`font-mono font-semibold ${size === "lg" ? "text-4xl" : "text-sm"}`} style={{ color: palette.text }}>
            {Math.round(value).toLocaleString()}
          </span>
          <span className="font-mono" style={{ color: palette.textMuted, fontSize: size === "lg" ? 12 : 8 }}>
            / {target.toLocaleString()}{unit}
          </span>
        </div>
      </div>
      <div className="text-center" style={{ marginTop: size === "lg" ? 4 : 1 }}>
        <div className="font-display uppercase" style={{ color: palette.textMuted, fontSize: size === "lg" ? 13 : 9, letterSpacing: "0.09em" }}>
          {label}
        </div>
        <div className="font-mono" style={{ color: overBy > 0 ? palette.alert : palette.textFaint, fontSize: size === "lg" ? 11 : 9 }}>
          {overBy > 0 ? `+${overBy}${unit} over` : `${diff}${unit} to go`}
        </div>
      </div>
    </div>
  );
}

function Panel({ children, className = "", style = {} }) {
  return (
    <div
      className={`rounded-2xl border p-3 ${className}`}
      style={{ background: palette.panel, borderColor: palette.borderSoft, ...style }}
    >
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <div className="font-display uppercase mb-2" style={{ color: palette.textMuted, fontSize: 12, letterSpacing: "0.1em" }}>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, placeholder, wide }) {
  return (
    <input
      type="number" inputMode="decimal" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`font-mono rounded-lg px-2 py-2 text-sm outline-none border ${wide ? "w-full" : ""}`}
      style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
    />
  );
}

function Button({ children, onClick, variant = "primary", disabled, full, size = "md", grow }) {
  const styles = {
    primary: { background: palette.amber, color: "#1B1815", border: "none" },
    ghost: { background: "transparent", color: palette.text, border: `1px solid ${palette.border}` },
    danger: { background: "transparent", color: palette.alert, border: `1px solid ${palette.alert}` },
  }[variant];
  const sizeClass = size === "sm" ? "px-1 py-1.5 text-xs" : "px-3 py-2 text-sm";
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={`font-display uppercase rounded-lg ${sizeClass} whitespace-nowrap transition-opacity ${full ? "w-full" : ""} ${grow ? "flex-1 min-w-0" : ""} ${disabled ? "opacity-40" : "hover:opacity-85"}`}
      style={{ ...styles, letterSpacing: size === "sm" ? "0.02em" : "0.06em" }}
    >
      {children}
    </button>
  );
}

function RecipeCard({ recipe, expanded, onToggle, onEdit, onDelete, onLog, locked }) {
  const [logServings, setLogServings] = useState("1");
  const hasDetails = (recipe.ingredients && recipe.ingredients.length > 0) || recipe.method;
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: palette.border, background: palette.panelAlt }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 text-left">
        <div className="min-w-0 pr-2">
          <div className="text-sm truncate" style={{ color: palette.text }}>{recipe.name}</div>
          <div className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>
            {recipe.calories} cal/serving · {recipe.servings || 1} serving{(recipe.servings || 1) === 1 ? "" : "s"}
          </div>
        </div>
        <ChevronDown size={16} style={{ color: palette.textFaint, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease", flexShrink: 0 }} />
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <div className="font-mono mb-2" style={{ color: palette.textMuted, fontSize: 11 }}>
            {recipe.calories} cal · {recipe.protein}P {recipe.carbs}C {recipe.fat}F {recipe.fiber}Fi <span style={{ color: palette.textFaint }}>per serving</span>
          </div>
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div className="mb-2">
              <div className="font-display uppercase mb-1" style={{ color: palette.textFaint, fontSize: 10, letterSpacing: "0.08em" }}>Ingredients</div>
              <ul style={{ color: palette.text, fontSize: 13 }}>
                {recipe.ingredients.map((i) => (
                  <li key={i.id}>• {i.amount}{i.unit} {i.name}</li>
                ))}
              </ul>
            </div>
          )}
          {recipe.method && (
            <div className="mb-2">
              <div className="font-display uppercase mb-1" style={{ color: palette.textFaint, fontSize: 10, letterSpacing: "0.08em" }}>Method</div>
              <div style={{ color: palette.text, fontSize: 13, whiteSpace: "pre-wrap" }}>{recipe.method}</div>
            </div>
          )}
          {!hasDetails && (
            <div className="font-mono mb-2" style={{ color: palette.textFaint, fontSize: 11 }}>No ingredients or method saved — just the macros.</div>
          )}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>Servings:</span>
            <div className="flex gap-1">
              {["0.5", "1", "1.5", "2"].map((v) => (
                <button
                  key={v} onClick={() => setLogServings(v)}
                  className="font-mono rounded px-2 py-1"
                  style={{
                    fontSize: 11,
                    background: logServings === v ? palette.amber : palette.panel,
                    color: logServings === v ? "#1B1815" : palette.textMuted,
                    border: `1px solid ${logServings === v ? palette.amber : palette.border}`,
                  }}
                >
                  {v}x
                </button>
              ))}
            </div>
            <input
              type="number" inputMode="decimal" min="0" step="0.5" value={logServings}
              onChange={(e) => setLogServings(e.target.value)}
              className="font-mono rounded-lg px-2 py-1 text-sm outline-none border"
              style={{ width: 56, background: palette.panel, borderColor: palette.border, color: palette.text }}
            />
          </div>
          <div className="flex gap-2 mt-1">
            <Button onClick={() => onLog(Number(logServings) || 1)} disabled={locked} size="sm" grow>Log</Button>
            <Button onClick={onEdit} variant="ghost" size="sm" grow>Edit</Button>
            <Button onClick={onDelete} variant="danger" size="sm" grow>Delete</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatThread({ messages, busy, emptyHint }) {
  return (
    <div className="space-y-2 mb-2 max-h-64 overflow-y-auto">
      {messages.length === 0 && !busy && (
        <div className="text-center font-mono py-2 px-2" style={{ color: palette.textFaint, fontSize: 11 }}>{emptyHint}</div>
      )}
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className="rounded-lg px-3 py-2 text-sm max-w-[85%]"
            style={{ background: m.role === "user" ? palette.amber : palette.panelAlt, color: m.role === "user" ? "#1B1815" : palette.text }}
          >
            {m.imagePreview && (
              <img src={m.imagePreview} alt="Attached meal photo" className="rounded-md mb-1" style={{ maxHeight: 140, width: "auto" }} />
            )}
            {m.content && <span>{m.content}</span>}
          </div>
        </div>
      ))}
      {busy && (
        <div className="flex justify-start">
          <div className="rounded-lg px-3 py-2" style={{ background: palette.panelAlt }}>
            <Loader2 className="animate-spin" size={14} style={{ color: palette.textFaint }} />
          </div>
        </div>
      )}
    </div>
  );
}

function AngleCarousel({ angle, photos, photoCache, loading, onDelete, onEditDate, history, bodyComp }) {
  const [selectedId, setSelectedId] = useState(photos.length ? photos[0].id : null);
  const [playing, setPlaying] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");

  useEffect(() => {
    if (!selectedId || !photos.some((p) => p.id === selectedId)) {
      setSelectedId(photos.length ? photos[0].id : null);
    }
  }, [photos]);

  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const t = setInterval(() => {
      setSelectedId((sid) => {
        const i = photos.findIndex((p) => p.id === sid);
        return photos[(i + 1) % photos.length].id;
      });
    }, 1100);
    return () => clearInterval(t);
  }, [playing, photos]);

  if (photos.length === 0) {
    return (
      <div className="text-center font-mono py-10" style={{ color: palette.textFaint, fontSize: 12 }}>
        No {angle.toLowerCase()} photos yet.
      </div>
    );
  }
  const index = Math.max(0, photos.findIndex((p) => p.id === selectedId));
  const current = photos[index];
  const dataUrl = photoCache[current.id];
  const dayWeight = history.find((h) => h.date === current.date && h.weight != null);
  const dayBf = bodyComp.find((e) => e.date === current.date && e.bodyFatPct != null);
  const context = [dayWeight ? `${dayWeight.weight} lbs` : null, dayBf ? `${dayBf.bodyFatPct}% BF` : null].filter(Boolean).join(" · ");
  const goTo = (delta) => setSelectedId(photos[(index + delta + photos.length) % photos.length].id);
  return (
    <div>
      <div className="relative rounded-lg overflow-hidden flex items-center justify-center" style={{ background: palette.panelAlt, aspectRatio: "3 / 4" }}>
        {dataUrl ? (
          <img src={dataUrl} alt={`${angle} progress ${current.date}`} className="w-full h-full object-cover" />
        ) : (
          <Loader2 className="animate-spin" size={20} style={{ color: palette.amber }} />
        )}
        <button
          onClick={() => onDelete(current.id)} aria-label="Delete photo"
          className="absolute top-2 right-2 rounded-full p-1.5"
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <X size={14} style={{ color: "#F2ECE1" }} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <button onClick={() => goTo(-1)} className="p-2 rounded-lg" style={{ border: `1px solid ${palette.border}` }}>
          <ChevronLeft size={16} style={{ color: palette.text }} />
        </button>
        <div className="text-center">
          {editingDate ? (
            <div className="flex items-center gap-1">
              <input
                type="date" value={dateInput} max={todayStr()}
                onChange={(e) => setDateInput(e.target.value)}
                className="font-mono rounded px-1 py-0.5 outline-none border"
                style={{ fontSize: 11, background: palette.panel, borderColor: palette.border, color: palette.text }}
              />
              <button onClick={() => { onEditDate(current.id, dateInput); setEditingDate(false); }} aria-label="Confirm date">
                <Check size={14} style={{ color: palette.amber }} />
              </button>
            </div>
          ) : (
            <button onClick={() => { setDateInput(current.date); setEditingDate(true); }} className="flex items-center gap-1 font-mono text-xs" style={{ color: palette.text }}>
              {shortDate(current.date)} <Pencil size={10} style={{ color: palette.textFaint }} />
            </button>
          )}
          {context && <div className="font-mono" style={{ color: palette.amber, fontSize: 10 }}>{context}</div>}
          <div className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>{index + 1} / {photos.length}</div>
        </div>

        <button onClick={() => goTo(1)} className="p-2 rounded-lg" style={{ border: `1px solid ${palette.border}` }}>
          <ChevronRight size={16} style={{ color: palette.text }} />
        </button>
      </div>
      {photos.length > 1 && (
        <Button onClick={() => setPlaying(!playing)} variant="ghost" size="sm" full>
          <span className="flex items-center justify-center gap-1">
            {playing ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Play progress</>}
          </span>
        </Button>
      )}
    </div>
  );
}

function ExerciseIcon({ icon, frame }) {
  const content = (WORKOUT_POSES[icon] && WORKOUT_POSES[icon][frame]) || "";
  return (
    <svg viewBox="0 0 100 100" fill="none" stroke="var(--amber)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
      style={{ width: "100%", height: "100%" }}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

function parseSetsCount(setsStr) {
  const match = setsStr.match(/^(\d+)×/);
  return match ? Number(match[1]) : 1;
}
function parseRepRange(setsStr) {
  const match = setsStr.match(/×\s*(\d+)-(\d+)/);
  return match ? { lo: Number(match[1]), hi: Number(match[2]) } : null;
}
function topOfRepRange(setsStr) {
  const range = parseRepRange(setsStr);
  return range ? range.hi : null;
}

function ExerciseLogCard({ ex, dayKey, lastLog, onLog, onMarkDone }) {
  const [weight, setWeight] = useState(lastLog && lastLog.weight != null ? String(lastLog.weight) : "");
  const [reps, setReps] = useState(lastLog && lastLog.reps != null ? String(lastLog.reps) : "");
  const [formOpen, setFormOpen] = useState(false);
  const bodyweight = ex.startWeight === "bodyweight";
  const tagStyle = WORKOUT_TAG_STYLES[ex.tag] || {};
  const isHold = !!(WORKOUT_POSES[ex.icon] && WORKOUT_POSES[ex.icon].hold);
  const fd = FORM_DETAILS[ex.name];
  const repCeiling = topOfRepRange(ex.sets);
  const atCeiling = repCeiling != null && lastLog && lastLog.reps != null && lastLog.reps >= repCeiling;
  return (
    <div className="rounded-lg p-3 mb-2" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
      {isHold ? (
        <div className="flex justify-center mb-2">
          <div className="rounded-lg overflow-hidden" style={{ width: 84, height: 84, background: palette.panel }}>
            <ExerciseIcon icon={ex.icon} frame="hold" />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="rounded-lg overflow-hidden" style={{ width: 84, height: 84, background: palette.panel, flexShrink: 0 }}>
            <ExerciseIcon icon={ex.icon} frame="start" />
          </div>
          <span style={{ color: palette.textFaint, fontSize: 16, flexShrink: 0 }}>&#8594;</span>
          <div className="rounded-lg overflow-hidden" style={{ width: 84, height: 84, background: palette.panel, flexShrink: 0 }}>
            <ExerciseIcon icon={ex.icon} frame="end" />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold" style={{ color: palette.text }}>{ex.name}</span>
        <span className="font-display uppercase rounded-full px-2 py-0.5" style={{ fontSize: 9, letterSpacing: "0.03em", ...tagStyle }}>{ex.tag}</span>
      </div>
      <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 11 }}>{ex.cue}</div>
      {fd && (
        <>
          <button onClick={() => setFormOpen(!formOpen)} className="font-display uppercase flex items-center gap-1 mb-2" style={{ color: palette.amber, fontSize: 10, letterSpacing: "0.03em" }}>
            Form details
            <ChevronDown size={11} style={{ transform: formOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
          </button>
          {formOpen && (
            <div className="rounded-lg p-2 mb-2" style={{ background: palette.panel }}>
              <div className="font-mono mb-1.5" style={{ fontSize: 10, color: palette.textMuted, lineHeight: 1.5 }}><b style={{ color: palette.text }}>Setup: </b>{fd.setup}</div>
              <div className="font-mono mb-1.5" style={{ fontSize: 10, color: palette.textMuted, lineHeight: 1.5 }}><b style={{ color: palette.text }}>Execution: </b>{fd.execution}</div>
              <div className="font-mono mb-1.5" style={{ fontSize: 10, color: palette.textMuted, lineHeight: 1.5 }}><b style={{ color: palette.text }}>Avoid: </b>{fd.avoid}</div>
              <div className="font-mono" style={{ fontSize: 10, color: palette.textMuted, lineHeight: 1.5 }}><b style={{ color: palette.text }}>Breathe: </b>{fd.breathe}</div>
            </div>
          )}
        </>
      )}
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono" style={{ color: palette.amber, fontSize: 13, fontWeight: 600 }}>
          {ex.sets}{ex.per ? <span style={{ color: palette.textFaint, fontSize: 10 }}> {ex.per}</span> : null}
        </span>
        <span className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>start: {ex.startWeight}</span>
      </div>
      {atCeiling && (
        <div className="flex items-center gap-1 mb-2 rounded-lg px-2 py-1.5" style={{ background: "rgba(147,172,121,0.12)" }}>
          <TrendingUp size={12} style={{ color: palette.olive, flexShrink: 0 }} />
          <span className="font-mono" style={{ color: palette.olive, fontSize: 10.5 }}>
            Hit {lastLog.reps} reps last time — top of range, worth adding weight next session.
          </span>
        </div>
      )}
      {!bodyweight && (
        <div className="flex items-center gap-2 pt-2" style={{ borderTop: `1px solid ${palette.border}` }}>
          <input
            type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)}
            placeholder={ex.startWeight.split(" ")[0]}
            className="font-mono rounded-lg px-2 py-1.5 text-sm outline-none border"
            style={{ width: 56, background: palette.panel, borderColor: palette.border, color: palette.text }}
          />
          <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>lb</span>
          <input
            type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)}
            placeholder="reps"
            className="font-mono rounded-lg px-2 py-1.5 text-sm outline-none border"
            style={{ width: 48, background: palette.panel, borderColor: palette.border, color: palette.text }}
          />
          <Button onClick={() => onLog(dayKey, ex.name, Number(weight), reps ? Number(reps) : null)} disabled={!weight || Number(weight) <= 0} size="sm">Log</Button>
        </div>
      )}
      {!bodyweight && (
        <div className="font-mono mt-1.5" style={{ color: palette.textFaint, fontSize: 10 }}>
          {lastLog && lastLog.weight != null
            ? `last: ${lastLog.weight}lb${lastLog.reps != null ? ` × ${lastLog.reps}` : ""}`
            : "no log yet · reps optional"}
        </div>
      )}
      {bodyweight && (
        <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${palette.border}` }}>
          <span className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>Bodyweight — nothing to log here</span>
          <Button onClick={() => onMarkDone()} size="sm">Mark done</Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function MacroConsole() {
  const [view, setView] = useState("console");
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [meta, setMeta] = useState({ streak: 0, lastLoggedDate: null });
  const [history, setHistory] = useState([]);
  const [dateStr, setDateStr] = useState(todayStr());
  const [dayData, setDayData] = useState(emptyDay());
  const [foodForm, setFoodForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "" });
  const [recipes, setRecipes] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showRecipeManager, setShowRecipeManager] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeForm, setRecipeForm] = useState(emptyRecipeForm());
  const [recipeBookQuery, setRecipeBookQuery] = useState("");
  const [expandedRecipeId, setExpandedRecipeId] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [othersHidden, setOthersHidden] = useState(false);
  const [suppTicks, setSuppTicks] = useState({ date: todayStr(), ids: [] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [targetForm, setTargetForm] = useState(DEFAULT_TARGETS);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastFailedSave, setLastFailedSave] = useState(null);
  const [statsPeriod, setStatsPeriod] = useState("7");
  const [copyModalText, setCopyModalText] = useState(null);
  const [logMessages, setLogMessages] = useState([]);
  const [logInput, setLogInput] = useState("");
  const [logBusy, setLogBusy] = useState(false);
  const [logSuggestion, setLogSuggestion] = useState(null);
  const [pendingImages, setPendingImages] = useState([]);
  const [expandedFoodId, setExpandedFoodId] = useState(null);
  const [editFoodId, setEditFoodId] = useState(null);
  const [editFoodForm, setEditFoodForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "" });
  const [bodyComp, setBodyComp] = useState([]);
  const [bcMessages, setBcMessages] = useState([]);
  const [scanForm, setScanForm] = useState({ weight: "", bodyFatPct: "", bmi: "" });
  const [bcBusy, setBcBusy] = useState(false);
  const [bcPendingImage, setBcPendingImage] = useState(null);
  const [bcNote, setBcNote] = useState("");
  const [expandedBcDate, setExpandedBcDate] = useState(null);
  const [scanHistoryOpen, setScanHistoryOpen] = useState(false);
  const [measureHistoryOpen, setMeasureHistoryOpen] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [measureForm, setMeasureForm] = useState(emptyMeasureForm());
  const [photoIndex, setPhotoIndex] = useState([]);
  const [photoCache, setPhotoCache] = useState({});
  const [photoAngleView, setPhotoAngleView] = useState("Front");
  const [uploadAngle, setUploadAngle] = useState("Front");
  const [uploadDate, setUploadDate] = useState(todayStr());
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [photoLoadBusy, setPhotoLoadBusy] = useState(false);
  const [exerciseLog, setExerciseLog] = useState([]);
  const [exerciseFeedback, setExerciseFeedback] = useState([]);
  const [nextWeightOverride, setNextWeightOverride] = useState({});
  const [weightDecisions, setWeightDecisions] = useState({});
  const [debriefAnswers, setDebriefAnswers] = useState({});
  const [workoutDayView, setWorkoutDayView] = useState("lowerA");
  const [workoutSubView, setWorkoutSubView] = useState("log");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionQueue, setSessionQueue] = useState([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionPhase, setSessionPhase] = useState("logging");
  const [restRemaining, setRestRemaining] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [sessionWeight, setSessionWeight] = useState("");
  const [sessionMode, setSessionMode] = useState("circuit");
  const [sessionReps, setSessionReps] = useState("");
  const [progressSubView, setProgressSubView] = useState("body");
  const [homeProgressExpanded, setHomeProgressExpanded] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [statsMessages, setStatsMessages] = useState([]);
  const [statsInput, setStatsInput] = useState("");
  const [statsBusy, setStatsBusy] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [undoAction, setUndoAction] = useState(null);
  const toastTimer = useRef(null);
  const historyRef = useRef(history);
  const metaRef = useRef(meta);
  const patchDayDebounce = useRef(null);
  const restIntervalRef = useRef(null);
  const nextIndexRef = useRef(null);
  const logContextFromRef = useRef(0);

  function showToast(msg) {
    setToast(msg);
    setUndoAction(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }

  // For deletions: removes optimistically, but holds the actual persistence
  // (onCommit) until the undo window passes. Tapping Undo just restores state
  // and cancels onCommit — nothing was ever written, so nothing to reverse.
  function showUndoToast(msg, onUndo, onCommit) {
    setToast(msg);
    setUndoAction(() => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast("");
      setUndoAction(null);
      onUndo();
    });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast("");
      setUndoAction(null);
      onCommit();
    }, 4500);
  }

  async function safeGet(key) {
    try {
      const r = await window.storage.get(key, false);
      return r ? r.value : null;
    } catch (e) {
      return null;
    }
  }

  useEffect(() => {
    (async () => {
      const [t, m, h, d, rc, tv, bc, ms, pi, el, ef, nw] = await Promise.all([
        safeGet("targets"), safeGet("meta"), safeGet("history"), safeGet(`day:${todayStr()}`), safeGet("recipes"), safeGet("targetsVersion"), safeGet("bodycomp"), safeGet("measurements"), safeGet("photoIndex"), safeGet("exerciseWeightLog"), safeGet("exerciseFeedback"), safeGet("nextWeightOverride"),
      ]);
      let loadedTargets = t ? { ...DEFAULT_TARGETS, ...JSON.parse(t) } : DEFAULT_TARGETS;
      const loadedMeta = m ? JSON.parse(m) : { streak: 0, lastLoggedDate: null };
      const loadedHistory = h ? JSON.parse(h) : [];
      const loadedDay = d ? JSON.parse(d) : emptyDay();
      const loadedRecipes = rc ? JSON.parse(rc).map((r) => ({ ...r, mealType: normalizeMealType(r.mealType) })) : [];
      const loadedBodyComp = bc ? JSON.parse(bc) : [];
      const loadedMeasurements = ms ? JSON.parse(ms) : [];
      const loadedPhotoIndex = pi ? JSON.parse(pi) : [];
      const loadedExerciseLog = el ? JSON.parse(el) : [];
      const loadedExerciseFeedback = ef ? JSON.parse(ef) : [];
      const loadedNextWeightOverride = nw ? JSON.parse(nw) : {};
      const savedVersion = tv ? Number(JSON.parse(tv)) : 1;
      if (savedVersion < TARGETS_VERSION) {
        loadedTargets = { ...loadedTargets, water: 3500, steps: 12000 };
        try {
          await window.storage.set("targets", JSON.stringify(loadedTargets), false);
          await window.storage.set("targetsVersion", JSON.stringify(TARGETS_VERSION), false);
        } catch (e) {}
      }
      try {
        const st = await safeGet("suppTicks");
        if (st) { const parsed = JSON.parse(st); if (parsed.date === todayStr()) setSuppTicks(parsed); }
      } catch (e) {}
      try { const hc = await safeGet("othersHidden"); if (hc) setOthersHidden(JSON.parse(hc) === true); } catch (e) {}
      setTargets(loadedTargets);
      setTargetForm(loadedTargets);
      setMeta(loadedMeta);
      setHistory(loadedHistory);
      setDayData(loadedDay);
      setRecipes(loadedRecipes);
      setBodyComp(loadedBodyComp);
      setMeasurements(loadedMeasurements);
      setPhotoIndex(loadedPhotoIndex);
      setExerciseLog(loadedExerciseLog);
      setExerciseFeedback(loadedExerciseFeedback);
      setNextWeightOverride(loadedNextWeightOverride);
      // A day pre-logged in advance has no history entry yet — add it now that it's today.
      if (loadedDay.foods && loadedDay.foods.length > 0 && !loadedHistory.some((h) => h.date === todayStr())) {
        try {
          const merged = upsertHistory(loadedHistory, buildSummary(todayStr(), loadedDay));
          historyRef.current = merged;
          setHistory(merged);
          await window.storage.set("history", JSON.stringify(merged), false);
          if (loadedMeta.lastLoggedDate !== todayStr()) {
            const yest = addDays(todayStr(), -1);
            const newMeta = { streak: loadedMeta.lastLoggedDate === yest ? loadedMeta.streak + 1 : 1, lastLoggedDate: todayStr() };
            metaRef.current = newMeta;
            setMeta(newMeta);
            await window.storage.set("meta", JSON.stringify(newMeta), false);
          }
        } catch (e) {}
      }
      setLoading(false);
      setTimeout(() => setReady(true), 60);
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, []);

  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { metaRef.current = meta; }, [meta]);

  useEffect(() => {
    setSessionMode(DAY_DEFAULT_MODE[workoutDayView] || "circuit");
  }, [workoutDayView]);

  useEffect(() => {
    const anglePhotos = photoIndex.filter((p) => p.angle === photoAngleView);
    const missing = anglePhotos.filter((p) => !photoCache[p.id]);
    if (missing.length === 0) return;
    setPhotoLoadBusy(true);
    Promise.all(missing.map((p) => safeGet(`photo:${p.id}`).then((v) => ({ id: p.id, v }))))
      .then((results) => {
        setPhotoCache((c) => {
          const next = { ...c };
          results.forEach(({ id, v }) => { if (v) next[id] = v; });
          return next;
        });
      })
      .finally(() => setPhotoLoadBusy(false));
  }, [photoAngleView, photoIndex]);

  async function loadDay(ds) {
    setDayLoading(true);
    const d = await safeGet(`day:${ds}`);
    const loaded = d ? JSON.parse(d) : emptyDay();
    setDayData(loaded);
    setDayLoading(false);
  }

  async function saveSuppTicks(next) {
    setSuppTicks(next);
    try { await window.storage.set("suppTicks", JSON.stringify(next), false); } catch (e) {}
  }
  function toggleSupp(id) {
    const base = suppTicks.date === todayStr() ? suppTicks : { date: todayStr(), ids: [] };
    const ids = base.ids.includes(id) ? base.ids.filter((x) => x !== id) : [...base.ids, id];
    saveSuppTicks({ date: todayStr(), ids });
  }

  async function toggleOthersHidden() {
    const next = !othersHidden;
    setOthersHidden(next);
    try { await window.storage.set("othersHidden", JSON.stringify(next), false); } catch (e) {}
  }

  function goToDate(ds) {
    setDateStr(ds);
    setExpandedFoodId(null);
    loadDay(ds);
  }

  async function appendToHistory(targetDate, day) {
    const summary = buildSummary(targetDate, day);
    const newHistory = upsertHistory(historyRef.current, summary);
    historyRef.current = newHistory;
    setHistory(newHistory);
    await window.storage.set("history", JSON.stringify(newHistory), false);
  }

  async function bumpStreakIfNeeded(day) {
    if (day.foods.length === 0) return;
    if (metaRef.current.lastLoggedDate === todayStr()) return;
    const yesterday = addDays(todayStr(), -1);
    const streak = metaRef.current.lastLoggedDate === yesterday ? metaRef.current.streak + 1 : 1;
    const newMeta = { streak, lastLoggedDate: todayStr() };
    metaRef.current = newMeta;
    setMeta(newMeta);
    await window.storage.set("meta", JSON.stringify(newMeta), false);
  }

  async function writeDay(newDay, targetDate = dateStr) {
    await window.storage.set(`day:${targetDate}`, JSON.stringify(newDay), false);
    // Planned (future) days live only in their own day record — they stay out of
    // history, stats and streaks until the day actually arrives.
    if (targetDate > todayStr()) return;
    await appendToHistory(targetDate, newDay);
    if (targetDate === todayStr()) await bumpStreakIfNeeded(newDay);
  }

  async function persist(newDay, targetDate = dateStr) {
    const delays = [500, 1200, 2400];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        await writeDay(newDay, targetDate);
        setErrorMsg("");
        setLastFailedSave(null);
        return true;
      } catch (e) {
        if (attempt === delays.length) {
          const detail = e && e.message ? e.message : "unknown error";
          setErrorMsg(`Couldn't save (${detail}) — retrying in the background.`);
          setLastFailedSave({ day: newDay, date: targetDate });
          backgroundRetry(newDay, targetDate, [5000, 10000, 20000]);
          return false;
        }
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
  }

  function backgroundRetry(newDay, targetDate, delays) {
    if (delays.length === 0) return;
    setTimeout(async () => {
      try {
        await writeDay(newDay, targetDate);
        setErrorMsg("");
        setLastFailedSave(null);
        showToast("Saved — connection recovered");
      } catch (e) {
        backgroundRetry(newDay, targetDate, delays.slice(1));
      }
    }, delays[0]);
  }

  async function retryFailedSave() {
    if (!lastFailedSave) return;
    setErrorMsg("Retrying...");
    await persist(lastFailedSave.day, lastFailedSave.date);
  }

  function addFood() {
    if (!foodForm.name.trim() || foodForm.calories === "") return;
    const item = {
      id: genId(), name: foodForm.name.trim(),
      calories: Number(foodForm.calories) || 0, protein: Number(foodForm.protein) || 0,
      carbs: Number(foodForm.carbs) || 0, fat: Number(foodForm.fat) || 0, fiber: Number(foodForm.fiber) || 0,
    };
    const newDay = { ...dayData, foods: [...dayData.foods, item] };
    setDayData(newDay);
    persist(newDay);
    setFoodForm({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "" });
    setShowSuggestions(false);
  }

  function applyLogMeals(meals) {
    if (!meals || meals.length === 0) return;
    const newFoods = meals.map((meal) => {
      const comps = (meal.components || []).map((c) => ({
        id: genId(), name: c.name || "Item",
        calories: Number(c.calories) || 0, protein: Number(c.protein) || 0,
        carbs: Number(c.carbs) || 0, fat: Number(c.fat) || 0, fiber: Number(c.fiber) || 0,
      }));
      const sum = sumMacros(comps);
      return {
        id: genId(),
        name: meal.name || (comps[0] ? comps[0].name : "Logged item"),
        calories: sum.calories, protein: sum.protein, carbs: sum.carbs, fat: sum.fat, fiber: sum.fiber,
        components: comps.length > 1 ? comps : undefined,
      };
    });
    const newDay = { ...dayData, foods: [...dayData.foods, ...newFoods] };
    setDayData(newDay);
    persist(newDay);
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const MAX_IMAGES = 4;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const match = dataUrl.match(/^data:(.*);base64,(.*)$/);
        if (match) {
          setPendingImages((cur) => (cur.length >= MAX_IMAGES ? cur : [...cur, { dataUrl, mediaType: match[1], base64: match[2] }]));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  async function sendLogMessage() {
    const text = logInput.trim();
    if ((!text && pendingImages.length === 0) || logBusy || dayData.locked) return;
    const images = pendingImages;
    const userMsg = { role: "user", content: text, imagePreviews: images.map((img) => img.dataUrl) };
    const nextMessages = [...logMessages, userMsg];
    setLogMessages(nextMessages);
    setLogInput("");
    setPendingImages([]);
    setLogBusy(true);
    setLogSuggestion(null);
    try {
      const system = buildLogSystemPrompt(recipes);
      // Only the current exchange goes to the parser — meals already logged are done,
      // and resending the whole day's chat made it grow until requests failed.
      const apiMessages = buildApiHistory(nextMessages.slice(logContextFromRef.current));
      if (images.length > 0 && apiMessages.length > 0) {
        const blocks = images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } }));
        blocks.push({ type: "text", text: text || "What did I eat here?" });
        apiMessages[apiMessages.length - 1] = { role: "user", content: blocks };
      }
      const result = await callClaudeJSON(apiMessages, system, { tools: WEB_SEARCH_TOOL });
      setLogMessages([...nextMessages, { role: "assistant", content: result.reply || "Logged." }]);
      if (!result.needsClarification && Array.isArray(result.meals) && result.meals.length > 0) {
        logContextFromRef.current = nextMessages.length + 1; // next message starts a fresh exchange
        applyLogMeals(result.meals);
        if (result.suggestSaveRecipe && result.suggestSaveRecipe.name) {
          const match = result.meals.find((m) => m.name && m.name.toLowerCase() === result.suggestSaveRecipe.name.toLowerCase())
            || result.meals.find((m) => m.components && m.components.length > 1);
          if (match) setLogSuggestion({ name: result.suggestSaveRecipe.name, components: match.components || [] });
        }
      }
    } catch (e) {
      const detail = e && e.message ? ` (${e.message})` : "";
      setLogMessages((cur) => [...cur, { role: "assistant", isError: true, content: `Couldn't reach the parser${detail} — log it manually below, or try again.` }]);
    } finally {
      setLogBusy(false);
    }
  }

  function saveSuggestionAsRecipe() {
    if (!logSuggestion) return;
    const sum = sumMacros(logSuggestion.components);
    setRecipeForm({
      id: null, name: logSuggestion.name, servings: "1",
      calories: String(Math.round(sum.calories)), protein: String(Math.round(sum.protein)),
      carbs: String(Math.round(sum.carbs)), fat: String(Math.round(sum.fat)), fiber: String(Math.round(sum.fiber)),
      ingredients: logSuggestion.components.map((it) => ({ id: genId(), name: it.name, amount: "", unit: "" })),
      method: "", mealType: "Uncategorized",
    });
    setRecipeModalOpen(true);
    setLogSuggestion(null);
  }

  async function applyBodyScan(entry) {
    const priorBf = bodyComp.filter((e) => e.bodyFatPct != null && e.date !== entry.date).map((e) => e.bodyFatPct);
    const isBfPB = entry.bodyFatPct != null && priorBf.length > 0 && entry.bodyFatPct < Math.min(...priorBf);
    const newBodyComp = upsertBodyComp(bodyComp, entry);
    setBodyComp(newBodyComp);
    try { await window.storage.set("bodycomp", JSON.stringify(newBodyComp), false); } catch (e) {}
    if (entry.date !== todayStr() || entry.weight == null) return isBfPB;
    if (dateStr === todayStr()) {
      if (!dayData.locked) {
        const newDay = { ...dayData, weight: entry.weight };
        setDayData(newDay);
        await persist(newDay);
      }
      return isBfPB;
    }
    // Viewing a different day right now — patch today's stored day directly so the weight is there when Today is opened
    try {
      const existing = await safeGet(`day:${todayStr()}`);
      const day = existing ? JSON.parse(existing) : emptyDay();
      if (day.locked) return isBfPB;
      day.weight = entry.weight;
      await window.storage.set(`day:${todayStr()}`, JSON.stringify(day), false);
      await appendToHistory(todayStr(), day);
    } catch (e) {}
    return isBfPB;
  }

  async function logScanManual() {
    const num = (v) => (v !== "" && v != null && !isNaN(Number(v)) ? Number(v) : null);
    const entry = { date: todayStr(), weight: num(scanForm.weight), bodyFatPct: num(scanForm.bodyFatPct), bmi: num(scanForm.bmi) };
    if (entry.weight == null && entry.bodyFatPct == null && entry.bmi == null) return;
    const isBfPB = await applyBodyScan(entry);
    setScanForm({ weight: "", bodyFatPct: "", bmi: "" });
    showToast(isBfPB ? "New lowest body fat logged!" : "Weigh-in logged");
  }

  function handleBcImageSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const match = dataUrl.match(/^data:(.*);base64,(.*)$/);
      if (match) setBcPendingImage({ dataUrl, mediaType: match[1], base64: match[2] });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function sendBodyScan() {
    if ((!bcPendingImage && !bcNote.trim()) || bcBusy) return;
    const image = bcPendingImage;
    const text = bcNote.trim();
    const userMsg = { role: "user", content: text, imagePreview: image ? image.dataUrl : null };
    const nextMessages = [...bcMessages, userMsg];
    setBcMessages(nextMessages);
    setBcNote("");
    setBcPendingImage(null);
    setBcBusy(true);
    try {
      const system = buildBodyScanSystemPrompt();
      const apiMessages = nextMessages.map((m, i) => {
        if (i === nextMessages.length - 1 && image) {
          const blocks = [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } }];
          blocks.push({ type: "text", text: text || "Extract today's body composition readings from this scale screenshot." });
          return { role: m.role, content: blocks };
        }
        return { role: m.role, content: m.content || "(no note)" };
      });
      const result = await callClaudeJSON(apiMessages, system);
      setBcMessages([...nextMessages, { role: "assistant", content: result.reply || "Logged." }]);
      if (!result.needsClarification && result.entry) {
        const isBfPB = await applyBodyScan({ date: todayStr(), ...result.entry });
        if (isBfPB) showToast("New lowest body fat logged!");
      }
    } catch (e) {
      setBcMessages((cur) => [...cur, { role: "assistant", content: "Couldn't read that scan — try again, or a clearer photo." }]);
    } finally {
      setBcBusy(false);
    }
  }

  async function logMeasurements() {
    const entry = {
      date: todayStr(),
      waist: measureForm.waist !== "" ? Number(measureForm.waist) : null,
      chest: measureForm.chest !== "" ? Number(measureForm.chest) : null,
      thigh: measureForm.thigh !== "" ? Number(measureForm.thigh) : null,
      arm: measureForm.arm !== "" ? Number(measureForm.arm) : null,
      neck: measureForm.neck !== "" ? Number(measureForm.neck) : null,
      hips: measureForm.hips !== "" ? Number(measureForm.hips) : null,
    };
    if (MEASURE_FIELDS.every(([key]) => entry[key] == null)) return;
    const newMeasurements = upsertMeasurements(measurements, entry);
    setMeasurements(newMeasurements);
    setMeasureForm(emptyMeasureForm());
    try {
      await window.storage.set("measurements", JSON.stringify(newMeasurements), false);
      showToast("Measurements logged");
    } catch (e) {
      showToast("Logged in session — storage still failing");
    }
  }

  function lastLogForExercise(name, expectedSets) {
    const entries = exerciseLog.filter((l) => l.exercise === name);
    if (!entries.length) return null;
    const dates = [...new Set(entries.map((e) => e.date))].sort();
    let targetDate = null;
    for (let i = dates.length - 1; i >= 0; i--) {
      const count = entries.filter((e) => e.date === dates[i]).length;
      if (!expectedSets || count >= expectedSets) { targetDate = dates[i]; break; }
    }
    if (!targetDate) targetDate = dates[dates.length - 1];
    const sessionEntries = entries.filter((e) => e.date === targetDate).sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));
    const last = sessionEntries[sessionEntries.length - 1];
    return { weight: last.weight, reps: last.reps ?? null, complete: targetDate !== dates[dates.length - 1] || sessionEntries.length >= (expectedSets || 1) };
  }

  const pendingPatchDay = useRef(null);

  function patchDay(patcher) {
    if (dayData.locked) return;
    const targetDate = dateStr;
    setDayData((d) => {
      const newDay = patcher(d);
      pendingPatchDay.current = newDay;
      return newDay;
    });
    if (patchDayDebounce.current) clearTimeout(patchDayDebounce.current);
    patchDayDebounce.current = setTimeout(() => {
      if (pendingPatchDay.current) {
        persist(pendingPatchDay.current, targetDate);
        pendingPatchDay.current = null;
      }
    }, 700);
  }

  function addWater(ml) {
    patchDay((d) => ({ ...d, water: Math.max(0, (d.water || 0) + ml) }));
    showToast(`${ml > 0 ? "+" : ""}${ml}ml water${!isToday ? ` (${shortDate(dateStr)})` : ""}`);
  }
  function addSteps(n) {
    patchDay((d) => ({ ...d, steps: Math.max(0, (d.steps || 0) + n) }));
    showToast(`${n > 0 ? "+" : ""}${n.toLocaleString()} steps${!isToday ? ` (${shortDate(dateStr)})` : ""}`);
  }

  async function markTrainedToday(silent = false) {
    if (dateStr === todayStr()) {
      if (dayData.locked) return;
      const newWorkout = { done: true, type: (dayData.workout && dayData.workout.type) || "Strength", duration: (dayData.workout && dayData.workout.duration) || "" };
      const newDay = { ...dayData, workout: newWorkout };
      setDayData(newDay);
      await persist(newDay);
      if (!silent) showToast("Marked as trained today");
      return;
    }
    try {
      const existing = await safeGet(`day:${todayStr()}`);
      const day = existing ? JSON.parse(existing) : emptyDay();
      if (day.locked) return;
      day.workout = { done: true, type: (day.workout && day.workout.type) || "Strength", duration: (day.workout && day.workout.duration) || "" };
      await window.storage.set(`day:${todayStr()}`, JSON.stringify(day), false);
      await appendToHistory(todayStr(), day);
      if (!silent) showToast("Marked as trained today");
    } catch (e) {}
  }

  function speak(text) {
    if (!voiceEnabled) return;
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch (e) {}
  }

  function suggestedWeight(ex) {
    if (ex.startWeight === "bodyweight") return null;
    if (nextWeightOverride[ex.name] != null) return nextWeightOverride[ex.name];
    const last = lastLogForExercise(ex.name, parseSetsCount(ex.sets));
    if (!last || last.weight == null) return null;
    const range = parseRepRange(ex.sets);
    if (range && last.reps != null && last.reps >= range.hi) {
      const next = nextDumbbellSetting(last.weight);
      return next != null ? next : last.weight;
    }
    return last.weight;
  }

  function buildSessionQueue(day, mode) {
    if (mode === "circuit") {
      const queue = [];
      const maxRounds = Math.max(...day.exercises.map((ex) => parseSetsCount(ex.sets)));
      for (let round = 1; round <= maxRounds; round++) {
        day.exercises.forEach((ex) => {
          const setsCount = parseSetsCount(ex.sets);
          if (round <= setsCount) {
            queue.push({ ex, dayKey: day.key, setNumber: round, totalSets: setsCount });
          }
        });
      }
      return queue;
    }
    const queue = [];
    day.exercises.forEach((ex) => {
      const setsCount = parseSetsCount(ex.sets);
      for (let i = 1; i <= setsCount; i++) {
        queue.push({ ex, dayKey: day.key, setNumber: i, totalSets: setsCount });
      }
    });
    return queue;
  }

  function primeStepInputs(step) {
    const sw = suggestedWeight(step.ex);
    setSessionWeight(sw != null ? String(sw) : "");
    const range = parseRepRange(step.ex.sets);
    setSessionReps(range ? String(range.hi) : "");
  }

  function startSession(day) {
    const queue = buildSessionQueue(day, sessionMode);
    if (queue.length === 0) return;
    setSessionQueue(queue);
    setSessionIndex(0);
    setSessionPhase("logging");
    setWeightDecisions({});
    primeStepInputs(queue[0]);
    setSessionActive(true);
    speak(`Starting today's workout. First up: ${queue[0].ex.name}, set 1 of ${queue[0].totalSets}.`);
  }

  function endSession() {
    if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    setSessionActive(false);
    setSessionPhase("logging");
    setSessionQueue([]);
    setSessionIndex(0);
    setDebriefAnswers({});
    setWeightDecisions({});
  }

  function goToNextSet() {
    if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; }
    const nextIndex = nextIndexRef.current;
    if (nextIndex == null) return;
    const prevStep = sessionQueue[sessionIndex];
    const nextStep = sessionQueue[nextIndex];
    setSessionIndex(nextIndex);
    setSessionPhase("logging");
    primeStepInputs(nextStep);
    if (prevStep && prevStep.ex.name === nextStep.ex.name) {
      speak(`Next set. Set ${nextStep.setNumber} of ${nextStep.totalSets}.`);
    } else {
      speak(`Next: ${nextStep.ex.name}. Set 1 of ${nextStep.totalSets}.`);
    }
  }

  function enterDebrief() {
    const uniqueNames = [...new Set(sessionQueue.map((s) => s.ex.name))];
    const initial = {};
    uniqueNames.forEach((n) => { initial[n] = { feedback: null, discomfort: false }; });
    setDebriefAnswers(initial);
    setSessionPhase("debrief");
  }

  function setDebriefAnswer(name, field, value) {
    setDebriefAnswers((d) => ({ ...d, [name]: { ...(d[name] || { feedback: null, discomfort: false }), [field]: value } }));
  }

  async function finishDebrief() {
    const uniqueExercises = [...new Map(sessionQueue.map((s) => [s.ex.name, s.ex])).values()];
    const newEntries = uniqueExercises.map((ex) => ({
      id: genId(), date: todayStr(), exercise: ex.name,
      feedback: (debriefAnswers[ex.name] && debriefAnswers[ex.name].feedback) || null,
      discomfort: !!(debriefAnswers[ex.name] && debriefAnswers[ex.name].discomfort),
    }));
    const newFeedbackLog = [...exerciseFeedback, ...newEntries];
    setExerciseFeedback(newFeedbackLog);
    try { await window.storage.set("exerciseFeedback", JSON.stringify(newFeedbackLog), false); } catch (e) {}
    setSessionPhase("complete");
  }

  function skipDebrief() {
    setSessionPhase("complete");
  }

  function computeRecommendation(name, ex) {
    const last = lastLogForExercise(name, parseSetsCount(ex.sets));
    const range = parseRepRange(ex.sets);
    const answer = debriefAnswers[name];
    const feedback = answer ? answer.feedback : null;
    const discomfort = answer ? !!answer.discomfort : false;

    if (discomfort) {
      const stayWeight = last && last.weight != null ? last.weight : null;
      const base = ex.startWeight === "bodyweight" ? "Ease off this one" : (stayWeight != null ? `Stay at ${stayWeight}lb` : "Take it easy here");
      return { text: `${base} — you flagged discomfort. Worth mentioning to a doctor or physio if it keeps happening.`, tone: "warn", weight: stayWeight };
    }
    if (ex.startWeight === "bodyweight") {
      return { text: feedback === "hard" ? "Felt tough — that's fine for bodyweight work, keep at it." : "Keep going as is.", tone: "neutral", weight: null };
    }
    if (!last || last.weight == null) return { text: "Not enough data yet to suggest a change.", tone: "neutral", weight: null };
    const hitCeiling = !!(range && last.reps != null && last.reps >= range.hi);

    if (hitCeiling && feedback !== "hard") {
      const next = nextDumbbellSetting(last.weight);
      if (next == null) {
        return { text: `You're at your top dumbbell setting (${last.weight}lb) and still hitting the top of your range — try adding a resistance band for extra tension, or it's time to pick up heavier weights.`, tone: "up", weight: null };
      }
      return { text: `Move up to ${next}lb next time — you hit the top of your range${feedback === "easy" ? " and it felt easy" : ""}.`, tone: "up", weight: next };
    }
    if (hitCeiling && feedback === "hard") {
      return { text: `Stay at ${last.weight}lb one more session — you hit the range but it felt tough.`, tone: "neutral", weight: last.weight };
    }
    if (feedback === "hard") {
      return { text: `Stay at ${last.weight}lb — that felt hard and you're not yet at the top of your rep range.`, tone: "neutral", weight: last.weight };
    }
    return { text: `Stay at ${last.weight}lb — still building up toward the top of your rep range.`, tone: "neutral", weight: last.weight };
  }

  async function acceptRecommendation(name, weight) {
    const newOverrides = { ...nextWeightOverride, [name]: weight };
    setNextWeightOverride(newOverrides);
    setWeightDecisions((d) => ({ ...d, [name]: "accepted" }));
    try { await window.storage.set("nextWeightOverride", JSON.stringify(newOverrides), false); } catch (e) {}
  }

  async function declineRecommendation(name) {
    setWeightDecisions((d) => ({ ...d, [name]: "declined" }));
    if (nextWeightOverride[name] != null) {
      const newOverrides = { ...nextWeightOverride };
      delete newOverrides[name];
      setNextWeightOverride(newOverrides);
      try { await window.storage.set("nextWeightOverride", JSON.stringify(newOverrides), false); } catch (e) {}
    }
  }

  function advanceSession() {
    const step = sessionQueue[sessionIndex];
    const nextIndex = sessionIndex + 1;
    if (nextIndex >= sessionQueue.length) {
      speak("Workout complete. Quick check-in before you go.");
      enterDebrief();
      return;
    }
    nextIndexRef.current = nextIndex;
    const restSeconds = sessionMode === "circuit" ? 20 : ((step && step.ex.rest) || 90);
    setSessionPhase("resting");
    setRestRemaining(restSeconds);
    speak(sessionMode === "circuit" ? "Next up." : `Rest for ${restSeconds} seconds.`);
    let remaining = restSeconds;
    restIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setRestRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(restIntervalRef.current);
        restIntervalRef.current = null;
        goToNextSet();
      }
    }, 1000);
  }

  function skipRest() {
    goToNextSet();
  }

  async function logSessionSet() {
    const step = sessionQueue[sessionIndex];
    if (!step) return;
    const isBodyweight = step.ex.startWeight === "bodyweight";
    const reps = sessionReps ? Number(sessionReps) : null;
    if (!isBodyweight) {
      const weight = Number(sessionWeight);
      if (!weight || weight <= 0) { showToast("Enter a weight first"); return; }
      await logExerciseWeight(step.dayKey, step.ex.name, weight, reps, step.setNumber);
    } else {
      await markTrainedToday(true);
    }
    advanceSession();
  }

  function adjustSessionWeight(delta) {
    setSessionWeight((w) => {
      const next = Math.max(0, (Number(w) || 0) + delta);
      return String(Math.round(next * 2) / 2);
    });
  }
  function adjustSessionReps(delta) {
    setSessionReps((r) => String(Math.max(0, (Number(r) || 0) + delta)));
  }

  async function logExerciseWeight(dayKey, name, weight, reps, setNumber) {
    if (!weight || weight <= 0) return;
    const priorWeights = exerciseLog.filter((l) => l.exercise === name).map((l) => l.weight);
    const isPR = priorWeights.length > 0 && weight > Math.max(...priorWeights);
    const todaysSetsForExercise = exerciseLog.filter((l) => l.exercise === name && l.date === todayStr()).length;
    const entry = { id: genId(), date: todayStr(), dayKey, exercise: name, weight, setNumber: setNumber || todaysSetsForExercise + 1 };
    if (reps != null && reps > 0) entry.reps = reps;
    const newLog = [...exerciseLog, entry];
    setExerciseLog(newLog);
    try {
      await window.storage.set("exerciseWeightLog", JSON.stringify(newLog), false);
      const repsSuffix = entry.reps ? ` × ${entry.reps}` : "";
      showToast(isPR ? `New PR — ${name}! ${weight}lb${repsSuffix}` : `Logged ${weight}lb${repsSuffix} — ${name}`);
    } catch (e) {
      showToast("Logged in session — storage still failing");
    }
    if (nextWeightOverride[name] != null) {
      const newOverrides = { ...nextWeightOverride };
      delete newOverrides[name];
      setNextWeightOverride(newOverrides);
      try { await window.storage.set("nextWeightOverride", JSON.stringify(newOverrides), false); } catch (e) {}
    }
    await markTrainedToday(true);
    return entry;
  }

  function handlePhotoSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    compressImage(file)
      .then((compressed) => setPendingPhoto(compressed))
      .catch(() => showToast("Couldn't process that photo"));
    e.target.value = "";
  }

  async function savePhoto() {
    if (!pendingPhoto) return;
    setPhotoUploadBusy(true);
    const id = genId();
    const entry = { id, date: uploadDate || todayStr(), angle: uploadAngle };
    try {
      await window.storage.set(`photo:${id}`, pendingPhoto.dataUrl, false);
      const newIndex = [...photoIndex, entry].sort((a, b) => a.date.localeCompare(b.date));
      await window.storage.set("photoIndex", JSON.stringify(newIndex), false);
      setPhotoIndex(newIndex);
      setPhotoCache((c) => ({ ...c, [id]: pendingPhoto.dataUrl }));
      setPhotoAngleView(uploadAngle);
      setPendingPhoto(null);
      setUploadDate(todayStr());
      showToast(`${uploadAngle} photo saved for ${shortDate(entry.date)}`);
    } catch (e) {
      showToast("Couldn't save — storage still failing");
    } finally {
      setPhotoUploadBusy(false);
    }
  }

  async function editPhotoDate(id, newDate) {
    if (!newDate) return;
    const newIndex = photoIndex.map((p) => (p.id === id ? { ...p, date: newDate } : p)).sort((a, b) => a.date.localeCompare(b.date));
    setPhotoIndex(newIndex);
    try {
      await window.storage.set("photoIndex", JSON.stringify(newIndex), false);
      showToast("Date updated");
    } catch (e) {
      showToast("Updated in session — storage still failing");
    }
  }

  function deletePhoto(id) {
    const item = photoIndex.find((p) => p.id === id);
    if (!item) return;
    const newIndex = photoIndex.filter((p) => p.id !== id);
    setPhotoIndex(newIndex);
    showUndoToast(
      `${item.angle} photo removed`,
      () => { setPhotoIndex((cur) => [...cur, item].sort((a, b) => a.date.localeCompare(b.date))); },
      async () => {
        setPhotoCache((c) => { const n = { ...c }; delete n[id]; return n; });
        try {
          await window.storage.set("photoIndex", JSON.stringify(newIndex), false);
          await window.storage.delete(`photo:${id}`, false);
        } catch (e) {}
      }
    );
  }

  async function persistRecipe(recipe) {
    const newRecipes = upsertRecipe(recipes, recipe);
    setRecipes(newRecipes);
    try { await window.storage.set("recipes", JSON.stringify(newRecipes), false); } catch (e) {}
  }

  function selectRecipe(r) {
    setFoodForm({ name: r.name, calories: String(r.calories), protein: String(r.protein), carbs: String(r.carbs), fat: String(r.fat), fiber: String(r.fiber) });
    setShowSuggestions(false);
  }

  function deleteRecipe(id) {
    const item = recipes.find((r) => r.id === id);
    if (!item) return;
    const newRecipes = recipes.filter((r) => r.id !== id);
    setRecipes(newRecipes);
    showUndoToast(
      `Removed "${item.name}"`,
      () => { setRecipes((cur) => upsertRecipeById(cur, item)); },
      async () => { try { await window.storage.set("recipes", JSON.stringify(newRecipes), false); } catch (e) {} }
    );
  }

  function openNewRecipe() {
    setRecipeForm(emptyRecipeForm());
    setRecipeModalOpen(true);
  }

  function openEditRecipe(r) {
    setRecipeForm({
      id: r.id, name: r.name, servings: String(r.servings || 1),
      calories: String(r.calories || 0), protein: String(r.protein || 0), carbs: String(r.carbs || 0),
      fat: String(r.fat || 0), fiber: String(r.fiber || 0),
      ingredients: (r.ingredients && r.ingredients.length ? r.ingredients : [emptyIngredient()]).map((i) => ({
        id: i.id || genId(), name: i.name || "", amount: i.amount || "", unit: i.unit || "",
        basisAmount: i.basisAmount || "", basisUnit: i.basisUnit || "",
        basisCalories: i.basisCalories || "", basisProtein: i.basisProtein || "",
        basisCarbs: i.basisCarbs || "", basisFat: i.basisFat || "", basisFiber: i.basisFiber || "",
      })),
      method: r.method || "", mealType: normalizeMealType(r.mealType) || "Uncategorized",
    });
    setRecipeModalOpen(true);
  }

  function addIngredientRow() {
    setRecipeForm({ ...recipeForm, ingredients: [...recipeForm.ingredients, emptyIngredient()] });
  }
  function updateIngredient(id, patch) {
    setRecipeForm({ ...recipeForm, ingredients: recipeForm.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }
  function removeIngredientRow(id) {
    setRecipeForm({ ...recipeForm, ingredients: recipeForm.ingredients.filter((i) => i.id !== id) });
  }

  function calcMacrosFromIngredients() {
    const totals = recipeForm.ingredients.reduce((acc, ing) => {
      const basisAmt = Number(ing.basisAmount) || 0;
      const usedAmt = Number(ing.amount) || 0;
      if (basisAmt <= 0 || usedAmt <= 0) return acc;
      const scale = usedAmt / basisAmt;
      return {
        calories: acc.calories + (Number(ing.basisCalories) || 0) * scale,
        protein: acc.protein + (Number(ing.basisProtein) || 0) * scale,
        carbs: acc.carbs + (Number(ing.basisCarbs) || 0) * scale,
        fat: acc.fat + (Number(ing.basisFat) || 0) * scale,
        fiber: acc.fiber + (Number(ing.basisFiber) || 0) * scale,
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    const servings = Number(recipeForm.servings) || 1;
    if (totals.calories === 0 && totals.protein === 0 && totals.carbs === 0 && totals.fat === 0) {
      showToast("Add a basis (per 100g etc.) and amount used for at least one ingredient");
      return;
    }
    setRecipeForm({
      ...recipeForm,
      calories: String(Math.round(totals.calories / servings)),
      protein: String(Math.round(totals.protein / servings)),
      carbs: String(Math.round(totals.carbs / servings)),
      fat: String(Math.round(totals.fat / servings)),
      fiber: String(Math.round(totals.fiber / servings)),
    });
    showToast("Macros calculated from ingredients");
  }

  async function persistFullRecipe(recipe) {
    const newRecipes = upsertRecipeById(recipes, recipe);
    setRecipes(newRecipes);
    try { await window.storage.set("recipes", JSON.stringify(newRecipes), false); } catch (e) {}
  }

  async function saveRecipeForm() {
    if (!recipeForm.name.trim()) return;
    const recipe = {
      id: recipeForm.id || genId(),
      name: recipeForm.name.trim(),
      servings: Number(recipeForm.servings) || 1,
      calories: Number(recipeForm.calories) || 0,
      protein: Number(recipeForm.protein) || 0,
      carbs: Number(recipeForm.carbs) || 0,
      fat: Number(recipeForm.fat) || 0,
      fiber: Number(recipeForm.fiber) || 0,
      ingredients: recipeForm.ingredients.filter((i) => i.name.trim()).map((i) => ({
        id: i.id || genId(), name: i.name.trim(), amount: i.amount, unit: i.unit,
        basisAmount: i.basisAmount, basisUnit: i.basisUnit,
        basisCalories: i.basisCalories, basisProtein: i.basisProtein,
        basisCarbs: i.basisCarbs, basisFat: i.basisFat, basisFiber: i.basisFiber,
      })),
      method: recipeForm.method,
      mealType: recipeForm.mealType || "Uncategorized",
    };
    await persistFullRecipe(recipe);
    setRecipeModalOpen(false);
    showToast("Recipe saved");
  }

  function logRecipeToday(r, servings) {
    if (dayData.locked) return;
    const mult = servings && servings > 0 ? servings : 1;
    const item = {
      id: genId(), name: mult === 1 ? r.name : `${r.name} (${mult}x)`,
      calories: Math.round(r.calories * mult), protein: Math.round(r.protein * mult),
      carbs: Math.round(r.carbs * mult), fat: Math.round(r.fat * mult), fiber: Math.round(r.fiber * mult),
    };
    const newDay = { ...dayData, foods: [...dayData.foods, item] };
    setDayData(newDay);
    persist(newDay);
    showToast(mult === 1 ? "Added to log" : `Added ${mult} servings to log`);
  }

  function deleteFood(id) {
    const item = dayData.foods.find((f) => f.id === id);
    if (!item) return;
    const newDay = { ...dayData, foods: dayData.foods.filter((f) => f.id !== id) };
    setDayData(newDay);
    showUndoToast(
      `Removed "${item.name}"`,
      () => {
        const restoredDay = { ...newDay, foods: [...newDay.foods, item] };
        setDayData(restoredDay);
        persist(restoredDay);
      },
      () => { persist(newDay); }
    );
  }

  function openEditFood(f) {
    setEditFoodId(f.id);
    setEditFoodForm({
      name: f.name, calories: String(f.calories), protein: String(f.protein),
      carbs: String(f.carbs), fat: String(f.fat), fiber: String(f.fiber),
    });
  }

  function saveEditFood() {
    if (!editFoodId || !editFoodForm.name.trim()) return;
    const newDay = {
      ...dayData,
      foods: dayData.foods.map((f) => f.id === editFoodId ? {
        ...f, name: editFoodForm.name.trim(),
        calories: Number(editFoodForm.calories) || 0, protein: Number(editFoodForm.protein) || 0,
        carbs: Number(editFoodForm.carbs) || 0, fat: Number(editFoodForm.fat) || 0, fiber: Number(editFoodForm.fiber) || 0,
      } : f),
    };
    setDayData(newDay);
    persist(newDay);
    setEditFoodId(null);
    showToast("Item updated");
  }

  function saveFoodAsRecipe(f) {
    if (!f.name || !f.name.trim()) return;
    persistRecipe({
      id: genId(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber,
      ingredients: f.components ? f.components.map((c) => ({ id: genId(), name: c.name, amount: "", unit: "" })) : [],
      method: "", mealType: "Uncategorized",
    });
    showToast(`Saved "${f.name}" as a recipe`);
  }

  function isNewWeightPB(weight) {
    if (weight == null) return false;
    const priorWeights = history.filter((h) => h.weight != null && h.date !== dateStr).map((h) => h.weight);
    return priorWeights.length > 0 && weight < Math.min(...priorWeights);
  }

  async function handleSave() {
    const normalized = normalizeWorkout(dayData);
    const isPB = isNewWeightPB(normalized.weight);
    setDayData(normalized);
    const ok = await persist(normalized);
    if (ok) showToast(isPB ? "New lowest weight — saved!" : "Saved");
  }

  async function handleLock() {
    const normalized = { ...normalizeWorkout(dayData), locked: true };
    const isPB = isNewWeightPB(normalized.weight);
    setDayData(normalized);
    const ok = await persist(normalized);
    if (ok) showToast(isPB ? "New lowest weight — day locked!" : "Day locked");
  }

  async function handleUnlock() {
    const newDay = { ...dayData, locked: false };
    setDayData(newDay);
    const ok = await persist(newDay);
    if (ok) showToast("Unlocked");
  }

  function normalizeWorkout(day) {
    if (day.workout && day.workout.done) {
      return { ...day, workout: { ...day.workout, duration: Number(day.workout.duration) || 0 } };
    }
    return day;
  }

  async function saveTargets() {
    const cleaned = {
      calories: Number(targetForm.calories) || DEFAULT_TARGETS.calories,
      protein: Number(targetForm.protein) || DEFAULT_TARGETS.protein,
      carbs: Number(targetForm.carbs) || DEFAULT_TARGETS.carbs,
      fat: Number(targetForm.fat) || DEFAULT_TARGETS.fat,
      fiber: Number(targetForm.fiber) || DEFAULT_TARGETS.fiber,
      water: Number(targetForm.water) || DEFAULT_TARGETS.water,
      steps: Number(targetForm.steps) || DEFAULT_TARGETS.steps,
      goalWeight: Number(targetForm.goalWeight) || DEFAULT_TARGETS.goalWeight,
      goalBodyFatPct: Number(targetForm.goalBodyFatPct) || DEFAULT_TARGETS.goalBodyFatPct,
      startBodyFatPct: Number(targetForm.startBodyFatPct) || DEFAULT_TARGETS.startBodyFatPct,
      startWeight: Number(targetForm.startWeight) || DEFAULT_TARGETS.startWeight,
    };
    setTargets(cleaned);
    try { await window.storage.set("targets", JSON.stringify(cleaned), false); } catch (e) {}
    setSettingsOpen(false);
    showToast("Targets updated");
  }

  function computeStats(rows, periodDays) {
    const loggedRows = rows.filter((h) => h.calories > 0);
    const n = loggedRows.length;
    const sum = (key) => loggedRows.reduce((a, h) => a + (Number(h[key]) || 0), 0);
    const avg = (key) => (n ? Math.round(sum(key) / n) : 0);
    const weightRows = rows.filter((h) => h.weight != null);
    let startWeight = null, endWeight = null, weightChange = null, weightPerWeek = null;
    if (weightRows.length >= 2) {
      startWeight = weightRows[0].weight;
      endWeight = weightRows[weightRows.length - 1].weight;
      weightChange = Math.round((endWeight - startWeight) * 10) / 10;
      const daySpan = (fromDs(weightRows[weightRows.length - 1].date) - fromDs(weightRows[0].date)) / 86400000;
      weightPerWeek = daySpan > 0 ? Math.round((weightChange / (daySpan / 7)) * 100) / 100 : 0;
    } else if (weightRows.length === 1) {
      startWeight = endWeight = weightRows[0].weight;
    }
    const workoutDays = rows.filter((h) => h.workoutDone).length;
    const calorieAdherent = loggedRows.filter((h) => targets.calories > 0 && Math.abs(h.calories - targets.calories) <= targets.calories * 0.1).length;
    const calorieAdherencePct = n ? Math.round((calorieAdherent / n) * 100) : 0;
    const actualPeriodDays = periodDays === "all"
      ? (rows.length ? Math.round((fromDs(addDays(todayStr(), -1)) - fromDs(rows[0].date)) / 86400000) + 1 : 0)
      : periodDays - 1;
    const consistencyPct = actualPeriodDays ? Math.min(100, Math.round((n / actualPeriodDays) * 100)) : 0;
    return {
      n, avgCalories: avg("calories"), avgProtein: avg("protein"), avgCarbs: avg("carbs"), avgFat: avg("fat"), avgFiber: avg("fiber"),
      avgWater: avg("water"), avgSteps: avg("steps"),
      startWeight, endWeight, weightChange, weightPerWeek,
      workoutDays, calorieAdherencePct, consistencyPct, periodDays: actualPeriodDays,
    };
  }

  function statsRowsFor(period) {
    const cutoff = period === "all" ? null : addDays(todayStr(), -(Number(period) - 1));
    // Today is always excluded — it's still in progress, so including it as a
    // partial day would drag every average down artificially.
    return history.filter((h) => !cutoff || h.date >= cutoff).filter((h) => h.date < todayStr());
  }

  function buildExportText(period) {
    const rows = statsRowsFor(period);
    if (rows.length === 0) return "No logged days in this period yet.";
    const s = computeStats(rows, period === "all" ? "all" : Number(period));
    const lines = [];
    lines.push(`Macro Console export — ${prettyDate(todayStr())} (${period === "all" ? "all time" : `last ${period} days`})`);
    lines.push(`Targets: ${targets.calories} cal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat, ${targets.fiber}g fiber, ${targets.water}ml water, ${targets.steps} steps`);
    lines.push("");
    rows.forEach((h) => {
      const parts = [
        `${shortDate(h.date)}: ${Math.round(h.calories)} cal (${Math.round(h.protein)}P/${Math.round(h.carbs)}C/${Math.round(h.fat)}F/${Math.round(h.fiber)}Fi)`,
        h.weight != null ? `weight ${h.weight}lbs` : null,
        `water ${h.water}ml`,
        h.steps != null ? `${h.steps.toLocaleString()} steps` : null,
        h.workoutDone ? "trained" : null,
      ].filter(Boolean);
      lines.push(parts.join(" · "));
    });
    lines.push("");
    lines.push(`Averages: ${s.avgCalories} cal, ${s.avgProtein}P, ${s.avgCarbs}C, ${s.avgFat}F, ${s.avgFiber}Fi, ${s.avgWater}ml water, ${s.avgSteps} steps`);
    if (s.weightChange != null) {
      lines.push(`Weight: ${s.startWeight}lbs \u2192 ${s.endWeight}lbs (${s.weightChange > 0 ? "+" : ""}${s.weightChange}lbs, ${s.weightPerWeek > 0 ? "+" : ""}${s.weightPerWeek}lbs/wk)`);
    }
    lines.push(`Calorie adherence (within 10% of target): ${s.calorieAdherencePct}%`);
    lines.push(`Workouts: ${s.workoutDays}/${rows.length} logged days`);
    lines.push(`Logging consistency: ${s.n}/${s.periodDays} days (${s.consistencyPct}%)`);
    return lines.join("\n");
  }

  function buildBodyContext() {
    const lines = [];
    if (bodyComp.length > 0) {
      lines.push("Body composition scans (most recent last):");
      bodyComp.slice(-15).forEach((e) => {
        const parts = BC_FIELDS.map(([key, lbl, unit]) => e[key] != null ? `${lbl} ${e[key]}${unit}` : null).filter(Boolean).join(", ");
        lines.push(`${shortDate(e.date)}: ${parts}`);
      });
    }
    if (measurements.length > 0) {
      lines.push("");
      lines.push("Body measurements in cm (most recent last):");
      measurements.slice(-15).forEach((e) => {
        const parts = MEASURE_FIELDS.map(([key, lbl]) => e[key] != null ? `${lbl} ${e[key]}` : null).filter(Boolean).join(", ");
        lines.push(`${shortDate(e.date)}: ${parts}`);
      });
    }
    lines.push("");
    lines.push(`Goals: starting body fat ${targets.startBodyFatPct}%, target body fat ${targets.goalBodyFatPct}%, target weight ${targets.goalWeight}lbs.`);
    return lines.join("\n");
  }

  function buildWorkoutContext() {
    if (exerciseLog.length === 0) return "No workout weights logged yet.";
    const byExercise = {};
    exerciseLog.forEach((l) => { (byExercise[l.exercise] = byExercise[l.exercise] || []).push(l); });
    const lines = ["Workout weight log by exercise, oldest to newest (lb, with reps where logged):"];
    Object.keys(byExercise).sort().forEach((name) => {
      const entries = byExercise[name].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
      lines.push(`${name}: ` + entries.map((e) => `${shortDate(e.date)} ${e.weight}lb${e.reps != null ? `×${e.reps}` : ""}`).join(", "));
    });
    return lines.join("\n");
  }

  async function sendStatsMessage() {
    const text = statsInput.trim();
    if (!text || statsBusy) return;
    const userMsg = { role: "user", content: text };
    const nextMessages = [...statsMessages, userMsg];
    setStatsMessages(nextMessages);
    setStatsInput("");
    setStatsBusy(true);
    try {
      const dataContext = buildExportText(statsPeriod);
      const bodyContext = buildBodyContext();
      const workoutContext = buildWorkoutContext();
      const system = [
        "You are a direct, supportive fitness-data assistant embedded in a nutrition console.",
        "Answer questions about the logged data below. Keep answers to a few sentences, not a report.",
        "Only use the numbers provided — never invent data points that aren't present, and say so plainly if something isn't in the data.",
        `Current targets and logged history (${statsPeriod === "all" ? "all time" : `last ${statsPeriod} days`}):`,
        dataContext,
        "",
        "Body composition scans and tape measurements — separate from the daily food log above, logged roughly every 2 weeks, not limited to the period selected above:",
        bodyContext,
        "",
        "Workout weight log, not limited to the period selected above:",
        workoutContext,
      ].join("\n");
      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const reply = await callClaudeText(apiMessages, system);
      setStatsMessages([...nextMessages, { role: "assistant", content: reply || "I didn't get a response — try again." }]);
    } catch (e) {
      setStatsMessages((cur) => [...cur, { role: "assistant", content: "Couldn't reach the assistant — check your connection and try again." }]);
    } finally {
      setStatsBusy(false);
    }
  }

  async function handleImport() {
    setImportError("");
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      setImportError("That doesn't look like valid JSON — paste exactly what you copied from a backup.");
      return;
    }
    setImportBusy(true);
    try {
      let newHistory = history;
      let newRecipes = recipes;
      let newTargets = targets;
      let newMeta = meta;
      let newBodyComp = bodyComp;
      let newMeasurements = measurements;
      const writes = [];
      let touchedCurrentDay = false;

      if (parsed.targets && typeof parsed.targets === "object") {
        newTargets = { ...DEFAULT_TARGETS, ...parsed.targets };
        writes.push(window.storage.set("targets", JSON.stringify(newTargets), false));
      }
      if (parsed.meta && typeof parsed.meta === "object") {
        newMeta = { ...meta, ...parsed.meta };
        writes.push(window.storage.set("meta", JSON.stringify(newMeta), false));
      }
      if (Array.isArray(parsed.bodyComp)) {
        parsed.bodyComp.forEach((e) => { if (e.date) newBodyComp = upsertBodyComp(newBodyComp, e); });
        writes.push(window.storage.set("bodycomp", JSON.stringify(newBodyComp), false));
      }
      if (Array.isArray(parsed.measurements)) {
        parsed.measurements.forEach((e) => { if (e.date) newMeasurements = upsertMeasurements(newMeasurements, e); });
        writes.push(window.storage.set("measurements", JSON.stringify(newMeasurements), false));
      }
      if (Array.isArray(parsed.history)) {
        parsed.history.forEach((h) => {
          if (!h.date) return;
          const summary = {
            date: h.date, calories: Number(h.calories) || 0, protein: Number(h.protein) || 0,
            carbs: Number(h.carbs) || 0, fat: Number(h.fat) || 0, fiber: Number(h.fiber) || 0,
            weight: h.weight != null ? Number(h.weight) : null,
            water: Number(h.water) || 0, steps: h.steps != null ? Number(h.steps) : null,
            workoutDone: !!h.workoutDone,
          };
          newHistory = upsertHistory(newHistory, summary);
          const dayPayload = {
            foods: summary.calories > 0 ? [{ id: genId(), name: "Imported total", calories: summary.calories, protein: summary.protein, carbs: summary.carbs, fat: summary.fat, fiber: summary.fiber }] : [],
            weight: summary.weight, water: summary.water, steps: summary.steps,
            workout: summary.workoutDone ? { done: true, type: "Other", duration: 0 } : null,
            locked: true,
          };
          writes.push(window.storage.set(`day:${h.date}`, JSON.stringify(dayPayload), false));
          if (h.date === dateStr) touchedCurrentDay = true;
        });
      }
      if (Array.isArray(parsed.recipes)) {
        parsed.recipes.forEach((r) => {
          if (!r.name) return;
          newRecipes = upsertRecipe(newRecipes, {
            id: genId(), name: r.name, calories: Number(r.calories) || 0, protein: Number(r.protein) || 0,
            carbs: Number(r.carbs) || 0, fat: Number(r.fat) || 0, fiber: Number(r.fiber) || 0,
            ingredients: Array.isArray(r.ingredients) ? r.ingredients.map((i) => ({ id: genId(), name: i.name || "", amount: i.amount || "", unit: i.unit || "" })) : [],
            method: r.method || "",
          });
        });
        writes.push(window.storage.set("recipes", JSON.stringify(newRecipes), false));
      }
      let restoredToday = null;
      if (parsed.today && parsed.today.date && parsed.today.day) {
        restoredToday = parsed.today;
        const summary = buildSummary(parsed.today.date, parsed.today.day);
        newHistory = upsertHistory(newHistory, summary);
        writes.push(window.storage.set(`day:${parsed.today.date}`, JSON.stringify(parsed.today.day), false));
        if (parsed.today.date === dateStr) touchedCurrentDay = true;
      }
      if (Array.isArray(parsed.history) || restoredToday) {
        writes.push(window.storage.set("history", JSON.stringify(newHistory), false));
      }

      // Storage may still be failing — settle every write independently so the local
      // session updates regardless, rather than letting one storage failure block the rest.
      const results = await Promise.allSettled(writes);
      const anyStorageFailed = results.some((r) => r.status === "rejected");

      setTargets(newTargets);
      setTargetForm(newTargets);
      setMeta(newMeta);
      setHistory(newHistory);
      setRecipes(newRecipes);
      setBodyComp(newBodyComp);
      setMeasurements(newMeasurements);
      if (touchedCurrentDay) {
        if (restoredToday && restoredToday.date === dateStr) setDayData(restoredToday.day);
        else await loadDay(dateStr);
      }
      setImportText("");
      showToast(anyStorageFailed ? "Restored into this session (storage still failing)" : "Restored and saved");
    } catch (e) {
      setImportError("Restore failed partway through — check the data and try again.");
    } finally {
      setImportBusy(false);
    }
  }

  function buildFullBackup() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      targets, meta, history, recipes, bodyComp, measurements,
      today: { date: dateStr, day: dayData },
    });
  }

  async function handleCopyBackup() {
    const text = buildFullBackup();
    try {
      await navigator.clipboard.writeText(text);
      showToast("Backup copied — paste it somewhere safe");
    } catch (e) {
      setCopyModalText(text);
    }
  }

  async function rebuildHistoryFromDailyLogs() {
    // SAFETY: this used to fire all 260 day: reads at once with Promise.all,
    // then unconditionally overwrite "history" with whatever came back. Under
    // this storage backend's known fragility under concurrent load, a burst of
    // failed reads looked identical to "day never happened" (safeGet swallows
    // errors and returns null either way) — so a bad network moment could wipe
    // real history. Fixed to: read in small batches with a retry per date, and
    // only ever ADD days that are missing from the current history. It never
    // removes or overwrites an existing entry, so a partial/failed scan can at
    // worst recover nothing — it can no longer lose anything.
    showToast("Checking your daily logs for anything missing...");
    const dates = [];
    for (let i = 0; i < 260; i++) dates.push(addDays(todayStr(), -i));

    const BATCH_SIZE = 12;
    const found = [];
    for (let i = 0; i < dates.length; i += BATCH_SIZE) {
      const batch = dates.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (ds) => {
        let v = await safeGet(`day:${ds}`);
        if (!v) v = await safeGet(`day:${ds}`); // one retry — a null here could be a real miss or a dropped request
        return { ds, v };
      }));
      batchResults.forEach(({ ds, v }) => {
        if (!v) return;
        try {
          const day = JSON.parse(v);
          const hasData = (day.foods && day.foods.length > 0) || day.weight != null || (day.water && day.water > 0) || (day.steps && day.steps > 0) || (day.workout && day.workout.done);
          if (hasData) found.push(buildSummary(ds, day));
        } catch (e) {}
      });
    }

    const current = historyRef.current || [];
    const currentDates = new Set(current.map((h) => h.date));
    const missing = found.filter((h) => !currentDates.has(h.date));

    if (missing.length === 0) {
      showToast(current.length > 0 ? "Nothing missing — history already matches your daily logs" : "No daily logs found");
      return;
    }

    const merged = [...current, ...missing].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
    historyRef.current = merged;
    setHistory(merged);
    try {
      await window.storage.set("history", JSON.stringify(merged), false);
      showToast(`Recovered ${missing.length} missing day${missing.length === 1 ? "" : "s"} from your logs`);
    } catch (e) {
      showToast("Recovered in this session but couldn't save — try again");
    }
  }

  function buildDayForClaude() {
    const foods = dayData.foods || [];
    const t = sumMacros(foods);
    const r = (n) => Math.round(n);
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const macroLine = (m) => `${r(m.calories || 0)} cal, ${r(m.protein || 0)}g protein, ${r(m.carbs || 0)}g carbs, ${r(m.fat || 0)}g fat, ${r(m.fiber || 0)}g fibre`;
    const lines = [];
    lines.push(`MY DAY SO FAR — ${prettyDate(dateStr)}${isToday ? `, ${timeStr}` : ""}`);
    lines.push("");
    lines.push("FOOD EATEN");
    if (foods.length === 0) lines.push("Nothing logged yet.");
    foods.forEach((f) => {
      lines.push(`- ${f.name}: ${macroLine(f)}`);
      if (f.components && f.components.length > 1) lines.push(`    (${f.components.map((c) => c.name).join(", ")})`);
    });
    lines.push("");
    lines.push("TOTALS vs TARGETS");
    lines.push(`Eaten: ${macroLine(t)}`);
    lines.push(`Targets: ${targets.calories} cal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat, ${targets.fiber}g fibre`);
    const left = (tgt, v) => (tgt - v >= 0 ? `${r(tgt - v)} left` : `${r(v - tgt)} over`);
    lines.push(`Remaining: ${left(targets.calories, t.calories)} cal, ${left(targets.protein, t.protein)} protein, ${left(targets.carbs, t.carbs)} carbs, ${left(targets.fat, t.fat)} fat, ${left(targets.fiber, t.fiber)} fibre`);
    lines.push("");
    lines.push("ACTIVITY TODAY");
    lines.push(`Water: ${dayData.water || 0}/${targets.water}ml`);
    lines.push(`Steps: ${dayData.steps != null ? dayData.steps.toLocaleString() : 0}/${targets.steps.toLocaleString()}`);
    lines.push(`Trained today: ${dayData.workout && dayData.workout.done ? "yes" : "not yet"}`);
    lines.push(`Workouts this week: ${weekWorkoutDates.size} of ${weeklyWorkoutTarget} target`);

    lines.push("");
    lines.push("PROGRESS");
    if (goalCurrentWeight != null) {
      lines.push(`Weight: ${goalCurrentWeight}lbs (started ${goalStartWeight}, goal ${targets.goalWeight})${goalWeightProgressPct != null ? ` — ${goalWeightProgressPct}% of the way` : ""}`);
    }
    if (goalCurrentBf != null) {
      lines.push(`Body fat: ${goalCurrentBf}% (started ${goalStartBf}%, goal ${targets.goalBodyFatPct}%)${goalBfProgressPct != null ? ` — ${goalBfProgressPct}% of the way` : ""}`);
    }
    if (nextMilestone) lines.push(`Next milestone: ${nextMilestone.weight}lbs`);
    lines.push(`Logging streak: ${meta.streak || 0} days`);
    if (plateau) {
      lines.push(`Weight trend note: 7-day average is ${plateau.change > 0 ? `up ${plateau.change}lbs` : plateau.change === 0 ? "level" : `only ${Math.abs(plateau.change)}lbs down`} on the week before${plateau.reliable ? "" : ` (but ${plateau.unlogged} unlogged and ${plateau.over} over-target days in the last 14, so unreliable)`}`);
    }

    const wk = computeStats(statsRowsFor("7"), 7);
    if (wk.n > 0) {
      lines.push("");
      lines.push(`LAST 7 DAYS (excluding today, ${wk.n} logged days)`);
      lines.push(`Average per day: ${wk.avgCalories} cal, ${wk.avgProtein}g protein, ${wk.avgCarbs}g carbs, ${wk.avgFat}g fat, ${wk.avgFiber}g fibre, ${wk.avgSteps.toLocaleString()} steps`);
      lines.push(`Days within 10% of calorie target: ${wk.calorieAdherencePct}%`);
    }

    lines.push("");
    lines.push("Based on all of this, what should I eat for the rest of the day to hit my targets? Give specific meal/snack suggestions with approximate macros (calories, protein, carbs, fat, fibre), and flag anything else I should do today to stay on track.");
    return lines.join("\n");
  }

  async function handleCopyDay() {
    const text = buildDayForClaude();
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied — paste it into Claude");
    } catch (e) {
      setCopyModalText(text);
    }
  }

  async function handleCopyExport() {
    const text = buildExportText(statsPeriod);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied — paste it to me in chat");
    } catch (e) {
      setCopyModalText(text);
    }
  }

  function buildCsvExport(period) {
    const rows = statsRowsFor(period);
    const header = "date,calories,protein,carbs,fat,fiber,weight,water,steps,trained";
    const lines = rows.map((h) => [
      h.date, Math.round(h.calories), Math.round(h.protein), Math.round(h.carbs), Math.round(h.fat), Math.round(h.fiber),
      h.weight != null ? h.weight : "", h.water, h.steps != null ? h.steps : "", h.workoutDone ? "yes" : "no",
    ].join(","));
    return [header, ...lines].join("\n");
  }

  async function handleCopyCsv() {
    const text = buildCsvExport(statsPeriod);
    try {
      await navigator.clipboard.writeText(text);
      showToast("CSV copied — paste into a spreadsheet");
    } catch (e) {
      setCopyModalText(text);
    }
  }

  async function clearAllData() {
    try {
      const listed = await window.storage.list("day:", false);
      const keys = listed && listed.keys ? listed.keys : [];
      await Promise.all(keys.map((k) => window.storage.delete(k, false).catch(() => {})));
      await window.storage.delete("targets", false).catch(() => {});
      await window.storage.delete("meta", false).catch(() => {});
      await window.storage.delete("history", false).catch(() => {});
    } catch (e) {}
    setTargets(DEFAULT_TARGETS);
    setTargetForm(DEFAULT_TARGETS);
    setMeta({ streak: 0, lastLoggedDate: null });
    setHistory([]);
    setDayData(emptyDay());
    setConfirmClear(false);
    setSettingsOpen(false);
    showToast("All data cleared");
  }

  const totals = sumMacros(dayData.foods);
  const isToday = dateStr === todayStr();
  const isFuture = dateStr > todayStr();
  const atMaxDate = dateStr >= addDays(todayStr(), 7);
  const recipeMatches = foodForm.name.trim().length > 0
    ? recipes.filter((r) => r.name.toLowerCase().includes(foodForm.name.trim().toLowerCase())).slice(0, 6)
    : [];
  const bodyFatTrend = [...bodyComp].sort((a, b) => a.date.localeCompare(b.date)).slice(-14).filter((e) => e.bodyFatPct != null).map((e) => ({ ...e, label: shortDate(e.date) }));
  const waistTrend = [...measurements].sort((a, b) => a.date.localeCompare(b.date)).slice(-12).filter((e) => e.waist != null).map((e) => ({ ...e, label: shortDate(e.date) }));
  const statsRows = statsRowsFor(statsPeriod);
  const stats = computeStats(statsRows, statsPeriod === "all" ? "all" : Number(statsPeriod));
  const calorieTrendData = [...statsRows].sort((a, b) => a.date.localeCompare(b.date)).map((h) => ({ ...h, label: shortDate(h.date) }));
  const weightTrendCutoff = statsPeriod === "all" ? null : addDays(todayStr(), -(Number(statsPeriod) - 1));
  // Weight-by-date merged from two independent sources — the daily log (history)
  // and body-composition scans — so a gap or wipe in one doesn't blank out weight
  // tracking entirely. History wins when a date has both, since it's the day's
  // official logged value; bodyComp fills in any date history is missing.
  const weightByDate = new Map();
  bodyComp.forEach((e) => { if (e.weight != null) weightByDate.set(e.date, e.weight); });
  history.forEach((h) => { if (h.weight != null) weightByDate.set(h.date, h.weight); });
  const mergedWeightSeries = [...weightByDate.entries()]
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightTrendData = mergedWeightSeries
    .filter((h) => !weightTrendCutoff || h.date >= weightTrendCutoff)
    .map((h) => ({ ...h, label: shortDate(h.date) }));
  const statsDaysSinceMonday = (fromDs(todayStr()).getDay() + 6) % 7;
  const statsMondayThisWeek = addDays(todayStr(), -statsDaysSinceMonday);
  const weekWorkoutDates = new Set([
    ...exerciseLog.filter((l) => l.date >= statsMondayThisWeek).map((l) => l.date),
    ...history.filter((h) => h.date >= statsMondayThisWeek && h.workoutDone).map((h) => h.date),
  ]);
  if (dateStr === todayStr() && dayData.workout && dayData.workout.done) weekWorkoutDates.add(todayStr());
  const weeklyWorkoutTarget = 4;
  const weeklyWorkoutPct = Math.min(100, Math.round((weekWorkoutDates.size / weeklyWorkoutTarget) * 100));

  const weightEntries = mergedWeightSeries;
  const goalStartWeight = (targets.startWeight != null && targets.startWeight !== "") ? Number(targets.startWeight) : (weightEntries.length ? weightEntries[0].weight : null);
  const goalCurrentWeight = dayData.weight != null ? dayData.weight : (weightEntries.length ? weightEntries[weightEntries.length - 1].weight : null);
  const goalWeightProgressPct = (goalStartWeight != null && goalCurrentWeight != null && goalStartWeight > targets.goalWeight)
    ? Math.max(0, Math.min(100, Math.round(((goalStartWeight - goalCurrentWeight) / (goalStartWeight - targets.goalWeight)) * 100)))
    : null;
  const bfEntries = bodyComp.filter((e) => e.bodyFatPct != null);
  const goalStartBf = (targets.startBodyFatPct != null && targets.startBodyFatPct !== "") ? Number(targets.startBodyFatPct) : (bfEntries.length ? bfEntries[0].bodyFatPct : null);
  const goalCurrentBf = bfEntries.length ? bfEntries[bfEntries.length - 1].bodyFatPct : goalStartBf;
  const goalBfProgressPct = (goalStartBf != null && goalCurrentBf != null && goalStartBf > targets.goalBodyFatPct)
    ? Math.max(0, Math.min(100, Math.round(((goalStartBf - goalCurrentBf) / (goalStartBf - targets.goalBodyFatPct)) * 100)))
    : null;
  const bfPtsLost = (goalStartBf != null && goalCurrentBf != null) ? Math.round((goalStartBf - goalCurrentBf) * 10) / 10 : null;
  const bfPtsToGo = (goalCurrentBf != null) ? Math.round((goalCurrentBf - targets.goalBodyFatPct) * 10) / 10 : null;

  // Plateau nudge: compares the average weight of the last 7 days with the 7 before
  // (single weigh-ins swing by several lbs from water alone), and only recommends a
  // calorie cut when those two weeks were actually logged cleanly — otherwise the
  // flat weight is more likely explained by the missed/over days than by the target.
  let plateau = null;
  if (targets.goalWeight != null) {
    const avgOf = (arr) => arr.reduce((t, e) => t + e.weight, 0) / arr.length;
    const thisWk = weightEntries.filter((e) => e.date >= addDays(todayStr(), -6));
    const prevWk = weightEntries.filter((e) => e.date >= addDays(todayStr(), -13) && e.date <= addDays(todayStr(), -7));
    if (thisWk.length >= 2 && prevWk.length >= 2) {
      const change = Math.round((avgOf(thisWk) - avgOf(prevWk)) * 10) / 10;
      const currentAvg = avgOf(thisWk);
      if (currentAvg > targets.goalWeight && change > -0.5) {
        let unlogged = 0, over = 0;
        for (let i = 1; i <= 14; i++) {
          const ds = addDays(todayStr(), -i);
          const row = history.find((h) => h.date === ds);
          if (!row || !(row.calories > 0)) unlogged++;
          else if (row.calories > targets.calories * 1.1) over++;
        }
        plateau = { change, unlogged, over, reliable: unlogged + over < 2 };
      }
    }
  }

  // Next milestone: highest checkpoint weight still below current weight.
  const currentTrackedWeight = dayData.weight != null ? dayData.weight : (weightEntries.length ? weightEntries[weightEntries.length - 1].weight : null);
  const nextMilestone = currentTrackedWeight != null
    ? (WEIGHT_MILESTONES.find((m) => m.weight < currentTrackedWeight - 0.1) || WEIGHT_MILESTONES[WEIGHT_MILESTONES.length - 1])
    : null;
  const latestWaistEntry = [...measurements].reverse().find((m) => m.waist != null);

  function renderQuickLogBody() {
    return (
      <>
        {pendingImages.length > 0 && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img src={img.dataUrl} alt={`Selected meal photo ${i + 1}`} className="rounded-md" style={{ height: 44, width: 44, objectFit: "cover" }} />
                <button
                  onClick={() => setPendingImages((cur) => cur.filter((_, idx) => idx !== i))}
                  aria-label="Remove photo"
                  className="absolute rounded-full flex items-center justify-center"
                  style={{ top: -6, right: -6, width: 18, height: 18, background: palette.panel, border: `1px solid ${palette.border}` }}
                >
                  <X size={11} style={{ color: palette.textFaint }} />
                </button>
              </div>
            ))}
            {pendingImages.length < 4 && (
              <span className="font-mono self-center" style={{ color: palette.textFaint, fontSize: 10 }}>{pendingImages.length}/4</span>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <label
            aria-label="Attach photos"
            className="rounded-lg px-3 flex items-center justify-center flex-shrink-0 cursor-pointer"
            style={{ border: `1px solid ${palette.border}`, opacity: logBusy || pendingImages.length >= 4 ? 0.4 : 1, pointerEvents: logBusy || pendingImages.length >= 4 ? "none" : "auto" }}
          >
            <input
              type="file" accept="image/*" multiple onChange={handleImageSelect}
              disabled={logBusy} className="hidden"
            />
            <Camera size={16} style={{ color: palette.textMuted }} />
          </label>
          <input
            type="text" placeholder="Describe what you ate, or just attach photos..." value={logInput}
            onChange={(e) => setLogInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendLogMessage(); }}
            disabled={logBusy}
            className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none border"
            style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
          />
          <button
            onClick={sendLogMessage} disabled={logBusy || (!logInput.trim() && pendingImages.length === 0)} aria-label="Send"
            className="rounded-lg px-3 flex items-center justify-center flex-shrink-0"
            style={{ background: palette.amber, opacity: logBusy || (!logInput.trim() && pendingImages.length === 0) ? 0.4 : 1 }}
          >
            <Send size={16} style={{ color: "#1B1815" }} />
          </button>
        </div>
        {(logBusy || logMessages.length > 0) && (
          <div className="mt-2 font-mono flex items-center gap-1" style={{ color: palette.textMuted, fontSize: 12 }}>
            {logBusy ? (
              <><Loader2 className="animate-spin" size={12} /> Reading that...</>
            ) : (
              logMessages[logMessages.length - 1].role === "assistant" ? logMessages[logMessages.length - 1].content : null
            )}
          </div>
        )}
        {logSuggestion && (
          <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 mt-2" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
            <span className="font-mono" style={{ color: palette.textMuted, fontSize: 11 }}>Save "{logSuggestion.name}" as a recipe?</span>
            <div className="flex gap-1 flex-shrink-0">
              <Button onClick={saveSuggestionAsRecipe} size="sm">Save</Button>
              <Button onClick={() => setLogSuggestion(null)} variant="ghost" size="sm">Skip</Button>
            </div>
          </div>
        )}
        <div className="font-mono mt-2" style={{ color: palette.textFaint, fontSize: 10 }}>
          Reusable dishes and packaged snacks or drinks get offered as a save, never saved automatically. Whole meals log as one item — tap it to see the ingredient breakdown.
        </div>
      </>
    );
  }

  async function openQuickLog() {
    if (dateStr !== todayStr()) goToDate(todayStr());
    setQuickLogOpen(true);
  }

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ background: palette.bg }}>
        <Loader2 className="animate-spin" size={28} style={{ color: palette.amber }} />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen font-body" style={{ background: palette.bg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        :root {
          --amber: ${palette.amber}; --steel: ${palette.steel}; --panelAlt: ${palette.panelAlt}; --textFaint: ${palette.textFaint};
        }
        .font-display { font-family: 'Oswald', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .font-body { font-family: 'Inter', sans-serif; }
        input:focus { outline: 2px solid ${palette.amber}; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid ${palette.amber}; outline-offset: 2px; }
      `}</style>

      <div className="max-w-xl mx-auto px-4 py-4 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="font-display font-semibold uppercase" style={{ color: palette.text, fontSize: 18, letterSpacing: "0.06em" }}>
            Macro Console
          </div>
          <div className="flex items-center gap-3">
            {meta.streak > 0 && (
              <div className="flex items-center gap-1">
                <Flame size={16} style={{ color: palette.amber }} />
                <span className="font-mono text-sm" style={{ color: palette.text }}>{meta.streak}</span>
              </div>
            )}
            <button onClick={() => { setTargetForm(targets); setSettingsOpen(true); }} aria-label="Settings">
              <Settings size={20} style={{ color: palette.textMuted }} />
            </button>
          </div>
        </div>

        {/* View switcher */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setView("console")}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 font-display uppercase"
            style={{
              background: view === "console" ? palette.amber : "transparent",
              color: view === "console" ? "#1B1815" : palette.textMuted,
              border: `1px solid ${view === "console" ? palette.amber : palette.border}`,
              letterSpacing: "0.04em", fontSize: 11,
            }}
          >
            <LayoutDashboard size={13} /> Dashboard
          </button>
          <button
            onClick={() => setView("book")}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 font-display uppercase"
            style={{
              background: view === "book" ? palette.amber : "transparent",
              color: view === "book" ? "#1B1815" : palette.textMuted,
              border: `1px solid ${view === "book" ? palette.amber : palette.border}`,
              letterSpacing: "0.04em", fontSize: 11,
            }}
          >
            <BookOpen size={13} /> Log
          </button>
          <button
            onClick={() => setView("supps")}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 font-display uppercase"
            style={{
              background: view === "supps" ? palette.amber : "transparent",
              color: view === "supps" ? "#1B1815" : palette.textMuted,
              border: `1px solid ${view === "supps" ? palette.amber : palette.border}`,
              letterSpacing: "0.04em", fontSize: 11,
            }}
          >
            <Pill size={13} /> Supps
          </button>
          <button
            onClick={() => setView("progress")}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 font-display uppercase"
            style={{
              background: view === "progress" ? palette.amber : "transparent",
              color: view === "progress" ? "#1B1815" : palette.textMuted,
              border: `1px solid ${view === "progress" ? palette.amber : palette.border}`,
              letterSpacing: "0.04em", fontSize: 11,
            }}
          >
            <Activity size={13} /> Progress
          </button>
          <button
            onClick={() => setView("workout")}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 font-display uppercase"
            style={{
              background: view === "workout" ? palette.amber : "transparent",
              color: view === "workout" ? "#1B1815" : palette.textMuted,
              border: `1px solid ${view === "workout" ? palette.amber : palette.border}`,
              letterSpacing: "0.04em", fontSize: 11,
            }}
          >
            <Dumbbell size={13} /> Workout
          </button>
        </div>

        {view === "console" && (
        <>
        {/* Date nav */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => goToDate(addDays(dateStr, -1))} className="p-1.5 rounded-lg" style={{ border: `1px solid ${palette.border}` }}>
            <ChevronLeft size={16} style={{ color: palette.text }} />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm" style={{ color: palette.text }}>{prettyDate(dateStr)}</span>
            {isFuture && <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ color: palette.steel, border: `1px solid ${palette.steel}` }}>Planned</span>}
            {!isToday && (
              <button onClick={() => goToDate(todayStr())} className="font-display uppercase text-xs px-2 py-1 rounded" style={{ color: palette.amber, border: `1px solid ${palette.amber}` }}>
                Today
              </button>
            )}
          </div>
          <button onClick={() => !atMaxDate && goToDate(addDays(dateStr, 1))} disabled={atMaxDate} className="p-1.5 rounded-lg" style={{ border: `1px solid ${palette.border}`, opacity: atMaxDate ? 0.3 : 1 }}>
            <ChevronRight size={16} style={{ color: palette.text }} />
          </button>
        </div>

        {/* Save / Lock bar */}
        {!dayData.locked ? (
          <div className="flex gap-2 mb-3">
            <Button onClick={handleSave} variant="ghost" grow>Save</Button>
            <Button onClick={handleLock} variant="primary" grow>
              <span className="flex items-center justify-center gap-1"><Lock size={14} /> Lock day</span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-3 rounded-lg px-3 py-2" style={{ border: `1px solid ${palette.border}`, background: palette.panelAlt }}>
            <span className="font-mono flex items-center gap-1" style={{ color: palette.textMuted, fontSize: 12 }}>
              <Lock size={13} /> Day locked
            </span>
            <button onClick={handleUnlock} className="font-display uppercase flex items-center gap-1" style={{ color: palette.amber, fontSize: 11, letterSpacing: "0.06em" }}>
              <Unlock size={13} /> Unlock
            </button>
          </div>
        )}

        {dayLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} style={{ color: palette.amber }} /></div>
        ) : (
          <>
            {/* Hero calorie gauge — the one focal point; everything else stays quiet */}
            {(() => {
              const heroPercent = targets.calories > 0 ? Math.max(0, Math.min(100, (totals.calories / targets.calories) * 100)) : 0;
              const heroPath = "M 25 148 A 115 115 0 0 1 255 148";
              const heroShown = ready ? heroPercent : 0;
              const heroDiff = Math.round(targets.calories - totals.calories);
              const heroOver = Math.round(totals.calories - targets.calories);
              return (
                <div className="mb-3">
                  <div className="relative mx-auto" style={{ maxWidth: 210 }}>
                    <svg viewBox="0 0 280 165" className="w-full h-auto">
                      <path d={heroPath} pathLength="100" fill="none" stroke={palette.border} strokeWidth={18} strokeLinecap="round" />
                      <path
                        d={heroPath} pathLength="100" fill="none" stroke={palette.amber} strokeWidth={18} strokeLinecap="round"
                        strokeDasharray={`${heroShown} ${100 - heroShown}`}
                        style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)", filter: "drop-shadow(0 0 14px rgba(224,168,62,0.45))" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-end" style={{ paddingBottom: 6 }}>
                      <span className="font-mono font-bold" style={{ fontSize: 38, lineHeight: 1, color: palette.text }}>
                        {Math.round(totals.calories).toLocaleString()}
                      </span>
                      <span className="font-mono" style={{ color: palette.textMuted, fontSize: 11 }}>
                        / {targets.calories.toLocaleString()} cal
                      </span>
                    </div>
                  </div>
                  <div className="text-center -mt-1 mb-2">
                    <span className="font-mono" style={{ color: heroOver > 0 ? palette.alert : palette.textFaint, fontSize: 11 }}>
                      {heroOver > 0 ? `+${heroOver} over` : `${heroDiff} to go`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1" style={{ maxWidth: 260, margin: "0 auto" }}>
                    <Gauge label="Protein" value={totals.protein} target={targets.protein} unit="g" color={palette.rust} size="sm" ready={ready} />
                    <Gauge label="Carbs" value={totals.carbs} target={targets.carbs} unit="g" color={palette.olive} size="sm" ready={ready} />
                    <Gauge label="Fat" value={totals.fat} target={targets.fat} unit="g" color={palette.steel} size="sm" ready={ready} />
                    <Gauge label="Fiber" value={totals.fiber} target={targets.fiber} unit="g" color={palette.plum} size="sm" ready={ready} />
                  </div>
                </div>
              );
            })()}

            <Panel className="mb-3">
              <button onClick={() => setHomeProgressExpanded(!homeProgressExpanded)} className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Progress</Label>
                  {plateau && <span className="rounded-full" style={{ width: 6, height: 6, background: palette.rust, flexShrink: 0 }} />}
                </div>
                <div className="flex items-center gap-2">
                  {!homeProgressExpanded && goalWeightProgressPct != null && (
                    <span className="font-mono" style={{ color: palette.amber, fontSize: 11 }}>{goalWeightProgressPct}% to goal</span>
                  )}
                  <ChevronDown size={14} style={{ color: palette.textFaint, transform: homeProgressExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
                </div>
              </button>

              {homeProgressExpanded && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>target {targets.goalWeight} lbs</span>
                  </div>
                  {goalWeightProgressPct != null ? (
                    <>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-mono text-lg" style={{ color: palette.text }}>{goalCurrentWeight} lbs</span>
                        <span className="font-mono" style={{ color: palette.amber, fontSize: 13 }}>{goalWeightProgressPct}%</span>
                      </div>
                      <div className="h-2 rounded-full" style={{ background: palette.panelAlt }}>
                        <div className="h-2 rounded-full" style={{ width: `${goalWeightProgressPct}%`, background: palette.amber, transition: "width 0.6s ease" }} />
                      </div>
                      <div className="font-mono mt-1" style={{ color: palette.textFaint, fontSize: 11 }}>
                        from {goalStartWeight} lbs down to {targets.goalWeight} lbs
                      </div>
                    </>
                  ) : (
                    <div className="font-mono py-1" style={{ color: palette.textFaint, fontSize: 12 }}>
                      Log your weight on a couple of days to see progress toward your goal here.
                    </div>
                  )}
                  {goalBfProgressPct != null && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: palette.border }}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-mono text-sm" style={{ color: palette.text }}>{goalCurrentBf}% body fat</span>
                        <span className="font-mono" style={{ color: palette.amber, fontSize: 12 }}>{goalBfProgressPct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: palette.panelAlt }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${goalBfProgressPct}%`, background: palette.amber, transition: "width 0.6s ease" }} />
                      </div>
                      <div className="font-mono mt-1" style={{ color: palette.textFaint, fontSize: 11 }}>
                        from {goalStartBf}% down to {targets.goalBodyFatPct}% · down {bfPtsLost} pts, {bfPtsToGo} pts to go
                      </div>
                    </div>
                  )}

                  {plateau && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: palette.rust }}>
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp size={14} style={{ color: palette.rust, transform: "scaleY(-1)" }} />
                        <span className="font-display uppercase" style={{ color: palette.textMuted, fontSize: 12, letterSpacing: "0.1em" }}>{plateau.reliable ? "Weight's been flat" : "Weight's flat — logging gaps"}</span>
                      </div>
                      <div className="font-mono" style={{ color: palette.textMuted, fontSize: 11, lineHeight: 1.5 }}>
                        {plateau.reliable
                          ? `Your 7-day average is ${plateau.change > 0 ? `up ${plateau.change}` : plateau.change === 0 ? "level" : `only ${Math.abs(plateau.change)} lbs down`}${plateau.change === 0 ? "" : plateau.change > 0 ? " lbs" : ""} on the week before, and the last two weeks were logged cleanly — a small cut of ~100–150 cal/day could be worth trying, per your plan doc.`
                          : `Your 7-day average is ${plateau.change > 0 ? `up ${plateau.change} lbs` : plateau.change === 0 ? "level" : `only ${Math.abs(plateau.change)} lbs down`} on the week before, but ${[plateau.unlogged ? `${plateau.unlogged} unlogged day${plateau.unlogged > 1 ? "s" : ""}` : null, plateau.over ? `${plateau.over} over-target day${plateau.over > 1 ? "s" : ""}` : null].filter(Boolean).join(" and ")} in the last 14 mean this probably isn't a target problem. Get a clean week or two logged before changing calories.`}
                      </div>
                    </div>
                  )}

                  {nextMilestone && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: palette.border }}>
                      <span className="font-display uppercase" style={{ color: palette.textMuted, fontSize: 12, letterSpacing: "0.1em" }}>Next milestone</span>
                      <div className="flex items-baseline justify-between mt-1 mb-1">
                        <span className="font-mono text-lg" style={{ color: palette.text }}>{nextMilestone.weight} lbs</span>
                        <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>
                          {Math.max(0, Math.round((currentTrackedWeight - nextMilestone.weight) * 10) / 10)} lbs to go
                        </span>
                      </div>
                      <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>
                        Projected: ~{nextMilestone.bodyFat}% body fat, ~{nextMilestone.waist}cm waist
                      </div>
                      {(goalCurrentBf != null || latestWaistEntry) && (
                        <div className="font-mono mt-1" style={{ color: palette.steel, fontSize: 11 }}>
                          Your latest: {goalCurrentBf != null ? `${goalCurrentBf}% BF` : ""}{goalCurrentBf != null && latestWaistEntry ? " · " : ""}{latestWaistEntry ? `${latestWaistEntry.waist}cm waist` : ""}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Panel>

            {/* Water / Steps — quick-added to whichever day is currently selected */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Panel>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Droplets size={13} style={{ color: palette.textMuted }} />
                    <span className="font-mono uppercase" style={{ color: palette.textFaint, fontSize: 9, letterSpacing: "0.06em" }}>Water</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => addWater(-250)} aria-label="Subtract 250ml water" disabled={!dayData.water}
                      className="rounded-full flex items-center justify-center"
                      style={{ width: 22, height: 22, background: palette.panelAlt, border: `1px solid ${palette.border}`, opacity: dayData.water ? 1 : 0.35 }}
                    >
                      <Minus size={12} style={{ color: palette.textMuted }} />
                    </button>
                    <button
                      onClick={() => addWater(250)} aria-label="Add 250ml water"
                      className="rounded-full flex items-center justify-center"
                      style={{ width: 22, height: 22, background: palette.panelAlt, border: `1px solid ${palette.border}` }}
                    >
                      <Plus size={12} style={{ color: palette.amber }} />
                    </button>
                  </div>
                </div>
                <div className="font-mono" style={{ color: palette.text, fontSize: 16, fontWeight: 600 }}>
                  {(dayData.water || 0).toLocaleString()}<span style={{ color: palette.textFaint, fontSize: 10, fontWeight: 400 }}>/{targets.water.toLocaleString()}ml</span>
                </div>
              </Panel>
              <Panel>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Footprints size={13} style={{ color: palette.textMuted }} />
                    <span className="font-mono uppercase" style={{ color: palette.textFaint, fontSize: 9, letterSpacing: "0.06em" }}>Steps</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => addSteps(-1000)} aria-label="Subtract 1000 steps" disabled={!dayData.steps}
                      className="rounded-full flex items-center justify-center"
                      style={{ width: 22, height: 22, background: palette.panelAlt, border: `1px solid ${palette.border}`, opacity: dayData.steps ? 1 : 0.35 }}
                    >
                      <Minus size={12} style={{ color: palette.textMuted }} />
                    </button>
                    <button
                      onClick={() => addSteps(1000)} aria-label="Add 1000 steps"
                      className="rounded-full flex items-center justify-center"
                      style={{ width: 22, height: 22, background: palette.panelAlt, border: `1px solid ${palette.border}` }}
                    >
                      <Plus size={12} style={{ color: palette.amber }} />
                    </button>
                  </div>
                </div>
                <div className="font-mono" style={{ color: palette.text, fontSize: 16, fontWeight: 600 }}>
                  {(dayData.steps || 0).toLocaleString()}<span style={{ color: palette.textFaint, fontSize: 10, fontWeight: 400 }}>/{targets.steps.toLocaleString()}</span>
                </div>
              </Panel>
            </div>

            {errorMsg && (
              <div className="text-center mb-2">
                <div className="font-mono" style={{ color: palette.alert, fontSize: 12 }}>{errorMsg}</div>
                {lastFailedSave && (
                  <button onClick={retryFailedSave} className="font-display uppercase mt-1" style={{ color: palette.amber, fontSize: 11, letterSpacing: "0.06em" }}>
                    Retry now
                  </button>
                )}
              </div>
            )}

            <div className="mt-3">
              <Button onClick={handleCopyDay} variant="ghost" size="sm" full>
                <span className="flex items-center justify-center gap-1"><Copy size={13} /> Copy my day for Claude</span>
              </Button>
            </div>
          </>
        )}
        </>
        )}

        {view === "book" && (
          <>
            {/* Compact date nav — logging always applies to whichever day is selected here */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => goToDate(addDays(dateStr, -1))} className="p-2 rounded-lg" style={{ border: `1px solid ${palette.border}` }}>
                <ChevronLeft size={16} style={{ color: palette.text }} />
              </button>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm" style={{ color: palette.text }}>{prettyDate(dateStr)}</span>
            {isFuture && <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ color: palette.steel, border: `1px solid ${palette.steel}` }}>Planned</span>}
                {!isToday && (
                  <button onClick={() => goToDate(todayStr())} className="font-display uppercase text-xs px-2 py-1 rounded" style={{ color: palette.amber, border: `1px solid ${palette.amber}` }}>
                    Today
                  </button>
                )}
              </div>
              <button onClick={() => !atMaxDate && goToDate(addDays(dateStr, 1))} disabled={atMaxDate} className="p-2 rounded-lg" style={{ border: `1px solid ${palette.border}`, opacity: atMaxDate ? 0.3 : 1 }}>
                <ChevronRight size={16} style={{ color: palette.text }} />
              </button>
            </div>

            {/* Save / Lock bar */}
            {!dayData.locked ? (
              <div className="flex gap-2 mb-4">
                <Button onClick={handleSave} variant="ghost" grow>Save</Button>
                <Button onClick={handleLock} variant="primary" grow>
                  <span className="flex items-center justify-center gap-1"><Lock size={14} /> Lock day</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-4 rounded-lg px-3 py-2" style={{ border: `1px solid ${palette.border}`, background: palette.panelAlt }}>
                <span className="font-mono flex items-center gap-1" style={{ color: palette.textMuted, fontSize: 12 }}>
                  <Lock size={13} /> Day locked
                </span>
                <button onClick={handleUnlock} className="font-display uppercase flex items-center gap-1" style={{ color: palette.amber, fontSize: 11, letterSpacing: "0.06em" }}>
                  <Unlock size={13} /> Unlock
                </button>
              </div>
            )}

            {dayLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} style={{ color: palette.amber }} /></div>
            ) : (
            <>
            <div style={{ pointerEvents: dayData.locked ? "none" : "auto", opacity: dayData.locked ? 0.6 : 1, transition: "opacity 0.3s ease" }}>
            {/* Log an item */}
            <Panel className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <Label>Today's Log</Label>
                <button onClick={() => setManualEntryOpen(!manualEntryOpen)} className="font-mono flex items-center gap-1" style={{ color: palette.amber, fontSize: 11 }}>
                  {manualEntryOpen ? "Hide manual entry" : "Log manually"}
                  <ChevronDown size={11} style={{ transform: manualEntryOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
                </button>
              </div>

              {manualEntryOpen && (
                <div className="mb-3 pb-3" style={{ borderBottom: `1px solid ${palette.border}` }}>
                  <div className="relative">
                    <input
                      type="text" placeholder="Food or meal — start typing to search saved recipes" value={foodForm.name}
                      onChange={(e) => { setFoodForm({ ...foodForm, name: e.target.value }); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      className="w-full rounded-lg px-2 py-2 text-sm mb-2 outline-none border"
                      style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
                    />
                    {showSuggestions && recipeMatches.length > 0 && (
                      <div className="absolute left-0 right-0 -mt-1 rounded-lg border overflow-hidden z-10" style={{ background: palette.panelAlt, borderColor: palette.border }}>
                        {recipeMatches.map((r) => (
                          <button
                            key={r.id} onMouseDown={(e) => { e.preventDefault(); selectRecipe(r); }}
                            className="w-full text-left px-3 py-2 flex items-center justify-between"
                            style={{ color: palette.text }}
                          >
                            <span className="text-sm truncate pr-2">{r.name}</span>
                            <span className="font-mono whitespace-nowrap" style={{ color: palette.textFaint, fontSize: 11 }}>{r.calories} cal</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    <NumInput value={foodForm.calories} onChange={(v) => setFoodForm({ ...foodForm, calories: v })} placeholder="cal" wide />
                    <NumInput value={foodForm.protein} onChange={(v) => setFoodForm({ ...foodForm, protein: v })} placeholder="P" wide />
                    <NumInput value={foodForm.carbs} onChange={(v) => setFoodForm({ ...foodForm, carbs: v })} placeholder="C" wide />
                    <NumInput value={foodForm.fat} onChange={(v) => setFoodForm({ ...foodForm, fat: v })} placeholder="F" wide />
                    <NumInput value={foodForm.fiber} onChange={(v) => setFoodForm({ ...foodForm, fiber: v })} placeholder="Fi" wide />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button onClick={addFood} grow>
                      <span className="flex items-center justify-center gap-1"><Plus size={14} /> Log item</span>
                    </Button>
                    {recipes.length > 0 && (
                      <button onClick={() => setShowRecipeManager(!showRecipeManager)} className="font-mono flex-shrink-0" style={{ color: palette.textFaint, fontSize: 11 }}>
                        {showRecipeManager ? "Hide" : `${recipes.length} saved`}
                      </button>
                    )}
                  </div>

                  {showRecipeManager && (
                    <div className="mt-3 space-y-1 max-h-40 overflow-y-auto rounded-lg p-2" style={{ background: palette.panelAlt }}>
                      {recipes.length === 0 ? (
                        <div className="text-center font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>No saved recipes yet.</div>
                      ) : recipes.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded px-2 py-1.5" style={{ background: palette.panel }}>
                          <div className="min-w-0 pr-2">
                            <div className="text-sm truncate" style={{ color: palette.text }}>{r.name}</div>
                            <div className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>{r.calories} cal · {r.protein}P {r.carbs}C {r.fat}F {r.fiber}Fi</div>
                          </div>
                          <button onClick={() => deleteRecipe(r.id)} aria-label="Delete recipe">
                            <X size={14} style={{ color: palette.textFaint }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {dayData.foods.length > 0 ? (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {dayData.foods.map((f) => {
                    const hasComponents = f.components && f.components.length > 0;
                    const isExpanded = expandedFoodId === f.id;
                    return (
                      <div key={f.id} className="rounded-lg overflow-hidden" style={{ background: palette.panelAlt }}>
                        <div className="flex items-center justify-between px-2 py-2">
                          <button
                            onClick={() => hasComponents && setExpandedFoodId(isExpanded ? null : f.id)}
                            className="min-w-0 pr-2 flex-1 flex items-center gap-1 text-left"
                          >
                            <div className="min-w-0">
                              <div className="text-sm truncate" style={{ color: palette.text }}>{f.name}</div>
                              <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>
                                {Math.round(f.calories)} cal · {Math.round(f.protein)}P {Math.round(f.carbs)}C {Math.round(f.fat)}F {Math.round(f.fiber)}Fi
                                {hasComponents && ` · ${f.components.length} ingredients`}
                              </div>
                            </div>
                            {hasComponents && (
                              <ChevronDown size={14} style={{ color: palette.textFaint, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease", flexShrink: 0 }} />
                            )}
                          </button>
                          <button onClick={() => openEditFood(f)} aria-label="Edit item" className="flex-shrink-0">
                            <Pencil size={14} style={{ color: palette.textFaint }} />
                          </button>
                          <button onClick={() => saveFoodAsRecipe(f)} aria-label="Save as recipe" className="flex-shrink-0 ml-2">
                            <BookmarkPlus size={15} style={{ color: palette.textFaint }} />
                          </button>
                          <button onClick={() => deleteFood(f.id)} aria-label="Remove item" className="flex-shrink-0 ml-2">
                            <X size={16} style={{ color: palette.textFaint }} />
                          </button>
                        </div>
                        {hasComponents && isExpanded && (
                          <div className="px-2 pb-2">
                            <div className="rounded-lg p-2 space-y-1" style={{ background: palette.panel }}>
                              {f.components.map((c) => (
                                <div key={c.id} className="flex items-center justify-between gap-2">
                                  <span className="text-xs truncate" style={{ color: palette.text }}>{c.name}</span>
                                  <span className="font-mono flex-shrink-0" style={{ color: palette.textFaint, fontSize: 10 }}>
                                    {Math.round(c.calories)} cal · {Math.round(c.protein)}P {Math.round(c.carbs)}C {Math.round(c.fat)}F
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center mt-3 font-mono" style={{ color: palette.textFaint, fontSize: 12 }}>
                  Nothing logged {isToday ? "yet today" : "this day"}.
                </div>
              )}
            </Panel>
            </div>
            <div className="mb-3">
              <Button onClick={handleCopyDay} variant="ghost" full>
                <span className="flex items-center justify-center gap-1"><Copy size={14} /> Copy day for Claude</span>
              </Button>
            </div>
            </>
            )}

            <div className="mt-2 pt-4 border-t" style={{ borderColor: palette.border }}>
              <Label>Recipe book</Label>
            </div>
            <input
              type="text" placeholder="Search recipes" value={recipeBookQuery}
              onChange={(e) => setRecipeBookQuery(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm mb-3 outline-none border"
              style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
            />
            <Button onClick={openNewRecipe} full>
              <span className="flex items-center justify-center gap-1"><Plus size={14} /> New recipe</span>
            </Button>

            {(() => {
              const filtered = recipes.filter((r) => r.name.toLowerCase().includes(recipeBookQuery.trim().toLowerCase()));
              if (filtered.length === 0) {
                return (
                  <div className="text-center font-mono py-8" style={{ color: palette.textFaint, fontSize: 12 }}>
                    {recipes.length === 0 ? "No recipes saved yet. Log a meal above and bookmark it, or add one here." : "No recipes match that search."}
                  </div>
                );
              }
              const sections = [...MEAL_TYPES, "Uncategorized"].map((mt) => {
                const group = filtered.filter((r) => (r.mealType || "Uncategorized") === mt);
                if (group.length === 0) return null;
                const isCollapsed = collapsedSections[mt] !== false;
                return (
                  <div key={mt} className="mt-5">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => setCollapsedSections({ ...collapsedSections, [mt]: !isCollapsed })}
                        className="flex-1 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-1">
                          <ChevronDown size={14} style={{ color: palette.textFaint, transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s ease" }} />
                          <Label>{mt}</Label>
                        </div>
                        <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>{group.length}</span>
                      </button>
                    </div>
                    {!isCollapsed && (
                    <div className="space-y-2">
                      {group.map((r) => (
                        <RecipeCard
                          key={r.id} recipe={r} expanded={expandedRecipeId === r.id}
                          onToggle={() => setExpandedRecipeId(expandedRecipeId === r.id ? null : r.id)}
                          onEdit={() => openEditRecipe(r)}
                          onDelete={() => deleteRecipe(r.id)}
                          onLog={(servings) => logRecipeToday(r, servings)}
                          locked={dayData.locked}
                        />
                      ))}
                    </div>
                    )}
                  </div>
                );
              });
              const usualsIdx = [...MEAL_TYPES, "Uncategorized"].indexOf("Usuals");
              const others = sections.filter((_, i) => i !== usualsIdx);
              const hasOthers = others.some((x) => x);
              return (
                <>
                  {sections[usualsIdx]}
                  {hasOthers && (
                    <div className="mt-5">
                      <Button onClick={toggleOthersHidden} variant="ghost" size="sm" full>
                        {othersHidden ? "Show all categories" : "Hide all categories"}
                      </Button>
                    </div>
                  )}
                  {!othersHidden && others}
                </>
              );
            })()}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: palette.border }} />

            {!AI_ENABLED ? (
            <Panel className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Scale size={14} style={{ color: palette.amber }} />
                <Label>Log today's weigh-in</Label>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[["weight", "Weight (lb)"], ["bodyFatPct", "Body fat %"], ["bmi", "BMI"]].map(([k, lbl]) => (
                  <div key={k}>
                    <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>{lbl}</div>
                    <NumInput value={scanForm[k]} onChange={(v) => setScanForm({ ...scanForm, [k]: v })} placeholder="—" wide />
                  </div>
                ))}
              </div>
              <Button onClick={logScanManual} full>Log weigh-in</Button>
            </Panel>
            ) : (
            <Panel className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} style={{ color: palette.amber }} />
                <Label>Log today's scan</Label>
              </div>
              <ChatThread messages={bcMessages} busy={bcBusy} emptyHint="Upload a photo of your smart scale readout to log it." />
              {bcPendingImage && (
                <div className="flex items-center gap-2 mb-2 rounded-lg p-2" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                  <img src={bcPendingImage.dataUrl} alt="Selected scan photo" className="rounded-md" style={{ height: 44, width: 44, objectFit: "cover" }} />
                  <span className="font-mono flex-1" style={{ color: palette.textMuted, fontSize: 11 }}>Photo attached</span>
                  <button onClick={() => setBcPendingImage(null)} aria-label="Remove photo">
                    <X size={14} style={{ color: palette.textFaint }} />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <label
                  aria-label="Attach scan photo"
                  className="rounded-lg px-3 flex items-center justify-center flex-shrink-0 cursor-pointer"
                  style={{ border: `1px solid ${palette.border}`, opacity: bcBusy ? 0.4 : 1, pointerEvents: bcBusy ? "none" : "auto" }}
                >
                  <input
                    type="file" accept="image/*" onChange={handleBcImageSelect}
                    disabled={bcBusy} className="hidden"
                  />
                  <Camera size={16} style={{ color: palette.textMuted }} />
                </label>
                <input
                  type="text" placeholder="Optional note..." value={bcNote}
                  onChange={(e) => setBcNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendBodyScan(); }}
                  disabled={bcBusy}
                  className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none border"
                  style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
                />
                <button
                  onClick={sendBodyScan} disabled={bcBusy || (!bcPendingImage && !bcNote.trim())} aria-label="Send"
                  className="rounded-lg px-3 flex items-center justify-center flex-shrink-0"
                  style={{ background: palette.amber, opacity: bcBusy || (!bcPendingImage && !bcNote.trim()) ? 0.4 : 1 }}
                >
                  <Send size={16} style={{ color: "#1B1815" }} />
                </button>
              </div>
              <div className="font-mono mt-2" style={{ color: palette.textFaint, fontSize: 10 }}>
                Reads weight, body fat, BMI, and the rest from the screenshot, and fills today's weight in automatically.
              </div>
            </Panel>
            )}

            <Panel className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Ruler size={14} style={{ color: palette.amber }} />
                <Label>Body measurements</Label>
              </div>
              <div className="font-mono mb-3" style={{ color: palette.textFaint, fontSize: 11 }}>
                Log whatever you've got — every couple weeks is plenty. Leave any field blank if you didn't measure it.
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {MEASURE_FIELDS.map(([key, lbl]) => (
                  <div key={key}>
                    <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>{lbl} (cm)</div>
                    <NumInput value={measureForm[key]} onChange={(v) => setMeasureForm({ ...measureForm, [key]: v })} placeholder="—" wide />
                    {key === "waist" && measureForm.waist !== "" && !isNaN(Number(measureForm.waist)) && (
                      <div className="font-mono mt-1" style={{ color: palette.textFaint, fontSize: 10 }}>{(Number(measureForm.waist) / 2.54).toFixed(1)}in</div>
                    )}
                  </div>
                ))}
              </div>
              <Button onClick={logMeasurements} full>
                <span className="flex items-center justify-center gap-1"><Plus size={14} /> Log measurements</span>
              </Button>
            </Panel>

          </>
        )}


        {view === "supps" && (() => {
          const ticked = suppTicks.date === todayStr() ? suppTicks.ids : [];
          const total = SUPPLEMENT_GROUPS.reduce((n, g) => n + g.items.filter((it) => !it.reminder).length, 0);
          return (
            <>
              <div className="flex items-center justify-between rounded-lg px-3 py-3 mb-3" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                <div className="font-mono" style={{ color: palette.textMuted, fontSize: 12 }}>
                  Today: <span style={{ color: palette.text }}>{prettyDate(todayStr())}</span> · {ticked.length}/{total} done
                </div>
                <button onClick={() => saveSuppTicks({ date: todayStr(), ids: [] })} className="font-display uppercase px-2 py-1 rounded" style={{ color: palette.amber, border: `1px solid ${palette.amber}`, fontSize: 11, letterSpacing: "0.04em" }}>
                  Clear ticks
                </button>
              </div>

              {SUPPLEMENT_GROUPS.map((g) => (
                <Panel key={g.key} className="mb-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <Label>{g.title}</Label>
                    <span className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>{g.note}</span>
                  </div>
                  <div className="space-y-1">
                    {g.items.map((it) => {
                      const done = ticked.includes(it.id);
                      if (it.reminder) {
                        return (
                          <div key={it.id} className="w-full flex items-center gap-3 rounded-lg px-1 py-2">
                            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24 }}>
                              <span className="rounded-full" style={{ width: 6, height: 6, background: palette.textFaint }} />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm" style={{ color: palette.text }}>{it.name}</span>
                              <span className="block font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>{it.detail}</span>
                            </span>
                            <span className="font-mono rounded-full px-2 py-0.5 flex-shrink-0" style={{ color: palette.steel, border: `1px solid ${palette.border}`, fontSize: 11 }}>{it.dose}</span>
                          </div>
                        );
                      }
                      return (
                        <button key={it.id} onClick={() => toggleSupp(it.id)} className="w-full flex items-center gap-3 rounded-lg px-1 py-2 text-left">
                          <span className="flex items-center justify-center rounded flex-shrink-0" style={{ width: 24, height: 24, border: `1px solid ${done ? palette.olive : palette.border}`, background: done ? palette.olive : "transparent" }}>
                            {done && <Check size={14} style={{ color: "#1B1815" }} />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm" style={{ color: done ? palette.textFaint : palette.text, textDecoration: done ? "line-through" : "none" }}>
                              {it.name}{it.asNeeded && <span className="font-mono ml-2" style={{ color: palette.amber, fontSize: 9 }}>AS NEEDED</span>}
                            </span>
                            {it.detail && <span className="block font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>{it.detail}</span>}
                          </span>
                          <span className="font-mono rounded-full px-2 py-0.5 flex-shrink-0" style={{ color: it.asNeeded ? palette.amber : palette.olive, border: `1px solid ${palette.border}`, fontSize: 11 }}>{it.dose}</span>
                        </button>
                      );
                    })}
                  </div>
                </Panel>
              ))}

              <Panel>
                <Label>Rules to remember</Label>
                <ul className="space-y-2">
                  {SUPPLEMENT_RULES.map((r) => (
                    <li key={r} className="flex gap-2 font-mono" style={{ color: palette.textMuted, fontSize: 11, lineHeight: 1.5 }}>
                      <span style={{ color: palette.olive }}>•</span><span>{r}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          );
        })()}

        {view === "progress" && (
          <>
            <div className="flex gap-1 mb-4">
              <Button onClick={() => setProgressSubView("body")} variant={progressSubView === "body" ? "primary" : "ghost"} size="sm" grow>Body</Button>
              <Button onClick={() => setProgressSubView("photos")} variant={progressSubView === "photos" ? "primary" : "ghost"} size="sm" grow>Photos</Button>
            </div>
            {progressSubView === "body" && (
            <>
            <div className="flex gap-1 mb-4">
              {[["7", "7D"], ["14", "14D"], ["30", "30D"], ["all", "All"]].map(([val, lbl]) => (
                <Button key={val} onClick={() => setStatsPeriod(val)} variant={statsPeriod === val ? "primary" : "ghost"} size="sm" grow>
                  {lbl}
                </Button>
              ))}
            </div>

            {statsRows.length === 0 ? (
              <Panel className="mb-3">
                <div className="text-center font-mono py-4" style={{ color: palette.textFaint, fontSize: 12 }}>
                  No logged days in this period yet.
                </div>
              </Panel>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Panel>
                    <Label>Avg calories</Label>
                    <div className="font-mono text-xl" style={{ color: palette.text }}>{stats.avgCalories.toLocaleString()}</div>
                    <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>target {targets.calories.toLocaleString()}</div>
                  </Panel>
                  <Panel>
                    <Label>Calorie adherence</Label>
                    <div className="font-mono text-xl" style={{ color: palette.text }}>{stats.calorieAdherencePct}%</div>
                    <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>within 10% of target</div>
                  </Panel>
                  <Panel>
                    <Label>Avg macros</Label>
                    <div className="font-mono text-sm" style={{ color: palette.text }}>{stats.avgProtein}P · {stats.avgCarbs}C · {stats.avgFat}F</div>
                    <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>{stats.avgFiber}g fiber avg</div>
                  </Panel>
                  <Panel>
                    <Label>Avg water / steps</Label>
                    <div className="font-mono text-sm" style={{ color: palette.text }}>{stats.avgWater.toLocaleString()}ml</div>
                    <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>{stats.avgSteps.toLocaleString()} steps</div>
                  </Panel>
                  <Panel>
                    <Label>Weight change</Label>
                    {stats.weightChange != null ? (
                      <>
                        <div className="font-mono text-xl" style={{ color: stats.weightChange <= 0 ? palette.olive : palette.rust }}>
                          {stats.weightChange > 0 ? "+" : ""}{stats.weightChange} lbs
                        </div>
                        <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>
                          {stats.weightPerWeek > 0 ? "+" : ""}{stats.weightPerWeek} lbs/wk
                        </div>
                      </>
                    ) : (
                      <div className="font-mono" style={{ color: palette.textFaint, fontSize: 12 }}>Not enough weigh-ins</div>
                    )}
                  </Panel>
                  <Panel>
                    <Label>Workout days</Label>
                    <div className="font-mono text-xl" style={{ color: palette.text }}>{stats.workoutDays}/{statsRows.length}</div>
                    <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>trained days in the {statsPeriod === "all" ? "all-time" : `${statsPeriod}D`} view above — not your weekly target</div>
                  </Panel>
                </div>

                <Panel className="mb-3">
                  <Label>Consistency</Label>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono" style={{ color: palette.textMuted, fontSize: 11 }}>Logging</span>
                    <span className="font-mono" style={{ color: palette.text, fontSize: 12 }}>{stats.n} / {stats.periodDays} days ({stats.consistencyPct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full mb-3" style={{ background: palette.panelAlt }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${stats.consistencyPct}%`, background: palette.amber, transition: "width 0.4s ease" }} />
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono" style={{ color: palette.textMuted, fontSize: 11 }}>Workouts this week</span>
                    <span className="font-mono" style={{ color: palette.text, fontSize: 12 }}>{weekWorkoutDates.size} / {weeklyWorkoutTarget}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: palette.panelAlt }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${weeklyWorkoutPct}%`, background: palette.olive, transition: "width 0.4s ease" }} />
                  </div>
                  <div className="font-mono mt-1" style={{ color: palette.textFaint, fontSize: 10 }}>Monday through today · any day with a logged exercise weight counts</div>
                </Panel>

                <Panel className="mb-3">
                  <Label>Calories · {calorieTrendData.length} days</Label>
                  <div style={{ height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={calorieTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={palette.border} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: palette.textFaint, fontSize: 10 }} axisLine={{ stroke: palette.border }} tickLine={false} />
                        <YAxis tick={{ fill: palette.textFaint, fontSize: 10 }} axisLine={false} tickLine={false} width={46} />
                        <Tooltip contentStyle={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: palette.text }} />
                        <ReferenceLine y={targets.calories} stroke={palette.amber} strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="calories" stroke={palette.amber} strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                {weightTrendData.length > 1 && (
                  <Panel className="mb-3">
                    <Label>Weight · {weightTrendData.length} logged days</Label>
                    <div style={{ height: 140 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weightTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={palette.border} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: palette.textFaint, fontSize: 10 }} axisLine={{ stroke: palette.border }} tickLine={false} />
                          <YAxis tick={{ fill: palette.textFaint, fontSize: 10 }} axisLine={false} tickLine={false} width={46} domain={["dataMin - 2", "dataMax + 2"]} />
                          <Tooltip contentStyle={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: palette.text }} />
                          <Line type="monotone" dataKey="weight" stroke={palette.olive} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                )}
              </>
            )}

            {bodyFatTrend.length > 1 && (
              <Panel className="mb-3">
                <Label>Body fat % · last {bodyFatTrend.length} scans</Label>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bodyFatTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={palette.border} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: palette.textFaint, fontSize: 10 }} axisLine={{ stroke: palette.border }} tickLine={false} />
                      <YAxis tick={{ fill: palette.textFaint, fontSize: 10 }} axisLine={false} tickLine={false} width={46} domain={["dataMin - 2", "dataMax + 2"]} />
                      <Tooltip contentStyle={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: palette.text }} />
                      <Line type="monotone" dataKey="bodyFatPct" stroke={palette.rust} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}

            {waistTrend.length > 1 && (
              <Panel className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <Label>Waist (cm) · last {waistTrend.length} logs</Label>
                  <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>
                    latest: {(waistTrend[waistTrend.length - 1].waist / 2.54).toFixed(1)}in
                  </span>
                </div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={waistTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={palette.border} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: palette.textFaint, fontSize: 10 }} axisLine={{ stroke: palette.border }} tickLine={false} />
                      <YAxis tick={{ fill: palette.textFaint, fontSize: 10 }} axisLine={false} tickLine={false} width={46} domain={["dataMin - 2", "dataMax + 2"]} />
                      <Tooltip contentStyle={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: palette.text }} />
                      <Line type="monotone" dataKey="waist" stroke={palette.steel} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}

            {AI_ENABLED && (
            <Panel className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} style={{ color: palette.amber }} />
                <Label>Ask about your data</Label>
              </div>
              <ChatThread messages={statsMessages} busy={statsBusy} emptyHint={`e.g. "how's my protein been this week?" — answers using the ${statsPeriod === "all" ? "all-time" : `${statsPeriod}-day`} view above`} />
              <div className="flex gap-2">
                <input
                  type="text" placeholder="Ask a question..." value={statsInput}
                  onChange={(e) => setStatsInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendStatsMessage(); }}
                  disabled={statsBusy}
                  className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none border"
                  style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
                />
                <button
                  onClick={sendStatsMessage} disabled={statsBusy || !statsInput.trim()} aria-label="Send"
                  className="rounded-lg px-3 flex items-center justify-center flex-shrink-0"
                  style={{ background: palette.amber, opacity: statsBusy || !statsInput.trim() ? 0.4 : 1 }}
                >
                  <Send size={16} style={{ color: "#1B1815" }} />
                </button>
              </div>
            </Panel>
            )}

            <Panel className="mb-3">
              <Label>Export data</Label>
              <div className="font-mono mb-3" style={{ color: palette.textFaint, fontSize: 11 }}>
                Copies the selected period — plain text for Claude, or CSV for Sheets/Excel.
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCopyExport} grow>
                  <span className="flex items-center justify-center gap-1"><Copy size={14} /> For Claude</span>
                </Button>
                <Button onClick={handleCopyCsv} variant="ghost" grow>
                  <span className="flex items-center justify-center gap-1"><Copy size={14} /> CSV</span>
                </Button>
              </div>
            </Panel>

            <Panel className="mb-3">
              <button onClick={() => setScanHistoryOpen(!scanHistoryOpen)} className="w-full flex items-center justify-between">
                <Label>Scan history</Label>
                <div className="flex items-center gap-2">
                  <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>{bodyComp.length}</span>
                  <ChevronDown size={14} style={{ color: palette.textFaint, transform: scanHistoryOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
                </div>
              </button>
              {scanHistoryOpen && (bodyComp.length === 0 ? (
                <div className="text-center font-mono py-4" style={{ color: palette.textFaint, fontSize: 12 }}>No scans logged yet.</div>
              ) : (
                <div className="space-y-1 mt-3 max-h-96 overflow-y-auto">
                  {[...bodyComp].reverse().map((e) => {
                    const isExpanded = expandedBcDate === e.date;
                    return (
                      <div key={e.date} className="rounded-lg overflow-hidden" style={{ background: palette.panelAlt }}>
                        <button onClick={() => setExpandedBcDate(isExpanded ? null : e.date)} className="w-full flex items-center justify-between px-3 py-2 text-left">
                          <div className="min-w-0 pr-2">
                            <div className="text-sm" style={{ color: palette.text }}>{shortDate(e.date)}</div>
                            <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>
                              {e.weight != null ? `${e.weight} lbs` : "—"}
                              {e.bodyFatPct != null ? ` · ${e.bodyFatPct}% BF` : ""}
                              {e.bmi != null ? ` · BMI ${e.bmi}` : ""}
                            </div>
                          </div>
                          <ChevronDown size={16} style={{ color: palette.textFaint, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease", flexShrink: 0 }} />
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 grid grid-cols-2 gap-x-3 gap-y-1">
                            {BC_FIELDS.map(([key, lbl, unit]) => e[key] != null && (
                              <div key={key} className="font-mono" style={{ color: palette.textMuted, fontSize: 11 }}>
                                {lbl}: <span style={{ color: palette.text }}>{e[key]}{unit}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </Panel>

            <Panel>
              <button onClick={() => setMeasureHistoryOpen(!measureHistoryOpen)} className="w-full flex items-center justify-between">
                <Label>Measurement history</Label>
                <div className="flex items-center gap-2">
                  <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>{measurements.length}</span>
                  <ChevronDown size={14} style={{ color: palette.textFaint, transform: measureHistoryOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
                </div>
              </button>
              {measureHistoryOpen && (measurements.length === 0 ? (
                <div className="text-center font-mono py-4" style={{ color: palette.textFaint, fontSize: 12 }}>No measurements logged yet.</div>
              ) : (
                <div className="space-y-1 mt-3 max-h-72 overflow-y-auto">
                  {[...measurements].reverse().map((e) => (
                    <div key={e.date} className="rounded-lg px-3 py-2" style={{ background: palette.panelAlt }}>
                      <div className="text-sm mb-1" style={{ color: palette.text }}>{shortDate(e.date)}</div>
                      <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>
                        {MEASURE_FIELDS.map(([key, lbl]) => e[key] != null ? `${lbl} ${e[key]}cm${key === "waist" ? ` (${(e[key] / 2.54).toFixed(1)}in)` : ""}` : null).filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </Panel>
          </>
            )}

            {progressSubView === "photos" && (
            <>
            <Panel className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Images size={14} style={{ color: palette.amber }} />
                <Label>Add a progress photo</Label>
              </div>
              <div className="flex gap-1 mb-3">
                {PHOTO_ANGLES.map((a) => (
                  <button
                    key={a} onClick={() => setUploadAngle(a)}
                    className="flex-1 font-display uppercase rounded-lg py-2"
                    style={{
                      fontSize: 11, letterSpacing: "0.03em",
                      background: uploadAngle === a ? palette.amber : "transparent",
                      color: uploadAngle === a ? "#1B1815" : palette.textMuted,
                      border: `1px solid ${uploadAngle === a ? palette.amber : palette.border}`,
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div className="mb-3">
                <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Date taken</div>
                <input
                  type="date" value={uploadDate} max={todayStr()}
                  onChange={(e) => setUploadDate(e.target.value)}
                  className="rounded-lg px-2 py-2 text-sm outline-none border"
                  style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
                />
              </div>
              {pendingPhoto && (
                <div className="flex items-center gap-2 mb-3 rounded-lg p-2" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                  <img src={pendingPhoto.dataUrl} alt="Selected progress photo" className="rounded-md" style={{ height: 56, width: 44, objectFit: "cover" }} />
                  <span className="font-mono flex-1" style={{ color: palette.textMuted, fontSize: 11 }}>Ready to save as {uploadAngle}, {shortDate(uploadDate)}</span>
                  <button onClick={() => setPendingPhoto(null)} aria-label="Remove photo">
                    <X size={14} style={{ color: palette.textFaint }} />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <label
                  aria-label="Choose photo"
                  className="flex-1 rounded-lg px-3 py-2 flex items-center justify-center gap-1 cursor-pointer font-display uppercase"
                  style={{ fontSize: 11, letterSpacing: "0.04em", border: `1px solid ${palette.border}`, color: palette.textMuted, opacity: photoUploadBusy ? 0.4 : 1 }}
                >
                  <input type="file" accept="image/*" onChange={handlePhotoSelect} disabled={photoUploadBusy} className="hidden" />
                  <Camera size={14} /> Choose photo
                </label>
                <Button onClick={savePhoto} disabled={!pendingPhoto || photoUploadBusy} grow>
                  {photoUploadBusy ? "Saving..." : "Save"}
                </Button>
              </div>
              <div className="font-mono mt-2" style={{ color: palette.textFaint, fontSize: 10 }}>
                Photos are resized before saving to keep storage light. Dated to today automatically.
              </div>
            </Panel>

            <Panel>
              <div className="flex gap-1 mb-3">
                {PHOTO_ANGLES.map((a) => (
                  <button
                    key={a} onClick={() => setPhotoAngleView(a)}
                    className="flex-1 font-display uppercase rounded-lg py-2"
                    style={{
                      fontSize: 11, letterSpacing: "0.03em",
                      background: photoAngleView === a ? palette.amber : "transparent",
                      color: photoAngleView === a ? "#1B1815" : palette.textMuted,
                      border: `1px solid ${photoAngleView === a ? palette.amber : palette.border}`,
                    }}
                  >
                    {a} ({photoIndex.filter((p) => p.angle === a).length})
                  </button>
                ))}
              </div>
              <AngleCarousel
                angle={photoAngleView}
                photos={photoIndex.filter((p) => p.angle === photoAngleView)}
                photoCache={photoCache}
                loading={photoLoadBusy}
                onDelete={deletePhoto}
                onEditDate={editPhotoDate}
                history={history}
                bodyComp={bodyComp}
              />
            </Panel>
          </>
            )}
          </>
        )}

        {view === "workout" && (() => {
          const day = WORKOUT_DAYS.find((d) => d.key === workoutDayView) || WORKOUT_DAYS[0];
          const byDate = {};
          exerciseLog.forEach((l) => { (byDate[l.date] = byDate[l.date] || []).push(l); });
          const dates = Object.keys(byDate).sort().reverse();

          if (sessionActive) {
            const step = sessionQueue[sessionIndex];
            const totalSteps = sessionQueue.length;
            return (
              <Panel>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono" style={{ color: palette.textFaint, fontSize: 11 }}>Step {sessionIndex + 1} of {totalSteps}</span>
                  <button onClick={endSession} className="font-display uppercase" style={{ color: palette.textFaint, fontSize: 11, letterSpacing: "0.04em" }}>End session</button>
                </div>

                {sessionPhase === "complete" ? (
                  <div className="py-4">
                    <div className="text-center mb-4">
                      <div className="font-display uppercase mb-1" style={{ color: palette.amber, fontSize: 18, letterSpacing: "0.04em" }}>Workout complete</div>
                      <div className="font-mono" style={{ color: palette.textMuted, fontSize: 12 }}>{totalSteps} sets logged. Nice work.</div>
                    </div>
                    {Object.keys(debriefAnswers).length > 0 && (
                      <div className="space-y-2 mb-4">
                        {[...new Map(sessionQueue.map((s) => [s.ex.name, s.ex])).values()].map((ex) => {
                          const rec = computeRecommendation(ex.name, ex);
                          const decision = weightDecisions[ex.name];
                          return (
                            <div key={ex.name} className="rounded-lg p-2" style={{ background: palette.panelAlt }}>
                              <div className="text-sm mb-0.5" style={{ color: palette.text }}>{ex.name}</div>
                              <div className="font-mono mb-1.5" style={{ fontSize: 11, color: rec.tone === "warn" ? palette.alert : rec.tone === "up" ? palette.olive : palette.textMuted }}>{rec.text}</div>
                              {rec.weight != null && (
                                decision ? (
                                  <div className="font-mono" style={{ fontSize: 10, color: palette.textFaint }}>
                                    {decision === "accepted" ? `✓ Will start at ${rec.weight}lb next time` : "Noted — you'll decide fresh next time"}
                                  </div>
                                ) : (
                                  <div className="flex gap-2">
                                    <Button onClick={() => acceptRecommendation(ex.name, rec.weight)} size="sm" grow>Accept</Button>
                                    <Button onClick={() => declineRecommendation(ex.name)} variant="ghost" size="sm" grow>Decline</Button>
                                  </div>
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button onClick={endSession} full>Done</Button>
                  </div>
                ) : sessionPhase === "debrief" ? (
                  <div>
                    <div className="text-center mb-4">
                      <div className="font-display uppercase" style={{ color: palette.amber, fontSize: 15, letterSpacing: "0.04em" }}>Quick check-in</div>
                      <div className="font-mono mt-1" style={{ color: palette.textFaint, fontSize: 11 }}>How did each one feel? Optional, ~15 seconds.</div>
                    </div>
                    <div className="space-y-2 mb-4">
                      {Object.keys(debriefAnswers).map((name) => {
                        const answer = debriefAnswers[name] || { feedback: null, discomfort: false };
                        return (
                          <div key={name} className="rounded-lg p-2" style={{ background: palette.panelAlt }}>
                            <div className="text-sm mb-1.5" style={{ color: palette.text }}>{name}</div>
                            <div className="flex gap-1 mb-1.5">
                              {[["easy", "Too easy"], ["ok", "Just right"], ["hard", "Too hard"]].map(([val, lbl]) => (
                                <button
                                  key={val} onClick={() => setDebriefAnswer(name, "feedback", val)}
                                  className="flex-1 rounded-lg py-1.5 font-mono"
                                  style={{
                                    fontSize: 10,
                                    background: answer.feedback === val ? palette.amber : "transparent",
                                    color: answer.feedback === val ? "#1B1815" : palette.textMuted,
                                    border: `1px solid ${answer.feedback === val ? palette.amber : palette.border}`,
                                  }}
                                >{lbl}</button>
                              ))}
                            </div>
                            <label className="flex items-center gap-1.5" style={{ fontSize: 10, color: palette.textFaint }}>
                              <input type="checkbox" checked={answer.discomfort} onChange={(e) => setDebriefAnswer(name, "discomfort", e.target.checked)} />
                              Felt discomfort or pain
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={skipDebrief} variant="ghost" grow>Skip</Button>
                      <Button onClick={finishDebrief} grow>Get recommendations</Button>
                    </div>
                  </div>
                ) : sessionPhase === "resting" ? (
                  (() => {
                    const nextStep = sessionQueue[nextIndexRef.current];
                    const nextWeight = nextStep ? suggestedWeight(nextStep.ex) : null;
                    const nextIsBodyweight = nextStep && nextStep.ex.startWeight === "bodyweight";
                    const nextRange = nextStep ? parseRepRange(nextStep.ex.sets) : null;
                    return (
                      <div className="text-center py-6">
                        <div className="font-mono" style={{ color: palette.textFaint, fontSize: 11, marginBottom: 8 }}>RESTING</div>
                        <div className="font-mono font-bold" style={{ color: palette.amber, fontSize: 56, lineHeight: 1 }}>{restRemaining}</div>
                        <div className="font-mono mt-1 mb-5" style={{ color: palette.textFaint, fontSize: 11 }}>seconds</div>
                        {nextStep && (
                          <div className="rounded-lg p-3 mb-5 flex items-center gap-3" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                            <div className="rounded-lg overflow-hidden flex-shrink-0" style={{ width: 56, height: 56, background: palette.panel }}>
                              <ExerciseIcon icon={nextStep.ex.icon} frame={WORKOUT_POSES[nextStep.ex.icon] && WORKOUT_POSES[nextStep.ex.icon].hold ? "hold" : "end"} />
                            </div>
                            <div className="text-left min-w-0">
                              <div className="font-mono uppercase" style={{ color: palette.textFaint, fontSize: 10, letterSpacing: "0.06em" }}>Next up</div>
                              <div className="text-sm font-semibold truncate" style={{ color: palette.text }}>{nextStep.ex.name}</div>
                              <div className="font-mono" style={{ color: palette.amber, fontSize: 13 }}>
                                {nextIsBodyweight ? "Bodyweight" : nextWeight != null ? `${nextWeight}lb` : "First time — pick a weight"}
                                {nextRange ? ` · ${nextRange.hi} reps` : ""}
                              </div>
                              <div className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>Set {nextStep.setNumber} of {nextStep.totalSets}{nextStep.ex.per ? ` ${nextStep.ex.per}` : ""}</div>
                            </div>
                          </div>
                        )}
                        <Button onClick={skipRest} variant="ghost" full>Skip rest</Button>
                      </div>
                    );
                  })()
                ) : step && (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <div className="rounded-lg overflow-hidden" style={{ width: 90, height: 90, background: palette.panelAlt, flexShrink: 0 }}>
                        <ExerciseIcon icon={step.ex.icon} frame={WORKOUT_POSES[step.ex.icon] && WORKOUT_POSES[step.ex.icon].hold ? "hold" : "end"} />
                      </div>
                    </div>
                    <div className="text-center mb-1">
                      <div className="text-lg font-semibold" style={{ color: palette.text }}>{step.ex.name}</div>
                      <div className="font-mono" style={{ color: palette.amber, fontSize: 13 }}>Set {step.setNumber} of {step.totalSets}{step.ex.per ? ` ${step.ex.per}` : ""}</div>
                      <div className="font-mono mt-1" style={{ color: palette.textFaint, fontSize: 11 }}>{step.ex.cue}</div>
                    </div>

                    {step.ex.startWeight !== "bodyweight" && (
                      <div className="flex items-center justify-center gap-3 mt-4 mb-3">
                        <button onClick={() => adjustSessionWeight(-2.5)} className="rounded-full flex items-center justify-center" style={{ width: 36, height: 36, background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                          <Minus size={16} style={{ color: palette.textMuted }} />
                        </button>
                        <div className="text-center" style={{ minWidth: 76 }}>
                          <input
                            type="number" inputMode="decimal" value={sessionWeight} onChange={(e) => setSessionWeight(e.target.value)}
                            className="font-mono font-bold text-center rounded-lg"
                            style={{ width: 76, fontSize: 26, background: "transparent", border: "none", color: palette.text, outline: "none" }}
                          />
                          <div className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>lb</div>
                        </div>
                        <button onClick={() => adjustSessionWeight(2.5)} className="rounded-full flex items-center justify-center" style={{ width: 36, height: 36, background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                          <Plus size={16} style={{ color: palette.amber }} />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-3 mb-5">
                      <button onClick={() => adjustSessionReps(-1)} className="rounded-full flex items-center justify-center" style={{ width: 36, height: 36, background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                        <Minus size={16} style={{ color: palette.textMuted }} />
                      </button>
                      <div className="text-center" style={{ minWidth: 76 }}>
                        <input
                          type="number" inputMode="numeric" value={sessionReps} onChange={(e) => setSessionReps(e.target.value)}
                          className="font-mono font-bold text-center"
                          style={{ width: 76, fontSize: 26, background: "transparent", border: "none", color: palette.text, outline: "none" }}
                        />
                        <div className="font-mono" style={{ color: palette.textFaint, fontSize: 10 }}>reps</div>
                      </div>
                      <button onClick={() => adjustSessionReps(1)} className="rounded-full flex items-center justify-center" style={{ width: 36, height: 36, background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                        <Plus size={16} style={{ color: palette.amber }} />
                      </button>
                    </div>

                    <Button onClick={logSessionSet} full>Log &amp; next</Button>
                  </div>
                )}
              </Panel>
            );
          }

          return (
            <>
              <div className="flex gap-1 mb-3">
                <Button onClick={() => setWorkoutSubView("log")} variant={workoutSubView === "log" ? "primary" : "ghost"} size="sm" grow>Log</Button>
                <Button onClick={() => setWorkoutSubView("history")} variant={workoutSubView === "history" ? "primary" : "ghost"} size="sm" grow>History</Button>
              </div>

              {workoutSubView === "log" ? (
                <>
                  <div className="flex gap-1 mb-4 flex-wrap">
                    {WORKOUT_DAYS.map((d) => (
                      <button
                        key={d.key} onClick={() => setWorkoutDayView(d.key)}
                        className="rounded-lg px-2 py-1.5 font-display uppercase"
                        style={{
                          fontSize: 10, letterSpacing: "0.03em", minWidth: 54,
                          background: workoutDayView === d.key ? palette.amber : "transparent",
                          color: workoutDayView === d.key ? "#1B1815" : palette.textMuted,
                          border: `1px solid ${workoutDayView === d.key ? palette.amber : palette.border}`,
                        }}
                      >
                        {d.label}<br />{d.sub}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 mb-2">
                    <Button onClick={() => setSessionMode("circuit")} variant={sessionMode === "circuit" ? "primary" : "ghost"} size="sm" grow>Circuit</Button>
                    <Button onClick={() => setSessionMode("straight")} variant={sessionMode === "straight" ? "primary" : "ghost"} size="sm" grow>Straight sets</Button>
                  </div>
                  <div className="font-mono mb-3" style={{ color: palette.textFaint, fontSize: 10 }}>
                    {sessionMode === "circuit"
                      ? "One set of each exercise, then repeat the round — keeps you moving, less dedicated rest."
                      : "All sets of one exercise before moving to the next — full rest between sets, cleanest for progression tracking."}
                    {sessionMode === DAY_DEFAULT_MODE[workoutDayView] ? " Recommended default for this day." : " Overriding this day's default just for now."}
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <Button onClick={() => startSession(day)} full>
                      <span className="flex items-center justify-center gap-1"><Play size={14} /> Start workout</span>
                    </Button>
                    <button
                      onClick={() => setVoiceEnabled(!voiceEnabled)} aria-label="Toggle voice guidance"
                      className="rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ width: 40, height: 40, background: voiceEnabled ? palette.amber : palette.panelAlt, border: `1px solid ${voiceEnabled ? palette.amber : palette.border}` }}
                    >
                      {voiceEnabled ? <Volume2 size={16} style={{ color: "#1B1815" }} /> : <VolumeX size={16} style={{ color: palette.textFaint }} />}
                    </button>
                  </div>
                  {day.exercises.map((ex) => (
                    <ExerciseLogCard key={ex.name} ex={ex} dayKey={day.key} lastLog={lastLogForExercise(ex.name, parseSetsCount(ex.sets))} onLog={logExerciseWeight} onMarkDone={markTrainedToday} />
                  ))}
                  <div className="font-mono mt-2 mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>
                    Full two-frame form diagrams and detailed coaching cues live in your Workout Guide — this tab is for quick logging.
                  </div>
                </>
              ) : (
                <Panel>
                  <Label>Workout history</Label>
                  {dates.length === 0 ? (
                    <div className="text-center font-mono py-8" style={{ color: palette.textFaint, fontSize: 12 }}>No workouts logged yet.</div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {dates.map((ds) => (
                        <div key={ds} className="rounded-lg p-3" style={{ background: palette.panelAlt }}>
                          <div className="text-sm mb-1" style={{ color: palette.text }}>{prettyDate(ds)}</div>
                          {byDate[ds].map((l) => (
                            <div key={l.id} className="flex items-center justify-between font-mono" style={{ fontSize: 11, color: palette.textMuted, padding: "2px 0" }}>
                              <span>{l.exercise}</span>
                              <span style={{ color: palette.text }}>{l.weight} lb{l.reps != null ? ` × ${l.reps}` : ""}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              )}
            </>
          );
        })()}
      </div>

      {AI_ENABLED && (<>
      {/* Floating quick-log — reachable from every tab */}
      {!quickLogOpen && (
        <button
          onClick={openQuickLog}
          aria-label="Log what you ate"
          className="fixed rounded-full flex items-center justify-center"
          style={{
            bottom: 22, right: 18, width: 56, height: 56, background: palette.amber, border: "none",
            boxShadow: "0 6px 20px rgba(224,168,62,0.45)", zIndex: 40,
          }}
        >
          <Sparkles size={22} style={{ color: "#1B1815" }} />
        </button>
      )}

      {quickLogOpen && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ background: "rgba(10,9,8,0.65)", zIndex: 50 }}
          onClick={() => setQuickLogOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl p-4"
            style={{ background: palette.panel, maxWidth: 600, borderTop: `1px solid ${palette.borderSoft}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} style={{ color: palette.amber }} />
                <span className="font-display uppercase" style={{ fontSize: 13, letterSpacing: "0.06em", color: palette.text }}>Tell me what you had</span>
              </div>
              <button onClick={() => setQuickLogOpen(false)} aria-label="Close">
                <X size={18} style={{ color: palette.textFaint }} />
              </button>
            </div>
            {renderQuickLogBody()}
          </div>
        </div>
      )}
      </>)}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full font-mono text-xs flex items-center gap-3" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, color: palette.text }}>
          <span>{toast}</span>
          {undoAction && (
            <button onClick={undoAction} className="font-display uppercase" style={{ color: palette.amber, letterSpacing: "0.04em" }}>
              Undo
            </button>
          )}
        </div>
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-2xl border p-5" style={{ background: palette.panel, borderColor: palette.border }}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-display uppercase" style={{ color: palette.text, fontSize: 16, letterSpacing: "0.06em" }}>Targets</div>
              <button onClick={() => setSettingsOpen(false)} aria-label="Close"><X size={18} style={{ color: palette.textMuted }} /></button>
            </div>
            <div className="space-y-3">
              {[
                ["calories", "Calories"], ["protein", "Protein (g)"], ["carbs", "Carbs (g)"],
                ["fat", "Fat (g)"], ["fiber", "Fiber (g)"], ["water", "Water (ml)"], ["steps", "Steps"],
              ].map(([key, lbl]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm" style={{ color: palette.textMuted }}>{lbl}</span>
                  <NumInput value={targetForm[key]} onChange={(v) => setTargetForm({ ...targetForm, [key]: v })} placeholder={String(DEFAULT_TARGETS[key])} />
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t" style={{ borderColor: palette.border }}>
              <Label>Goal</Label>
              <div className="space-y-3">
                {[
                  ["startWeight", "Starting weight (lbs)"], ["startBodyFatPct", "Starting body fat (%)"], ["goalWeight", "Goal weight (lbs)"], ["goalBodyFatPct", "Goal body fat (%)"],
                ].map(([key, lbl]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: palette.textMuted }}>{lbl}</span>
                    <NumInput value={targetForm[key]} onChange={(v) => setTargetForm({ ...targetForm, [key]: v })} placeholder={String(DEFAULT_TARGETS[key])} />
                  </div>
                ))}
              </div>
              <div className="font-mono mt-2" style={{ color: palette.textFaint, fontSize: 11 }}>
                Drives the progress bar on the Console tab. Defaults match the athletic-build target from your plan.
              </div>
            </div>
            <div className="font-mono mt-3" style={{ color: palette.textFaint, fontSize: 11 }}>
              Defaults calculated via Mifflin-St Jeor for your stats, lightly active, ~15% deficit for recomposition. Adjust anytime.
            </div>
            <div className="mt-5">
              <Button onClick={saveTargets} full>Save targets</Button>
            </div>
            <div className="mt-5 pt-3 border-t" style={{ borderColor: palette.border }}>
              <div className="flex items-center gap-2 mb-2">
                <Upload size={14} style={{ color: palette.textMuted }} />
                <Label>Backup &amp; restore</Label>
              </div>
              <div className="font-mono mb-2" style={{ color: palette.textFaint, fontSize: 11 }}>
                Copies everything — targets, recipes, history, body scans, and today's log — as text. Paste it into your notes app so it survives closing the console, even while saving to storage is unreliable.
              </div>
              <Button onClick={handleCopyBackup} variant="ghost" full>
                <span className="flex items-center justify-center gap-1"><Copy size={14} /> Copy full backup</span>
              </Button>
              <div className="font-mono mt-3 mb-2" style={{ color: palette.textFaint, fontSize: 11 }}>
                Paste a backup below to bring it back into this session. Restores into the app immediately regardless of whether storage saving is currently working — you may need to do this again next time you reopen the console until the storage bug is fixed.
              </div>
              <textarea
                value={importText} onChange={(e) => setImportText(e.target.value)}
                placeholder='Paste a backup, or an import block from Claude'
                rows={4}
                className="w-full rounded-lg px-2 py-2 text-xs font-mono outline-none border mb-2"
                style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text, resize: "vertical" }}
              />
              {importError && <div className="font-mono mb-2" style={{ color: palette.alert, fontSize: 11 }}>{importError}</div>}
              <Button onClick={handleImport} variant="ghost" full disabled={importBusy || !importText.trim()}>
                {importBusy ? "Restoring..." : "Restore"}
              </Button>
            </div>
            <div className="mt-5 pt-3 border-t" style={{ borderColor: palette.border }}>
              <Label>Recover missing history</Label>
              <div className="font-mono mb-2" style={{ color: palette.textFaint, fontSize: 11 }}>
                If your calorie/weight graphs or streak ever look wrong, this rescans your daily logs (going back ~260 days) for any day missing from the history cache and adds it back. It only ever adds — it will never remove or overwrite a day that's already recorded.
              </div>
              <Button onClick={rebuildHistoryFromDailyLogs} variant="ghost" full>Recover missing days</Button>
            </div>
            <div className="mt-3 pt-3 border-t" style={{ borderColor: palette.border }}>
              {!confirmClear ? (
                <Button onClick={() => setConfirmClear(true)} variant="danger" full>Clear all data</Button>
              ) : (
                <div className="space-y-2">
                  <div className="font-mono text-center" style={{ color: palette.alert, fontSize: 12 }}>This can't be undone. Are you sure?</div>
                  <div className="flex gap-2">
                    <Button onClick={() => setConfirmClear(false)} variant="ghost" full>Cancel</Button>
                    <Button onClick={clearAllData} variant="danger" full>Confirm</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit food modal */}
      {editFoodId && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-2xl border p-5" style={{ background: palette.panel, borderColor: palette.border }}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-display uppercase" style={{ color: palette.text, fontSize: 16, letterSpacing: "0.06em" }}>Edit item</div>
              <button onClick={() => setEditFoodId(null)} aria-label="Close"><X size={18} style={{ color: palette.textMuted }} /></button>
            </div>
            <input
              type="text" placeholder="Name" value={editFoodForm.name}
              onChange={(e) => setEditFoodForm({ ...editFoodForm, name: e.target.value })}
              className="w-full rounded-lg px-2 py-2 text-sm mb-3 outline-none border"
              style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
            />
            <div className="grid grid-cols-5 gap-1 mb-4">
              <NumInput value={editFoodForm.calories} onChange={(v) => setEditFoodForm({ ...editFoodForm, calories: v })} placeholder="cal" wide />
              <NumInput value={editFoodForm.protein} onChange={(v) => setEditFoodForm({ ...editFoodForm, protein: v })} placeholder="P" wide />
              <NumInput value={editFoodForm.carbs} onChange={(v) => setEditFoodForm({ ...editFoodForm, carbs: v })} placeholder="C" wide />
              <NumInput value={editFoodForm.fat} onChange={(v) => setEditFoodForm({ ...editFoodForm, fat: v })} placeholder="F" wide />
              <NumInput value={editFoodForm.fiber} onChange={(v) => setEditFoodForm({ ...editFoodForm, fiber: v })} placeholder="Fi" wide />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setEditFoodId(null)} variant="ghost" grow>Cancel</Button>
              <Button onClick={saveEditFood} grow>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Clipboard fallback modal */}
      {copyModalText && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-2xl border p-5" style={{ background: palette.panel, borderColor: palette.border }}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-display uppercase" style={{ color: palette.text, fontSize: 16, letterSpacing: "0.06em" }}>Copy manually</div>
              <button onClick={() => setCopyModalText(null)} aria-label="Close"><X size={18} style={{ color: palette.textMuted }} /></button>
            </div>
            <div className="font-mono mb-3" style={{ color: palette.textFaint, fontSize: 11 }}>
              Clipboard access isn't available here — tap the text below, select all, and copy manually.
            </div>
            <textarea
              readOnly value={copyModalText}
              onFocus={(e) => e.target.select()}
              rows={10}
              className="w-full rounded-lg px-2 py-2 text-xs font-mono outline-none border"
              style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
            />
            <div className="mt-4">
              <Button onClick={() => setCopyModalText(null)} full>Done</Button>
            </div>
          </div>
        </div>
      )}

      {/* Recipe form modal */}
      {recipeModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.7)", WebkitOverflowScrolling: "touch" }}
          onClick={() => setRecipeModalOpen(false)}
        >
          <div className="min-h-full flex items-start justify-center p-4" style={{ paddingTop: 40, paddingBottom: 40 }}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border p-5"
            style={{ background: palette.panel, borderColor: palette.border }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-display uppercase" style={{ color: palette.text, fontSize: 16, letterSpacing: "0.06em" }}>
                {recipeForm.id ? "Edit recipe" : "New recipe"}
              </div>
              <button onClick={() => setRecipeModalOpen(false)} aria-label="Close"><X size={18} style={{ color: palette.textMuted }} /></button>
            </div>

            <input
              type="text" placeholder="Recipe name" value={recipeForm.name}
              onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
              className="w-full rounded-lg px-2 py-2 text-sm mb-3 outline-none border"
              style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text }}
            />

            <Label>Meal</Label>
            <div className="flex gap-1 mb-4 flex-wrap">
              {["Uncategorized", ...MEAL_TYPES].map((mt) => (
                <button
                  key={mt} onClick={() => setRecipeForm({ ...recipeForm, mealType: mt })}
                  className="font-display uppercase rounded-lg px-2 py-1.5"
                  style={{
                    fontSize: 10, letterSpacing: "0.03em",
                    background: recipeForm.mealType === mt ? palette.amber : "transparent",
                    color: recipeForm.mealType === mt ? "#1B1815" : palette.textMuted,
                    border: `1px solid ${recipeForm.mealType === mt ? palette.amber : palette.border}`,
                  }}
                >
                  {mt}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm" style={{ color: palette.textMuted }}>Servings</span>
              <NumInput value={recipeForm.servings} onChange={(v) => setRecipeForm({ ...recipeForm, servings: v })} placeholder="1" />
            </div>

            <Label>Ingredients</Label>
            <div className="font-mono mb-2" style={{ color: palette.textFaint, fontSize: 10 }}>
              Optional per ingredient: fill in "Per" (e.g. per 100g, or per 1 tin) with its macros, and "Used" with how much went in the dish. Tap Calculate below to work out the total automatically — no manual math needed.
            </div>
            {recipeForm.ingredients.map((ing) => (
              <div key={ing.id} className="rounded-lg p-2 mb-2" style={{ background: palette.panelAlt, border: `1px solid ${palette.border}` }}>
                <div className="flex gap-1 mb-2 items-center">
                  <input
                    type="text" value={ing.name} placeholder="Ingredient name"
                    onChange={(e) => updateIngredient(ing.id, { name: e.target.value })}
                    className="flex-1 min-w-0 rounded-lg px-2 py-2 text-sm outline-none border"
                    style={{ background: palette.panel, borderColor: palette.border, color: palette.text }}
                  />
                  <button onClick={() => removeIngredientRow(ing.id)} aria-label="Remove ingredient">
                    <X size={14} style={{ color: palette.textFaint }} />
                  </button>
                </div>
                <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Per (e.g. 100g, or 1 tin) — macros for that amount</div>
                <div className="flex gap-1 mb-1">
                  <input
                    type="text" inputMode="decimal" value={ing.basisAmount} placeholder="amt"
                    onChange={(e) => updateIngredient(ing.id, { basisAmount: e.target.value })}
                    className="font-mono rounded-lg px-2 py-1.5 text-sm outline-none border"
                    style={{ width: 56, background: palette.panel, borderColor: palette.border, color: palette.text }}
                  />
                  <select
                    value={ing.basisUnit} onChange={(e) => updateIngredient(ing.id, { basisUnit: e.target.value })}
                    className="rounded-lg px-1 py-1.5 text-sm outline-none border"
                    style={{ background: palette.panel, borderColor: palette.border, color: palette.text }}
                  >
                    {INGREDIENT_UNITS.map((u) => <option key={u || "none"} value={u}>{u || "—"}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-5 gap-1 mb-2">
                  <NumInput value={ing.basisCalories} onChange={(v) => updateIngredient(ing.id, { basisCalories: v })} placeholder="cal" wide />
                  <NumInput value={ing.basisProtein} onChange={(v) => updateIngredient(ing.id, { basisProtein: v })} placeholder="P" wide />
                  <NumInput value={ing.basisCarbs} onChange={(v) => updateIngredient(ing.id, { basisCarbs: v })} placeholder="C" wide />
                  <NumInput value={ing.basisFat} onChange={(v) => updateIngredient(ing.id, { basisFat: v })} placeholder="F" wide />
                  <NumInput value={ing.basisFiber} onChange={(v) => updateIngredient(ing.id, { basisFiber: v })} placeholder="Fi" wide />
                </div>
                <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>Used in this recipe — same unit as above</div>
                <div className="flex gap-1">
                  <input
                    type="text" inputMode="decimal" value={ing.amount} placeholder="amt"
                    onChange={(e) => updateIngredient(ing.id, { amount: e.target.value })}
                    className="font-mono rounded-lg px-2 py-1.5 text-sm outline-none border"
                    style={{ width: 56, background: palette.panel, borderColor: palette.border, color: palette.text }}
                  />
                  <select
                    value={ing.unit} onChange={(e) => updateIngredient(ing.id, { unit: e.target.value })}
                    className="rounded-lg px-1 py-1.5 text-sm outline-none border"
                    style={{ background: palette.panel, borderColor: palette.border, color: palette.text }}
                  >
                    {INGREDIENT_UNITS.map((u) => <option key={u || "none"} value={u}>{u || "—"}</option>)}
                  </select>
                </div>
              </div>
            ))}
            <Button onClick={addIngredientRow} variant="ghost" size="sm" full>+ Add ingredient</Button>
            <div className="mt-2">
              <Button onClick={calcMacrosFromIngredients} full>Calculate macros from ingredients</Button>
            </div>

            <div className="mt-4">
              <Label>Method</Label>
              <textarea
                value={recipeForm.method} placeholder={"1. Preheat oven...\n2. Season the chicken...\n3. ..."}
                onChange={(e) => setRecipeForm({ ...recipeForm, method: e.target.value })}
                rows={5}
                className="w-full rounded-lg px-2 py-2 text-sm outline-none border"
                style={{ background: palette.panelAlt, borderColor: palette.border, color: palette.text, resize: "vertical" }}
              />
            </div>

            <div className="mt-4">
              <Label>Macros per serving</Label>
              <div className="font-mono mb-1" style={{ color: palette.textFaint, fontSize: 10 }}>
                Filled in automatically by Calculate above, or type totals directly if you already know them.
              </div>
              <div className="grid grid-cols-5 gap-1 mb-1">
                <NumInput value={recipeForm.calories} onChange={(v) => setRecipeForm({ ...recipeForm, calories: v })} placeholder="cal" wide />
                <NumInput value={recipeForm.protein} onChange={(v) => setRecipeForm({ ...recipeForm, protein: v })} placeholder="P" wide />
                <NumInput value={recipeForm.carbs} onChange={(v) => setRecipeForm({ ...recipeForm, carbs: v })} placeholder="C" wide />
                <NumInput value={recipeForm.fat} onChange={(v) => setRecipeForm({ ...recipeForm, fat: v })} placeholder="F" wide />
                <NumInput value={recipeForm.fiber} onChange={(v) => setRecipeForm({ ...recipeForm, fiber: v })} placeholder="Fi" wide />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button onClick={() => setRecipeModalOpen(false)} variant="ghost" grow>Cancel</Button>
              <Button onClick={saveRecipeForm} grow>{recipeForm.id ? "Update recipe" : "Save recipe"}</Button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
