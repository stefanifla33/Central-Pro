const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBilhetesStore, createDemoBilhetes } = require('../lib/bilhetes-store');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-pro-bilhetes-'));
const file = path.join(dir, 'bilhetes.json');
(async () => {
  const store = createBilhetesStore(file); const seed = createDemoBilhetes();
  await store.seed(seed); await store.seed(seed);
  assert.equal(store.list().length, 7); assert.equal(store.get(seed[0].id).id, seed[0].id);
  assert.equal(store.list({ status: 'OPEN' }).length, 7); assert.equal(store.history().length, 7);
  assert.equal(new Set(store.list().map(ticket => ticket.id)).size, 7);
  assert.equal(store.get(seed[0].id).selections[0].marketKey, 'double_chance');
  const snapshot = store.get(seed[0].id); snapshot.selections[0].displaySelection = 'alterado'; assert.notEqual(store.get(seed[0].id).selections[0].displaySelection, 'alterado');
  const restored = createBilhetesStore(file); assert.equal(restored.list().length, 7); assert.equal(restored.list({ date: '2026-09-08' }).length, 7);
  console.log('bilhetes store scenarios: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
