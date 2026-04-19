(() => {
  if (window.top !== window) {
    return;
  }

  const host = window.location.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "content:checkRedditUrl",
      url: window.location.href
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok || !response.shouldBlock) {
        return;
      }

      const redirectUrl = new URL(chrome.runtime.getURL("redirect.html"));
      redirectUrl.searchParams.set("blocked", host);
      redirectUrl.searchParams.set("source", "reddit");

      if (
        typeof response.blockedSubreddit === "string" &&
        response.blockedSubreddit.trim()
      ) {
        redirectUrl.searchParams.set("subreddit", response.blockedSubreddit.trim());
      }

      window.location.replace(redirectUrl.toString());
    }
  );
})();
