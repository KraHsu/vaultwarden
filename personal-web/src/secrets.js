// Templates use ordinary encrypted secure-note fields, readable by other clients.
export const kinds = {login:'登录信息', note:'安全笔记', key:'密钥', certificate:'证书'};
export const maxSecretBytes = 256 * 1024;
export const marker = '密匣 / 类型 (v1)';
export const templates = {
  key: [
    {id:'content',label:'密钥内容',required:true,multiline:true,download:true,fallback:'key.txt',placeholder:'API Key、Token 或 SSH / PEM 私钥，保留原有换行'},
    {id:'publicKey',label:'公钥',multiline:true,download:true,fallback:'public-key.pub'},
    {id:'passphrase',label:'密钥口令'},
  ],
  certificate: [
    {id:'content',label:'证书内容',required:true,multiline:true,download:true,fallback:'certificate.pem',placeholder:'粘贴 PEM 证书或完整证书链，保留 BEGIN / END 行'},
    {id:'privateKey',label:'配套私钥',multiline:true,download:true,fallback:'private-key.pem'},
    {id:'passphrase',label:'私钥口令'},
  ],
};
export const fieldName = spec => `密匣 / ${spec.label}`;
export const filenameField = spec => `${fieldName(spec)} / 文件名`;
export function templateData(type, fields) {
  const kind = type === 2 && fields.find(f=>f.name===marker)?.value;
  if (!Object.hasOwn(templates,kind)) return {kind:type===1?'login':type===2?'note':'unsupported', secrets:{}, filenames:{}};
  const value = name => fields.find(f=>f.name===name)?.value || '';
  return {kind,secrets:Object.fromEntries(templates[kind].map(s=>[s.id,value(fieldName(s))])),
    filenames:Object.fromEntries(templates[kind].map(s=>[s.id,value(filenameField(s))]))};
}
export function managedNames(kind) {
  return new Set([marker,...(templates[kind]||[]).flatMap(s=>[fieldName(s),filenameField(s)])]);
}
export function validateSecrets(kind, secrets={}) {
  for (const spec of templates[kind]||[]) {
    const value=secrets[spec.id] || '';
    if (spec.required && !value.trim()) throw new Error(`请填写${spec.label}，或导入文本文件。`);
    if (new TextEncoder().encode(value).length > maxSecretBytes) throw new Error(`${spec.label}不能超过 256 KiB。`);
  }
}
export function safeFilename(name, fallback='secret.txt') {
  const clean=String(name||'').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f<>:"|?*]/g,'_').slice(0,180);
  return clean && !/^\.+$/.test(clean) ? clean : fallback;
}
export async function readSecretFile(file) {
  if (file.size > maxSecretBytes) throw new Error('文件不能超过 256 KiB。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let content;
  try {content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);} catch {throw new Error('请选择 UTF-8 文本或 PEM 文件；二进制 DER、P12 / PFX 请先转换为 PEM。');}
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content)) throw new Error('此文件是二进制格式，请先转换为 PEM 文本。');
  if (!content.trim()) throw new Error('文件内容为空。');
  return {content,filename:safeFilename(file.name)};
}
