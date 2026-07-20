(function (root) {
  function createUrlChangeObserver({
    window: windowRef,
    history: historyRef,
    document: documentRef,
    onUrlChange
  }) {
    if (!windowRef || typeof onUrlChange !== 'function') {
      return function noop() {};
    }

    const targetWindow = windowRef;
    const targetHistory = historyRef || targetWindow.history;
    const targetDocument = documentRef || targetWindow.document;

    let lastHref = targetWindow.location?.href || '';

    function notifyIfChanged() {
      const nextHref = targetWindow.location?.href || '';
      if (nextHref !== lastHref) {
        lastHref = nextHref;
        onUrlChange(nextHref);
      }
    }

    function patchHistoryMethod(methodName) {
      if (!targetHistory || typeof targetHistory[methodName] !== 'function') {
        return;
      }

      const originalMethod = targetHistory[methodName];
      const wrappedMethod = function patchedHistoryMethod(...args) {
        const result = originalMethod.apply(this, args);
        notifyIfChanged();
        return result;
      };

      wrappedMethod.__originalMethod = originalMethod;
      targetHistory[methodName] = wrappedMethod;
    }

    targetWindow.addEventListener('popstate', notifyIfChanged);
    targetWindow.addEventListener('hashchange', notifyIfChanged);
    targetDocument?.addEventListener('pageshow', notifyIfChanged);

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');

    return function disconnect() {
      targetWindow.removeEventListener('popstate', notifyIfChanged);
      targetWindow.removeEventListener('hashchange', notifyIfChanged);
      targetDocument?.removeEventListener('pageshow', notifyIfChanged);

      if (targetHistory && typeof targetHistory.pushState === 'function') {
        const originalPushState = targetHistory.pushState.__originalMethod;
        if (typeof originalPushState === 'function') {
          targetHistory.pushState = originalPushState;
        }
      }

      if (targetHistory && typeof targetHistory.replaceState === 'function') {
        const originalReplaceState = targetHistory.replaceState.__originalMethod;
        if (typeof originalReplaceState === 'function') {
          targetHistory.replaceState = originalReplaceState;
        }
      }
    };
  }

  root.NoPornoUrlObserver = {
    createUrlChangeObserver
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createUrlChangeObserver
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
