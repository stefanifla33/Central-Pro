require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');
const date = process.argv.find(x => x.startsWith('--date='))?.slice(7) || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function run(file, args=[]) { const r=spawnSync(process.execPath,[path.join(__dirname,file),...args],{stdio:'inherit',env:process.env}); if(r.status!==0) process.exit(r.status||1); }
run('settle-bilhetes.js');
run('generate-bilhetes-preview.js',[`--date=${date}`]);
run('publish-bilhetes.js',[`--date=${date}`,'--publish']);
