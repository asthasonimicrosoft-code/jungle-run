(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const distanceEl = document.getElementById('distance');
  const coinsEl = document.getElementById('coins');
  const bestEl = document.getElementById('best');
  const finalDistance = document.getElementById('finalDistance');
  const finalCoins = document.getElementById('finalCoins');
  const toast = document.getElementById('toast');

  let W = 0, H = 0, dpr = 1;
  let running = false, lastTime = 0, distance = 0, coins = 0, best = 0;
  let speed = 0.34, world = 0, lane = 0, laneTarget = 0, jump = 0, slide = 0;
  let obstacles = [], pickups = [], particles = [], spawnTimer = 0, coinTimer = 0;
  let soundOn = false;

  try { best = Number(localStorage.getItem('jungleDashBest') || 0); } catch (e) {}
  bestEl.textContent = `${best} m`;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const horizon = () => H * 0.31;
  const playerY = () => H * 0.78;

  function project(z, laneValue = 0) {
    const t = Math.max(0, Math.min(1.15, z));
    const y = horizon() + Math.pow(t, 1.72) * (H * 0.73);
    const roadHalf = lerp(W * 0.055, W * 0.48, Math.pow(t, 1.12));
    const x = W / 2 + laneValue * roadHalf * 0.61;
    const scale = 0.12 + t * 1.42;
    return { x, y, roadHalf, scale };
  }

  function polygon(points, fill, stroke) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#85b7a2'); sky.addColorStop(.3, '#d1c69a'); sky.addColorStop(.52, '#547b4f'); sky.addColorStop(1, '#102b20');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // Sun glow
    const sun = ctx.createRadialGradient(W * .68, H * .22, 3, W * .68, H * .22, W * .25);
    sun.addColorStop(0, 'rgba(255,230,151,.75)'); sun.addColorStop(1, 'rgba(255,230,151,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H * .6);
    // Distant jungle ridges
    polygon([[0,H*.38],[W*.08,H*.29],[W*.18,H*.35],[W*.3,H*.26],[W*.43,H*.36],[W*.57,H*.28],[W*.7,H*.34],[W*.84,H*.25],[W,H*.34],[W,H*.58],[0,H*.58]], '#426b4c');
    polygon([[0,H*.43],[W*.13,H*.34],[W*.25,H*.4],[W*.37,H*.32],[W*.52,H*.42],[W*.66,H*.34],[W*.83,H*.4],[W,H*.32],[W,H*.61],[0,H*.61]], '#31583f');
    // Trees on both sides, with perspective
    for (let i = 0; i < 18; i++) {
      const z = ((i / 18 + world * .08) % 1);
      const y = horizon() + Math.pow(z, 1.55) * H * .69;
      const size = 12 + z * Math.min(W, H) * .22;
      const leftX = W * (.03 + z * .25);
      const rightX = W - leftX;
      drawTree(leftX, y, size, z);
      drawTree(rightX, y, size, z);
    }
    // Road
    const top = horizon(), bottom = H * 1.12;
    polygon([[W*.48,top],[W*.52,top],[W*.99,bottom],[W*.01,bottom]], '#655c42');
    polygon([[W*.49,top],[W*.51,top],[W*.88,bottom],[W*.12,bottom]], '#76684a');
    // Road edge strips
    polygon([[W*.477,top],[W*.486,top],[W*.13,bottom],[W*.075,bottom]], '#d8b65f');
    polygon([[W*.514,top],[W*.523,top],[W*.925,bottom],[W*.87,bottom]], '#d8b65f');
    // Perspective lane markers
    for (let i = 0; i < 12; i++) {
      const z = ((i / 12 + world * .9) % 1);
      const p = project(z);
      const y2 = p.y + 8 + z * 28;
      const width = 1 + z * 4;
      for (const n of [-1, 1]) {
        const x = W/2 + n * p.roadHalf * .205;
        ctx.fillStyle = `rgba(246,224,157,${.25 + z*.4})`;
        ctx.fillRect(x - width/2, p.y, width, Math.max(2, y2-p.y));
      }
    }
    // Jungle floor texture streaks
    for (let i = 0; i < 24; i++) {
      const z = ((i / 24 + world * .65) % 1);
      const y = horizon() + Math.pow(z, 1.65) * H * .72;
      const x = (i * 173 % W);
      ctx.strokeStyle = `rgba(189,190,108,${z*.16})`; ctx.lineWidth = 1 + z*2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (i%2?1:-1) * z * 24, y + z*9); ctx.stroke();
    }
  }

  function drawTree(x, y, size, depth) {
    const trunkW = size * .14;
    ctx.fillStyle = '#453c2c'; ctx.fillRect(x-trunkW/2, y-size*.55, trunkW, size*.65);
    const shades = ['#183f2d','#245238','#32633d'];
    polygon([[x,y-size*1.65],[x-size*.65,y-size*.55],[x-size*.35,y-size*.68],[x-size*.85,y-size*.12],[x+size*.85,y-size*.12],[x+size*.35,y-size*.68],[x+size*.65,y-size*.55]], shades[Math.floor(depth*3)%3]);
    ctx.fillStyle = 'rgba(151,177,91,.22)';
    polygon([[x,y-size*1.58],[x+size*.15,y-size*.8],[x+size*.5,y-size*.22],[x+size*.1,y-size*.22]]);
  }

  function drawCoin(x, y, scale, spin) {
    const r = 10 * scale;
    ctx.save(); ctx.translate(x,y); ctx.scale(Math.max(.18, Math.abs(Math.cos(spin))), 1);
    ctx.shadowColor = '#ffcb46'; ctx.shadowBlur = 12*scale;
    ctx.fillStyle = '#e7a629'; ctx.beginPath(); ctx.ellipse(0,0,r*1.05,r*1.35,0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#fff0a1'; ctx.lineWidth = Math.max(1,scale*2); ctx.stroke();
    ctx.fillStyle = '#fff0a1'; ctx.font = `bold ${Math.max(7, 12*scale)}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('✦',0,0);
    ctx.restore();
  }

  function drawObstacle(o) {
    const p = project(o.z, o.lane), s = p.scale;
    if (o.type === 'log') {
      const w = 47*s, h = 24*s;
      ctx.save(); ctx.translate(p.x,p.y);
      ctx.fillStyle = '#3a281b'; ctx.fillRect(-w/2, -h, w, h);
      ctx.fillStyle = '#9b6537'; ctx.fillRect(-w/2, -h, w, h*.58);
      ctx.fillStyle = '#d0a05a'; ctx.beginPath(); ctx.ellipse(-w/2,-h*.7, h*.42,h*.48,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#5b3b24'; ctx.lineWidth = Math.max(1,s*2);
      for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*w*.18,-h);ctx.lineTo(i*w*.18+4*s,0);ctx.stroke();}
      ctx.restore();
    } else if (o.type === 'gate') {
      const w = 48*s, h = 61*s;
      ctx.save(); ctx.translate(p.x,p.y);
      ctx.fillStyle = '#4c3523'; ctx.fillRect(-w/2,-h,w*.18,h); ctx.fillRect(w*.32,-h,w*.18,h);
      ctx.fillStyle = '#b86e32'; ctx.fillRect(-w/2,-h,w,h*.25);
      ctx.fillStyle = '#f1c66d'; ctx.fillRect(-w/2,-h,w,h*.08);
      ctx.restore();
    } else {
      const w = 48*s, h = 34*s;
      ctx.save(); ctx.translate(p.x,p.y);
      polygon([[-w/2,0],[-w*.32,-h*.65],[-w*.1,-h*.95],[w*.13,-h*.7],[w*.3,-h*.95],[w/2,0]], '#4b5d47', '#8ca16e');
      ctx.fillStyle='#9fb27a'; ctx.fillRect(-w*.28,-h*.18,w*.56,h*.08);
      ctx.restore();
    }
    // soft shadow
    ctx.fillStyle = `rgba(0,0,0,${.12 + o.z*.2})`;
    ctx.beginPath(); ctx.ellipse(p.x,p.y+3*s,18*s,4*s,0,0,Math.PI*2); ctx.fill();
  }

  function drawPlayer() {
    const baseY = playerY();
    const px = W/2 + lane * W*.19;
    const lift = jump > 0 ? Math.sin((1-jump) * Math.PI) * H*.17 : 0;
    const py = baseY - lift;
    const size = Math.min(W,H) * .075;
    // shadow
    ctx.fillStyle = `rgba(0,0,0,${.28-jump*.13})`;
    ctx.beginPath(); ctx.ellipse(px,baseY+size*.28,size*.48,size*.13,0,0,Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(px,py);
    if (slide > 0) {
      ctx.rotate(-.15);
      ctx.fillStyle='#172a28'; roundRect(ctx,-size*.46,-size*.08,size*.9,size*.32,size*.12); ctx.fill();
      ctx.fillStyle='#d88d43'; ctx.beginPath(); ctx.arc(size*.42,-size*.04,size*.18,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#f0c18a'; ctx.fillRect(-size*.38,size*.15,size*.45,size*.1); ctx.fillRect(size*.05,size*.15,size*.4,size*.1);
    } else {
      const swing = running ? Math.sin(world*18)*size*.12 : 0;
      // legs
      ctx.strokeStyle='#172b27'; ctx.lineWidth=size*.19; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-size*.12,size*.1); ctx.lineTo(-size*.18+swing,size*.48); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(size*.12,size*.1); ctx.lineTo(size*.22-swing,size*.47); ctx.stroke();
      ctx.strokeStyle='#c98340'; ctx.lineWidth=size*.2;
      ctx.beginPath(); ctx.moveTo(-size*.19,size*.46); ctx.lineTo(-size*.32+swing,size*.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(size*.22,size*.46); ctx.lineTo(size*.35-swing,size*.5); ctx.stroke();
      // torso
      ctx.fillStyle='#1d4840'; roundRect(ctx,-size*.27,-size*.22,size*.54,size*.47,size*.13); ctx.fill();
      ctx.fillStyle='#d6a14d'; ctx.fillRect(-size*.26,-size*.18,size*.52,size*.09);
      // arms
      ctx.strokeStyle='#d88d43'; ctx.lineWidth=size*.13;
      ctx.beginPath(); ctx.moveTo(-size*.24,-size*.12); ctx.lineTo(-size*.42+swing,-size*.0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(size*.24,-size*.12); ctx.lineTo(size*.4-swing,-size*.25); ctx.stroke();
      // head + hair/headband
      ctx.fillStyle='#d99652'; ctx.beginPath(); ctx.arc(0,-size*.4,size*.21,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#34281f'; ctx.beginPath(); ctx.arc(0,-size*.45,size*.22,Math.PI,Math.PI*2); ctx.fill();
      ctx.fillStyle='#f3c75f'; ctx.fillRect(-size*.21,-size*.43,size*.42,size*.055);
      // small backpack
      ctx.fillStyle='#bd6831'; roundRect(ctx,size*.19,-size*.18,size*.17,size*.27,size*.05); ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
  }

  function spawnObstacle() {
    const types = ['log','gate','rock'];
    const lanePick = Math.floor(rand(-1.49, 1.5));
    obstacles.push({ lane: Math.max(-1,Math.min(1,lanePick)), z: .02, type: types[Math.floor(rand(0,types.length))], passed:false });
  }
  function spawnCoins() {
    const lanePick = Math.floor(rand(-1.49, 1.5));
    for (let i=0;i<5;i++) pickups.push({ lane: Math.max(-1,Math.min(1,lanePick)), z: .08-i*.095, spin: rand(0,6) });
  }
  function resetGame() {
    distance=0; coins=0; speed=.34; world=0; lane=0; laneTarget=0; jump=0; slide=0;
    obstacles=[]; pickups=[]; particles=[]; spawnTimer=.7; coinTimer=1.1; lastTime=0;
    updateHud();
  }
  function startGame() {
    resetGame(); running=true; startScreen.classList.add('hidden'); gameOverScreen.classList.add('hidden');
    toast.textContent='GO! GO! GO!'; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),1000);
    requestAnimationFrame(loop);
  }
  function endGame() {
    running=false; finalDistance.textContent=`${Math.floor(distance)} m`; finalCoins.textContent=coins;
    if (distance > best) { best=Math.floor(distance); try{localStorage.setItem('jungleDashBest',best);}catch(e){} }
    bestEl.textContent=`${best} m`; gameOverScreen.classList.remove('hidden');
  }
  function updateHud() {
    distanceEl.textContent=`${Math.floor(distance)} m`; coinsEl.textContent=coins; bestEl.textContent=`${best} m`;
  }
  function move(dir) { if (!running) return; laneTarget=Math.max(-1,Math.min(1,laneTarget+dir)); }
  function doJump() { if (running && jump<=0 && slide<=0) jump=1; }
  function doSlide() { if (running && jump<=0) slide=.72; }

  function action(name) {
    if (name==='left') move(-1); if (name==='right') move(1);
    if (name==='jump') doJump(); if (name==='slide') doSlide();
  }
  window.addEventListener('keydown', e => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','a','d','w','s'].includes(e.key)) e.preventDefault();
    if (e.key==='ArrowLeft'||e.key==='a'||e.key==='A') action('left');
    if (e.key==='ArrowRight'||e.key==='d'||e.key==='D') action('right');
    if (e.key==='ArrowUp'||e.key==='w'||e.key==='W'||e.key===' ') action('jump');
    if (e.key==='ArrowDown'||e.key==='s'||e.key==='S') action('slide');
    if (!running && (e.key==='Enter'||e.key===' ')) startGame();
  });
  document.querySelectorAll('.mobile-controls button').forEach(btn => btn.addEventListener('click',()=>action(btn.dataset.action)));
  let touchStart = null;
  canvas.addEventListener('touchstart', e => { const t=e.changedTouches[0]; touchStart=[t.clientX,t.clientY]; }, {passive:true});
  canvas.addEventListener('touchend', e => {
    if (!touchStart || !running) return;
    const t=e.changedTouches[0], dx=t.clientX-touchStart[0], dy=t.clientY-touchStart[1];
    if (Math.max(Math.abs(dx),Math.abs(dy))>25) {
      if (Math.abs(dx)>Math.abs(dy)) action(dx>0?'right':'left'); else action(dy<0?'jump':'slide');
    }
    touchStart=null;
  }, {passive:true});

  document.getElementById('startBtn').addEventListener('click',startGame);
  document.getElementById('restartBtn').addEventListener('click',startGame);
  document.getElementById('soundBtn').addEventListener('click', e => {
    soundOn=!soundOn; e.currentTarget.textContent=soundOn?'♫':'♪';
    showToast(soundOn?'SOUND ENABLED':'SOUND MUTED');
  });
  function showToast(msg) { toast.textContent=msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),900); }

  function update(dt) {
    speed=Math.min(.66,speed+dt*.0025); world+=dt*speed; distance+=dt*(speed*22);
    lane=lerp(lane,laneTarget,Math.min(1,dt*12));
    if (jump>0) jump=Math.max(0,jump-dt*1.65);
    if (slide>0) slide=Math.max(0,slide-dt*1.8);
    spawnTimer-=dt; coinTimer-=dt;
    if(spawnTimer<=0){spawnObstacle();spawnTimer=rand(.8,1.35)*(0.42/speed);}
    if(coinTimer<=0){spawnCoins();coinTimer=rand(1.2,2.1);}
    obstacles.forEach(o=>{o.z+=dt*speed; if(!o.passed && o.z>.87 && o.z<1.04){
      if(Math.abs(lane-o.lane)<.48){
        const avoided=(o.type==='log'&&jump>.2)||(o.type==='gate'&&slide>.2);
        if(!avoided){endGame();} else {o.passed=true;}
      }
    } if(o.z>1.16)o.passed=true;});
    obstacles=obstacles.filter(o=>o.z<1.18);
    pickups.forEach(c=>{c.z+=dt*speed;c.spin+=dt*9;if(!c.got&&c.z>.83&&c.z<1.04&&Math.abs(lane-c.lane)<.5){c.got=true;coins++;for(let i=0;i<7;i++)particles.push({x:W/2+lane*W*.19,y:playerY()-30,vx:rand(-60,60),vy:rand(-100,-20),life:.6});}});
    pickups=pickups.filter(c=>c.z<1.13&&!c.got);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;p.life-=dt;}); particles=particles.filter(p=>p.life>0);
    updateHud();
  }

  function render() {
    drawBackground();
    // Objects far to near
    const things=[...obstacles.map(o=>({z:o.z,kind:'o',obj:o})),...pickups.map(c=>({z:c.z,kind:'c',obj:c}))].sort((a,b)=>a.z-b.z);
    things.forEach(t=>{const p=project(t.obj.z,t.obj.lane); if(t.kind==='o')drawObstacle(t.obj);else drawCoin(p.x,p.y-15*p.scale, p.scale,t.obj.spin);});
    drawPlayer();
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/.6);ctx.fillStyle='#ffd35f';ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});
    // vignette
    const v=ctx.createRadialGradient(W/2,H*.48,Math.min(W,H)*.22,W/2,H*.48,Math.max(W,H)*.72);
    v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(1,12,8,.43)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
  }

  function loop(time) {
    if(!running){render();return;}
    const dt=Math.min(.04,(time-(lastTime||time))/1000);lastTime=time;
    update(dt);render();
    if(running)requestAnimationFrame(loop);else render();
  }

  // Animated attract screen
  function idleLoop(time) {
    if (!running) { world+=.0018; render(); }
    requestAnimationFrame(idleLoop);
  }
  obstacles=[]; pickups=[]; render(); requestAnimationFrame(idleLoop);
})();