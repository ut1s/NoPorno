const extensionApi =
  typeof globalThis.browser !== "undefined" ? globalThis.browser : globalThis.chrome;

const state = {
  enabled: true,
  blocklist: [],
  categoryToggles: {
    mentalReset: true,
    learn: true,
    active: true
  },
  strictMode: false,
  customRedirectUrl: "",
  settingsPinHash: "",
  historyCount: 0,
  incognitoAccessAllowed: true,
  ruleLoadError: ""
};

let unlocked = false;

const els = {
  warningCard: document.getElementById("warning-card"),
  warningText: document.getElementById("warning-text"),
  enabledToggle: document.getElementById("enabled-toggle"),
  strictModeToggle: document.getElementById("strict-mode-toggle"),
  customUrlInput: document.getElementById("custom-url-input"),
  catMental: document.getElementById("cat-mental"),
  catLearn: document.getElementById("cat-learn"),
  catActive: document.getElementById("cat-active"),
  saveSettingsBtn: document.getElementById("save-settings-btn"),
  settingsStatus: document.getElementById("settings-status"),
  addDomainInput: document.getElementById("add-domain-input"),
  addDomainBtn: document.getElementById("add-domain-btn"),
  blocklistList: document.getElementById("blocklist-list"),
  exportBlocklistBtn: document.getElementById("export-blocklist-btn"),
  importBlocklistBtn: document.getElementById("import-blocklist-btn"),
  importFileInput: document.getElementById("import-file-input"),
  historyCountText: document.getElementById("history-count-text"),
  clearHistoryBtn: document.getElementById("clear-history-btn"),
  pinStatusText: document.getElementById("pin-status-text"),
  pinCreatePanel: document.getElementById("pin-create-panel"),
  pinUnlockPanel: document.getElementById("pin-unlock-panel"),
  pinManagePanel: document.getElementById("pin-manage-panel"),
  pinInput: document.getElementById("pin-input"),
  pinConfirmInput: document.getElementById("pin-confirm-input"),
  setPinBtn: document.getElementById("set-pin-btn"),
  unlockPinInput: document.getElementById("unlock-pin-input"),
  unlockPinBtn: document.getElementById("unlock-pin-btn"),
  newPinInput: document.getElementById("new-pin-input"),
  newPinConfirmInput: document.getElementById("new-pin-confirm-input"),
  updatePinBtn: document.getElementById("update-pin-btn"),
  removePinBtn: document.getElementById("remove-pin-btn")
};

init().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});

async function init() {
  els.addDomainBtn.addEventListener("click", addDomainLocally);
  els.addDomainInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void addDomainLocally();
    }
  });

  els.blocklistList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (!target.classList.contains("remove-domain-btn")) {
      return;
    }

    if (isLocked()) {
      setStatus("Unlock settings with your PIN first.", true);
      return;
    }

    const pattern = target.dataset.pattern || "";
    state.blocklist = state.blocklist.filter((item) => item !== pattern);
    renderBlocklist();
    setStatus("Domain removed locally. Click Save settings to apply.");
  });

  els.saveSettingsBtn.addEventListener("click", async () => {
    await persistSettings("Settings saved.");
  });

  els.importBlocklistBtn.addEventListener("click", () => {
    els.importFileInput.click();
  });

  els.importFileInput.addEventListener("change", async () => {
    await importBlocklist();
  });

  els.exportBlocklistBtn.addEventListener("click", exportBlocklist);

  els.clearHistoryBtn.addEventListener("click", async () => {
    await clearHistory();
  });

  els.setPinBtn.addEventListener("click", async () => {
    await setPin();
  });

  els.unlockPinBtn.addEventListener("click", async () => {
    await unlockSettings();
  });

  els.updatePinBtn.addEventListener("click", async () => {
    await updatePin();
  });

  els.removePinBtn.addEventListener("click", async () => {
    await removePin();
  });

  await reloadState();
}

async function reloadState() {
  const response = await sendMessage({ type: "settings:getState" });
  syncStateFromResponse(response);

  if (!state.settingsPinHash) {
    unlocked = true;
  }

  renderAll();
}

function syncStateFromResponse(response) {
  state.enabled = Boolean(response.enabled);
  state.blocklist = Array.isArray(response.blocklist) ? response.blocklist : [];
  state.categoryToggles = {
    mentalReset: Boolean(response.categoryToggles?.mentalReset),
    learn: Boolean(response.categoryToggles?.learn),
    active: Boolean(response.categoryToggles?.active)
  };
  state.strictMode = Boolean(response.strictMode);
  state.customRedirectUrl = typeof response.customRedirectUrl === "string" ? response.customRedirectUrl : "";
  state.settingsPinHash =
    typeof response.settingsPinHash === "string" ? response.settingsPinHash : "";
  state.historyCount = Number(response.historyCount || 0);
  state.incognitoAccessAllowed =
    response.incognitoAccessAllowed !== false;
  state.ruleLoadError = typeof response.ruleLoadError === "string" ? response.ruleLoadError : "";
}

function renderAll() {
  els.enabledToggle.checked = state.enabled;
  els.strictModeToggle.checked = state.strictMode;
  els.customUrlInput.value = state.customRedirectUrl;
  els.catMental.checked = state.categoryToggles.mentalReset;
  els.catLearn.checked = state.categoryToggles.learn;
  els.catActive.checked = state.categoryToggles.active;
  els.historyCountText.textContent = `Redirect log entries: ${state.historyCount}`;

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
    els.warningCard.hidden = false;
    els.warningText.textContent = warnings.join(" ");
  } else {
    els.warningCard.hidden = true;
    els.warningText.textContent = "";
  }

  renderBlocklist();
  renderPinPanels();
  applyLockedState();
}

function renderBlocklist() {
  els.blocklistList.innerHTML = "";

  if (state.blocklist.length === 0) {
    const empty = document.createElement("li");
    empty.className = "blocklist-empty";
    empty.textContent = "No domains in the blocklist yet.";
    els.blocklistList.appendChild(empty);
    return;
  }

  for (const pattern of state.blocklist) {
    const item = document.createElement("li");
    item.className = "blocklist-item";

    const domain = document.createElement("span");
    domain.className = "domain";
    domain.textContent = patternToDomain(pattern) || pattern;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-domain-btn lockable";
    removeBtn.textContent = "Remove";
    removeBtn.dataset.pattern = pattern;

    item.appendChild(domain);
    item.appendChild(removeBtn);
    els.blocklistList.appendChild(item);
  }
}

function renderPinPanels() {
  if (!state.settingsPinHash) {
    els.pinStatusText.textContent = "PIN is not set. Changes are currently unlocked.";
    els.pinCreatePanel.hidden = false;
    els.pinUnlockPanel.hidden = true;
    els.pinManagePanel.hidden = true;
    return;
  }

  if (unlocked) {
    els.pinStatusText.textContent = "PIN is active. Settings are unlocked for this session.";
    els.pinCreatePanel.hidden = true;
    els.pinUnlockPanel.hidden = true;
    els.pinManagePanel.hidden = false;
    return;
  }

  els.pinStatusText.textContent = "PIN is active. Unlock to change protected settings.";
  els.pinCreatePanel.hidden = true;
  els.pinUnlockPanel.hidden = false;
  els.pinManagePanel.hidden = true;
}

function applyLockedState() {
  const locked = isLocked();

  document.querySelectorAll(".lockable").forEach((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLButtonElement)) {
      return;
    }

    element.disabled = locked;
  });
}

async function addDomainLocally() {
  if (isLocked()) {
    setStatus("Unlock settings with your PIN first.", true);
    return;
  }

  const pattern = normalizePattern(els.addDomainInput.value);
  if (!pattern) {
    setStatus("Enter a valid domain or URL.", true);
    return;
  }

  if (state.blocklist.includes(pattern)) {
    setStatus("That domain is already in the blocklist.", true);
    return;
  }

  state.blocklist = dedupe([pattern, ...state.blocklist]);
  els.addDomainInput.value = "";
  renderBlocklist();
  applyLockedState();

  setStatus(`Added ${patternToDomain(pattern)} locally. Click Save settings to apply.`);
}

async function persistSettings(successMessage) {
  if (isLocked()) {
    setStatus("Unlock settings with your PIN first.", true);
    return;
  }

  const customUrlValue = els.customUrlInput.value.trim();
  if (customUrlValue && !toSafeHttpUrl(customUrlValue)) {
    setStatus("Custom redirect URL must be a valid http(s) address.", true);
    return;
  }

  const payload = {
    enabled: els.enabledToggle.checked,
    blocklist: state.blocklist,
    categoryToggles: {
      mentalReset: els.catMental.checked,
      learn: els.catLearn.checked,
      active: els.catActive.checked
    },
    strictMode: els.strictModeToggle.checked,
    customRedirectUrl: customUrlValue
  };

  const response = await sendMessage({
    type: "settings:save",
    payload
  });

  syncStateFromResponse(response);
  renderAll();
  setStatus(successMessage);
}

async function importBlocklist() {
  if (isLocked()) {
    setStatus("Unlock settings with your PIN first.", true);
    return;
  }

  const file = els.importFileInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    let incoming = [];

    if (Array.isArray(parsed)) {
      incoming = parsed;
    } else if (Array.isArray(parsed.blocklist)) {
      incoming = parsed.blocklist;
    } else {
      throw new Error("JSON must be an array or an object with a blocklist array.");
    }

    const normalized = incoming.map((item) => normalizePattern(String(item))).filter(Boolean);
    if (normalized.length === 0) {
      throw new Error("No valid domains were found in the import file.");
    }

    state.blocklist = dedupe(normalized);
    renderBlocklist();
    applyLockedState();
    await persistSettings(`Imported ${state.blocklist.length} domains and saved.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    els.importFileInput.value = "";
  }
}

function exportBlocklist() {
  const payload = {
    exportedAt: new Date().toISOString(),
    blocklist: state.blocklist
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "noporno-blocklist.json";
  link.click();
  URL.revokeObjectURL(url);

  setStatus("Blocklist exported.");
}

async function clearHistory() {
  if (isLocked()) {
    setStatus("Unlock settings with your PIN first.", true);
    return;
  }

  if (!window.confirm("Clear redirect history now?")) {
    return;
  }

  const response = await sendMessage({ type: "settings:clearHistory" });
  syncStateFromResponse(response);
  renderAll();
  setStatus("Redirect history cleared.");
}

async function setPin() {
  if (state.settingsPinHash) {
    setStatus("A PIN already exists. Use unlock and update.", true);
    return;
  }

  const pin = els.pinInput.value.trim();
  const confirm = els.pinConfirmInput.value.trim();

  if (pin.length < 4) {
    setStatus("PIN must be at least 4 characters.", true);
    return;
  }

  if (pin !== confirm) {
    setStatus("PIN confirmation does not match.", true);
    return;
  }

  const hash = await hashPin(pin);
  const response = await sendMessage({
    type: "settings:save",
    payload: { settingsPinHash: hash }
  });

  unlocked = false;
  syncStateFromResponse(response);
  clearPinInputs();
  renderAll();
  setStatus("PIN set. Unlock to modify protected settings.");
}

async function unlockSettings() {
  if (!state.settingsPinHash) {
    unlocked = true;
    renderAll();
    return;
  }

  const pin = els.unlockPinInput.value.trim();
  if (!pin) {
    setStatus("Enter your PIN to unlock.", true);
    return;
  }

  const hash = await hashPin(pin);
  if (hash !== state.settingsPinHash) {
    setStatus("Incorrect PIN.", true);
    return;
  }

  unlocked = true;
  els.unlockPinInput.value = "";
  renderAll();
  setStatus("Settings unlocked for this session.");
}

async function updatePin() {
  if (!state.settingsPinHash) {
    setStatus("No PIN is set yet.", true);
    return;
  }

  if (isLocked()) {
    setStatus("Unlock with your current PIN first.", true);
    return;
  }

  const newPin = els.newPinInput.value.trim();
  const confirm = els.newPinConfirmInput.value.trim();

  if (newPin.length < 4) {
    setStatus("New PIN must be at least 4 characters.", true);
    return;
  }

  if (newPin !== confirm) {
    setStatus("New PIN confirmation does not match.", true);
    return;
  }

  const newHash = await hashPin(newPin);
  const response = await sendMessage({
    type: "settings:save",
    payload: { settingsPinHash: newHash }
  });

  syncStateFromResponse(response);
  els.newPinInput.value = "";
  els.newPinConfirmInput.value = "";
  renderAll();
  setStatus("PIN updated.");
}

async function removePin() {
  if (!state.settingsPinHash) {
    setStatus("No PIN is set.", true);
    return;
  }

  if (isLocked()) {
    setStatus("Unlock with your PIN first.", true);
    return;
  }

  if (!window.confirm("Remove the settings PIN?")) {
    return;
  }

  const response = await sendMessage({
    type: "settings:save",
    payload: { settingsPinHash: "" }
  });

  unlocked = true;
  syncStateFromResponse(response);
  clearPinInputs();
  renderAll();
  setStatus("PIN removed. Settings are unlocked.");
}

function clearPinInputs() {
  els.pinInput.value = "";
  els.pinConfirmInput.value = "";
  els.unlockPinInput.value = "";
  els.newPinInput.value = "";
  els.newPinConfirmInput.value = "";
}

function isLocked() {
  return Boolean(state.settingsPinHash) && !unlocked;
}

function setStatus(message, isError = false) {
  els.settingsStatus.textContent = message;
  els.settingsStatus.classList.toggle("error", Boolean(isError));
}

async function sendMessage(message) {
  const response = await extensionApi.runtime.sendMessage(message);
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "Unexpected extension response.");
  }
  return response;
}

function patternToDomain(pattern) {
  if (typeof pattern !== "string") {
    return "";
  }

  const match = pattern.match(/^\*:\/\/\*\.([^/*?#]+)\/\*$/i);
  return match ? match[1] : "";
}

function normalizePattern(input) {
  if (typeof input !== "string") {
    return "";
  }

  let value = input.trim().toLowerCase();
  if (!value) {
    return "";
  }

  const direct = value.match(/^\*:\/\/\*\.([^/*?#]+)\/\*$/);
  if (direct && isValidDomain(direct[1])) {
    return `*://*.${direct[1]}/*`;
  }

  if (value.includes("://")) {
    try {
      value = new URL(value).hostname.toLowerCase();
    } catch (_error) {
      return "";
    }
  } else {
    value = value.replace(/^\*:\/\/\*\./, "");
    value = value.replace(/^\*\./, "");
    value = value.replace(/^www\./, "");
    value = value.split("/")[0];
    value = value.split(":")[0];
  }

  if (!isValidDomain(value)) {
    return "";
  }

  return `*://*.${value}/*`;
}

function dedupe(values) {
  return [...new Set(values)];
}

function isValidDomain(value) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(value);
}

function toSafeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
