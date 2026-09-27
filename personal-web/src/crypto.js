// Encryption, key protection, KDFs and randomness use Bitwarden's pinned Rust/WASM SDK.
// Only the legacy authentication hash uses standard WebCrypto PBKDF2, per Bitwarden's protocol.
const encoder = new TextEncoder();
export const toBase64 = bytes => btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));
export const normalizeEmail = email => email.trim().toLowerCase();
export const defaultKdf = { pBKDF2: { iterations: 600000 } };
export function parseKdf(response) {
  const type = response.kdf ?? response.Kdf;
  const iterations = response.kdfIterations ?? response.KdfIterations;
  if (type === 0 && Number.isInteger(iterations) && iterations >= 100000 && iterations <= 2000000)
    return { pBKDF2: { iterations } };
  const memory = response.kdfMemory ?? response.KdfMemory;
  const parallelism = response.kdfParallelism ?? response.KdfParallelism;
  if (type === 1 && Number.isInteger(iterations) && iterations >= 1 && iterations <= 10 && Number.isInteger(memory) && memory >= 16 && memory <= 256 && Number.isInteger(parallelism) && parallelism >= 1 && parallelism <= 16)
    return { argon2id: { iterations, memory, parallelism } };
  throw new Error('此账号的加密参数暂不支持，请使用 Bitwarden 客户端。');
}
export async function authenticationHash(sdk, password, email, kdf) {
  const master = sdk.derive_kdf_material(encoder.encode(password), encoder.encode(normalizeEmail(email)), kdf);
  try {
    const key = await crypto.subtle.importKey('raw', master, 'PBKDF2', false, ['deriveBits']);
    return toBase64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(password), iterations:1}, key, 256)));
  } finally { master.fill(0); }
}
export async function registrationPayload(sdk, email, password) {
  email = normalizeEmail(email);
  const key = sdk.make_user_key_aes256_cbc_hmac();
  const privateKey = sdk.rsa_generate_keypair();
  try {
    return {
      email, name: '我的密码库', masterPasswordHash: await authenticationHash(sdk, password, email, defaultKdf),
      key: sdk.encrypt_user_key_with_master_password(key, password, email, defaultKdf),
      kdf: 0, kdfIterations: 600000, kdfMemory: null, kdfParallelism: null,
      keys: { publicKey: toBase64(sdk.rsa_extract_public_key(privateKey)), encryptedPrivateKey: sdk.symmetric_encrypt_bytes(privateKey, key) }
    };
  } finally { key.fill(0); privateKey.fill(0); }
}
function itemKey(sdk, raw, userKey) {
  if (raw.organizationId) throw new Error('团队项目请在 Bitwarden 客户端中打开');
  if (raw.reprompt) throw new Error('需要额外密码确认的项目请在 Bitwarden 客户端中打开');
  return raw.key ? sdk.symmetric_decrypt_bytes(raw.key, userKey) : userKey.slice();
}
export function decryptItem(sdk, raw, userKey) {
  const key = itemKey(sdk, raw, userKey);
  const dec = value => value == null ? '' : sdk.symmetric_decrypt_string(value, key);
  try {
    return { raw, id: raw.id, type: raw.type, name: dec(raw.name), notes: dec(raw.notes),
      username: dec(raw.login?.username), password: dec(raw.login?.password),
      uris: (raw.login?.uris || []).map(uri => dec(uri.uri)),
      favorite: !!raw.favorite, deleted: !!raw.deletedDate,
      fields: (raw.fields || []).map(field => ({name:dec(field.name),value:dec(field.value),type:field.type})),
      editable: [1,2].includes(raw.type) && !raw.organizationId
    };
  } finally { key.fill(0); }
}
export function encryptItem(sdk, draft, original, userKey, userId) {
  const key = original ? itemKey(sdk, original, userKey) : sdk.make_user_key_aes256_cbc_hmac();
  const enc = value => value ? sdk.symmetric_encrypt_string(value, key) : null;
  try {
    const out = original ? structuredClone(original) : {
      type: Number(draft.type), organizationId:null, folderId:null, fields:null,
      key:sdk.symmetric_encrypt_bytes(key, userKey), reprompt:0,
      secureNote:Number(draft.type) === 2 ? {type:0} : null
    };
    out.encryptedFor = userId;
    out.name = enc(draft.name.trim()); out.notes = enc(draft.notes); out.favorite = !!draft.favorite;
    if (original) out.lastKnownRevisionDate = original.revisionDate;
    if (out.type === 1) {
      out.login ??= {};
      if (original?.login?.password && sdk.symmetric_decrypt_string(original.login.password, key) !== draft.password)
        out.passwordHistory = [{password:original.login.password,lastUsedDate:new Date().toISOString()},...(original.passwordHistory || [])].slice(0,5);
      out.login.username = enc(draft.username); out.login.password = enc(draft.password);
      out.login.uris = draft.uris.split('\n').map(u=>u.trim()).filter(Boolean).map((uri,index)=>({...original?.login?.uris?.[index],uri:enc(uri), match:original?.login?.uris?.[index]?.match ?? null}));
    }
    return out;
  } finally { key.fill(0); }
}
export function generatePassword(sdk, length=24) {
  const groups=['abcdefghijkmnopqrstuvwxyz','ABCDEFGHJKLMNPQRSTUVWXYZ','23456789','!@#$%&*+-=?'];
  const all=groups.join('');
  const chars=groups.map(g=>g[sdk.random_number(0,g.length-1)]);
  while(chars.length<length) chars.push(all[sdk.random_number(0,all.length-1)]);
  for(let i=chars.length-1;i>0;i--) {const j=sdk.random_number(0,i); [chars[i],chars[j]]=[chars[j],chars[i]];}
  return chars.join('');
}
