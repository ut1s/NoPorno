#!/usr/bin/env node
/*
 * Regenerates the bundled static declarativeNetRequest rulesets in rules/.
 *
 * Why static rulesets? The blocked domain list is large (~18k domains). Turning
 * each into a *dynamic* rule would blow Firefox's 5,000 dynamic-rule cap and hold
 * the whole list in the service-worker JS heap, rebuilt on every toggle. Static
 * rulesets are parsed and matched natively by the browser (near-zero JS heap) and
 * are simply enabled/disabled when the extension is toggled.
 *
 * Sources (download these first, then pass their paths):
 *   1. blocklistproject  - adguard/porn-ags.txt   (AdGuard syntax, ||domain^)
 *   2. StevenBlack        - alternates/porn/hosts  (hosts syntax, 0.0.0.0 domain)
 *   3. 4skinSkywalker     - HOSTS.txt              (hosts syntax)
 *
 * We keep only registrable domains (eTLD+1) that appear in ALL THREE lists
 * (high-confidence consensus, low false-positive risk), unioned with the
 * project's existing hand-curated badsites.js. blocklistproject alone is a
 * ~650k-domain firehose of long-tail junk, so consensus filtering is essential
 * to keep the list "manageable".
 *
 * Usage:
 *   node scripts/generate-blocklist.js <blocklistproject.txt> <stevenblack.hosts> <4skin.txt>
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RULES_DIR = path.join(ROOT, "rules");
const BADSITES_JS = path.join(ROOT, "badsites.js");
const CHUNK_SIZE = 5000; // rules per static ruleset file (well under browser caps)

// Multi-part public suffixes so we collapse to the registrable domain correctly.
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au",
  "com.br", "com.mx", "co.jp", "ne.jp", "or.jp", "co.kr", "com.cn", "com.tw",
  "co.nz", "co.za", "com.ru", "com.ua", "co.in", "com.tr", "com.hk", "com.sg",
  "com.ar", "com.co", "co.il", "com.es"
]);

// Shared hosting platforms where the registrable domain is NOT itself adult
// content (the lists enumerate individual blogs). Blocking these would nuke the
// whole platform, so we drop subdomains that collapse to them.
const PLATFORM_DOMAINS = new Set([
  "tumblr.com", "blogspot.com", "wordpress.com", "blogger.com", "livejournal.com",
  "weebly.com", "wixsite.com", "over-blog.com", "webnode.com", "neocities.org",
  "github.io", "pages.dev", "000webhostapp.com", "herokuapp.com", "tripod.com",
  "angelfire.com", "ucoz.com", "narod.ru", "ya.ru", "wix.com", "google.com",
  "amazonaws.com", "cloudfront.net", "fc2.com", "livedoor.com", "hatenablog.com",
  "blog.jp", "deviantart.com", "reddit.com", "twitter.com", "x.com",
  "pinterest.com", "imgur.com", "flickr.com"
]);

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

function registrable(host) {
  host = host.toLowerCase().replace(/\.$/, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  if (MULTI_PART_TLDS.has(last3)) return parts.slice(-4).join(".");
  if (MULTI_PART_TLDS.has(last2)) return parts.slice(-3).join(".");
  return last2;
}

function extractHosts(file, mode) {
  const out = new Set();
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line || line[0] === "#" || line[0] === "!") continue;
    let host = null;
    if (mode === "adguard") {
      const m = line.match(/^\|\|([^\^/*]+)\^/);
      if (m) host = m[1];
    } else {
      const parts = line.split(/\s+/);
      host = parts.length >= 2 ? parts[1] : parts[0];
    }
    if (!host) continue;
    host = host.replace(/^www\./, "").toLowerCase();
    if (!DOMAIN_RE.test(host)) continue;
    out.add(host);
  }
  return out;
}

function toRegistrableSet(hostSet) {
  const out = new Set();
  for (const host of hostSet) {
    const reg = registrable(host);
    if (PLATFORM_DOMAINS.has(reg)) continue;
    if (!DOMAIN_RE.test(reg)) continue;
    out.add(reg);
  }
  return out;
}

function loadExistingBadsites() {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox;
  // badsites.js uses top-level `var`, so eval in a function scope and read locals.
  const src = fs.readFileSync(BADSITES_JS, "utf8");
  // eslint-disable-next-line no-new-func
  const getter = new Function(`${src}; return (typeof badsites !== "undefined" ? badsites : []);`);
  const list = getter();
  return toRegistrableSet(new Set(list.map((d) => String(d).toLowerCase().replace(/^www\./, ""))));
}

function main() {
  const [blpPath, sbPath, skinPath] = process.argv.slice(2);
  if (!blpPath || !sbPath || !skinPath) {
    console.error("Usage: node scripts/generate-blocklist.js <blocklistproject> <stevenblack> <4skin>");
    process.exit(1);
  }

  const blp = toRegistrableSet(extractHosts(blpPath, "adguard"));
  const sb = toRegistrableSet(extractHosts(sbPath, "hosts"));
  const skin = toRegistrableSet(extractHosts(skinPath, "hosts"));
  const existing = loadExistingBadsites();

  // Consensus: present in all three external lists.
  const consensus = [...blp].filter((d) => sb.has(d) && skin.has(d));

  // Final bundle = existing curated list UNION consensus.
  const finalSet = new Set([...existing, ...consensus]);
  const domains = [...finalSet].sort();

  console.log(`sources (registrable): blp=${blp.size} sb=${sb.size} skin=${skin.size}`);
  console.log(`existing curated: ${existing.size}`);
  console.log(`all-3 consensus: ${consensus.length}`);
  console.log(`final bundled domains: ${domains.length}`);

  // Clean out old rule files.
  fs.rmSync(RULES_DIR, { recursive: true, force: true });
  fs.mkdirSync(RULES_DIR, { recursive: true });

  const rulesets = [];
  let ruleId = 1;
  for (let start = 0, chunk = 1; start < domains.length; start += CHUNK_SIZE, chunk++) {
    const slice = domains.slice(start, start + CHUNK_SIZE);
    const rules = slice.map((domain) => ({
      id: ruleId++,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { extensionPath: `/redirect.html?blocked=${domain}` }
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame"]
      }
    }));
    const id = `porn_${chunk}`;
    const filePath = path.join("rules", `${id}.json`);
    fs.writeFileSync(path.join(ROOT, filePath), JSON.stringify(rules, null, 0) + "\n");
    rulesets.push({ id, enabled: true, path: filePath });
  }

  // Emit a manifest fragment + count so humans/build tooling can stay in sync.
  fs.writeFileSync(
    path.join(RULES_DIR, "index.json"),
    JSON.stringify({ totalDomains: domains.length, rulesets }, null, 2) + "\n"
  );

  console.log(`wrote ${rulesets.length} ruleset file(s) to rules/`);
  console.log("rule_resources fragment:");
  console.log(JSON.stringify(rulesets, null, 2));
}

main();
