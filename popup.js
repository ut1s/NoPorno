const extensionApi =
  typeof globalThis.browser !== "undefined" ? globalThis.browser : globalThis.chrome;

const enabledToggle = document.getElementById("enabled-toggle");
const toggleCaption = document.getElementById("toggle-caption");
const statsText = document.getElementById("stats-text");
const domainInput = document.getElementById("domain-input");
const addDomainBtn = document.getElementById("add-domain-btn");
const quickAddStatus = document.getElementById("quick-add-status");
const warningCard = document.getElementById("warning-card");
const warningText = document.getElementById("warning-text");
const openSettingsBtn = document.getElementById("open-settings-btn");
const disableFlow = document.getElementById("disable-flow");
const disableWarning = document.getElementById("disable-warning");
const disableWarningActions = document.getElementById("disable-warning-actions");
const disableContinueBtn = document.getElementById("disable-continue-btn");
const disableWarningCancelBtn = document.getElementById("disable-warning-cancel-btn");
const disablePinRow = document.getElementById("disable-pin-row");
const disablePinInput = document.getElementById("disable-pin-input");
const disableSubmitBtn = document.getElementById("disable-submit-btn");
const disableCountdown = document.getElementById("disable-countdown");
const disableCancelBtn = document.getElementById("disable-cancel-btn");

const protection = {
  enabled: true,
  hasPin: false,
  pendingDisableAt: null
};

let disableStep = "idle";
let countdownTimer = 0;

init().catch((error) => {
  setQuickStatus(error instanceof Error ? error.message : String(error), true);
});

async function init() {
  disableWarning.textContent = globalThis.DISABLE_WARNING;
  enabledToggle.addEventListener("change", onToggleChange);
  disableContinueBtn.addEventListener("click", () => {
    disableStep = "pin";
    renderDisableFlow();
    disablePinInput.focus();
  });
  disableWarningCancelBtn.addEventListener("click", () => {
    disableStep = "idle";
    disablePinInput.value = "";
    renderDisableFlow();
  });
  disableSubmitBtn.addEventListener("click", () => {
    void submitDisable();
  });
  disablePinInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    void submitDisable();
  });
  disableCancelBtn.addEventListener("click", () => {
    void cancelDisable();
  });
  addDomainBtn.addEventListener("click", onQuickAdd);
  domainInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    await onQuickAdd();
  });

  openSettingsBtn.addEventListener("click", () => {
    extensionApi.runtime.openOptionsPage();
  });

  await refreshState();
}

async function onToggleChange() {
  try {
    setQuickStatus("");

    if (enabledToggle.checked) {
      disableStep = "idle";
      disablePinInput.value = "";
      await sendMessage({
        type: "popup:setEnabled",
        enabled: true
      });
      await refreshState();
      setQuickStatus("Protection is on.");
      return;
    }

    enabledToggle.checked = true;

    if (!protection.hasPin) {
      disableStep = "idle";
      renderDisableFlow();
      setQuickStatus("Set a PIN in settings before turning protection off.", true);
      return;
    }

    disableStep = "warning";
    disablePinInput.value = "";
    renderDisableFlow();
  } catch (error) {
    enabledToggle.checked = protection.enabled;
    setQuickStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function submitDisable() {
  disableSubmitBtn.disabled = true;

  try {
    setQuickStatus("");
    await sendMessage({
      type: "protection:requestDisable",
      pin: disablePinInput.value
    });
    disablePinInput.value = "";
    disableStep = "idle";
    await refreshState();
  } catch (error) {
    setQuickStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    disableSubmitBtn.disabled = false;
  }
}

async function cancelDisable() {
  try {
    setQuickStatus("");
    await sendMessage({ type: "protection:cancelDisable" });
    disableStep = "idle";
    await refreshState();
    setQuickStatus("Protection stays on.");
  } catch (error) {
    setQuickStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function onQuickAdd() {
  const domain = domainInput.value.trim();
  if (!domain) {
    setQuickStatus("Enter a domain first.", true);
    return;
  }

  addDomainBtn.disabled = true;

  try {
    const response = await sendMessage({
      type: "popup:quickAddDomain",
      domain
    });

    domainInput.value = "";
    const domainLabel = patternToDomain(response.addedPattern) || response.addedPattern;
    setQuickStatus(`Added ${domainLabel} to blocklist.`);
    await refreshState();
  } catch (error) {
    setQuickStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    addDomainBtn.disabled = false;
  }
}

async function refreshState() {
  const state = await sendMessage({ type: "popup:getState" });

  protection.enabled = Boolean(state.enabled);
  protection.hasPin = Boolean(state.hasPin);
  protection.pendingDisableAt = globalThis.normalizePendingDisableAt(state.pendingDisableAt);
  enabledToggle.checked = protection.enabled;
  renderDisableFlow();
  statsText.textContent = `Redirected ${state.todayCount} times today / ${state.weekCount} times this week`;

  const warnings = [];

  if (!state.incognitoAccessAllowed) {
    warnings.push(
      "Private browsing access is disabled. Enable 'Run in Private Windows' (Firefox) or 'Allow in Incognito' (Chromium) in extension settings."
    );
  }

  if (state.ruleLoadError) {
    warnings.push(`Rules failed to load: ${state.ruleLoadError}`);
  }

  if (warnings.length > 0) {
    warningCard.hidden = false;
    warningText.textContent = warnings.join(" ");
  } else {
    warningCard.hidden = true;
    warningText.textContent = "";
  }
}

function renderDisableFlow() {
  if (!protection.enabled) {
    disableStep = "idle";
  }

  const pendingAt = protection.pendingDisableAt;
  const countingDown =
    protection.enabled &&
    pendingAt !== null &&
    !globalThis.isDisableDue(pendingAt, Date.now());

  if (countingDown) {
    disableStep = "countdown";
  } else if (disableStep === "countdown") {
    disableStep = "idle";
  }

  const showWarning = disableStep === "warning" || disableStep === "pin";
  const showPin = disableStep === "pin";
  const showCountdown = disableStep === "countdown";

  disableFlow.hidden = disableStep === "idle";
  disableWarning.hidden = !showWarning && !showCountdown;
  disableWarningActions.hidden = disableStep !== "warning";
  disablePinRow.hidden = !showPin;
  disableCountdown.hidden = !showCountdown;
  disableCancelBtn.hidden = !showCountdown;

  if (!protection.enabled) {
    toggleCaption.textContent = "Disabled";
    stopCountdown();
    return;
  }

  if (showCountdown) {
    toggleCaption.textContent = `Turns off in ${globalThis.formatDisableCountdown(pendingAt, Date.now())}`;
    disableCountdown.textContent = "Protection is still on. You can cancel.";
    startCountdown();
    return;
  }

  toggleCaption.textContent = "Enabled";
  stopCountdown();
}

function startCountdown() {
  if (countdownTimer) {
    return;
  }

  countdownTimer = window.setInterval(() => {
    const pendingAt = protection.pendingDisableAt;
    if (!pendingAt || globalThis.isDisableDue(pendingAt, Date.now())) {
      stopCountdown();
      refreshState().catch((error) => {
        setQuickStatus(error instanceof Error ? error.message : String(error), true);
      });
      return;
    }

    toggleCaption.textContent = `Turns off in ${globalThis.formatDisableCountdown(pendingAt, Date.now())}`;
  }, 1000);
}

function stopCountdown() {
  if (!countdownTimer) {
    return;
  }

  window.clearInterval(countdownTimer);
  countdownTimer = 0;
}

function patternToDomain(pattern) {
  if (typeof pattern !== "string") {
    return "";
  }

  const match = pattern.match(/^\*:\/\/\*\.([^/*?#]+)\/\*$/i);
  return match ? match[1] : "";
}

function setQuickStatus(text, isError = false) {
  quickAddStatus.textContent = text;
  quickAddStatus.classList.toggle("error", Boolean(isError));
}

async function sendMessage(message) {
  const response = await extensionApi.runtime.sendMessage(message);
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "Unexpected extension response.");
  }
  return response;
}
