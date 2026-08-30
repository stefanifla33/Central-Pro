(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CPPlayerSnapshot=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  const KEY='centralPro.players.snapshot.v1',VERSION=1;
  const MIN_GAMES=5,MIN_MINUTES=270,MIN_AVERAGE=.2,MAX_PER_TEAM=4,MAX_PER_FIXTURE=8;
  const confirmedStatus=status=>status==='OFICIAL'||status==='PROVÁVEL';
  const confirmationMap=result=>{
    const statuses=new Map;
    if(result?.status==='available')for(const lineup of result.lineups||[]){
      const starters=new Set((lineup.startXI||[]).map(item=>Number(item.player?.id)));
      for(const item of [...(lineup.startXI||[]),...(lineup.substitutes||[])])statuses.set(`${lineup.team.id}:${item.player.id}`,starters.has(Number(item.player.id))?'OFICIAL':'SEM CONFIRMAÇÃO');
    }
    if(result?.status==='probable')for(const team of result.probableTeams||[]){
      const ranked=[...(team.players||[])].sort((a,b)=>(b.recentScore||0)-(a.recentScore||0));
      const likely=new Set(ranked.slice(0,11).map(item=>Number(item.player?.id)));
      for(const item of team.players||[])statuses.set(`${team.team.id}:${item.player.id}`,likely.has(Number(item.player.id))?'PROVÁVEL':'SEM CONFIRMAÇÃO');
    }
    return statuses;
  };
  function rowsFromResponses(game,confirmation,recent){
    const statuses=confirmationMap(confirmation),rows=[];
    for(const teamData of recent?.teams||[]){
      const team=teamData.team;
      const opponent=Number(team?.id)===Number(game.teams.home.id)?game.teams.away:game.teams.home;
      for(const item of teamData.players||[]){
        const status=statuses.get(`${team.id}:${item.player?.id}`)||'SEM CONFIRMAÇÃO';
        const metric=item.summaries?.['shots.on']||item.markets?.shotsOnGoal;
        const games=Number(metric?.coverage)||0;
        const sampleGames=Array.isArray(item.games)?item.games.slice(0,MIN_GAMES):[];
        const minutes=sampleGames.reduce((sum,row)=>sum+(Number(row.minutes)||0),0);
        const shotsOn=Array.isArray(metric?.games)?metric.games.reduce((sum,row)=>sum+(Number(row.value)||0),0):null;
        const average=Number.isFinite(Number(metric?.average))?Number(metric.average):null;
        rows.push({fixtureId:game.fixture.id,date:game.fixture.date,leagueId:game.league.id,leagueName:game.league.name,teamId:team.id,teamName:team.name,opponentId:opponent?.id||null,opponentName:opponent?.name||null,playerId:item.player?.id,playerName:item.player?.name,status,games,minutes,shotsOn,average,playerPhoto:item.player?.photo||null,playerPosition:item.player?.position||null});
      }
    }
    return rows;
  }
  const qualifies=row=>confirmedStatus(row?.status)&&Number(row?.games)>=MIN_GAMES&&Number(row?.minutes)>=MIN_MINUTES&&Number.isFinite(Number(row?.average))&&Number(row.average)>=MIN_AVERAGE;
  function selectQualified(rows){
    const unique=new Map;
    for(const row of rows||[]){if(!qualifies(row))continue;const key=String(row.playerId),old=unique.get(key);if(!old||row.average>old.average)unique.set(key,row)}
    const byFixture=new Map;
    for(const row of unique.values()){if(!byFixture.has(row.fixtureId))byFixture.set(row.fixtureId,[]);byFixture.get(row.fixtureId).push(row)}
    const selected=[];
    for(const fixtureRows of byFixture.values()){
      fixtureRows.sort((a,b)=>b.average-a.average||b.shotsOn-a.shotsOn||b.minutes-a.minutes);
      const teamCounts=new Map;
      for(const row of fixtureRows){if(selected.filter(item=>item.fixtureId===row.fixtureId).length>=MAX_PER_FIXTURE)break;const count=teamCounts.get(row.teamId)||0;if(count>=MAX_PER_TEAM)continue;teamCounts.set(row.teamId,count+1);selected.push(row)}
    }
    return selected.sort((a,b)=>b.average-a.average||b.shotsOn-a.shotsOn||b.minutes-a.minutes);
  }
  const validSnapshot=value=>value?.version===VERSION&&value?.completed===true&&/^\d{4}-\d{2}-\d{2}$/.test(value?.date||'')&&Number.isFinite(Date.parse(value?.generatedAt))&&Array.isArray(value?.players)&&value.players.every(row=>Number.isSafeInteger(Number(row.fixtureId))&&Number.isSafeInteger(Number(row.playerId))&&qualifies(row));
  function persist(storage,snapshot,currentDate){
    if(!validSnapshot(snapshot)||snapshot.date!==currentDate)return false;
    let existing=null;try{existing=JSON.parse(storage.getItem(KEY))}catch{}
    if(validSnapshot(existing)&&existing.date===snapshot.date&&Date.parse(existing.generatedAt)>Date.parse(snapshot.generatedAt))return false;
    storage.setItem(KEY,JSON.stringify(snapshot));return true;
  }
  const createSnapshot=(date,players,generatedAt=new Date().toISOString())=>({version:VERSION,completed:true,date,generatedAt,players:selectQualified(players)});
  return{KEY,VERSION,MIN_GAMES,MIN_MINUTES,MIN_AVERAGE,MAX_PER_TEAM,MAX_PER_FIXTURE,confirmedStatus,confirmationMap,rowsFromResponses,qualifies,selectQualified,validSnapshot,persist,createSnapshot};
}));
