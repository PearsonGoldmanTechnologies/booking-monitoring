export const urls={site:'https://pearsongoldman.com/',custom:'https://pearsongoldman.com/book',native:'https://bookings.cloud.microsoft/book/PearsonGoldman@pearsongoldman.com/',contact:'https://pearsongoldman.com/contact.html'};
export const ukTime=date=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'full',timeStyle:'long'}).format(date);
export function months(now=new Date()){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit'}).formatToParts(now);
 const y=Number(p.find(x=>x.type==='year').value),m=Number(p.find(x=>x.type==='month').value);
 return [y+'-'+String(m).padStart(2,'0'),(m===12?y+1:y)+'-'+String(m===12?1:m+1).padStart(2,'0')];
}
export function verdict(status,body,kind){
 if([401,403,429].includes(status))return {state:'monitor-access',reason:'Access restriction or throttling; corroborate customer impact'};
 if(status!==200)return {state:'failure',reason:'HTTP '+status};
 if(kind==='availability')return body&&Array.isArray(body.days)&&typeof body.month==='string'?{state:'healthy',reason:body.days.length?'Availability valid':'Valid empty availability; not an outage'}:{state:'failure',reason:'Invalid availability response'};
 const marker=kind==='custom'?'Book time with Harpreet':kind==='site'?'PearsonGoldman':'owa.bookings';
 return typeof body==='string'&&body.includes(marker)?{state:'healthy',reason:'Document marker present; browser check required'}:{state:'failure',reason:'Expected document marker missing'};
}
export function transition(previous={state:'unknown',failures:0},observation){
 if(['monitor-access','monitor-policy-block'].includes(observation.state)){const failures=previous.state==='monitor-access'?(previous.failures||0)+1:1;return {state:'monitor-access',failures,event:failures===2?'monitor-incident':null};}
 if(observation.state==='healthy')return {state:'healthy',failures:0,event:previous.state==='down'||(previous.state==='monitor-access'&&previous.failures>=2)?'recovery':null};
 const failures=(previous.failures||0)+1;
 return {state:failures>=2?'down':'suspect',failures,event:failures===2?'outage':null};
}
export async function httpChecks(fetcher=fetch,now=new Date()){
 const checks=[];
 const targets=[['site',urls.site,'site'],['custom',urls.custom,'custom'],['native',urls.native,'native'],...months(now).map(m=>['availability-'+m,'https://pearsongoldman.com/api/bookings/availability?month='+m+'&timezone=Europe%2FLondon','availability'])];
 for(const [id,url,kind] of targets){
  const started=Date.now();let result;
  try{
   const r=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'PearsonGoldman-ReadOnly-Monitor/1.0'}});
   if(r.status>=300&&r.status<400)result={state:'failure',reason:'Unexpected redirect',status:r.status};
   else{const body=kind==='availability'?await r.json():await r.text();result={...verdict(r.status,body,kind),status:r.status};
    if(kind==='availability'&&result.state==='healthy'&&(body.month!==new URL(url).searchParams.get('month')||body.timezone!=='Europe/London'))result={state:'failure',reason:'Wrong availability month or timezone',status:r.status};
    if(kind==='custom'&&typeof body==='string'&&/<iframe\b/i.test(body))result={state:'failure',reason:'Unexpected iframe; integration changed',status:r.status};
    if(kind==='site'&&typeof body==='string'){
     const links=[...body.matchAll(/href=["']([^"']+)["']/g)].map(x=>new URL(x[1],url)).filter(x=>/\/book(?:\/|\.html|$)|bookings\./i.test(x.href));
     if(links.some(x=>![urls.custom,urls.native].includes(x.href)))result={state:'failure',reason:'Unexpected published booking destination',status:r.status};
     result.bookingLinks=links.map(x=>x.href);result.note=links.length?'Existing booking links verified':'No homepage booking link; approved unlisted /book baseline';
    }
   }
  }catch(e){result={state:'failure',reason:e.name==='TimeoutError'?'Timeout':'Request or response parsing failure'};}
  checks.push({id,url,...result,durationMs:Date.now()-started,at:now.toISOString(),uk:ukTime(now)});
 }
 return checks;
}
