import {readFile,appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {httpChecks,transition,ukTime} from './monitor.mjs';
const repo=process.env.GITHUB_REPOSITORY;
if(repo!=='PearsonGoldmanTechnologies/booking-monitoring')throw new Error('Wrong monitoring repository');
if(!process.env.GITHUB_TOKEN)throw new Error('Repository-scoped GitHub token required');
const at=new Date(),runUrl=`https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
async function api(path,method='GET',body){
 const r=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(r.status===404&&method==='GET')return null;
 if(!r.ok)throw new Error('GitHub monitoring API '+r.status+' '+path.split('?')[0]);
 return r.status===204?null:r.json();
}
const priorFile=await api('/contents/status.json');
const prior=priorFile?JSON.parse(Buffer.from(priorFile.content,'base64').toString()):{checks:{},history:[]};
const state={...prior,at:at.toISOString(),uk:ukTime(at),runUrl,workerHealthy:true,checks:{...prior.checks}};
const observed=await httpChecks();
// One browser run per approximately 30 minutes, not one per API poll.
if(!prior.browserAt||Date.now()-Date.parse(prior.browserAt)>=25*60000){
 let failure=false;
 for(const [cmd,args] of [['npm',['ci','--ignore-scripts','--no-audit','--no-fund']],['npx',['playwright','install','--with-deps','chromium']]]){
  if(spawnSync(cmd,args,{stdio:'inherit',timeout:240000}).status!==0){failure=true;break;}
 }
 if(!failure){
  const run=spawnSync(process.execPath,['browser.mjs'],{stdio:'inherit',timeout:120000});
  try{const browser=JSON.parse(await readFile('evidence/browser.json','utf8'));for(const b of browser)observed.push({...b,id:'browser-'+b.surface});state.browserAt=at.toISOString();}
  catch{failure=true;}
  if(run.error)failure=true;
 }
 if(failure){state.workerHealthy=false;observed.push({id:'browser-worker',state:'monitor-access',reason:'Browser runner failed; customer state not established',url:runUrl});}
 else observed.push({id:'browser-worker',state:'healthy',reason:'Browser runner completed',url:runUrl});
}
async function notify(id,observation){
 const old=state.checks[id];const next=transition(old,observation);
 const row={...next,url:observation.url,reason:observation.reason||observation.interface||'Healthy',at:at.toISOString(),issue:old?.issue||null};
 if(['outage','monitor-incident'].includes(next.event)&&!row.issue){
  const issue=await api('/issues','POST',{title:`[Monitor] ${id}: ${next.event==='monitor-incident'?'monitor access restriction':'confirmed failure'}`,body:`@PearsonGoldmanTechnologies\n\nTwo consecutive failed observations. Classification: ${next.event}.\n\nURL: ${observation.url}\nUK time: ${ukTime(at)}\nUTC: ${at.toISOString()}\nReason: ${row.reason}\nEvidence: ${runUrl}\n\nRead-only monitoring. No appointment submitted.`});row.issue=issue.number;
  state.history.push({event:'outage',id,at:at.toISOString(),issue:issue.number});
 }
 if(observation.state==='healthy'&&row.issue){
  await api(`/issues/${row.issue}/comments`,'POST',{body:`@PearsonGoldmanTechnologies Recovery observed at ${ukTime(at)}. ${observation.url}\nEvidence: ${runUrl}`});
  await api(`/issues/${row.issue}`,'PATCH',{state:'closed'});state.history.push({event:'recovery',id,at:at.toISOString(),issue:row.issue});row.issue=null;
 }
 state.checks[id]=row;
}
for(const observation of observed)await notify(observation.id,observation);
if(process.env.TEST_NOTIFICATIONS==='true'){
 for(const value of ['failure','failure','healthy'])await notify('notification-test',{state:value,reason:'CONTROLLED TEST ONLY; no production failure induced',url:runUrl});
}
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(at));
const summary=Object.entries(state.checks).map(([id,c])=>`- ${id}: ${c.state} (${c.at})`).join('\n');
if(hour>=9&&state.summaryDate!==date){
 const issue=await api('/issues','POST',{title:`Daily booking monitoring summary: ${date}`,body:`@PearsonGoldmanTechnologies\n\n${ukTime(at)}\n\n${summary}\n\nEvidence: ${runUrl}\nSchedules are best effort. Missing reports or stale timestamps require investigation.`});
 state.summaryDate=date;state.summaryIssue=issue.number;
}
state.history=state.history.slice(-200);
const activeIds=new Set([...observed.map(x=>x.id),'browser-custom','browser-native']);
state.customerHealthy=Object.entries(state.checks).filter(([id])=>activeIds.has(id)&&!['notification-test','browser-worker'].includes(id)).every(([,x])=>x.state==='healthy');
state.confirmedOutage=Object.entries(state.checks).some(([id,x])=>activeIds.has(id)&&id!=='browser-worker'&&x.state==='down');
state.workerHealthy=state.workerHealthy&&Boolean(state.browserAt)&&Date.now()-Date.parse(state.browserAt)<45*60000;
await api('/contents/status.json','PUT',{message:'chore: record monitoring observation [skip ci]',content:Buffer.from(JSON.stringify(state)).toString('base64'),...(priorFile?{sha:priorFile.sha}:{})});
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`${ukTime(at)}\n\n${summary}\n`);
console.log('Monitoring observations persisted; workerHealthy='+state.workerHealthy+'; customerHealthy='+state.customerHealthy);
if(!state.workerHealthy)process.exitCode=1;
