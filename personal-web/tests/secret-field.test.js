// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import SecretField from '../src/SecretField.vue';
import {templates} from '../src/secrets';
it('reads a file locally and emits contents only when the editor is still mounted',async()=>{
  let resolve;
  const file={name:'private.pem',size:8,arrayBuffer:()=>new Promise(r=>{resolve=r;})};
  const wrapper=mount(SecretField,{props:{spec:templates.key[0],editable:true}});
  const input=wrapper.get('input[type=file]');Object.defineProperty(input.element,'files',{value:[file]});
  await input.trigger('change');expect(wrapper.emitted('importing')).toEqual([[true]]);
  wrapper.unmount();resolve(new TextEncoder().encode('fixture\n').buffer);await flushPromises();
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
});
it('downloads the exact revealed content with a safe filename and revokes the blob URL',async()=>{
  const content='fixture\r\nwith trailing newline\r\n';let blob,anchor;
  vi.stubGlobal('URL',class extends URL {static createObjectURL(value){blob=value;return 'blob:test';}static revokeObjectURL=vi.fn();});
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(){anchor=this;});
  const wrapper=mount(SecretField,{props:{spec:templates.certificate[0],modelValue:content,filename:'../../tls.pem'}});
  vi.useFakeTimers();
  try {
    expect(wrapper.find('textarea').exists()).toBe(false);
    await wrapper.findAll('button').find(b=>b.text()==='下载文件').trigger('click');
    expect(blob.size).toBe(new TextEncoder().encode(content).length);expect(anchor.download).toBe('tls.pem');
    vi.advanceTimersByTime(1000);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  } finally {wrapper.unmount();vi.useRealTimers();click.mockRestore();vi.unstubAllGlobals();}
});
