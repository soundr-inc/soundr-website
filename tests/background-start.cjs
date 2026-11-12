const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})) {
  const browser=await engine.launch();
  try {
   for(const motion of ['no-preference','reduce']) {
    const page=await browser.newPage({reducedMotion:motion,viewport:{width:1440,height:900}});
    await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
    await page.goto('https://preview.test/');
    const samples=await page.locator('.bg-node').evaluateAll(nodes=>nodes.map(node=>{
     const animation=node.getAnimations()[0];
     const values=[0,500,1400,2800,4200,7700].map(time=>{if(animation){animation.pause();animation.currentTime=time;}return +getComputedStyle(node).opacity;});
     return {values,delay:animation?.effect.getTiming().delay || 0};
    }));
    assert.equal(samples.length,4);
    for(const sample of samples) {
     assert(Math.abs(sample.values[0]-.25)<.01,`${name}/${motion}: first-paint opacity must be .25, got ${sample.values[0]}`);
     if(motion==='no-preference' && sample.delay>500) assert(Math.abs(sample.values[1]-.25)<.01,'Delayed dots must not flash before animation');
     if(motion==='reduce') assert(sample.values.every(value=>Math.abs(value-.25)<.01),'Reduced-motion dots must remain steady');
    }
    if(motion==='no-preference') assert(samples.some(sample=>sample.values.some(value=>value>.3)),'Subtle pulse retained');
    console.log(`PASS ${name}/${motion}: four grey dots start dim with no delay flash; artwork preserved`);
    await page.close();
   }
  } finally {await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
