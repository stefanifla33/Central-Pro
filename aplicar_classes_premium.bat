@echo off
setlocal
cd /d "%~dp0"

REM Execute este arquivo a partir da pasta raiz do Central Pro.
if not exist "public\match.html" (
  echo ERRO: public\match.html nao encontrado.
  echo Coloque este .bat na pasta raiz do Central Pro e execute novamente.
  pause
  exit /b 1
)

for %%F in (match.html bankroll.html opportunities.html) do (
  if exist "public\%%F" copy /y "public\%%F" "public\%%F.pre-scope-backup" >nul
)

powershell -NoProfile -Command "$p='public/match.html'; $c=[IO.File]::ReadAllText($p); if($c -notmatch '<body[^>]*class=[\"''][^\"'']*match-shell-page'){ $c=[regex]::Replace($c,'<body(?![^>]*class=)[^>]*>','<body class=\"match-shell-page\">',1); [IO.File]::WriteAllText($p,$c,[Text.UTF8Encoding]::new($false)) }"
powershell -NoProfile -Command "$p='public/bankroll.html'; $c=[IO.File]::ReadAllText($p); if($c -notmatch '<body[^>]*class=[\"''][^\"'']*bankroll-page'){ $c=[regex]::Replace($c,'<body(?![^>]*class=)[^>]*>','<body class=\"bankroll-page\">',1); [IO.File]::WriteAllText($p,$c,[Text.UTF8Encoding]::new($false)) }"
powershell -NoProfile -Command "$p='public/opportunities.html'; $c=[IO.File]::ReadAllText($p); if($c -notmatch '<body[^>]*class=[\"''][^\"'']*opportunities-page'){ $c=[regex]::Replace($c,'<body(?![^>]*class=)[^>]*>','<body class=\"opportunities-page\">',1); [IO.File]::WriteAllText($p,$c,[Text.UTF8Encoding]::new($false)) }"

echo.
echo Classes premium aplicadas somente nestes arquivos:
echo   public\match.html          - match-shell-page
echo   public\bankroll.html       - bankroll-page
echo   public\opportunities.html  - opportunities-page
echo.
echo Backups criados com sufixo .pre-scope-backup
pause
