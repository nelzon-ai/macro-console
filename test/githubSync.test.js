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
  isBlockedRepo,
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

function installHappyFetch(extra = {}) {
  const calls = [];
  const shas = { [LATEST_PATH]: extra.latestSha ?? null, history: extra.historySha ?? null };
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
    if (u.includes("/contents/") && call.method === "GET") {
      const path = decodeURIComponent(u.split("/contents/")[1].split("?")[0]);
      const sha = path === LATEST_PATH ? shas[LATEST_PATH] : shas.history;
      if (!sha) return json(404, { message: "Not Found" });
      return json(200, { sha, type: "file", content: utf8ToBase64("{\"remote\":true}\n") });
    }
    if (u.includes("/contents/") && call.method === "PUT") {
      if (extra.onPut) {
        const result = extra.onPut(call, shas);
        if (result) return result;
      }
      const path = decodeURIComponent(u.split("/contents/")[1].split("?")[0]);
      if (path === LATEST_PATH && shas[LATEST_PATH] && call.body.sha !== shas[LATEST_PATH]) {
        return json(409, { message: "sha mismatch" });
      }
      const next = path === LATEST_PATH ? "sha-latest" : "sha-history";
      if (path === LATEST_PATH) shas[LATEST_PATH] = next;
      else shas.history = next;
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
    targets: { calories: 2150, protein: 195 },
    meta: { streak: 3, lastLoggedDate: "2026-10-24" },
    history: [{ date: "2026-10-23", calories: 2100, weight: 180 }],
    recipes: [{ id: "1", name: "Café oats", calories: 400 }],
    bodyComp: [{ date: "2026-10-24", weight: 179.4, bodyFatPct: 22.1 }],
    measurements: [{ date: "2026-10-24", waist: 86 }],
    today: { date: "2026-10-24", day: { foods: [{ name: "Lunch" }], weight: 179.4, locked: true } },
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
  assert.equal(puts.length, 2);
  assert.ok(puts[0].url.endsWith("/contents/data/latest.json"));
  assert.ok(puts[1].url.endsWith("/contents/data/history/2026-10-24.json"));
  assert.equal(puts[0].body.sha, undefined);
  assert.equal(puts[0].body.branch, "main");
  assert.equal(puts[0].auth, "Bearer test-token-not-real");
  const decoded = JSON.parse(base64ToUtf8(puts[0].body.content));
  assert.deepEqual(Object.keys(decoded), ["exportedAt", "targets", "meta", "history", "recipes", "bodyComp", "measurements", "today"]);
  assert.equal(decoded.recipes[0].name, "Café oats");
  assert.equal(decoded.token, undefined);
  assert.equal(decoded.photo, undefined);
  assert.equal(JSON.stringify(decoded).includes("test-token-not-real"), false);
  assert.equal(calls.every((c) => !c.url.includes("test-token-not-real")), true);
});

test("sends the existing sha when updating", async () => {
  setup();
  const { calls } = installHappyFetch({ latestSha: "abc123", historySha: "hist1" });
  const result = await syncNow();
  assert.equal(result.ok, true);
  const puts = calls.filter((c) => c.method === "PUT");
  assert.equal(puts[0].body.sha, "abc123");
  assert.equal(puts[1].body.sha, "hist1");
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
      assert.equal(decoded.today.day.weight, 179.4);
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
  assert.equal(calls.filter((c) => c.method === "PUT").length, 2);
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
  assert.equal(calls.filter((c) => c.method === "PUT").length, 2);
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
  assert.deepEqual(Object.keys(payload), ["exportedAt", "targets", "meta", "history", "recipes", "bodyComp", "measurements", "today"]);
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
