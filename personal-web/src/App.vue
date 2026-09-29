<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, nextTick, toRaw } from 'vue';
import * as api from './api';
import { loadCrypto } from './sdk';
import { generatePassword } from './crypto';
import SecretField from './SecretField.vue';
import {kinds, templates, managedNames, validateSecrets} from './secrets';

const theme=ref(localStorage.getItem('vault-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light'));
function applyTheme(){document.documentElement.dataset.theme=theme.value;localStorage.setItem('vault-theme',theme.value);}
function toggleTheme(){theme.value=theme.value==='dark'?'light':'dark';applyTheme();}
applyTheme();
const unlocked=ref(false), email=ref(''), password=ref(''), confirmation=ref(''), otp=ref('');
const ssoReady=ref(false);
const mode=ref('login'), twoFactor=ref(false), busy=ref(false), error=ref(''), notice=ref('');
const items=ref([]), unreadable=ref(0), query=ref(''), category=ref('all'), selectedId=ref(null);
const editPasswordVisible=ref(false);
const showPassword=ref(false), editing=ref(false), editError=ref(''), dialog=ref(null), nameInput=ref(null);
const blankDraft=()=>({name:'',username:'',password:'',uris:'',notes:'',type:1,kind:'login',favorite:false,secrets:{},filenames:{}});
const draft=reactive(blankDraft());
const typeFilter=ref('all');
const importingFiles=reactive({});
const importing=computed(()=>Object.values(importingFiles).some(Boolean));
const kindOf=item=>item.kind || (item.type===1?'login':item.type===2?'note':'unsupported');
const extraFields=computed(()=>selected.value?.fields.filter(f=>!templates[kindOf(selected.value)] || !managedNames(kindOf(selected.value)).has(f.name)) || []);
let original=null, noticeTimer, idleTimer, hiddenAt=0;
const counts=computed(()=>({all:items.value.filter(i=>!i.deleted).length,favorites:items.value.filter(i=>!i.deleted&&i.favorite).length,trash:items.value.filter(i=>i.deleted).length}));
const tabs=[['all','全部项目'],['favorites','收藏'],['trash','回收站']];
const visible=computed(()=>items.value.filter(item=>{
  if(category.value==='trash' ? !item.deleted:item.deleted) return false;
  if(category.value==='favorites'&&!item.favorite) return false;
  if(typeFilter.value!=='all' && kindOf(item)!==typeFilter.value) return false;
  const q=query.value.trim().toLowerCase();
  return !q || [item.name,item.username,...item.uris].some(v=>v.toLowerCase().includes(q));
}).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')));
const selected=computed(()=>items.value.find(i=>i.id===selectedId.value));
function toast(message){notice.value=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.value='',3500);}
function setMode(value){ssoReady.value=false;api.clearSession();mode.value=value;error.value='';password.value='';confirmation.value='';otp.value='';twoFactor.value=false;}
function install(result){items.value=result.items;unreadable.value=result.unreadable;}
async function submitAuth(){
  error.value='';busy.value=true;
  try {
    if(mode.value==='register') {
      if(password.value.length<14) throw new Error('请使用至少 14 个字符的主密码。');
      if(password.value!==confirmation.value) throw new Error('两次输入的主密码不一致。');
      await api.register(email.value,password.value);
      // Registration is complete even if the following login fails.
      mode.value='login';confirmation.value='';toast('密码库已创建，正在登录。');
    }
    install(ssoReady.value ? await api.unlockSSO(password.value) : await api.login(email.value,password.value,otp.value));
    ssoReady.value=false;
    unlocked.value=true;password.value='';confirmation.value='';otp.value='';twoFactor.value=false;resetIdle();
  } catch(e) {
    if(e.providers?.map(String).includes('0')) {twoFactor.value=true;error.value='请输入验证器中的六位验证码。';}
    else if(e.providers) error.value='此账号使用了其他二步验证方式，请通过 Bitwarden 客户端登录。';
    else error.value=e.message;
  } finally {busy.value=false;}
}
function lock(){ssoReady.value=false;api.clearSession();items.value=[];Object.assign(draft,blankDraft());password.value='';location.reload();}
function resetIdle(){if(!unlocked.value)return;clearTimeout(idleTimer);idleTimer=setTimeout(lock,5*60*1000);}
function visibility(){if(document.hidden) hiddenAt=Date.now();else if(unlocked.value&&hiddenAt&&Date.now()-hiddenAt>60000)lock();}
async function startSSO(){busy.value=true;error.value='';try{await api.startSSO();}catch(e){error.value=e.message;busy.value=false;}}
onMounted(async()=>{busy.value=true;try{const result=await api.finishSSO();if(result){email.value=result.email;ssoReady.value=true;}}catch(e){error.value=e.message;}finally{busy.value=false;}});
onMounted(()=>{for(const event of ['pointerdown','keydown','touchstart'])window.addEventListener(event,resetIdle,{passive:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',api.clearSession);});
onUnmounted(()=>{clearTimeout(idleTimer);clearTimeout(noticeTimer);for(const event of ['pointerdown','keydown','touchstart'])window.removeEventListener(event,resetIdle);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',api.clearSession);});
async function refresh(){busy.value=true;error.value='';try{install(await api.sync());toast('已同步');}catch(e){error.value=e.message;}finally{busy.value=false;}}
function choose(item){selectedId.value=item.id;showPassword.value=false;}
async function openEditor(item){
  original=item?.raw ? structuredClone(toRaw(item.raw)):null;
  Object.assign(draft,{name:item?.name||'',username:item?.username||'',password:item?.password||'',uris:item?.uris.join('\n')||'',notes:item?.notes||'',type:item?.type||1,kind:item?kindOf(item):'login',favorite:item?.favorite||false,secrets:{...item?.secrets},filenames:{...item?.filenames}});
  editPasswordVisible.value=false;editError.value='';editing.value=true;await nextTick();dialog.value.showModal();nameInput.value?.focus();
}
function closeEditor(){if(busy.value)return;for(const key of Object.keys(importingFiles))delete importingFiles[key];dialog.value?.close();editing.value=false;original=null;Object.assign(draft,blankDraft());}
async function save(){if(importing.value)return;busy.value=true;editError.value='';try{validateSecrets(draft.kind,draft.secrets);await api.save({...draft,secrets:{...draft.secrets},filenames:{...draft.filenames}},original);install(await api.sync());busy.value=false;closeEditor();toast('已加密保存');}catch(e){editError.value=e.message;}finally{busy.value=false;}}
async function moveToTrash(item){busy.value=true;error.value='';try{await api.trash(item.id);install(await api.sync());selectedId.value=null;toast('已移入回收站，可以恢复');}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function restore(item){busy.value=true;error.value='';try{await api.restore(item.id);install(await api.sync());selectedId.value=null;toast('已恢复');}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function copy(value){try{await navigator.clipboard.writeText(value);toast('已复制到剪贴板');}catch{toast('浏览器未允许复制，请手动选择内容。');}}
async function generate(){draft.password=generatePassword(await loadCrypto());toast('已生成 24 位随机密码');}
function siteLabel(item){if(templates[kindOf(item)])return kinds[kindOf(item)];try{return new URL(item.uris[0]).hostname;}catch{return item.uris[0] || (item.type===2?'安全笔记':'登录信息');}}
function safeLink(url){try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?parsed.href:null;}catch{return null;}}
</script>

<template>
  <div class="page">
    <header class="masthead">
      <a class="wordmark" href="/" aria-label="密匣首页"><span class="mark" aria-hidden="true">匣</span>密匣<span class="wordmark-en">SECRET / KRAHSU</span></a>
      <nav aria-label="页面操作"><span v-if="unlocked" class="session-label"><i class="dot"></i>已解锁</span><button class="theme-button" @click="toggleTheme" :aria-label="theme==='dark'?'切换浅色主题':'切换深色主题'">{{theme==='dark'?'☀':'☾'}}</button><button v-if="unlocked" class="text-button" @click="lock">锁定 ↗</button></nav>
    </header>

    <main v-if="!unlocked" class="welcome">
      <section class="welcome-copy">
        <p class="eyebrow">A QUIET PLACE FOR YOUR SECRETS</p>
        <h1>把重要的秘密，<br>收进自己的匣子。</h1>
        <p class="intro-note">只记住一个主密码。<br>其余的，留在这里。</p>
        <div class="welcome-rule"></div>
        <p class="small-note"><span class="dot"></span>密码、密钥与证书，在浏览器里加密。</p>
      </section>
      <section class="auth-panel" aria-labelledby="auth-title">
        <p class="eyebrow">{{mode==='register'?'FIRST VISIT':'YOUR PRIVATE VAULT'}}</p>
        <h2 id="auth-title">{{mode==='register'?'开启你的密码库':ssoReady?'身份已验证':'欢迎回来'}}</h2>
        <p class="muted auth-subtitle">{{mode==='register'?'仅限已获邀请的邮箱。主密码由你保管。':ssoReady?'输入主密码，在此设备上解密密码库。':'输入主密码，打开你的私藏。'}}</p>
        <form @submit.prevent="submitAuth">
          <label>邮箱<input v-model="email" type="email" required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="you@example.com" :disabled="busy || ssoReady"></label>
          <label>主密码<input v-model="password" type="password" required :minlength="mode==='register'?14:1" :autocomplete="mode==='register'?'new-password':'current-password'" placeholder="输入你的主密码" :disabled="busy"></label>
          <label v-if="mode==='register'">再输入一次<input v-model="confirmation" type="password" required minlength="14" autocomplete="new-password" placeholder="确认主密码" :disabled="busy"></label>
          <label v-if="twoFactor">验证码<input v-model="otp" type="text" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" maxlength="6" placeholder="六位验证码" :disabled="busy"></label>
          <p v-if="error" class="error" role="alert">{{error}}</p>
          <button class="primary auth-submit" :disabled="busy">{{busy?'正在处理…':mode==='register'?'创建密码库 →':'解锁密码库 →'}}</button>
        </form>
        <button v-if="mode==='login' && !ssoReady" type="button" class="secondary auth-submit" :disabled="busy" @click="startSSO">通过归一登录 ↗</button>
        <p v-if="ssoReady" class="small-note">主密码仅用于浏览器内解密，不会发送给 IAM。 <button type="button" class="text-button" @click="setMode('login')">重新登录</button></p>
        <p class="auth-switch">{{mode==='register'?'已经设置过主密码？':'第一次来到这里？'}} <button @click="setMode(mode==='register'?'login':'register')" :disabled="busy">{{mode==='register'?'返回登录':'激活账号'}}</button></p>
        <p v-if="mode==='register'" class="small-note">请妥善保存主密码。服务器无法替你找回。</p>
      </section>
    </main>

    <main v-else class="vault">
      <section class="intro"><div><p class="eyebrow">A LITTLE ORDER, A LITTLE PEACE</p><h1>我的密码库<span class="heading-dot">.</span></h1><p class="intro-note">{{counts.all}} 个项目，妥善收好。</p></div><button class="primary" @click="openEditor()" :disabled="busy">＋ 新建项目</button></section>
      <p v-if="error" class="error banner" role="alert">{{error}}</p>
      <p v-if="unreadable" class="banner muted">{{unreadable}} 个团队、特殊保护或其他加密类型的项目暂未显示，请使用 Bitwarden 客户端查看。</p>
      <div class="toolbar"><div class="tabs" aria-label="项目分类"><button v-for="[key,label] in tabs" :key="key" :aria-pressed="category===key" @click="category=key;selectedId=null">{{label}}<span>{{counts[key]}}</span></button></div><div class="search-wrap"><input v-model="query" aria-label="搜索密码库" placeholder="搜索名称、账号或网址" type="search" autocomplete="off"><button class="text-button" @click="refresh" :disabled="busy">同步 ↻</button></div></div>
      <label class="type-filter">项目类型<select v-model="typeFilter" @change="selectedId=null"><option value="all">全部类型</option><option v-for="(label,key) in kinds" :key="key" :value="key">{{label}}</option></select></label>
      <div class="vault-layout" :class="{ 'has-selection':selected }">
        <section class="item-list" aria-label="密码项目">
          <div v-if="!visible.length" class="empty-state"><span class="empty-symbol" aria-hidden="true">◇</span><h2>{{query||typeFilter!=='all'?'没有找到相关项目':category==='trash'?'回收站是空的':category==='favorites'?'把常用的，放在手边':'收好第一个秘密'}}</h2><p>{{query||typeFilter!=='all'?'换个关键词或类型试试。':category==='trash'?'移除的项目会保留在这里，随时可以恢复。':category==='favorites'?'编辑项目时，勾选「收藏」。':'保存账号、密钥、证书或安全笔记。'}}</p><button v-if="category==='all'&&!query" class="secondary" @click="openEditor()">添加一个项目 ↗</button></div>
          <button v-for="item in visible" :key="item.id" class="item-row" :class="{selected:selectedId===item.id}" @click="choose(item)"><span class="item-icon">{{kindOf(item)==='key'?'钥':kindOf(item)==='certificate'?'证':item.type===2?'文':item.name.slice(0,1).toUpperCase()}}</span><span class="item-summary"><strong>{{item.name}}</strong><small>{{item.username || siteLabel(item)}}</small></span><span v-if="item.favorite" class="favorite" aria-label="已收藏">✦</span><span class="item-arrow" aria-hidden="true">↗</span></button>
        </section>
        <aside v-if="selected" class="detail" aria-label="项目详情"><div class="detail-top"><p class="eyebrow">{{kindOf(selected)==='key'?'SECRET KEY':kindOf(selected)==='certificate'?'CERTIFICATE':selected.type===2?'SECURE NOTE':'LOGIN DETAILS'}}</p><button class="close-button" @click="selectedId=null" aria-label="关闭详情">×</button></div><h2>{{selected.name}}</h2>
          <template v-if="selected.type===1"><div class="detail-field"><label>账号</label><div><span class="wrap">{{selected.username || '—'}}</span><button v-if="selected.username" @click="copy(selected.username)" aria-label="复制账号">复制</button></div></div><div class="detail-field"><label>密码</label><div><code>{{showPassword?selected.password:'••••••••••••'}}</code><button @click="showPassword=!showPassword">{{showPassword?'隐藏':'显示'}}</button><button @click="copy(selected.password)" aria-label="复制密码">复制</button></div></div><div v-if="selected.uris.length" class="detail-field"><label>网站</label><div v-for="uri in selected.uris" :key="uri"><a v-if="safeLink(uri)" :href="safeLink(uri)" target="_blank" rel="noopener noreferrer" class="site-link">{{uri}} ↗</a><span v-else class="wrap">{{uri}}</span></div></div></template>
          <SecretField v-for="spec in templates[kindOf(selected)] || []" :key="`${selected.id}:${spec.id}`" :spec="spec" :model-value="selected.secrets?.[spec.id] || ''" :filename="selected.filenames?.[spec.id] || ''" @copy="copy" @notice="toast" />
          <div v-if="selected.notes" class="detail-field"><label>备注</label><p class="notes">{{selected.notes}}</p></div>
          <p v-if="extraFields.length" class="small-note">此项目还有 {{extraFields.length}} 个自定义字段，编辑时会保留；可在 Bitwarden 客户端查看。</p>
          <p v-if="selected.raw.attachments?.length" class="small-note">附件可在 Bitwarden 客户端查看。</p>
          <p v-if="!selected.editable" class="small-note">此类型的完整内容请在 Bitwarden 客户端查看。</p>
          <div class="detail-actions"><template v-if="selected.deleted"><button class="secondary" @click="restore(selected)" :disabled="busy">恢复项目 ↗</button></template><template v-else><button v-if="selected.editable" class="secondary" @click="openEditor(selected)" :disabled="busy">编辑项目</button><button class="text-button danger" @click="moveToTrash(selected)" :disabled="busy">移入回收站</button></template></div>
        </aside>
      </div>
      <p class="vault-note">静置 5 分钟后自动锁定。离开页面超过 1 分钟，返回时需重新解锁。</p>
    </main>
    <footer><span>密匣 <span class="footer-dot">·</span> KraHsu</span><span><a href="https://github.com/KraHsu/vaultwarden" target="_blank" rel="noopener noreferrer">Vue × Vaultwarden ↗</a> <span class="footer-dot">·</span> 端到端加密</span></footer>
  </div>
  <dialog ref="dialog" @cancel.prevent="closeEditor" @click="e=>{if(e.target===dialog)closeEditor()}">
    <form v-if="editing" @submit.prevent="save"><div class="dialog-heading"><div><p class="eyebrow">A PLACE FOR EVERYTHING</p><h2>{{original?'编辑项目':'收好一个秘密'}}</h2></div><button type="button" class="close-button" @click="closeEditor" aria-label="关闭编辑" :disabled="busy">×</button></div>
      <label v-if="!original">类型<select v-model="draft.kind" :disabled="busy || importing"><option v-for="(label,key) in kinds" :key="key" :value="key">{{label}}</option></select></label>
      <label>名称<input ref="nameInput" v-model="draft.name" required maxlength="500" placeholder="例如：GitHub" autocomplete="off"></label>
      <template v-if="draft.kind==='login'"><label>账号<input v-model="draft.username" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="邮箱或用户名"></label><label>密码<div class="password-input"><input v-model="draft.password" :type="editPasswordVisible ? 'text' : 'password'" autocomplete="new-password" spellcheck="false" placeholder="输入或生成密码"><button type="button" @click="generate">生成 ↻</button></div><button type="button" class="text-button" @click="editPasswordVisible=!editPasswordVisible">{{editPasswordVisible ? '隐藏密码' : '显示密码'}}</button></label><label>网站<textarea v-model="draft.uris" rows="2" placeholder="https://example.com&#10;多个网址，每行一个" spellcheck="false"></textarea></label></template>
      <template v-if="templates[draft.kind]">
        <p class="small-note">粘贴内容或导入 UTF-8 / PEM 文本，每项最多 256 KiB。文件仅在本地读取，保存时加密上传。</p>
        <SecretField v-for="spec in templates[draft.kind]" :key="`${draft.kind}:${spec.id}`" :spec="spec" v-model="draft.secrets[spec.id]" v-model:filename="draft.filenames[spec.id]" editable :disabled="busy" @importing="importingFiles[spec.id]=$event" @notice="toast" />
      </template>
      <label>备注<textarea v-model="draft.notes" rows="4" placeholder="留下一点需要记住的事。"></textarea></label><label class="checkbox"><input v-model="draft.favorite" type="checkbox">收藏，方便下次找到</label>
      <p v-if="editError" class="error" role="alert">{{editError}}</p><div class="dialog-actions"><span class="small-note">加密后保存到你的服务器</span><button class="primary" :disabled="busy || importing">{{busy?'保存中…':'保存项目 →'}}</button></div>
    </form>
  </dialog>
  <div v-if="notice" class="toast" role="status">{{notice}}</div>
</template>
