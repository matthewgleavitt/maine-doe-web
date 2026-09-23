const {chromium}=require(require('path').join(process.env.HOME,'Documents/Claude/node_modules/playwright'));
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1200}});
  await p.goto('file:///tmp/probe-pl.html');
  await p.waitForTimeout(600);
  const r=await p.evaluate(()=>{
    const img=document.querySelector('img.doe-img-left[src*="WIDA"]');
    const rc=e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),bot:Math.round(b.bottom)};};
    const cs=getComputedStyle(img);
    const btn=[...document.querySelectorAll('a.btn')].find(a=>/Core Learning Collection/.test(a.textContent));
    return {
      img:{...rc(img), mb:cs.marginBottom, mr:cs.marginRight, maxw:cs.maxWidth, marginBottomEdge: Math.round(img.getBoundingClientRect().bottom+parseFloat(cs.marginBottom))},
      btn: btn?{...rc(btn), cls:btn.className, disp:getComputedStyle(btn).display}:null,
      btnP: btn?{...rc(btn.parentElement), cls:btn.parentElement.className}:null,
      lastProse: rc([...document.querySelectorAll('#block-doe-content p')].filter(e=>/Offerings are available/.test(e.textContent))[0])
    };
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
