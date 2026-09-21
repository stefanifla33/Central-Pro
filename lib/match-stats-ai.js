'use strict';

const { parseDataUrl } = require('./bankroll-slip-ai');

const DEFAULT_MODEL = process.env.GEMINI_MATCH_ANALYSIS_MODEL || process.env.GEMINI_BANKROLL_MODEL || 'gemini-3.5-flash-lite';
const MAX_IMAGES = 8;
const MAX_COMBINED_BYTES = 8 * 1024 * 1024;

const evidenceSectionSchema = {
  type: 'object',
  properties: {
    favorable: { type: 'array', items: { type: 'string' } },
    contrary: { type: 'array', items: { type: 'string' } },
    conclusion: { type: 'string' }
  },
  required: ['favorable', 'contrary', 'conclusion']
};

const responseSchema = {
  type: 'object',
  properties: {
    match: {
      type: 'object',
      properties: {
        homeTeam: { type: 'string' },
        awayTeam: { type: 'string' },
        competition: { type: 'string' }
      },
      required: ['homeTeam', 'awayTeam', 'competition']
    },
    dataQuality: { type: 'string', enum: ['forte', 'moderada', 'fraca'] },
    printEvidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          printNumber: { type: 'integer' },
          facts: { type: 'array', items: { type: 'string' } }
        },
        required: ['printNumber', 'facts']
      }
    },
    generalReading: { type: 'string' },
    goals: evidenceSectionSchema,
    firstHalf: evidenceSectionSchema,
    result: evidenceSectionSchema,
    cards: evidenceSectionSchema,
    players: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          favorable: { type: 'array', items: { type: 'string' } },
          contrary: { type: 'array', items: { type: 'string' } },
          conclusion: { type: 'string' }
        },
        required: ['name', 'favorable', 'contrary', 'conclusion']
      }
    },
    contradictions: { type: 'array', items: { type: 'string' } },
    recommendedMarkets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          market: { type: 'string' },
          favorableEvidence: { type: 'array', items: { type: 'string' } },
          contraryEvidence: { type: 'array', items: { type: 'string' } },
          strength: { type: 'string', enum: ['forte', 'moderada', 'fraca'] },
          mainRisk: { type: 'string' }
        },
        required: ['market', 'favorableEvidence', 'contraryEvidence', 'strength', 'mainRisk']
      }
    },
    avoidMarkets: { type: 'array', items: { type: 'string' } },
    finalConclusion: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } }
  },
  required: ['match', 'dataQuality', 'printEvidence', 'generalReading', 'goals', 'firstHalf', 'result', 'cards', 'players', 'contradictions', 'recommendedMarkets', 'avoidMarkets', 'finalConclusion', 'warnings']
};

function cleanText(value, max = 600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanList(value, maxItems = 10, maxLength = 360) {
  return Array.isArray(value) ? value.map(item => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems) : [];
}

function cleanStrength(value) {
  const normalized = cleanText(value, 20).toLowerCase();
  return ['forte', 'moderada', 'fraca'].includes(normalized) ? normalized : 'fraca';
}

function cleanEvidenceSection(input) {
  return {
    favorable: cleanList(input?.favorable),
    contrary: cleanList(input?.contrary),
    conclusion: cleanText(input?.conclusion, 900)
  };
}

function sanitizeAnalysis(input) {
  const match = input?.match || {};
  return {
    match: {
      homeTeam: cleanText(match.homeTeam, 100),
      awayTeam: cleanText(match.awayTeam, 100),
      competition: cleanText(match.competition, 120)
    },
    dataQuality: cleanStrength(input?.dataQuality),
    printEvidence: (Array.isArray(input?.printEvidence) ? input.printEvidence : []).slice(0, MAX_IMAGES).map((item, index) => ({
      printNumber: Math.max(1, Math.min(MAX_IMAGES, Math.round(Number(item?.printNumber) || index + 1))),
      facts: cleanList(item?.facts, 12, 320)
    })),
    generalReading: cleanText(input?.generalReading, 1800),
    goals: cleanEvidenceSection(input?.goals),
    firstHalf: cleanEvidenceSection(input?.firstHalf),
    result: cleanEvidenceSection(input?.result),
    cards: cleanEvidenceSection(input?.cards),
    players: (Array.isArray(input?.players) ? input.players : []).slice(0, 12).map(player => ({
      name: cleanText(player?.name, 100),
      favorable: cleanList(player?.favorable, 8, 320),
      contrary: cleanList(player?.contrary, 8, 320),
      conclusion: cleanText(player?.conclusion, 700)
    })).filter(player => player.name),
    contradictions: cleanList(input?.contradictions, 14, 420),
    recommendedMarkets: (Array.isArray(input?.recommendedMarkets) ? input.recommendedMarkets : []).slice(0, 5).map(item => ({
      market: cleanText(item?.market, 140),
      favorableEvidence: cleanList(item?.favorableEvidence, 8, 320),
      contraryEvidence: cleanList(item?.contraryEvidence, 8, 320),
      strength: cleanStrength(item?.strength),
      mainRisk: cleanText(item?.mainRisk, 500)
    })).filter(item => item.market),
    avoidMarkets: cleanList(input?.avoidMarkets, 10, 360),
    finalConclusion: cleanText(input?.finalConclusion, 1800),
    warnings: cleanList(input?.warnings, 12, 360)
  };
}

function textOfGeminiResponse(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part?.text || '').join('').trim();
}

function buildPrompt({ matchHint = '', imageCount = 1 } = {}) {
  const hint = cleanText(matchHint, 180);
  return `Você é o analista profissional da Central Pro. Receberá ${imageCount} print(s) de estatísticas do MESMO confronto e deve analisá-los como um conjunto único.
${hint ? `Confronto informado pela analista: ${hint}.` : 'Identifique o confronto somente se ele estiver legível nos prints.'}

REGRAS OBRIGATÓRIAS:
1. Use somente dados visíveis nos prints. Não pesquise, não complete com conhecimento externo e não invente estatísticas, percentuais, escalações ou nomes.
2. Diferencie fatos visíveis, estatísticas e interpretação. Ao citar uma evidência, mencione o valor e o contexto mostrados quando estiverem legíveis.
3. Faça análise adversarial: para cada tendência favorável, procure dados que a contradigam, enfraqueçam ou invalidem.
4. Considere amostra, recência, casa/fora, primeiro e segundo tempo, gols, finalizações, cartões, escanteios, escalação e jogadores somente quando essas informações aparecerem.
5. Para jogadores, considere frequência real, amostra, minutos/titularidade, função e adversário apenas quando visíveis. Não recomende jogador sem suporte suficiente.
6. Não transforme frequência histórica em probabilidade futura. Não crie porcentagens de confiança. Classifique força apenas como forte, moderada ou fraca.
7. Se um mercado não estiver sustentado pelos prints, coloque-o em mercados a evitar. Não force cinco recomendações; devolva apenas as realmente sustentadas, no máximo cinco.
8. Em printEvidence, registre os principais fatos de cada print usando a numeração na ordem recebida.
9. Se houver dados cortados, ilegíveis, conflitantes ou ausentes, declare isso em warnings.
10. A conclusão deve ser objetiva, prudente e útil para decisão; não prometa green nem resultado.

Analise: leitura geral; gols; primeiro tempo; resultado/força das equipes; cartões; jogadores; dados contrários; melhores mercados; mercados a evitar; conclusão. Devolva somente o JSON do esquema.`;
}

function parseImages(images) {
  if (!Array.isArray(images) || !images.length) throw Object.assign(new Error('Envie pelo menos um print.'), { statusCode: 400 });
  if (images.length > MAX_IMAGES) throw Object.assign(new Error(`Envie no máximo ${MAX_IMAGES} prints por análise.`), { statusCode: 400 });
  let totalBytes = 0;
  const parsed = images.map(image => {
    const parsedImage = parseDataUrl(image);
    totalBytes += Math.floor((parsedImage.data.length * 3) / 4);
    return parsedImage;
  });
  if (totalBytes > MAX_COMBINED_BYTES) throw Object.assign(new Error('Os prints somados estão muito grandes. Reduza a quantidade ou o tamanho das imagens.'), { statusCode: 413 });
  return parsed;
}

async function analyzeMatchStatsWithGemini({ images, matchHint, apiKey = process.env.GEMINI_API_KEY, model = DEFAULT_MODEL, fetchImpl = global.fetch } = {}) {
  if (!apiKey) throw Object.assign(new Error('Analisador por IA ainda não configurado.'), { statusCode: 503 });
  if (typeof fetchImpl !== 'function') throw new Error('Este Node.js não possui fetch disponível. Atualize para Node 18 ou superior.');
  const parsedImages = parseImages(images);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts = [{ text: buildPrompt({ matchHint, imageCount: parsedImages.length }) }];
  parsedImages.forEach(({ mimeType, data }) => parts.push({ inlineData: { mimeType, data } }));
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(`Não foi possível analisar os prints: ${detail}`), { statusCode: response.status === 429 ? 429 : 502 });
  }
  const text = textOfGeminiResponse(payload);
  if (!text) throw Object.assign(new Error('A IA não retornou uma análise. Tente prints mais nítidos ou completos.'), { statusCode: 502 });
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) { throw Object.assign(new Error('A IA retornou uma resposta inválida. Tente novamente.'), { statusCode: 502 }); }
  return sanitizeAnalysis(parsed);
}

module.exports = { analyzeMatchStatsWithGemini, sanitizeAnalysis, parseImages, buildPrompt, responseSchema, MAX_IMAGES };
