const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RULES_DIR = path.join(ROOT, 'rules');

function readRuleFiles() {
  return fs
    .readdirSync(RULES_DIR)
    .filter((name) => /^porn_\d+\.json$/.test(name))
    .sort();
}

function backgroundSource() {
  return fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
}

test('static rulesets are valid and use unique, well-formed rules', () => {
  const files = readRuleFiles();
  assert.ok(files.length > 0, 'expected at least one porn_*.json ruleset');

  const seenIds = new Set();
  let total = 0;

  for (const file of files) {
    const rules = JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), 'utf8'));
    assert.ok(Array.isArray(rules), `${file} must contain a JSON array`);

    for (const rule of rules) {
      total += 1;
      assert.equal(typeof rule.id, 'number', `${file}: rule id must be a number`);
      assert.ok(!seenIds.has(rule.id), `${file}: duplicate rule id ${rule.id}`);
      seenIds.add(rule.id);

      assert.equal(rule.action?.type, 'redirect');
      assert.match(
        rule.action?.redirect?.extensionPath || '',
        /^\/redirect\.html\?blocked=/,
        `${file}: rule ${rule.id} must redirect to the redirect page`
      );
      assert.match(
        rule.condition?.urlFilter || '',
        /^\|\|[a-z0-9.-]+\^$/,
        `${file}: rule ${rule.id} must use a ||domain^ url filter`
      );
      assert.deepEqual(rule.condition?.resourceTypes, ['main_frame']);
    }
  }

  return total;
});

test('BUNDLED_BLOCKLIST_SIZE constant matches the generated rule count', () => {
  const files = readRuleFiles();
  let total = 0;
  for (const file of files) {
    total += JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), 'utf8')).length;
  }

  const match = backgroundSource().match(/BUNDLED_BLOCKLIST_SIZE\s*=\s*(\d+)/);
  assert.ok(match, 'BUNDLED_BLOCKLIST_SIZE constant not found in background.js');
  assert.equal(
    Number(match[1]),
    total,
    'BUNDLED_BLOCKLIST_SIZE is stale — rerun scripts/generate-blocklist.js and update the constant'
  );
});

test('manifests and background.js reference the same ruleset ids as the files on disk', () => {
  const files = readRuleFiles().map((name) => name.replace(/\.json$/, ''));

  const src = backgroundSource();
  const idsMatch = src.match(/STATIC_RULESET_IDS\s*=\s*\[([^\]]+)\]/);
  assert.ok(idsMatch, 'STATIC_RULESET_IDS not found in background.js');
  const constantIds = idsMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .sort();
  assert.deepEqual(constantIds, files, 'STATIC_RULESET_IDS out of sync with rules/ files');

  for (const manifestName of ['manifest.json', 'manifest.firefox.json']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestName), 'utf8'));
    const resources = manifest.declarative_net_request?.rule_resources || [];
    const ids = resources.map((r) => r.id).sort();
    assert.deepEqual(ids, files, `${manifestName} rule_resources out of sync with rules/ files`);

    for (const r of resources) {
      assert.equal(r.enabled, true, `${manifestName}: ruleset ${r.id} should be enabled by default`);
      assert.ok(
        fs.existsSync(path.join(ROOT, r.path)),
        `${manifestName}: ruleset path ${r.path} does not exist`
      );
    }
  }
});
