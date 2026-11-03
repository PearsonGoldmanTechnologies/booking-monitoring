import {writeFile,mkdir} from 'node:fs/promises';import {httpChecks} from './monitor.mjs';
const out=process.env.MONITOR_EVIDENCE_DIR||'evidence';await mkdir(out,{recursive:true});
const checks=await httpChecks();await writeFile(out+'/http.json',JSON.stringify(checks,null,2)+'\n');
console.log(JSON.stringify(checks,null,2));if(checks.some(x=>x.state!=='healthy'))process.exitCode=1;
