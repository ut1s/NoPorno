const STORAGE_SYNC_KEYS = {
  enabled: "enabled",
  blocklist: "blocklist",
  categoryToggles: "categoryToggles",
  strictMode: "strictMode",
  customRedirectUrl: "customRedirectUrl",
  settingsPinHash: "settingsPinHash"
};

const STORAGE_LOCAL_KEYS = {
  redirectHistory: "redirectHistory",
  ruleLoadError: "ruleLoadError",
  ruleLoadErrorAt: "ruleLoadErrorAt"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 100;
const DNR_RULE_ID_START = 1000;
const DNR_MAX_RULES = 5000;

const DEFAULT_BLOCKLIST = [
  "*://*.pornhub.com/*",
  "*://*.xvideos.com/*",
  "*://*.xnxx.com/*",
  "*://*.xhamster.com/*",
  "*://*.redtube.com/*",
  "*://*.youporn.com/*",
  "*://*.tube8.com/*",
  "*://*.spankbang.com/*",
  "*://*.beeg.com/*",
  "*://*.brazzers.com/*",
  "*://*.chaturbate.com/*",
  "*://*.livejasmin.com/*",
  "*://*.stripchat.com/*",
  "*://*.camsoda.com/*",
  "*://*.myfreecams.com/*",
  "*://*.cam4.com/*",
  "*://*.txxx.com/*",
  "*://*.porn.com/*",
  "*://*.drtuber.com/*",
  "*://*.nhentai.net/*",
  "*://*.rule34.xxx/*",
  "*://*.fapello.com/*",
  "*://*.faphouse.com/*",
  "*://*.motherless.com/*",
  "*://*.eporner.com/*",
  "*://*.hqporner.com/*",
  "*://*.pornone.com/*",
  "*://*.thumbzilla.com/*",
  "*://*.nuvid.com/*",
  "*://*.tnaflix.com/*",
  "*://*.porndig.com/*",
  "*://*.sunporno.com/*",
  "*://*.slutload.com/*",
  "*://*.spankwire.com/*",
  "*://*.pornerbros.com/*",
  "*://*.sex.com/*",
  "*://*.mofos.com/*",
  "*://*.realitykings.com/*",
  "*://*.bangbros.com/*",
  "*://*.evilangel.com/*",
  "*://*.dogfartnetwork.com/*",
  "*://*.hclips.com/*",
  "*://*.3movs.com/*",
  "*://*.gotporn.com/*",
  "*://*.keezmovies.com/*",
  "*://*.pornhd.com/*",
  "*://*.fux.com/*",
  "*://*.porntrex.com/*",
  "*://*.hentaifox.com/*",
  "*://*.xnalgas.com/*",
  "*://*.jav.guru/*",
  "*://*.javhd.com/*",
  "*://*.xgroovy.com/*",
  "*://*.xxxbunker.com/*",
  "*://*.hdtube.xxx/*"
];

const DEFAULT_SYNC_SETTINGS = {
  enabled: true,
  blocklist: DEFAULT_BLOCKLIST,
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

  return {
    enabled: Boolean(sync[STORAGE_SYNC_KEYS.enabled]),
    blocklistSize: Array.isArray(sync[STORAGE_SYNC_KEYS.blocklist])
      ? sync[STORAGE_SYNC_KEYS.blocklist].length
      : 0,
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
  const blocklist = sanitizeBlocklist(sync[STORAGE_SYNC_KEYS.blocklist]);
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

function buildDynamicRules(blocklist) {
  const safeList = blocklist.slice(0, DNR_MAX_RULES);

  return safeList.map((pattern, index) => {
    const domain = patternToDomain(pattern) || "unknown-domain";

    return {
      id: DNR_RULE_ID_START + index,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          extensionPath: `/redirect.html?blocked=${encodeURIComponent(domain)}`
        }
      },
      condition: {
        urlFilter: pattern,
        resourceTypes: ["main_frame"]
      }
    };
  });
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
    return [...DEFAULT_BLOCKLIST];
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

function isValidDomain(value) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(
    value
  );
}
