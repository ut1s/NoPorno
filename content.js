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

  let isCheckingRestrictedContent = false;

  void checkAndRedirectForRestrictedContent();

  if (globalThis.NoPornoUrlObserver?.createUrlChangeObserver) {
    globalThis.NoPornoUrlObserver.createUrlChangeObserver({
      window,
      history: window.history,
      document,
      onUrlChange: () => {
        void checkAndRedirectForRestrictedContent();
      }
    });
  }

  async function checkAndRedirectForRestrictedContent() {
    if (isCheckingRestrictedContent) {
      return;
    }

    isCheckingRestrictedContent = true;

    try {
      const redditResponse = await queryBlockDecision("content:checkRedditUrl");
      if (redirectIfBlocked("reddit", redditResponse)) {
        return;
      }

      const deviantArtResponse = await queryBlockDecision("content:checkDeviantArtSearchUrl");
      redirectIfBlocked("deviantart", deviantArtResponse);
    } finally {
      isCheckingRestrictedContent = false;
    }
  }

  async function queryBlockDecision(type) {
    try {
      return await extensionApi.runtime.sendMessage({
        type,
        url: window.location.href
      });
    } catch (_error) {
      return null;
    }
  }

  function redirectIfBlocked(source, response) {
    if (!response?.ok || !response.shouldBlock) {
      return false;
    }

    const redirectUrl = new URL(extensionApi.runtime.getURL("redirect.html"));
    redirectUrl.searchParams.set("blocked", host);
    redirectUrl.searchParams.set("source", source);

    if (
      typeof response.blockedSubreddit === "string" &&
      response.blockedSubreddit.trim()
    ) {
      redirectUrl.searchParams.set("subreddit", response.blockedSubreddit.trim());
    }

    if (
      typeof response.blockedKeyword === "string" &&
      response.blockedKeyword.trim()
    ) {
      redirectUrl.searchParams.set("keyword", response.blockedKeyword.trim());
    }

    window.location.replace(redirectUrl.toString());
    return true;
  }
})();
