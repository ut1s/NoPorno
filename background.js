const STORAGE_SYNC_KEYS = {
  enabled: "enabled",
  blocklist: "blocklist",
  categoryToggles: "categoryToggles",
  strictMode: "strictMode",
  customRedirectUrl: "customRedirectUrl",
  settingsPinHash: "settingsPinHash"
};

try {
  importScripts("badsites.js");
} catch (error) {
  console.error("NoPorno: failed to load badsites.js", error);
}

try {
  importScripts("reddits.js");
} catch (error) {
  console.error("NoPorno: failed to load reddits.js", error);
}

const STORAGE_LOCAL_KEYS = {
  redirectHistory: "redirectHistory",
  ruleLoadError: "ruleLoadError",
  ruleLoadErrorAt: "ruleLoadErrorAt"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 100;
const DNR_RULE_ID_START = 1000;
const DNR_FALLBACK_MAX_RULES = 5000;

const FALLBACK_BLOCKLIST = [
  "*://*.pornhub.com/*",
  "*://*.xvideos.com/*",
  "*://*.xnxx.com/*",
  "*://*.xhamster.com/*",
  "*://*.redtube.com/*",
  "*://*.youporn.com/*"
];

const BUILTIN_BLOCKLIST = buildDefaultBlocklistFromBadsites();
const REDDIT_VIEWER_MATCHERS = buildRedditViewerMatchers();
const REDDIT_BLOCKED_SUBREDDITS = buildBlockedSubredditSet();

const DEFAULT_SYNC_SETTINGS = {
  enabled: true,
  // Keep only user-managed entries in sync storage to avoid quota overflows.
  blocklist: [],
  categoryToggles: {
    mentalReset: true,
    learn: true,
    active: true
  },
  strictMode: false,
  customRedirectUrl: "",
  settingsPinHash: ""
};

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  if (changes.enabled || changes.blocklist) {
    void rebuildDynamicRules();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      console.error("NoPorno message handling failed:", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function initializeExtension() {
  await ensureSyncDefaults();
  await updateBadge();
  await rebuildDynamicRules();
}

async function ensureSyncDefaults() {
  const keys = Object.keys(DEFAULT_SYNC_SETTINGS);
  const existing = await chrome.storage.sync.get(keys);
  const updates = {};

  for (const key of keys) {
    if (existing[key] === undefined) {
      updates[key] = DEFAULT_SYNC_SETTINGS[key];
    }
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }
}

async function handleMessage(message) {
  switch (message?.type) {
    case "popup:getState":
      return await buildPopupState();

    case "popup:setEnabled": {
      await setEnabled(Boolean(message.enabled));
      return await buildPopupState();
    }

    case "popup:quickAddDomain": {
      const addedPattern = await quickAddDomain(message.domain);
      return { addedPattern, ...(await buildPopupState()) };
    }

    case "settings:getState":
      return await buildSettingsState();

    case "settings:save": {
      await saveSettings(message.payload || {});
      return await buildSettingsState();
    }

    case "settings:clearHistory": {
      await chrome.storage.local.set({ [STORAGE_LOCAL_KEYS.redirectHistory]: [] });
      return await buildSettingsState();
    }

    case "redirect:log": {
      await logRedirectEvent(message.payload || {});
      return {};
    }

    case "content:checkRedditUrl":
      return await evaluateRedditBlockRequest(message.url);

    case "content:blockedDomainSeen":
      return {};

    default:
      throw new Error("Unsupported message type.");
  }
}

async function buildPopupState() {
  const sync = await chrome.storage.sync.get([
    STORAGE_SYNC_KEYS.enabled,
    STORAGE_SYNC_KEYS.blocklist
  ]);
  const local = await chrome.storage.local.get([
    STORAGE_LOCAL_KEYS.redirectHistory,
    STORAGE_LOCAL_KEYS.ruleLoadError,
    STORAGE_LOCAL_KEYS.ruleLoadErrorAt
  ]);

  const history = Array.isArray(local[STORAGE_LOCAL_KEYS.redirectHistory])
    ? local[STORAGE_LOCAL_KEYS.redirectHistory]
    : [];

  const stats = calculateStats(history);
  const customBlocklist = sanitizeBlocklist(sync[STORAGE_SYNC_KEYS.blocklist]);
  const effectiveBlocklist = getEffectiveBlocklist(customBlocklist);

  return {
    enabled: Boolean(sync[STORAGE_SYNC_KEYS.enabled]),
    blocklistSize: effectiveBlocklist.length,
    todayCount: stats.today,
    weekCount: stats.week,
    ruleLoadError: local[STORAGE_LOCAL_KEYS.ruleLoadError] || "",
    ruleLoadErrorAt: local[STORAGE_LOCAL_KEYS.ruleLoadErrorAt] || 0
  };
}

async function buildSettingsState() {
  const sync = await chrome.storage.sync.get([
    STORAGE_SYNC_KEYS.enabled,
    STORAGE_SYNC_KEYS.blocklist,
    STORAGE_SYNC_KEYS.categoryToggles,
    STORAGE_SYNC_KEYS.strictMode,
    STORAGE_SYNC_KEYS.customRedirectUrl,
    STORAGE_SYNC_KEYS.settingsPinHash
  ]);
  const local = await chrome.storage.local.get([
    STORAGE_LOCAL_KEYS.redirectHistory,
    STORAGE_LOCAL_KEYS.ruleLoadError,
    STORAGE_LOCAL_KEYS.ruleLoadErrorAt
  ]);

  const history = Array.isArray(local[STORAGE_LOCAL_KEYS.redirectHistory])
    ? local[STORAGE_LOCAL_KEYS.redirectHistory]
    : [];

  return {
    enabled: Boolean(sync[STORAGE_SYNC_KEYS.enabled]),
    blocklist: sanitizeBlocklist(sync[STORAGE_SYNC_KEYS.blocklist]),
    categoryToggles: sanitizeCategoryToggles(sync[STORAGE_SYNC_KEYS.categoryToggles]),
    strictMode: Boolean(sync[STORAGE_SYNC_KEYS.strictMode]),
    customRedirectUrl: sanitizeCustomRedirectUrl(sync[STORAGE_SYNC_KEYS.customRedirectUrl]),
    settingsPinHash:
      typeof sync[STORAGE_SYNC_KEYS.settingsPinHash] === "string"
        ? sync[STORAGE_SYNC_KEYS.settingsPinHash]
        : "",
    historyCount: history.length,
    ruleLoadError: local[STORAGE_LOCAL_KEYS.ruleLoadError] || "",
    ruleLoadErrorAt: local[STORAGE_LOCAL_KEYS.ruleLoadErrorAt] || 0
  };
}

async function setEnabled(enabled) {
  await chrome.storage.sync.set({ [STORAGE_SYNC_KEYS.enabled]: enabled });
  await updateBadge(enabled);
  await rebuildDynamicRules();
}

async function quickAddDomain(input) {
  const pattern = normalizePattern(input);

  if (!pattern) {
    throw new Error("Please enter a valid domain or URL.");
  }

  const sync = await chrome.storage.sync.get(STORAGE_SYNC_KEYS.blocklist);
  const existing = sanitizeBlocklist(sync[STORAGE_SYNC_KEYS.blocklist]);
  const next = dedupe([pattern, ...existing]);

  await chrome.storage.sync.set({ [STORAGE_SYNC_KEYS.blocklist]: next });
  await rebuildDynamicRules();

  return pattern;
}

async function saveSettings(payload) {
  const updates = {};

  if ("enabled" in payload) {
    updates[STORAGE_SYNC_KEYS.enabled] = Boolean(payload.enabled);
  }

  if ("blocklist" in payload) {
    updates[STORAGE_SYNC_KEYS.blocklist] = sanitizeBlocklist(payload.blocklist);
  }

  if ("categoryToggles" in payload) {
    updates[STORAGE_SYNC_KEYS.categoryToggles] = sanitizeCategoryToggles(
      payload.categoryToggles
    );
  }

  if ("strictMode" in payload) {
    updates[STORAGE_SYNC_KEYS.strictMode] = Boolean(payload.strictMode);
  }

  if ("customRedirectUrl" in payload) {
    updates[STORAGE_SYNC_KEYS.customRedirectUrl] = sanitizeCustomRedirectUrl(
      payload.customRedirectUrl
    );
  }

  if ("settingsPinHash" in payload) {
    updates[STORAGE_SYNC_KEYS.settingsPinHash] =
      typeof payload.settingsPinHash === "string"
        ? payload.settingsPinHash.trim()
        : "";
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  await chrome.storage.sync.set(updates);

  if (Object.prototype.hasOwnProperty.call(updates, STORAGE_SYNC_KEYS.enabled)) {
    await updateBadge(Boolean(updates[STORAGE_SYNC_KEYS.enabled]));
  }

  if (
    Object.prototype.hasOwnProperty.call(updates, STORAGE_SYNC_KEYS.enabled) ||
    Object.prototype.hasOwnProperty.call(updates, STORAGE_SYNC_KEYS.blocklist)
  ) {
    await rebuildDynamicRules();
  }
}

async function rebuildDynamicRules() {
  const sync = await chrome.storage.sync.get([
    STORAGE_SYNC_KEYS.enabled,
    STORAGE_SYNC_KEYS.blocklist
  ]);

  const enabled = Boolean(sync[STORAGE_SYNC_KEYS.enabled]);
  const customBlocklist = sanitizeBlocklist(sync[STORAGE_SYNC_KEYS.blocklist]);
  const blocklist = getEffectiveBlocklist(customBlocklist);
  const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();

  const removeRuleIds = dynamicRules.map((rule) => rule.id);
  const addRules = enabled ? buildDynamicRules(blocklist) : [];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });

    await clearRuleLoadError();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await chrome.storage.local.set({
      [STORAGE_LOCAL_KEYS.ruleLoadError]: message,
      [STORAGE_LOCAL_KEYS.ruleLoadErrorAt]: Date.now()
    });
  }
}

async function evaluateRedditBlockRequest(rawUrl) {
  const sync = await chrome.storage.sync.get({
    [STORAGE_SYNC_KEYS.enabled]: DEFAULT_SYNC_SETTINGS.enabled
  });
  const enabled = Boolean(sync[STORAGE_SYNC_KEYS.enabled]);

  if (!enabled) {
    return { shouldBlock: false };
  }

  const blockedSubreddit = findBlockedSubredditForViewerUrl(rawUrl);
  if (!blockedSubreddit) {
    return { shouldBlock: false };
  }

  return {
    shouldBlock: true,
    blockedSubreddit: `r/${blockedSubreddit}`
  };
}

function buildDynamicRules(blocklist) {
  const maxRuleCount = getMaxDynamicRuleCount();
  const safeList = blocklist.slice(0, maxRuleCount);
  const rules = [];

  for (const pattern of safeList) {
    const domain = patternToDomain(pattern);
    if (!domain) {
      continue;
    }

    rules.push({
      id: DNR_RULE_ID_START + rules.length,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          extensionPath: `/redirect.html?blocked=${encodeURIComponent(domain)}`
        }
      },
      condition: {
        // DNR urlFilter syntax uses adblock-style rules. This form matches
        // both apex domains and subdomains (e.g. example.com + www.example.com).
        urlFilter: buildDomainUrlFilter(domain),
        resourceTypes: ["main_frame"]
      }
    });
  }

  return rules;
}

function getMaxDynamicRuleCount() {
  const fromApi = Number(
    chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES ||
      chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES
  );

  if (Number.isFinite(fromApi) && fromApi > 0) {
    return Math.floor(fromApi);
  }

  return DNR_FALLBACK_MAX_RULES;
}

function buildDomainUrlFilter(domain) {
  return `||${domain}^`;
}

async function logRedirectEvent(payload) {
  const domain = sanitizeDomainForLog(payload.domain);

  if (!domain) {
    return;
  }

  const category =
    typeof payload.category === "string" && payload.category.trim()
      ? payload.category.trim().slice(0, 32)
      : "unknown";

  const local = await chrome.storage.local.get(STORAGE_LOCAL_KEYS.redirectHistory);
  const existing = Array.isArray(local[STORAGE_LOCAL_KEYS.redirectHistory])
    ? local[STORAGE_LOCAL_KEYS.redirectHistory]
    : [];

  const next = [
    ...existing,
    {
      timestamp: Date.now(),
      domain,
      category
    }
  ].slice(-MAX_HISTORY_ENTRIES);

  await chrome.storage.local.set({ [STORAGE_LOCAL_KEYS.redirectHistory]: next });
}

function calculateStats(history) {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const weekMs = now - 7 * DAY_MS;

  let today = 0;
  let week = 0;

  for (const entry of history) {
    const timestamp = Number(entry?.timestamp || 0);
    if (!timestamp) {
      continue;
    }

    if (timestamp >= todayMs) {
      today += 1;
    }

    if (timestamp >= weekMs) {
      week += 1;
    }
  }

  return { today, week };
}

async function clearRuleLoadError() {
  await chrome.storage.local.remove([
    STORAGE_LOCAL_KEYS.ruleLoadError,
    STORAGE_LOCAL_KEYS.ruleLoadErrorAt
  ]);
}

async function updateBadge(explicitEnabled) {
  const enabled =
    typeof explicitEnabled === "boolean"
      ? explicitEnabled
      : Boolean((await chrome.storage.sync.get(STORAGE_SYNC_KEYS.enabled))[STORAGE_SYNC_KEYS.enabled]);

  await chrome.action.setBadgeBackgroundColor({ color: "#1D9E75" });
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
}

function sanitizeBlocklist(blocklist) {
  if (!Array.isArray(blocklist)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const item of blocklist) {
    const pattern = normalizePattern(item);
    if (!pattern || seen.has(pattern)) {
      continue;
    }

    seen.add(pattern);
    normalized.push(pattern);
  }

  return normalized;
}

function dedupe(list) {
  return [...new Set(list)];
}

function buildDefaultBlocklistFromBadsites() {
  const source = Array.isArray(globalThis.badsites) ? globalThis.badsites : [];
  const patterns = source
    .map((entry) => normalizePattern(entry))
    .filter((entry) => typeof entry === "string" && entry.length > 0);

  if (patterns.length === 0) {
    return [...FALLBACK_BLOCKLIST];
  }

  return dedupe(patterns);
}

function getEffectiveBlocklist(customBlocklist) {
  return dedupe([...(Array.isArray(BUILTIN_BLOCKLIST) ? BUILTIN_BLOCKLIST : []), ...customBlocklist]);
}

function normalizePattern(input) {
  if (typeof input !== "string") {
    return null;
  }

  let value = input.trim().toLowerCase();
  if (!value) {
    return null;
  }

  const directPatternMatch = value.match(/^\*:\/\/\*\.([^/*?#]+)\/\*$/);
  if (directPatternMatch && isValidDomain(directPatternMatch[1])) {
    return `*://*.${directPatternMatch[1]}/*`;
  }

  if (value.includes("://")) {
    try {
      value = new URL(value).hostname.toLowerCase();
    } catch (_error) {
      return null;
    }
  } else {
    value = value.replace(/^\*:\/\/\*\./, "");
    value = value.replace(/^\*\./, "");
    value = value.replace(/^www\./, "");
    value = value.split("/")[0];
    value = value.split(":")[0];
    value = value.trim();
  }

  if (!isValidDomain(value)) {
    return null;
  }

  return `*://*.${value}/*`;
}

function patternToDomain(pattern) {
  if (typeof pattern !== "string") {
    return "";
  }

  const match = pattern.toLowerCase().match(/^\*:\/\/\*\.([^/*?#]+)\/\*$/);
  return match ? match[1] : "";
}

function sanitizeCategoryToggles(value) {
  const merged = {
    ...DEFAULT_SYNC_SETTINGS.categoryToggles,
    ...(value || {})
  };

  return {
    mentalReset: Boolean(merged.mentalReset),
    learn: Boolean(merged.learn),
    active: Boolean(merged.active)
  };
}

function sanitizeCustomRedirectUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

function sanitizeDomainForLog(value) {
  if (typeof value !== "string") {
    return "";
  }

  let domain = value.trim().toLowerCase();
  if (!domain) {
    return "";
  }

  if (domain.includes("://")) {
    try {
      domain = new URL(domain).hostname.toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  domain = domain.split("/")[0].split(":")[0].replace(/^www\./, "");
  return isValidDomain(domain) ? domain : "";
}

function buildRedditViewerMatchers() {
  const source = Array.isArray(globalThis.reddithref) ? globalThis.reddithref : [];
  const uniqueMatchers = new Map();

  for (const entry of source) {
    const matcher = normalizeViewerMatcher(entry);
    if (!matcher) {
      continue;
    }

    uniqueMatchers.set(`${matcher.host}${matcher.pathPrefix}`, matcher);
  }

  return [...uniqueMatchers.values()];
}

function normalizeViewerMatcher(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;
  candidate = candidate.replace(/^\*:\/\/\*\./, "https://");
  candidate = candidate.replace(/^\*:\/\//, "https://");

  if (!candidate.includes("://")) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!isValidDomain(host)) {
      return null;
    }

    return {
      host,
      pathPrefix: normalizePathPrefix(parsed.pathname)
    };
  } catch (_error) {
    return null;
  }
}

function normalizePathPrefix(pathname) {
  let value = typeof pathname === "string" && pathname ? pathname.toLowerCase() : "/";

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/+/g, "/");

  if (!value.endsWith("/")) {
    value = `${value}/`;
  }

  return value;
}

function buildBlockedSubredditSet() {
  const source = Array.isArray(globalThis.subreddits) ? globalThis.subreddits : [];
  const blocked = new Set();

  for (const item of source) {
    const subreddit = normalizeSubredditName(item);
    if (!subreddit) {
      continue;
    }

    blocked.add(subreddit);
  }

  return blocked;
}

function normalizeSubredditName(value) {
  if (typeof value !== "string") {
    return "";
  }

  const lower = value.trim().toLowerCase();
  if (!lower) {
    return "";
  }

  const prefixedMatch = lower.match(/(?:^|\/)r\/([a-z0-9_]{2,64})/);
  if (prefixedMatch) {
    return prefixedMatch[1];
  }

  const directMatch = lower.match(/^([a-z0-9_]{2,64})$/);
  return directMatch ? directMatch[1] : "";
}

function findBlockedSubredditForViewerUrl(rawUrl) {
  if (typeof rawUrl !== "string" || REDDIT_VIEWER_MATCHERS.length === 0) {
    return "";
  }

  if (!(REDDIT_BLOCKED_SUBREDDITS instanceof Set) || REDDIT_BLOCKED_SUBREDDITS.size === 0) {
    return "";
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_error) {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = normalizeComparablePath(parsed.pathname);

  const viewer = REDDIT_VIEWER_MATCHERS.find(
    (matcher) => matcher.host === host && path.startsWith(matcher.pathPrefix)
  );

  if (!viewer) {
    return "";
  }

  const relativePath = path.startsWith(viewer.pathPrefix)
    ? path.slice(viewer.pathPrefix.length)
    : path.slice(1);

  const fromPath = findBlockedSubredditInPath(relativePath);
  if (fromPath) {
    return fromPath;
  }

  const fromSearch = findBlockedSubredditInSearch(parsed.searchParams);
  if (fromSearch) {
    return fromSearch;
  }

  return findBlockedSubredditInFragment(parsed.hash);
}

function normalizeComparablePath(pathname) {
  let value = typeof pathname === "string" && pathname ? pathname.toLowerCase() : "/";

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  return value.replace(/\/+/g, "/");
}

function findBlockedSubredditInPath(pathValue) {
  if (typeof pathValue !== "string" || !pathValue) {
    return "";
  }

  const normalized = pathValue.toLowerCase();
  const explicitMatch = normalized.match(/(?:^|[/?#=&])r\/([a-z0-9_]{2,64})(?=$|[/?#=&])/);
  if (explicitMatch && REDDIT_BLOCKED_SUBREDDITS.has(explicitMatch[1])) {
    return explicitMatch[1];
  }

  const leadingMatch = normalized.match(/^\/?([a-z0-9_]{2,64})(?=$|[/?#=&])/);
  if (leadingMatch && REDDIT_BLOCKED_SUBREDDITS.has(leadingMatch[1])) {
    return leadingMatch[1];
  }

  return "";
}

function findBlockedSubredditInSearch(searchParams) {
  if (!(searchParams instanceof URLSearchParams)) {
    return "";
  }

  const subredditKeys = new Set(["sub", "subreddit", "r", "sr", "community"]);

  for (const [key, value] of searchParams.entries()) {
    if (!subredditKeys.has((key || "").trim().toLowerCase())) {
      continue;
    }

    const candidate = normalizeSubredditName(value);
    if (candidate && REDDIT_BLOCKED_SUBREDDITS.has(candidate)) {
      return candidate;
    }
  }

  return "";
}

function findBlockedSubredditInFragment(hashValue) {
  if (typeof hashValue !== "string" || !hashValue) {
    return "";
  }

  const fragment = hashValue.replace(/^#/, "").toLowerCase();
  if (!fragment) {
    return "";
  }

  const fromPath = findBlockedSubredditInPath(fragment);
  if (fromPath) {
    return fromPath;
  }

  const hashParams = new URLSearchParams(fragment.replace(/^!/, ""));
  return findBlockedSubredditInSearch(hashParams);
}

function isValidDomain(value) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(
    value
  );
}
