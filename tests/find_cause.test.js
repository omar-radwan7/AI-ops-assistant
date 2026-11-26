// Offline tests for the "Find cause" rules: node tests/find_cause.test.js
const assert = require('assert');
const wf = require('../n8n/app-watch.json');
const code = wf.nodes.find(n => n.name === 'Find cause').parameters.jsCode;
const run = items => new Function('$input', code)({ all: () => items.map(json => ({ json })) }).map(i => i.json);

const c = (service, state, depends_on = []) => ({ name: `app_${service}`, service, state, status: state, depends_on });
const fact = (service, over) => ({ app: 'app', container: `app_${service}`, service, kind: 'crash_loop', exit_code: 1, oom_killed: false,
  restart_count: 5, restart_policy: 'unless-stopped', last_stopped: '2026-11-26T20:00:00.000Z', memory_limit_mb: null, how_it_ended: 'it crashed.',
  errors: [], code_location: null, ...over });
const err = (message, count = 3) => ({ message, count, first_seen: '2026-11-26T19:00:00Z', last_seen: '2026-11-26T20:00:00Z', stack: [] });

const cases = {
  'database stopped, backend crash loop, frontend affected': () => {
    const all = [c('db', 'exited'), c('backend', 'restarting', ['db']), c('frontend', 'running', ['backend'])];
    const shutdown = { ...err('FATAL:  terminating connection due to administrator command', 1), last_seen: '2026-11-26T19:58:00Z' };
    const out = run([
      fact('backend', { app_containers: all, errors: [err("Error: P1001: Can't reach database server at `db:5432`", 25)] }),
      fact('db', { app_containers: all, kind: 'stopped', exit_code: 0, errors: [shutdown] }),
    ]);
    assert.strictEqual(out.length, 1, 'one incident, not two');
    assert.strictEqual(out[0].root_container, 'app_db');
    assert.strictEqual(out[0].cause_type, 'stopped_by_command');
    assert.deepStrictEqual(out[0].affected.sort(), ['app_backend', 'app_frontend']);
    assert.ok(out[0].evidence.some(e => /administrator/.test(e)), 'shutdown line 2 min before the stop is evidence');
  },
  'a log line from another day is not evidence': () => {
    const all = [c('db', 'exited')];
    const old = { ...err('FATAL:  terminating connection due to administrator command', 1), last_seen: '2026-11-08T23:44:05Z' };
    const out = run([fact('db', { app_containers: all, kind: 'stopped', exit_code: 0, errors: [old] })]);
    assert.ok(!out[0].evidence.some(e => /administrator/.test(e)));
  },
  'dependency found from the log only (no depends_on)': () => {
    const all = [c('redis', 'exited'), c('api', 'restarting')];
    const out = run([fact('api', { app_containers: all, errors: [err('Error: connect ECONNREFUSED redis:6379')] }),
                     fact('redis', { app_containers: all, kind: 'stopped', exit_code: 137, how_it_ended: 'killed.', errors: [] })]);
    assert.strictEqual(out.length, 1); assert.strictEqual(out[0].root_container, 'app_redis');
  },
  'out of memory': () => {
    const out = run([fact('worker', { app_containers: [c('worker', 'exited')], kind: 'stopped', exit_code: 137, oom_killed: true, memory_limit_mb: 512 })]);
    assert.strictEqual(out[0].cause_type, 'out_of_memory'); assert.match(out[0].cause, /512 MB/);
  },
  'bug in the code with file and line': () => {
    const out = run([fact('api', { app_containers: [c('api', 'restarting')], errors: [err("TypeError: Cannot read properties of undefined (reading 'price')")], code_location: 'at createOrder (/app/src/orders/orderService.ts:87:21)' })]);
    assert.strictEqual(out[0].cause_type, 'code_error'); assert.match(out[0].cause, /orderService\.ts:87/);
  },
  'port already in use': () => {
    const out = run([fact('api', { app_containers: [c('api', 'restarting')], errors: [err('Error: listen EADDRINUSE: address already in use :::3000')] })]);
    assert.strictEqual(out[0].cause_type, 'port_in_use');
  },
  'wrong database password': () => {
    const all = [c('db', 'running'), c('api', 'restarting', ['db'])];
    const out = run([fact('api', { app_containers: all, errors: [err('FATAL: password authentication failed for user "app"')] })]);
    assert.strictEqual(out[0].cause_type, 'bad_credentials'); assert.strictEqual(out[0].root_container, 'app_api', 'db is running, so it is not the cause');
  },
  'two separate problems are not merged': () => {
    const all = [c('a', 'restarting'), c('b', 'restarting')];
    const out = run([fact('a', { app_containers: all, errors: [err('listen EADDRINUSE :::80')] }), fact('b', { app_containers: all, errors: [err('no space left on device')] })]);
    assert.strictEqual(out.length, 2);
  },
  'recovering: db is back and all errors are older, so no incident': () => {
    const all = [{ ...c('db', 'running'), up_seconds: 60 }, c('backend', 'restarting', ['db'])];
    const old = { ...err("Error: P1001: Can't reach database server at `db:5432`", 25), last_seen: new Date(Date.now() - 120000).toISOString() };
    assert.strictEqual(run([fact('backend', { app_containers: all, errors: [old] })]).length, 0);
  },
  'still failing after db is back is a real problem': () => {
    const all = [{ ...c('db', 'running'), up_seconds: 60 }, c('backend', 'restarting', ['db'])];
    const fresh = { ...err("Error: P1001: Can't reach database server at `db:5432`", 25), last_seen: new Date(Date.now() - 5000).toISOString() };
    assert.strictEqual(run([fact('backend', { app_containers: all, errors: [fresh] })]).length, 1);
  },
  'no trace at all goes to the investigation': () => {
    const out = run([fact('api', { app_containers: [c('api', 'restarting')] })]);
    assert.strictEqual(out[0].cause_type, 'unknown'); assert.strictEqual(out[0].needs_investigation, true);
  },
};
let failed = 0;
for (const [name, t] of Object.entries(cases)) { try { t(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); } }
process.exit(failed ? 1 : 0);
