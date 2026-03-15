// ========== External libs ==========
const chartScript = document.createElement('script');
chartScript.src = "https://cdn.jsdelivr.net/npm/chart.js";
document.head.appendChild(chartScript);

const papaScript = document.createElement('script');
papaScript.src = "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js";
document.head.appendChild(papaScript);

const leafletCss = document.createElement('link');
leafletCss.rel = 'stylesheet';
leafletCss.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
document.head.appendChild(leafletCss);
const leafletScript = document.createElement('script');
leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
document.head.appendChild(leafletScript);

// --- Force light UI (iOS dark mode safe) ---
const forceLightCSS = document.createElement('style');
forceLightCSS.textContent = `
  :root { color-scheme: light; }
  /* generic */
  .ui-card { background:#fff !important; color:#111 !important; border:1px solid #e6e6e6 !important; }
  .ui-btn, .ui-input, .ui-select {
    -webkit-appearance:none; appearance:none;
    background:#fff !important; color:#111 !important; border:1px solid #bbb !important;
  }
  #chartContainer,
  #chartContainer * {
    pointer-events:auto !important;
  }
  /* hard-force text to black in our widgets (iOS may tint) */
  #chartContainer, #chartContainer * ,
  #miniTopRight, #miniTopRight * ,
  #compass, #compass * ,
  .ui-modal, .ui-modal * {
    color:#111 !important;
    -webkit-text-fill-color:#111 !important;
    text-shadow:none !important;
  }
  /* white background for selects in iOS */
  select { background-color:#fff !important; }
`;
document.head.appendChild(forceLightCSS);

Promise.all([
  new Promise(r=>chartScript.onload=r),
  new Promise(r=>papaScript.onload=r),
  new Promise(r=>leafletScript.onload=r),
]).then(()=>{
  // ===== Safari-safe WebGL probe =====
  function webglOK(){
    try{
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
    }catch(e){ return false; }
  }
  function showFatal(msg){
    var d = document.createElement('div');
    d.style.cssText = "position:fixed;inset:0;background:#fff;display:flex;align-items:center;justify-content:center;font:14px/1.6 system-ui,sans-serif;color:#111;z-index:999999;padding:24px;text-align:center";
    d.innerHTML = '<div style="max-width:520px"><div style="font-weight:700;margin-bottom:8px">Can’t start WebGL</div><div>'+msg+'</div></div>';
    document.body.appendChild(d);
  }
  if (!webglOK()){
    showFatal('Safari WebGL غیرفعال است یا در این حالت قابل استفاده نیست. لطفاً WebGL را فعال کنید یا صفحه را در حالت معمولی باز کنید.');
    return;
  }

  // ========== Environment flags ==========
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    || (window.innerWidth <= 640);

  // ========== Cesium Viewer ==========
  // IMPORTANT:
  // 1) Cesium.Ion.defaultAccessToken must be set in index.html BEFORE this file loads.
  // 2) We force a visible globe + imagery fallback so the app never shows black/star-only background.
  let viewer;
  try {
    viewer = new Cesium.Viewer("cesiumContainer", {
      timeline: false,
      animation: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      geocoder: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      shouldAnimate: true,

      // Always provide visible imagery so the background is never empty.
      imageryProvider: new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/'
      }),

      // Use terrain when possible; if token/terrain fails, Cesium still renders globe.
      terrainProvider: Cesium.createWorldTerrain(),

      contextOptions: {
        webgl: {
          powerPreference: 'low-power',
          antialias: false,
          alpha: false,
          depth: true,
          stencil: false,
          preserveDrawingBuffer: false
        }
      },

      useBrowserRecommendedResolution: IS_IOS ? true : false,
      msaaSamples: IS_IOS ? 2 : 4,
    });
  } catch (e) {
    // Final fallback: no terrain, but still render a normal globe + map.
    viewer = new Cesium.Viewer("cesiumContainer", {
      timeline: false,
      animation: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      geocoder: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      shouldAnimate: true,
      imageryProvider: new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/'
      }),
      contextOptions: {
        webgl: {
          powerPreference: 'low-power',
          antialias: false,
          alpha: false,
          depth: true,
          stencil: false,
          preserveDrawingBuffer: false
        }
      },
      useBrowserRecommendedResolution: IS_IOS ? true : false,
      msaaSamples: IS_IOS ? 2 : 4,
    });
  }

  viewer.scene.globe.show = true;
  viewer.scene.skyBox.show = false;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#cfe8ff');
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.globe.depthTestAgainstTerrain = true;

  // ---- Require WebGL2 (Cesium shaders use WebGL2 features like 'flat') ----
  try{
    if (!viewer.scene.context.webgl2){
      showFatal('WebGL2 روی این دستگاه/مرورگر فعال نیست (یا Hardware Acceleration خاموش است). لطفاً Hardware Acceleration را روشن کنید، مرورگر را ری‌استارت کنید، و دوباره تست بگیرید.');
      return;
    }
  }catch(e){
    showFatal('WebGL2 روی این دستگاه/مرورگر در دسترس نیست. لطفاً Hardware Acceleration را روشن کنید و دوباره تست بگیرید.');
    return;
  }

  // Kick first frames for Safari + requestRenderMode
  try{
    var bootTicks = 12;
    var bootKick = setInterval(function(){
      try{ viewer.scene.requestRender(); }catch(e){}
      if(--bootTicks <= 0) clearInterval(bootKick);
    }, 16);
  }catch(_){ }

  try{ const fxaa = viewer.scene.postProcessStages.fxaa; if (fxaa) fxaa.enabled = true; }catch(e){}

  // current view mode (needed for FOV slider)
  let currentMode = 'exterior';

  // ========== Helpers ==========
  function isProbablyCSV(text){ if(!text) return false; const h=text.trim().slice(0,16); if(h.startsWith('<'))return false; const lines=text.split('\n'); return lines.length>0 && lines[0].includes(','); }
  async function fetchCSV(url){ const res=await fetch(url,{cache:'no-store'}); const txt=res.text(); const ct=res.headers.get('content-type')||''; if(!isProbablyCSV(await txt)&&!ct.includes('text/csv')) throw new Error('Invalid CSV'); return await txt; }
  function normKey(s){ return (s||'').toString().trim().toLowerCase(); }
  function parseFirstNumber(x){
    if(x==null) return NaN;
    const s = String(x);
    const m = s.match(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/);
    if(!m) return NaN;
    const v = parseFloat(m[0].replace(/,/g,''));
    return Number.isFinite(v)? v : NaN;
  }
  function fmtUSD(n){ const v=Number(n); return Number.isFinite(v) ? ('$'+v.toLocaleString()) : '—'; }
  function toNum(x){
    if(x==null) return NaN;
    const v = parseFloat(String(x).replace(/[$,\u200f,٬\s]/g,''));
    return Number.isFinite(v)? v : NaN;
  }

  // ========== 3D Tiles ==========
  let GOOGLE_3D_TILES=null;
  let desiredMSE = IS_IOS ? 14 : 12;

  // Load Google Photorealistic 3D Tiles only as an enhancement.
  // If it fails, the globe + imagery + terrain still remain visible.
  (async function(){
    try{
      GOOGLE_3D_TILES = await Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
      viewer.scene.primitives.add(GOOGLE_3D_TILES);
      await GOOGLE_3D_TILES.readyPromise;
      GOOGLE_3D_TILES.maximumScreenSpaceError = desiredMSE;
    }catch(e){ console.warn('Google 3D Tiles not loaded:', e); }
  })();

  async function getSurfaceHeight(lon, lat){
    const carto = Cesium.Cartographic.fromDegrees(lon, lat);

    // Prefer Google Photorealistic surface height if available.
    if (GOOGLE_3D_TILES) {
      try {
        await GOOGLE_3D_TILES.readyPromise;
        const h = await Cesium.sampleHeightMostDetailed(GOOGLE_3D_TILES, carto);
        if (Number.isFinite(h)) return h;
      } catch(e){}
    }

    // Fallback to terrain provider.
    try {
      const result = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]);
      const h = result && result[0] ? result[0].height : NaN;
      if (Number.isFinite(h)) return h;
    } catch(e){}

    return 0;
  }

  async function clampDataSourceToSurface(ds){
    if(!ds) return;
    for (var i=0;i<ds.entities.values.length;i++){
      const ent = ds.entities.values[i];
      const props = ent.properties; if(!props) continue;
      const plat = props.baseLat && props.baseLat.getValue ? props.baseLat.getValue() : null;
      const plng = props.baseLng && props.baseLng.getValue ? props.baseLng.getValue() : null;
      const groundOffset = props.groundOffset && props.groundOffset.getValue ? Number(props.groundOffset.getValue()) : 0;
      if(plat==null||plng==null) continue;
      try{
        const h = await getSurfaceHeight(plng, plat);
        const z = (h||0) + groundOffset;
        ent.position = Cesium.Cartesian3.fromDegrees(plng, plat, z);
      }catch(e){}
    }
  }

  async function getBuildingSurfacePosition(lon, lat, heightOffset){
    const surfaceH = await getSurfaceHeight(lon, lat);
    return Cesium.Cartesian3.fromDegrees(lon, lat, surfaceH + (heightOffset || 0));
  }

  function placeWithEnuOffset(lon,lat,h,offE=0,offN=0,offU=0){
    const origin = Cesium.Cartesian3.fromDegrees(lon,lat,h);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
    return Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(offE,offN,offU), new Cesium.Cartesian3());
  }

  // ========== UI (left panel) ==========
  const chartDiv = document.createElement('div');
  chartDiv.id = "chartContainer";
  chartDiv.className = "ui-card";
  chartDiv.style.cssText = `
    position:fixed;
    left:16px;
    top:16px;
    width:360px;
    border-radius:16px;
    box-shadow:0 0 12px rgba(0,0,0,.15);
    z-index:500000;
    padding:16px;
    font-family:sans-serif;
    font-size:15px;
    display:flex;
    flex-direction:column;
    max-height:70vh;
    overflow:auto;
    pointer-events:auto;
  `;
  document.body.appendChild(chartDiv);

  const header = document.createElement('div');
  header.style.cssText = `
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    margin-bottom:8px;
    position:relative;
    z-index:500001;
    pointer-events:auto;
  `;
  chartDiv.appendChild(header);

  const hTitle = document.createElement('div');
  hTitle.textContent = 'Controls';
  hTitle.style.cssText="font-weight:700;font-size:16px";
  header.appendChild(hTitle);

  const collapseBtn = document.createElement('button');
  collapseBtn.type = "button";
  collapseBtn.textContent='▾';
  collapseBtn.title='Collapse/Expand';
  collapseBtn.className = 'ui-btn';
  collapseBtn.style.cssText = `
    width:36px;
    height:36px;
    border-radius:10px;
    cursor:pointer;
    position:relative;
    z-index:500002;
    pointer-events:auto;
    touch-action:manipulation;
  `;
  header.appendChild(collapseBtn);

  const panelBody = document.createElement('div');
  panelBody.style.cssText="display:flex;flex-direction:column;gap:8px";
  chartDiv.appendChild(panelBody);

  let collapsed=false;
  function setCollapsed(c){ collapsed=c; panelBody.style.display=c?'none':'flex'; collapseBtn.textContent=c?'▴':'▾'; }
  collapseBtn.onclick=()=>setCollapsed(!collapsed);

  const selectBox = document.createElement('select');
  selectBox.className = 'ui-select';
  selectBox.style.cssText="width:100%;padding:8px;border-radius:8px";
  panelBody.appendChild(selectBox);

  const viewSelect = document.createElement('select');
  viewSelect.className = 'ui-select';
  viewSelect.style.cssText="width:100%;padding:8px;border-radius:8px";
  panelBody.appendChild(viewSelect);

  const filterRow = document.createElement('div');
  filterRow.style.cssText="display:flex;flex-wrap:wrap;gap:6px";
  panelBody.appendChild(filterRow);

  const title = document.createElement('div');

  // ---- Description block (from Sheets: building.description / unit.description) ----
  const descBox = document.createElement('div');
  descBox.id = "descBox";
  descBox.style.cssText = "font-size:13px;line-height:1.6;color:#333;margin:6px 0 8px;white-space:pre-wrap;";
  panelBody.appendChild(descBox);
  title.style.cssText="font-weight:700;font-size:17px";
  panelBody.appendChild(title);

  const priceCanvas = document.createElement('canvas');
  priceCanvas.width = 310; priceCanvas.height=140;
  panelBody.appendChild(priceCanvas);

  // ===== Mortgage card =====
  const loanCard = document.createElement('div');
  loanCard.className = 'ui-card';
  loanCard.style.cssText="border-radius:12px;padding:10px;display:none";
  loanCard.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
      <div style="font-weight:700">Mortgage Calculator</div>
      <button id="loanToggle" class="ui-btn" style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer">Open</button>
    </div>
    <div id="loanBody" style="display:none;flex-direction:column;gap:8px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <label style="display:flex;flex-direction:column;font-size:13px;">Unit price ($)<input id="loanPrice" class="ui-input" type="number" min="0" step="1000" style="padding:8px;border-radius:8px"></label>
        <label style="display:flex;flex-direction:column;font-size:13px;">Down payment (%)<input id="loanDPct" class="ui-input" type="number" min="0" max="90" value="20" step="1" style="padding:8px;border-radius:8px"></label>
        <label style="display:flex;flex-direction:column;font-size:13px;">Interest rate (% APR)<input id="loanRate" class="ui-input" type="number" min="0" max="50" value="6" step="0.1" style="padding:8px;border-radius:8px"></label>
        <label style="display:flex;flex-direction:column;font-size:13px;">Term (years)
          <select id="loanTerm" class="ui-select" style="padding:8px;border-radius:8px">
            <option>5</option><option>10</option><option>15</option><option>20</option><option>25</option><option>30</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;font-size:13px;">Max DTI (%)<input id="loanDTI" class="ui-input" type="number" min="10" max="60" value="35" step="1" style="padding:8px;border-radius:8px"></label>
        <div></div>
      </div>
      <div id="loanOut" style="font-size:13px;line-height:1.7"></div>
    </div>`;
  panelBody.appendChild(loanCard);
  const loanToggle=loanCard.querySelector('#loanToggle');
  const loanBody=loanCard.querySelector('#loanBody');
  const loanPrice=loanCard.querySelector('#loanPrice');
  const loanDPct=loanCard.querySelector('#loanDPct');
  const loanRate=loanCard.querySelector('#loanRate');
  const loanTerm=loanCard.querySelector('#loanTerm');
  const loanDTI =loanCard.querySelector('#loanDTI');
  const loanOut =loanCard.querySelector('#loanOut');
  let refreshCompareButtons = function(){};
  function setLoanOpen(o){ loanBody.style.display=o?'flex':'none'; loanToggle.textContent=o?'Close':'Open'; }
  setLoanOpen(false);
  function pmt(r,n,pv){ if(r===0) return -(pv/n); return -(pv*r)/(1-Math.pow(1+r,-n)); }
  function recalcLoan(){
    const P = Math.max(0, Number(loanPrice.value||0));
    const dp = Math.min(90, Math.max(0, Number(loanDPct.value||0)));
    const principal = Math.max(0, P - P*dp/100);
    const rate = Math.max(0, Number(loanRate.value||0))/100;
    const termY = Math.max(1, Number(loanTerm.value||20));
    const m = -pmt(rate/12, termY*12, principal);
    const dtiMax = Math.max(10, Number(loanDTI.value||35))/100;
    const reqIncome = principal>0 ? (m*12)/dtiMax : 0;
    loanOut.innerHTML = `Loan amount: <b>${fmtUSD(principal)}</b><br>Monthly payment: <b>${fmtUSD(m)}</b><br>Min annual income (DTI ${Math.round(dtiMax*100)}%): <b>${fmtUSD(reqIncome)}</b>`;
    return {rate, termY, dpct:dp};
  }
  ;[loanPrice,loanDPct,loanRate,loanTerm,loanDTI].forEach(el=>el.addEventListener('input', ()=>{ recalcLoan(); refreshCompareButtons(); }));
  loanToggle.onclick=()=>setLoanOpen(loanBody.style.display==='none');

  // ===== Tooltip for POIs =====
  const tip = document.createElement('div');
  tip.className = 'ui-card';
  tip.style.cssText="position:fixed;display:none;pointer-events:none;transform:translate(-50%,-120%);padding:8px 10px;font-size:12px;z-index:1200;max-width:260px";
  document.body.appendChild(tip);

  // ===== Mouse bindings =====
  const ssc = viewer.scene.screenSpaceCameraController;
  function setExteriorMouseBindings(){
    ssc.enableRotate=true; ssc.enableTranslate=true; ssc.enableTilt=true; ssc.enableLook=false;
    ssc.rotateEventTypes=[Cesium.CameraEventType.LEFT_DRAG, Cesium.CameraEventType.RIGHT_DRAG];
    ssc.translateEventTypes=[Cesium.CameraEventType.MIDDLE_DRAG];
    ssc.tiltEventTypes=[Cesium.CameraEventType.PINCH, Cesium.CameraEventType.MIDDLE_DRAG];
    ssc.lookEventTypes=[];
  }
  function setInteriorMouseBindings(){
    ssc.enableRotate=false; ssc.enableTranslate=false; ssc.enableTilt=false;
    ssc.enableLook=true;
    ssc.lookEventTypes=[Cesium.CameraEventType.LEFT_DRAG];
    ssc.rotateEventTypes=[]; ssc.translateEventTypes=[]; ssc.tiltEventTypes=[];
  }
  setExteriorMouseBindings();

  function clampCameraRollZero(){
    const cam = viewer.scene.camera;
    if (Math.abs(cam.roll) > 1e-4) {
      cam.setView({ destination: cam.positionWC, orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0.0 } });
    }
  }

  // ===== Keyboard/Joystick move =====
  function makeInteriorKeyboardMove(viewer){
    let enabled=false, down={}, baseSpeed=0.8, lastT=performance.now(), jx=0,jy=0,jz=0;
    function onKD(e){ const tag=(e.target&&e.target.tagName)||''; if(['INPUT','TEXTAREA','SELECT'].includes(tag)) return; if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(e.code)) e.preventDefault(); down[e.code]=true; }
    function onKU(e){ const tag=(e.target&&e.target.tagName)||''; if(['INPUT','TEXTAREA','SELECT'].includes(tag)) return; down[e.code]=false; }
    function tick(){
      if(!enabled) return;
      const now=performance.now(), dt=Math.min(0.05,(now-lastT)/1000); lastT=now;
      const cam=viewer.camera; const mult=(down.ShiftLeft||down.ShiftRight)?3:1; const v=baseSpeed*mult;
      if(down.KeyW)cam.moveForward(v*dt); if(down.KeyS)cam.moveBackward(v*dt); if(down.KeyA)cam.moveLeft(v*dt); if(down.KeyD)cam.moveRight(v*dt); if(down.KeyQ)cam.moveDown(v*dt); if(down.KeyE)cam.moveUp(v*dt);
      if(Math.abs(jy)>0.02)cam.moveForward(v*dt*jy); if(Math.abs(jx)>0.02)cam.moveRight(v*dt*jx); if(Math.abs(jz)>0.02)cam.moveUp(v*dt*jz);
      clampCameraRollZero();
    }
    return {
      enable(){ if(enabled) return; enabled=true; lastT=performance.now(); window.addEventListener('keydown',onKD,{passive:false}); window.addEventListener('keyup',onKU,{passive:false}); viewer.clock.onTick.addEventListener(tick); },
      disable(){ if(!enabled) return; enabled=false; window.removeEventListener('keydown',onKD); window.removeEventListener('keyup',onKU); viewer.clock.onTick.removeEventListener(tick); jx=jy=jz=0; },
      setSpeed(v){ baseSpeed=v; }, setJoyAxes(ax,ay){ jx=ax; jy=ay; }, setJoyZ(az){ jz=az; }
    };
  }
  const interiorNav = makeInteriorKeyboardMove(viewer); interiorNav.setSpeed(0.8);

  // ===== Mobile joystick =====
  const joy = document.createElement('div');
  joy.style.cssText = `position:fixed; left:12px; bottom:96px; width:96px; height:96px; border-radius:999px; background:rgba(255,255,255,0.55); border:1px solid #cfd3da; box-shadow:0 6px 16px rgba(0,0,0,.15); z-index:2100; display:${IS_MOBILE?'flex':'none'}; align-items:center; justify-content:center; backdrop-filter: blur(6px); touch-action:none;`;
  const knob = document.createElement('div');
  knob.style.cssText = `width:48px; height:48px; border-radius:999px; background:#ffffff; border:1px solid #bfc5cf; box-shadow:0 4px 12px rgba(0,0,0,.18);`;
  joy.appendChild(knob);
  document.body.appendChild(joy);

  const vzWrap = document.createElement('div');
  vzWrap.style.cssText = `position:fixed; left:120px; bottom:112px; width:44px; z-index:2100; display:${IS_MOBILE?'flex':'none'}; flex-direction:column; gap:8px;`;
  const btnUp=document.createElement('button'), btnDn=document.createElement('button');
  [btnUp,btnDn].forEach(b=>{ b.className='ui-btn'; b.style.cssText = `width:44px; height:44px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,.12); font-size:18px; touch-action:none; cursor:pointer;`; });
  btnUp.textContent='▲'; btnDn.textContent='▼';
  vzWrap.appendChild(btnUp); vzWrap.appendChild(btnDn);
  document.body.appendChild(vzWrap);

  let joyActive=false, joyCenter={x:0,y:0}, joyRect=null, upHeld=false, dnHeld=false;
  function setJoy(ax, ay){ interiorNav.setJoyAxes(ax, ay); }
  function resetJoy(){ knob.style.transform = `translate(0px,0px)`; setJoy(0,0); }
  function startJoyTouch(e){ joyActive = true; joyRect = joy.getBoundingClientRect(); joyCenter = { x: joyRect.left + joyRect.width/2, y: joyRect.top + joyRect.height/2 }; moveJoyTouch(e); }
  function moveJoyTouch(e){
    if(!joyActive) return;
    const t = (e.touches && e.touches[0]) || e;
    const dx = t.clientX - joyCenter.x;
    const dy = t.clientY - joyCenter.y;
    const R = 40;
    const len = Math.hypot(dx,dy);
    const cl = len > R ? R/len : 1;
    const ndx = dx*cl, ndy = dy*cl;
    knob.style.transform = `translate(${ndx}px,${ndy}px)`;
    setJoy(ndx/R, -ndy/R);
  }
  function endJoyTouch(){ joyActive = false; resetJoy(); }
  ['touchstart','mousedown'].forEach(ev=> joy.addEventListener(ev, (e)=>{ e.preventDefault(); startJoyTouch(e); }, {passive:false}));
  ['touchmove','mousemove'].forEach(ev=> joy.addEventListener(ev, (e)=>{ e.preventDefault(); moveJoyTouch(e); }, {passive:false}));
  ['touchend','touchcancel','mouseup','mouseleave'].forEach(ev=> joy.addEventListener(ev, (e)=>{ e.preventDefault(); endJoyTouch(e); }, {passive:false}));
  function refreshJoyZ(){ const z = (upHeld?1:0) + (dnHeld?-1:0); interiorNav.setJoyZ(z); }
  btnUp.addEventListener('touchstart', (e)=>{ e.preventDefault(); upHeld=true;  refreshJoyZ(); }, {passive:false});
  btnUp.addEventListener('touchend',   (e)=>{ e.preventDefault(); upHeld=false; refreshJoyZ(); }, {passive:false});
  btnDn.addEventListener('touchstart', (e)=>{ e.preventDefault(); dnHeld=true;  refreshJoyZ(); }, {passive:false});
  btnDn.addEventListener('touchend',   (e)=>{ e.preventDefault(); dnHeld=false; refreshJoyZ(); }, {passive:false});
  btnUp.addEventListener('mousedown', ()=>{ upHeld=true;  refreshJoyZ(); });
  btnUp.addEventListener('mouseup',   ()=>{ upHeld=false; refreshJoyZ(); });
  btnDn.addEventListener('mousedown', ()=>{ dnHeld=true;  refreshJoyZ(); });
  btnDn.addEventListener('mouseup',   ()=>{ dnHeld=false; refreshJoyZ(); });
  function setJoystickVisible(v){
    if (!IS_MOBILE){ joy.style.display = 'none'; vzWrap.style.display='none'; return; }
    joy.style.display = v ? 'flex' : 'none';
    vzWrap.style.display = v ? 'flex' : 'none';
    if(!v){ resetJoy(); upHeld = dnHeld = false; refreshJoyZ(); }
  }
  setJoystickVisible(false);

  // ===== Graphics quick menu (⚙️) =====
  const gfxBtn = document.createElement('button');
  gfxBtn.setAttribute('aria-label','Graphics');
  gfxBtn.title = "Graphics";
  gfxBtn.className='ui-btn';
  gfxBtn.style.cssText = `position:fixed; right:16px; bottom:16px; width:44px; height:44px; border-radius:999px; box-shadow:0 2px 10px rgba(0,0,0,.18); z-index:2120; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; line-height:1;`;
  gfxBtn.textContent = '⚙️';
  document.body.appendChild(gfxBtn);

  const gfxCard = document.createElement('div');
  gfxCard.className='ui-card';
  gfxCard.style.cssText = `position:fixed; right:16px; bottom:68px; width:220px; max-width:92vw; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.18); z-index:2200; padding:12px; font-family:sans-serif; font-size:14px; display:none;`;
  gfxCard.innerHTML = `<div style="font-weight:700; font-size:14px; margin-bottom:8px;">Graphics</div><label style="display:block; font-size:13px; margin-bottom:6px;">Preset</label>`;
  document.body.appendChild(gfxCard);
  const presetSelect = document.createElement('select');
  presetSelect.className='ui-select';
  presetSelect.style.cssText = "width:100%; padding:8px; border-radius:8px;";
  ['low','balanced','high'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); presetSelect.appendChild(o); });
  gfxCard.appendChild(presetSelect);

  const fovWrap = document.createElement('div');
  fovWrap.style.cssText = "margin-top:10px;";
  fovWrap.innerHTML = `<label style="display:block; font-size:13px; margin:6px 0 6px;">FOV (Interior): <span id="fovVal"></span>°</label><input id="fovRange" class="ui-input" type="range" min="50" max="100" step="1" style="width:100%;">`;
  gfxCard.appendChild(fovWrap);
  const fovValEl = fovWrap.querySelector('#fovVal');
  const fovRange = fovWrap.querySelector('#fovRange');
  const savedFov = Number(localStorage.getItem('ui.fovInterior') || 80);
  fovRange.value = String(Math.min(100, Math.max(50, savedFov)));
  fovValEl.textContent = fovRange.value;
  function deg2rad(d){ return d * Math.PI / 180; }
  function setInteriorFovDeg(d, persist){
    const deg = Math.min(100, Math.max(50, Number(d)||80));
    if (persist) localStorage.setItem('ui.fovInterior', String(deg));
    if (currentMode==='interior') {
      const fr = viewer.camera.frustum; if (fr && 'fov' in fr) fr.fov = deg2rad(deg);
    }
    fovValEl.textContent = deg;
  }
  fovRange.addEventListener('input', ()=> setInteriorFovDeg(fovRange.value, false));
  fovRange.addEventListener('change', ()=> setInteriorFovDeg(fovRange.value, true));
  gfxBtn.addEventListener('click', ()=>{ gfxCard.style.display = (gfxCard.style.display === 'none' || !gfxCard.style.display) ? 'block' : 'none'; });

  function applyGfxPreset(preset){
    try { viewer.useBrowserRecommendedResolution = false; } catch(e){}
    const fxaaStage = viewer.scene?.postProcessStages?.fxaa;
    const DPR = window.devicePixelRatio || 1;
    if (preset === 'low'){ viewer.resolutionScale = 0.75; if (fxaaStage) fxaaStage.enabled = true; if ('msaaSamples' in viewer.scene) viewer.scene.msaaSamples = 1; desiredMSE=16; if(GOOGLE_3D_TILES) GOOGLE_3D_TILES.maximumScreenSpaceError=desiredMSE;
    } else if (preset === 'high'){ viewer.resolutionScale = Math.min(1.25, DPR); if (fxaaStage) fxaaStage.enabled = true; if ('msaaSamples' in viewer.scene) viewer.scene.msaaSamples = 4; desiredMSE=8;  if(GOOGLE_3D_TILES) GOOGLE_3D_TILES.maximumScreenSpaceError=desiredMSE;
    } else { viewer.resolutionScale = 1.0; if (fxaaStage) fxaaStage.enabled = true; if ('msaaSamples' in viewer.scene) viewer.scene.msaaSamples = 2; desiredMSE=12; if(GOOGLE_3D_TILES) GOOGLE_3D_TILES.maximumScreenSpaceError=desiredMSE; }
  }
  let initialPreset = 'balanced';
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  try{ if (conn?.saveData) initialPreset = 'low'; else if (conn?.effectiveType && /(^|-)2g|(^|-)slow-2g|(^|-)3g/.test(conn.effectiveType)) initialPreset = 'low'; }catch(e){}
  applyGfxPreset(initialPreset);
  presetSelect.value = initialPreset;
  presetSelect.addEventListener('change', ()=> applyGfxPreset(presetSelect.value));

  // ===== Data URLs =====
  const BUILDINGS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS1M15_dgf0S6Ofc4wdoZdPac8gcwGzHDVCPkNuyZKSESp2r4OIDJ4bcoV-Gk1aFTrVi0foqccCbpGA/pub?gid=0&single=true&output=csv";
  const POIS_URL      = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSCBUEgH8lRsIIYHEKxCObvqj4Ztxy4RcAhyklS2VntlkTLQ7PthrSNMtwa-sIKTZ1tcqEuP6KucILJ/pub?gid=0&single=true&output=csv";
  const INTERIORS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSf6OimMf2GFXMiPRgOhhbNdwaijM3vPnFX5nlKREf9vYe3plFIkX0RPnRMbAa7fFt-iMc_VF-tcSfs/pub?gid=0&single=true&output=csv";

  // ===== Load & Build =====
  Promise.all([fetchCSV(BUILDINGS_URL), fetchCSV(POIS_URL), fetchCSV(INTERIORS_URL)]).then(async ([csvB,csvP,csvI])=>{
    const b = Papa.parse(csvB,{header:true}).data.filter(r=>r.model_url && r.lat && r.lng && (r.estimated_price || r.estimated_price_first));
    const p = Papa.parse(csvP,{header:true}).data.filter(r=>r.name && r.lat && r.lng && r.type);
    const inter = Papa.parse(csvI,{header:true}).data.filter(r=>r.model_url && (r.unit_name || r.name) && (r.building_key || r.parent || r.name));

    // selectors
    b.forEach((row,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=row.name||('Model #'+(i+1)); selectBox.appendChild(o); });

    // entities
    const modelEntities=[];
    for (let i=0;i<b.length;i++){
      const row = b[i];
      const ent = await createBuildingModel(row,viewer);
      ent.show=(i===0);
      modelEntities.push(ent);
    }

    const buildingOrigins = await Promise.all(
      b.map(async row => {
        const lon = toNum(row.lng), lat = toNum(row.lat), h = toNum(row.height)||20;
        return await getBuildingSurfacePosition(lon, lat, h);
      })
    );

    // indexers
    const poisByKey = new Map();
    p.forEach(r=>{ const k=normKey(r.building_key); if(!k) return; if(!poisByKey.has(k)) poisByKey.set(k,[]); poisByKey.get(k).push(r); });

    const interiorsByKey = new Map();
    inter.forEach(r=>{ const k=normKey(r.building_key||r.parent||r.name); if(!k) return; if(!interiorsByKey.has(k)) interiorsByKey.set(k,[]); interiorsByKey.get(k).push(r); });

    // POI chips
    let activePoiTypes=new Set();
    function rebuildChips(typeSet){
      filterRow.innerHTML='';
      if(typeSet.size===0){ const d=document.createElement('div'); d.style.cssText="font-size:12px;opacity:.7"; d.textContent='No POI types'; filterRow.appendChild(d); return; }
      typeSet.forEach(tn=>{
        const btn=document.createElement('button');
        btn.className='ui-btn';
        btn.textContent=tn; btn.style.cssText="padding:6px 10px;border-radius:999px;cursor:pointer;font-size:12px";
        btn.onclick=()=>{ if(activePoiTypes.has(tn)){ activePoiTypes.delete(tn); btn.style.opacity="0.6"; btn.style.background='#fff'; } else { activePoiTypes.add(tn); btn.style.opacity="1"; btn.style.background='#eef2ff'; } mini.refreshCity(Number(selectBox.value)); updateCommute(Number(selectBox.value)); };
        filterRow.appendChild(btn);
      });
    }

    // POI sources
    const poiSources=[]; const poiIndexById=new Map(); const pinBuilder=new Cesium.PinBuilder();
    function colorForType(type){ const t=(type||'').toLowerCase(); if(t.includes('super'))return Cesium.Color.fromCssColorString('#2e7d32'); if(t.includes('school')||t.includes('univ'))return Cesium.Color.fromCssColorString('#1565c0'); if(t.includes('hosp')||t.includes('clinic'))return Cesium.Color.fromCssColorString('#c62828'); if(t.includes('park'))return Cesium.Color.fromCssColorString('#2e7d32').withAlpha(0.85); if(t.includes('transit')||t.includes('station')||t.includes('bus'))return Cesium.Color.fromCssColorString('#6d4c41'); if(t.includes('gym')||t.includes('fitness'))return Cesium.Color.fromCssColorString('#8e24aa'); if(t.includes('cafe')||t.includes('coffee'))return Cesium.Color.fromCssColorString('#5d4037'); return Cesium.Color.fromCssColorString('#455a64'); }
    function poiBillboard(type,icon){ const col=colorForType(type); const img = icon? pinBuilder.fromText(icon,col,42).toDataURL() : pinBuilder.fromColor(col,32).toDataURL(); return { image:img, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, scale:1, disableDepthTestDistance:Number.POSITIVE_INFINITY }; }
    function metersBetween(a,b){ const g=new Cesium.EllipsoidGeodesic(a,b); return g.surfaceDistance; }

    b.forEach((br,i)=>{
      const ds=new Cesium.CustomDataSource('pois-'+i);
      ds.clustering=new Cesium.EntityCluster({enabled:true,pixelRange:40,minimumClusterSize:3});
      poiSources[i]=ds; viewer.dataSources.add(ds);

      const key=normKey(br.name); const listKey=poisByKey.get(key)||[];
      const radius=toNum(br.radius_m)||800; const cLat=toNum(br.lat), cLng=toNum(br.lng);
      const center=Cesium.Cartographic.fromDegrees(cLng,cLat);
      const candidates = listKey.length>0 ? listKey : p;
      const types=new Set();

      candidates.forEach(poi=>{
        const plat=toNum(poi.lat), plng=toNum(poi.lng); if(!Number.isFinite(plat)||!Number.isFinite(plng)) return;
        const dist=metersBetween(center, Cesium.Cartographic.fromDegrees(plng,plat)); if(dist>radius) return;
        const type=(poi.type||'').toLowerCase().trim();
        const ent=ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(plng,plat,0),
          billboard: poiBillboard(type,(poi.icon||'').trim()),
          label: { text: poi.name||'', font:"14px sans-serif", fillColor:Cesium.Color.BLACK, outlineColor:Cesium.Color.WHITE, outlineWidth:3, style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.TOP, pixelOffset: new Cesium.Cartesian2(0, -42), showBackground:true, backgroundColor:Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.75), disableDepthTestDistance:Number.POSITIVE_INFINITY },
          properties: { type, url: poi.url||'', name: poi.name||'', distance_m:Math.round(dist), baseLat:plat, baseLng:plng, groundOffset:2 },
          show: i===0
        });
        poiIndexById.set(ent.id,{dsIndex:i});
        types.add(type||'other');
      });

      if(i===0){ activePoiTypes=new Set(); rebuildChips(types); }
      clampDataSourceToSurface(ds);
    });

    // Interiors
    const interiorEntitiesByBuilding=[]; const interiorMetaByBuilding=[];
    for (let i=0;i<b.length;i++){
      const br = b[i];
      const key=normKey(br.name); const list=interiorsByKey.get(key)||[];
      interiorEntitiesByBuilding[i]=[]; interiorMetaByBuilding[i]=list;
      for (const u of list){
        const e = await createInteriorModel(br,u,viewer);
        e.show=false;
        interiorEntitiesByBuilding[i].push(e);
      }
    }

    // ===== Compare Units =====
    const compareCard=document.createElement('div');
    compareCard.className='ui-card';
    compareCard.style.cssText="border-radius:12px;padding:10px;display:none";
    compareCard.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="font-weight:700">Compare Units</div>
        <div style="display:flex;gap:6px;">
          <button id="btnAddCurrent" class="ui-btn" style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer">Add current unit</button>
          <button id="btnOpenCompare" class="ui-btn" disabled style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer">Open Compare</button>
          <button id="btnClearCompare" class="ui-btn" style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;border-color:#ffcdd2;color:#b71c1c">Clear</button>
        </div>
      </div>
      <div id="compareHint" style="font-size:12px;opacity:.7">No units added yet</div>`;
    panelBody.appendChild(compareCard);
    const btnAddCurrent=compareCard.querySelector('#btnAddCurrent');
    const btnOpenCompare=compareCard.querySelector('#btnOpenCompare');
    const btnClearCompare=compareCard.querySelector('#btnClearCompare');
    const compareHint=compareCard.querySelector('#compareHint');
    const compareState=[];

    refreshCompareButtons = function(){ btnOpenCompare.disabled = compareState.length===0; compareHint.style.display = compareState.length===0?'block':'none'; };

    function getCurrentPrice(unitRow, buildingRow){
      const v = (unitRow && (unitRow.list_price||unitRow.price||unitRow.estimated_price_unit||unitRow.estimated_price))
             || (buildingRow && (buildingRow.estimated_price_first||buildingRow.estimated_price));
      return parseFirstNumber(v);
    }
    function getAreaM2(unitRow){
      let a = unitRow ? (unitRow.area_m2||unitRow.area_sqm||unitRow.area) : null;
      if(a && String(a).toLowerCase().includes('sqft')){ const n=parseFirstNumber(a); return Number.isFinite(n)? n*0.092903 : NaN; }
      let v = parseFirstNumber(a);
      if(Number.isFinite(v)) return v;
      const sqft = unitRow ? (unitRow.area_sqft||unitRow.sqm_ft) : null;
      const s2 = parseFirstNumber(sqft);
      return Number.isFinite(s2) ? s2*0.092903 : NaN;
    }
    function getBeds(unitRow){ const b = parseFirstNumber(unitRow && (unitRow.bedrooms||unitRow.beds||unitRow.bed)); return Number.isFinite(b)? b : null; }

    btnAddCurrent.onclick=()=>{
      if(!viewSelect.value.startsWith('unit:')) return;
      const bIdx=Number(selectBox.value);
      const uIdx=Number(viewSelect.value.split(':')[1]);
      if(compareState.find(x=>x.bIdx===bIdx && x.uIdx===uIdx)) return;
      if(compareState.length>=3) compareState.shift();
      compareState.push({bIdx,uIdx});
      refreshCompareButtons();
      openCompareModal();
    };
    btnClearCompare.onclick=()=>{ compareState.length=0; refreshCompareButtons(); };
    btnOpenCompare.onclick=()=>openCompareModal();

    const modal=document.createElement('div');
    modal.className='ui-modal';
    modal.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center;z-index:3000";
    modal.innerHTML='<div id="modalBox" class="ui-card" style="border-radius:14px;width:min(92vw,860px);padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.25)"></div>';
    document.body.appendChild(modal);

    function openCompareModal(){
      const box=modal.querySelector('#modalBox');
      const loan=recalcLoan();
      const rows=compareState.map(({bIdx,uIdx})=>{
        const br=b[bIdx], ur=(interiorMetaByBuilding[bIdx]||[])[uIdx]||{};
        const price=getCurrentPrice(ur,br);
        const area=getAreaM2(ur);
        const beds=getBeds(ur);
        const monthly = Number.isFinite(price) ? -pmt((loan.rate||0)/12, (loan.termY||20)*12, price*(1-(loan.dpct||20)/100)) : NaN;
        const name=ur.unit_name||ur.name||('Unit '+(uIdx+1));
        return {name,price,area,beds,monthly};
      });
      const head='<tr style="font-weight:700"><td></td><td>Price</td><td>Area (m²)</td><td>Beds</td><td>Monthly</td></tr>';
      const trs=rows.map(r=>`<tr><td style="font-weight:600">${r.name}</td><td>${fmtUSD(r.price)}</td><td>${Number.isFinite(r.area)?r.area.toFixed(1):'—'}</td><td>${r.beds!=null?r.beds:'—'}</td><td>${fmtUSD(r.monthly)}</td></tr>`).join('');
      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:700">Compare Units</div>
          <button id="closeModal" class="ui-btn" style="border-radius:10px;padding:6px 10px;cursor:pointer">✕</button>
        </div>
        <div style="overflow:auto;max-height:70vh">
          <table style="width:100%;border-collapse:collapse">${head}${trs || `<tr><td colspan="5" style="opacity:.7">No units added yet</td></tr>`}</table>
        </div>`;
      box.querySelector('#closeModal').onclick=()=>modal.style.display='none';
      modal.style.display='flex';
    }

    // ===== Similar Units (current price only) =====
    const similarCard=document.createElement('div');
    similarCard.className='ui-card';
    similarCard.style.cssText="border-radius:12px;padding:10px;display:none";
    similarCard.innerHTML='<div style="font-weight:700;margin-bottom:6px">Similar Units</div><div id="similarBody" style="display:flex;flex-direction:column;gap:6px"></div>';
    panelBody.appendChild(similarCard);
    const similarBody=similarCard.querySelector('#similarBody');

    function buildSimilarList(bIdx,uIdx){
      const list=(interiorMetaByBuilding[bIdx]||[]);
      const br=b[bIdx];
      const base=list[uIdx]||{};
      const priceBase=getCurrentPrice(base,br);
      const areaBase=getAreaM2(base);
      if(!Number.isFinite(priceBase)){ similarBody.innerHTML='<div style="opacity:.7">No similar units found</div>'; return; }

      const priceTol=0.15*priceBase;
      const areaTol = Number.isFinite(areaBase)? Math.max(5,0.15*areaBase) : Infinity;

      const items=[];
      list.forEach((ur,k)=>{
        if(k===uIdx) return;
        const pr=getCurrentPrice(ur,br); if(!Number.isFinite(pr)) return;
        if(Math.abs(pr-priceBase)>priceTol) return;
        const ar=getAreaM2(ur);
        if(Number.isFinite(areaBase) && Number.isFinite(ar) && Math.abs(ar-areaBase)>areaTol) return;
        items.push({ur,k,pr,ar});
      });

      items.sort((a,c)=>Math.abs(a.pr-priceBase)-Math.abs(c.pr-priceBase));
      const top=items.slice(0,3);
      if(top.length===0){ similarBody.innerHTML='<div style="opacity:.7">No similar units found</div>'; return;}
      similarBody.innerHTML='';
      top.forEach(it=>{
        const btn=document.createElement('button');
        btn.className='ui-btn';
        btn.style.cssText="text-align:left;border-radius:10px;padding:8px;cursor:pointer";
        const nm=it.ur.unit_name||it.ur.name||('Unit '+(it.k+1));
        btn.innerHTML=`<div style="font-weight:600">${nm}</div><div style="font-size:12px;opacity:.8">${fmtUSD(it.pr)} ${Number.isFinite(it.ar)?'• '+it.ar.toFixed(0)+' m²':''}</div>`;
        btn.onclick=()=>{ viewSelect.value='unit:'+it.k; viewSelect.dispatchEvent(new Event('change')); };
        similarBody.appendChild(btn);
      });
    }

    // ===== Commute =====
    const commuteCard=document.createElement('div');
    commuteCard.className='ui-card';
    commuteCard.style.cssText="border-radius:12px;padding:10px;display:none";
    commuteCard.innerHTML='<div style="font-weight:700;margin-bottom:6px">Commute & Proximity</div><div id="commuteBody" style="display:flex;flex-direction:column;gap:6px"></div>';
    panelBody.appendChild(commuteCard);
    const commuteBody=commuteCard.querySelector('#commuteBody');
    const SPEED_WALK=4.5/3.6, SPEED_DRIVE=35/3.6;
    const COMMUTE=['school','transit','station','bus','park','hospital','clinic','super','supermarket','cafe'];
    function prettyMin(m){ if(!Number.isFinite(m)) return '—'; if(m<1) return '<1m'; if(m<60) return Math.round(m)+'m'; const h=Math.floor(m/60), mm=Math.round(m%60); return h+'h '+(mm?mm+'m':''); }
    function updateCommute(bIdx){
      const row=b[bIdx]; if(!row){ commuteCard.style.display='none'; return; }
      const r=toNum(row.radius_m)||1500, cLat=toNum(row.lat), cLng=toNum(row.lng);
      const center=Cesium.Cartographic.fromDegrees(cLng,cLat);
      const best={};
      p.forEach(poi=>{
        const t=(poi.type||'').toLowerCase();
        if(!COMMUTE.some(k=>t.includes(k))) return;
        const plat=toNum(poi.lat), plng=toNum(poi.lng); if(!Number.isFinite(plat)||!Number.isFinite(plng)) return;
        const d=metersBetween(center, Cesium.Cartographic.fromDegrees(plng,plat)); if(d>r) return;
        const key=COMMUTE.find(k=>t.includes(k))||'other';
        if(!best[key]||d<best[key].dist) best[key]={name:poi.name||'', dist:d};
      });
      const html=Object.keys(best).map(k=>{
        const v=best[k];
        const label=k.charAt(0).toUpperCase()+k.slice(1);
        return `<div style="display:flex;justify-content:space-between;font-size:13px"><span>nearest ${label}${v.name?`: ${v.name}`:''}</span><span>walk ${prettyMin(v.dist/(SPEED_WALK*60))} • drive ${prettyMin(v.dist/(SPEED_DRIVE*60))}</span></div>`;
      }).slice(0,6).join('');
      commuteBody.innerHTML=html||'<div style="opacity:.7">—</div>';
      commuteCard.style.display='block';
    }

    // ===== Price Insights (current) =====
    const priceCard=document.createElement('div');
    priceCard.className='ui-card';
    priceCard.style.cssText="border-radius:12px;padding:10px;display:none";
    priceCard.innerHTML='<div style="font-weight:700;margin-bottom:6px">Price Insights</div><div id="priceBody" style="display:flex;flex-direction:column;gap:6px"></div>';
    panelBody.appendChild(priceCard);
    const priceBody=priceCard.querySelector('#priceBody');

    function priceDeltas(bIdx,uIdx){
      const br=b[bIdx];
      const unit=(interiorMetaByBuilding[bIdx]||[])[uIdx]||{};
      const priceU=getCurrentPrice(unit,br);
      if(!Number.isFinite(priceU)) return null;

      // avg building
      const units=(interiorMetaByBuilding[bIdx]||[]);
      let s=0,c=0; units.forEach(u=>{ const v=getCurrentPrice(u,br); if(Number.isFinite(v)){ s+=v; c++; }});
      const avgB = c? s/c : parseFirstNumber(br.estimated_price_first||br.estimated_price);

      // avg area (1km)
      const here=Cesium.Cartographic.fromDegrees(toNum(br.lng),toNum(br.lat));
      let sa=0, ca=0;
      b.forEach(o=>{
        const d=metersBetween(here, Cesium.Cartographic.fromDegrees(toNum(o.lng),toNum(o.lat)));
        if(d<=1000){ const pv=parseFirstNumber(o.estimated_price_first||o.estimated_price); if(Number.isFinite(pv)){ sa+=pv; ca++; } }
      });
      const avgArea = ca? sa/ca : NaN;

      const dB = Number.isFinite(avgB)? ((priceU-avgB)/avgB)*100 : NaN;
      const dA = Number.isFinite(avgArea)? ((priceU-avgArea)/avgArea)*100 : NaN;
      return {priceU,dB,dA};
    }
    function renderInsights(bIdx,uIdx){
      const d=priceDeltas(bIdx,uIdx); if(!d){ priceCard.style.display='none'; return; }
      function line(lbl,p){ if(!Number.isFinite(p)) return ''; const tag=p<=0?'better':'worse'; return `<div style="display:flex;justify-content:space-between;font-size:13px"><span>${lbl}</span><span>${(p>0?'+':'')+p.toFixed(1)}% • ${tag}</span></div>`; }
      priceBody.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:13px"><span>Price</span><b>${fmtUSD(d.priceU)}</b></div>${line('vs building avg',d.dB)}${line('vs area avg (1km)',d.dA)}`;
      priceCard.style.display='block';
    }

    // ===== Mini (city/plan) =====
    const mini=(function(){
      const root=document.createElement('div');
      root.id='miniTopRight';
      root.className='ui-card';
      root.style.cssText="position:fixed;right:16px;top:16px;width:240px;height:220px;border-radius:12px;z-index:2100;overflow:hidden";
      document.body.appendChild(root);

      const cityDiv=document.createElement('div'); cityDiv.style.cssText='position:absolute;inset:0;display:block;background:#fff'; root.appendChild(cityDiv);
      const map=L.map(cityDiv,{attributionControl:false,zoomControl:false,dragging:true,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,tap:false});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
      const layerBuildings=L.layerGroup().addTo(map);
      const layerSelected=L.layerGroup().addTo(map);
      const layerPois=L.layerGroup().addTo(map);

      const buildingMarkers=[];
      b.forEach((row,i)=>{
        const lat=toNum(row.lat), lng=toNum(row.lng);
        if(!Number.isFinite(lat)||!Number.isFinite(lng)) return;
        const m=L.circleMarker([lat,lng],{radius:4,color:'#1976d2',weight:1,fillColor:'#1976d2',fillOpacity:0.9}).addTo(layerBuildings);
        if(row.name) m.bindTooltip(row.name,{direction:'top',offset:[0,-2]});
        m.on('click',()=>{ selectBox.value=String(i); selectBox.dispatchEvent(new Event('change')); });
        buildingMarkers[i]=m;
      });

      const camEl=document.createElement('div');
      camEl.style.cssText='width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #d32f2f;transform:rotate(0deg)';
      const camIcon=L.divIcon({className:'',html:camEl,iconSize:[12,14],iconAnchor:[6,7]});
      const camMarker=L.marker([0,0],{icon:camIcon}).addTo(map);
      function updateCityCamera(){ try{ const c=Cesium.Cartographic.fromCartesian(viewer.camera.positionWC); camMarker.setLatLng([Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude)]);}catch(e){} }

      const planDiv=document.createElement('div'); planDiv.style.cssText='position:absolute;inset:0;display:none;background:#fff'; root.appendChild(planDiv);
      const planInner=document.createElement('div'); planInner.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)'; planDiv.appendChild(planInner);
      const planImg=document.createElement('img'); planImg.style.cssText='display:block;width:100%;height:100%;object-fit:contain'; planInner.appendChild(planImg);
      const planMarker=document.createElement('div'); planMarker.style.cssText='position:absolute;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #d32f2f;transform-origin:50% 60%'; planDiv.appendChild(planMarker);

      let ps={url:'',rot:0,w:10,h:10,cE:0,cN:0,nw:0,nh:0,zoom:1,ready:false,u:null,b:null};
      function setMode(m){ cityDiv.style.display=m==='city'?'block':'none'; planDiv.style.display=m==='plan'?'block' : 'none'; }
      function layoutPlan(){ if(!ps.ready) return; const cw=planDiv.clientWidth, ch=planDiv.clientHeight, arI=ps.nw/ps.nh, arC=cw/ch; let dw,dh; if(arI>arC){ dw=cw; dh=cw/arI; } else { dh=ch; dw=ch*arI; } dw*=ps.zoom; dh*=ps.zoom; planInner.style.width=dw+'px'; planInner.style.height=dh+'px'; }
      window.addEventListener('resize',()=>{ layoutPlan(); updatePlanCam(); });

      function enuBasisAt(origin){ const enu=Cesium.Transforms.eastNorthUpToFixedFrame(origin); const east=Cesium.Matrix4.getColumn(enu,0,new Cesium.Cartesian3()); const north=Cesium.Matrix4.getColumn(enu,1,new Cesium.Cartesian3()); const origin3=Cesium.Matrix4.getColumn(enu,3,new Cesium.Cartesian3()); const norm=v=>Cesium.Cartesian3.normalize(v,new Cesium.Cartesian3()); return {east:norm(east), north:norm(north), origin:origin3}; }
      function updatePlanCam(){
        if(!ps.ready || ps.b==null || ps.u==null) return;
        const {east,north,origin} = enuBasisAt(buildingOrigins[ps.b]);
        const cam=viewer.camera.positionWC;
        const v=Cesium.Cartesian3.subtract(cam,origin,new Cesium.Cartesian3());
        const eCam=Cesium.Cartesian3.dot(v,east), nCam=Cesium.Cartesian3.dot(v,north);
        const uRow=(interiorMetaByBuilding[ps.b]||[])[ps.u]||{};
        const offE=toNum(uRow.offset_east_m)||0, offN=toNum(uRow.offset_north_m)||0;
        const eRel=eCam-(offE+(ps.cE||0)), nRel=nCam-(offN+(ps.cN||0));
        const rad=-(ps.rot||0)*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
        const ex=eRel*cos - nRel*sin, ny=eRel*sin + nRel*cos;
        const DW=planInner.clientWidth, DH=planInner.clientHeight;
        const xRatio=(ex/(ps.w||10))+0.5, yRatio=0.5 - (ny/(ps.h||10));
        const x=xRatio*DW, y=yRatio*DH;
        const mx=Math.max(0,Math.min(DW,x)), my=Math.max(0,Math.min(DH,y));
        const r=planInner.getBoundingClientRect(), rc=planDiv.getBoundingClientRect();
        planMarker.style.left=(r.left-rc.left+mx-6)+'px'; planMarker.style.top=(r.top-rc.top+my-7)+'px';
        const hd=Cesium.Math.toDegrees(viewer.camera.heading)-(ps.rot||0);
        planMarker.style.transform='rotate('+hd+'deg)';
      }

      function showPlanForUnit(bIdx,uIdx,uRow){
        const url=uRow.unit_plan_image_url||uRow.plan_image_url||uRow.plan_img_url||uRow.floorplan_url||uRow.plan_url||uRow.unit_map_image_url;
        if(!url){ setMode('city'); return; }
        ps={url:url,rot:Number(uRow.plan_rotation_deg||uRow.plan_rot_deg||uRow.plan_deg||uRow.plan_rotation)||0,w:Number(uRow.plan_width_m||uRow.unit_plan_width_m)||10,h:Number(uRow.plan_height_m||uRow.unit_plan_height_m)||10,cE:Number(uRow.plan_center_e_m||uRow.plan_center_east_m||uRow.plan_center_e)||0,cN:Number(uRow.plan_center_n_m||uRow.plan_center_north_m||uRow.plan_center_n)||0,nw:0,nh:0,zoom:1,ready:false,u:uIdx,b:bIdx};
        planImg.onload=()=>{ ps.nw=planImg.naturalWidth; ps.nh=planImg.naturalHeight; ps.ready=true; layoutPlan(); updatePlanCam(); };
        planImg.onerror=()=>{ setMode('city'); };
        planImg.src=url;
        setMode('plan'); layoutPlan(); updatePlanCam();
      }

      let raf=false;
      viewer.camera.changed.addEventListener(()=>{ if(planDiv.style.display!=='block'){ updateCityCamera(); return; } if(!raf){ raf=true; requestAnimationFrame(()=>{ raf=false; updatePlanCam(); }); }});
      map.on('click',e=>{ try{ const h=viewer.camera.positionCartographic.height; viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(e.latlng.lng,e.latlng.lat,h), duration:0.6}); }catch(err){} });

      // zoom buttons
      const zb=document.createElement('div'); zb.style.cssText="position:absolute;right:6px;bottom:6px;display:flex;flex-direction:column;gap:6px;z-index:50"; root.appendChild(zb);
      function zbtn(t,ttl){ const b=document.createElement('button'); b.className='ui-btn'; b.textContent=t; b.title=ttl||''; b.style.cssText='width:28px;height:28px;border-radius:8px;cursor:pointer'; return b;}
      const zp=zbtn('+','Zoom in'), zm=zbtn('−','Zoom out'); zb.appendChild(zp); zb.appendChild(zm);
      zp.onclick=()=>{ if(planDiv.style.display==='block'){ ps.zoom=Math.min(4,ps.zoom*1.25); layoutPlan(); updatePlanCam(); } else { map.zoomIn(1); } };
      zm.onclick=()=>{ if(planDiv.style.display==='block'){ ps.zoom=Math.max(0.5,ps.zoom/1.25); layoutPlan(); updatePlanCam(); } else { map.zoomOut(1); } };

      return {
        setMode, refreshCity(idx){
          const row=b[idx]; if(!row) return;
          const lat=toNum(row.lat), lng=toNum(row.lng), radius=toNum(row.radius_m)||800;
          try{ map.setView([lat,lng],15); }catch(e){}
          layerSelected.clearLayers(); layerPois.clearLayers();
          L.circle([lat,lng],{radius,color:'#1976d2',weight:1,fill:false}).addTo(layerSelected);
          const cCarto=Cesium.Cartographic.fromDegrees(lng,lat);
          p.forEach(poi=>{
            const plat=toNum(poi.lat), plng=toNum(poi.lng); if(!Number.isFinite(plat)||!Number.isFinite(plng)) return;
            let dist=Infinity; try{ dist=new Cesium.EllipsoidGeodesic(cCarto,Cesium.Cartographic.fromDegrees(plng,plat)).surfaceDistance; }catch(_){ }
            if(dist>radius) return;
            const type=(poi.type||'').toLowerCase().trim();
            if(activePoiTypes.size && !activePoiTypes.has(type)) return;
            const m=L.circleMarker([plat,plng],{radius:3,color:'#455a64',weight:1,fillColor:'#455a64',fillOpacity:0.9});
            if(poi.name) m.bindTooltip(poi.name,{direction:'top',offset:[0,-2]});
            m.addTo(layerPois);
          });
        },
        showPlanForUnit, updateCityCamera
      };
    })();

    // ===== Chart (price series if exists) =====
    let chartInstance=null;
    function drawPriceChart(canvas, priceStr){
      const years=[2,5,10,15,20];
      const prices=(priceStr? String(priceStr).split(',').map(s=>Number(s.trim().replace(/[$,]/g,''))) : []);
      if(chartInstance) chartInstance.destroy();
      chartInstance=new Chart(canvas.getContext('2d'),{
        type:'line',
        data:{labels:years.map(y=>y+' yr'), datasets:[{label:'Estimated Price', data:prices, borderColor:'#1976d2', backgroundColor:'rgba(25,118,210,0.13)', borderWidth:2, pointRadius:4, tension:0.15, fill:true}]},
        options:{responsive:false,plugins:{legend:{display:false},tooltip:{enabled:true}},scales:{y:{ticks:{callback:v=>"$"+Number(v).toLocaleString()}}}}
      });
    }

    // ===== Picking (POI tooltip) =====
    const handler=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(function (m){
      const picked=viewer.scene.pick(m.position);
      if(!picked || !picked.id || !poiIndexById.has(picked.id.id)){ tip.style.display='none'; return; }
      const ent=picked.id, props=ent.properties||{};
      const nm = props.name&&props.name.getValue ? props.name.getValue() : (ent.name||'');
      const tp = props.type&&props.type.getValue ? props.type.getValue() : '';
      const url= props.url &&props.url.getValue ? props.url.getValue() : '';
      const dist=props.distance_m&&props.distance_m.getValue ? props.distance_m.getValue() : '';
      tip.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${nm}</div><div style="opacity:.85;margin-bottom:4px">${tp}${dist?` • ${dist} m`:''}</div>${url?`<a href="${url}" target="_blank" style="color:#1976d2;text-decoration:none">Open link</a>`:''}`;
      tip.style.left=m.position.x+'px'; tip.style.top=m.position.y+'px'; tip.style.display='block';
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    viewer.camera.changed.addEventListener(()=>{ tip.style.display='none'; });

    function refreshPoisForSelection(){
      const idx=Number(selectBox.value), isExterior=(viewSelect.value==='exterior');
      poiSources.forEach((ds,i)=>{ const show=(i===idx)&&isExterior; ds.entities.values.forEach(ent=>ent.show=!!show); });
    }

    function rebuildViewOptions(idx){
      viewSelect.innerHTML='';
      const o=document.createElement('option'); o.value='exterior'; o.textContent='Building View'; viewSelect.appendChild(o);
      const list=interiorMetaByBuilding[idx]||[];
      list.forEach((u,k)=>{ const o2=document.createElement('option'); o2.value='unit:'+k; o2.textContent=u.unit_name||u.name||('Unit #'+(k+1)); viewSelect.appendChild(o2); });
      viewSelect.value='exterior';
    }

    // ===== Update View =====
    selectBox.addEventListener('change', ()=>{ rebuildViewOptions(Number(selectBox.value)); updateView(Number(selectBox.value)); });
    viewSelect.addEventListener('change', ()=>{ updateView(Number(selectBox.value)); });

    function updateView(idx){
      const row=b[idx]; const isExterior=(viewSelect.value==='exterior');
      currentMode = isExterior ? 'exterior' : 'interior';

      modelEntities.forEach((ent,i)=> ent.show=(i===idx)&&isExterior);
      (interiorEntitiesByBuilding[idx]||[]).forEach((ent,k)=>{ ent.show = !isExterior && (viewSelect.value==='unit:'+k); });

      refreshPoisForSelection();

      if(isExterior){
        setExteriorMouseBindings(); interiorNav.disable(); setJoystickVisible(false);
        const lon=toNum(row.lng), lat=toNum(row.lat);
        const height=toNum(row.height)||20, scale=toNum(row.scale)||10;
        const heading=Cesium.Math.toRadians(toNum(row.heading)||0), pitch=Cesium.Math.toRadians(-30);
        let distance = (scale>0? scale*25 : (toNum(row.height)||10)*10); if(distance<60) distance=60;
        getBuildingSurfacePosition(lon,lat,height).then(center=>{
          viewer.scene.camera.lookAt(center, new Cesium.HeadingPitchRange(heading,pitch,distance));
        });
        const fr=viewer.camera.frustum; if(fr && 'fov' in fr) fr.fov=Math.PI/3;

        title.textContent=row.name||'';
        (function(){
          var d = '';
          if (row && typeof row.description !== 'undefined' && row.description!=null) d = String(row.description);
          else if (row && typeof row.desc !== 'undefined' && row.desc!=null) d = String(row.desc);
          else if (row && typeof row.about !== 'undefined' && row.about!=null) d = String(row.about);
          d = d.trim();
          descBox.style.display = d ? 'block' : 'none';
          descBox.textContent = d;
        })();

        priceCanvas.style.display='none';
        loanCard.style.display='none';
        compareCard.style.display='none';
        similarCard.style.display='none';
        priceCard.style.display='none';

        mini.setMode('city'); mini.refreshCity(idx); mini.updateCityCamera();
        updateCommute(idx); commuteCard.style.display='block';
      } else {
        const k=Number((viewSelect.value.split(':')[1])||0);
        const ent=(interiorEntitiesByBuilding[idx]||[])[k];
        if(ent){
          const target=ent.position.getValue(Cesium.JulianDate.now());
          const meta=(interiorMetaByBuilding[idx]||[])[k]||{};
          const camHead=Cesium.Math.toRadians(parseFirstNumber(meta.camera_heading!=null?meta.camera_heading:row.heading)||0);
          const camPitch=Cesium.Math.toRadians(parseFirstNumber(meta.camera_pitch)||-15);
          const range = parseFirstNumber(meta.camera_distance) || Math.max(30,(parseFirstNumber(meta.scale)||8)*15);

          viewer.scene.camera.lookAt(target, new Cesium.HeadingPitchRange(camHead,camPitch,range));
          viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          setInteriorMouseBindings(); interiorNav.enable(); setJoystickVisible(true);

          // apply saved FOV (and keep UI text up to date)
          const saved = Number(localStorage.getItem('ui.fovInterior'))||80;
          const fr=viewer.camera.frustum; if(fr && 'fov' in fr) fr.fov = saved * Math.PI/180;
          fovRange.value = String(saved); fovValEl.textContent = saved;

          title.textContent=(row.name||'') + ((meta.unit_name||meta.name)?' — '+(meta.unit_name||meta.name):'');
          priceCanvas.style.display='block';

          (function(){
            var d = '';
            if (meta && typeof meta.description !== 'undefined' && meta.description!=null) d = String(meta.description);
            else if (meta && typeof meta.desc !== 'undefined' && meta.desc!=null) d = String(meta.desc);
            else if (row && typeof row.description !== 'undefined' && row.description!=null) d = String(row.description); // fallback
            d = d.trim();
            descBox.style.display = d ? 'block' : 'none';
            descBox.textContent = d;
          })();
          drawPriceChart(priceCanvas, meta.estimated_price_unit || meta.estimated_price || row.estimated_price);

          loanCard.style.display='block';
          compareCard.style.display='block';
          similarCard.style.display='block';
          priceCard.style.display='block';
          commuteCard.style.display='block';

          const autoPrice=getCurrentPrice(meta,row);
          loanPrice.value = Number.isFinite(autoPrice) && autoPrice>0 ? String(autoPrice) : '';
          recalcLoan();

          mini.showPlanForUnit(idx,k,meta);
          buildSimilarList(idx,k);
          renderInsights(idx,k);
          updateCommute(idx);
        }
      }
    }

    function refreshAllCityLayers(idx){
      poiSources.forEach((ds,i)=>{ const show=(i===idx)&&(viewSelect.value==='exterior'); ds.entities.values.forEach(ent=>ent.show=!!show); });
    }
    selectBox.addEventListener('change',()=>refreshAllCityLayers(Number(selectBox.value)));

    // init
    rebuildViewOptions(0);
    updateView(0);

    // hide tooltip on camera move
    viewer.camera.changed.addEventListener(()=>{ tip.style.display='none'; });

  }).catch(err=>console.error(err));

  // ========== Entities ==========
  async function createBuildingModel(row,viewer){
    const lon=toNum(row.lng), lat=toNum(row.lat), h=toNum(row.height)||20, scale=toNum(row.scale)||10;
    const pos = await getBuildingSurfacePosition(lon, lat, h);
    const hpr=new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(toNum(row.heading)||0), Cesium.Math.toRadians(toNum(row.pitch)||0), Cesium.Math.toRadians(toNum(row.roll)||0));
    const ori=Cesium.Transforms.headingPitchRollQuaternion(pos,hpr);
    return viewer.entities.add({
      name: row.name || row.model_url, position:pos, orientation:ori,
      model:{uri:row.model_url, minimumPixelSize:128, maximumScale:scale, scale:scale, shadows:Cesium.ShadowMode.DISABLED},
      label: row.name ? { text: row.name, font:"17px sans-serif", fillColor:Cesium.Color.YELLOW, outlineColor:Cesium.Color.BLACK, outlineWidth:2, style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance:Number.POSITIVE_INFINITY, pixelOffset:new Cesium.Cartesian2(0, -30) } : undefined,
      show:false
    });
  }

  async function createInteriorModel(bRow,uRow,viewer){
    const baseLon=toNum(bRow.lng), baseLat=toNum(bRow.lat), baseH=toNum(bRow.height)||20;
    const baseSurfaceH = await getSurfaceHeight(baseLon, baseLat);
    const offE=toNum(uRow.offset_east_m)||0, offN=toNum(uRow.offset_north_m)||0, offU=toNum(uRow.offset_up_m)||0;
    const pos=placeWithEnuOffset(baseLon,baseLat,baseSurfaceH + baseH,offE,offN,offU);
    const hd=parseFirstNumber(uRow.heading!=null?uRow.heading:bRow.heading)||0;
    const hpr=new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(hd), Cesium.Math.toRadians(toNum(uRow.pitch)||0), Cesium.Math.toRadians(toNum(uRow.roll)||0));
    const ori=Cesium.Transforms.headingPitchRollQuaternion(pos,hpr);
    const scale=toNum(uRow.scale)||8;
    const name=uRow.unit_name||uRow.name||'Unit';
    return viewer.entities.add({
      name:name, position:pos, orientation:ori,
      model:{uri:uRow.model_url, minimumPixelSize:96, maximumScale:scale, scale:scale, shadows:Cesium.ShadowMode.DISABLED},
      label:{ text:name, font:"15px sans-serif", fillColor:Cesium.Color.WHITE, outlineColor:Cesium.Color.BLACK, outlineWidth:2, style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance:Number.POSITIVE_INFINITY, pixelOffset:new Cesium.Cartesian2(0, -24) },
      show:false
    });
  }

  // ========== Compass ==========
  const compass=document.createElement('div');
  compass.id='compass';
  compass.className='ui-card';
  compass.style.cssText="position:fixed;right:16px;bottom:120px;width:80px;height:80px;border-radius:999px;z-index:2100;display:flex;align-items:center;justify-content:center";
  const dial=document.createElement('div'); dial.style.cssText="position:relative;width:64px;height:64px;border-radius:999px;border:1px solid #d7dbe2;background:#fff"; compass.appendChild(dial);
  [['N','top:2px;left:50%;transform:translateX(-50%)'],['E','right:2px;top:50%;transform:translateY(-50%)'],['S','bottom:2px;left:50%;transform:translateX(-50%)'],['W','left:2px;top:50%;transform:translateY(-50%)']].forEach(d=>{
    const e=document.createElement('div'); e.textContent=d[0]; e.style.cssText='position:absolute;font-size:10px;font-weight:700;color:#111;'+d[1]; dial.appendChild(e);
  });
  const needle=document.createElement('div'); needle.style.cssText="position:absolute;left:50%;top:50%;width:0;height:0;transform:translate(-50%, -50%) rotate(0deg);border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:16px solid #d32f2f"; dial.appendChild(needle);
  document.body.appendChild(compass);
  function updateCompass(){
    const cam=viewer.camera;
    const enu=Cesium.Transforms.eastNorthUpToFixedFrame(cam.positionWC);
    const east=Cesium.Matrix4.getColumn(enu,0,new Cesium.Cartesian3());
    const north=Cesium.Matrix4.getColumn(enu,1,new Cesium.Cartesian3());
    const up=Cesium.Matrix4.getColumn(enu,2,new Cesium.Cartesian3());
    let dir=Cesium.Cartesian3.normalize(cam.directionWC,new Cesium.Cartesian3());
    const vup=Cesium.Cartesian3.multiplyByScalar(up, Cesium.Cartesian3.dot(dir,up), new Cesium.Cartesian3());
    dir=Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(dir,vup,new Cesium.Cartesian3()),dir);
    const x=Cesium.Cartesian3.dot(dir,east), y=Cesium.Cartesian3.dot(dir,north);
    const ang=Math.atan2(x,y);
    needle.style.transform='translate(-50%, -50%) rotate('+Cesium.Math.toDegrees(ang)+'deg)';
  }
  viewer.camera.changed.addEventListener(updateCompass);
  updateCompass();

}); // libs loaded
