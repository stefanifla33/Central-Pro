function goalResult(game,teamId){const home=game.teams.home.id===teamId,homeGoals=game.score?.fulltime?.home??game.goals.home,awayGoals=game.score?.fulltime?.away??game.goals.away,halfHome=game.score?.halftime?.home,halfAway=game.score?.halftime?.away;if(homeGoals==null||awayGoals==null)return null;return{scored:home?homeGoals:awayGoals,conceded:home?awayGoals:homeGoals,total:homeGoals+awayGoals,halfTotal:halfHome==null||halfAway==null?null:halfHome+halfAway}}
function goalRows(games,teamId){return(games||[]).map(game=>goalResult(game,teamId)).filter(Boolean)}
function frequency(rows,test){const hits=rows.filter(test).length;return rows.length?{value:hits*100/rows.length,hits,total:rows.length}:null}
function goalSampleQuality(total){const size=Number(total)||0;if(size>=10)return{key:'strong',label:'Amostra forte'};if(size>=8)return{key:'good',label:'Amostra boa'};if(size>=5)return{key:'short',label:'Amostra curta'};return{key:'insufficient',label:'Amostra insuficiente'}}
function metricWithEvidence(displayRows,evidenceRows,test){
  const display=frequency(displayRows,test),evidence=frequency(evidenceRows,test);
  if(!display)return null;
  return{...display,evidence:evidence||display};
}
function uniqueRows(items){const map=new Map;items.forEach(item=>{if(item.id&&!map.has(item.id))map.set(item.id,item.row)});return[...map.values()]}
function fixtureGoalMetrics(data){
  const fixture=data.fixture;
  const homeGames=data.homeRecent||[],awayGames=data.awayRecent||[];
  const homeAll=homeGames.map(game=>({id:game.fixture?.id,row:goalResult(game,fixture.teams.home.id)})).filter(item=>item.id&&item.row);
  const awayAll=awayGames.map(game=>({id:game.fixture?.id,row:goalResult(game,fixture.teams.away.id)})).filter(item=>item.id&&item.row);
  const homeRecent=homeAll.slice(0,5),awayRecent=awayAll.slice(0,5);
  const displayAll=uniqueRows([...homeRecent,...awayRecent]),evidenceAll=uniqueRows([...homeAll,...awayAll]);
  const displayHalves=displayAll.filter(row=>row.halfTotal!=null),evidenceHalves=evidenceAll.filter(row=>row.halfTotal!=null);
  const homeDisplay=homeRecent.map(item=>item.row),awayDisplay=awayRecent.map(item=>item.row);
  const homeEvidence=homeAll.map(item=>item.row),awayEvidence=awayAll.map(item=>item.row);
  return{
    coverage:evidenceAll.length,
    displayCoverage:displayAll.length,
    sourceSample:{home:homeAll.length,away:awayAll.length,displayHome:homeDisplay.length,displayAway:awayDisplay.length},
    over05HT:metricWithEvidence(displayHalves,evidenceHalves,row=>row.halfTotal>.5),
    over05:metricWithEvidence(displayAll,evidenceAll,row=>row.total>.5),
    over15:metricWithEvidence(displayAll,evidenceAll,row=>row.total>1.5),
    over25:metricWithEvidence(displayAll,evidenceAll,row=>row.total>2.5),
    btts:metricWithEvidence(displayAll,evidenceAll,row=>row.scored>0&&row.conceded>0),
    homeScores:metricWithEvidence(homeDisplay,homeEvidence,row=>row.scored>0),
    awayScores:metricWithEvidence(awayDisplay,awayEvidence,row=>row.scored>0)
  };
}
