const assert = require('assert');
const { createRemoteFootballCache } = require('../lib/remote-football-cache');
const { createPrematchOddsService } = require('../lib/prematch-odds');
(async () => {
  const redis = new Map(); let external = 0;
  const fetchImpl = async (url, options) => { const args = JSON.parse(options.body); const command = args[0]; if (command === 'SET') { const ttl = args[4]; redis.set(args[1], { value: args[2], expiresAt: Date.now() + Number(ttl) * 1000 }); return { ok: true, async json() { return { result: 'OK' }; } }; } if (command === 'GET') { const item = redis.get(args[1]); if (!item || item.expiresAt <= Date.now()) return { ok: true, async json() { return { result: null }; } }; return { ok: true, async json() { return { result: item.value }; } }; } throw new Error('unexpected command'); };
  const cache = createRemoteFootballCache({ env: { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'secret' }, fetch: fetchImpl });
  const value = { fixtureId: 22, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), selections: { over15: [{ bookmakerId: 34, name: 'Superbet', odd: '1.90', marketId: 5, market: 'Goals Over/Under', selection: 'Over 1.5', update: new Date().toISOString() }] } };
  await cache.setNormalizedOdds(22, value, 1); const read = await cache.getNormalizedOdds(22); assert.equal(read.fixtureId, 22); assert.equal(read.selections.over15[0].name, 'Superbet'); read.selections.over15[0].odd = '9.99'; assert.equal((await cache.getNormalizedOdds(22)).selections.over15[0].odd, '1.90');
  await new Promise(resolve => setTimeout(resolve, 1100)); assert.equal(await cache.getNormalizedOdds(22), null);
  const service = createPrematchOddsService({ football: async () => { external++; throw new Error('must not fetch'); }, sharedCache: cache }); assert.equal(await cache.getNormalizedOdds(999), null); assert.equal(external, 0); assert.equal(service.getCachedOdds(999), null);
  console.log('normalized odds shared cache scenarios: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
