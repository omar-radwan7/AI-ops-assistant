// Offline tests for the email and recovery steps: node tests/emails.test.js
const assert = require('assert');
const fs = require('fs');
const wf = require('../n8n/app-watch.json');
const code = name => wf.nodes.find(n => n.name === name).parameters.jsCode;
// $ stub: returns fixed data per node name.
const stub = data => name => ({ item: { json: data[name] }, first: () => ({ json: data[name] }), all: () => data[name].map(json => ({ json })) });
const settings = { email_from: 'a@b.c', email_to: 'a@b.c', ai_investigation: 'local', timezone: 'Europe/Berlin', app_labels: { shop: 'Shop' } };

const inc = { app: 'shop', root_container: 'shop_db', title: 'shop: db is stopped, 1 other part(s) affected', cause: 'shop_db is not running. <b>x</b>',
  affected: ['shop_api'], evidence: ['shop_api log: "Can\'t reach db:5432" (5x)'], next_steps: ['Start it again: `docker compose -p shop start db`'], needs_investigation: false, code_location: null,
  service: 'db', cause_type: 'stopped_by_command', down_since: new Date(Date.now() - 14.9 * 86400000).toISOString(), down_since_exact: true,
  victim_services: ['api'], affected_detail: ['shop_api: crash loop, because it needs shop_db'] };
const out = {};
const cases = {
  'new incident email has cause, evidence, steps and escapes html': () => {
    const r = new Function('$', '$json', code('Build email'))(stub({ Decide: inc, Settings: settings }), { id: 12 }).json;
    assert.match(r.subject, /^\[ai-ops\] #12 Shop: /);
    assert.match(r.html, /&lt;b&gt;x&lt;\/b&gt;/); assert.match(r.text, /Next steps:\n  1\. Start it again/); assert.match(r.html, /<code[^>]*>docker compose -p shop start db<\/code>/);
    assert.doesNotMatch(r.html, /investigation is running/);
    assert.strictEqual(r.subject, '[ai-ops] #12 Shop: db stopped for 14 days, api crashing');
    assert.match(r.text, /Down for 14 days, since \d\d\.\d\d\.\d{4}/);
    assert.match(r.text, /crash loop, because it needs shop_db/);
    out.new = r;
  },
  'email says an investigation follows when needed': () => {
    const r = new Function('$', '$json', code('Build email'))(stub({ Decide: { ...inc, needs_investigation: true }, Settings: settings }), { id: 13 }).json;
    assert.match(r.text, /second email/);
    const off = new Function('$', '$json', code('Build email'))(stub({ Decide: { ...inc, needs_investigation: true }, Settings: { ...settings, ai_investigation: 'off' } }), { id: 13 }).json;
    assert.doesNotMatch(off.text, /second email/);
  },
  'investigation email lists thrown out claims': () => {
    const ce = { ...inc, incident_id: 13, cause_type: 'app_error', cause: 'api crashes.', investigation: { tools_used: [], rejected_evidence: ['db-1 is down'] } };
    const r = new Function('$', '$json', code('Build investigation email'))(stub({ 'Check evidence': ce, Settings: settings }), { id: 13 }).json;
    assert.match(r.subject, /no deeper cause found/); assert.match(r.html, /Thrown out/); assert.match(r.html, /did not call any tool/);
    out.inv = r;
  },
  'recovered: root running again closes, still broken stays open, app off closes': () => {
    const C = (name, app, State) => ({ Names: ['/' + name], State, Labels: { 'com.docker.compose.project': app } });
    const containers = [C('shop_db', 'shop', 'running'), C('shop_api', 'shop', 'running'), C('x_db', 'x', 'exited'), C('x_api', 'x', 'restarting'), C('y_db', 'y', 'exited')];
    const open = [{ id: 1, app: 'shop', root_container: 'shop_db', affected: ['shop_api'] }, { id: 2, app: 'x', root_container: 'x_db', affected: ['x_api'] }, { id: 3, app: 'y', root_container: 'y_db', affected: [] }];
    const r = new Function('$', '$input', code('Check recovered'))(stub({ 'List containers': containers }), { all: () => open.map(json => ({ json })) }).map(i => i.json);
    assert.deepStrictEqual(r.map(x => x.id), [1, 3]); assert.match(r[1].resolved_note, /switched off/);
  },
  'resolved email shows how long it was open': () => {
    const r = new Function('$', '$json', code('Build resolved email'))(stub({ Settings: settings }), { id: 1, title: 't', cause: 'c', resolved_note: 'n', occurrences: 7, first_seen: '2026-11-26T20:00:00Z', resolved_at: '2026-11-26T20:12:00Z' }).json;
    assert.match(r.text, /Open for 12 minute\(s\), seen in 7 scan\(s\)/);
  },
};
let failed = 0;
for (const [name, t] of Object.entries(cases)) { try { t(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); } }
if (process.env.PREVIEW) fs.writeFileSync(process.env.PREVIEW, out.new.html + '<hr>' + out.inv.html);
process.exit(failed ? 1 : 0);
