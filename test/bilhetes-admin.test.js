const assert=require('assert');
const {buildManualTicket,editablePatch,authenticateAdmin}=require('../lib/bilhetes-admin');
(async()=>{
 const t=buildManualTicket({title:'Meu bilhete',totalOdd:4.72,selections:[{displayMatch:'A x B',market:'Gols',displaySelection:'Mais de 1.5',odd:1.5},{displayMatch:'C x D',market:'Escanteios',displaySelection:'Mais de 8.5',odd:2}]},new Date('2026-09-09T15:00:00Z'));
 assert.equal(t.source,'manual');assert.equal(t.total_odd,4.72);assert.equal(t.status,'OPEN');assert.equal(t.selections.length,2);
 const same=buildManualTicket({totalOdd:2.35,selections:[{displayMatch:'A x B',market:'Gols',displaySelection:'+1.5'},{displayMatch:'A x B',market:'Escanteios',displaySelection:'+7.5'}]});assert.equal(same.total_odd,2.35);assert.equal(same.selections[0].odd,null);
 assert.throws(()=>buildManualTicket({selections:[{displayMatch:'A x B',market:'Gols',displaySelection:'+1.5'}]}),/odd final real/);
 assert.equal(editablePatch({status:'GREEN'},t).status,'GREEN');
 assert.throws(()=>editablePatch({status:'GREEN'},{source:'real'}),/Somente bilhetes manuais/);
 const fetchImpl=async()=>({ok:true,json:async()=>({id:'u1',email:'admin@test.com'})});
 const user=await authenticateAdmin('Bearer abc',{env:{SUPABASE_URL:'https://x.test',SUPABASE_PUBLISHABLE_KEY:'k',CENTRAL_PRO_ADMIN_EMAIL:'admin@test.com'},fetchImpl});assert.equal(user.id,'u1');
 const no=await authenticateAdmin('Bearer abc',{env:{SUPABASE_URL:'https://x.test',SUPABASE_PUBLISHABLE_KEY:'k',CENTRAL_PRO_ADMIN_EMAIL:'other@test.com'},fetchImpl});assert.equal(no,null);
 console.log('bilhetes-admin: ok');
})().catch(e=>{console.error(e);process.exit(1)});
