// Optional cloud sync. Health data is uploaded only to a private GitHub repo
// the person configures on their phone. The token lives in localStorage and is
// never written into the backup, the app repo, or a commit message.
//
// Local data is the source of truth: a conflict refreshes the file sha and
// overwrites data/latest.json (and today's snapshot) with the phone's export.

export const DEFAULT_REPO = "nelzon-ai/macro-console-data";
export const DEFAULT_BRANCH = "main";
export const LATEST_PATH = "data/latest.json";
export const HISTORY_DIR = "data/history/";
export const PUBLIC_APP_REPO = "nelzon-ai/macro-console";
export const DEFAULT_DEBOUNCE_MS = 2000;

const KEYS = {
  token: "macroConsole.sync.token",
  repo: "macroConsole.sync.repo",
  branch: "macroConsole.sync.branch",
  status: "macroConsole.sync.status",
};

const API = "https://api.github.com";

let storageOverride = null;
let fetchImpl = (...args) => globalThis.fetch(...args);
let onlineOverride = null;
let locationOverride = null;
let clock = () => new Date();
let debounceMs = DEFAULT_DEBOUNCE_MS;
let payloadGetter = null;
let timer = null;
let running = null;
let rerun = false;
const listeners = new Set();

export function setSyncStorage(storage) { storageOverride = storage; }
export function setSyncFetch(fn) { fetchImpl = fn; }
export function setSyncOnline(value) { onlineOverride = value; }
export function setSyncLocation(loc) { locationOverride = loc; }
export function setSyncClock(fn) { clock = fn; }
export function setSyncDebounceMs(ms) { debounceMs = ms; }

export function registerPayloadGetter(fn) { payloadGetter = fn; }

export function resetSyncState() {
  if (timer) clearTimeout(timer);
  timer = null;
  rerun = false;
  running = null;
  payloadGetter = null;
  onlineOverride = null;
  locationOverride = null;
  storageOverride = null;
  fetchImpl = (...args) => globalThis.fetch(...args);
  clock = () => new Date();
  debounceMs = DEFAULT_DEBOUNCE_MS;
  listeners.clear();
}

function store() {
  if (storageOverride) return storageOverride;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

function readKey(key) {
  try {
    const s = store();
    return s ? s.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeKey(key, value) {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeKey(key) {
  try {
    const s = store();
    if (s) s.removeItem(key);
  } catch { /* storage may be blocked; disconnect still clears memory status via emit */ }
}

export function loadSyncConfig() {
  const token = (readKey(KEYS.token) || "").trim();
  const repo = (readKey(KEYS.repo) || "").trim() || DEFAULT_REPO;
  const branch = (readKey(KEYS.branch) || "").trim() || DEFAULT_BRANCH;
  return { token, repo, branch, hasToken: token.length > 0 };
}

export function saveSyncConfig({ token, repo, branch } = {}) {
  if (typeof token === "string" && token.trim()) writeKey(KEYS.token, token.trim());
  if (typeof repo === "string" && repo.trim()) writeKey(KEYS.repo, repo.trim());
  if (typeof branch === "string" && branch.trim()) writeKey(KEYS.branch, branch.trim());
  return loadSyncConfig();
}

export function clearSyncToken() {
  removeKey(KEYS.token);
  return emit({
    state: "idle",
    pending: false,
    code: "disconnected",
    message: "Disconnected. The token was removed from this phone.",
    lastSyncedAt: null,
  });
}

export function loadSyncStatus() {
  const empty = { state: "idle", pending: false, code: "", message: "", lastSyncedAt: null };
  const raw = readKey(KEYS.status);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    return {
      state: parsed.state || "idle",
      pending: !!parsed.pending,
      code: parsed.code || "",
      message: parsed.message || "",
      lastSyncedAt: parsed.lastSyncedAt || null,
    };
  } catch {
    return empty;
  }
}

export function subscribeSyncStatus(fn) {
  listeners.add(fn);
  try { fn(loadSyncStatus()); } catch { /* listener */ }
  return () => listeners.delete(fn);
}

function emit(status) {
  const prev = loadSyncStatus();
  const next = {
    state: status.state || "idle",
    pending: !!status.pending,
    code: status.code || "",
    message: status.message || "",
    lastSyncedAt: status.lastSyncedAt !== undefined ? status.lastSyncedAt : (prev.lastSyncedAt || null),
  };
  writeKey(KEYS.status, JSON.stringify(next));
  listeners.forEach((fn) => {
    try { fn(next); } catch { /* UI errors must not break sync */ }
  });
  return next;
}

function isOnline() {
  if (onlineOverride != null) return onlineOverride;
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function currentLocation() {
  if (locationOverride) return locationOverride;
  if (typeof location !== "undefined" && location && location.hostname) return location;
  return null;
}

export function pagesRepoFromLocation(loc) {
  if (!loc || !loc.hostname) return null;
  const host = String(loc.hostname);
  const match = host.match(/^([^.]+)\.github\.io$/i);
  if (!match) return null;
  const owner = match[1];
  const segment = String(loc.pathname || "").split("/").filter(Boolean)[0];
  if (!segment) return null;
  return `${owner}/${segment}`.toLowerCase();
}

export function parseRepo(repo) {
  const trimmed = String(repo || "").trim();
  const match = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match || match[1].includes("..") || match[2].includes("..")) {
    const error = new Error("Repo should look like owner/name — for example nelzon-ai/macro-console-data.");
    error.code = "bad_repo";
    throw error;
  }
  return { owner: match[1], name: match[2], full: `${match[1]}/${match[2]}` };
}

export function parseBranch(branch) {
  const trimmed = String(branch || "").trim();
  if (!trimmed || trimmed.startsWith("/") || trimmed.endsWith("/") || trimmed.includes("..") || !/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    const error = new Error("Branch name doesn't look right. main is the usual one.");
    error.code = "bad_branch";
    throw error;
  }
  return trimmed;
}

export function isBlockedRepo(owner, name, loc = currentLocation()) {
  const full = `${owner}/${name}`.toLowerCase();
  if (full === PUBLIC_APP_REPO) return true;
  const pages = pagesRepoFromLocation(loc);
  return !!(pages && full === pages);
}

export function localDateStamp(date = clock()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function payloadForUpload(source) {
  const now = clock();
  return {
    exportedAt: source && source.exportedAt ? source.exportedAt : now.toISOString(),
    targets: source ? source.targets ?? null : null,
    meta: source ? source.meta ?? null : null,
    history: source && Array.isArray(source.history) ? source.history : [],
    recipes: source && Array.isArray(source.recipes) ? source.recipes : [],
    bodyComp: source && Array.isArray(source.bodyComp) ? source.bodyComp : [],
    measurements: source && Array.isArray(source.measurements) ? source.measurements : [],
    today: source ? source.today ?? null : null,
  };
}

export function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x1000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function ghHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function github(path, { method = "GET", token, query, body } = {}) {
  const url = new URL(API + path);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value != null && value !== "") url.searchParams.set(key, value);
    });
  }
  if (token && url.toString().includes(token)) {
    const error = new Error("Sync stopped before calling GitHub.");
    error.code = "blocked_repo";
    throw error;
  }
  let res;
  try {
    res = await fetchImpl(url.toString(), {
      method,
      headers: ghHeaders(token),
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    const error = new Error("Couldn't reach GitHub. Your data is still on this phone and will sync when the connection is back.");
    error.code = "network";
    throw error;
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 180) }; }
  }
  return { ok: res.ok, status: res.status, data };
}

function friendlyMessage(code, raw) {
  const text = String(raw || "");
  if (/repository is empty/i.test(text)) {
    return "The private repo doesn't have a branch yet. On GitHub, add a README file so main exists, then sync again.";
  }
  if (code === "auth") return "GitHub didn't accept that token. Create a new one and paste it again.";
  if (code === "forbidden") return "The token isn't allowed to write files. On GitHub, edit the token, choose only the private data repo, and set Contents to Read and write.";
  if (code === "not_found") return "That repo or branch doesn't exist, or this token can't see it. Check owner/name, and that the token is limited to the private repo.";
  if (code === "conflict") return "GitHub was mid-update. Your phone's copy is kept and sync will try again.";
  if (code === "network") return "Couldn't reach GitHub. Your data is still on this phone and will sync when the connection is back.";
  return "Sync didn't finish. Your data is still on this phone.";
}

function httpError(res) {
  const raw = res.data && res.data.message ? res.data.message : "";
  let code = "network";
  if (/repository is empty/i.test(raw)) code = "not_found";
  else if (res.status === 401) code = "auth";
  else if (res.status === 403) code = "forbidden";
  else if (res.status === 404) code = "not_found";
  else if (res.status === 409 || res.status === 422) code = "conflict";
  const error = new Error(friendlyMessage(code, raw));
  error.code = code;
  error.status = res.status;
  return error;
}

const PUBLIC_WARNING = "This repo is public. Sync is turned off so your health data is not uploaded. On GitHub, open the repo, go to Settings, and change the visibility to Private. Then tap Test connection again.";
const BLOCKED_WARNING = "That is the public Macro Console app. Health data is never sent there. Use a private repo such as nelzon-ai/macro-console-data.";

export async function assertPrivateRepo(cfg = loadSyncConfig()) {
  let parsed;
  let branch;
  try {
    parsed = parseRepo(cfg.repo);
    branch = parseBranch(cfg.branch);
  } catch (err) {
    return { ok: false, code: err.code || "bad_repo", message: err.message };
  }
  if (isBlockedRepo(parsed.owner, parsed.name)) {
    return { ok: false, code: "blocked_repo", message: BLOCKED_WARNING };
  }
  const repoRes = await github(`/repos/${parsed.owner}/${parsed.name}`, { token: cfg.token });
  if (!repoRes.ok) {
    if (repoRes.status === 404) {
      return { ok: false, code: "not_found", message: "That repo doesn't exist, or this token isn't allowed to see it. Check the name is owner/repo, and that the token is limited to that private repo." };
    }
    const error = httpError(repoRes);
    return { ok: false, code: error.code, message: error.message };
  }
  const visibility = repoRes.data && repoRes.data.visibility;
  const isPrivate = repoRes.data && repoRes.data.private === true;
  if (visibility === "public" || (repoRes.data && repoRes.data.private === false) || !isPrivate) {
    return { ok: false, code: "public_repo", message: PUBLIC_WARNING };
  }
  const branchRes = await github(`/repos/${parsed.owner}/${parsed.name}/branches/${encodeURIComponent(branch)}`, { token: cfg.token });
  if (branchRes.status === 404) {
    return { ok: false, code: "not_found", message: `The branch "${branch}" doesn't exist yet. On GitHub, add a README file to the private repo so main is created, then try again.` };
  }
  if (!branchRes.ok) {
    const error = httpError(branchRes);
    return { ok: false, code: error.code, message: error.message };
  }
  return { ok: true, code: "ok", owner: parsed.owner, name: parsed.name, branch };
}

async function getFileSha(cfg, path) {
  const { owner, name } = parseRepo(cfg.repo);
  const branch = parseBranch(cfg.branch);
  const res = await github(`/repos/${owner}/${name}/contents/${path}`, {
    token: cfg.token,
    query: { ref: branch },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw httpError(res);
  if (Array.isArray(res.data) || !res.data || !res.data.sha) return null;
  return res.data.sha;
}

async function putFile(cfg, path, text, message) {
  const { owner, name } = parseRepo(cfg.repo);
  const branch = parseBranch(cfg.branch);
  let sha = await getFileSha(cfg, path);
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = { message, content: utf8ToBase64(text), branch };
    if (sha) body.sha = sha;
    last = await github(`/repos/${owner}/${name}/contents/${path}`, {
      method: "PUT",
      token: cfg.token,
      body,
    });
    if (last.ok) return;
    if (last.status === 409 || last.status === 422) {
      const fresh = await getFileSha(cfg, path);
      if (fresh && fresh !== sha) {
        sha = fresh;
        continue;
      }
      if (!fresh && sha) {
        sha = null;
        continue;
      }
      if (attempt < 2) continue;
    }
    throw httpError(last);
  }
  throw httpError(last || { status: 409, data: { message: "" } });
}

function exportText(payload, token) {
  const safe = payloadForUpload(payload);
  const text = `${JSON.stringify(safe, null, 2)}\n`;
  if (token && text.includes(token)) {
    const error = new Error("Sync stopped because the backup included the token. Nothing was uploaded.");
    error.code = "blocked_repo";
    throw error;
  }
  return text;
}

async function runSyncBody() {
  const cfg = loadSyncConfig();
  const prev = loadSyncStatus();
  if (!cfg.token) {
    return { ok: false, skipped: true, message: "Add a token in Settings → Sync to turn sync on." };
  }
  const payload = payloadGetter ? payloadGetter() : null;
  if (!payload) {
    return { ok: false, skipped: true, message: "Nothing to sync yet." };
  }
  if (!isOnline()) {
    const status = emit({
      state: "pending",
      pending: true,
      code: "offline",
      message: "You're offline. Data stays on this phone and will sync when you reconnect.",
      lastSyncedAt: prev.lastSyncedAt,
    });
    return { ok: false, pending: true, message: status.message };
  }

  emit({ state: "syncing", pending: true, code: "syncing", message: "Syncing…", lastSyncedAt: prev.lastSyncedAt });
  try {
    const gate = await assertPrivateRepo(cfg);
    if (!gate.ok) {
      const refused = gate.code === "public_repo" || gate.code === "blocked_repo";
      const retry = !refused && (gate.code === "network");
      const status = emit({
        state: retry ? "pending" : "error",
        pending: retry,
        code: gate.code,
        message: gate.message,
        lastSyncedAt: prev.lastSyncedAt,
      });
      return { ok: false, refused, pending: retry, message: status.message };
    }
    const text = exportText(payload, cfg.token);
    const day = localDateStamp();
    await putFile(cfg, LATEST_PATH, text, "Sync latest Macro Console data");
    await putFile(cfg, `${HISTORY_DIR}${day}.json`, text, `Snapshot Macro Console data for ${day}`);
    const lastSyncedAt = clock().toISOString();
    const status = emit({
      state: "synced",
      pending: false,
      code: "ok",
      message: "Synced to your private repo.",
      lastSyncedAt,
    });
    return { ok: true, lastSyncedAt, message: status.message };
  } catch (err) {
    const code = err.code || "network";
    const retry = code === "network" || code === "conflict" || code === "offline";
    const status = emit({
      state: retry ? "pending" : "error",
      pending: retry,
      code,
      message: err.message || friendlyMessage(code),
      lastSyncedAt: prev.lastSyncedAt,
    });
    return { ok: false, pending: retry, message: status.message };
  }
}

function kick() {
  if (running) {
    rerun = true;
    return running;
  }
  running = runSyncBody().finally(() => {
    running = null;
    if (rerun) {
      rerun = false;
      void kick();
    }
  });
  return running;
}

export function scheduleSync() {
  if (!loadSyncConfig().token) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void kick();
  }, debounceMs);
}

export function syncNow() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return kick();
}

export async function testConnection() {
  const cfg = loadSyncConfig();
  const prev = loadSyncStatus();
  if (!cfg.token) {
    const status = emit({
      state: "error",
      pending: false,
      code: "auth",
      message: "Paste a token first. It stays on this phone.",
      lastSyncedAt: prev.lastSyncedAt,
    });
    return { ok: false, message: status.message, code: status.code };
  }
  if (!isOnline()) {
    const status = emit({
      state: "error",
      pending: prev.pending,
      code: "offline",
      message: "You're offline, so the connection can't be tested right now.",
      lastSyncedAt: prev.lastSyncedAt,
    });
    return { ok: false, message: status.message, code: status.code };
  }
  try {
    const gate = await assertPrivateRepo(cfg);
    if (!gate.ok) {
      const status = emit({
        state: "error",
        pending: false,
        code: gate.code,
        message: gate.message,
        lastSyncedAt: prev.lastSyncedAt,
      });
      return { ok: false, refused: gate.code === "public_repo" || gate.code === "blocked_repo", message: status.message, code: status.code };
    }
    const status = emit({
      state: prev.pending ? "pending" : "idle",
      pending: prev.pending,
      code: "ok",
      message: "Connected. This repo is private, so it's safe to sync.",
      lastSyncedAt: prev.lastSyncedAt,
    });
    return { ok: true, message: status.message, code: "ok" };
  } catch (err) {
    const status = emit({
      state: "error",
      pending: false,
      code: err.code || "network",
      message: err.message || friendlyMessage(err.code || "network"),
      lastSyncedAt: prev.lastSyncedAt,
    });
    return { ok: false, message: status.message, code: status.code };
  }
}

export function installSyncRetries() {
  if (typeof window === "undefined") return () => {};
  const retryIfPending = () => {
    if (loadSyncStatus().pending && isOnline()) void kick();
  };
  const onVisible = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden" && timer) {
      clearTimeout(timer);
      timer = null;
      void kick();
      return;
    }
    if (document.visibilityState === "visible") retryIfPending();
  };
  window.addEventListener("online", retryIfPending);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  const interval = window.setInterval(retryIfPending, 60000);
  return () => {
    window.removeEventListener("online", retryIfPending);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(interval);
  };
}
