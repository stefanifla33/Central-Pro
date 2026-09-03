# Diagnóstico do universo de competições — 2026-08-29

Fonte única: `data/game-snapshots.json` (`generatedAt: 2026-08-29T15:34:16.736Z`). Nenhuma API externa foi consultada.

## Resumo

- Partidas: **1.392**
- Competições: **332**
- Base/sub-18/sub-19/sub-20/sub-21/sub-23: **74 partidas / 19 competições**
- Reservas/desenvolvimento explícito: **2 partidas / 1 competição**
- Amadores explícitos: **21 partidas / 5 competições**
- Amistosos: **8 partidas / 1 competição**
- Sênior organizada, sem marcador explícito dos grupos anteriores: **1.287 partidas / 306 competições**

> O snapshot não possui `league.type`. A coluna “tipo disponível” abaixo usa somente `league.standings`: `liga/tabela` quando verdadeiro em todos os jogos; `copa/sem tabela` quando falso em todos. Isso não prova profissionalismo. A categoria é inferida do nome da competição.

## Proposta conservadora, sem implementação

- **ENTRA NO SCANNER:** 1.287 jogos / 306 competições — universo sênior organizado; é um teto conservador, ainda contém divisões regionais e possivelmente semiprofissionais.
- **SOMENTE DISPONÍVEL NA PÁGINA JOGOS:** 76 jogos / 20 competições — base e desenvolvimento.
- **EXCLUIR DO PROCESSAMENTO:** 29 jogos / 6 competições — amadores explícitos e amistosos.

Essa proposta evita excluir ligas profissionais apenas por não serem grandes. Uma segunda etapa deve validar nível, cobertura histórica e disponibilidade estatística das 306 competições sêniores antes de reduzir o scanner.

## Inventário completo

| Jogos | league.id | Competição | País | Tipo disponível | Categoria inferida | Grupo proposto |
|---:|---:|---|---|---|---|---|
| 72 | 47 | FA Trophy | England | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 15 | 731 | Football League - Lowland League | Scotland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 13 | 253 | Major League Soccer | USA | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 12 | 42 | League Two | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 12 | 51 | National League - South | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 12 | 92 | Derde Divisie | Netherlands | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 12 | 255 | USL Championship | USA | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 11 | 40 | Championship | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 11 | 60 | Non League Premier - Southern South | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 10 | 75 | Serie C | Brazil | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 10 | 58 | Non League Premier - Isthmian | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 10 | 931 | Non League Premier - Southern Central | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 10 | 98 | J1 League | Japan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 10 | 99 | J2 League | Japan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 9 | 178 | Third League - Southwest | Bulgaria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 9 | 41 | League One | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 9 | 50 | National League - North | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 9 | 492 | Tweede Divisie | Netherlands | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 9 | 284 | Liga II | Romania | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 9 | 730 | Football League - Highland League | Scotland | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 8 | 177 | Third League - Southeast | Bulgaria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 8 | 668 | 1. Liga U19 | Czech-Republic | copa/sem tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 8 | 59 | Non League Premier - Northern | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 8 | 696 | U18 Premier League - South | England | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 8 | 63 | Ligue 3 | France | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 8 | 651 | Second League - Group 1 | Russia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 8 | 667 | Friendlies Clubs | World | copa/sem tabela | Amistoso | 3. EXCLUIR DO PROCESSAMENTO |
| 7 | 131 | Primera B Metropolitana | Argentina | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 835 | New South Wales NPL 2 | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 195 | Victoria NPL | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 1226 | Victoria Premier League 2 | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 173 | Second League | Bulgaria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 351 | 4. liga - Divizie B | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 695 | U18 Premier League - North | England | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 7 | 67 | National 2 - Group A | France | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 69 | National 2 - Group C | France | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 715 | DFB Junioren Pokal | Germany | copa/sem tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 7 | 780 | III Liga - Group 1 | Poland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 96 | Taça de Portugal | Portugal | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 7 | 601 | 1. Liga Classic - Group 3 | Switzerland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 316 | 1st League - FBiH | Bosnia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 412 | Premier League | Botswana | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 946 | Second NL | Croatia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 686 | 4. liga - Divizie F | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 245 | Ykkönen | Finland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 80 | 3. Liga | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 78 | Bundesliga | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 752 | Oberliga - Rheinland-Pfalz / Saar | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 744 | Oberliga - Schleswig-Holstein | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 83 | Regionalliga - Bayern | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 87 | Regionalliga - West | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 635 | NB III - Northwest | Hungary | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 634 | NB III - Southwest | Hungary | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 942 | Serie C - Girone B | Italy | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 943 | Serie C - Girone C | Italy | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 722 | Liga Premier Serie A | Mexico | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 676 | Central Youth League | Poland | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 6 | 109 | II Liga - East | Poland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 782 | III Liga - Group 3 | Poland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 645 | 3. liga - East | Slovakia | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 795 | 3. SNL - West | Slovenia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 599 | 1. Liga Classic - Group 1 | Switzerland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 510 | 1. Liga Promotion | Switzerland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 585 | Premier League | Uganda | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 336 | Druha Liga | Ukraine | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 6 | 489 | USL League One | USA | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 128 | Liga Profesional Argentina | Argentina | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 484 | Frauenliga | Austria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 223 | Regionalliga - West | Austria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 117 | 1. Division | Belarus | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 487 | First Amateur Division | Belgium | liga/tabela | Amador | 3. EXCLUIR DO PROCESSAMENTO |
| 5 | 148 | Second Amateur Division - ACFF | Belgium | liga/tabela | Amador | 3. EXCLUIR DO PROCESSAMENTO |
| 5 | 150 | Second Amateur Division - VFV B | Belgium | copa/sem tabela | Amador | 3. EXCLUIR DO PROCESSAMENTO |
| 5 | 317 | 1st League - RS | Bosnia | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 1088 | Pernambucano - U20 | Brazil | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 5 | 175 | Third League - Northeast | Bulgaria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 176 | Third League - Northwest | Bulgaria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 170 | League One | China | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 169 | Super League | China | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 685 | 3. liga - CFL B | Czech-Republic | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 350 | 4. liga - Divizie A | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 346 | FNL | Czech-Republic | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 366 | 1. Deild | Faroe-Islands | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 640 | Kansallinen Liiga | Finland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 61 | Ligue 1 | France | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 68 | National 2 - Group B | France | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 753 | Oberliga - Baden-Württemberg | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 84 | Regionalliga - Nord | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 86 | Regionalliga - SudWest | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 633 | NB III - Northeast | Hungary | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 383 | Ligat Ha'al | Israel | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 136 | Serie B | Italy | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 276 | FKF Premier League | Kenya | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 364 | 1. Liga | Latvia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 361 | 1 Lyga | Lithuania | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 408 | Premiership | Northern-Ireland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 783 | III Liga - Group 4 | Poland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 1041 | Júniores U19 | Portugal | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 5 | 784 | Liga III - Serie 1 | Romania | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 650 | Second League - Group 3 | Russia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 649 | Supreme Division Women | Russia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 183 | League One | Scotland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 644 | 3. liga - West | Slovakia | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 733 | I Liga - Women | Slovakia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 374 | 2. SNL | Slovenia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 289 | 1st Division | South-Africa | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 736 | Elitettan | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 564 | Ettan - Södra | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 5 | 600 | 1. Liga Classic - Group 2 | Switzerland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 129 | Primera Nacional | Argentina | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 221 | Regionalliga - Ost | Austria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 144 | Jupiler Pro League | Belgium | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 1147 | Capixaba B | Brazil | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 1114 | Carioca U20 | Brazil | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 4 | 266 | Primera B | Chile | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 240 | Primera B | Colombia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 349 | 3. liga - MSFL | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 352 | 4. liga - Divizie C | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 354 | 4. liga - Divizie E | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 345 | Czech Liga | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 862 | 3. Division | Denmark | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 638 | Kvindeliga | Denmark | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 39 | Premier League | England | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 328 | Esiliiga A | Estonia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 79 | 2. Bundesliga | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 938 | Oberliga - Bayern Nord | Germany | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 939 | Oberliga - Bayern Süd | Germany | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 750 | Oberliga - Hessen | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 748 | Oberliga - Niedersachsen | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 755 | Oberliga - Nordost-Süd | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 272 | NB II | Hungary | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 165 | 1. Deild | Iceland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 166 | 2. Deild | Iceland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 1020 | Calcutta Premier Division | India | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 542 | Iraqi League | Iraq | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 135 | Serie A | Italy | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 100 | J3 League | Japan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 389 | Premier League | Kazakhstan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 962 | Premier League | Lesotho | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 372 | Second League | Macedonia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 262 | Liga MX | Mexico | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 1200 | Liga MX U21 | Mexico | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 4 | 675 | U21 Divisie 1 | Netherlands | copa/sem tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 4 | 282 | Segunda División | Peru | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 106 | Ekstraklasa | Poland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 781 | III Liga - Group 2 | Poland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 785 | Liga III - Serie 2 | Romania | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 789 | Liga III - Serie 6 | Romania | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 790 | Liga III - Serie 7 | Romania | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 791 | Liga III - Serie 8 | Romania | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 235 | Premier League | Russia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 180 | Championship | Scotland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 184 | League Two | Scotland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 286 | Super Liga | Serbia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 506 | 2. liga | Slovakia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 646 | 3. liga - Center | Slovakia | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 794 | 3. SNL - East | Slovenia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 293 | K League 2 | South-Korea | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 142 | Primera División Femenina | Spain | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 435 | Primera División RFEF - Group 1 | Spain | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 436 | Primera División RFEF - Group 2 | Spain | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 141 | Segunda División | Spain | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 549 | Damallsvenskan | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 595 | Division 2 - Södra Svealand | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 563 | Ettan - Norra | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 114 | Superettan | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 739 | AXA Women’s Super League | Switzerland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 202 | Ligue 1 | Tunisia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 204 | 1. Lig | Turkey | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 268 | Primera División | Uruguay | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 4 | 269 | Segunda División | Uruguay | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 132 | Primera C | Argentina | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 1067 | Torneo Promocional Amateur | Argentina | liga/tabela | Amador | 3. EXCLUIR DO PROCESSAMENTO |
| 3 | 1091 | Tasmania Northern Championship | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 1239 | Regionalliga - North | Austria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 116 | Premier League | Belarus | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 145 | Challenger Pro League | Belgium | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 149 | Second Amateur Division - VFV A | Belgium | copa/sem tabela | Amador | 3. EXCLUIR DO PROCESSAMENTO |
| 3 | 710 | Nacional B | Bolivia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 315 | Premijer Liga | Bosnia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 71 | Serie A | Brazil | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 711 | Segunda División | Chile | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 239 | Primera A | Colombia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 163 | Liga de Ascenso | Costa-Rica | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 211 | First NL | Croatia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 669 | 1. Liga Women | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 348 | 3. liga - CFL A | Czech-Republic | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 122 | 2. Division | Denmark | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 242 | Liga Pro | Ecuador | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 62 | Ligue 2 | France | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 326 | Erovnuli Liga 2 | Georgia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 749 | Oberliga - Bremen | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 85 | Regionalliga - Nordost | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 234 | Liga Nacional | Honduras | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 271 | NB I | Hungary | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 1023 | NB III - Southeast | Hungary | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 290 | Persian Gulf Pro League | Iran | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 705 | Campionato Primavera - 1 | Italy | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 3 | 704 | Coppa Italia Primavera | Italy | copa/sem tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 3 | 365 | Virsliga | Latvia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 278 | Super League | Malaysia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 263 | Liga de Expansión MX | Mexico | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 872 | Liga Premier Serie B | Mexico | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 1242 | Primera Premier | Mexico | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 356 | Second League | Montenegro | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 88 | Eredivisie | Netherlands | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 281 | Primera División | Peru | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 107 | I Liga | Poland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 94 | Primeira Liga | Portugal | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 95 | Segunda Liga | Portugal | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 283 | Liga I | Romania | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 786 | Liga III - Serie 3 | Romania | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 787 | Liga III - Serie 4 | Romania | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 788 | Liga III - Serie 5 | Romania | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 236 | First League | Russia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 307 | Pro League | Saudi-Arabia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 179 | Premiership | Scotland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 332 | Super Liga | Slovakia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 295 | K3 League | South-Korea | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 1234 | K4 League | South-Korea | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 140 | La Liga | Spain | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 113 | Allsvenskan | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 592 | Division 2 - Norra Götaland | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 593 | Division 2 - Norra Svealand | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 594 | Division 2 - Norrland | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 597 | Division 2 - Södra Götaland | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 207 | Super League | Switzerland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 567 | Ligi kuu Bara | Tanzania | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 203 | Süper Lig | Turkey | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 334 | Persha Liga | Ukraine | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 333 | Premier League | Ukraine | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 301 | Pro League | United-Arab-Emirates | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 254 | NWSL Women | USA | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 3 | 1130 | USL Super League | USA | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 310 | Superliga | Albania | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 397 | Girabola | Angola | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 134 | Torneo Federal A | Argentina | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 189 | Capital Territory NPL | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 481 | Northern NSW NPL | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 194 | South Australia NPL | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 219 | 2. Liga | Austria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 218 | Bundesliga | Austria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 419 | Premyer Liqa | Azerbaijan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 417 | Premier League | Bahrain | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 964 | Copa de la División Profesional | Bolivia | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 74 | Brasileiro Women | Brazil | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1141 | Brasiliense B | Brazil | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 742 | Copa Paulista | Brazil | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1030 | Goiano - 2 | Brazil | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1107 | Mineiro U20 | Brazil | copa/sem tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 2 | 1182 | Northern Super League | Canada | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 265 | Primera División | Chile | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 712 | Liga Femenina | Colombia | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 210 | HNL | Croatia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 318 | 1. Division | Cyprus | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 353 | 4. liga - Divizie D | Czech-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 120 | 1. Division | Denmark | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 759 | Liga Mayor | Dominican-Republic | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 370 | Primera Division | El-Salvador | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1126 | Esiliiga B | Estonia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 329 | Meistriliiga | Estonia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1087 | Ykkösliiga | Finland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 82 | Frauen Bundesliga | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 754 | Oberliga - Nordost-Nord | Germany | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 758 | Premier Division | Gibraltar | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 197 | Super League 1 | Greece | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 339 | Liga Nacional | Guatemala | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 380 | Premier League | Hong-Kong | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1198 | Serie A Cup Women | Italy | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 854 | WE League | Japan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1195 | Liga E Pare | Kosovo | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 664 | Superliga | Kosovo | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 393 | Premier League | Malta | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 673 | Liga MX Femenil | Mexico | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 395 | Liga 1 | Moldova | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 394 | Super Liga | Moldova | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 588 | National League | Myanmar | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 396 | Primera Division | Nicaragua | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 407 | Championship | Northern-Ireland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 775 | 3. Division - Girone 2 | Norway | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 304 | Liga Panameña de Fútbol | Panama | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 251 | Division Intermedia | Paraguay | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 252 | Division Profesional - Clausura | Paraguay | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1229 | Liga Women | Peru | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1033 | Ekstraliga Women | Poland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 305 | Stars League | Qatar | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 652 | Second League - Group 2 | Russia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 404 | Campionato | San-Marino | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 287 | Prva Liga | Serbia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1241 | U19 league | Serbia | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 2 | 373 | 1. SNL | Slovenia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 292 | K League 1 | South-Korea | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 660 | WK-League | South-Korea | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 596 | Division 2 - Västra Götaland | Sweden | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 303 | Division 1 | United-Arab-Emirates | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 1218 | Pro League U23 | United-Arab-Emirates | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 2 | 909 | MLS Next Pro | USA | liga/tabela | Reservas/desenvolvimento | 2. SOMENTE PÁGINA JOGOS |
| 2 | 802 | Cup | Uzbekistan | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 2 | 300 | Segunda División | Venezuela | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 342 | Premier League | Armenia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 1230 | Npl Nsw U20 | Australia | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 1 | 482 | Queensland NPL | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 833 | Queensland Premier League | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 834 | South Australia State League 1 | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 648 | Tasmania NPL | Australia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 1238 | Regionalliga - South | Austria | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 1100 | Brasiliense U20 | Brazil | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 1 | 1076 | Catarinense U20 | Brazil | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 1 | 1124 | Cearense - 3 | Brazil | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 1036 | Copa Santa Catarina | Brazil | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 1086 | Paulista - U20 | Brazil | liga/tabela | Base | 2. SOMENTE PÁGINA JOGOS |
| 1 | 1204 | Rondoniense - 2 | Brazil | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 72 | Serie B | Brazil | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 566 | Ligue A | Burundi | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 479 | Canadian Premier League | Canada | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 162 | Primera División | Costa-Rica | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 243 | Liga Pro Serie B | Ecuador | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 247 | Kakkonen - Lohko A | Finland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 249 | Kakkonen - Lohko C | Finland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 745 | Oberliga - Hamburg | Germany | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 164 | Úrvalsdeild | Iceland | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 569 | Premier League | Kyrgyzstan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 371 | First League | Macedonia | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 355 | First League | Montenegro | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 89 | Eerste Divisie | Netherlands | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 915 | 1. Division Women | Norway | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 774 | 3. Division - Girone 1 | Norway | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 778 | 3. Division - Girone 5 | Norway | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 509 | 8 Cup | South-Africa | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 571 | Vysshaya Liga | Tajikistan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 1075 | Pro League A | Uzbekistan | liga/tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |
| 1 | 1191 | UEFA Europa Cup - Women | World | copa/sem tabela | Sênior organizada (profissionalidade não comprovada) | 1. ENTRA NO SCANNER (proposta conservadora) |

