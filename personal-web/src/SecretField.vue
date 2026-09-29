<script setup>
import {ref, onUnmounted} from 'vue';
import {readSecretFile, safeFilename} from './secrets';
const props=defineProps({spec:Object,modelValue:{type:String,default:''},filename:{type:String,default:''},editable:Boolean,disabled:Boolean});
const emit=defineEmits(['update:modelValue','update:filename','copy','notice','importing']);
const visible=ref(false), error=ref(''), importing=ref(false);
let importVersion=0;
onUnmounted(()=>{importVersion++;});
async function importFile(event) {
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  error.value='';importing.value=true;emit('importing',true);const version=++importVersion;
  try {
    const result=await readSecretFile(file);
    if(version!==importVersion)return;
    emit('update:modelValue',result.content);emit('update:filename',result.filename);
    emit('notice','文件已在本地读取，保存后才会加密上传');
  } catch(e) {if(version===importVersion)error.value=e.message;} finally {if(version===importVersion){importing.value=false;emit('importing',false);}}
}
function download() {
  const blob=new Blob([props.modelValue],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url;link.download=safeFilename(props.filename,props.spec.fallback);
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  emit('notice','已下载解密后的文件，请妥善保管');
}
</script>
<template>
  <section class="secret-field" :aria-label="spec.label">
    <div class="secret-heading"><span>{{spec.label}}{{editable&&!spec.required?'（可选）':''}}</span><button type="button" class="text-button" :disabled="disabled" @click="visible=!visible">{{visible?'隐藏':editable?'显示 / 输入':'显示'}}</button></div>
    <textarea v-if="visible && spec.multiline" :value="modelValue" @input="emit('update:modelValue',$event.target.value)" :readonly="!editable" :disabled="disabled || importing" :aria-label="spec.label" class="secret-content" rows="6" spellcheck="false" autocapitalize="off" autocomplete="off" :placeholder="spec.placeholder || '可留空'"></textarea>
    <input v-else-if="visible" :value="modelValue" @input="emit('update:modelValue',$event.target.value)" :readonly="!editable" :disabled="disabled" :aria-label="spec.label" autocomplete="off" spellcheck="false">
    <p v-else class="secret-mask">{{modelValue?'••••••••••••':'尚未填写'}}</p>
    <p v-if="filename" class="small-note secret-filename">{{filename}}</p>
    <div class="secret-actions">
      <label v-if="editable && spec.multiline" class="file-picker">{{importing?'读取中…':'导入文本文件'}}<input type="file" :aria-label="`导入${spec.label}`" :disabled="disabled || importing" @change="importFile"></label>
      <template v-if="!editable && modelValue"><button type="button" @click="emit('copy',modelValue)">复制</button><button v-if="spec.download" type="button" @click="download">下载文件</button></template>
    </div>
    <p v-if="error" class="error" role="alert">{{error}}</p>
  </section>
</template>
