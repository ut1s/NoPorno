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
 *   node scripts/generate-blocklist.js
 *       Rewrite rules/ in place: drop safe parents, restore specific adult hosts.
 *   node scripts/generate-blocklist.js <blocklistproject.txt> <stevenblack.hosts> <4skin.txt>
 *       Rebuild rules/ from the three source lists unioned with badsites.js.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RULES_DIR = path.join(ROOT, "rules");
const BADSITES_JS = path.join(ROOT, "badsites.js");
const PSL_PATH = path.join(__dirname, "public_suffix_list.dat");
const CHUNK_SIZE = 5000; // rules per static ruleset file (well under browser caps)

// Public suffixes whose whole zone is adult. A host under one of these collapses
// to the suffix itself so the zone stays blocked.
const ADULT_PUBLIC_SUFFIXES = new Set(["sex.hu", "szex.hu", "sex.pl"]);

// Hosts that must never be blocked, including their subdomains. Country suffixes
// such as co.hu are not listed here: the bare suffix is dropped because it is a
// public suffix, but a specific registrable name under it (shop.co.hu) is kept.
const PLATFORM_DOMAINS = new Set([
  "tumblr.com", "blogspot.com", "wordpress.com", "blogger.com", "livejournal.com",
  "weebly.com", "wixsite.com", "over-blog.com", "webnode.com", "neocities.org",
  "github.io", "pages.dev", "000webhostapp.com", "herokuapp.com", "tripod.com",
  "angelfire.com", "ucoz.com", "narod.ru", "ya.ru", "wix.com", "google.com",
  "amazonaws.com", "cloudfront.net", "fc2.com", "livedoor.com", "hatenablog.com",
  "blog.jp", "deviantart.com", "reddit.com", "twitter.com", "x.com",
  "pinterest.com", "imgur.com", "flickr.com",
  // Shared hosts and dynamic DNS. The bare name is also a public suffix for some
  // of these; listing them here drops every customer subdomain, not only the parent.
  "duckdns.org", "appspot.com", "firebaseapp.com", "web.app", "netlify.app",
  "yolasite.com", "digitaloceanspaces.com", "akadns.net", "akamaized.net",
  "sakura.ne.jp", "undo.jp", "b-cdn.net", "itch.io", "blogspot.co.uk", "blogspot.es",
  "ucoz.ru", "webs.com", "homestead.com", "site123.me", "freehostia.com",
  "webcindario.com", "canalblog.com", "pixnet.net", "exblog.jp", "faithweb.com",
  "over-blog.fr", "over-blog.org", "free.fr", "online.fr",
  // Ordinary sites previously swallowed because one subdomain was in the sources.
  "yahoo.com", "msn.com", "mail.ru", "alibaba.com", "miui.com", "aol.com",
  "uol.com.br", "onet.pl", "rambler.ru", "sapo.pt", "interia.pl", "tiscali.it",
  "virgilio.it", "elle.com", "tmz.com", "channel4.com", "allocine.fr", "9gag.com",
  "oclc.org", "badoo.com", "disqus.com"
]);

// Adult hosts that the old collapse widened into a safe parent (net.pl, eu.com, …).
const RESTORED_HOSTS = ["redtube.net.pl", "redtube.co.pl", "freeporn.eu.com", "xvideos.eu.org"];

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

function loadPublicSuffixList(file) {
  const exact = new Set();
  const wild = new Set();
  const exception = new Set();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const raw = line.trim().toLowerCase();
    if (!raw || raw.startsWith("//")) continue;
    if (raw.startsWith("!")) exception.add(raw.slice(1));
    else if (raw.startsWith("*.")) wild.add(raw.slice(2));
    else exact.add(raw);
  }
  return { exact, wild, exception };
}

const PSL = loadPublicSuffixList(PSL_PATH);

// Longest matching rule wins. An exception rule (!name) prevails over a wildcard
// of the same length because it is checked first at that label.
function publicSuffix(domain) {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length; i++) {
    const rest = parts.slice(i).join(".");
    if (PSL.exception.has(rest)) return parts.slice(i + 1).join(".");
    const parent = parts.slice(i + 1).join(".");
    if (parent && PSL.wild.has(parent)) return rest;
    if (PSL.exact.has(rest)) return rest;
  }
  return parts[parts.length - 1];
}

function coveredByPlatform(domain) {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length; i++) {
    if (PLATFORM_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

function eTldPlusOne(host, suffix) {
  const hostParts = host.split(".");
  const suffixLabels = suffix.split(".").length;
  if (hostParts.length < suffixLabels + 1) return null;
  return hostParts.slice(hostParts.length - suffixLabels - 1).join(".");
}

// Domain to block for this host, or null when the host must not produce a rule.
function collapseHost(host) {
  host = String(host).toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!DOMAIN_RE.test(host)) return null;
  if (coveredByPlatform(host)) return null;
  const suffix = publicSuffix(host);
  if (ADULT_PUBLIC_SUFFIXES.has(suffix)) return suffix;
  if (suffix === host) return null;
  const reg = eTldPlusOne(host, suffix);
  if (!reg || !DOMAIN_RE.test(reg) || coveredByPlatform(reg)) return null;
  return reg;
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
    const kept = collapseHost(host);
    if (kept) out.add(kept);
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

function readRuleDomains() {
  const domains = [];
  for (const file of fs.readdirSync(RULES_DIR).filter((name) => /^porn_\d+\.json$/.test(name))) {
    const rules = JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), "utf8"));
    for (const rule of rules) {
      const filter = rule.condition && rule.condition.urlFilter;
      if (typeof filter === "string" && filter.startsWith("||") && filter.endsWith("^")) {
        domains.push(filter.slice(2, -1));
      }
    }
  }
  return domains;
}

function syncBlocklistSize(count) {
  const bgPath = path.join(ROOT, "background.js");
  const bg = fs.readFileSync(bgPath, "utf8");
  if (!/BUNDLED_BLOCKLIST_SIZE\s*=\s*\d+/.test(bg)) {
    throw new Error("BUNDLED_BLOCKLIST_SIZE not found in background.js");
  }
  fs.writeFileSync(
    bgPath,
    bg.replace(/BUNDLED_BLOCKLIST_SIZE\s*=\s*\d+/, `BUNDLED_BLOCKLIST_SIZE = ${count}`)
  );

  const agentsPath = path.join(ROOT, "AGENTS.md");
  const agents = fs.readFileSync(agentsPath, "utf8");
  if (!/BUNDLED_BLOCKLIST_SIZE` \(\d+\)/.test(agents)) {
    throw new Error("BUNDLED_BLOCKLIST_SIZE count not found in AGENTS.md");
  }
  fs.writeFileSync(
    agentsPath,
    agents.replace(/BUNDLED_BLOCKLIST_SIZE` \(\d+\)/, `BUNDLED_BLOCKLIST_SIZE\` (${count})`)
  );
}

function writeRulesets(domains) {
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

  fs.writeFileSync(
    path.join(RULES_DIR, "index.json"),
    JSON.stringify({ totalDomains: domains.length, rulesets }, null, 2) + "\n"
  );
  syncBlocklistSize(domains.length);

  console.log(`wrote ${rulesets.length} ruleset file(s), ${domains.length} domains`);
  console.log("rule_resources fragment:");
  console.log(JSON.stringify(rulesets, null, 2));
}

function pruneCurrentRules() {
  const next = new Set();
  const dropped = [];
  for (const domain of readRuleDomains()) {
    const kept = collapseHost(domain);
    if (!kept) {
      dropped.push(domain);
      continue;
    }
    next.add(kept);
  }
  const beforeRestore = next.size;
  for (const domain of loadExistingBadsites()) next.add(domain);
  for (const domain of RESTORED_HOSTS) {
    const kept = collapseHost(domain);
    if (kept) next.add(kept);
  }
  const domains = [...next].sort();
  console.log(`dropped ${dropped.length}: ${dropped.sort().join(" ")}`);
  console.log(`restored ${domains.length - beforeRestore} domain(s) from the curated list`);
  writeRulesets(domains);
}

function main() {
  const [blpPath, sbPath, skinPath] = process.argv.slice(2);
  if (!blpPath && !sbPath && !skinPath) {
    pruneCurrentRules();
    return;
  }
  if (!blpPath || !sbPath || !skinPath) {
    console.error("Usage: node scripts/generate-blocklist.js [<blocklistproject> <stevenblack> <4skin>]");
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
  writeRulesets(domains);
}

module.exports = {
  collapseHost,
  publicSuffix,
  ADULT_PUBLIC_SUFFIXES,
  PLATFORM_DOMAINS,
  RESTORED_HOSTS
};

if (require.main === module) main();
