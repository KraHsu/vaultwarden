// Run only against an isolated disposable Vaultwarden with signups enabled.
// Example: VAULT_TEST_ORIGIN=http://127.0.0.1:18223 node tests/integration.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {registrationPayload,authenticationHash,defaultKdf,encryptItem,decryptItem} from '../src/crypto.js';
const origin=process.env.VAULT_TEST_ORIGIN;
if(!origin || !/^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Use an explicit loopback TEST origin only');
const {PureCrypto:sdk,init_sdk}=createRequire(import.meta.url)('@bitwarden/sdk-internal');init_sdk('off','off',0);
const email=`integration-${randomUUID()}@example.invalid`,password=`Test only ${randomUUID()}!`;
let token;
async function req(path,options={}){
  const response=await fetch(origin+path,{...options,headers:{'Content-Type':'application/json','Bitwarden-Client-Version':'2026.8.0',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}});
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{throw new Error(`Non-JSON HTTP ${response.status} at ${path}`);}
  if(!response.ok)throw new Error(`HTTP ${response.status} ${path}: ${data?.errorModel?.message || data?.message || data?.error_description || 'failed'}`);
  return data;
}
await req('/identity/accounts/register',{method:'POST',body:JSON.stringify(await registrationPayload(sdk,email,password))});
const auth=await req('/identity/connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',username:email,password:await authenticationHash(sdk,password,email,defaultKdf),scope:'api offline_access',client_id:'web',deviceType:'10',deviceIdentifier:randomUUID(),deviceName:'isolated-integration'})});
token=auth.access_token;
const key=sdk.decrypt_user_key_with_master_password(auth.Key,password,email,defaultKdf);
const state=await req('/api/sync?excludeDomains=true');
const draft={type:1,name:'Integration cipher',username:'alice',password:'test-only private password',uris:'https://example.invalid',notes:'机密测试笔记',favorite:false};
let item=await req('/api/ciphers',{method:'POST',body:JSON.stringify(encryptItem(sdk,draft,null,key,state.profile.id))});
assert.equal(decryptItem(sdk,item,key).password,draft.password);
assert(!JSON.stringify(item).includes(draft.password));
item=await req(`/api/ciphers/${item.id}`,{method:'PUT',body:JSON.stringify(encryptItem(sdk,{...draft,name:'Updated integration cipher'},item,key,state.profile.id))});
assert.equal(decryptItem(sdk,item,key).name,'Updated integration cipher');
await req(`/api/ciphers/${item.id}/delete`,{method:'PUT'});
assert((await req('/api/sync')).ciphers.find(c=>c.id===item.id).deletedDate);
await req(`/api/ciphers/${item.id}/restore`,{method:'PUT'});
assert(!(await req('/api/sync')).ciphers.find(c=>c.id===item.id).deletedDate);
const renewed=await req('/identity/connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:auth.refresh_token,client_id:'web'})});assert(renewed.access_token);
if(process.env.BW_TEST_CLI){
  const env={...process.env,BITWARDENCLI_APPDATA_DIR:mkdtempSync(`${tmpdir()}/vault-cli-test-`),TEST_PASSWORD:password,BW_NOINTERACTION:'true'};
  for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']) delete env[key];
  env.NO_PROXY='127.0.0.1,localhost';
  const run=args=>execFileSync(process.env.BW_TEST_CLI,args,{env,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']});
  run(['config','server',origin]);
  env.BW_SESSION=run(['login',email,'--passwordenv','TEST_PASSWORD','--raw']).trim();
  const fromOfficial=JSON.parse(run(['get','item',item.id]));
  assert.equal(fromOfficial.login.password,draft.password);assert.equal(fromOfficial.name,'Updated integration cipher');
  console.log('PASS: official Bitwarden CLI login and decryption of Vue-created item');
  const officialItem={...fromOfficial,name:'Official CLI edit',login:{...fromOfficial.login,password:'official-cli-roundtrip'}};
  const encoded=Buffer.from(JSON.stringify(officialItem)).toString('base64');
  run(['edit','item',item.id,encoded]);
  const roundtrip=(await req('/api/sync')).ciphers.find(c=>c.id===item.id);
  assert.equal(decryptItem(sdk,roundtrip,key).password,'official-cli-roundtrip');
  console.log('PASS: Vue crypto decrypts official Bitwarden CLI edit');
  run(['logout']);
}
key.fill(0);
console.log('PASS: register, login, encrypt/create, sync/decrypt, update, recoverable delete, restore, refresh');
