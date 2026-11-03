// Encrypted repository secret; never log the ping URL or response body.
const url=(process.env.HEALTHCHECKS_PING_URL||'').trim();
if(!/^https:\/\/hc-ping\.com\/[0-9a-f-]{36}$/.test(url))throw new Error('Missing or invalid private heartbeat configuration');
async function ping(suffix=''){
 try{const r=await fetch(url+suffix,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error();}
 catch{throw new Error('Heartbeat delivery failed; inspect the monitoring provider');}
}
if(process.env.TEST_NOTIFICATIONS==='true'){
 await ping('/fail');
 console.log('Controlled worker failure signal delivered.');
}
await ping(process.env.WORKER_RESULT==='success'?'':'/fail');
console.log('Worker heartbeat delivered: '+process.env.WORKER_RESULT);
