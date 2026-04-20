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

init().catch((error) => {
  setQuickStatus(error instanceof Error ? error.message : String(error), true);
});

async function init() {
  enabledToggle.addEventListener("change", onToggleChange);
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
    await sendMessage({
      type: "popup:setEnabled",
      enabled: enabledToggle.checked
    });
    await refreshState();
  } catch (error) {
    enabledToggle.checked = !enabledToggle.checked;
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

  enabledToggle.checked = Boolean(state.enabled);
  toggleCaption.textContent = state.enabled ? "Enabled" : "Disabled";
  statsText.textContent = `Redirected ${state.todayCount} times today / ${state.weekCount} times this week`;

  if (state.ruleLoadError) {
    warningCard.hidden = false;
    warningText.textContent = `Rules failed to load: ${state.ruleLoadError}`;
  } else {
    warningCard.hidden = true;
    warningText.textContent = "";
  }
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
