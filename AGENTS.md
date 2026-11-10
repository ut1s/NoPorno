# NoPorno agent map

Manifest V3 extension (v2.4.0). Blocks adult **main-frame** navigations and sends the tab to `redirect.html`, which waits 3 seconds and opens a random URL from `goodsites.js`.

Read this file first. Open only the rows that match the task.

## Skip unless the task needs them

| Path | Why |
|---|---|
| `rules/porn_*.json` | ~17,770 static DNR rules, ~3.5 MB. Shape is in `tests/blocklist-rules.test.js`. |
| `badsites.js`, `reddits.js` | Huge legacy arrays. `reddits.js` is `reddithref` + `subreddits`. `badsites.js` is `badsites` + `baddwords`, used only by the generator. |
| `bsite.js`, `noporno.js` | Old content-script blocker. Not in either manifest. |
| `NoPorno.zip`, `NoPorno-src.zip`, `dist/`, `_metadata/` | Build artifacts. |

## Where to look

| Task | Open |
|---|---|
| Domain block / toggle / quick-add / badge | `background.js` (`rebuildDynamicRules`, `syncStaticRulesets`, `buildDynamicRules`) |
| Popup UI | `popup.html`, `popup.js`, `popup.css` |
| Settings UI, PIN, import/export | `settings.html`, `settings.js`, `settings.css` |
| Redirect interstitial | `redirect.html`, `redirect.js`, `redirect.css`, `goodsites.js` |
| Reddit or Reddit-viewer subreddit block | `content.js`, then `evaluateRedditBlockRequest` in `background.js`. Data: `reddits.js` (`reddithref`, `subreddits`). |
| DeviantArt search keyword block | `content.js`, then `evaluateDeviantArtSearchBlockRequest` in `background.js`. Keywords: `bad-keywords.js` (`badwords`). |
| SPA URL changes (pushState / back) | `content-url-observer.js`, `tests/reddit-url-observer.test.js` |
| Regenerate the bundled domain list | `scripts/generate-blocklist.js`, then sync the constants below |
| Firefox package | `manifest.firefox.json`, `scripts/build-firefox-zip.sh` |
| Chromium package | `manifest.json` |

## Runtime

1. **Static rules.** `rules/porn_1.json` … `porn_4.json`, indexed by `rules/index.json`. Each rule is `||domain^`, `resourceTypes: ["main_frame"]`, redirect to `/redirect.html?blocked=<domain>`. Enabled and disabled as a set with `updateEnabledRulesets`. Constant: `STATIC_RULESET_IDS`, `BUNDLED_BLOCKLIST_SIZE` (17676) in `background.js`.
2. **Dynamic rules.** User domains only, stored in `chrome.storage.sync` key `blocklist` as `*://*.domain/*`. Rule ids start at `1000`. Firefox dynamic cap is 5000; the bundled list must stay static.
3. **Content script** on `<all_urls>` at `document_start`, top frame only. Asks the background about the current URL for Reddit viewers and DeviantArt `/search?q=`. On a hit, `location.replace`s the extension redirect page with `source`, and `subreddit` or `keyword`.
4. **Redirect page** picks from `goodsites.js` (`var goodsites`). Logs `redirect:log`. History is local, max 100. Popup stats are today and the last 7 days.

Background entry: Chrome uses `background.service_worker` = `background.js`, which `importScripts` `bad-keywords.js` and `reddits.js`. Firefox manifest lists those three files under `background.scripts` and has no service worker. Code uses `browser` when present, else `chrome`.

### Messages (`background.js` `handleMessage`)

`popup:getState`, `popup:setEnabled` (on only), `popup:quickAddDomain`, `settings:getState`, `settings:save`, `settings:clearHistory`, `redirect:log`, `content:checkRedditUrl`, `content:checkDeviantArtSearchUrl`, `protection:requestDisable`, `protection:cancelDisable`.

### Storage

Sync: `enabled`, `blocklist`, `categoryToggles`, `strictMode`, `customRedirectUrl`, `settingsPinHash`, `pendingDisableAt`.

Local: `redirectHistory`, `ruleLoadError`, `ruleLoadErrorAt`.

PIN is SHA-256 in `pin.js` and locks the settings page. Turning protection off also requires that PIN, then waits 30 seconds (`disable-delay.js`, alarm `disable-protection`) before `enabled` becomes false. `pendingDisableAt` lives in sync storage so Chromium's split incognito process can mirror the same alarm. `popup:setEnabled` and `settings:save` cannot set `enabled` to false.

## Manifest split

| | `manifest.json` | `manifest.firefox.json` |
|---|---|---|
| Background | `service_worker` (also lists `background.scripts`) | `background.scripts` only |
| Incognito | `split` | `spanning` |
| Gecko id | `noporno@toliver.hu` | `noporno@oliv.dev` |

Firefox min 140, Android 142. Ship Firefox with `bash scripts/build-firefox-zip.sh` → `dist/NoPorno-firefox.zip`.

## When the blocklist changes

`node scripts/generate-blocklist.js <porn-ags.txt> <stevenblack-hosts> <4skin-HOSTS.txt>`

Consensus of those three lists, unioned with `badsites.js`, collapsed to the registrable domain. Platform hosts in `PLATFORM_DOMAINS` (reddit, deviantart, tumblr, …) are dropped. Chunk size 5000.

If the rule count or the number of `porn_*.json` files changes, update together:

- `BUNDLED_BLOCKLIST_SIZE` and `STATIC_RULESET_IDS` in `background.js`
- `declarative_net_request.rule_resources` in both manifests
- `rules/index.json`

Then `node --test tests/*.test.js`.

## GitHub account

This repo belongs to **ut1s**. The machine's usual GitHub CLI account is **T0liver**.

Before `git push` or any `gh` command for this repo, switch to ut1s. After the command finishes, including when it fails, switch back to T0liver. `gh auth switch` without `--user` opens a prompt, so pass the user:

```bash
gh auth switch --user ut1s
# git push, gh pr, gh issue, or other GitHub actions for this repo
gh auth switch --user T0liver
```

## Stored but not applied on redirect

`strictMode`, `customRedirectUrl`, and `categoryToggles` are saved and sanitized in `background.js` and edited in settings. `redirect.js` ignores them and always uses `goodsites.js`.
