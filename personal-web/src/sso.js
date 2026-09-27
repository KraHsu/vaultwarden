const storageKey='vault-sso-pkce';
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function authorizationURL(origin,storage=sessionStorage,now=Date.now()) {
  const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state=base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  storage.setItem(storageKey,JSON.stringify({verifier,state,created:now}));
  const query=new URLSearchParams({client_id:'web',redirect_uri:origin+'/sso-connector.html',response_type:'code',scope:'api offline_access',state,code_challenge:challenge,code_challenge_method:'S256'});
  return origin+'/identity/connect/authorize?'+query;
}
export function consumeCallback(params,origin,storage=sessionStorage,now=Date.now()) {
  const raw=storage.getItem(storageKey);storage.removeItem(storageKey);
  let saved;try{saved=JSON.parse(raw);}catch{throw new Error('登录状态无效，请重新通过归一登录。');}
  if(!saved || !/^[A-Za-z0-9_-]{43}$/.test(saved.verifier) || now-saved.created>600000 || now<saved.created
    || params.getAll('state').length!==1 || params.get('state')!==saved.state
    || params.getAll('iss').length!==1 || params.get('iss')!==origin
    || params.getAll('code').length!==1 || !params.get('code') || params.has('error'))
    throw new Error('登录状态无效或已过期，请重新通过归一登录。');
  return {code:params.get('code'),code_verifier:saved.verifier};
}
