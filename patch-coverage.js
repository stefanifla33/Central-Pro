const fs = require('fs');

const path = './public/match-stats-premium.js';
let code = fs.readFileSync(path, 'utf8');

const pattern = /^function row\(label,h,a,percent=false,hn='',an='',track=true,key=''\)\{.*\}$/m;

const replacement = `function row(label,h,a,percent=false,hn='',an='',track=true,key=''){
const protectedMetrics=new Set([
'Finaliza\\u00e7\\u00f5es',
'Chutes no gol',
'Para fora',
'Bloqueados',
'Dentro da \\u00e1rea',
'Fora da \\u00e1rea',
'Precis\\u00e3o',
'Escanteios',
'M\\u00e9dia a favor',
'M\\u00e9dia contra',
'M\\u00e9dia total',
'M\\u00e9dia de escanteios'
]);
const coverage=text=>{const m=String(text||'').match(/^(\\d+)\\/(\\d+)$/);return m?{n:Number(m[1]),total:Number(m[2])}:null};
const hc=coverage(hn),ac=coverage(an),protect=protectedMetrics.has(label);
const state=c=>!protect||!c?null:c.n===0?'Sem dados':c.n<3?'Amostra insuficiente':null;
const hs=state(hc),as=state(ac);
const hv=hs?null:h,av=as?null:a;
const hnote=hs?\`\${hs} · \${hn}\`:hn,anote=as?\`\${as} · \${an}\`:an;
const max=Math.max(...[hv,av].filter(finite),1),bar=v=>finite(v)?Math.min(100,Math.max(0,v/max*100)):0;
if(track)metrics.push({label,home:hv,away:av,percent});
return \`<div class="cp-compare-row"\${key?\` data-general-slot="\${key}"\`:''}><div class="cp-compare-side home"><b>\${hs?'—':percent?pct(hv):dec(hv)}</b><span><i style="width:\${bar(hv)}%"></i></span><small>\${safe(hnote)}</small></div><strong>\${safe(label)}</strong><div class="cp-compare-side away"><span><i style="width:\${bar(av)}%"></i></span><b>\${as?'—':percent?pct(av):dec(av)}</b><small>\${safe(anote)}</small></div></div>\`
}`;

if (!pattern.test(code)) {
  console.error('ERRO: funcao row nao encontrada. Nenhum arquivo foi alterado.');
  process.exit(1);
}

code = code.replace(pattern, replacement);
fs.writeFileSync(path, code, 'utf8');

console.log('OK: cobertura minima aplicada sem alterar a codificacao.');
