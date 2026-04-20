(() => {
  if (window.top !== window) {
    return;
  }

  const extensionApi =
    typeof globalThis.browser !== "undefined" ? globalThis.browser : globalThis.chrome;

  const host = window.location.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) {
    return;
  }

  void checkAndRedirectForReddit();

  async function checkAndRedirectForReddit() {
    let response;
    try {
      response = await extensionApi.runtime.sendMessage({
        type: "content:checkRedditUrl",
        url: window.location.href
      });
    } catch (_error) {
      return;
    }

    if (!response?.ok || !response.shouldBlock) {
      return;
    }

    const redirectUrl = new URL(extensionApi.runtime.getURL("redirect.html"));
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
})();
