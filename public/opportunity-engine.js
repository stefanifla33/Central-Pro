(function(){
  'use strict';
  const MARKETS={
    over05HT:{label:'+0.5 HT',detail:'Mais de 0.5 gol no 1º tempo',minimum:6},
    over05:{label:'+0.5 gols',detail:'Mais de 0.5 gol na partida',minimum:8},
    over15:{label:'+1.5 gols',detail:'Mais de 1.5 gols na partida',minimum:8},
    over25:{label:'+2.5 gols',detail:'Mais de 2.5 gols na partida',minimum:8},
    btts:{label:'Ambas marcam',detail:'As duas equipes marcam',minimum:8},
    homeScores:{label:'Casa marca',detail:'Mandante marca pelo menos um gol',minimum:4},
    awayScores:{label:'Fora marca',detail:'Visitante marca pelo menos um gol',minimum:4},
    cornersOver65:{label:'+6.5 escanteios',detail:'Mais de 6.5 escanteios na partida',minimum:6,family:'corners',metricKey:'over65'},
    cornersOver75:{label:'+7.5 escanteios',detail:'Mais de 7.5 escanteios na partida',minimum:6,family:'corners',metricKey:'over75'},
    cornersOver85:{label:'+8.5 escanteios',detail:'Mais de 8.5 escanteios na partida',minimum:6,family:'corners',metricKey:'over85'},
    cornersOver95:{label:'+9.5 escanteios',detail:'Mais de 9.5 escanteios na partida',minimum:6,family:'corners',metricKey:'over95'}
  };
  const RANKING_MARKET_KEYS=['over05HT','over05','over15','over25','btts','homeScores','awayScores'];
  const rankingMarkets=()=>RANKING_MARKET_KEYS.map(key=>[key,MARKETS[key]]);
  function confidenceLevel(metric,game){
    const evidence=metric?.evidence||metric,value=Number(evidence?.value||0),total=Number(evidence?.total||0),source=game?.metrics?.sourceSample||{},context=game?.sampleContext||{};
    const homeSample=Number(source.displayHome||0),awaySample=Number(source.displayAway||0),complete=homeSample>=5&&awaySample>=5,balanced=Math.min(homeSample,awaySample)>=4&&Math.abs(homeSample-awaySample)<=1;
    if(!complete||!balanced)return 'cautious';
    if(context.transitionSeason)return value>=75&&total>=8?'moderate':'cautious';
    if(total>=8&&value>=80)return 'strong';
    if(total>=6&&value>=70)return 'moderate';
    return 'cautious';
  }
  function opportunities(snapshot){
    return (snapshot.games||[]).flatMap(game=>rankingMarkets().map(([key,market])=>{const metric=game.metrics?.[key],evidence=metric?.evidence||metric,minimum=market.minimum;if(!metric||evidence.total<minimum)return null;return{game,key,market,metric,family:'goals',level:confidenceLevel(metric,game),sampleQuality:evidence.total,sampleLabel:`últimos ${metric.total} válidos · ${evidence.total} analisados`}}).filter(Boolean));
  }
  function recommendationScore(item){
    const levelScore={strong:30,moderate:18,cautious:8};
    const marketWeight={over25:18,btts:17,cornersOver95:18,cornersOver85:16,homeScores:14,awayScores:14,cornersOver75:12,over15:12,over05HT:10,cornersOver65:3,over05:2};
    const evidence=item.metric?.evidence||item.metric,sample=Math.min(Number(evidence?.total||0),15)*1.2;
    const hitRate=Number(item.metric?.value||0)*0.45;
    return (levelScore[item.level]||0)+(marketWeight[item.key]||0)+sample+hitRate;
  }
  function compareRecommendations(a,b){return recommendationScore(b)-recommendationScore(a)||b.metric.value-a.metric.value||b.metric.total-a.metric.total}
  function entryFields(item){
    const game=item.game,selections={over05HT:['Gols no 1º tempo','+0.5 gol no 1º tempo'],over05:['Total de gols','+0.5 gols'],over15:['Total de gols','+1.5 gols'],over25:['Total de gols','+2.5 gols'],btts:['Ambas marcam','Sim'],homeScores:['Time marca',`${game.teams.home.name} marca`],awayScores:['Time marca',`${game.teams.away.name} marca`],cornersOver65:['Total de escanteios','+6.5 escanteios'],cornersOver75:['Total de escanteios','+7.5 escanteios'],cornersOver85:['Total de escanteios','+8.5 escanteios'],cornersOver95:['Total de escanteios','+9.5 escanteios']},[market,selection]=selections[item.key];
    return{date:new Date(game.fixture.date).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),competition:game.league.name,match:`${game.teams.home.name} x ${game.teams.away.name}`,market,selection};
  }
  window.CPOpportunityEngine={MARKETS,RANKING_MARKET_KEYS,rankingMarkets,confidenceLevel,opportunities,recommendationScore,compareRecommendations,entryFields};
}());
