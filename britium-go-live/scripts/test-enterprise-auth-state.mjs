import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';

// Execute the real component and its auth callbacks. Only the network boundary
// and deferred timer queue are substituted so every race is deterministic.
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const session = id => ({ user: { id }, access_token: `token-${id}` });
const approved = id => ({ authorized: true, auth_user_id: id, role: 'admin' });
const response = data => ({ data, error: null });
const tests = [];
const test = (name, run) => tests.push({ name, run });
let current;

async function harness() {
  const sessions = [], rpcs = [], timers = [], snapshots = [], warnings = [];
  let listener, state, renderer, signouts = 0, mounts = 0;
  const client = {
    rpc: () => { const request = deferred(); rpcs.push(request); return request.promise; },
    auth: {
      getSession: () => { const request = deferred(); sessions.push(request); return request.promise; },
      onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => { signouts++; },
      signInWithPassword: async () => ({ error: null }),
    },
  };
  const exports = {};
  const scopedGlobal = { setTimeout: callback => { timers.push(callback); return timers.length; } };
  Function('require', 'exports', 'globalThis', 'console', compiled)(
    name => name === '@/lib/supabaseClient' ? { supabase: client } : require(name),
    exports, scopedGlobal, { ...console, warn: (...args) => warnings.push(args) },
  );
  function Draft() {
    const [draft] = React.useState(() => { mounts++; return 'unsaved parcel'; });
    return React.createElement('draft', null, draft);
  }
  function Probe() {
    state = exports.useAuth();
    snapshots.push({ user: state.user?.id, profile: state.profile, loading: state.loading });
    return state.loading || !state.profile?.authorized ? null : React.createElement(Draft);
  }
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.AuthProvider, null, React.createElement(Probe))); });
  const h = {
    sessions, rpcs, timers, snapshots, warnings,
    get state() { return state; }, get signouts() { return signouts; }, get mounts() { return mounts; },
    emit: async (event, next) => { await act(async () => listener(event, next)); },
    settle: async (request, value) => { await act(async () => request.resolve(value)); },
    reject: async request => { await act(async () => request.reject(new Error('session lookup failed'))); },
    flush: async () => { await act(async () => { while (timers.length) timers.shift()(); }); },
    unmount: async () => { await act(async () => renderer.unmount()); },
    ready: async (id = 'A') => {
      await h.settle(sessions[0], { data: { session: session(id) } });
      await h.settle(rpcs[0], response(approved(id)));
    },
  };
  current = h;
  return h;
}

test('in-flight auth profile cannot restore access after SIGNED_OUT', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.flush();
  await h.emit('SIGNED_OUT', null);
  await h.settle(h.rpcs[1], response(approved('A')));
  assert.equal(h.state.user, null); assert.equal(h.state.profile, null);
});
test('queued auth work is canceled before it starts after logout', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.emit('SIGNED_OUT', null); await h.flush();
  assert.equal(h.rpcs.length, 1, 'stale queued work must not call RPC with a changed session');
});
test('late bootstrap session cannot resurrect a logged out user', async () => {
  const h = await harness(); await h.emit('SIGNED_OUT', null);
  await h.settle(h.sessions[0], { data: { session: session('A') } });
  assert.equal(h.state.user, null); assert.equal(h.rpcs.length, 0);
});
test('in-flight bootstrap profile cannot restore access after logout', async () => {
  const h = await harness();
  await h.settle(h.sessions[0], { data: { session: session('A') } });
  await h.emit('SIGNED_OUT', null); await h.settle(h.rpcs[0], response(approved('A')));
  assert.equal(h.state.profile, null);
});
test('UUID switch clears A approval and blocks B until B is verified', async () => {
  const h = await harness(); await h.ready();
  await h.emit('TOKEN_REFRESHED', session('B'));
  assert.equal(h.state.profile, null, 'A approval must not authorize B');
  assert.equal(h.state.loading, true);
  await h.flush(); await h.settle(h.rpcs[1], response({ authorized: false, reason: 'ACCOUNT_INACTIVE' }));
  assert.equal(h.state.user, null); assert.equal(h.state.profile, null); assert.equal(h.signouts, 1);
});
test('same approved UUID token resume preserves mounted draft without splash or RPC', async () => {
  const h = await harness(); await h.ready(); const start = h.snapshots.length;
  await h.emit('TOKEN_REFRESHED', session('A')); await h.flush();
  assert.equal(h.state.profile.auth_user_id, 'A'); assert.equal(h.rpcs.length, 1);
  assert.equal(h.mounts, 1); assert.ok(h.snapshots.slice(start).every(s => !s.loading));
});
test('stale A approval cannot attach to newly signed in B', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.flush();
  await h.emit('SIGNED_IN', session('B')); await h.flush();
  await h.settle(h.rpcs[1], response(approved('A')));
  assert.equal(h.state.profile, null);
  await h.settle(h.rpcs[2], response(approved('B')));
  assert.equal(h.state.user.id, 'B'); assert.equal(h.state.profile.auth_user_id, 'B');
});
test('stale denial cannot sign out newly verified B', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.flush();
  await h.emit('SIGNED_IN', session('B')); await h.flush();
  await h.settle(h.rpcs[2], response(approved('B')));
  await h.settle(h.rpcs[1], response({ authorized: false }));
  assert.equal(h.state.user.id, 'B'); assert.equal(h.signouts, 0);
});
test('refreshProfile session lookup cannot undo logout', async () => {
  const h = await harness(); await h.ready();
  const refresh = h.state.refreshProfile();
  await h.emit('SIGNED_OUT', null);
  await h.settle(h.sessions[1], { data: { session: session('A') } });
  if (h.rpcs[1]) await h.settle(h.rpcs[1], response(approved('A')));
  await act(async () => refresh);
  assert.equal(h.state.user, null); assert.equal(h.state.profile, null);
});
test('explicit signOut invalidates pending work even without an auth event', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.flush();
  await act(async () => h.state.signOut());
  await h.settle(h.rpcs[1], response(approved('A')));
  assert.equal(h.state.profile, null);
});
test('unmount cancels queued RPC and suppresses stale denial sign-out', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.flush();
  await h.emit('SIGNED_IN', session('A')); await h.unmount(); await h.flush();
  assert.equal(h.rpcs.length, 2);
  await h.settle(h.rpcs[1], response({ authorized: false }));
  assert.equal(h.signouts, 0);
});
test('unmount suppresses an in-flight denial without a newer request', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.flush(); await h.unmount();
  await h.settle(h.rpcs[1], response({ authorized: false }));
  assert.equal(h.signouts, 0);
});
test('refreshProfile RPC cannot restore a logged out profile', async () => {
  const h = await harness(); await h.ready();
  const refresh = h.state.refreshProfile();
  await h.settle(h.sessions[1], { data: { session: session('A') } });
  await h.emit('SIGNED_OUT', null);
  await h.settle(h.rpcs[1], response(approved('A'))); await act(async () => refresh);
  assert.equal(h.state.user, null); assert.equal(h.state.profile, null);
});
test('same UUID resume keeps drafts when verification is temporarily unavailable', async () => {
  const h = await harness(); await h.ready(); const start = h.snapshots.length;
  await h.emit('SIGNED_IN', session('A')); await h.flush();
  await h.settle(h.rpcs[1], { data: null, error: { message: 'offline' } });
  assert.equal(h.state.user.id, 'A'); assert.equal(h.state.profile.auth_user_id, 'A');
  assert.equal(h.mounts, 1); assert.equal(h.signouts, 0);
  assert.ok(h.snapshots.slice(start).every(s => !s.loading));
});
test('bootstrap profile finishing after B verification cannot overwrite B', async () => {
  const h = await harness();
  await h.settle(h.sessions[0], { data: { session: session('A') } });
  await h.emit('SIGNED_IN', session('B')); await h.flush();
  await h.settle(h.rpcs[1], response(approved('B')));
  await h.settle(h.rpcs[0], response(approved('A')));
  assert.equal(h.state.user.id, 'B'); assert.equal(h.state.profile.auth_user_id, 'B');
});
test('rejected bootstrap lookup ends loading with access closed', async () => {
  const h = await harness(); await h.reject(h.sessions[0]);
  assert.equal(h.state.loading, false);
  assert.equal(h.state.user, null); assert.equal(h.state.profile, null);
  assert.equal(h.rpcs.length, 0); assert.equal(h.signouts, 0);
});
test('late rejected bootstrap lookup preserves a newer approved UUID', async () => {
  const h = await harness(); await h.emit('SIGNED_IN', session('B')); await h.flush();
  await h.settle(h.rpcs[0], response(approved('B')));
  await h.reject(h.sessions[0]);
  assert.equal(h.state.user.id, 'B'); assert.equal(h.state.profile.auth_user_id, 'B');
  assert.equal(h.state.loading, false); assert.equal(h.signouts, 0);
});
test('late rejected bootstrap lookup preserves completed logout', async () => {
  const h = await harness(); await h.emit('SIGNED_OUT', null); await h.reject(h.sessions[0]);
  assert.equal(h.state.loading, false); assert.equal(h.state.user, null);
  assert.equal(h.state.profile, null); assert.equal(h.signouts, 0);
});
test('late rejected bootstrap lookup after unmount has no side effects', async () => {
  const h = await harness(); await h.unmount(); const count = h.snapshots.length;
  await h.reject(h.sessions[0]);
  assert.equal(h.snapshots.length, count); assert.equal(h.signouts, 0); assert.equal(h.warnings.length, 0);
});
test('same UUID token refresh preserves authoritative denial from pending verification', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.flush();
  await h.emit('TOKEN_REFRESHED', session('A'));
  await h.settle(h.rpcs[1], response({ authorized: false, reason: 'ACCOUNT_INACTIVE' }));
  assert.equal(h.state.user, null); assert.equal(h.state.profile, null);
  assert.equal(h.signouts, 1); assert.equal(h.state.loading, false);
});
test('same UUID token refresh preserves updated approval from pending verification', async () => {
  const h = await harness(); await h.ready();
  await h.emit('SIGNED_IN', session('A')); await h.flush();
  await h.emit('TOKEN_REFRESHED', session('A'));
  await h.settle(h.rpcs[1], response({ ...approved('A'), role: 'branch_user' }));
  assert.equal(h.state.user.id, 'A'); assert.equal(h.state.role, 'branch_user');
  assert.equal(h.mounts, 1); assert.equal(h.signouts, 0);
});
// Observe the process boundary too: assertions must fail for unhandled promises,
// rather than silently adding a rejection handler to the mocked SDK promise.
const unhandled = [];
const observeRejection = error => unhandled.push(error.message);
process.on('unhandledRejection', observeRejection);
let failed = 0;
for (const { name, run } of tests) {
  current = null;
  unhandled.length = 0;
  try {
    await run();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, [], 'auth promises must not escape as unhandled rejections');
    console.log(`PASS ${name}`);
  }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
  finally { await current?.unmount(); }
}
process.removeListener('unhandledRejection', observeRejection);
console.log(`${tests.length - failed}/${tests.length} Enterprise auth state regressions passed`);
if (failed) process.exitCode = 1;
