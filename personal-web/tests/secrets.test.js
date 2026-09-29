import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {encryptItem,decryptItem} from '../src/crypto';
import {templates,fieldName,marker,readSecretFile,maxSecretBytes,safeFilename,templateData} from '../src/secrets';
const {PureCrypto:sdk,init_sdk}=createRequire(import.meta.url)('@bitwarden/sdk-internal');
init_sdk('off','off',0);
describe('Encrypted key and certificate templates',()=>{
  for (const kind of ['key','certificate']) it(`${kind}: encrypts every value, preserves exact bytes and edits without losing metadata`,()=>{
    const key=sdk.make_user_key_aes256_cbc_hmac();
    const content='-----BEGIN TEST-----\r\n  Fixture-机密-material==\r\n-----END TEST-----\r\n';
    const secrets=Object.fromEntries(templates[kind].map(s=>[s.id,s.id==='content'?content:`fixture-${s.id}-秘密`]));
    const draft={kind,name:'Template test',notes:'private memo',secrets,filenames:{content:'fixture.pem'},favorite:true};
    const raw=encryptItem(sdk,draft,null,key,'user');
    expect(raw.type).toBe(2);expect(raw.secureNote).toEqual({type:0});
    for(const value of [...Object.values(secrets),'fixture.pem','private memo',marker])expect(JSON.stringify(raw)).not.toContain(value);
    expect(decryptItem(sdk,raw,key)).toMatchObject({kind,secrets,filenames:{content:'fixture.pem'}});
    const itemKey=sdk.symmetric_decrypt_bytes(raw.key,key);
    for(const spec of templates[kind]) {
      const field=raw.fields.find(f=>sdk.symmetric_decrypt_string(f.name,itemKey)===fieldName(spec));
      expect(field.type).toBe(1);
      expect(sdk.symmetric_decrypt_string(field.value,itemKey)).toBe(secrets[spec.id]);
    }
    const untouched={name:sdk.symmetric_encrypt_string('Other client field',itemKey),value:sdk.symmetric_encrypt_string('keep me',itemKey),type:1};
    raw.fields.push(untouched);raw.attachments=[{id:'opaque-attachment'}];raw.revisionDate='2026-09-28T00:00:00Z';
    const edited=encryptItem(sdk,{...draft,secrets:{...secrets,content:content+'updated',passphrase:''}},raw,key,'user');
    expect(edited.fields).toContainEqual(untouched);expect(edited.attachments).toEqual(raw.attachments);
    expect(edited.lastKnownRevisionDate).toBe(raw.revisionDate);
    expect(decryptItem(sdk,edited,key).secrets).toMatchObject({content:content+'updated',passphrase:''});
    expect(edited.fields.filter(f=>sdk.symmetric_decrypt_string(f.name,itemKey)===marker)).toHaveLength(1);
    expect(raw.fields).not.toEqual(edited.fields);
    itemKey.fill(0);key.fill(0);
  });
  it('rejects empty or oversized secret content before saving',()=>{
    const key=sdk.make_user_key_aes256_cbc_hmac();
    for(const content of ['', ' '.repeat(3), 'a'.repeat(maxSecretBytes+1)]) expect(()=>encryptItem(sdk,{kind:'key',name:'test',secrets:{content}},null,key,'user')).toThrow();
    key.fill(0);
  });
  it('does not classify ordinary notes or login custom fields as templates',()=>{
    expect(templateData(2,[]).kind).toBe('note');
    expect(templateData(1,[{name:marker,value:'key'}]).kind).toBe('login');
    expect(templateData(2,[{name:marker,value:'constructor'}]).kind).toBe('note');
  });
  it('imports UTF-8 bytes without trimming, rejects binary/empty/oversized files',async()=>{
    const content='\uFEFF-----BEGIN TEST-----\r\n abc \r\n';
    expect(await readSecretFile(new File([content],'test.pem'))).toEqual({content,filename:'test.pem'});
    for(const bytes of [new Uint8Array([0x30,0x82,0xff]),new Uint8Array([0]),'', 'a'.repeat(maxSecretBytes+1)]) await expect(readSecretFile(new File([bytes],'test'))).rejects.toThrow();
    expect(safeFilename('../../private.key')).toBe('private.key');
    expect(safeFilename('..','key.pem')).toBe('key.pem');
  });
});
