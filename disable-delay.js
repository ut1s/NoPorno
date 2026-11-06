(function (root) {
  const DISABLE_DELAY_MS = 30 * 1000;
  const DISABLE_ALARM_NAME = "disable-protection";
  const DISABLE_WARNING =
    "Turning protection off asks for your PIN, then waits 30 seconds. Blocking continues during that wait, and you can cancel. The browser's extension page can still turn NoPorno off immediately.";

  function pendingDisableAtFromNow(now) {
    return now + DISABLE_DELAY_MS;
  }

  function normalizePendingDisableAt(value) {
    const pendingAt = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(pendingAt) || pendingAt <= 0) {
      return null;
    }
    return pendingAt;
  }

  function isDisableDue(pendingAt, now) {
    const normalized = normalizePendingDisableAt(pendingAt);
    return normalized !== null && normalized <= now;
  }

  function formatDisableCountdown(pendingAt, now) {
    const normalized = normalizePendingDisableAt(pendingAt);
    const remainingMs = normalized === null ? 0 : normalized - now;
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  const api = {
    DISABLE_DELAY_MS,
    DISABLE_ALARM_NAME,
    DISABLE_WARNING,
    pendingDisableAtFromNow,
    normalizePendingDisableAt,
    isDisableDue,
    formatDisableCountdown
  };

  Object.assign(root, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
