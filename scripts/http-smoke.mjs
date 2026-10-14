import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),base='http://127.0.0.1:14000/api';
const child=spawn(process.execPath,['apps/api/dist/apps/api/src/main.js'],{cwd:root,env:{...process.env,PORT:'14000',NODE_ENV:'development',AI_MODE:'demo',PAYMENT_MODE:'demo',EMAIL_MODE:'demo',MONGODB_URI:'',MCP_ENABLED:'0',APP_LIVE_TEST:'0',APP_URL:'http://localhost:3000',ADMIN_APP_URL:'http://localhost:3001'},stdio:['ignore','pipe','pipe']});
const checks=[];let error='';child.stderr.on('data',d=>{error+=d.toString();});
async function req(path,body,headers={}){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost:3000',...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return{response,data:await response.json()};}
try{
 for(let i=0;i<100;i++){try{if((await req('/health')).response.ok)break;}catch{}if(i===99)throw Error('API did not start: '+error);await new Promise(r=>setTimeout(r,100));}
 for(const interest of ['creator','developer','student','business']){const r=await req('/boxes/free',{interest},{'Idempotency-Key':randomUUID()});assert.equal(r.response.status,200);assert.equal(r.data.box.tools.length,1);checks.push(`free:${interest}`);}
 const key=randomUUID(),[a,b]=await Promise.all([req('/boxes/free',{interest:'developer'},{'Idempotency-Key':key}),req('/boxes/free',{interest:'developer'},{'Idempotency-Key':key})]);assert.equal(a.data.box.id,b.data.box.id);checks.push('free-idempotency');
 const order=await req('/checkout/orders',{interest:'business'},{'Idempotency-Key':randomUUID()});assert.equal(order.data.amountCents,299);const paid=await req(`/checkout/orders/${order.data.orderId}/demo-complete`,{},{'X-Order-Token':order.data.accessToken});assert.equal(paid.data.box.tools.length,3);checks.push('premium-demo');
 assert.equal((await req('/boxes/free',{interest:'business'},{Origin:'https://bad.example'})).response.status,403);checks.push('origin-protection');
 assert.equal((await req('/admin/summary')).response.status,401);checks.push('guest-admin-denied');
 const code=await req('/auth/request-code',{email:'http-fixture@example.test'},{Origin:'http://localhost:3001'});assert.equal(code.response.status,200);const login=await req('/auth/verify-code',{challengeId:code.data.challengeId,code:code.data.developmentCode},{Origin:'http://localhost:3001'});const cookie=login.response.headers.get('set-cookie').split(';')[0];assert.equal((await req('/me',undefined,{cookie})).data.user.email,'http-fixture@example.test');checks.push('admin-origin-otp-and-me-alias');
 assert.equal((await req('/admin/summary',undefined,{cookie})).response.status,403);checks.push('member-admin-denied');
 assert.equal((await req('/me/claim-box',{boxId:a.data.box.id,accessToken:a.data.accessToken},{cookie})).response.status,200);assert.equal((await req('/me/boxes',undefined,{cookie})).data.boxes.length,1);checks.push('claim-history');
 const event={eventId:randomUUID(),visitorId:randomUUID(),path:'/'};assert.equal((await req('/activity',event)).response.status,202);assert.equal((await req('/activity',{...event,secret:'forbidden'})).response.status,400);checks.push('activity-strict-contract');
 await req('/auth/logout',{}, {cookie});assert.equal((await req('/me/boxes',undefined,{cookie})).response.status,401);checks.push('logout');
 await mkdir(new URL('docs/qa/',root),{recursive:true});await writeFile(new URL('docs/qa/http-smoke-restored.json',root),JSON.stringify({at:new Date().toISOString(),modes:'all-demo',passed:checks.length,checks},null,2)+'\n');console.log(`HTTP smoke ${checks.length}/${checks.length} passed`);
}finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},5000).unref();});}
