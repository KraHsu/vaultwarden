import {describe,it,expect} from 'vitest';
import {authorizationURL,consumeCallback} from '../src/sso';
const origin='https://secret.krahsu.top';
function storage(){const values=new Map();return {setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k),removeItem:k=>values.delete(k)};}
async function fixture(){const store=storage();const url=new URL(await authorizationURL(origin,store,1000));return {store,url,params:new URLSearchParams({code:'fixture-code',iss:origin,state:url.searchParams.get('state')})};}
describe('SSO browser transaction binding',()=>{
  it('uses a random S256 challenge, validates the callback and consumes the verifier once',async()=>{
    const {store,url,params}=await fixture();expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const result=consumeCallback(params,origin,store,1001);expect(result.code_verifier).toHaveLength(43);
    expect(()=>consumeCallback(params,origin,store,1002)).toThrow();
  });
  it.each(['state','issuer','expired','duplicate'])('rejects %s callback before token exchange',async(kind)=>{
    const {store,params}=await fixture();
    if(kind==='state')params.set('state','attacker');
    if(kind==='issuer')params.set('iss','https://other.invalid');
    if(kind==='duplicate')params.append('code','attacker');
    expect(()=>consumeCallback(params,origin,store,kind==='expired'?700000:1001)).toThrow();
  });
});
