'use strict';

const assert = require('assert');
const { analyzeMatchStatsWithGemini, sanitizeAnalysis, parseImages, buildPrompt } = require('../lib/match-stats-ai');

const image = 'data:image/png;base64,aGVsbG8=';

(async () => {
  assert.throws(() => parseImages([]), /pelo menos um print/i);
  assert.throws(() => parseImages(Array.from({ length: 9 }, () => image)), /no máximo 8/i);
  assert.match(buildPrompt({ imageCount: 3 }), /MESMO confronto/);
  assert.match(buildPrompt({ imageCount: 3 }), /não invente estatísticas/i);

  const sanitized = sanitizeAnalysis({
    match: { homeTeam: ' Time A ', awayTeam: 'Time B', competition: 'Liga Teste' },
    dataQuality: 'FORTE',
    printEvidence: [{ printNumber: 1, facts: ['6/10 jogos com gol no 1º tempo'] }],
    generalReading: 'Leitura baseada nos prints.',
    goals: { favorable: ['Dado A'], contrary: ['Dado B'], conclusion: 'Moderada.' },
    firstHalf: { favorable: [], contrary: [], conclusion: 'Sem base.' },
    result: { favorable: [], contrary: [], conclusion: 'Sem base.' },
    cards: { favorable: [], contrary: [], conclusion: 'Sem base.' },
    players: [], contradictions: ['Amostra curta'],
    recommendedMarkets: Array.from({ length: 7 }, (_, index) => ({ market: `Mercado ${index}`, strength: 'moderada', favorableEvidence: ['A'], contraryEvidence: ['B'], mainRisk: 'C' })),
    avoidMarkets: ['Over 3.5'], finalConclusion: 'Entrada seletiva.', warnings: []
  });
  assert.equal(sanitized.match.homeTeam, 'Time A');
  assert.equal(sanitized.dataQuality, 'forte');
  assert.equal(sanitized.recommendedMarkets.length, 5);

  let requestedBody;
  const analysis = await analyzeMatchStatsWithGemini({
    images: [image, image], apiKey: 'test-key', model: 'test-model',
    fetchImpl: async (_url, options) => {
      requestedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(sanitized) }] } }] })
      };
    }
  });
  assert.equal(requestedBody.contents[0].parts.length, 3, 'prompt + duas imagens');
  assert.equal(requestedBody.contents[0].parts.filter(part => part.inlineData).length, 2);
  assert.equal(analysis.match.awayTeam, 'Time B');

  await assert.rejects(() => analyzeMatchStatsWithGemini({ images: [image], apiKey: '' }), /não configurado/i);
  console.log('match-stats-ai tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
