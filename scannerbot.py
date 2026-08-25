import asyncio
import csv
from datetime import datetime, timezone
import json
import os
import random
import re
import time
import unicodedata
from pathlib import Path
import requests
from telethon import TelegramClient, events


def carregar_env_local():
    """Carrega o .env ao lado do script sem exigir outra dependência."""
    arquivo = Path(__file__).with_name(".env")
    if not arquivo.exists():
        return
    for linha in arquivo.read_text(encoding="utf-8-sig").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip("\"'"))


carregar_env_local()
 
# ==============================================================================
# CONFIGURAÇÕES GERAIS E CHAVES
# ==============================================================================
MODO_TESTE = False
INTERVALO_SCANNER = 180
ODD_MINIMA = 1.50
ODD_MAXIMA = 2.40
ODD_MAX_IDADE_SEGUNDOS = 300
# Filtro de valor: a leitura estatistica abre a oportunidade, mas o sinal so
# sai quando a cotacao tambem oferece uma margem minima sobre a probabilidade
# implicita da casa. Evita entradas com EV negativo sem deixar o scanner duro.
EV_MINIMO = 0.05
PROBABILIDADE_MINIMA = {
    "GOLS": 0.60,
    "VITÓRIA": 0.50,
    "HANDICAP / DUPLA CHANCE": 0.58,
}
# Under foi removido dos sinais. Gols e vitoria sao analisados normalmente;
# handicap permanece em observacao.
MERCADOS_ATIVOS = {"GOLS", "VITÓRIA"}
# Informe exatamente como o bookmaker aparece no feed. Vazio aceita a fonte
# agregada da API, mas deixa isso explícito no sinal.
BOOKMAKER_PREFERIDO = os.getenv("BOOKMAKER_PREFERIDO", "").strip()
PERMITIR_VITORIA_SECA = True
COOLDOWN_MERCADO_SEGUNDOS = 20 * 60
TENTATIVAS_SEM_STATS = 3
INTERVALO_RETRY_SEM_STATS = 10 * 60
# v2 inclui bookmaker e instante da cotação; mantém o CSV antigo intacto.
ARQUIVO_SINAIS = Path(__file__).with_name("scanner_sinais_v2.csv")
 
# 1. Telethon (Redirecionador)
API_ID = 13011564
API_HASH = 'acecff785a3cdd93f46ae8ddfeafab48'
SESSION_NAME = 'sessao_stefani_unificada'
BETBOTS_CHAT_ID = 1674039203
MEU_CHAT_GOLS = -1003720088280
MEU_CHAT_ESCANTEIOS = -1003886920686
 
# 2. Scanner Ao Vivo (API Football)
API_FOOTBALL_KEY = "c35387c43d4629689fbf174560a07c21"
TELEGRAM_BOT_TOKEN_SCANNER = "8867225270:AAHzpGbPxbnN3h1IwY2roJ5SXvyDn1ie4Gk"
CHAT_ID_SCANNER = "-1004493700909"
 
# Controle de Duplicatas e Travas
jogos_enviados_redirecionador = set()
jogos_ja_alertados_scanner = {}  # chave fixture:mercado:linha -> timestamp
jogos_sem_estatisticas = {}      # fixture -> {tentativas, proxima_tentativa}
pausa_ate = 0.0                  # timestamp até quando o scanner deve ficar pausado (rate limit)
snapshots_scanner = {}            # fixture -> último snapshot para medir pressão recente
 
# Janela de Tempo para Análise. O scanner acompanha desde o início, mas só
# decide depois de comparar pelo menos dois snapshots da partida.
MINUTO_MINIMO_SCANNER = 0
MINUTO_MAXIMO_SCANNER = 85   # depois disso não sobra tempo pro mercado "confirmar"
MINUTO_INICIO_GOLS = 15
 
# Tempo (em segundos) que um fixture fica "bloqueado" após um alerta, mesmo que
# o jogo já tenha terminado — evita vazamento de memória em partidas muito longas
COOLDOWN_LIMPEZA_SEGUNDOS = 3 * 60 * 60  # 3 horas
 
client = TelegramClient(SESSION_NAME, API_ID, API_HASH)


def eh_entrada_under(texto):
    """Trava global para nenhuma entrada under chegar aos canais."""
    normalizado = unicodedata.normalize("NFKD", str(texto).casefold())
    normalizado = "".join(c for c in normalizado if not unicodedata.combining(c))
    return bool(re.search(r"\bunder\b|\bmenos\s+de\b|\babaixo\s+de\b", normalizado))
 
# ==============================================================================
# MÓDULO 1: REDIRECIONADOR (TELETHON) — sem alterações
# ==============================================================================
@client.on(events.NewMessage(chats=BETBOTS_CHAT_ID))
async def receber_mensagem_redirecionador(event):
    texto = event.raw_text
    texto_minusculo = texto.lower()

    if eh_entrada_under(texto):
        print("⛔ [Redirecionador] Entrada under bloqueada.")
        return
 
    jogo = "Jogo ao vivo"
    nome_do_bot_cabecalho = ""
 
    for linha in texto.split("\n"):
        linha_limpa = linha.strip()
        if "nome do bot:" in linha_limpa.lower():
            nome_do_bot_cabecalho = linha_limpa.lower()
 
        if " x " in linha_limpa.lower() and "/" not in linha_limpa and "⏰" not in linha_limpa and "cantos:" not in linha_limpa.lower():
            jogo = re.sub(r'^[^\w\s\(\)]+|[^\w\s\(\)]+$', '', linha_limpa).strip()
 
    jogo_normalizado = re.sub(r'\s+', ' ', jogo.lower()).strip()
 
    categoria_match = re.search(r'(?:Categoria|Dica|Recomendado):\s*(.+)', texto, re.IGNORECASE)
    estrategia_nome = categoria_match.group(1).strip().lower() if categoria_match else ""
 
    link_match = re.search(r'(https?://\S+)', texto)
    link = link_match.group(1) if link_match else "https://www.bet365.bet.br/"
 
    palavras_escanteios = ["escanteio", "escanteios", "canto", "cantos", "corner", "corners"]
    palavras_gols = ["gol", "gols", "over", "under", "ambas", "btts", "mais de", "menos de"]
    palavras_vitoria_handicap = ["vitoria", "vitória", "ml", "handicap", "ha", "asiatico", "dupla chance"]
 
    def contem_palavra(txt, lista_palavras):
        return any(palavra in txt for palavra in lista_palavras)
 
    # Escanteios precisa ser verificado antes de "over/under", pois mensagens
    # como "Over 8.5 escanteios" também contêm palavras genéricas de gols.
    if contem_palavra(estrategia_nome, palavras_escanteios) or contem_palavra(nome_do_bot_cabecalho, palavras_escanteios):
        tipo_mercado = "escanteios"
    elif contem_palavra(estrategia_nome, palavras_gols) or contem_palavra(nome_do_bot_cabecalho, palavras_gols):
        tipo_mercado = "gol"
    elif contem_palavra(estrategia_nome, palavras_vitoria_handicap) or contem_palavra(nome_do_bot_cabecalho, palavras_vitoria_handicap):
        tipo_mercado = "vitoria_handicap"
    else:
        tipo_mercado = "outro"
 
    if tipo_mercado == "outro":
        return
 
    chave_unica = f"{jogo_normalizado}-{tipo_mercado}"
    if chave_unica in jogos_enviados_redirecionador:
        print(f"⛔ [Redirecionador] Duplicado bloqueado: {jogo}")
        return
 
    eh_escanteios = tipo_mercado == "escanteios"
    chat_destino = MEU_CHAT_ESCANTEIOS if eh_escanteios else MEU_CHAT_GOLS
    titulo = "🚩 RADAR DE ESCANTEIOS" if eh_escanteios else "⚽ RADAR DE GOLS & MERCADOS PRINCIPAIS"
    icone = "🚩" if eh_escanteios else "⚽"

    mensagem = (
        f"<b>{titulo}</b>\n\n"
        f"{icone} {jogo}\n"
        f"✅ {estrategia_nome.upper() if estrategia_nome else 'ENTRADA SUGERIDA'}\n\n"
        f"📲 <a href='{link}'>Abrir jogo</a>"
    )
    await client.send_message(chat_destino, mensagem, parse_mode='html')
    jogos_enviados_redirecionador.add(chave_unica)
    print(f"✅ [Redirecionador] Sinal de {tipo_mercado} enviado para {chat_destino}: {jogo}")
 
 
# ==============================================================================
# MÓDULO 2: SCANNER AO VIVO — 25' até 75' — critérios reforçados
# ==============================================================================
def enviar_telegram_scanner(mensagem):
    if eh_entrada_under(mensagem):
        print("⛔ [Scanner] Entrada under bloqueada antes do envio.")
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN_SCANNER}/sendMessage"
    payload = {
        "chat_id": CHAT_ID_SCANNER,
        "text": mensagem,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"❌ Erro ao enviar mensagem para o Telegram Scanner: {e}")
 
 
def _checar_erro_rate_limit(payload):
    """Verifica se a API sinalizou estouro de cota (campo 'errors' vem
    populado nesses casos, mesmo com HTTP 200). Se sim, ativa uma pausa
    de segurança pro scanner não continuar batendo à toa."""
    global pausa_ate
    erros = payload.get("errors")
    if erros:
        texto_erro = json.dumps(erros, ensure_ascii=False).lower()
        if "rate" in texto_erro or "limit" in texto_erro or "quota" in texto_erro:
            pausa_ate = time.time() + 15 * 60  # pausa 15 minutos
            print(f"🛑 [API] Limite de requisições sinalizado: {erros}. Pausando 15min.")
            return True
        else:
            print(f"⚠️ [API] Erros retornados: {erros}")
    return False
 
 
def buscar_jogos_ao_vivo():
    url = "https://v3.football.api-sports.io/fixtures?live=all"
    headers = {"x-apisports-key": API_FOOTBALL_KEY}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            payload = response.json()
            if _checar_erro_rate_limit(payload):
                return []
            return payload.get("response", [])
        print(f"❌ API Football fixtures: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Erro ao buscar jogos ao vivo: {e}")
    return []


def buscar_eventos_jogo(fixture_id):
    url = f"https://v3.football.api-sports.io/fixtures/events?fixture={fixture_id}"
    headers = {"x-apisports-key": API_FOOTBALL_KEY}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            payload = response.json()
            if _checar_erro_rate_limit(payload):
                return []
            return payload.get("response", [])
    except Exception as e:
        print(f"❌ Erro ao buscar eventos {fixture_id}: {e}")
    return []
 
 
def buscar_estatisticas_jogo(fixture_id):
    url = f"https://v3.football.api-sports.io/fixtures/statistics?fixture={fixture_id}"
    headers = {"x-apisports-key": API_FOOTBALL_KEY}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            payload = response.json()
            if _checar_erro_rate_limit(payload):
                return []
            return payload.get("response", [])
        print(f"❌ API Football statistics {fixture_id}: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Erro ao buscar estatísticas {fixture_id}: {e}")
    return []


def buscar_odds_ao_vivo(fixture_id):
    """Busca e normaliza odds live, preservando fonte e hora da cotação."""
    url = f"https://v3.football.api-sports.io/odds/live?fixture={fixture_id}"
    headers = {"x-apisports-key": API_FOOTBALL_KEY}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            payload = response.json()
            if _checar_erro_rate_limit(payload):
                return []
            return normalizar_feed_odds(payload.get("response", []), BOOKMAKER_PREFERIDO or None)
        print(f"❌ API Football live odds {fixture_id}: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Erro ao buscar odds ao vivo {fixture_id}: {e}")
    return []


def normalizar_feed_odds(registros, fonte_padrao=None):
    """Aceita os formatos direto e por bookmaker usados pela API-Football."""
    mercados = []
    for registro in registros or []:
        atualizado = registro.get("update") or registro.get("updated_at")
        fontes = registro.get("bookmakers") or []
        if fontes:
            for fonte in fontes:
                bookmaker = fonte.get("name") or str(fonte.get("id") or "API-Football")
                for mercado in fonte.get("bets") or fonte.get("odds") or []:
                    mercados.append({**mercado, "_bookmaker": bookmaker, "_updated_at": atualizado})
        else:
            bookmaker = registro.get("bookmaker", {}).get("name") if isinstance(registro.get("bookmaker"), dict) else registro.get("bookmaker")
            for mercado in registro.get("odds") or registro.get("bets") or []:
                mercados.append({**mercado, "_bookmaker": bookmaker or fonte_padrao or "API-Football (agregada)", "_updated_at": atualizado})
    return mercados


def _idade_cotacao_segundos(valor, agora=None):
    if not valor:
        return None
    try:
        instante = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
        if instante.tzinfo is None:
            instante = instante.replace(tzinfo=timezone.utc)
        return max(0, ((agora or datetime.now(timezone.utc)) - instante).total_seconds())
    except (TypeError, ValueError):
        return None


def _numero(valor):
    try:
        return float(str(valor).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _linhas_asiaticas(valor):
    """Extrai linhas simples e divididas (ex.: +0,5 ou 1,5, 2,0)."""
    if valor is None:
        return []
    texto = str(valor).strip().replace(",", ".")
    return [float(numero) for numero in re.findall(r"[-+]?\d+(?:\.\d+)?", texto)]


def _formatar_linha_asiatica(linhas):
    return ", ".join(f"{linha:+g}" if linha != 0 else "0.0" for linha in linhas)


def _texto_normalizado(valor):
    texto = unicodedata.normalize("NFKD", str(valor)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", texto.lower()).strip()


def selecionar_odd_compativel(odds, categoria, entrada, home, away, hg, ag, tempo=None):
    """Encontra o mercado exato do sinal e retorna a melhor cotação válida.

    A API live entrega mercados diretamente em response[0].odds. Não fazemos
    aproximação entre linhas: um Over 2.5 só aceita handicap 2.5, por exemplo.
    """
    candidatos = []
    lado_home = home.lower() in entrada.lower()

    for mercado in odds or []:
        bookmaker = mercado.get("_bookmaker") or "API-Football (agregada)"
        # O feed live algumas vezes entrega a cotação agregada, sem o nome
        # da casa. Nesse caso ela continua válida; só rejeitamos quando a API
        # identifica explicitamente uma casa diferente da preferida.
        fonte_agregada = _texto_normalizado(bookmaker) in {
            "api football", "api football agregada"
        }
        if (BOOKMAKER_PREFERIDO and not fonte_agregada and
                _texto_normalizado(bookmaker) != _texto_normalizado(BOOKMAKER_PREFERIDO)):
            continue
        idade = _idade_cotacao_segundos(mercado.get("_updated_at"))
        # Sem relógio não chamamos a cotação de atual; com relógio, odds
        # velhas são descartadas antes de qualquer cálculo de valor.
        if idade is not None and idade > ODD_MAX_IDADE_SEGUNDOS:
            continue
        nome = _texto_normalizado(mercado.get("name"))
        for opcao in mercado.get("values") or []:
            if opcao.get("suspended") is True:
                continue
            odd = _numero(opcao.get("odd"))
            if odd is None or not (ODD_MINIMA <= odd <= ODD_MAXIMA):
                continue
            valor_original = opcao.get("value")
            valor = _texto_normalizado(valor_original)
            linhas = _linhas_asiaticas(opcao.get("handicap"))
            handicap = sum(linhas) / len(linhas) if linhas else None
            prioridade = 0
            descricao = None

            if categoria in ("GOLS", "UNDER GOLS"):
                if not linhas:
                    linhas = _linhas_asiaticas(valor_original)
                    handicap = sum(linhas) / len(linhas) if linhas else None
                mercado_gols = any(x in nome for x in ("over under", "total goals", "goals over", "asian total"))
                lado_over = valor == "over" or valor.startswith("over ") or valor.startswith("mais de")
                lado_under = valor == "under" or valor.startswith("under ") or valor.startswith("menos de")
                if categoria == "GOLS":
                    distancia = handicap - (hg + ag) if handicap is not None else None
                    if mercado_gols and lado_over and distancia is not None and -0.01 <= distancia <= 0.76:
                        prioridade = 100 - round(abs(distancia - 0.5) * 20)
                        prioridade += 10 if opcao.get("main") is True else 0
                        rotulo = _formatar_linha_asiatica(linhas).replace("+", "")
                        descricao = f"Mais de {rotulo} gols (Asiático FT)"
                else:
                    if mercado_gols and lado_under and handicap is not None and abs(handicap - 2.5) < 0.01:
                        prioridade = 100
                        prioridade += 10 if opcao.get("main") is True else 0
                        rotulo = _formatar_linha_asiatica(linhas).replace("+", "")
                        descricao = f"Menos de {rotulo} gols (Asiático FT)"

            elif categoria == "VITÓRIA":
                mercado_resultado = any(x in nome for x in ("match winner", "1x2", "winner", "resultado"))
                lado = "home" if lado_home else "away"
                nomes_lado = {lado, _texto_normalizado(home if lado_home else away), "1" if lado_home else "2"}
                if mercado_resultado and valor in nomes_lado and handicap is None:
                    prioridade = 100
                    descricao = f"Vitória {home if lado_home else away}"

            elif categoria == "HANDICAP / DUPLA CHANCE":
                lado = "home" if lado_home else "away"
                nome_time = _texto_normalizado(home if lado_home else away)
                dupla_valores = {"home draw", "1x"} if lado_home else {"draw away", "x2", "away draw"}
                dupla_valores |= {"1x" if lado_home else "x2"}
                if "double chance" in nome and valor in dupla_valores:
                    prioridade = 110
                    descricao = f"Dupla Chance {home if lado_home else away} ou empate"
                else:
                    if not linhas:
                        linhas = _linhas_asiaticas(valor_original)
                        handicap = sum(linhas) / len(linhas) if linhas else None
                if not descricao and ("handicap" in nome and linhas and
                      (valor == lado or valor.startswith(lado + " ") or
                       valor == nome_time or valor.startswith(nome_time + " "))):
                    perdendo = (lado_home and hg < ag) or (not lado_home and ag < hg)
                    linha_min, linha_max = min(linhas), max(linhas)
                    linha_valida = ((not perdendo and abs(handicap) < 0.01) or
                                    (perdendo and linha_min >= -0.01 and 0.49 <= linha_max <= 1.01))
                    if linha_valida:
                        prioridade = 100 + (10 if opcao.get("main") is True else 0)
                        prioridade -= round(abs(handicap - (0.5 if perdendo else 0.0)) * 20)
                        descricao = (f"Handicap Asiático {home if lado_home else away} "
                                     f"{_formatar_linha_asiatica(linhas)}")

            if descricao:
                candidatos.append({
                    "odd": odd,
                    "mercado": mercado.get("name") or categoria,
                    "entrada": descricao,
                    "prioridade": prioridade,
                    "bookmaker": bookmaker,
                    "atualizada_em": mercado.get("_updated_at"),
                    "idade_segundos": idade,
                })

    if not candidatos:
        return None
    # Primeiro respeita o mercado principal. Entre fontes equivalentes usamos a
    # mais recente, não a maior odd (que frequentemente é uma ponta atrasada).
    return max(candidatos, key=lambda item: (item["prioridade"], -(item["idade_segundos"] or 0)))


def estimar_probabilidade(categoria, tempo, d, recentes, hg, ag):
    """Estimativa conservadora do modelo de pressão, limitada a 78%."""
    if categoria == "GOLS":
        confirmacoes = sum((
            d["h_shots_on"] + d["a_shots_on"] >= 7,
            d["h_total_shots"] + d["a_total_shots"] >= 13,
            d["h_corners"] + d["a_corners"] >= 9,
            d["h_dangerous"] + d["a_dangerous"] >= 100,
        ))
        prob = 0.54 + 0.025 * confirmacoes
        prob += min(0.05, 0.015 * recentes.get("shots_on", 0))
        if d["tem_xg"] and d["h_xg"] + d["a_xg"] >= hg + ag + 0.6:
            prob += 0.04
        if tempo >= 75:
            prob -= 0.05
    elif categoria == "UNDER GOLS":
        ritmo_alvo = (d["h_shots_on"] + d["a_shots_on"]) / max(tempo, 1)
        ritmo_chutes = (d["h_total_shots"] + d["a_total_shots"]) / max(tempo, 1)
        prob = 0.58
        if ritmo_alvo <= 0.08:
            prob += 0.04
        if ritmo_chutes <= 0.25:
            prob += 0.03
        if recentes.get("shots_on", 0) == 0:
            prob += 0.03
        if d["tem_xg"] and d["h_xg"] + d["a_xg"] <= max(0.8, hg + ag + 0.35):
            prob += 0.03
        prob -= 0.07 * (hg + ag)
        if hg + ag == 2 and tempo >= 70:
            prob += 0.08
    elif categoria == "VITÓRIA":
        # Vitória seca não recebe mais um número fixo. O diferencial de
        # volume aumenta a estimativa, enquanto minuto e empate a reduzem.
        dif_alvo = abs(d["h_shots_on"] - d["a_shots_on"])
        dif_total = abs(d["h_total_shots"] - d["a_total_shots"])
        dif_cantos = abs(d["h_corners"] - d["a_corners"])
        prob = 0.43 + min(0.09, dif_alvo * 0.018 + dif_total * 0.006 + dif_cantos * 0.006)
        prob -= max(0, tempo - 45) * 0.0015
    else:
        dif_alvo = abs(d["h_shots_on"] - d["a_shots_on"])
        dif_total = abs(d["h_total_shots"] - d["a_total_shots"])
        prob = 0.56 + min(0.08, dif_alvo * 0.012 + dif_total * 0.004)
    # Quanto menor a amostra, maior a incerteza. A penalização impede que uma
    # sequência curta no começo produza um EV exagerado.
    if tempo < 10:
        prob -= 0.08
    elif tempo < 20:
        prob -= 0.04
    elif tempo < 30:
        prob -= 0.02
    return max(0.50, min(prob, 0.78))


def calcular_ev(probabilidade, odd):
    return probabilidade * odd - 1


def tem_valor_minimo(categoria, probabilidade, ev):
    """Equilibrio entre frequencia e qualidade para liberar um sinal."""
    piso_probabilidade = PROBABILIDADE_MINIMA.get(categoria, 0.58)
    return probabilidade >= piso_probabilidade and ev >= EV_MINIMO
 
 
def valor_estatistica(stats, *nomes):
    nomes_lower = {n.lower() for n in nomes}
    for item in stats or []:
        tipo = str(item.get("type", "")).lower()
        if tipo not in nomes_lower:
            continue
        valor = item.get("value")
        if valor is None:
            return 0
        if isinstance(valor, str):
            valor = valor.replace("%", "").replace(",", ".").strip()
        try:
            return float(valor)
        except (TypeError, ValueError):
            return 0
    return 0
 
 
def extrair_dados_estatisticos(stats_data):
    """
    Extrai as estatísticas do jogo. Além de chutes e ataques perigosos,
    agora também pega escanteios e posse de bola — servem como reforço
    para não disparar sinal em cima de volume de chute "vazio".
 
    Se seu plano da API-Football tiver 'Expected Goals' liberado para a
    liga (planos Pro/Ultra, ligas top), ele também é capturado aqui e
    passa a pesar na decisão — é uma métrica bem mais confiável que
    contagem de chutes.
    """
    if not stats_data or len(stats_data) < 2:
        return None
 
    h = stats_data[0].get("statistics", [])
    a = stats_data[1].get("statistics", [])
 
    dados = {
        "h_shots_on": valor_estatistica(h, "Shots on Goal"),
        "a_shots_on": valor_estatistica(a, "Shots on Goal"),
        "h_shots_off": valor_estatistica(h, "Shots off Goal"),
        "a_shots_off": valor_estatistica(a, "Shots off Goal"),
        "h_total_shots": valor_estatistica(h, "Total Shots"),
        "a_total_shots": valor_estatistica(a, "Total Shots"),
        "h_blocked": valor_estatistica(h, "Blocked Shots"),
        "a_blocked": valor_estatistica(a, "Blocked Shots"),
        "h_dangerous": valor_estatistica(h, "Dangerous Attacks"),
        "a_dangerous": valor_estatistica(a, "Dangerous Attacks"),
        "h_corners": valor_estatistica(h, "Corner Kicks"),
        "a_corners": valor_estatistica(a, "Corner Kicks"),
        "h_possession": valor_estatistica(h, "Ball Possession"),
        "a_possession": valor_estatistica(a, "Ball Possession"),
        "h_xg": valor_estatistica(h, "expected_goals", "Expected Goals"),
        "a_xg": valor_estatistica(a, "expected_goals", "Expected Goals"),
    }
 
    if dados["h_total_shots"] <= 0:
        dados["h_total_shots"] = dados["h_shots_on"] + dados["h_shots_off"] + dados["h_blocked"]
    if dados["a_total_shots"] <= 0:
        dados["a_total_shots"] = dados["a_shots_on"] + dados["a_shots_off"] + dados["a_blocked"]
    dados["tem_xg"] = (dados["h_xg"] > 0 or dados["a_xg"] > 0)
    return dados
 
 
def analisar_oportunidades(tempo, hg, ag, home, away, d, recentes=None, vermelhos=None):
    """
    Mercado de HT foi REMOVIDO de propósito: 1-2 chutes nos primeiros
    minutos não sustentam estatisticamente um "over 0.5 HT" — é
    praticamente aposta às cegas travestida de sinal.
 
    Agora só dois mercados sobrevivem, e cada um exige MÚLTIPLAS
    confirmações simultâneas (E, não OU) antes de disparar.
    """
    shots_on_home = d["h_shots_on"]
    shots_on_away = d["a_shots_on"]
    total_shots = d["h_total_shots"] + d["a_total_shots"]
    shots_on_total = shots_on_home + shots_on_away
    corners_total = d["h_corners"] + d["a_corners"]
    dangerous_total = d["h_dangerous"] + d["a_dangerous"]
 
    gols_atuais = hg + ag
    tempo_restante = max(90 - tempo, 1)
    recentes = recentes or {}
    vermelhos = vermelhos or {"home": 0, "away": 0}
    oportunidades = []
 
    def texto_motivo_lista(motivos):
        if not motivos:
            return ""
        if len(motivos) == 1:
            return motivos[0]
        return ", ".join(motivos[:-1]) + " e " + motivos[-1]
 
    FRASES_GOLS = [
        "Pressão ofensiva alta: {detalhes}",
        "Jogo aberto e movimentado: {detalhes}",
        "Volume de ataque alto dos dois lados: {detalhes}",
        "Ritmo forte de finalizações: {detalhes}",
    ]
    FRASES_UNDER = [
        "Jogo travado e com baixa criação: {detalhes}",
        "Ritmo ofensivo muito baixo: {detalhes}",
        "Partida amarrada, com poucas chances claras: {detalhes}",
    ]
    FRASES_VITORIA = [
        "{time} está no controle da partida: {detalhes}",
        "{time} domina o jogo com {detalhes}",
        "{time} leva vantagem clara: {detalhes}",
        "{time} sufoca o adversário: {detalhes}",
    ]
    FRASES_HANDICAP = [
        "{time} joga mais que o placar mostra: {detalhes}",
        "{time} domina mesmo não vencendo: {detalhes}",
        "{time} pressiona bastante mas ainda não converteu: {detalhes}",
        "{time} tem volume de jogo superior: {detalhes}",
    ]
 
    # --------------------------------------------------------------------
    # 1. MERCADO DE GOLS — Over FT (só no 2º TEMPO, de 46' a 85', exige
    #    pressão real e ainda tempo hábil pro mercado se confirmar)
    # --------------------------------------------------------------------
    if MINUTO_INICIO_GOLS <= tempo <= 85 and gols_atuais <= 3 and abs(hg - ag) <= 1:
        # Limites acumulados proporcionais ao momento da partida. Assim uma
        # arrancada forte aos 8' pode ser percebida sem comparar 8 minutos de
        # jogo com os mesmos números exigidos aos 70'.
        if tempo <= 15:
            limites = {"alvo": 3, "chutes": 6, "cantos": 3, "perigosos": 25, "confirmacoes": 3}
        elif tempo <= 30:
            limites = {"alvo": 4, "chutes": 8, "cantos": 4, "perigosos": 45, "confirmacoes": 3}
        elif tempo <= 45:
            limites = {"alvo": 5, "chutes": 10, "cantos": 6, "perigosos": 65, "confirmacoes": 3}
        elif tempo <= 65:
            limites = {"alvo": 7, "chutes": 13, "cantos": 8, "perigosos": 90, "confirmacoes": 4}
        else:
            limites = {"alvo": 8, "chutes": 15, "cantos": 9, "perigosos": 105, "confirmacoes": 4}
        motivos_gols = []
        if shots_on_total >= limites["alvo"]:
            motivos_gols.append(f"chutes no alvo somados ({int(shots_on_total)})")
        if total_shots >= limites["chutes"]:
            motivos_gols.append(f"finalizações totais somadas ({int(total_shots)})")
        if corners_total >= limites["cantos"]:
            motivos_gols.append(f"escanteios somados ({int(corners_total)})")
        if dangerous_total >= limites["perigosos"]:
            motivos_gols.append(f"ataques perigosos somados ({int(dangerous_total)})")
 
        confirmacoes = len(motivos_gols)
        xg_soma = d["h_xg"] + d["a_xg"]
        if d["tem_xg"] and xg_soma >= (gols_atuais + 0.6):
            motivos_gols.append(f"xG combinado ({xg_soma:.2f}) acima do placar atual")
            confirmacoes += 2  # xG pesa mais por ser mais preditivo
 
        pressao_recente = recentes.get("shots_on", 0) >= 1 or recentes.get("total_shots", 0) >= 3
        if (confirmacoes >= limites["confirmacoes"] and pressao_recente and
                not (vermelhos["home"] and vermelhos["away"])):
            linha = gols_atuais + 0.5
            motivo = random.choice(FRASES_GOLS).format(detalhes=texto_motivo_lista(motivos_gols))
            oportunidades.append(("GOLS", f"Over {linha} Gols FT", motivo))

    # --------------------------------------------------------------------
    # 2. MERCADO DE VITÓRIA / DUPLA CHANCE — exige domínio em pelo menos
    #    3 dimensões (chutes no alvo, chutes totais e escanteios/posse).
    #    Separado em dois cenários:
    #      - VITÓRIA pura: o time dominante está empatado (inclui 0x0)
    #        -> odd ainda vale a pena.
    #      - HANDICAP / DUPLA CHANCE: o time dominante está perdendo ->
    #        mostramos as duas opções (Handicap 0.0 = reembolso no empate;
    #        Dupla Chance = ganha no empate) pra você escolher pela odd
    #        que a casa estiver dando no momento.
    #      - Se o time dominante já está GANHANDO, não manda nada — odd
    #        baixa demais, não compensa.
    # --------------------------------------------------------------------
    def domina(lado_shots_on, outro_shots_on, lado_total, outro_total,
               lado_corners, outro_corners, lado_posse, outro_posse):
        """Retorna (True/False, lista de strings descrevendo cada critério
        que bateu, com os números reais do jogo)."""
        motivos = []
        fator = 0.65 if tempo <= 20 else 0.8 if tempo <= 35 else 1
        if lado_shots_on >= outro_shots_on + max(2, round(4 * fator)):
            motivos.append(f"chutes no alvo ({int(lado_shots_on)}x{int(outro_shots_on)})")
        if lado_total >= outro_total + max(3, round(5 * fator)):
            motivos.append(f"finalizações totais ({int(lado_total)}x{int(outro_total)})")
        if lado_corners >= outro_corners + max(2, round(3 * fator)):
            motivos.append(f"escanteios ({int(lado_corners)}x{int(outro_corners)})")
        if lado_posse >= outro_posse + 15:
            motivos.append(f"posse de bola ({int(lado_posse)}%x{int(outro_posse)}%)")
        # O acumulado pode mostrar dominio que ja acabou. Exigimos atividade na
        # janela mais recente em qualquer minuto antes de chamar isso de pressao.
        recente_valido = recentes.get("shots_on", 0) >= 1 or recentes.get("total_shots", 0) >= 2
        return len(motivos) >= 3 and recente_valido, motivos
 
    domina_home, motivos_home = domina(
        shots_on_home, shots_on_away, d["h_total_shots"], d["a_total_shots"],
        d["h_corners"], d["a_corners"], d["h_possession"], d["a_possession"]
    )
    domina_away, motivos_away = domina(
        shots_on_away, shots_on_home, d["a_total_shots"], d["h_total_shots"],
        d["a_corners"], d["h_corners"], d["a_possession"], d["h_possession"]
    )
 
    # Time dominante = melhor em campo pelos indicadores, independente de
    # ser mandante/visitante ou "favorito" — quem joga melhor é quem conta.
    # Se o time dominante JÁ está ganhando, não manda sinal — a odd fica
    # baixa demais e não compensa. Só interessa quando:
    #   - está empatado (inclui 0x0) -> VITÓRIA (a odd ainda é boa)
    #   - está perdendo -> DUPLA CHANCE (empate ou vitória), que paga se
    #     ele buscar o empate ou virar o jogo — mais completa que o
    #     handicap 0.0 nesse cenário, porque paga de verdade no empate
    #     em vez de só devolver a aposta.
    if domina_home and vermelhos["home"] <= vermelhos["away"]:
        detalhes = texto_motivo_lista(motivos_home)
        if hg == ag and PERMITIR_VITORIA_SECA and tempo >= 25:
            motivo = random.choice(FRASES_VITORIA).format(time=home, detalhes=detalhes)
            oportunidades.append(("VITÓRIA", f"Vitória {home}", motivo))
        elif hg < ag:
            motivo = random.choice(FRASES_HANDICAP).format(time=home, detalhes=detalhes)
            entrada = f"Handicap Asiático {home} 0.0 ou Dupla Chance {home} (Empate ou Vitória)"
            oportunidades.append(("HANDICAP / DUPLA CHANCE", entrada, motivo))
        # hg > ag -> já ganhando, odd baixa, não manda nada
 
    if domina_away and vermelhos["away"] <= vermelhos["home"]:
        detalhes = texto_motivo_lista(motivos_away)
        if ag == hg and PERMITIR_VITORIA_SECA and tempo >= 25:
            motivo = random.choice(FRASES_VITORIA).format(time=away, detalhes=detalhes)
            oportunidades.append(("VITÓRIA", f"Vitória {away}", motivo))
        elif ag < hg:
            motivo = random.choice(FRASES_HANDICAP).format(time=away, detalhes=detalhes)
            entrada = f"Handicap Asiático {away} 0.0 ou Dupla Chance {away} (Empate ou Vitória)"
            oportunidades.append(("HANDICAP / DUPLA CHANCE", entrada, motivo))
        # ag > hg -> já ganhando, odd baixa, não manda nada
 
    return oportunidades
 
 
def _montar_sinal_sem_valor(categoria, entrada, motivo, home, away, tempo, hg, ag, d):
    icones = {"GOLS": "⚽", "VITÓRIA": "🏆", "HANDICAP / DUPLA CHANCE": "🎯"}
    icone = icones.get(categoria, "🏆")
    linha_xg = ""
    if d["tem_xg"]:
        linha_xg = f"📐 xG: {d['h_xg']:.2f} x {d['a_xg']:.2f}\n"
    return (
        f"{icone} <b>OPORTUNIDADE — {categoria}</b>\n\n"
        f"⚽ <b>{home} x {away}</b> ({tempo}')\n"
        f"📊 Placar: {hg} x {ag}\n"
        f"🎯 Chutes no Alvo: {int(d['h_shots_on'])} x {int(d['a_shots_on'])}\n"
        f"⚡ Chutes Totais: {int(d['h_total_shots'])} x {int(d['a_total_shots'])}\n"
        f"🚩 Escanteios: {int(d['h_corners'])} x {int(d['a_corners'])}\n"
        f"{linha_xg}"
        f"\n🎯 <b>Entrada: {entrada}</b>\n"
        f"📈 <i>Motivo: {motivo}</i>"
    )


def montar_sinal(categoria, entrada, motivo, home, away, tempo, hg, ag, d, valor):
    fonte = valor.get("bookmaker") or "API-Football (agregada)"
    return (
        f"🚨 <b>SINAL — {categoria}</b>\n"
        f"⚽ <b>{home} x {away}</b> | {tempo}' | {hg} x {ag}\n"
        f"🎯 <b>{entrada}</b>\n"
        f"💰 {fonte}: <b>{valor['odd']:.2f}</b>\n"
        f"📊 Chance estimada: <b>{valor['probabilidade']:.0%}</b>"
    )


def calcular_pressao_recente(fixture_id, tempo, d):
    anterior = snapshots_scanner.get(fixture_id)
    snapshots_scanner[fixture_id] = {"tempo": tempo, "dados": d.copy(), "timestamp": time.time()}
    if not anterior or tempo - anterior["tempo"] > 12 or tempo <= anterior["tempo"]:
        return {}
    antes = anterior["dados"]
    return {
        "janela": tempo - anterior["tempo"],
        "shots_on": max(0, d["h_shots_on"] + d["a_shots_on"] - antes["h_shots_on"] - antes["a_shots_on"]),
        "total_shots": max(0, d["h_total_shots"] + d["a_total_shots"] - antes["h_total_shots"] - antes["a_total_shots"]),
        "corners": max(0, d["h_corners"] + d["a_corners"] - antes["h_corners"] - antes["a_corners"]),
    }


def contar_vermelhos(eventos, home_id, away_id):
    result = {"home": 0, "away": 0}
    for evento in eventos:
        if evento.get("type") != "Card" or "Red" not in str(evento.get("detail", "")):
            continue
        team_id = evento.get("team", {}).get("id")
        if team_id == home_id:
            result["home"] += 1
        elif team_id == away_id:
            result["away"] += 1
    return result


def registrar_sinal(fixture_id, categoria, entrada, home, away, tempo, hg, ag, d, valor):
    novo = not ARQUIVO_SINAIS.exists()
    with ARQUIVO_SINAIS.open("a", newline="", encoding="utf-8") as arquivo:
        writer = csv.writer(arquivo)
        if novo:
            writer.writerow(["timestamp", "fixture_id", "categoria", "entrada", "jogo", "minuto", "placar", "odd", "bookmaker", "odd_updated_at", "probabilidade_estimada", "probabilidade_implicita", "ev", "shots_on", "total_shots", "corners", "xg"])
        writer.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), fixture_id, categoria, entrada, f"{home} x {away}", tempo, f"{hg}-{ag}", f"{valor['odd']:.3f}", valor.get("bookmaker"), valor.get("atualizada_em"), f"{valor['probabilidade']:.4f}", f"{valor['probabilidade_implicita']:.4f}", f"{valor['ev']:.4f}", d["h_shots_on"] + d["a_shots_on"], d["h_total_shots"] + d["a_total_shots"], d["h_corners"] + d["a_corners"], d["h_xg"] + d["a_xg"]])
 
 
def limpar_alertas_antigos():
    """Remove fixtures alertados há mais de COOLDOWN_LIMPEZA_SEGUNDOS,
    para o set/dict não crescer pra sempre durante uma execução longa."""
    agora = time.time()
    expirados = [fid for fid, ts in jogos_ja_alertados_scanner.items()
                 if agora - ts > COOLDOWN_LIMPEZA_SEGUNDOS]
    for fid in expirados:
        del jogos_ja_alertados_scanner[fid]
 
 
async def escanear_e_alertar_ao_vivo():
    global pausa_ate
 
    if time.time() < pausa_ate:
        restante = int(pausa_ate - time.time())
        print(f"⏸️ [Scanner] Em pausa por limite de API. Retomando em ~{restante}s.")
        return
 
    print("🔍 [Scanner] Varrendo jogos ao vivo (desde a bola rolar até 85')...")
    limpar_alertas_antigos()
 
    loop = asyncio.get_event_loop()
    jogos = await loop.run_in_executor(None, buscar_jogos_ao_vivo)
 
    if not jogos:
        print("ℹ️ [Scanner] Nenhum jogo ao vivo disponível.")
        return
 
    jogos_analisados = 0
    jogos_pulados_sem_stats = 0
    oportunidades = 0
 
    for item in jogos:
        try:
            fixture = item["fixture"]
            fixture_id = fixture["id"]
            falha_stats = jogos_sem_estatisticas.get(fixture_id)
            if falha_stats and time.time() < falha_stats["proxima_tentativa"]:
                continue
 
            tempo = fixture["status"].get("elapsed") or 0
            if tempo < MINUTO_MINIMO_SCANNER or tempo > MINUTO_MAXIMO_SCANNER:
                continue
 
            teams = item["teams"]
            home = teams["home"]["name"]
            away = teams["away"]["name"]
 
            goals = item["goals"]
            hg = goals["home"] if goals["home"] is not None else 0
            ag = goals["away"] if goals["away"] is not None else 0
 
            stats_data = await loop.run_in_executor(
                None, buscar_estatisticas_jogo, fixture_id
            )
 
            d = extrair_dados_estatisticos(stats_data)
            if not d:
                falha = jogos_sem_estatisticas.get(fixture_id, {"tentativas": 0})
                falha["tentativas"] += 1
                falha["proxima_tentativa"] = time.time() + INTERVALO_RETRY_SEM_STATS
                jogos_sem_estatisticas[fixture_id] = falha
                if falha["tentativas"] >= TENTATIVAS_SEM_STATS:
                    falha["proxima_tentativa"] = time.time() + COOLDOWN_LIMPEZA_SEGUNDOS
                jogos_pulados_sem_stats += 1
                continue
            jogos_sem_estatisticas.pop(fixture_id, None)

            jogos_analisados += 1
            recentes = calcular_pressao_recente(fixture_id, tempo, d)
            if not recentes:
                print(f"📸 [Scanner] Snapshot inicial: {home} x {away} ({tempo}')")
                continue

            eventos = await loop.run_in_executor(None, buscar_eventos_jogo, fixture_id)
            vermelhos = contar_vermelhos(eventos, teams["home"]["id"], teams["away"]["id"])

            leituras = analisar_oportunidades(tempo, hg, ag, home, away, d, recentes, vermelhos)
            if not leituras:
                continue

            odds_ao_vivo = await loop.run_in_executor(None, buscar_odds_ao_vivo, fixture_id)
            candidatas = []
            for categoria_c, entrada_c, motivo_c in leituras:
                if categoria_c not in MERCADOS_ATIVOS:
                    print(f"[Scanner] Mercado em observacao: {categoria_c} ({home} x {away})")
                    continue
                odd_c = selecionar_odd_compativel(
                    odds_ao_vivo, categoria_c, entrada_c, home, away, hg, ag, tempo
                )
                if not odd_c:
                    continue
                prob_c = estimar_probabilidade(categoria_c, tempo, d, recentes, hg, ag)
                ev_c = calcular_ev(prob_c, odd_c["odd"])
                if not tem_valor_minimo(categoria_c, prob_c, ev_c):
                    print(
                        f"[Scanner] Mercado sem valor: {home} x {away} "
                        f"({categoria_c}, prob={prob_c:.0%}, EV={ev_c:+.1%})"
                    )
                    continue
                entrada_real = odd_c["entrada"]
                linha_c = re.sub(r"\s+", "_", entrada_real.lower())
                chave_c = f"{fixture_id}:{categoria_c}:{linha_c}"
                if time.time() - jogos_ja_alertados_scanner.get(chave_c, 0) < COOLDOWN_MERCADO_SEGUNDOS:
                    continue
                candidatas.append({
                    "categoria": categoria_c, "entrada": entrada_real,
                    "motivo": motivo_c, "odd": odd_c,
                    "probabilidade": prob_c, "ev": ev_c, "chave": chave_c,
                })

            if not candidatas:
                print(f"[Scanner] Nenhum mercado com odd compatível: {home} x {away}")
                continue

            # A escolha é pela maior chance estimada. EV e prioridade da linha
            # servem apenas como desempate, nunca como prioridade de mercado.
            melhor = max(candidatas, key=lambda c: (
                c["probabilidade"], c["ev"], c["odd"].get("prioridade", 0)
            ))
            categoria, entrada, motivo = melhor["categoria"], melhor["entrada"], melhor["motivo"]
            odd_escolhida, probabilidade, ev = melhor["odd"], melhor["probabilidade"], melhor["ev"]
            chave_alerta = melhor["chave"]
            valor = {
                **odd_escolhida, "probabilidade": probabilidade,
                "probabilidade_implicita": 1 / odd_escolhida["odd"], "ev": ev,
            }

            msg = montar_sinal(categoria, entrada, motivo, home, away, tempo, hg, ag, d, valor)
            enviar_telegram_scanner(msg)

            jogos_ja_alertados_scanner[chave_alerta] = time.time()
            registrar_sinal(fixture_id, categoria, entrada, home, away, tempo, hg, ag, d, valor)
            oportunidades += 1
 
            print(f"🔥 [Scanner] ALERTA ENVIADO ({tempo}'): {home} x {away} ({categoria})")
 
        except Exception as e:
            print(f"⚠️ Erro ao analisar partida: {e}")
 
    print(f"✔️ [Scanner] Concluído. Analisados: {jogos_analisados} | "
          f"Sem stats (puladas): {jogos_pulados_sem_stats} | Sinais: {oportunidades}")
 
 
async def loop_scanner_ao_vivo(intervalo_segundos=180):
    while True:
        try:
            await escanear_e_alertar_ao_vivo()
        except Exception as e:
            print(f"❌ [Scanner] Erro no loop: {e}")
 
        await asyncio.sleep(intervalo_segundos)
 
 
# ==============================================================================
# INICIALIZAÇÃO PRINCIPAL
# ==============================================================================
async def main():
    print("==================================================")
    print("  🚀 MODO PRODUÇÃO (0' a 85' | Over, Under, Vitória e HA — v4)")
    print("==================================================")
 
    await client.start()
 
    await asyncio.gather(
        client.run_until_disconnected(),
        loop_scanner_ao_vivo(intervalo_segundos=INTERVALO_SCANNER)
    )
 
if __name__ == "__main__":
    asyncio.run(main())
 
