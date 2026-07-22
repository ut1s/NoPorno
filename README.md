# NoPorno!

A porn blocker just to help somes who have addiction. It'll be something new so check it!

## Useage

1. Install the extension by simply downloading the repository and installing the extension from file in the browser's extension panel. (Don't know how to do it? [Here is a nice guide to check!](https://ourtechroom.com/tech/manually-locally-install-chrome-extension)
2. Just browser as you sould normally do it.
3. If your attention would go a an xxx site the extension will activated and block the site!
4. Now comes the nice part: this not just blocking the porn site, it redirects you to a new site where you will distraced from porn. (eg. music/cute, amazing pictures, videos, pages, articles)

## How it works?

Simply blocks the site and redirect to a new one as it says.
But the method behind this is the tricky part of it: not just blocking the website as a normal porn blocker would, it makes things better via redirecting. In many times ones would even watch porn after a blocker has been activated as the sexual energies are not really gone so the best way is to distract one's attention from porn. Here comes this project!

**You can submit your own sites/links which can be in the good site's list to help eachother!**

## Idea

One day I just saw [mrvivacious's PorNo - Porn Blocker](https://github.com/mrvivacious/PorNo) repository and I just thought - this is not that hard I could do it. I figred out that it is not easy but I managed it somehow so I guess I'm proud of myself.
Especially I don't have any porn addiction or anything; maybe I had but I fought it but this is not the matter why I started this project. The matter is maybe that I wanted to have a little bigger project even if it's just a browser extension but it makes our world somehow happier and I hope maybe fewer porn addicted people will live on the Earth.

Okay this was the nice and fairytale part - I just wanted an useful project with I can make myself coller in my class; and maybe to make a little sociology research with how many block can it count.

## Blocklist

The bundled adult-site blocklist (~17.7k domains) ships as **static
[declarativeNetRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest)
rulesets** in `rules/porn_*.json`, referenced from the `declarative_net_request`
key in both manifests. Static rulesets are matched natively by the browser, so
the list costs almost nothing in service-worker memory and is enabled/disabled
instantly on toggle instead of being rebuilt. The user's own custom entries stay
as dynamic rules (so quick-add still works). This keeps us under both browsers'
limits: 30,000 guaranteed static rules and only 5,000 dynamic rules on Firefox.

Only **registrable domains** are listed — the `||domain^` filter already matches
every subdomain, so per-blog entries would be pure bloat.

### Regenerating the blocklist

The list is the union of `badsites.js` (hand-curated seed) and the domains that
appear in **all three** of these public lists (consensus filtering keeps
false-positives and long-tail junk out):

- [blocklistproject](https://github.com/blocklistproject/Lists/blob/main/adguard/porn-ags.txt) — `adguard/porn-ags.txt`
- [StevenBlack](https://github.com/StevenBlack/hosts/blob/master/alternates/porn/hosts) — `alternates/porn/hosts`
- [4skinSkywalker](https://github.com/4skinSkywalker/Anti-Porn-HOSTS-File/) — `HOSTS.txt`

Download those three files, then:

```bash
node scripts/generate-blocklist.js <porn-ags.txt> <stevenblack-hosts> <4skin-HOSTS.txt>
```

It rewrites `rules/porn_*.json` and prints the new total. If the number of rules
or rulesets changes, update `BUNDLED_BLOCKLIST_SIZE` / `STATIC_RULESET_IDS` in
`background.js` and the `rule_resources` arrays in both manifests. The tests in
`tests/blocklist-rules.test.js` guard against these falling out of sync — run:

```bash
node --test tests/*.test.js
```

## Mozilla Add-ons upload

To avoid AMO warnings for Chromium-only manifest keys (for example `background.service_worker`), build and upload the Firefox package:

```bash
bash scripts/build-firefox-zip.sh
```

Then upload:

`dist/NoPorno-firefox.zip`
