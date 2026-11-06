(function (root) {
  async function hashPin(pin) {
    const bytes = new TextEncoder().encode(pin);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  root.hashPin = hashPin;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { hashPin };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
