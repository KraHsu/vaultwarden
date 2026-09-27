// @vitest-environment jsdom
import {vi,describe,it,expect,beforeEach,afterEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../src/api',()=>({login:vi.fn(),sync:vi.fn(),save:vi.fn(),register:vi.fn(),trash:vi.fn(),restore:vi.fn(),clearSession:vi.fn()}));
vi.mock('../src/sdk',()=>({loadCrypto:vi.fn()}));
import * as api from '../src/api';
import App from '../src/App.vue';
let wrapper;
const item={id:'one',name:'GitHub',username:'alice',password:'private-password',uris:['https://github.com'],notes:'private note',favorite:false,deleted:false,type:1,fields:[],editable:true,raw:{id:'one',name:'encrypted-name',type:1,login:{password:'encrypted-pass'},revisionDate:'revision'}};
beforeEach(()=>{
  vi.clearAllMocks();
  window.matchMedia=()=>({matches:false});
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;};
  api.login.mockResolvedValue({items:[structuredClone(item)],unreadable:0});
  api.sync.mockResolvedValue({items:[structuredClone(item)],unreadable:0});
  wrapper=mount(App,{attachTo:document.body});
});
afterEach(()=>wrapper.unmount());
async function login(){await wrapper.get('input[type=email]').setValue('fixture@example.invalid');await wrapper.get('input[type=password]').setValue('test password');await wrapper.get('form').trigger('submit');await flushPromises();}
describe('Personal vault interactions',()=>{
  it('clears the password field after login and hides vault passwords by default',async()=>{
    await login();expect(wrapper.find('input[type=password]').exists()).toBe(false);
    await wrapper.get('.item-row').trigger('click');expect(wrapper.text()).not.toContain(item.password);
    const show=wrapper.findAll('button').find(b=>b.text()==='显示');await show.trigger('click');expect(wrapper.text()).toContain(item.password);
  });
  it('opens an existing reactive cipher for editing and preserves original metadata',async()=>{
    await login();await wrapper.get('.item-row').trigger('click');await wrapper.findAll('button').find(b=>b.text()==='编辑项目').trigger('click');await flushPromises();
    expect(wrapper.get('dialog').element.open).toBe(true);
    await wrapper.get('dialog input').setValue('Changed');await wrapper.get('dialog form').trigger('submit');await flushPromises();
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({name:'Changed'}),expect.objectContaining({id:'one',revisionDate:'revision'}));
    expect(wrapper.get('dialog').element.open).toBe(false);
  });
  it('searches without sending plaintext to the server',async()=>{
    await login();await wrapper.get('input[type=search]').setValue('not-found');expect(wrapper.findAll('.item-row')).toHaveLength(0);expect(api.sync).not.toHaveBeenCalled();
  });
  it('moves a cipher to recoverable trash',async()=>{
    await login();await wrapper.get('.item-row').trigger('click');await wrapper.findAll('button').find(b=>b.text()==='移入回收站').trigger('click');await flushPromises();expect(api.trash).toHaveBeenCalledWith('one');
  });
  it('renders malicious names as text and rejects javascript links',async()=>{
    api.login.mockResolvedValue({items:[{...item,name:'<img src=x onerror=alert(1)>',uris:['javascript:alert(1)']}],unreadable:0});
    await login();await wrapper.get('.item-row').trigger('click');expect(wrapper.find('img').exists()).toBe(false);expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false);
  });
  it('does not register when password confirmation differs',async()=>{
    await wrapper.findAll('button').find(b=>b.text()==='激活账号').trigger('click');
    await wrapper.get('input[type=email]').setValue('fixture@example.invalid');const fields=wrapper.findAll('input[type=password]');await fields[0].setValue('a long test passphrase');await fields[1].setValue('different long passphrase');await wrapper.get('form').trigger('submit');await flushPromises();expect(api.register).not.toHaveBeenCalled();expect(wrapper.text()).toContain('两次输入');
  });
});
