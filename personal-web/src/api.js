import { loadCrypto } from './sdk';
import { authenticationHash, normalizeEmail, parseKdf, registrationPayload, decryptItem, encryptItem } from './crypto';
// Session tokens and decrypted keys are memory-only. A page reload is a full lock.
let accessToken, refreshToken, expires=0, userKey, userId, sdk;
let refreshPromise;
const deviceIdentifier=crypto.randomUUID();
async function request(path, options={}) {
  const response=await fetch(path, {cache:'no-store',credentials:'omit',...options,
    headers:{'Content-Type':'application/json','Bitwarden-Client-Version':'2026.8.0',...options.headers}});
  const text=await response.text();
  let data; try {data=text ? JSON.parse(text):null;} catch {throw new Error('服务器返回异常，请稍后重试。');}
  if (!response.ok) {
    const error=new Error(response.status===401 ? '会话已过期，请锁定后重新登录。' : (data?.errorModel?.message || data?.ErrorModel?.Message || data?.message || '操作未完成，请检查输入后重试。'));
    error.providers=data?.TwoFactorProviders || data?.twoFactorProviders;
    error.status=response.status;
    throw error;
  }
  return data;
}
function acceptToken(result) {
  accessToken=result.access_token; refreshToken=result.refresh_token;
  expires=Date.now()+(result.expires_in-60)*1000;
}
async function authRequest(path,options={}) {
  if(Date.now()>=expires && refreshToken) {
    refreshPromise ??= request('/identity/connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,client_id:'web'})}).then(acceptToken).finally(()=>{refreshPromise=null;});
    await refreshPromise;
  }
  return request(path,{...options,headers:{...options.headers,Authorization:`Bearer ${accessToken}`}});
}
export async function register(email,password) {
  sdk=await loadCrypto();
  await request('/identity/accounts/register',{method:'POST',body:JSON.stringify(await registrationPayload(sdk,email,password))});
}
export async function login(email,password,otp='') {
  sdk=await loadCrypto(); email=normalizeEmail(email);
  const kdf=parseKdf(await request('/api/accounts/prelogin',{method:'POST',body:JSON.stringify({email})}));
  const hash=await authenticationHash(sdk,password,email,kdf);
  const body=new URLSearchParams({grant_type:'password',username:email,password:hash,scope:'api offline_access',client_id:'web',deviceType:'10',deviceIdentifier,deviceName:'密匣 · Vue'});
  if(otp) {body.set('twoFactorProvider','0');body.set('twoFactorToken',otp);body.set('twoFactorRemember','0');}
  const result=await request('/identity/connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const nextKey=sdk.decrypt_user_key_with_master_password(result.Key || result.key,password,email,kdf);
  userKey?.fill(0); userKey=nextKey;
  acceptToken(result);
  return sync();
}
export async function sync() {
  const data=await authRequest('/api/sync?excludeDomains=true');
  userId=data.profile.id;
  const items=[]; let unreadable=0;
  for(const raw of data.ciphers || []) {
    try {items.push(decryptItem(sdk,raw,userKey));} catch {unreadable++;}
  }
  return {items,unreadable};
}
export async function save(draft,original) {
  const payload=encryptItem(sdk,draft,original,userKey,userId);
  await authRequest(original ? `/api/ciphers/${encodeURIComponent(original.id)}` : '/api/ciphers', {method:original?'PUT':'POST',body:JSON.stringify(payload)});
}
export async function trash(id) {await authRequest(`/api/ciphers/${encodeURIComponent(id)}/delete`,{method:'PUT'});}
export async function restore(id) {await authRequest(`/api/ciphers/${encodeURIComponent(id)}/restore`,{method:'PUT'});}
export function clearSession() {userKey?.fill(0);userKey=null; accessToken=null; refreshToken=null;}
