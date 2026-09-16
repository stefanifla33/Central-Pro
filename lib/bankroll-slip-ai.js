'use strict';

const DEFAULT_MODEL = process.env.GEMINI_BANKROLL_MODEL || 'gemini-3.5-flash-lite';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

const responseSchema = {
  type: 'object',
  properties: {
    bookmaker: { type: 'string', description: 'Nome da casa de apostas visível no print; vazio se não estiver legível.' },
    betType: { type: 'string', description: 'Tipo do bilhete: simples, dupla, tripla ou múltipla.' },
    competition: { type: 'string', description: 'Competição se todas as seleções forem da mesma competição. Use Múltiplas competições se houver mais de uma. Vazio se não for possível saber.' },
    match: { type: 'string', description: 'Para uma seleção, Mandante x Visitante. Para várias seleções, Múltipla · N jogos.' },
    odd: { type: 'number', description: 'Odd total do bilhete. Use 0 se não estiver visível.' },
    stake: { type: 'number', description: 'Valor total apostado, sem símbolo de moeda. Use 0 se não estiver visível.' },
    potentialReturn: { type: 'number', description: 'Retorno/ganho potencial total, sem símbolo de moeda. Use 0 se não estiver visível.' },
    expectedLegs: { type: 'integer', description: 'Quantidade total de seleções/pernas no bilhete.' },
    legs: {
      type: 'array',
      description: 'Uma entrada por seleção real do bilhete, sem duplicatas e na ordem visual.',
      items: {
        type: 'object',
        properties: {
          match: { type: 'string', description: 'Partida desta seleção, preferencialmente Time A x Time B. Vazio se não estiver legível.' },
          market: { type: 'string', description: 'Mercado/jogador desta seleção, por exemplo Resultado Final, Total de gols, Jonathan David — Chutes no gol.' },
          selection: { type: 'string', description: 'Escolha feita no mercado, por exemplo FC Lugano, Mais de 1.5, 1+.' },
          odd: { type: 'number', description: 'Odd individual da seleção; 0 se não estiver visível.' }
        },
        required: ['match', 'market', 'selection', 'odd']
      }
    },
    confidence: { type: 'number', description: 'Confiança geral de 0 a 1 baseada apenas no que está visualmente legível.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Campos incertos, cortados ou ilegíveis. Nunca invente valores.' }
  },
  required: ['bookmaker', 'betType', 'competition', 'match', 'odd', 'stake', 'potentialReturn', 'expectedLegs', 'legs', 'confidence', 'warnings']
};

function parseDataUrl(image) {
  const match = String(image || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) throw Object.assign(new Error('Formato de imagem inválido. Envie PNG, JPG ou WEBP.'), { statusCode: 400 });
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) throw Object.assign(new Error('Formato de imagem não suportado.'), { statusCode: 400 });
  const data = match[2].replace(/\s/g, '');
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) throw Object.assign(new Error('O print é muito grande. Use uma imagem de até 10 MB.'), { statusCode: 413 });
  return { mimeType, data };
}

function textOfGeminiResponse(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part?.text || '').join('').trim();
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeResult(input) {
  const rawLegs = Array.isArray(input?.legs) ? input.legs : [];
  const seen = new Set();
  const legs = [];
  rawLegs.slice(0, 30).forEach((leg) => {
    const normalized = {
      match: cleanText(leg?.match, 120),
      market: cleanText(leg?.market, 120),
      selection: cleanText(leg?.selection, 120),
      odd: n(leg?.odd)
    };
    if (!normalized.match && !normalized.market && !normalized.selection) return;
    const key = `${normalized.match}|${normalized.market}|${normalized.selection}`.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) return;
    seen.add(key);
    legs.push(normalized);
  });

  let expectedLegs = Math.max(0, Math.min(30, Math.round(Number(input?.expectedLegs) || 0)));
  if (!expectedLegs) expectedLegs = legs.length;
  const odd = n(input?.odd);
  const stake = n(input?.stake);
  const potentialReturn = n(input?.potentialReturn);
  const confidence = Math.max(0, Math.min(1, Number(input?.confidence) || 0));
  const warnings = Array.isArray(input?.warnings) ? input.warnings.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 8) : [];

  let match = cleanText(input?.match, 120);
  const uniqueMatches = [...new Set(legs.map((leg) => leg.match).filter(Boolean))];
  if (legs.length > 1 && (!match || !/m[uú]ltipla/i.test(match))) match = `Múltipla · ${uniqueMatches.length || legs.length} jogos`;
  if (legs.length === 1 && !match) match = legs[0].match;

  let competition = cleanText(input?.competition, 80);
  if (legs.length > 1 && !competition) competition = 'Múltiplas competições';

  return {
    bookmaker: cleanText(input?.bookmaker, 60),
    betType: cleanText(input?.betType, 30),
    competition,
    match,
    odd: odd || (stake > 0 && potentialReturn > 0 ? Number((potentialReturn / stake).toFixed(3)) : 0),
    stake,
    potentialReturn,
    expectedLegs,
    legs,
    confidence,
    warnings
  };
}

function prompt() {
  return `Você é um extrator visual de bilhetes de apostas esportivas para a Central Pro.
Analise SOMENTE o que aparece no print enviado. O print pode ser de QUALQUER casa de apostas e pode conter aposta simples, dupla, tripla ou múltipla.

REGRAS CRÍTICAS:
1. Entenda a ESTRUTURA VISUAL do bilhete; não trate textos repetidos, cabeçalhos, abas, odds da interface ou cartões de navegação como novas seleções.
2. Cada perna/seleção real do bilhete deve aparecer exatamente UMA vez em legs.
3. Se o bilhete disser Dupla, expectedLegs deve ser 2; Tripla = 3; e assim por diante. Se não disser, conte as seleções reais visualmente.
4. Para cada leg, associe corretamente: partida/evento + mercado/jogador + seleção escolhida + odd individual (se visível).
5. NÃO invente nomes de times, jogadores, mercados, competição, odd ou stake. Se algo estiver cortado/ilegível, use string vazia ou 0 e explique em warnings.
6. Não confunda odd individual com odd total. A odd total costuma aparecer no resumo do bilhete; stake/aposta é o valor investido; retorno/ganhos potenciais é o valor que pode voltar.
7. Preserve nomes como aparecem, corrigindo apenas erros visuais óbvios quando houver certeza pelo contexto do próprio print.
8. Não use conhecimento externo sobre jogos. Trabalhe apenas com a imagem.
9. Se houver várias competições, competition = "Múltiplas competições".
10. Para várias pernas, match = "Múltipla · N jogos" (N = número de eventos/seleções reconhecidos, salvo quando duas seleções forem do mesmo jogo; nesse caso use o número de jogos distintos).

Devolva somente o JSON solicitado pelo esquema.`;
}

async function analyzeSlipWithGemini({ image, apiKey = process.env.GEMINI_API_KEY, model = DEFAULT_MODEL, fetchImpl = global.fetch } = {}) {
  if (!apiKey) {
    const error = new Error('Leitor por IA ainda não configurado. Adicione GEMINI_API_KEY no arquivo .env e reinicie o servidor.');
    error.statusCode = 503;
    throw error;
  }
  if (typeof fetchImpl !== 'function') throw new Error('Este Node.js não possui fetch disponível. Atualize para Node 18 ou superior.');
  const { mimeType, data } = parseDataUrl(image);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt() }, { inlineData: { mimeType, data } }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema
    }
  };

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    const error = new Error(`Não foi possível analisar o print com IA: ${detail}`);
    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }

  const text = textOfGeminiResponse(payload);
  if (!text) throw Object.assign(new Error('A IA não retornou dados do bilhete. Tente um print mais nítido ou completo.'), { statusCode: 502 });
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) { throw Object.assign(new Error('A IA retornou uma resposta inválida. Tente novamente.'), { statusCode: 502 }); }
  return sanitizeResult(parsed);
}

module.exports = { analyzeSlipWithGemini, sanitizeResult, parseDataUrl, responseSchema };
