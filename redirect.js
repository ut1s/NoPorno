const ENCOURAGING_MESSAGES = [
  "Good pause. Your future self thanks you.",
  "You caught yourself. That takes real strength.",
  "Redirecting your energy somewhere better.",
  "Every interruption is a small win.",
  "Pause accepted. Momentum protected.",
  "This choice builds discipline one step at a time.",
  "You are steering, not drifting.",
  "A calm pivot now pays off later.",
  "You just made the harder, better choice.",
  "Small resets become big progress."
];

const QUOTES = [
  "Success is the sum of small efforts, repeated day in and day out.",
  "The quality of your focus determines the quality of your life.",
  "Discipline is choosing what you want most over what you want now.",
  "Clarity comes from action, not overthinking.",
  "When your attention improves, your life improves.",
  "You do not rise to goals, you fall to systems.",
  "A better future is built in ordinary moments.",
  "The best way out is always through.",
  "Protect your mind and your priorities follow.",
  "Energy flows where attention goes.",
  "A short pause can prevent a long regret.",
  "Self-control is self-respect in motion.",
  "Progress is built by what you repeat.",
  "You become what you practice.",
  "Focus is a competitive advantage.",
  "Direction matters more than speed.",
  "Consistency beats intensity over time.",
  "You can start over at any moment.",
  "The next decision can change the day.",
  "Good habits are quiet investments.",
  "Your attention is your most valuable asset.",
  "A calm mind sees better options.",
  "Master your choices and your choices master your future.",
  "One intentional action beats ten impulses.",
  "The person you are becoming is watching.",
  "Short-term urges are not long-term identity.",
  "Choose what strengthens you.",
  "Attention is a skill. Train it.",
  "A better path begins with one honest redirect.",
  "Your habits write your story.",
  "Small wins compound.",
  "What you feed grows.",
  "Protect your momentum.",
  "Each pause is proof of control.",
  "Your future rewards today’s discipline."
];

const DESTINATIONS = {
  mentalReset: {
    title: "Mental reset",
    subtitle: "Calm your nervous system first",
    sites: [
      "https://www.calm.com",
      "https://www.noisli.com",
      "https://mynoise.net",
      "https://lofi.cafe"
    ]
  },
  learn: {
    title: "Learn something new",
    subtitle: "Shift into curiosity",
    sites: [
      "https://en.wikipedia.org/wiki/Special:Random",
      "https://www.ted.com/talks",
      "https://www.khanacademy.org",
      "https://www.coursera.org/browse",
      "https://www.howstuffworks.com"
    ]
  },
  active: {
    title: "Do something active",
    subtitle: "Move hands and body",
    sites: [
      "https://www.duolingo.com",
      "https://www.keybr.com",
      "https://www.chess.com/puzzles",
      "https://www.codewars.com",
      "https://sketch.io/sketchpad"
    ]
  }
};

const CATEGORY_ORDER = ["mentalReset", "learn", "active"];
const BREATH_CYCLE_SECONDS = 12;
const AUTO_REDIRECT_SECONDS = 10;

const encouragingMessageEl = document.getElementById("encouraging-message");
const quoteEl = document.getElementById("motivation-quote");
const breathingPhaseEl = document.getElementById("breathing-phase");
const cardGridEl = document.getElementById("card-grid");
const cardsNoteEl = document.getElementById("cards-note");
const customDestinationEl = document.getElementById("custom-destination");
const customLinkEl = document.getElementById("custom-link");
const countdownEl = document.getElementById("countdown-text");
const cancelTimerBtn = document.getElementById("cancel-timer-btn");
const statusEl = document.getElementById("status-message");

let timerId = null;
let timerCancelled = false;
let autoTarget = null;
let chosenCards = [];
let activeCategoryKeys = [];

init().catch((error) => {
  setStatus(`Setup issue: ${error instanceof Error ? error.message : String(error)}`);
});

async function init() {
  enforceBackButtonBlock();
  startBreathingGuide();

  encouragingMessageEl.textContent = pickRandom(ENCOURAGING_MESSAGES);
  quoteEl.textContent = `"${pickRandom(QUOTES)}"`;

  const sync = await chrome.storage.sync.get({
    categoryToggles: {
      mentalReset: true,
      learn: true,
      active: true
    },
    strictMode: false,
    customRedirectUrl: ""
  });

  const strictMode = Boolean(sync.strictMode);
  const customRedirectUrl = toSafeHttpUrl(sync.customRedirectUrl);

  const categoryToggles = {
    mentalReset: Boolean(sync.categoryToggles?.mentalReset),
    learn: Boolean(sync.categoryToggles?.learn),
    active: Boolean(sync.categoryToggles?.active)
  };

  activeCategoryKeys = CATEGORY_ORDER.filter((key) => categoryToggles[key]);
  if (activeCategoryKeys.length === 0) {
    activeCategoryKeys = [...CATEGORY_ORDER];
    cardsNoteEl.textContent =
      "All categories were disabled, so default options are shown for safety.";
  }

  chosenCards = buildCards(activeCategoryKeys);
  renderCards(chosenCards);

  const blockedDomain = getBlockedDomainFromQuery();
  let chosenCategoryForLog = chosenCards[0]?.categoryKey || "none";

  if (customRedirectUrl) {
    customDestinationEl.hidden = false;
    customLinkEl.href = customRedirectUrl;
    customLinkEl.addEventListener("click", async (event) => {
      event.preventDefault();
      stopTimer();
      await navigateWithFallback("custom", customRedirectUrl);
    });

    autoTarget = {
      categoryKey: "custom",
      url: customRedirectUrl
    };
    chosenCategoryForLog = "custom";
  } else if (chosenCards.length > 0) {
    autoTarget = {
      categoryKey: chosenCards[0].categoryKey,
      url: chosenCards[0].url
    };
  }

  void chrome.runtime.sendMessage({
    type: "redirect:log",
    payload: {
      domain: blockedDomain,
      category: chosenCategoryForLog
    }
  });

  if (strictMode) {
    countdownEl.textContent = "Strict mode is on. Pick a card to continue.";
    cancelTimerBtn.hidden = true;
    return;
  }

  if (!autoTarget?.url) {
    countdownEl.textContent = "Pick a card to continue.";
    cancelTimerBtn.hidden = true;
    return;
  }

  startTimer(autoTarget.categoryKey, autoTarget.url);
  cancelTimerBtn.addEventListener("click", () => {
    timerCancelled = true;
    stopTimer();
    countdownEl.textContent = "Auto-redirect cancelled. Choose any card.";
    setStatus("Auto-redirect paused.");
  });
}

function enforceBackButtonBlock() {
  history.replaceState({ npRedirect: true }, "", location.href);
  history.pushState({ npRedirect: true }, "", location.href);

  window.addEventListener("popstate", () => {
    history.pushState({ npRedirect: true }, "", location.href);
  });
}

function startBreathingGuide() {
  const startedAt = Date.now();

  const tick = () => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const cycleSecond = elapsedSeconds % BREATH_CYCLE_SECONDS;

    if (cycleSecond < 4) {
      breathingPhaseEl.textContent = "Inhale";
      return;
    }

    if (cycleSecond < 8) {
      breathingPhaseEl.textContent = "Hold";
      return;
    }

    breathingPhaseEl.textContent = "Exhale";
  };

  tick();
  window.setInterval(tick, 250);
}

function buildCards(categoryKeys) {
  return categoryKeys.map((categoryKey) => {
    const category = DESTINATIONS[categoryKey];
    return {
      categoryKey,
      title: category.title,
      subtitle: category.subtitle,
      url: pickRandom(category.sites)
    };
  });
}

function renderCards(cards) {
  cardGridEl.innerHTML = "";

  for (const card of cards) {
    const wrapper = document.createElement("article");
    wrapper.className = "redirect-card";

    const title = document.createElement("h3");
    title.textContent = card.title;

    const subtitle = document.createElement("p");
    subtitle.textContent = card.subtitle;

    const url = document.createElement("p");
    url.className = "card-url";
    url.textContent = card.url;

    const button = document.createElement("button");
    button.className = "redirect-btn";
    button.type = "button";
    button.textContent = "Go now";
    button.addEventListener("click", async () => {
      stopTimer();
      await navigateWithFallback(card.categoryKey, card.url);
    });

    wrapper.appendChild(title);
    wrapper.appendChild(subtitle);
    wrapper.appendChild(url);
    wrapper.appendChild(button);
    cardGridEl.appendChild(wrapper);
  }
}

function startTimer(categoryKey, destinationUrl) {
  let remaining = AUTO_REDIRECT_SECONDS;
  countdownEl.textContent = `Redirecting in ${remaining}s`;

  timerId = window.setInterval(async () => {
    if (timerCancelled) {
      stopTimer();
      return;
    }

    remaining -= 1;

    if (remaining <= 0) {
      stopTimer();
      countdownEl.textContent = "Redirecting now...";
      await navigateWithFallback(categoryKey, destinationUrl);
      return;
    }

    countdownEl.textContent = `Redirecting in ${remaining}s`;
  }, 1000);
}

function stopTimer() {
  if (!timerId) {
    return;
  }

  clearInterval(timerId);
  timerId = null;
}

async function navigateWithFallback(categoryKey, preferredUrl) {
  const fallbackList = buildFallbackList(categoryKey, preferredUrl);

  setStatus("Checking destination...");

  for (const candidate of fallbackList) {
    const reachable = await isReachable(candidate);
    if (reachable) {
      setStatus("Opening destination...");
      window.location.assign(candidate);
      return;
    }
  }

  setStatus("Could not verify reachability. Opening the original choice.");
  window.location.assign(preferredUrl);
}

function buildFallbackList(categoryKey, preferredUrl) {
  const list = [preferredUrl];

  if (categoryKey in DESTINATIONS) {
    const primarySites = shuffle(
      DESTINATIONS[categoryKey].sites.filter((url) => url !== preferredUrl)
    );
    list.push(...primarySites);
  }

  const secondaryCategories = CATEGORY_ORDER.filter(
    (key) => activeCategoryKeys.includes(key) && key !== categoryKey
  );

  for (const key of secondaryCategories) {
    list.push(...shuffle(DESTINATIONS[key].sites));
  }

  return [...new Set(list)];
}

async function isReachable(url) {
  const timeoutMs = 3000;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    return true;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getBlockedDomainFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const blocked = (params.get("blocked") || "").trim().toLowerCase();
  return sanitizeDomain(blocked);
}

function sanitizeDomain(value) {
  if (!value) {
    return "unknown";
  }

  const domain = value.split("/")[0].split(":")[0].replace(/^www\./, "");
  const valid = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;
  return valid.test(domain) ? domain : "unknown";
}

function toSafeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const parsed = new URL(value.trim());
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

function shuffle(list) {
  const clone = [...list];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function setStatus(message) {
  statusEl.textContent = message;
}
