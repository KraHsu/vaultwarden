import initWasm from '@bitwarden/sdk-internal/bitwarden_wasm_internal_bg.wasm?init';
import * as bindings from '@bitwarden/sdk-internal/bitwarden_wasm_internal_bg.js';
import { init, init_sdk, PureCrypto } from '@bitwarden/sdk-internal';
let ready;
export function loadCrypto() {
  ready ??= initWasm({ './bitwarden_wasm_internal_bg.js': bindings }).then(instance => {
    init(instance.exports);
    init_sdk('off', 'off', 0);
    return PureCrypto;
  });
  return ready;
}
