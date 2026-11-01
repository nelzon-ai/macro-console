import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  resetSyncState,
  setSyncStorage,
  setSyncFetch,
  setSyncOnline,
  setSyncLocation,
  setSyncClock,
  setSyncDebounceMs,
  registerPayloadGetter,
  saveSyncConfig,
  loadSyncConfig,
  clearSyncToken,
  loadSyncStatus,
  scheduleSync,
  syncNow,
  testConnection,
  payloadForUpload,
  utf8ToBase64,
  LATEST_PATH,
  PUBLIC_APP_REPO,
  PRE_TWO_WAY_BACKUP_KEY,
  isBlockedRepo,
  registerMergeApplier,
  loadPreTwoWayBackup,
  recordTombstone,
} from "../src/githubSync.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXED = new Date(2026, 9, 24, 12, 0, 0);

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function base64ToUtf8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function privateRepo() {
  return { private: true, visibility: "private", default_branch: "main", full_name: "nelzon-ai/macro-console-data" };
}

function contentPath(url) {
  const raw = String(url).split("/contents/")[1] || "";
  return decodeURIComponent(raw.split("?")[0]);
}

function installHappyFetch(extra = {}) {
  const calls = [];
  const shas = { [LATEST_PATH]: extra.latestSha ?? null, history: extra.historySha ?? null };
  const latestText = extra.latestText == null ? "{\"remote\":true}\n" : extra.latestText;
  const fn = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: init.method || "GET",
      body: init.body ? JSON.parse(init.body) : null,
      auth: init.headers && init.headers.Authorization,
    };
    calls.push(call);
    const u = call.url;
    if (call.auth && u.includes(call.auth.replace("Bearer ", ""))) {
      return json(500, { message: "token leaked into url" });
    }
    if (/\/repos\/[^/]+\/[^/]+$/.test(u.replace("https://api.github.com", ""))) {
      return json(200, extra.repo || privateRepo());
    }
    if (u.includes("/branches/")) return json(200, { name: "main" });
    if (u.includes("/contents/") && (call.method === "GET" || call.method === "DELETE")) {
      const path = contentPath(u);
      if (extra.onGet) {
        const custom = extra.onGet(path, call, shas);
        if (custom) return custom;
      }
      if (path === "data/inbox") {
        if (!extra.inbox) return json(404, { message: "Not Found" });
        return json(200, extra.inbox);
      }
      if (path.startsWith("data/inbox/")) {
        const file = (extra.inboxFiles || {})[path];
        if (!file) return json(404, { message: "Not Found" });
        if (call.method === "DELETE") {
          delete extra.inboxFiles[path];
          return json(200, { commit: { sha: "deleted" } });
        }
        return json(200, { sha: file.sha, type: "file", content: utf8ToBase64(file.text) });
      }
      if (path.startsWith("data/backups/")) return json(404, { message: "Not Found" });
      if (path === LATEST_PATH) {
        if (!shas[LATEST_PATH]) return json(404, { message: "Not Found" });
        return json(200, { sha: shas[LATEST_PATH], type: "file", content: utf8ToBase64(latestText) });
      }
      if (path.startsWith("data/history/")) {
        if (!shas.history) return json(404, { message: "Not Found" });
        return json(200, { sha: shas.history, type: "file", content: utf8ToBase64("{\"history\":true}\n") });
      }
      return json(404, { message: "Not Found" });
    }
    if (u.includes("/contents/") && call.method === "PUT") {
      if (extra.onPut) {
        const result = extra.onPut(call, shas);
        if (result) return result;
      }
      const path = contentPath(u);
      if (path === LATEST_PATH && shas[LATEST_PATH] && call.body.sha !== shas[LATEST_PATH]) {
        return json(409, { message: "sha mismatch" });
      }
      const next = path === LATEST_PATH ? "sha-latest" : `sha-${path.split("/").pop()}`;
      if (path === LATEST_PATH) shas[LATEST_PATH] = next;
      else if (path.startsWith("data/history/")) shas.history = next;
      return json(201, { content: { sha: next } });
    }
    return json(500, { message: `unexpected ${call.method} ${u}` });
  };
  setSyncFetch(fn);
  return { calls, shas };
}

function json(status, body) {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

function samplePayload() {
  return {
    exportedAt: "2026-10-24T18:04:00.000Z",
    targets: { calories: 2000, protein: 150 },
    meta: { streak: 3, lastLoggedDate: "2026-10-24" },
    history: [{ date: "2026-10-23", calories: 1900, weight: 175 }],
    recipes: [{ id: "1", name: "Café oats", calories: 400 }],
    bodyComp: [{ date: "2026-10-24", weight: 174.4, bodyFatPct: 21.5 }],
    measurements: [{ date: "2026-10-24", waist: 80 }],
    milestones: [{ weight: 160, bodyFat: 18, waist: 76 }],
    mealTypes: ["Breakfast", "Lunch"],
    supplementGroups: [],
    supplementRules: ["Take with food."],
    workoutDays: [{ key: "dayA", label: "Day A" }],
    weeklyWorkoutTarget: 3,
    today: { date: "2026-10-24", day: { foods: [{ name: "Lunch" }], weight: 174.4, locked: true } },
    token: "should-never-upload",
    photo: "data:image/png;base64,secret-photo",
  };
}

function setup(token = "test-token-not-real") {
  resetSyncState();
  setSyncStorage(memoryStorage());
  setSyncClock(() => FIXED);
  setSyncOnline(true);
  setSyncLocation({ hostname: "localhost", pathname: "/" });
  saveSyncConfig({ token, repo: "nelzon-ai/macro-console-data", branch: "main" });
  registerPayloadGetter(() => samplePayload());
}

test("refuses a public repo and never uploads", async () => {
  setup();
  const { calls } = installHappyFetch({
    repo: { private: false, visibility: "public", default_branch: "main" },
  });
  const result = await syncNow();
  assert.equal(result.ok, false);
  assert.equal(result.refused, true);
  assert.match(result.message, /public/i);
  assert.match(result.message, /not uploaded/i);
  assert.equal(calls.some((c) => c.method === "PUT"), false);
  assert.equal(loadSyncStatus().code, "public_repo");
  assert.equal(loadSyncStatus().pending, false);
});

test("refuses the public app repo before any request", async () => {
  setup();
  saveSyncConfig({ repo: PUBLIC_APP_REPO, branch: "main" });
  const { calls } = installHappyFetch({
    repo: { private: true, visibility: "private" },
  });
  const result = await testConnection();
  assert.equal(result.ok, false);
  assert.equal(result.refused, true);
  assert.match(result.message, /public Macro Console app/i);
  assert.equal(calls.length, 0);
  const sync = await syncNow();
  assert.equal(sync.refused, true);
  assert.equal(calls.some((c) => c.method === "PUT"), false);
});

test("refuses the GitHub Pages repo even under another name check", () => {
  assert.equal(isBlockedRepo("nelzon-ai", "macro-console", { hostname: "example.com", pathname: "/" }), true);
  assert.equal(isBlockedRepo("someone", "macro-console", { hostname: "someone.github.io", pathname: "/macro-console/" }), true);
  assert.equal(isBlockedRepo("nelzon-ai", "macro-console-data", { hostname: "nelzon-ai.github.io", pathname: "/macro-console/" }), false);
});

test("test connection accepts a private repo and does not write", async () => {
  setup();
  const { calls } = installHappyFetch();
  const result = await testConnection();
  assert.equal(result.ok, true);
  assert.match(result.message, /private/i);
  assert.equal(calls.some((c) => c.method === "PUT"), false);
  assert.equal(calls.some((c) => c.method === "GET" && c.url.includes("/repos/nelzon-ai/macro-console-data")), true);
});

test("writes latest.json and today's snapshot, creating files when they are missing", async () => {
  setup();
  const { calls } = installHappyFetch();
  const result = await syncNow();
  assert.equal(result.ok, true);
  assert.equal(loadSyncStatus().pending, false);
  assert.equal(loadSyncStatus().lastSyncedAt, FIXED.toISOString());
  const puts = calls.filter((c) => c.method === "PUT");
  assert.equal(puts.length, 3);
  assert.ok(puts[0].url.includes("/contents/data/backups/"));
  assert.ok(puts[0].url.endsWith(".json"));
  assert.ok(puts[1].url.endsWith("/contents/data/latest.json"));
  assert.ok(puts[2].url.endsWith("/contents/data/history/2026-10-24.json"));
  assert.equal(puts[1].body.sha, undefined);
  assert.equal(puts[1].body.branch, "main");
  assert.equal(puts[1].auth, "Bearer test-token-not-real");
  const decoded = JSON.parse(base64ToUtf8(puts[1].body.content));
  const backup = JSON.parse(base64ToUtf8(puts[0].body.content));
  assert.equal(backup.today.day.weight, 174.4);
  assert.equal(JSON.stringify(backup).includes("test-token-not-real"), false);
  assert.deepEqual(Object.keys(decoded), ["exportedAt", "targets", "meta", "history", "recipes", "bodyComp", "measurements", "milestones", "mealTypes", "supplementGroups", "supplementRules", "workoutDays", "weeklyWorkoutTarget", "today", "days", "deleted", "conflicts", "applied"]);
  assert.equal(decoded.recipes[0].name, "Café oats");
  assert.equal(decoded.token, undefined);
  assert.equal(decoded.photo, undefined);
  assert.equal(JSON.stringify(decoded).includes("test-token-not-real"), false);
  assert.equal(calls.every((c) => !c.url.includes("test-token-not-real")), true);
});

test("sends the existing sha when updating latest and does not modify a history file", async () => {
  setup();
  const { calls } = installHappyFetch({ latestSha: "abc123", historySha: "hist1" });
  const result = await syncNow();
  assert.equal(result.ok, true);
  const puts = calls.filter((c) => c.method === "PUT");
  const latest = puts.find((c) => c.url.includes("data/latest.json"));
  assert.equal(latest.body.sha, "abc123");
  assert.equal(puts.some((c) => c.url.includes("data/history/")), false);
  assert.equal(calls.some((c) => c.method === "DELETE"), false);
});

test("on 409, refetches the sha and overwrites with local data", async () => {
  setup();
  let latestReads = 0;
  const { calls } = installHappyFetch({
    latestSha: "sha-old",
    onPut(call, shas) {
      if (!call.url.includes("/contents/data/latest.json")) return null;
      latestReads += 1;
      if (latestReads === 1) {
        shas[LATEST_PATH] = "sha-new";
        return json(409, { message: "is at sha-new but expected sha-old" });
      }
      assert.equal(call.body.sha, "sha-new");
      const decoded = JSON.parse(base64ToUtf8(call.body.content));
      assert.equal(decoded.today.day.weight, 174.4);
      assert.equal(decoded.remote, undefined);
      return json(200, { content: { sha: "sha-new" } });
    },
  });
  const result = await syncNow();
  assert.equal(result.ok, true);
  const latestPuts = calls.filter((c) => c.method === "PUT" && c.url.includes("latest.json"));
  assert.equal(latestPuts.length, 2);
  assert.equal(latestPuts[0].body.sha, "sha-old");
  assert.equal(latestPuts[1].body.sha, "sha-new");
});

test("offline marks pending, does not call GitHub, and a later retry uploads", async () => {
  setup();
  const { calls } = installHappyFetch();
  setSyncOnline(false);
  const offline = await syncNow();
  assert.equal(offline.ok, false);
  assert.equal(offline.pending, true);
  assert.match(offline.message, /offline/i);
  assert.equal(calls.length, 0);
  assert.equal(loadSyncStatus().pending, true);

  setSyncOnline(true);
  const again = await syncNow();
  assert.equal(again.ok, true);
  assert.equal(loadSyncStatus().pending, false);
  assert.equal(calls.filter((c) => c.method === "PUT").length, 3);
});

test("a network failure stays pending and does not throw", async () => {
  setup();
  setSyncFetch(async () => { throw new Error("offline"); });
  const result = await syncNow();
  assert.equal(result.ok, false);
  assert.equal(result.pending, true);
  assert.match(result.message, /still on this phone/i);
});

test("debounced schedule collapses to one upload", async () => {
  setup();
  setSyncDebounceMs(30);
  const { calls } = installHappyFetch();
  scheduleSync();
  scheduleSync();
  scheduleSync();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(calls.filter((c) => c.method === "PUT").length, 3);
});

test("does nothing when no token is saved", async () => {
  setup("");
  clearSyncToken();
  const { calls } = installHappyFetch();
  scheduleSync();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const result = await syncNow();
  assert.equal(result.skipped, true);
  assert.equal(calls.length, 0);
  assert.equal(loadSyncConfig().hasToken, false);
});

test("disconnect removes the token from storage", () => {
  setup();
  clearSyncToken();
  const cfg = loadSyncConfig();
  assert.equal(cfg.token, "");
  assert.equal(cfg.hasToken, false);
  assert.equal(cfg.repo, "nelzon-ai/macro-console-data");
  assert.equal(loadSyncStatus().code, "disconnected");
  const stored = JSON.stringify(loadSyncStatus());
  assert.equal(stored.includes("test-token-not-real"), false);
});

test("payload keeps the export shape and drops anything else", () => {
  const payload = payloadForUpload(samplePayload());
  assert.deepEqual(Object.keys(payload), ["exportedAt", "targets", "meta", "history", "recipes", "bodyComp", "measurements", "milestones", "mealTypes", "supplementGroups", "supplementRules", "workoutDays", "weeklyWorkoutTarget", "today", "days", "deleted", "conflicts", "applied"]);
  assert.equal(JSON.stringify(payload).includes("secret-photo"), false);
  assert.equal(JSON.stringify(payload).includes("should-never-upload"), false);
});

test("refuses to upload if the export text contains the token", async () => {
  setup("cafe-token");
  registerPayloadGetter(() => ({ ...samplePayload(), recipes: [{ name: "cafe-token bowl" }] }));
  const { calls } = installHappyFetch();
  const result = await syncNow();
  assert.equal(result.ok, false);
  assert.equal(calls.some((c) => c.method === "PUT"), false);
  assert.match(result.message, /token/i);
});

test("an auth failure is not retried automatically as pending", async () => {
  setup();
  setSyncFetch(async () => json(401, { message: "Bad credentials" }));
  const result = await syncNow();
  assert.equal(result.ok, false);
  assert.equal(result.pending, false);
  assert.match(result.message, /token/i);
});

test("a failed remote read keeps local data and still uploads this phone", async () => {
  setup();
  const payload = samplePayload();
  registerPayloadGetter(() => payload);
  let applied = 0;
  registerMergeApplier(() => { applied += 1; });
  let latestGets = 0;
  const { calls } = installHappyFetch({
    onGet(path) {
      if (path !== LATEST_PATH) return null;
      latestGets += 1;
      if (latestGets === 1) return json(500, { message: "unavailable" });
      return null;
    },
  });
  const result = await syncNow();
  assert.equal(result.ok, true);
  assert.equal(applied, 0);
  assert.equal(payload.history.length, 1);
  const latest = calls.find((c) => c.method === "PUT" && c.url.includes("data/latest.json"));
  const decoded = JSON.parse(base64ToUtf8(latest.body.content));
  assert.equal(decoded.history[0].date, "2026-10-23");
  assert.equal(calls.some((c) => c.method === "DELETE"), false);
});

test("invalid remote JSON does not change local data and uploads this phone", async () => {
  setup();
  const payload = samplePayload();
  registerPayloadGetter(() => payload);
  let applied = 0;
  registerMergeApplier(() => { applied += 1; });
  const { calls } = installHappyFetch({ latestSha: "abc123", latestText: "not-json{" });
  const result = await syncNow();
  assert.equal(result.ok, true);
  assert.equal(applied, 0);
  assert.equal(payload.recipes[0].name, "Café oats");
  const latest = calls.find((c) => c.method === "PUT" && c.url.includes("data/latest.json"));
  const decoded = JSON.parse(base64ToUtf8(latest.body.content));
  assert.equal(decoded.recipes[0].name, "Café oats");
  assert.equal(decoded.remote, undefined);
});

test("merges a remote entry into the upload and the local applier", async () => {
  setup();
  let applied = null;
  registerMergeApplier(async (doc) => { applied = doc; });
  const remote = {
    history: [{ date: "2026-01-02", calories: 100, protein: 1, carbs: 2, fat: 1, fiber: 1, weight: 150, water: 0, steps: null, workoutDone: false }],
    recipes: [{ id: "recipe-remote", name: "Example stew", calories: 80, protein: 4, carbs: 6, fat: 2, fiber: 1 }],
  };
  const { calls } = installHappyFetch({ latestSha: "remote-sha", latestText: `${JSON.stringify(remote)}\n` });
  const result = await syncNow();
  assert.equal(result.ok, true);
  assert.ok(applied);
  assert.ok(applied.history.some((row) => row.date === "2026-10-23"));
  assert.ok(applied.history.some((row) => row.date === "2026-01-02" && row.weight === 150));
  assert.ok(applied.recipes.some((row) => row.name === "Café oats"));
  assert.ok(applied.recipes.some((row) => row.name === "Example stew"));
  const latest = calls.find((c) => c.method === "PUT" && c.url.includes("data/latest.json"));
  const decoded = JSON.parse(base64ToUtf8(latest.body.content));
  assert.ok(decoded.history.some((row) => row.date === "2026-01-02"));
  assert.ok(decoded.recipes.some((row) => row.id === "recipe-remote"));
  assert.equal(calls.some((c) => c.method === "DELETE" && c.url.includes("data/history/")), false);
});

test("imports an inbox file once, then marks it processed", async () => {
  setup();
  let applied = null;
  registerMergeApplier(async (doc) => { applied = doc; });
  const inboxBody = JSON.stringify({
    id: "batch-example",
    entries: [{
      type: "food",
      date: "2026-01-04",
      id: "food-example",
      name: "Example oats",
      calories: 120,
      protein: 5,
      carbs: 20,
      fat: 2,
      fiber: 3,
      updatedAt: "2026-01-04T08:00:00.000Z",
    }],
  });
  const { calls } = installHappyFetch({
    inbox: [{ name: "example.json", path: "data/inbox/example.json", type: "file", sha: "in1" }],
    inboxFiles: { "data/inbox/example.json": { sha: "in1", text: inboxBody } },
  });
  const result = await syncNow();
  assert.equal(result.ok, true);
  const foods = applied.days.find((day) => day.date === "2026-01-04").day.foods;
  assert.equal(foods.some((food) => food.id === "food-example"), true);
  assert.ok(calls.some((c) => c.method === "PUT" && c.url.includes("data/inbox/processed/example.json")));
  assert.ok(calls.some((c) => c.method === "DELETE" && c.url.includes("data/inbox/example.json")));
  assert.equal(calls.some((c) => c.method === "DELETE" && c.url.includes("data/history/")), false);
});

test("keeps the first on-phone safety backup when sync runs again", async () => {
  setup();
  installHappyFetch();
  await syncNow();
  const first = loadPreTwoWayBackup();
  assert.equal(first.includes(PRE_TWO_WAY_BACKUP_KEY), false);
  assert.ok(first.includes("Café oats"));
  registerPayloadGetter(() => ({ ...samplePayload(), recipes: [{ id: "2", name: "Example stew", calories: 10 }] }));
  await syncNow();
  assert.equal(loadPreTwoWayBackup(), first);
});

test("a tombstone removes a recipe from the merge without dropping it from conflicts", async () => {
  setup();
  recordTombstone({ collection: "recipes", id: "1", deletedAt: "2026-12-01T00:00:00.000Z" });
  const { calls } = installHappyFetch({ latestSha: "remote-sha", latestText: `${JSON.stringify(samplePayload())}\n` });
  const result = await syncNow();
  assert.equal(result.ok, true);
  const decoded = JSON.parse(base64ToUtf8(calls.find((c) => c.method === "PUT" && c.url.includes("data/latest.json")).body.content));
  assert.equal(decoded.recipes.some((recipe) => recipe.id === "1"), false);
  assert.equal(decoded.deleted.some((tomb) => tomb.collection === "recipes" && tomb.id === "1"), true);
  assert.equal(decoded.conflicts.some((item) => item.collection === "recipes" && item.reason === "deleted"), true);
});

test("the same additive inbox file cannot apply twice when upload fails and the file stays", async () => {
  setup();
  const state = { water: 400, steps: 1000, calories: 100, foods: 1 };
  const dayBody = () => ({
    foods: [{ id: "food-1", name: "Example oats", calories: 100, protein: 1, carbs: 2, fat: 1, fiber: 1 }],
    weight: null,
    water: state.water,
    steps: state.steps,
    workout: null,
    locked: false,
  });
  registerPayloadGetter(() => ({
    ...samplePayload(),
    history: [{ date: "2026-01-08", calories: 100, protein: 1, carbs: 2, fat: 1, fiber: 1, weight: null, water: state.water, steps: state.steps, workoutDone: false }],
    today: { date: "2026-01-08", day: dayBody() },
    days: [{ date: "2026-01-08", day: dayBody() }],
  }));
  registerMergeApplier(async (doc) => {
    const row = doc.history.find((item) => item.date === "2026-01-08");
    const day = doc.days.find((item) => item.date === "2026-01-08");
    state.water = row.water;
    state.steps = row.steps;
    state.calories = row.calories;
    state.foods = day.day.foods.length;
  });
  const inboxBody = JSON.stringify({
    id: "batch-activity",
    createdAt: "2026-01-08T12:00:00.000Z",
    entries: [
      { type: "water", date: "2026-01-08", id: "water-example-1", updatedAt: "2026-01-08T12:00:00.000Z", amount: 250 },
      { type: "steps", date: "2026-01-08", id: "steps-example-1", updatedAt: "2026-01-08T12:00:00.000Z", count: 400, mode: "add" },
    ],
  });
  let latestPuts = 0;
  setSyncFetch(async (url, init = {}) => {
    const method = init.method || "GET";
    const u = String(url);
    if (/\/repos\/[^/]+\/[^/]+$/.test(u.replace("https://api.github.com", ""))) {
      return json(200, { private: true, visibility: "private", default_branch: "main" });
    }
    if (u.includes("/branches/")) return json(200, { name: "main" });
    if (u.includes("/contents/") && method === "GET") {
      const path = decodeURIComponent(u.split("/contents/")[1].split("?")[0]);
      if (path === "data/inbox") {
        return json(200, [{ name: "activity.json", path: "data/inbox/activity.json", type: "file", sha: "in1" }]);
      }
      if (path === "data/inbox/activity.json") {
        return json(200, { sha: "in1", type: "file", content: utf8ToBase64(inboxBody) });
      }
      return json(404, { message: "Not Found" });
    }
    if (u.includes("/contents/") && method === "PUT") {
      const path = decodeURIComponent(u.split("/contents/")[1].split("?")[0]);
      if (path === LATEST_PATH) {
        latestPuts += 1;
        if (latestPuts < 3) return json(500, { message: "unavailable" });
      }
      return json(201, { content: { sha: "sha-ok" } });
    }
    if (method === "DELETE") return json(500, { message: "still there" });
    return json(500, { message: `unexpected ${method} ${u}` });
  });

  const first = await syncNow();
  assert.equal(first.ok, false);
  assert.equal(state.water, 650);
  assert.equal(state.steps, 1400);
  const second = await syncNow();
  assert.equal(second.ok, false);
  assert.equal(state.water, 650);
  assert.equal(state.steps, 1400);
  assert.equal(await syncNow().then((result) => result.ok), true);
  assert.equal(await syncNow().then((result) => result.ok), true);
  assert.equal(state.water, 650);
  assert.equal(state.steps, 1400);
  assert.equal(state.calories, 100);
  assert.equal(state.foods, 1);
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

test("the repo does not contain a GitHub token or a data snapshot", () => {
  const banned = [
    /github_pat_[A-Za-z0-9_]{8,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /gho_[A-Za-z0-9]{20,}/,
  ];
  const files = walk(root).filter((file) => !file.endsWith(".png"));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
    }
  }
  const syncSource = readFileSync(join(root, "src/githubSync.js"), "utf8");
  assert.equal(syncSource.includes("localStorage"), true);
  assert.equal(syncSource.includes(LATEST_PATH), true);
});
