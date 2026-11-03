import {mkdir,writeFile} from 'node:fs/promises';
import {urls,ukTime} from './monitor.mjs';
const {chromium,firefox}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const out=process.env.MONITOR_EVIDENCE_DIR||'evidence';await mkdir(out,{recursive:true});
const results=[];
for(const [engine,browserType] of Object.entries(process.env.MONITOR_ALL_BROWSERS?{chromium,firefox}:{chromium})){
 const browser=await browserType.launch({headless:true});
 for(const surface of ['custom','native']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Europe/London',serviceWorkers:'block'});
  const blocked=[];await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   // Only browser reads. Any previously unknown POST is evidence for review,
   // not permission to submit a booking or send personal information.
   const serviceRead=request.method()==='POST'&&url.hostname==='bookings.cloud.microsoft'&&(
    ['/BookingsService/api/V1/bookingBusinessesc2/PearsonGoldman@pearsongoldman.com/services','/BookingsService/api/V1/bookingBusinessesc2/PearsonGoldman@pearsongoldman.com/GetStaffAvailability'].includes(url.pathname)||
    (url.pathname==='/owa/published/service.svc'&&url.searchParams.get('action')==='GetTimeZoneOffsets'&&request.headers().action==='GetTimeZoneOffsets'));
   if(!['GET','HEAD','OPTIONS'].includes(request.method())&&!serviceRead){
    const headers=request.headers();
    blocked.push({method:request.method(),host:url.hostname,path:url.pathname,action:url.searchParams.get('action'),actionHeaders:Object.fromEntries(Object.entries(headers).filter(([k])=>/action/i.test(k)))});return route.abort();
   }
   return route.continue();
  });
  const page=await context.newPage(),at=new Date();let result={surface,engine,url:urls[surface],at:at.toISOString(),uk:ukTime(at)};
  try{
   const availability=surface==='custom'?page.waitForResponse(r=>r.url().includes('/api/bookings/availability?'),{timeout:30000}):null;
   // Attach a rejection handler before navigation to avoid orphan rejections.
   availability?.catch(()=>{});
   const response=await page.goto(urls[surface],{waitUntil:'domcontentloaded',timeout:30000});
   result.status=response.status();result.finalUrl=page.url();
   if([401,403,429].includes(response.status()))throw new Error('MONITOR_ACCESS');
   const final=new URL(page.url()),expected=new URL(urls[surface]);
   const canonical=final.origin===expected.origin&&final.pathname===expected.pathname&&(!final.search||(surface==='native'&&[...final.searchParams].every(([k,v])=>k==='ismsaljsauthenabled'&&['','true'].includes(v))));
   if(response.status()!==200||!canonical)throw new Error('HTTP_OR_REDIRECT');
   if(surface==='custom'){
    await page.getByRole('heading',{name:'Book time with Harpreet',exact:true}).waitFor();
    const api=await availability;result.availabilityStatus=api.status();
    if(api.status()!==200)throw new Error('AVAILABILITY_HTTP_'+api.status());
    const json=await api.json();if(!Array.isArray(json.days))throw new Error('AVAILABILITY_SCHEMA');
    await page.locator('#booking-calendar').waitFor();result.availableDays=json.days.length;
    if(await page.getByText('Scheduling is temporarily unavailable.',{exact:false}).isVisible())throw new Error('VISIBLE_SCHEDULING_ERROR');
   }else{
    await page.getByRole('radio',{name:'30-minute meeting',exact:true}).waitFor({timeout:30000});
    await page.getByRole('heading',{name:/add your details/i}).waitFor({timeout:30000});
    const body=await page.locator('body').innerText();
    if(/something went wrong|booking page is not available|service unavailable/i.test(body))throw new Error('VISIBLE_MICROSOFT_ERROR');
    result.interface='30-minute service and customer-details section rendered; no booking submitted';
   }
   result.state='healthy';
  }catch(e){result.state=e.message==='MONITOR_ACCESS'?'monitor-access':surface==='native'&&blocked.some(x=>x.host==='bookings.cloud.microsoft')?'monitor-policy-block':'failure';result.reason=e.message.slice(0,220);}
  result.blockedWrites=blocked;await page.screenshot({path:out+'/'+surface+'-'+engine+'.png',fullPage:true});
  results.push(result);await context.close();
 }
 await browser.close();
}
await writeFile(out+'/browser.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
if(results.some(x=>x.state!=='healthy'))process.exitCode=1;
