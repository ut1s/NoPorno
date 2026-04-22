const extensionApi =
  typeof globalThis.browser !== "undefined" ? globalThis.browser : globalThis.chrome;

const REDIRECT_DELAY_SECONDS = 3;

const fallbackGoodsites = [
  "https://www.wikihow.com/Deal-With-Porn-Addiction",
  "https://explore.org/livecams",
  "https://www.ted.com/talks"
];

const blockedDomainEl = document.getElementById("blocked-domain");
const countdownTextEl = document.getElementById("countdown-text");
const redirectNowBtn = document.getElementById("redirect-now-btn");
const statusTextEl = document.getElementById("status-text");

let remainingSeconds = REDIRECT_DELAY_SECONDS;
let hasRedirected = false;
let intervalId = null;

const blockedDomain = getBlockedDomainFromQuery();
const blockedSubreddit = getBlockedSubredditFromQuery();
const blockedKeyword = getBlockedKeywordFromQuery();
const destinationList = getSafeGoodsites();
const targetUrl = pickRandom(destinationList);

if ((blockedDomain && blockedDomain !== "unknown") || blockedSubreddit || blockedKeyword) {
  blockedDomainEl.hidden = false;
  blockedDomainEl.textContent = buildBlockedContextText(
    blockedDomain,
    blockedSubreddit,
    blockedKeyword
  );
}

void extensionApi.runtime.sendMessage({
  type: "redirect:log",
  payload: {
    domain: blockedDomain,
    category: blockedSubreddit ? "reddit" : blockedKeyword ? "deviantart" : "goodsites"
  }
});

updateCountdownText();
intervalId = setInterval(() => {
  remainingSeconds -= 1;

  if (remainingSeconds <= 0) {
    redirectToGoodsite();
    return;
  }

  updateCountdownText();
}, 1000);

redirectNowBtn.addEventListener("click", () => {
  redirectToGoodsite();
});

function updateCountdownText() {
  countdownTextEl.textContent = `Redirecting in ${remainingSeconds} second${
    remainingSeconds === 1 ? "" : "s"
  }...`;
}

function redirectToGoodsite() {
  if (hasRedirected) {
    return;
  }

  hasRedirected = true;
  clearInterval(intervalId);
  setStatus("Redirecting now...");
  window.location.replace(targetUrl);
}

function getSafeGoodsites() {
  const fromLegacyFile = Array.isArray(globalThis.goodsites) ? globalThis.goodsites : [];

  const normalized = fromLegacyFile
    .map((value) => normalizeHttpUrl(value))
    .filter((value) => typeof value === "string" && value.length > 0);

  if (normalized.length === 0) {
    return [...fallbackGoodsites];
  }

  return [...new Set(normalized)];
}

function normalizeHttpUrl(value) {
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

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getBlockedDomainFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const blockedValue = (params.get("blocked") || "").trim().toLowerCase();
  return sanitizeDomain(blockedValue);
}

function getBlockedSubredditFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeSubreddit(params.get("subreddit") || "");
}

function getBlockedKeywordFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeKeyword(params.get("keyword") || "");
}

function sanitizeDomain(value) {
  if (!value) {
    return "unknown";
  }

  const domain = value.split("/")[0].split(":")[0].replace(/^www\./, "");
  const validDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

  return validDomain.test(domain) ? domain : "unknown";
}

function setStatus(message) {
  statusTextEl.textContent = message;
}

function sanitizeSubreddit(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const prefixed = trimmed.match(/^(?:\/)?r\/([a-z0-9_]{2,64})$/);
  if (prefixed) {
    return `r/${prefixed[1]}`;
  }

  const direct = trimmed.match(/^([a-z0-9_]{2,64})$/);
  if (direct) {
    return `r/${direct[1]}`;
  }

  return "";
}

function sanitizeKeyword(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.slice(0, 64);
}

function buildBlockedContextText(domain, subreddit, keyword) {
  if (domain && domain !== "unknown" && subreddit) {
    return `Blocked subreddit: ${subreddit} on ${domain}`;
  }

  if (subreddit) {
    return `Blocked subreddit: ${subreddit}`;
  }

  if (domain && domain !== "unknown" && keyword) {
    return `Blocked search keyword: "${keyword}" on ${domain}`;
  }

  if (keyword) {
    return `Blocked search keyword: "${keyword}"`;
  }

  return `Blocked domain: ${domain}`;
}
