(() => {
  if (window.top !== window) {
    return;
  }

  const host = window.location.hostname.toLowerCase();
  if (!host) {
    return;
  }

  const patternToDomain = (pattern) => {
    if (typeof pattern !== "string") {
      return "";
    }

    const match = pattern.toLowerCase().match(/^\*:\/\/\*\.([^/*?#]+)\/\*$/);
    return match ? match[1] : "";
  };

  const hostMatches = (domain) => host === domain || host.endsWith(`.${domain}`);

  chrome.storage.sync
    .get({ blocklist: [] })
    .then((result) => {
      const blocklist = Array.isArray(result.blocklist) ? result.blocklist : [];
      const isBlockedDomain = blocklist.some((pattern) => {
        const domain = patternToDomain(pattern);
        return domain ? hostMatches(domain) : false;
      });

      if (!isBlockedDomain) {
        return;
      }

      chrome.runtime.sendMessage({
        type: "content:blockedDomainSeen",
        domain: host
      });
    })
    .catch(() => {
      // The content script intentionally does not read page content.
    });
})();
