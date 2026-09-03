# Segunda etapa — diagnóstico das 306 competições sêniores

Data da agenda: **2026-08-29**  
Fonte da agenda: `data/game-snapshots.json`  
Configuração local consultada: `public/competition-config.js`  
Chamadas externas: **zero**

## Critério

- **A — Scanner principal:** IDs já classificados pelo Central Pro como `main`/`relevant`, mais primeiras/segundas divisões profissionais e níveis profissionais consolidados identificáveis com segurança pelos dados locais.
- **B — Scanner secundário / avaliar:** competição sênior plausível, mas sem confirmação local suficiente para promovê-la ou descartá-la.
- **C — Somente página Jogos:** divisões muito baixas, regionais ou semiprofissionais claramente indicadas pelo nome/estrutura.
- Uma liga menor não foi rebaixada apenas pelo país. Na dúvida, foi para **B**, não para **C**.
- Esta é uma proposta diagnóstica; não foi implementada.

## Resumo

| Grupo | Jogos | Competições |
|---|---:|---:|
| A) SCANNER PRINCIPAL | 401 | 95 |
| B) SCANNER SECUNDÁRIO / AVALIAR | 299 | 94 |
| C) SOMENTE PÁGINA JOGOS | 587 | 117 |
| **Total sênior** | **1287** | **306** |

## Tabela completa das 306 competições

| league.id | País | Competição | Jogos | Grupo sugerido | Motivo curto |
|---:|---|---|---:|---|---|
| 47 | England | FA Trophy | 72 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 731 | Scotland | Football League - Lowland League | 15 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 253 | USA | Major League Soccer | 13 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 42 | England | League Two | 12 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 51 | England | National League - South | 12 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 92 | Netherlands | Derde Divisie | 12 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 255 | USA | USL Championship | 12 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 40 | England | Championship | 11 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 60 | England | Non League Premier - Southern South | 11 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 75 | Brazil | Serie C | 10 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 58 | England | Non League Premier - Isthmian | 10 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 931 | England | Non League Premier - Southern Central | 10 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 98 | Japan | J1 League | 10 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 99 | Japan | J2 League | 10 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 178 | Bulgaria | Third League - Southwest | 9 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 41 | England | League One | 9 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 50 | England | National League - North | 9 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 492 | Netherlands | Tweede Divisie | 9 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 284 | Romania | Liga II | 9 | A) SCANNER PRINCIPAL | Segunda divisão nacional profissional identificável com segurança pelos dados locais. |
| 730 | Scotland | Football League - Highland League | 9 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 177 | Bulgaria | Third League - Southeast | 8 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 59 | England | Non League Premier - Northern | 8 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 63 | France | Ligue 3 | 8 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 651 | Russia | Second League - Group 1 | 8 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 131 | Argentina | Primera B Metropolitana | 7 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 835 | Australia | New South Wales NPL 2 | 7 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 195 | Australia | Victoria NPL | 7 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1226 | Australia | Victoria Premier League 2 | 7 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 173 | Bulgaria | Second League | 7 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 351 | Czech-Republic | 4. liga - Divizie B | 7 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 67 | France | National 2 - Group A | 7 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 69 | France | National 2 - Group C | 7 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 780 | Poland | III Liga - Group 1 | 7 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 96 | Portugal | Taça de Portugal | 7 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 601 | Switzerland | 1. Liga Classic - Group 3 | 7 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 316 | Bosnia | 1st League - FBiH | 6 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 412 | Botswana | Premier League | 6 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 946 | Croatia | Second NL | 6 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 686 | Czech-Republic | 4. liga - Divizie F | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 245 | Finland | Ykkönen | 6 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 80 | Germany | 3. Liga | 6 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 78 | Germany | Bundesliga | 6 | A) SCANNER PRINCIPAL | Já consta na configuração atual como principal. |
| 752 | Germany | Oberliga - Rheinland-Pfalz / Saar | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 744 | Germany | Oberliga - Schleswig-Holstein | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 83 | Germany | Regionalliga - Bayern | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 87 | Germany | Regionalliga - West | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 635 | Hungary | NB III - Northwest | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 634 | Hungary | NB III - Southwest | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 942 | Italy | Serie C - Girone B | 6 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 943 | Italy | Serie C - Girone C | 6 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 722 | Mexico | Liga Premier Serie A | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 109 | Poland | II Liga - East | 6 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 782 | Poland | III Liga - Group 3 | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 645 | Slovakia | 3. liga - East | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 795 | Slovenia | 3. SNL - West | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 599 | Switzerland | 1. Liga Classic - Group 1 | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 510 | Switzerland | 1. Liga Promotion | 6 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 585 | Uganda | Premier League | 6 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 336 | Ukraine | Druha Liga | 6 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 489 | USA | USL League One | 6 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 128 | Argentina | Liga Profesional Argentina | 5 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 484 | Austria | Frauenliga | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 223 | Austria | Regionalliga - West | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 117 | Belarus | 1. Division | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 317 | Bosnia | 1st League - RS | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 175 | Bulgaria | Third League - Northeast | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 176 | Bulgaria | Third League - Northwest | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 170 | China | League One | 5 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 169 | China | Super League | 5 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 685 | Czech-Republic | 3. liga - CFL B | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 350 | Czech-Republic | 4. liga - Divizie A | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 346 | Czech-Republic | FNL | 5 | A) SCANNER PRINCIPAL | Segunda divisão nacional profissional identificável com segurança pelos dados locais. |
| 366 | Faroe-Islands | 1. Deild | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 640 | Finland | Kansallinen Liiga | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 61 | France | Ligue 1 | 5 | A) SCANNER PRINCIPAL | Já consta na configuração atual como principal. |
| 68 | France | National 2 - Group B | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 753 | Germany | Oberliga - Baden-Württemberg | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 84 | Germany | Regionalliga - Nord | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 86 | Germany | Regionalliga - SudWest | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 633 | Hungary | NB III - Northeast | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 383 | Israel | Ligat Ha'al | 5 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 136 | Italy | Serie B | 5 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 276 | Kenya | FKF Premier League | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 364 | Latvia | 1. Liga | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 361 | Lithuania | 1 Lyga | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 408 | Northern-Ireland | Premiership | 5 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 783 | Poland | III Liga - Group 4 | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 784 | Romania | Liga III - Serie 1 | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 650 | Russia | Second League - Group 3 | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 649 | Russia | Supreme Division Women | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 183 | Scotland | League One | 5 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 644 | Slovakia | 3. liga - West | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 733 | Slovakia | I Liga - Women | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 374 | Slovenia | 2. SNL | 5 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 289 | South-Africa | 1st Division | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 736 | Sweden | Elitettan | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 564 | Sweden | Ettan - Södra | 5 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 600 | Switzerland | 1. Liga Classic - Group 2 | 5 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 129 | Argentina | Primera Nacional | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 221 | Austria | Regionalliga - Ost | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 144 | Belgium | Jupiler Pro League | 4 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 1147 | Brazil | Capixaba B | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 266 | Chile | Primera B | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 240 | Colombia | Primera B | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 349 | Czech-Republic | 3. liga - MSFL | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 352 | Czech-Republic | 4. liga - Divizie C | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 354 | Czech-Republic | 4. liga - Divizie E | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 345 | Czech-Republic | Czech Liga | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 862 | Denmark | 3. Division | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 638 | Denmark | Kvindeliga | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 39 | England | Premier League | 4 | A) SCANNER PRINCIPAL | Já consta na configuração atual como principal. |
| 328 | Estonia | Esiliiga A | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 79 | Germany | 2. Bundesliga | 4 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 938 | Germany | Oberliga - Bayern Nord | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 939 | Germany | Oberliga - Bayern Süd | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 750 | Germany | Oberliga - Hessen | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 748 | Germany | Oberliga - Niedersachsen | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 755 | Germany | Oberliga - Nordost-Süd | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 272 | Hungary | NB II | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 165 | Iceland | 1. Deild | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 166 | Iceland | 2. Deild | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1020 | India | Calcutta Premier Division | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 542 | Iraq | Iraqi League | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 135 | Italy | Serie A | 4 | A) SCANNER PRINCIPAL | Já consta na configuração atual como principal. |
| 100 | Japan | J3 League | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 389 | Kazakhstan | Premier League | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 962 | Lesotho | Premier League | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 372 | Macedonia | Second League | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 262 | Mexico | Liga MX | 4 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 282 | Peru | Segunda División | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 106 | Poland | Ekstraklasa | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 781 | Poland | III Liga - Group 2 | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 785 | Romania | Liga III - Serie 2 | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 789 | Romania | Liga III - Serie 6 | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 790 | Romania | Liga III - Serie 7 | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 791 | Romania | Liga III - Serie 8 | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 235 | Russia | Premier League | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 180 | Scotland | Championship | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 184 | Scotland | League Two | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 286 | Serbia | Super Liga | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 506 | Slovakia | 2. liga | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 646 | Slovakia | 3. liga - Center | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 794 | Slovenia | 3. SNL - East | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 293 | South-Korea | K League 2 | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 142 | Spain | Primera División Femenina | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 435 | Spain | Primera División RFEF - Group 1 | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 436 | Spain | Primera División RFEF - Group 2 | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 141 | Spain | Segunda División | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 549 | Sweden | Damallsvenskan | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 595 | Sweden | Division 2 - Södra Svealand | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 563 | Sweden | Ettan - Norra | 4 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 114 | Sweden | Superettan | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 739 | Switzerland | AXA Women’s Super League | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 202 | Tunisia | Ligue 1 | 4 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 204 | Turkey | 1. Lig | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 268 | Uruguay | Primera División | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 269 | Uruguay | Segunda División | 4 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 132 | Argentina | Primera C | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1091 | Australia | Tasmania Northern Championship | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1239 | Austria | Regionalliga - North | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 116 | Belarus | Premier League | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 145 | Belgium | Challenger Pro League | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 710 | Bolivia | Nacional B | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 315 | Bosnia | Premijer Liga | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 71 | Brazil | Serie A | 3 | A) SCANNER PRINCIPAL | Já consta na configuração atual como principal. |
| 711 | Chile | Segunda División | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 239 | Colombia | Primera A | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 163 | Costa-Rica | Liga de Ascenso | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 211 | Croatia | First NL | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 669 | Czech-Republic | 1. Liga Women | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 348 | Czech-Republic | 3. liga - CFL A | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 122 | Denmark | 2. Division | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 242 | Ecuador | Liga Pro | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 62 | France | Ligue 2 | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 326 | Georgia | Erovnuli Liga 2 | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 749 | Germany | Oberliga - Bremen | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 85 | Germany | Regionalliga - Nordost | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 234 | Honduras | Liga Nacional | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 271 | Hungary | NB I | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 1023 | Hungary | NB III - Southeast | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 290 | Iran | Persian Gulf Pro League | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 365 | Latvia | Virsliga | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 278 | Malaysia | Super League | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 263 | Mexico | Liga de Expansión MX | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 872 | Mexico | Liga Premier Serie B | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1242 | Mexico | Primera Premier | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 356 | Montenegro | Second League | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 88 | Netherlands | Eredivisie | 3 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 281 | Peru | Primera División | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 107 | Poland | I Liga | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 94 | Portugal | Primeira Liga | 3 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 95 | Portugal | Segunda Liga | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 283 | Romania | Liga I | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 786 | Romania | Liga III - Serie 3 | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 787 | Romania | Liga III - Serie 4 | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 788 | Romania | Liga III - Serie 5 | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 236 | Russia | First League | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 307 | Saudi-Arabia | Pro League | 3 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 179 | Scotland | Premiership | 3 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 332 | Slovakia | Super Liga | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 295 | South-Korea | K3 League | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1234 | South-Korea | K4 League | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 140 | Spain | La Liga | 3 | A) SCANNER PRINCIPAL | Já consta na configuração atual como principal. |
| 113 | Sweden | Allsvenskan | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 592 | Sweden | Division 2 - Norra Götaland | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 593 | Sweden | Division 2 - Norra Svealand | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 594 | Sweden | Division 2 - Norrland | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 597 | Sweden | Division 2 - Södra Götaland | 3 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 207 | Switzerland | Super League | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 567 | Tanzania | Ligi kuu Bara | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 203 | Turkey | Süper Lig | 3 | A) SCANNER PRINCIPAL | Já consta na configuração atual como relevante. |
| 334 | Ukraine | Persha Liga | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 333 | Ukraine | Premier League | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 301 | United-Arab-Emirates | Pro League | 3 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 254 | USA | NWSL Women | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1130 | USA | USL Super League | 3 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 310 | Albania | Superliga | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 397 | Angola | Girabola | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 134 | Argentina | Torneo Federal A | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 189 | Australia | Capital Territory NPL | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 481 | Australia | Northern NSW NPL | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 194 | Australia | South Australia NPL | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 219 | Austria | 2. Liga | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 218 | Austria | Bundesliga | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 419 | Azerbaijan | Premyer Liqa | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 417 | Bahrain | Premier League | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 964 | Bolivia | Copa de la División Profesional | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 74 | Brazil | Brasileiro Women | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1141 | Brazil | Brasiliense B | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 742 | Brazil | Copa Paulista | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1030 | Brazil | Goiano - 2 | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1182 | Canada | Northern Super League | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 265 | Chile | Primera División | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 712 | Colombia | Liga Femenina | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 210 | Croatia | HNL | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 318 | Cyprus | 1. Division | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 353 | Czech-Republic | 4. liga - Divizie D | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 120 | Denmark | 1. Division | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 759 | Dominican-Republic | Liga Mayor | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 370 | El-Salvador | Primera Division | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1126 | Estonia | Esiliiga B | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 329 | Estonia | Meistriliiga | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1087 | Finland | Ykkösliiga | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 82 | Germany | Frauen Bundesliga | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 754 | Germany | Oberliga - Nordost-Nord | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 758 | Gibraltar | Premier Division | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 197 | Greece | Super League 1 | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 339 | Guatemala | Liga Nacional | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 380 | Hong-Kong | Premier League | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1198 | Italy | Serie A Cup Women | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 854 | Japan | WE League | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1195 | Kosovo | Liga E Pare | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 664 | Kosovo | Superliga | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 393 | Malta | Premier League | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 673 | Mexico | Liga MX Femenil | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 395 | Moldova | Liga 1 | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 394 | Moldova | Super Liga | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 588 | Myanmar | National League | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 396 | Nicaragua | Primera Division | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 407 | Northern-Ireland | Championship | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 775 | Norway | 3. Division - Girone 2 | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 304 | Panama | Liga Panameña de Fútbol | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 251 | Paraguay | Division Intermedia | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 252 | Paraguay | Division Profesional - Clausura | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 1229 | Peru | Liga Women | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1033 | Poland | Ekstraliga Women | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 305 | Qatar | Stars League | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 652 | Russia | Second League - Group 2 | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 404 | San-Marino | Campionato | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 287 | Serbia | Prva Liga | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 373 | Slovenia | 1. SNL | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 292 | South-Korea | K League 1 | 2 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 660 | South-Korea | WK-League | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 596 | Sweden | Division 2 - Västra Götaland | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 303 | United-Arab-Emirates | Division 1 | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 802 | Uzbekistan | Cup | 2 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 300 | Venezuela | Segunda División | 2 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 342 | Armenia | Premier League | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 482 | Australia | Queensland NPL | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 833 | Australia | Queensland Premier League | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 834 | Australia | South Australia State League 1 | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 648 | Australia | Tasmania NPL | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1238 | Austria | Regionalliga - South | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1124 | Brazil | Cearense - 3 | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1036 | Brazil | Copa Santa Catarina | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 1204 | Brazil | Rondoniense - 2 | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 72 | Brazil | Serie B | 1 | A) SCANNER PRINCIPAL | Já consta na configuração atual como principal. |
| 566 | Burundi | Ligue A | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 479 | Canada | Canadian Premier League | 1 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 162 | Costa-Rica | Primera División | 1 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 243 | Ecuador | Liga Pro Serie B | 1 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 247 | Finland | Kakkonen - Lohko A | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 249 | Finland | Kakkonen - Lohko C | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 745 | Germany | Oberliga - Hamburg | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 164 | Iceland | Úrvalsdeild | 1 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 569 | Kyrgyzstan | Premier League | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 371 | Macedonia | First League | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 355 | Montenegro | First League | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 89 | Netherlands | Eerste Divisie | 1 | A) SCANNER PRINCIPAL | Primeira/segunda divisão profissional ou nível profissional consolidado identificado localmente. |
| 915 | Norway | 1. Division Women | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 774 | Norway | 3. Division - Girone 1 | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 778 | Norway | 3. Division - Girone 5 | 1 | C) SOMENTE PÁGINA JOGOS | Divisão baixa, regional ou semiprofissional indicada pelo nome/estrutura local. |
| 509 | South-Africa | 8 Cup | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 571 | Tajikistan | Vysshaya Liga | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1075 | Uzbekistan | Pro League A | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1191 | World | UEFA Europa Cup - Women | 1 | B) SCANNER SECUNDÁRIO / AVALIAR | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |

## COMPETIÇÕES PARA DECISÃO DA STEFANI

Somente as competições do grupo B, mantidas em avaliação por falta de confirmação suficiente nos arquivos locais.

| league.id | País | Competição | Jogos | Motivo |
|---:|---|---|---:|---|
| 651 | Russia | Second League - Group 1 | 8 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 131 | Argentina | Primera B Metropolitana | 7 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 173 | Bulgaria | Second League | 7 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 316 | Bosnia | 1st League - FBiH | 6 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 412 | Botswana | Premier League | 6 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 946 | Croatia | Second NL | 6 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 245 | Finland | Ykkönen | 6 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 109 | Poland | II Liga - East | 6 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 585 | Uganda | Premier League | 6 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 336 | Ukraine | Druha Liga | 6 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 484 | Austria | Frauenliga | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 117 | Belarus | 1. Division | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 317 | Bosnia | 1st League - RS | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 366 | Faroe-Islands | 1. Deild | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 640 | Finland | Kansallinen Liiga | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 276 | Kenya | FKF Premier League | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 364 | Latvia | 1. Liga | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 361 | Lithuania | 1 Lyga | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 650 | Russia | Second League - Group 3 | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 649 | Russia | Supreme Division Women | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 733 | Slovakia | I Liga - Women | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 289 | South-Africa | 1st Division | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 736 | Sweden | Elitettan | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 564 | Sweden | Ettan - Södra | 5 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 638 | Denmark | Kvindeliga | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 328 | Estonia | Esiliiga A | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 166 | Iceland | 2. Deild | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1020 | India | Calcutta Premier Division | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 542 | Iraq | Iraqi League | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 389 | Kazakhstan | Premier League | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 962 | Lesotho | Premier League | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 372 | Macedonia | Second League | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 506 | Slovakia | 2. liga | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 142 | Spain | Primera División Femenina | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 549 | Sweden | Damallsvenskan | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 739 | Switzerland | AXA Women’s Super League | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 202 | Tunisia | Ligue 1 | 4 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 163 | Costa-Rica | Liga de Ascenso | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 669 | Czech-Republic | 1. Liga Women | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 326 | Georgia | Erovnuli Liga 2 | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 234 | Honduras | Liga Nacional | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 356 | Montenegro | Second League | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 567 | Tanzania | Ligi kuu Bara | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 334 | Ukraine | Persha Liga | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 254 | USA | NWSL Women | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1130 | USA | USL Super League | 3 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 310 | Albania | Superliga | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 397 | Angola | Girabola | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 419 | Azerbaijan | Premyer Liqa | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 417 | Bahrain | Premier League | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 964 | Bolivia | Copa de la División Profesional | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 74 | Brazil | Brasileiro Women | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1182 | Canada | Northern Super League | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 712 | Colombia | Liga Femenina | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 318 | Cyprus | 1. Division | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 759 | Dominican-Republic | Liga Mayor | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 370 | El-Salvador | Primera Division | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 329 | Estonia | Meistriliiga | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1087 | Finland | Ykkösliiga | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 82 | Germany | Frauen Bundesliga | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 758 | Gibraltar | Premier Division | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 339 | Guatemala | Liga Nacional | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 380 | Hong-Kong | Premier League | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1198 | Italy | Serie A Cup Women | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 854 | Japan | WE League | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1195 | Kosovo | Liga E Pare | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 664 | Kosovo | Superliga | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 393 | Malta | Premier League | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 673 | Mexico | Liga MX Femenil | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 395 | Moldova | Liga 1 | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 394 | Moldova | Super Liga | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 588 | Myanmar | National League | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 396 | Nicaragua | Primera Division | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 407 | Northern-Ireland | Championship | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 304 | Panama | Liga Panameña de Fútbol | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 251 | Paraguay | Division Intermedia | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1229 | Peru | Liga Women | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1033 | Poland | Ekstraliga Women | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 404 | San-Marino | Campionato | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 287 | Serbia | Prva Liga | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 373 | Slovenia | 1. SNL | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 660 | South-Korea | WK-League | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 303 | United-Arab-Emirates | Division 1 | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 802 | Uzbekistan | Cup | 2 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 342 | Armenia | Premier League | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 566 | Burundi | Ligue A | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 569 | Kyrgyzstan | Premier League | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 371 | Macedonia | First League | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 355 | Montenegro | First League | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 915 | Norway | 1. Division Women | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 509 | South-Africa | 8 Cup | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 571 | Tajikistan | Vysshaya Liga | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1075 | Uzbekistan | Pro League A | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |
| 1191 | World | UEFA Europa Cup - Women | 1 | Competição sênior plausível, mas sem confirmação suficiente na configuração local. |

## Competições explicitamente presentes na configuração atual

A configuração contém **33 IDs**; **20** aparecem nesta agenda e **13** não tiveram jogos no snapshot do dia.

| league.id | Nome configurado | Categoria atual | Jogos em 29/08 | Presente no dia |
|---:|---|---|---:|---|
| 2 | UEFA Champions League | main | 0 | não |
| 3 | UEFA Europa League | main | 0 | não |
| 11 | CONMEBOL Sudamericana | main | 0 | não |
| 13 | CONMEBOL Libertadores | main | 0 | não |
| 39 | Premier League | main | 4 | sim |
| 45 | FA Cup | main | 0 | não |
| 48 | EFL Cup | main | 0 | não |
| 61 | Ligue 1 | main | 5 | sim |
| 66 | Coupe de France | main | 0 | não |
| 71 | Brasileirão Série A | main | 3 | sim |
| 72 | Brasileirão Série B | main | 1 | sim |
| 73 | Copa do Brasil | main | 0 | não |
| 78 | Bundesliga | main | 6 | sim |
| 81 | DFB-Pokal | main | 0 | não |
| 135 | Serie A | main | 4 | sim |
| 137 | Coppa Italia | main | 0 | não |
| 140 | La Liga | main | 3 | sim |
| 143 | Copa del Rey | main | 0 | não |
| 848 | UEFA Conference League | main | 0 | não |
| 40 | Championship | relevant | 11 | sim |
| 79 | 2. Bundesliga | relevant | 4 | sim |
| 88 | Eredivisie | relevant | 3 | sim |
| 90 | KNVB Beker | relevant | 0 | não |
| 94 | Primeira Liga | relevant | 3 | sim |
| 96 | Taça de Portugal | relevant | 7 | sim |
| 98 | J1 League | relevant | 10 | sim |
| 128 | Liga Profesional Argentina | relevant | 5 | sim |
| 144 | Jupiler Pro League | relevant | 4 | sim |
| 179 | Scottish Premiership | relevant | 3 | sim |
| 203 | Süper Lig | relevant | 3 | sim |
| 253 | Major League Soccer | relevant | 13 | sim |
| 262 | Liga MX | relevant | 4 | sim |
| 307 | Saudi Pro League | relevant | 3 | sim |
