// Called by the agent with its connected browser. Only the download triggered in
// this fresh, task-specific tab can become an original for subsequent reuse.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createReadStream} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const exec = promisify(execFile);
const historyReader = fileURLToPath(new URL('./chrome_export.py',import.meta.url));

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function readReceipt(directory) {
  try {
    return JSON.parse(await fs.readFile(path.join(directory,'receipt.json'),'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

async function waitForVisible(locator, timeout) {
  const deadline = Date.now()+timeout;
  while (Date.now()<deadline) {
    if (await locator.isVisible().catch(()=>false)) return;
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  throw new Error('官网未显示预期的任务卡或导出控件');
}

async function downloadFromTab(tab, confirm, ticket) {
  // Some connected Chrome versions save blobs but do not deliver Playwright's event.
  const event = tab.playwright.waitForEvent('download',{timeoutMs:12000})
    .then(d=>d.path({timeoutMs:120000})).catch(()=>null);
  await confirm.click();
  const deadline = Date.now()+120000;
  let eventPath;
  event.then(p=>{eventPath=p;});
  while (Date.now() < deadline) {
    if (eventPath) return eventPath;
    const {stdout} = await exec('python3',[historyReader,ticket]);
    const recorded = JSON.parse(stdout);
    if (recorded) return recorded;
    await new Promise(resolve=>setTimeout(resolve,700));
  }
  throw new Error('官网导出未取得本次下载的完成回执，请重新打开原任务导出');
}

export async function captureExport(createTab, projectDirectory, {key, task} = {}) {
  const state = JSON.parse(await fs.readFile(path.join(projectDirectory,'run.json'),'utf8'));
  const job = key ? state.jobs[key] : Object.values(state.jobs).find(j=>j.route==='web' && j.task_id===task);
  if (key && (!job || job.route !== 'web' || !['submitted','ready'].includes(job.status))) {
    throw new Error('请先在该作品中登记官网任务');
  }
  const id = key ? job.task_id : task;
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id || '')) throw new Error('需要工作区任务卡对应的资产 ID');
  const reference = job?.input || null;
  const archive = path.join(path.dirname(path.resolve(projectDirectory)),'.hi3d-exports');
  await fs.mkdir(archive,{recursive:true});
  const target = path.join(archive,id);
  const previous = await readReceipt(target);
  if (previous && (!reference || !previous.reference_sha256 || previous.reference_sha256 === reference)) {
    if (previous.task !== id || await sha256(path.join(target,'original.glb')) !== previous.sha256) {
      throw new Error('官网原件归档校验失败');
    }
    return previous;
  }
  if (previous) throw new Error('已有官网回执，参考图记录不匹配');
  const stage = await fs.mkdtemp(path.join(archive,'.capture-'));
  const ticket = crypto.randomUUID();
  let tab;
  try {
    const url = 'https://www.hi3d.ai/zh/workspace?panel=generate-3d&backside_export='+ticket;
    tab = await createTab(url);
    const ui = tab.playwright;
    const image = 'img[alt="3D 模型缩略图"][src*="/'+id+'/target/"]';
    const card = ui.locator(image);
    await waitForVisible(card,60000);
    await card.click();
    const selected = ui.locator('button.model-history__card.is-active '+image);
    await waitForVisible(selected,30000);
    const download = ui.getByRole('button',{name:'下载',exact:true});
    const menu = ui.getByRole('menu');
    const format = menu.getByRole('button',{name:'导出格式'});
    await waitForVisible(download,120000);
    try { await download.click({timeoutMs:15000}); }
    catch (error) {
      if (!await format.isVisible()) await download.click({timeoutMs:15000});
    }
    if (!(await format.innerText({timeoutMs:10000})).includes('GLB')) {
      await format.click();
      await ui.getByText('GLB',{exact:true}).click();
    }
    const workspace = new URL(await tab.url());
    if (workspace.origin !== 'https://www.hi3d.ai' || workspace.pathname !== '/zh/workspace'
        || workspace.searchParams.get('backside_export') !== ticket) {
      throw new Error('请在本次导出的 Hi3D 官网标签页完成下载');
    }
    if (!(await format.innerText({timeoutMs:10000})).includes('GLB')
        || !await selected.isVisible()) throw new Error('导出前请核对选中的任务和 GLB 格式');
    const file = await downloadFromTab(tab, menu.getByRole('button',{name:'下载',exact:true}),ticket);
    if (!await selected.isVisible()) throw new Error('导出时选中的官网任务发生变化');
    const original = path.join(stage,'original.glb');
    await fs.copyFile(file,original);
    const fd = await fs.open(original);
    try {
      const header = Buffer.alloc(12);
      await fd.read(header,0,12,0);
      if (header.toString('ascii',0,4)!=='glTF' || header.readUInt32LE(4)!==2 ||
          header.readUInt32LE(8)!==(await fd.stat()).size) throw new Error('官网导出文件不是完整的 GLB');
    } finally { await fd.close(); }
    const receipt = {method:'hi3d-workspace-download',task:id,reference_sha256:reference,
      sha256:await sha256(original),exported_at:new Date().toISOString()};
    await fs.writeFile(path.join(stage,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    try { await fs.rename(stage,target); }
    catch (error) {
      if (!['ENOTEMPTY','EEXIST'].includes(error.code)) throw error;
      const winner = await readReceipt(target);
      if (!winner || winner.sha256 !== receipt.sha256 || winner.reference_sha256 !== reference) throw error;
      return winner;
    }
    return receipt;
  } finally {
    if (tab) await tab.close();
    await fs.rm(stage,{recursive:true,force:true});
  }
}
