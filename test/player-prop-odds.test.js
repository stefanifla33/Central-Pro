"use strict";
const assert = require("assert");
const { mapPlayerPropQuotes, marketKey, parseSelection } = require("../lib/player-prop-odds");
const now = Date.parse("2026-09-05T21:00:00Z");
const records=[{fixture:{id:100},update:"2026-09-05T20:59:00Z",bookmakers:[
 {id:8,name:"Bet365",bets:[
   {id:240,name:"Home Player Shots",values:[
     {value:"Luciano Acosta - 1",odd:"1.08"},{value:"Luciano Acosta - 2",odd:"1.40"},
     {value:"Yeferson Soteldo - 1",odd:"1.11"},{value:"Yeferson Soteldo - 2",odd:"1.53"},{value:"Yeferson Soteldo - 3",odd:"2.50"}
   ]},
   {id:269,name:"Home Player Shots On Target Total",values:[{value:"Yeferson Soteldo - 1",odd:"1.83"}]},
   {id:276,name:"Away Player Shots Total",values:[{value:"Over 13.5",odd:"2.00"}]}
 ]},
 {id:32,name:"Betano",bets:[{id:240,name:"Home Player Shots",values:[{value:"Yeferson Soteldo - 1",odd:"1.15"}]}]}
]}];
assert.equal(marketKey("Home Player Shots"),"shotsTotal");
assert.equal(marketKey("Home Player Shots On Target Total"),"shotsOnGoal");
assert.equal(marketKey("Away Player Shots Total"),null);
assert.deepEqual(parseSelection("Yeferson Soteldo - 2","Yeferson Soteldo","shotsTotal"),{threshold:1.5,selection:"Yeferson Soteldo - 2"});
assert.equal(parseSelection("Yeferson Soteldo Junior - 2","Yeferson Soteldo","shotsTotal"),null);
const q=mapPlayerPropQuotes(records,100,"Yeferson Soteldo",now);
assert.deepEqual(q.filter(x=>x.metric==="shotsTotal"&&x.bookmakerId===8).map(x=>[x.threshold,x.odd]),[[0.5,"1.11"],[1.5,"1.53"],[2.5,"2.50"]]);
assert.equal(q.some(x=>x.odd==="1.08"),false,"must never leak Luciano Acosta quote into Soteldo");
assert.equal(q.find(x=>x.metric==="shotsOnGoal").odd,"1.83");
console.log("player-prop-odds.test.js OK");
