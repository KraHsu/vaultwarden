import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as bindings from '@bitwarden/sdk-internal/bitwarden_wasm_internal_bg.js';
it('initializes the actual browser WASM module and encrypts a value',async()=>{
  const file=createRequire(import.meta.url).resolve('@bitwarden/sdk-internal/bitwarden_wasm_internal_bg.wasm');
  const {instance}=await WebAssembly.instantiate(await readFile(file),{'./bitwarden_wasm_internal_bg.js':bindings});
  bindings.__wbg_set_wasm(instance.exports);
  bindings.init_sdk('off','off',0);
  const key=bindings.PureCrypto.make_user_key_aes256_cbc_hmac();
  const cipher=bindings.PureCrypto.symmetric_encrypt_string('浏览器 SDK works',key);
  expect(bindings.PureCrypto.symmetric_decrypt_string(cipher,key)).toBe('浏览器 SDK works');
});
