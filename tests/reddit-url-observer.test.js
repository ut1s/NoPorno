const test = require('node:test');
const assert = require('node:assert/strict');
const { createUrlChangeObserver } = require('../content-url-observer');

function createFakeWindow(initialHref) {
  let href = initialHref;
  const listeners = new Map();
  const history = {
    pushState(_state, _title, url) {
      if (typeof url === 'string' && url) {
        href = new URL(url, 'https://redlite.app').toString();
      }
    },
    replaceState(_state, _title, url) {
      if (typeof url === 'string' && url) {
        href = new URL(url, 'https://redlite.app').toString();
      }
    }
  };

  const windowApi = {
    location: {
      get href() {
        return href;
      },
      set href(value) {
        href = value;
      }
    },
    history,
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!listeners.has(type)) {
        return;
      }
      listeners.set(type, listeners.get(type).filter((entry) => entry !== handler));
    },
    dispatch(type) {
      for (const handler of listeners.get(type) || []) {
        handler({ type });
      }
    }
  };

  return { windowApi, history, listeners };
}

test('notifies when pushState changes the URL', () => {
  const { windowApi, history } = createFakeWindow('https://redlite.app/r/ass');
  const seen = [];

  createUrlChangeObserver({
    window: windowApi,
    history,
    document: {
      addEventListener() {},
      removeEventListener() {}
    },
    onUrlChange(url) {
      seen.push(url);
    }
  });

  windowApi.location.href = 'https://redlite.app/r/ass?sort=hot';
  windowApi.dispatch('popstate');

  assert.deepEqual(seen, ['https://redlite.app/r/ass?sort=hot']);
});

test('tracks history changes from pushState and replaceState', () => {
  const { windowApi, history } = createFakeWindow('https://redlite.app/r/ass');
  const seen = [];

  createUrlChangeObserver({
    window: windowApi,
    history,
    document: {
      addEventListener() {},
      removeEventListener() {}
    },
    onUrlChange(url) {
      seen.push(url);
    }
  });

  history.pushState({}, '', '/r/ass?sort=hot');
  history.replaceState({}, '', '/r/ass?sort=top');

  assert.deepEqual(seen, [
    'https://redlite.app/r/ass?sort=hot',
    'https://redlite.app/r/ass?sort=top'
  ]);
});
