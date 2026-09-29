import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { normalizeGovernedAction,selectGovernedWidgetResult } from '../apps-sdk/ui/src/components/governed-action/governed-action-model.ts';
import { normalizeGovernedAssetResult,buildGovernedAssetToolResult } from '../lib/governed-asset-result.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/token-api-contract.json',import.meta.url),'utf8'));
const example=name=>structuredClone(f.cases.find(c=>c.name===name));
const cases=['buy-prepared','buy-setup-status','buy-token_trading_setup_pending','buy-confirmed-success-execute','sell-finalized-success-status'];
for(const name of cases)test(`token widget preserves actual result: ${name}`,()=>{
  const c=example(name),tool=buildGovernedAssetToolResult(normalizeGovernedAssetResult(c));
  const m=normalizeGovernedAction(selectGovernedWidgetResult(tool.structuredContent,tool._meta),c.input);
  const successful=c.body.executed===true||c.body.executionSucceeded===true;
  assert.equal(m.stage,successful?'success':name==='buy-prepared'?'prepared':'pending');
  if(successful){
    assert.equal(m.actualTokenAmounts.credit.amount,c.body.receiptOutcome.credit.amount);
    assert.equal(m.fees.networkFeeLamports,c.body.receiptOutcome.fees.networkFee.amountLamports);
    assert.equal(m.recovery.kind,'none');
    assert.doesNotMatch(m.headline,/\$5/,'quote budget cannot become a claimed actual debit');
  }else if(name!=='buy-prepared'){
    assert.equal(m.needsStatusCheck,false);assert.equal(m.recovery.kind,'same-request');
    assert.match(m.supporting,/not been submitted/);
  }
});
for(const change of [b=>{b.receiptOutcome.credit.amount='99';},b=>{b.tradeSummary.mint='So11111111111111111111111111111111111111112';},
  b=>{b.receiptOutcome.transactionSignature='3'.repeat(88);},b=>{b.receiptOutcome=null;}])test('widget rejects inconsistent token receipt despite a successful presentation',()=>{
  const c=example('buy-confirmed-success-execute');change(c.body);c.body.presentation={summary:'Purchase confirmed.'};
  assert.notEqual(normalizeGovernedAction(c.body,c.input).stage,'success');
});
for(const mutate of [b=>{delete b.preview;},b=>{b.preview=null;},b=>{delete b.preview.productIdentity;}])test('malformed prepared token metadata does not crash the browser model',()=>{
  const c=example('buy-prepared');mutate(c.body);
  let model;assert.doesNotThrow(()=>{model=normalizeGovernedAction(c.body,c.input);});
  assert.notEqual(model.stage,'success');assert.notEqual(model.recovery.kind,'same-request');
});
test('token cards render on desktop and mobile without starting any action',async t=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const server=await createServer({root:path.join(root,'apps-sdk/ui'),configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0},logLevel:'error'});
  await server.listen();t.after(()=>server.close());
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/opt/google/chrome/chrome'});
  t.after(()=>browser.close());
  const shots=process.env.TOKEN_WIDGET_SCREENSHOTS;if(shots)mkdirSync(shots,{recursive:true});
  for(const viewport of [{width:390,height:844},{width:1280,height:900}])for(const name of cases){
    const c=example(name),tool=buildGovernedAssetToolResult(normalizeGovernedAssetResult(c));
    const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({output,metadata,input})=>{
      window.__tokenCalls=[];
      window.openai={theme:'light',locale:'en-US',displayMode:'inline',maxHeight:900,toolInput:input,toolOutput:output,toolResponseMetadata:metadata,
        userAgent:{device:{type:innerWidth<520?'mobile':'desktop'}},safeArea:{insets:{top:0,right:0,bottom:0,left:0}},notifyIntrinsicHeight(){},
        async callTool(...args){window.__tokenCalls.push(args);}};
    },{output:tool.structuredContent,metadata:tool._meta??{},input:c.input});
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/governed-action.html`);
    const successful=c.body.executed===true||c.body.executionSucceeded===true;
    const stage=successful?'success':name==='buy-prepared'?'prepared':'pending';
    const card=page.locator(`.dx-action[data-stage="${stage}"]`);await card.waitFor();
    const text=await card.innerText();
    if(successful){assert.match(text,/Received/);assert.match(text,/1.9/);assert.doesNotMatch(text,/awaiting confirmation|Outcome unknown/);
      await page.getByText('Recorded fees',{exact:true}).click();
      const feeText=await card.innerText();assert.match(feeText,/0.0075 USDC/);assert.match(feeText,/0.000005 SOL/);
    }
    else if(stage==='pending'){assert.match(text,/Token trading setup is pending/);assert.doesNotMatch(text,/Read this same intent|awaiting confirmation|execution outcome remains open|Unproven/);}
    assert.deepEqual(errors,[],name);assert.deepEqual(await page.evaluate(()=>window.__tokenCalls),[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,name);
    if(shots)await page.screenshot({path:path.join(shots,`${name}-${viewport.width}.png`),fullPage:true});
    await page.close();
  }
});
