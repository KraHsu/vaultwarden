import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { pbkdf2Sync, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import { authenticationHash, defaultKdf, parseKdf, registrationPayload, encryptItem, decryptItem, generatePassword } from '../src/crypto';
const {PureCrypto:sdk,init_sdk}=createRequire(import.meta.url)('@bitwarden/sdk-internal');
init_sdk('off','off',0);
const password='Test-only passphrase: 月亮 2026!';
const email='fixture@example.invalid';
// Independent Node crypto implementation of the documented type-2 wire format.
function decryptWire(enc,key){
  const [iv,ciphertext,mac]=enc.slice(2).split('|').map(s=>Buffer.from(s,'base64'));
  expect(enc.startsWith('2.')).toBe(true);
  expect(timingSafeEqual(createHmac('sha256',key.slice(32)).update(Buffer.concat([iv,ciphertext])).digest(),mac)).toBe(true);
  const decipher=createDecipheriv('aes-256-cbc',key.slice(0,32),iv);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
}
describe('Bitwarden compatibility and integrity',()=>{
  it('matches independent PBKDF2 authentication hash',async()=>{
    const master=pbkdf2Sync(password,email,600000,32,'sha256');
    expect(await authenticationHash(sdk,password,' FIXTURE@example.invalid ',defaultKdf)).toBe(pbkdf2Sync(master,password,1,32,'sha256').toString('base64'));
  });
  it('generates interoperable protected account keys',async()=>{
    const payload=await registrationPayload(sdk,email,password);
    const master=pbkdf2Sync(password,email,600000,32,'sha256');
    const expanded=Buffer.concat(['enc','mac'].map(info=>createHmac('sha256',master).update(Buffer.concat([Buffer.from(info),Buffer.from([1])])).digest()));
    const key=decryptWire(payload.key,expanded);
    expect(key.length).toBe(64);
    expect(decryptWire(payload.keys.encryptedPrivateKey,key).length).toBeGreaterThan(1000);
    expect(()=>sdk.decrypt_user_key_with_master_password(payload.key,'wrong',email,defaultKdf)).toThrow();
  },20000);
  it('encrypts sensitive fields and uses a unique per-item key',()=>{
    const userKey=sdk.make_user_key_aes256_cbc_hmac();
    const draft={type:1,name:'私人 GitHub',username:'alice',password:'unique-secret',uris:'https://github.com',notes:'private note',favorite:true};
    const raw=encryptItem(sdk,draft,null,userKey,'fixture-id');
    expect(JSON.stringify(raw)).not.toContain('unique-secret');
    const key=decryptWire(raw.key,userKey);
    expect(decryptWire(raw.login.password,key).toString()).toBe(draft.password);
    expect(decryptItem(sdk,raw,userKey)).toMatchObject({name:draft.name,password:draft.password,username:draft.username});
    const tampered={...raw,name:raw.name.slice(0,-4)+'AAAA'};
    expect(()=>decryptItem(sdk,tampered,userKey)).toThrow();
  });
  it('preserves unedited fields, TOTP, attachments and optimistic revision',()=>{
    const key=sdk.make_user_key_aes256_cbc_hmac();
    const original={id:'fixture',type:1,name:sdk.symmetric_encrypt_string('Old',key),login:{username:null,password:sdk.symmetric_encrypt_string('old-password',key),totp:'opaque-totp',uris:[],fido2Credentials:[{opaque:'passkey'}]},fields:[{name:'encrypted',value:'encrypted'}],attachments:[{id:'attachment'}],revisionDate:'2026-01-01T00:00:00Z',reprompt:0};
    const changed=encryptItem(sdk,{name:'New',username:'',password:'new-password',uris:'',notes:'',favorite:false},original,key,'fixture-id');
    expect(changed.login.totp).toBe(original.login.totp);
    expect(changed.login.fido2Credentials).toEqual(original.login.fido2Credentials);
    expect(changed.fields).toEqual(original.fields);
    expect(changed.attachments).toEqual(original.attachments);
    expect(changed.lastKnownRevisionDate).toBe(original.revisionDate);
    expect(decryptWire(changed.passwordHistory[0].password,key).toString()).toBe('old-password');
  });
  it('rejects unsupported KDF values and shared ciphers',()=>{
    expect(()=>parseKdf({kdf:9,kdfIterations:600000})).toThrow();
    expect(()=>parseKdf({kdf:1,kdfIterations:3,kdfMemory:999999,kdfParallelism:4})).toThrow();
    expect(()=>decryptItem(sdk,{organizationId:'team'},new Uint8Array(64))).toThrow();
    expect(()=>decryptItem(sdk,{reprompt:1},new Uint8Array(64))).toThrow();
  });
  it('supports Argon2 account key protection',async()=>{
    const kdf=parseKdf({kdf:1,kdfIterations:3,kdfMemory:64,kdfParallelism:4});
    const key=sdk.make_user_key_aes256_cbc_hmac();
    const wrapped=sdk.encrypt_user_key_with_master_password(key,password,email,kdf);
    expect(sdk.decrypt_user_key_with_master_password(wrapped,password,email,kdf)).toEqual(key);
  });
  it('generates randomized passwords with all four character classes',()=>{
    const outputs=new Set(Array.from({length:100},()=>generatePassword(sdk)));
    expect(outputs.size).toBe(100);
    for(const value of outputs){expect(value.length).toBe(24);for(const pattern of [/[a-z]/,/[A-Z]/,/[0-9]/,/[!@#$%&*+\-=?]/])expect(value).toMatch(pattern);}
  });
});
