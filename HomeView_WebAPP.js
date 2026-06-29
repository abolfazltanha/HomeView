// ========== External libs ========
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
  .hv-section-title { font-weight:700; font-size:12px; letter-spacing:.02em; color:#444 !important; margin:4px 0 -4px; }
  .hv-filter-chip { transition: background .15s ease, color .15s ease, border-color .15s ease, opacity .15s ease, transform .15s ease; }
  .hv-filter-chip:hover { transform: translateY(-1px); }
  .hv-chrome-anim { transition: opacity .22s ease, transform .22s ease; }
`;
document.head.appendChild(forceLightCSS);

// ===== HomeView mobile layout polish =====
// Compact left controls on mobile, and fully remove the minimap on touch/small screens.
const hvMobileLayoutCSS = document.createElement('style');
hvMobileLayoutCSS.textContent = `
  @media (max-width: 640px), (pointer: coarse) {
    #chartContainer {
      left: 8px !important;
      top: 8px !important;
      width: min(78vw, 300px) !important;
      max-height: 42vh !important;
      padding: 8px !important;
      border-radius: 14px !important;
      font-size: 12px !important;
    }
    #chartContainer > div:first-child {
      gap: 6px !important;
      margin-bottom: 6px !important;
    }
    #chartContainer button {
      min-height: 30px !important;
      font-size: 11px !important;
    }
    #chartContainer select,
    #chartContainer input {
      min-height: 32px !important;
      font-size: 12px !important;
      padding: 6px !important;
    }
    #miniTopRight {
      display: none !important;
      pointer-events: none !important;
    }
  }
`;
document.head.appendChild(hvMobileLayoutCSS);
const hvMobileLogoRestoreCSS = document.createElement('style');
hvMobileLogoRestoreCSS.textContent = `
/* v65: keep the external partner/link logo visible in mobile panoramas and interiors. */
@media (max-width: 640px), (pointer: coarse) {
  #unitAdWrap {
    left: 10px !important;
    bottom: 10px !important;
    max-width: 92px !important;
    max-height: 56px !important;
    padding: 5px !important;
    border-radius: 12px !important;
    z-index: 2400 !important;
  }
  #unitAdWrap img {
    max-width: 82px !important;
    max-height: 44px !important;
  }
}
`;
document.head.appendChild(hvMobileLogoRestoreCSS);

// ===== HomeView persistent top controls polish =====
const hvTopControlsCSS = document.createElement('style');
hvTopControlsCSS.textContent = `
  #chartContainer { overflow-x:hidden !important; }
  #chartContainer #quickShareBtn { display:inline-flex !important; }
  @media (max-width: 640px), (pointer: coarse) {
    #chartContainer { width:min(86vw, 320px) !important; }
    #chartContainer #quickShareBtn {
      width:auto !important;
      min-width:74px !important;
      padding:0 10px !important;
      font-size:11px !important;
      font-weight:700 !important;
    }
  }
`;
document.head.appendChild(hvTopControlsCSS);


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

  // ===== Initial launch loading overlay =====
  const launchLoadingOverlay = document.createElement('div');
  launchLoadingOverlay.id = 'hvLaunchLoadingOverlay';
  launchLoadingOverlay.style.cssText = `
    position:fixed;
    inset:0;
    z-index:999998;
    display:flex;
    align-items:center;
    justify-content:center;
    background:linear-gradient(180deg, rgba(7,10,16,.82), rgba(7,10,16,.68));
    color:#fff;
    font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;
    opacity:1;
    transition:opacity .28s ease;
    pointer-events:auto;
  `;
  launchLoadingOverlay.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:20px 24px;border-radius:18px;background:rgba(0,0,0,.28);backdrop-filter:blur(8px);box-shadow:0 18px 50px rgba(0,0,0,.28);max-width:min(88vw,360px)">
      <div style="width:34px;height:34px;border-radius:999px;border:3px solid rgba(255,255,255,.28);border-top-color:#fff;animation:hvLaunchSpin .85s linear infinite"></div>
      <div style="font-weight:800;font-size:17px;letter-spacing:.2px">Loading HomeView</div>
      <div id="hvLaunchLoadingText" style="font-size:13px;line-height:1.45;opacity:.86">Preparing the 3D experience...</div>
    </div>
  `;
  const launchSpinStyle = document.createElement('style');
  launchSpinStyle.textContent = '@keyframes hvLaunchSpin{to{transform:rotate(360deg)}}';
  document.head.appendChild(launchSpinStyle);
  document.body.appendChild(launchLoadingOverlay);
  const launchLoadingText = launchLoadingOverlay.querySelector('#hvLaunchLoadingText');
  function setLaunchLoadingText(msg){ try{ if(launchLoadingText && msg) launchLoadingText.textContent = String(msg); }catch(_){ } }
  function hideLaunchLoading(){
    try{
      launchLoadingOverlay.style.opacity = '0';
      launchLoadingOverlay.style.pointerEvents = 'none';
      setTimeout(function(){ try{ launchLoadingOverlay.remove(); }catch(_){ } }, 360);
    }catch(_){ }
  }

  function showLaunchLoadingMessage(message){
    try{
      const text = String(message || 'Loading HomeView...');
      launchLoadingOverlay.style.opacity = '1';
      launchLoadingOverlay.style.pointerEvents = 'auto';
      launchLoadingOverlay.style.background = 'linear-gradient(180deg, rgba(7,10,16,.88), rgba(7,10,16,.72))';
      launchLoadingOverlay.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:20px 24px;border-radius:18px;background:rgba(0,0,0,.30);backdrop-filter:blur(8px);box-shadow:0 18px 50px rgba(0,0,0,.30);max-width:min(88vw,360px);font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff">
          <div style="width:34px;height:34px;border-radius:999px;border:3px solid rgba(255,255,255,.28);border-top-color:#fff;animation:hvLaunchSpin .85s linear infinite"></div>
          <div style="font-weight:800;font-size:17px;letter-spacing:.2px">Loading HomeView</div>
          <div id="hvLaunchLoadingText" style="font-size:13px;line-height:1.45;opacity:.86">${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        </div>
      `;
    }catch(_){ try{ setLaunchLoadingText(message); }catch(__){} }
  }

  // ========== Environment flags ==========
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    || (window.innerWidth <= 640);
  const SHOULD_COLLAPSE_CONTROLS_ON_INTERIOR = IS_MOBILE;

  // ===== HomeView UX defaults (2026 UX polish pass) =====
  const DEFAULT_MORTGAGE_RATE_APR = 3.6;
  const DEFAULT_MORTGAGE_TERM_YEARS = 25;
  const DEFAULT_INTERIOR_FOV_DEG = 100;
  let currentModelQualityPreset = 'standard';
  let cameraJoystickEnabledByUser = true;
  let minimapEnabledByUser = !IS_MOBILE; // Mobile UX: no minimap on phones/tablets by default.
  let autoHideUIEnabled = false; // HomeView v56: auto-hide removed completely.
  var navigationLabelsEnabled = true;
  var infoLabelsEnabled = false;
  let uiAutoHidden = false;
  let presentationModeActive = false;
  let presentationSavedState = null;
  let reloadActiveInteriorForModelQuality = function(){};

  function normalizePoiType(type){
    return String(type || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  }
  const AMENITY_STYLE_BY_TYPE = {
    'hospital': { color:'#2e7d57', bg:'#e8f5ee', icon:'🏥', label:'Hospital' },
    'atm': { color:'#b28704', bg:'#fff8df', icon:'💳', label:'ATM' },
    'gas station': { color:'#d66b00', bg:'#fff1e2', icon:'⛽', label:'Gas Station' },
    'park': { color:'#3f8f3f', bg:'#eaf7e8', icon:'🌳', label:'Park' },
    'school': { color:'#d57900', bg:'#fff2df', icon:'🎓', label:'School' },
    'shopping mall': { color:'#8e44ad', bg:'#f4eafa', icon:'🛍️', label:'Shopping Mall' },
    'subway station': { color:'#1565c0', bg:'#e7f0fb', icon:'🚇', label:'Subway Station' },
    'supermarket': { color:'#c62828', bg:'#fdeaea', icon:'🛒', label:'Supermarket' },
    'restaurant': { color:'#d84315', bg:'#fff0e9', icon:'🍽️', label:'Restaurant' },
    'cafe': { color:'#795548', bg:'#f3ede9', icon:'☕', label:'Cafe' },
    'bank': { color:'#546e7a', bg:'#eef3f5', icon:'🏦', label:'Bank' },
    'pharmacy': { color:'#00897b', bg:'#e3f6f3', icon:'💊', label:'Pharmacy' },
    'future projects': { color:'#d32f2f', bg:'#ffebee', icon:'🏗️', label:'Future Projects' }
  };
  function getAmenityStyle(type){
    const key = normalizePoiType(type);
    if(AMENITY_STYLE_BY_TYPE[key]) return AMENITY_STYLE_BY_TYPE[key];
    const title = key ? key.replace(/\b\w/g, function(c){ return c.toUpperCase(); }) : 'Amenity';
    return { color:'#455a64', bg:'#edf2f4', icon:'📍', label:title };
  }
  function getAmenityDisplayLabel(type){ return getAmenityStyle(type).label; }
  function getAmenityIcon(type){ return getAmenityStyle(type).icon; }

  // ========== Cesium Viewer ==========
  // IMPORTANT:
  // 1) Cesium.Ion.defaultAccessToken must be set in index.html BEFORE this file loads.
  // 2) We use the same "global 3D tiles" architecture that worked in Cesium Sandcastle.
  let viewer = new Cesium.Viewer("cesiumContainer", {
    timeline: false,
    animation: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    globe: false,
    skyAtmosphere: new Cesium.SkyAtmosphere(),
    infoBox: false,
    selectionIndicator: false,
    shadows: false,
    shouldAnimate: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    contextOptions: {
      webgl: {
        powerPreference: IS_MOBILE ? 'low-power' : 'high-performance',
        antialias: false,
        alpha: false,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false
      }
    },
    useBrowserRecommendedResolution: IS_IOS ? true : false,
    msaaSamples: IS_MOBILE ? 1 : (IS_IOS ? 2 : 4),
  });

  function hideBuiltInCesiumButtons(){
    try{
      ['.cesium-home-button','.cesium-navigation-help-button','.cesium-viewer-toolbar','.cesium-fullscreenButton'].forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(el){ el.style.display = 'none'; });
      });
    }catch(_){ }
  }
  hideBuiltInCesiumButtons();
  setTimeout(hideBuiltInCesiumButtons, 500);

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
  }catch(_){}

  try{ const fxaa = viewer.scene.postProcessStages.fxaa; if (fxaa) fxaa.enabled = !IS_MOBILE; }catch(e){}

  // Disable Cesium's default picked-entity double-click zoom. HomeView controls all camera targets explicitly.
  try{ viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK); }catch(_){ }
  try{ viewer.screenSpaceEventHandler && viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK); }catch(_){ }

  // current view mode (needed for FOV slider)
  let currentMode = 'exterior';
  // Room model state is declared early because camera-framing helpers may run before the room loader block initializes.
  let activeRoomModelState = null;

  // Compatibility for older marker-preview code paths.
  // Some generated editor code still references modelEntities directly.
  // Keep it as a safe empty/alias array so preview never crashes.
  var modelEntities = (typeof interiorEntitiesByBuilding !== 'undefined' && interiorEntitiesByBuilding)
    ? interiorEntitiesByBuilding
    : [];


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
  function hasTextValue(v){ return v !== undefined && v !== null && String(v).trim() !== ''; }
  function isLikelyModelUrl(rawUrl){
    const s = String(rawUrl || '').trim().toLowerCase();
    if(!s) return false;
    if(s.startsWith('blob:')) return true;
    return s.includes('.glb') || s.includes('.gltf');
  }
  function firstFilled(){
    for (let i=0;i<arguments.length;i++){
      if (hasTextValue(arguments[i])) return String(arguments[i]).trim();
    }
    return '';
  }
  function getItemDisplayName(item, fallback){
    return firstFilled(item && item.unit_name, item && item.name, item && item.title, fallback || '');
  }
  function getItemDescription(item, fallbackRow){
    const d = firstFilled(item && item.description, item && item.desc, item && item.about);
    if (d) return d;
    return firstFilled(fallbackRow && fallbackRow.description, fallbackRow && fallbackRow.desc, fallbackRow && fallbackRow.about);
  }


  // ===== Room-to-Room 3D Loading =====
  // v44 manual camera pose: label picking follows the active room model, not only the original unit model.
  // Recommended Sheet format per unit:
  // room_model_items = "key|Label|model_url|model_heading|camera_x,camera_y,camera_z|camera_heading|audio_url; bedroom|Bedroom|https://.../bedroom.glb|90|0,-1.8,1.6|180|https://.../bedroom.mp3"
  // Clickable 3D labels can use actionType=open_room_model and actionValue=room key.
  function hvSlugifyRoomKey(s){
    return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'') || 'room';
  }
  function getRoomModelItemsRaw(meta, row){
    return firstFilled(
      meta && meta.room_model_items,
      meta && meta.room_models,
      meta && meta.room_model_urls,
      meta && meta.modular_room_models,
      row && row.room_model_items,
      row && row.room_models,
      row && row.room_model_urls
    );
  }
  function parseRoomModelItems(meta, row){
    const raw = getRoomModelItemsRaw(meta, row);
    if(!raw) return [];
    const items = [];
    String(raw).split(/;|\r?\n/).forEach(function(chunk){
      const s = String(chunk || '').trim();
      if(!s) return;
      const parts = s.split('|').map(function(x){ return String(x || '').trim(); });
      let key='', label='', url='', modelHeading='', cameraXyz='', cameraHeading='', audioUrl='';
      if(parts.length >= 3){
        if(isLikelyModelUrl(parts[1])){
          // Compact format: Label|URL|model_heading|camera_x,camera_y,camera_z|camera_heading
          label = parts[0] || 'Room';
          key = hvSlugifyRoomKey(label);
          url = parts[1];
          modelHeading = parts[2] || '';
          cameraXyz = parts[3] || '';
          cameraHeading = parts[4] || '';
          audioUrl = parts[5] || '';
        }else{
          // Recommended format: key|Label|URL|model_heading|camera_x,camera_y,camera_z|camera_heading
          key = hvSlugifyRoomKey(parts[0]);
          label = parts[1] || parts[0] || 'Room';
          url = parts[2];
          modelHeading = parts[3] || '';
          cameraXyz = parts[4] || '';
          cameraHeading = parts[5] || '';
          audioUrl = parts[6] || '';
        }
      }else if(parts.length >= 2){
        label = parts[0] || 'Room';
        key = hvSlugifyRoomKey(label);
        url = parts[1];
        modelHeading = parts[2] || '';
        cameraXyz = parts[3] || '';
        cameraHeading = parts[4] || '';
        audioUrl = parts[5] || '';
      }
      if(!key) key = hvSlugifyRoomKey(label);
      if(label && isLikelyModelUrl(url)) items.push({
        key:key,
        label:label,
        url:url,
        heading:modelHeading,
        modelHeading:modelHeading,
        model_heading:modelHeading,
        cameraXyz:cameraXyz,
        camera_xyz:cameraXyz,
        cameraHeading:cameraHeading,
        camera_heading:cameraHeading,
        audioUrl:audioUrl,
        audio_url:audioUrl
      });
    });
    return items;
  }
  function getRoomModelItem(meta, row, keyOrLabel){
    const needle = hvSlugifyRoomKey(keyOrLabel);
    return parseRoomModelItems(meta, row).find(function(it){
      return hvSlugifyRoomKey(it.key) === needle || hvSlugifyRoomKey(it.label) === needle;
    }) || null;
  }
  function hasRoomModelItems(meta, row){ return parseRoomModelItems(meta, row).length > 0; }

function normalizeHeaderKey(k){
  return String(k==null?'':k).trim().toLowerCase()
    .replace(/[\u200b\u200c\u200d\ufeff]/g,'')
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'');
}
function canonicalizeRow(row){
  const out = {};
  if(!row || typeof row !== 'object') return out;
  Object.keys(row).forEach(function(key){
    const v = row[key];
    out[key] = v;
    const nk = normalizeHeaderKey(key);
    if(!(nk in out)) out[nk] = v;
  });

  // Common aliases for unit fields
  if(!hasTextValue(out.beds) && hasTextValue(out.bedrooms)) out.beds = out.bedrooms;
  if(!hasTextValue(out.bedrooms) && hasTextValue(out.beds)) out.bedrooms = out.beds;

  if(!hasTextValue(out.bathrooms) && hasTextValue(out.baths)) out.bathrooms = out.baths;
  if(!hasTextValue(out.baths) && hasTextValue(out.bathrooms)) out.baths = out.bathrooms;

  if(!hasTextValue(out.area) && hasTextValue(out.square_footage)) out.area = out.square_footage;
  if(!hasTextValue(out.square_footage) && hasTextValue(out.area)) out.square_footage = out.area;

  if(!hasTextValue(out.price) && hasTextValue(out.estimated_price)) out.price = out.estimated_price;
  if(!hasTextValue(out.estimated_price) && hasTextValue(out.price)) out.estimated_price = out.price;

  if(!hasTextValue(out.parking_spaces) && hasTextValue(out.total_parking_spaces)) out.parking_spaces = out.total_parking_spaces;
  if(!hasTextValue(out.total_parking_spaces) && hasTextValue(out.parking_spaces)) out.total_parking_spaces = out.parking_spaces;

  if(!hasTextValue(out.year_built) && hasTextValue(out.year_built_completion)) out.year_built = out.year_built_completion;
  if(!hasTextValue(out.year_built) && hasTextValue(out.completion_year)) out.year_built = out.completion_year;

  return out;
}


function parseFutureProjects(raw){
  return String(raw||'')
    .split(/;|\r?\n/)
    .map(function(chunk){
      const s = String(chunk||'').trim();
      if(!s) return null;
      const parts = s.split('|').map(function(x){ return String(x||'').trim(); });
      if(parts.length < 6) return null;
      const name = parts[0];
      const lat = toNum(parts[1]);
      const lng = toNum(parts[2]);
      const height = Math.max(6, toNum(parts[3]) || 20);
      const scale = Math.max(12, toNum(parts[4]) || 24);
      const completion = parts[5];
      if(!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { name, lat, lng, height, scale, completion };
    })
    .filter(Boolean);
}
  function getExplicitItemType(item){
    const explicit = firstFilled(item && item.category, item && item.type, item && item.kind, item && item.item_type)
      .toLowerCase()
      .replace(/\s+/g,'_')
      .replace(/-/g,'_');
    if(!explicit) return '';
    if(explicit.includes('future')) return 'future_project';
    if(explicit.includes('amenity')) return 'amenity';
    if((explicit.includes('embedded') || explicit.includes('cutout') || explicit.includes('terrain_cut') || explicit.includes('cesium_cut')) && (explicit.includes('panorama') || explicit.includes('360'))) return 'embedded_panorama';
    if((explicit.includes('embedded') || explicit.includes('cutout') || explicit.includes('terrain_cut') || explicit.includes('cesium_cut')) && explicit.includes('unit')) return 'embedded_unit';
    if(explicit.includes('panorama') || explicit.includes('360')) return 'panorama';
    if(explicit === 'unit') return 'unit';
    return explicit;
  }
  function isPanoramaRow(item){
    const explicit = getExplicitItemType(item);
    return explicit === 'panorama' || explicit === 'embedded_panorama';
  }
  function isEmbeddedInteriorRow(item){
    const explicit = getExplicitItemType(item);
    if(explicit === 'embedded_unit' || explicit === 'embedded_panorama') return true;
    const raw = firstFilled(
      item && item.clip_mode,
      item && item.clipping_mode,
      item && item.terrain_clip_mode,
      item && item.cesium_clip_mode,
      item && item.clip_in_cesium,
      item && item.use_clipping,
      item && item.embedded_in_cesium,
      item && item.model_embed_type
    ).toLowerCase();
    return !!raw && /clip|cut|embedded|inset|terrain/.test(raw);
  }

  function isAmenityRow(item){
    if(!item) return false;
    const explicit = getExplicitItemType(item);
    if (explicit === 'panorama') return false;
    if (explicit.includes('amenity')) return true;
    if (explicit === 'unit') return false;

    const hasModel = hasTextValue(item.model_url);

    // Only fields that actually describe a saleable unit should make this a unit.
    const hasUnitIdentity = [
      item.list_price, item.price, item.estimated_price_unit, item.estimated_price,
      item.bedrooms, item.beds, item.bed,
      item.bathrooms, item.baths, item.bath,
      item.area_m2, item.area_sqm, item.area_sqft, item.area, item.square_footage,
      item.floor, item.level, item.exposure, item.unit_number
    ].some(hasTextValue);

    const hasBasicAmenityContent = [
      getItemDisplayName(item),
      getItemDescription(item)
    ].some(hasTextValue);

    // Any selectable item with no true unit identity should be treated as an amenity,
    // even if it has maintenance/year/parking or a 3D model.
    if (!hasUnitIdentity && hasBasicAmenityContent) return true;
    if (!hasModel && hasBasicAmenityContent) return true;
    return false;
  }
  function isUnitRow(item){ return !!item && !isAmenityRow(item) && !isPanoramaRow(item); }

  // ========== 3D Tiles ==========
  let GOOGLE_3D_TILES = null;
  let desiredMSE = IS_MOBILE ? (IS_IOS ? 20 : 18) : 12;

// v40 stability: during GLB creation, temporarily reduce Cesium render / tile pressure.
// Do not hide Google 3D Tiles because the loading overlay is transparent; instead, make
// the scene cheaper while the model is being decoded/created, then restore the user's preset.
const HV_MOBILE_LOADING_RESOLUTION_SCALE = 0.72;
const HV_DESKTOP_LOADING_RESOLUTION_SCALE = 0.75;
let hvModelLoadModeSnapshot = null;
function hvSetMobileModelLoadMode(active){
  try{
    if(!viewer || !viewer.scene) return;
    if(active){
      if(!hvModelLoadModeSnapshot){
        const fxaaStage = viewer.scene && viewer.scene.postProcessStages ? viewer.scene.postProcessStages.fxaa : null;
        hvModelLoadModeSnapshot = {
          resolutionScale: viewer.resolutionScale,
          fxaaEnabled: fxaaStage ? fxaaStage.enabled : null,
          msaaSamples: ('msaaSamples' in viewer.scene) ? viewer.scene.msaaSamples : null,
          tilesMSE: GOOGLE_3D_TILES ? GOOGLE_3D_TILES.maximumScreenSpaceError : null,
          cacheBytes: GOOGLE_3D_TILES ? GOOGLE_3D_TILES.cacheBytes : null,
          maximumCacheOverflowBytes: GOOGLE_3D_TILES ? GOOGLE_3D_TILES.maximumCacheOverflowBytes : null
        };
      }
      viewer.resolutionScale = IS_MOBILE ? HV_MOBILE_LOADING_RESOLUTION_SCALE : HV_DESKTOP_LOADING_RESOLUTION_SCALE;
      try{ const fxaaStage = viewer.scene.postProcessStages.fxaa; if(fxaaStage) fxaaStage.enabled = false; }catch(_){ }
      try{ if('msaaSamples' in viewer.scene) viewer.scene.msaaSamples = 1; }catch(_){ }
      if(GOOGLE_3D_TILES){
        GOOGLE_3D_TILES.maximumScreenSpaceError = IS_MOBILE ? Math.max(desiredMSE, 24) : Math.max(desiredMSE, 48);
        // Keep tile memory lower while loading. Cesium treats this as a soft cache target.
        try{ GOOGLE_3D_TILES.cacheBytes = IS_MOBILE ? 96 * 1024 * 1024 : 192 * 1024 * 1024; }catch(_){ }
        try{ GOOGLE_3D_TILES.maximumCacheOverflowBytes = IS_MOBILE ? 32 * 1024 * 1024 : 64 * 1024 * 1024; }catch(_){ }
        try{ GOOGLE_3D_TILES.trimLoadedTiles && GOOGLE_3D_TILES.trimLoadedTiles(); }catch(_){ }
      }
    }else{
      const snap = hvModelLoadModeSnapshot;
      hvModelLoadModeSnapshot = null;
      if(snap){
        if(Number.isFinite(Number(snap.resolutionScale))) viewer.resolutionScale = snap.resolutionScale;
        try{ const fxaaStage = viewer.scene.postProcessStages.fxaa; if(fxaaStage && snap.fxaaEnabled !== null) fxaaStage.enabled = snap.fxaaEnabled; }catch(_){ }
        try{ if('msaaSamples' in viewer.scene && snap.msaaSamples !== null) viewer.scene.msaaSamples = snap.msaaSamples; }catch(_){ }
        if(GOOGLE_3D_TILES){
          try{ GOOGLE_3D_TILES.maximumScreenSpaceError = (snap.tilesMSE !== null && snap.tilesMSE !== undefined) ? snap.tilesMSE : desiredMSE; }catch(_){ }
          try{ if(snap.cacheBytes !== null && snap.cacheBytes !== undefined) GOOGLE_3D_TILES.cacheBytes = snap.cacheBytes; }catch(_){ }
          try{ if(snap.maximumCacheOverflowBytes !== null && snap.maximumCacheOverflowBytes !== undefined) GOOGLE_3D_TILES.maximumCacheOverflowBytes = snap.maximumCacheOverflowBytes; }catch(_){ }
        }
      }else if(GOOGLE_3D_TILES){
        try{ GOOGLE_3D_TILES.maximumScreenSpaceError = desiredMSE; }catch(_){ }
      }
    }
    requestSceneRenderBurst(4);
  }catch(_){ }
}

  // v45: cache sampled surface heights. Room switching used to call sampleHeightMostDetailed
  // for every room model, which can block model creation and make later room loads feel extremely slow.
  const hvSurfaceHeightCache = new Map();

  // Use the same global 3D tiles asset pattern that works in Cesium Sandcastle.
  (async function(){
    try{
      GOOGLE_3D_TILES = await Cesium.Cesium3DTileset.fromIonAssetId(2275207);
      viewer.scene.primitives.add(GOOGLE_3D_TILES);
      await GOOGLE_3D_TILES.readyPromise;
      GOOGLE_3D_TILES.maximumScreenSpaceError = desiredMSE;
    }catch(e){
      console.warn('Global 3D Tiles not loaded:', e);
    }
  })();

  function setCesiumGroundVisible(visible){
    try{
      if(GOOGLE_3D_TILES) GOOGLE_3D_TILES.show = !!visible;
    }catch(_){ }
    requestSceneRenderBurst(2);
  }

  async function getSurfaceHeight(lon, lat){
    const lonN = Number(lon);
    const latN = Number(lat);
    const key = (Number.isFinite(lonN) ? lonN.toFixed(7) : String(lon)) + ',' + (Number.isFinite(latN) ? latN.toFixed(7) : String(lat));
    try{
      const cached = hvSurfaceHeightCache.get(key);
      if(typeof cached === 'number') return cached;
      if(cached && cached.promise) return await cached.promise;
    }catch(_){ }

    const promise = (async function(){
      const carto = Cesium.Cartographic.fromDegrees(lonN, latN);
      if (GOOGLE_3D_TILES) {
        try {
          await GOOGLE_3D_TILES.readyPromise;
          const h = await Cesium.sampleHeightMostDetailed(GOOGLE_3D_TILES, carto);
          const v = Number.isFinite(h) ? h : 0;
          try{ hvSurfaceHeightCache.set(key, v); }catch(_){ }
          return v;
        } catch(e){}
      }
      // Do not cache fallback 0 here. Google 3D Tiles may not be ready yet;
      // caching 0 would permanently place POIs/buildings at sea level until reload.
      return 0;
    })();

    try{ hvSurfaceHeightCache.set(key, { promise: promise }); }catch(_){ }
    return await promise;
  }

  async function clampDataSourceToSurface(ds){
    if(!ds) return;
    for (var i=0;i<ds.entities.values.length;i++){
      const ent = ds.entities.values[i];
      const props = ent.properties; if(!props) continue;
      const plat = props.baseLat && props.baseLat.getValue ? props.baseLat.getValue() : null;
      const plng = props.baseLng && props.baseLng.getValue ? props.baseLng.getValue() : null;
      const groundOffset = props.groundOffset && props.groundOffset.getValue ? Number(props.groundOffset.getValue()) : 0;
      const isLeaderLine = props.hvPoiLeaderLine && props.hvPoiLeaderLine.getValue ? !!props.hvPoiLeaderLine.getValue() : false;
      const isGroundAnchor = props.hvPoiGroundAnchor && props.hvPoiGroundAnchor.getValue ? !!props.hvPoiGroundAnchor.getValue() : false;
      if(plat==null||plng==null) continue;
      try{
        const h = await getSurfaceHeight(plng, plat);
        const groundZ = (h || 0) + 0.8;
        const topZ = (h || 0) + groundOffset;
        if(isLeaderLine && ent.polyline){
          ent.polyline.positions = new Cesium.ConstantProperty([
            Cesium.Cartesian3.fromDegrees(plng, plat, groundZ),
            Cesium.Cartesian3.fromDegrees(plng, plat, topZ)
          ]);
        }else if(isGroundAnchor){
          ent.position = Cesium.Cartesian3.fromDegrees(plng, plat, groundZ);
        }else{
          ent.position = Cesium.Cartesian3.fromDegrees(plng, plat, topZ);
        }
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


  // ===== Selected Unit Exterior Reveal =====
  // Optional Sheet columns per unit:
  // exterior_marker_offset = "x,y,z"  (local meters from the unit model origin)
  // exterior_marker_scale  = "x,y,z" or a single number  (box dimensions in meters)
  let selectedUnitExteriorMarkerEntity = null;
  let selectedUnitExteriorRevealToken = 0;

  function parseVector3Value(raw, fallback){
    const fb = fallback || { x:0, y:0, z:0 };
    if(raw === undefined || raw === null || String(raw).trim() === '') return { x:fb.x, y:fb.y, z:fb.z };
    const nums = (String(raw).match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
    if(nums.length >= 3) return { x:nums[0], y:nums[1], z:nums[2] };
    if(nums.length === 1) return { x:nums[0], y:nums[0], z:nums[0] };
    return { x:fb.x, y:fb.y, z:fb.z };
  }

  function getExteriorMarkerOffset(meta){
    return parseVector3Value(firstFilled(
      meta && meta.exterior_marker_offset,
      meta && meta.exterior_marker_xyz,
      meta && meta.unit_exterior_marker_offset,
      meta && meta.unit_marker_offset,
      meta && meta.marker_offset
    ), { x:0, y:0, z:0 });
  }

  function getExteriorMarkerScale(meta){
    return parseVector3Value(firstFilled(
      meta && meta.exterior_marker_scale,
      meta && meta.exterior_marker_size,
      meta && meta.unit_exterior_marker_scale,
      meta && meta.unit_marker_scale,
      meta && meta.marker_scale
    ), { x:8, y:3, z:4 });
  }

  function hasExteriorMarkerConfig(meta){
    return !!firstFilled(
      meta && meta.exterior_marker_offset,
      meta && meta.exterior_marker_xyz,
      meta && meta.unit_exterior_marker_offset,
      meta && meta.unit_marker_offset,
      meta && meta.marker_offset
    );
  }

  async function getUnitModelOriginAndFrame(buildingRow, unitRow){
    const baseLon = toNum(buildingRow.lng), baseLat = toNum(buildingRow.lat), baseH = toNum(buildingRow.height) || 20;
    const baseSurfaceH = await getSurfaceHeight(baseLon, baseLat);
    const offE = toNum(unitRow.offset_east_m) || 0;
    const offN = toNum(unitRow.offset_north_m) || 0;
    const offU = toNum(unitRow.offset_up_m) || 0;
    const pos = placeWithEnuOffset(baseLon, baseLat, baseSurfaceH + baseH, offE, offN, offU);
    const hd = parseFirstNumber(unitRow.heading != null ? unitRow.heading : buildingRow.heading) || 0;
    const hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(hd),
      Cesium.Math.toRadians(toNum(unitRow.pitch) || 0),
      Cesium.Math.toRadians(toNum(unitRow.roll) || 0)
    );
    const frame = Cesium.Transforms.headingPitchRollToFixedFrame(pos, hpr);
    return { pos: pos, frame: frame, hpr: hpr };
  }

  function getLoadedInteriorEntityFrame(activeInteriorEntity){
    try{
      const anchor = activeInteriorEntity && activeInteriorEntity.anchorEntity ? activeInteriorEntity.anchorEntity : activeInteriorEntity;
      const now = Cesium.JulianDate.now();
      const posProp = anchor && anchor.position;
      const oriProp = anchor && anchor.orientation;
      const pos = posProp && posProp.getValue ? posProp.getValue(now) : null;
      const ori = oriProp && oriProp.getValue ? oriProp.getValue(now) : null;
      if(pos && ori){
        const rot = Cesium.Matrix3.fromQuaternion(ori, new Cesium.Matrix3());
        const frame = Cesium.Matrix4.fromRotationTranslation(rot, pos, new Cesium.Matrix4());
        return { pos: pos, frame: frame };
      }
      if(pos){
        const frame = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
        return { pos: pos, frame: frame };
      }
    }catch(_){ }
    return null;
  }

  async function getExteriorMarkerPosition(buildingRow, unitRow, activeInteriorEntity){
    // Prefer the actual loaded interior model origin. This keeps the green marker tied to the same origin
    // as the selected 3D unit, instead of accidentally behaving like it is based on the building model.
    const origin = getLoadedInteriorEntityFrame(activeInteriorEntity) || await getUnitModelOriginAndFrame(buildingRow, unitRow);
    const off = getExteriorMarkerOffset(unitRow);
    const local = new Cesium.Cartesian3(off.x || 0, off.y || 0, off.z || 0);
    return Cesium.Matrix4.multiplyByPoint(origin.frame, local, new Cesium.Cartesian3());
  }

  function clearSelectedUnitExteriorMarker(options){
    const preserveRevealToken = !!(options && options.preserveRevealToken);
    if(!preserveRevealToken) selectedUnitExteriorRevealToken += 1;
    if(selectedUnitExteriorMarkerEntity){
      try{ viewer.entities.remove(selectedUnitExteriorMarkerEntity); }catch(_){ }
      selectedUnitExteriorMarkerEntity = null;
    }
    requestSceneRenderBurst(2);
  }

  async function showSelectedUnitExteriorMarker(buildingRow, unitRow, activeInteriorEntity, options){
    // Do not invalidate the active reveal token while creating/replacing the marker.
    // The previous version reset the token here, so the reveal was cancelled immediately.
    const forceCreate = !!(options && options.forceCreate);
    clearSelectedUnitExteriorMarker({ preserveRevealToken:true });
    if(!forceCreate && !hasExteriorMarkerConfig(unitRow)) return null;
    const markerPos = await getExteriorMarkerPosition(buildingRow, unitRow, activeInteriorEntity);
    const s = getExteriorMarkerScale(unitRow);
    const dims = new Cesium.Cartesian3(
      Math.max(0.4, Math.abs(s.x || 6)),
      Math.max(0.4, Math.abs(s.y || 2.2)),
      Math.max(0.4, Math.abs(s.z || 3.2))
    );
    selectedUnitExteriorMarkerEntity = viewer.entities.add({
      name: 'Selected Unit Location',
      show: true,
      position: markerPos,
      box: {
        dimensions: dims,
        material: Cesium.Color.LIME.withAlpha(0.50),
        outline: true,
        outlineColor: Cesium.Color.WHITE
      },
      point: {
        pixelSize: 14,
        color: Cesium.Color.LIME,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: getItemDisplayName(unitRow, 'Selected Unit'),
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.48),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -30),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    requestSceneRenderBurst(4);
    return markerPos;
  }

  function setSelectedUnitExteriorMarkerDimensions(scaleVec){
    if(!selectedUnitExteriorMarkerEntity || !selectedUnitExteriorMarkerEntity.box) return;
    const s = scaleVec || { x:6, y:2.2, z:3.2 };
    selectedUnitExteriorMarkerEntity.box.dimensions = new Cesium.ConstantProperty(new Cesium.Cartesian3(
      Math.max(0.4, Math.abs(Number(s.x) || 6)),
      Math.max(0.4, Math.abs(Number(s.y) || 2.2)),
      Math.max(0.4, Math.abs(Number(s.z) || 3.2))
    ));
    requestSceneRenderBurst(3);
  }

  async function updateSelectedUnitExteriorMarkerPosition(buildingRow, unitRow, activeInteriorEntity){
    if(!selectedUnitExteriorMarkerEntity || !hasExteriorMarkerConfig(unitRow)) return null;
    const markerPos = await getExteriorMarkerPosition(buildingRow, unitRow, activeInteriorEntity);
    selectedUnitExteriorMarkerEntity.position = markerPos;
    setSelectedUnitExteriorMarkerDimensions(getExteriorMarkerScale(unitRow));
    requestSceneRenderBurst(3);
    return markerPos;
  }

  async function flyToSelectedUnitExteriorMarker(buildingRow, unitRow, activeInteriorEntity){
    const markerPos = selectedUnitExteriorMarkerEntity
      ? (selectedUnitExteriorMarkerEntity.position && selectedUnitExteriorMarkerEntity.position.getValue ? selectedUnitExteriorMarkerEntity.position.getValue(Cesium.JulianDate.now()) : null)
      : await getExteriorMarkerPosition(buildingRow, unitRow, activeInteriorEntity);
    if(!markerPos) return;
    const lon = toNum(buildingRow.lng), lat = toNum(buildingRow.lat);
    const height = Math.max(20, toNum(buildingRow.height) || 20);
    const scale = Math.max(10, toNum(buildingRow.scale) || 10);
    const center = await getBuildingSurfacePosition(lon, lat, height);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const worldUp = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian3());
    const dist = Math.max(scale * 34, height * 12, 85);
    const lift = Math.max(6, height * 0.055);
    const destination = makeRevealCameraPosition(center, markerPos, dist, lift);
    stopCameraTracking();
    setExteriorMouseBindings();
    await flyCameraLookAtTarget(destination, markerPos, IS_MOBILE ? 1.6 : 2.2, worldUp);
  }

  function makeLookAtOrientation(cameraPosition, targetPosition, fallbackUp){
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(targetPosition, cameraPosition, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    let up = Cesium.Cartesian3.clone(fallbackUp || Cesium.Cartesian3.UNIT_Z);
    const dot = Cesium.Cartesian3.dot(direction, up);
    const projected = Cesium.Cartesian3.subtract(
      up,
      Cesium.Cartesian3.multiplyByScalar(direction, dot, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    if(Cesium.Cartesian3.magnitude(projected) > 0.0001){
      up = Cesium.Cartesian3.normalize(projected, projected);
    }
    return { direction: direction, up: up };
  }

  function makeRevealCameraPosition(center, markerPos, distance, heightLift){
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
    const localMarker = Cesium.Matrix4.multiplyByPoint(inv, markerPos, new Cesium.Cartesian3());
    let horizontal = new Cesium.Cartesian3(localMarker.x || 0, localMarker.y || 0, 0);
    if(Cesium.Cartesian3.magnitude(horizontal) < 0.001){
      horizontal = new Cesium.Cartesian3(0, 1, 0);
    }
    horizontal = Cesium.Cartesian3.normalize(horizontal, horizontal);
    const camLocal = new Cesium.Cartesian3(
      localMarker.x - horizontal.x * distance,
      localMarker.y - horizontal.y * distance,
      localMarker.z + (heightLift || 0)
    );
    return Cesium.Matrix4.multiplyByPoint(enu, camLocal, new Cesium.Cartesian3());
  }

  async function flyCameraLookAtTarget(destination, target, duration, fallbackUp){
    if(!destination || !target) return;
    const orientation = makeLookAtOrientation(destination, target, fallbackUp);
    await new Promise(function(resolve){
      viewer.camera.flyTo({
        destination: destination,
        orientation: orientation,
        duration: Math.max(0.1, Number(duration) || 1.0),
        complete: resolve,
        cancel: resolve
      });
    });
    requestSceneRenderBurst(4);
  }

  
  async function playSelectedUnitExteriorReveal(bIdx, unitRow, modelLoadPromise){
    const token = ++selectedUnitExteriorRevealToken;
    const buildingRow = buildingsData[bIdx] || {};
    if(!unitRow || !hasExteriorMarkerConfig(unitRow)) return;
    try{
      const loadedInteriorEntity = await Promise.resolve(modelLoadPromise).catch(function(){ return null; });
      if(token !== selectedUnitExteriorRevealToken || !loadedInteriorEntity) return;

      const markerPos = await showSelectedUnitExteriorMarker(buildingRow, unitRow, loadedInteriorEntity);
      if(token !== selectedUnitExteriorRevealToken || !markerPos) return;

      setCesiumGroundVisible(true);
      setCameraCollision(true);
      setExteriorMouseBindings();
      interiorNav.disable();
      setJoystickVisible(false);

      const lon = toNum(buildingRow.lng), lat = toNum(buildingRow.lat);
      const height = Math.max(20, toNum(buildingRow.height) || 20);
      const scale = Math.max(10, toNum(buildingRow.scale) || 10);
      const center = await getBuildingSurfacePosition(lon, lat, height);
      if(token !== selectedUnitExteriorRevealToken) return;

      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
      const worldUp = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian3());
      const revealStartedAt = performance.now();
      stopCameraTracking();

      // If exterior_marker_camera exists, it owns the reveal path.
      // No old auto-angle fly, no second zoom stage, no pause between two camera moves.
      const savedCam = hvParseMarkerCamera(hvGetMarkerCameraTextFromMeta(unitRow));
      const savedDestination = savedCam ? hvGetCameraPositionFromMarkerCamera(markerPos, savedCam) : null;

      if(savedDestination){
        await flyCameraLookAtTarget(savedDestination, markerPos, IS_MOBILE ? 3.4 : 4.2, worldUp);
        if(token !== selectedUnitExteriorRevealToken) return;
      }else{
        const farDistance = Math.max(scale * 44, height * 16, 115);
        const farLift = Math.max(8, height * 0.08);
        const fallbackDestination = makeRevealCameraPosition(center, markerPos, farDistance, farLift);
        await flyCameraLookAtTarget(fallbackDestination, markerPos, IS_MOBILE ? 3.2 : 4.0, worldUp);
        if(token !== selectedUnitExteriorRevealToken) return;
      }

      const minimumRevealMs = 5000;
      const elapsedRevealMs = performance.now() - revealStartedAt;
      if(elapsedRevealMs < minimumRevealMs){
        await waitMs(minimumRevealMs - elapsedRevealMs);
      }
    }catch(err){
      console.warn('Selected unit exterior reveal skipped:', err);
    }
  }


  function requestSceneRender(){
    try{ viewer.scene.requestRender(); }catch(_){ }
  }

  function requestSceneRenderBurst(count = 3, delayMs = 16){
    let remaining = Math.max(1, count | 0);
    function tick(){
      requestSceneRender();
      remaining -= 1;
      if (remaining > 0) {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
        else setTimeout(tick, delayMs);
      }
    }
    tick();
  }

  function setCameraCollision(enabled){
    try{
      if(viewer && viewer.scene && viewer.scene.screenSpaceCameraController){
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = !!enabled;
      }
    }catch(_){ }
  }

  let activeInteriorClipTiles = null;
  let activeInteriorClipGlobe = null;
  let activeInteriorClipSignature = '';

  function parseClipPolygonDegrees(raw){
    const s = String(raw || '').trim();
    if(!s) return [];
    const nums = (s.match(/-?\d+(?:\.\d+)?/g) || []).map(function(v){ return Number(v); }).filter(Number.isFinite);
    if(nums.length < 6) return [];
    if(nums.length % 2 !== 0) nums.pop();
    return nums;
  }
  function getInteriorClipPolygonDegrees(meta, row){
    const raw = firstFilled(
      meta && meta.clipping_polygon,
      meta && meta.clip_polygon,
      meta && meta.clip_polygon_degrees,
      meta && meta.terrain_clip_polygon,
      meta && meta.cesium_clip_polygon,
      meta && meta.ground_clip_polygon,
      meta && meta.building_clip_polygon,
      meta && meta.clip_footprint,
      meta && meta.footprint_polygon,
      row && row.clipping_polygon,
      row && row.clip_polygon,
      row && row.clip_polygon_degrees,
      row && row.terrain_clip_polygon,
      row && row.cesium_clip_polygon,
      row && row.ground_clip_polygon,
      row && row.building_clip_polygon,
      row && row.clip_footprint,
      row && row.footprint_polygon
    );
    return parseClipPolygonDegrees(raw);
  }
  function disableInteriorClip(){
    activeInteriorClipSignature = '';
    if(activeInteriorClipTiles) activeInteriorClipTiles.enabled = false;
    if(activeInteriorClipGlobe) activeInteriorClipGlobe.enabled = false;
    requestSceneRenderBurst(2);
  }
  function enableInteriorClipForSelection(meta, row){
    if(!isEmbeddedInteriorRow(meta)){
      disableInteriorClip();
      return false;
    }
    const degrees = getInteriorClipPolygonDegrees(meta, row);
    if(!degrees.length || degrees.length < 6 || !GOOGLE_3D_TILES){
      disableInteriorClip();
      return false;
    }
    const signature = degrees.join(',');
    if(signature === activeInteriorClipSignature && activeInteriorClipTiles){
      activeInteriorClipTiles.enabled = true;
      if(activeInteriorClipGlobe) activeInteriorClipGlobe.enabled = true;
      requestSceneRenderBurst(2);
      return true;
    }
    activeInteriorClipTiles = new Cesium.ClippingPolygonCollection({
      polygons:[new Cesium.ClippingPolygon({ positions: Cesium.Cartesian3.fromDegreesArray(degrees) })],
      enabled:true,
      inverse:false
    });
    GOOGLE_3D_TILES.clippingPolygons = activeInteriorClipTiles;
    if(viewer && viewer.scene && viewer.scene.globe){
      activeInteriorClipGlobe = new Cesium.ClippingPolygonCollection({
        polygons:[new Cesium.ClippingPolygon({ positions: Cesium.Cartesian3.fromDegreesArray(degrees) })],
        enabled:true,
        inverse:false
      });
      viewer.scene.globe.clippingPolygons = activeInteriorClipGlobe;
    }
    activeInteriorClipSignature = signature;
    requestSceneRenderBurst(2);
    return true;
  }
  function syncInteriorClipForSelection(meta, row, isExterior){
    if(isExterior || !meta){
      disableInteriorClip();
      return false;
    }
    return enableInteriorClipForSelection(meta, row);
  }

  function requestSceneRender(){
    try{ viewer.scene.requestRender(); }catch(_){ }
  }

  function stopCameraTracking(){
    try{ viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); }catch(_){ }
  }


  // ===== HomeView Room Loader Profiling Helper =====
  // v48 fix: createInteriorModel can run outside the room-loader block, so hvRoomPerf must be available globally in this module scope.
  const HV_ROOM_LOAD_PROFILING_GLOBAL = true;
  function hvRoomPerf(label, startTime){
    try{
      if(!HV_ROOM_LOAD_PROFILING_GLOBAL) return;
      const t0 = Number(startTime);
      if(!Number.isFinite(t0)) return;
      const ms = Math.round((performance.now() - t0) * 10) / 10;
      console.log('[HomeView RoomLoad]', String(label || 'step') + ':', ms + 'ms');
    }catch(_){ }
  }


  // ===== Legacy auto-camera helpers (kept for compatibility, not used by v44 room manual pose) =====
  async function hvWaitForModelWorldBoundingSphere(handle, fallbackMeta, maxTries){
    const tries = Math.max(1, maxTries || 18);
    for(let i=0;i<tries;i++){
      try{
        const primitive = handle && handle.modelPrimitive ? handle.modelPrimitive : null;
        const bs = primitive && primitive.boundingSphere ? primitive.boundingSphere : null;
        if(bs && bs.center && Number.isFinite(bs.radius) && bs.radius > 0){
          return Cesium.BoundingSphere.clone(bs, new Cesium.BoundingSphere());
        }
      }catch(_){}

      try{ requestSceneRender(); }catch(_){}
      await waitMs(i < 6 ? 32 : 70);
    }

    // Fallback: use the anchor/pivot only if the model bounding sphere is not ready.
    try{
      const anchor = handle && handle.anchorEntity ? handle.anchorEntity : handle;
      const now = Cesium.JulianDate.now();
      const pos = anchor && anchor.position && anchor.position.getValue ? anchor.position.getValue(now) : null;
      if(pos){
        const fallbackRadius = Math.max(1, parseFirstNumber(fallbackMeta && fallbackMeta.scale) || 4);
        return new Cesium.BoundingSphere(pos, fallbackRadius);
      }
    }catch(_){}

    return null;
  }

  function hvGetInteriorCameraDistance(meta, row, radius, roomKey){
    const key = hvSlugifyRoomKey(roomKey || (activeRoomModelState && activeRoomModelState.currentRoomKey) || '');
    const isSmallWetRoom = /bath|toilet|wash|powder|wc/.test(key);
    const r = Math.max(0.6, Number(radius) || 2.0);

    // Bathroom and powder-room models are often physically small and sometimes have
    // imperfect GLB bounds/pivots. Do not reuse the unit's living-room camera_distance
    // for them; it can put the camera outside the room or force a long bad frame.
    if(isSmallWetRoom){
      return Math.min(Math.max(r * 0.72, 1.05), 2.65);
    }

    const explicit = parseFirstNumber(firstFilled(
      meta && meta.camera_distance,
      meta && meta.interior_camera_distance,
      meta && meta.default_camera_distance,
      row && row.camera_distance,
      row && row.interior_camera_distance,
      row && row.default_camera_distance
    ));
    if(Number.isFinite(explicit) && explicit > 0) return Math.max(0.01, explicit);

    // Automatic fallback for rooms that do not have a useful camera_distance.
    return Math.min(Math.max(r * 0.55, 1.4), 7.0);
  }

  function hvGetActiveRoomLabelWorldSphere(handle, roomKey){
    try{
      if(!handle) return null;
      if(typeof getCurrentSelectionLabels !== 'function') return null;
      const key = hvSlugifyRoomKey(roomKey || (activeRoomModelState && activeRoomModelState.currentRoomKey) || '');
      const anchor = handle.anchorEntity || handle;
      const now = Cesium.JulianDate.now();
      const pos = anchor && anchor.position && anchor.position.getValue ? anchor.position.getValue(now) : null;
      if(!pos) return null;
      let q = null;
      try{ q = anchor.orientation && anchor.orientation.getValue ? anchor.orientation.getValue(now) : null; }catch(_){}
      let matrix = null;
      if(q){
        const rot = Cesium.Matrix3.fromQuaternion(q, new Cesium.Matrix3());
        matrix = Cesium.Matrix4.fromRotationTranslation(rot, pos, new Cesium.Matrix4());
      }else{
        matrix = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
      }

      const pts = [];
      (getCurrentSelectionLabels() || []).forEach(function(it){
        try{
          const itRoom = normalizeLabelRoomKey(it && it.roomKey || '');
          const belongs = key === '__base__' ? (!itRoom || itRoom === '__base__') : (itRoom === key);
          if(!belongs) return;
          const local = new Cesium.Cartesian3(Number(it.x)||0, Number(it.y)||0, Number(it.z)||0);
          pts.push(Cesium.Matrix4.multiplyByPoint(matrix, local, new Cesium.Cartesian3()));
        }catch(_){}
      });
      if(!pts.length) return null;

      const sphere = Cesium.BoundingSphere.fromPoints(pts, new Cesium.BoundingSphere());
      if(!sphere || !sphere.center) return null;
      // One label is still a useful anchor; give it a small room-sized radius.
      sphere.radius = Math.min(Math.max(Number(sphere.radius) || 1.15, 0.9), 3.2);
      sphere.center = Cesium.Cartesian3.clone(sphere.center);
      return sphere;
    }catch(_){ return null; }
  }

  function hvIsSmallRoomKey(roomKey){
    return /bath|toilet|wash|powder|wc/.test(hvSlugifyRoomKey(roomKey || ''));
  }

  function hvGetModelWorldMatrixFromHandle(handle){
    try{
      const anchor = handle && handle.anchorEntity ? handle.anchorEntity : handle;
      const now = Cesium.JulianDate.now();
      const pos = anchor && anchor.position && anchor.position.getValue ? anchor.position.getValue(now) : null;
      if(!pos) return null;
      let q = null;
      try{ q = anchor.orientation && anchor.orientation.getValue ? anchor.orientation.getValue(now) : null; }catch(_){ }
      if(q){
        const rot = Cesium.Matrix3.fromQuaternion(q, new Cesium.Matrix3());
        return Cesium.Matrix4.fromRotationTranslation(rot, pos, new Cesium.Matrix4());
      }
      return Cesium.Transforms.eastNorthUpToFixedFrame(pos);
    }catch(_){ return null; }
  }

  function hvParseCameraXyz(raw){
    try{
      const nums = String(raw || '').match(/-?\d+(?:\.\d+)?/g);
      if(!nums || nums.length < 3) return null;
      const x = Number(nums[0]), y = Number(nums[1]), z = Number(nums[2]);
      if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      return new Cesium.Cartesian3(x, y, z);
    }catch(_){ return null; }
  }

  function hvApplyManualRoomCameraPose(handle, meta, row, options){
    try{
      const cameraLocal = hvParseCameraXyz(firstFilled(
        meta && meta.camera_xyz,
        meta && meta.cameraXyz,
        meta && meta.room_camera_xyz,
        row && row.camera_xyz,
        row && row.cameraXyz,
        row && row.room_camera_xyz
      ));
      if(!cameraLocal) return false;

      const matrix = hvGetModelWorldMatrixFromHandle(handle);
      if(!matrix) return false;

      const cameraWorld = Cesium.Matrix4.multiplyByPoint(matrix, cameraLocal, new Cesium.Cartesian3());
      const camHeadDeg = parseFirstNumber(firstFilled(
        meta && meta.camera_heading,
        meta && meta.cameraHeading,
        meta && meta.room_camera_heading,
        row && row.camera_heading,
        row && row.cameraHeading,
        row && row.room_camera_heading
      ));
      const headingRad = Cesium.Math.toRadians(Number.isFinite(camHeadDeg) ? camHeadDeg : 0);
      const lookDistance = Math.max(1.0, parseFirstNumber(firstFilled(
        meta && meta.camera_look_distance,
        row && row.camera_look_distance
      )) || 2.0);
      const pitchDeg = parseFirstNumber(firstFilled(
        meta && meta.camera_pitch,
        row && row.camera_pitch
      ));
      const pitchRad = Cesium.Math.toRadians(Number.isFinite(pitchDeg) ? pitchDeg : 0);
      const horizontal = Math.cos(pitchRad) * lookDistance;
      const localLook = new Cesium.Cartesian3(
        cameraLocal.x + Math.sin(headingRad) * horizontal,
        cameraLocal.y + Math.cos(headingRad) * horizontal,
        cameraLocal.z + Math.sin(pitchRad) * lookDistance
      );
      const targetWorld = Cesium.Matrix4.multiplyByPoint(matrix, localLook, new Cesium.Cartesian3());
      stopCameraTracking();
      const orientation = makeLookAtOrientation(cameraWorld, targetWorld, Cesium.Cartesian3.UNIT_Z);
      viewer.camera.setView({ destination: cameraWorld, orientation: orientation });
      try{ applyFixedInteriorFov(); }catch(_){ }
      requestSceneRenderBurst((options && options.burst) || 5);
      return true;
    }catch(err){
      console.warn('HomeView manual room camera pose failed:', err);
      return false;
    }
  }

  async function hvFrameActiveInteriorModelCamera(handle, meta, row, options){
    // v44 camera framing:
    // 1) If room_model_items provides manual camera pose, use it directly:
    //    key|Label|URL|model_heading|camera_x,camera_y,camera_z|camera_heading
    // 2) Otherwise keep the old lightweight heading/range fallback for legacy rows.
    try{
      if(!handle) return false;
      const opts = options || {};
      if(hvApplyManualRoomCameraPose(handle, meta, row, opts)) return true;

      const anchor = handle.anchorEntity || handle;
      const now = Cesium.JulianDate.now();
      const target = anchor && anchor.position && anchor.position.getValue ? anchor.position.getValue(now) : null;
      if(!target) return false;

      const camHeadDeg = parseFirstNumber(firstFilled(
        meta && meta.camera_heading,
        meta && meta.heading,
        row && row.camera_heading,
        row && row.heading
      )) || 0;
      const camPitchDeg = parseFirstNumber(firstFilled(
        meta && meta.camera_pitch,
        row && row.camera_pitch
      ));
      const range = Math.max(0.01, parseFirstNumber(firstFilled(
        meta && meta.camera_distance,
        meta && meta.interior_camera_distance,
        meta && meta.default_camera_distance,
        row && row.camera_distance,
        row && row.interior_camera_distance,
        row && row.default_camera_distance
      )) || 0.1);

      stopCameraTracking();
      viewer.scene.camera.lookAt(
        target,
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(camHeadDeg),
          Cesium.Math.toRadians(Number.isFinite(camPitchDeg) ? camPitchDeg : -15),
          range
        )
      );
      viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      try{ applyFixedInteriorFov(); }catch(_){ }
      requestSceneRenderBurst(opts.burst || 5);
      return true;
    }catch(err){
      console.warn('HomeView interior camera framing failed:', err);
      return false;
    }
  }


  // ===== Unit Location Reveal Camera Helpers =====
  function hvGetMarkerCameraTextFromMeta(meta){
    try{
      return firstFilled(
        meta && meta.exterior_marker_camera,
        meta && meta.exterior_reveal_camera,
        meta && meta.marker_camera,
        meta && meta.reveal_camera
      );
    }catch(_){ return ''; }
  }
  function hvParseMarkerCamera(raw){
    const nums = String(raw || '').match(/-?\d+(?:\.\d+)?/g);
    if(!nums || nums.length < 3) return null;
    const headingDeg = Number(nums[0]);
    const pitchDeg = Number(nums[1]);
    const distance = Number(nums[2]);
    if(!Number.isFinite(headingDeg) || !Number.isFinite(pitchDeg) || !Number.isFinite(distance) || distance <= 0) return null;
    return { headingDeg, pitchDeg, distance };
  }
  function hvMarkerCameraToText(cam){
    if(!cam) return '';
    return [cam.headingDeg, cam.pitchDeg, cam.distance].map(function(n){
      const x = Number(n);
      return Number.isFinite(x) ? String(Math.round(x * 1000) / 1000) : '0';
    }).join(',');
  }
  function hvCaptureCurrentCameraForMarker(markerWorldPosition){
    try{
      if(!markerWorldPosition) return null;
      const camPos = Cesium.Cartesian3.clone(viewer.camera.positionWC);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(markerWorldPosition);
      const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
      const local = Cesium.Matrix4.multiplyByPoint(inv, camPos, new Cesium.Cartesian3());
      const distance = Cesium.Cartesian3.distance(camPos, markerWorldPosition);
      let headingDeg = Cesium.Math.toDegrees(Math.atan2(local.x, local.y));
      if(headingDeg < 0) headingDeg += 360;
      const horizontal = Math.sqrt(local.x * local.x + local.y * local.y);
      const pitchDeg = Cesium.Math.toDegrees(Math.atan2(local.z, horizontal));
      return {
        headingDeg: Math.round(headingDeg * 1000) / 1000,
        pitchDeg: Math.round(pitchDeg * 1000) / 1000,
        distance: Math.round(distance * 1000) / 1000
      };
    }catch(e){
      console.warn('Could not capture marker camera:', e);
      return null;
    }
  }
  function hvGetCameraPositionFromMarkerCamera(markerWorldPosition, markerCamera){
    try{
      if(!markerWorldPosition || !markerCamera) return null;
      const heading = Cesium.Math.toRadians(Number(markerCamera.headingDeg) || 0);
      const pitch = Cesium.Math.toRadians(Number(markerCamera.pitchDeg) || -12);
      const distance = Math.max(5, Number(markerCamera.distance) || 80);
      const horizontal = Math.cos(pitch) * distance;
      const local = new Cesium.Cartesian3(
        Math.sin(heading) * horizontal,
        Math.cos(heading) * horizontal,
        Math.sin(pitch) * distance
      );
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(markerWorldPosition);
      return Cesium.Matrix4.multiplyByPoint(enu, local, new Cesium.Cartesian3());
    }catch(_){ return null; }
  }
  function hvLookAtMarkerFromSavedCamera(markerWorldPosition, meta, durationSeconds){
    try{
      const savedCam = hvParseMarkerCamera(hvGetMarkerCameraTextFromMeta(meta));
      if(!savedCam) return false;
      const dest = hvGetCameraPositionFromMarkerCamera(markerWorldPosition, savedCam);
      if(!dest) return false;
      viewer.camera.flyTo({
        destination: dest,
        orientation: {
          direction: Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(markerWorldPosition, dest, new Cesium.Cartesian3()), new Cesium.Cartesian3()),
          up: Cesium.Cartesian3.UNIT_Z
        },
        duration: Math.max(0.5, Number(durationSeconds) || 2.5),
        easingFunction: Cesium.EasingFunction.SINE_IN_OUT
      });
      return true;
    }catch(e){
      console.warn('Saved marker camera failed:', e);
      return false;
    }
  }


  // ===== Marker Editor data compatibility helper =====
  
  
  async function hvTryEnsureInteriorEntityForMarker(buildingIndex, itemIndex){
    try{
      if (typeof ensureInteriorEntity === 'function') {
        return await ensureInteriorEntity(buildingIndex, itemIndex);
      }
      if (typeof interiorEntitiesByBuilding !== 'undefined' &&
          interiorEntitiesByBuilding &&
          interiorEntitiesByBuilding[buildingIndex] &&
          interiorEntitiesByBuilding[buildingIndex][itemIndex]) {
        return interiorEntitiesByBuilding[buildingIndex][itemIndex];
      }
    }catch(_){}
    return null;
  }

function hvSafeMarkerModelEntities(buildingIndex){
    try{
      if (typeof modelEntities !== 'undefined' && modelEntities && Array.isArray(modelEntities[buildingIndex])) return modelEntities[buildingIndex];
      if (typeof interiorEntitiesByBuilding !== 'undefined' && interiorEntitiesByBuilding && Array.isArray(interiorEntitiesByBuilding[buildingIndex])) return interiorEntitiesByBuilding[buildingIndex];
    }catch(_){}
    return [];
  }

function hvGetMarkerEditorTargetsForBuilding(buildingIndex){
    try{
      var lists = [];
      if (typeof markerTargetItemsByBuilding !== 'undefined' && markerTargetItemsByBuilding && markerTargetItemsByBuilding[buildingIndex]) lists.push(markerTargetItemsByBuilding[buildingIndex]);
      if (typeof interiorMetaByBuilding !== 'undefined' && interiorMetaByBuilding && interiorMetaByBuilding[buildingIndex]) lists.push(interiorMetaByBuilding[buildingIndex]);
      if (typeof unitsByBuilding !== 'undefined' && unitsByBuilding && unitsByBuilding[buildingIndex]) lists.push(unitsByBuilding[buildingIndex]);
      if (typeof itemsByBuilding !== 'undefined' && itemsByBuilding && itemsByBuilding[buildingIndex]) lists.push(itemsByBuilding[buildingIndex]);
      if (typeof interiorsByBuilding !== 'undefined' && interiorsByBuilding && interiorsByBuilding[buildingIndex]) lists.push(interiorsByBuilding[buildingIndex]);
      if (typeof buildingItemsByIndex !== 'undefined' && buildingItemsByIndex && buildingItemsByIndex[buildingIndex]) lists.push(buildingItemsByIndex[buildingIndex]);
      if (typeof viewItemsByBuilding !== 'undefined' && viewItemsByBuilding && viewItemsByBuilding[buildingIndex]) lists.push(viewItemsByBuilding[buildingIndex]);
      for (var i=0;i<lists.length;i++){
        if (Array.isArray(lists[i]) && lists[i].length) return lists[i];
      }

  // ===== Marker Editor entity compatibility helper =====
  function hvGetModelEntityListForBuilding(buildingIndex){
    try{
      var candidates = [];
      if (typeof modelEntities !== 'undefined' && modelEntities && hvGetModelEntityListForBuilding(buildingIndex)) candidates.push(hvGetModelEntityListForBuilding(buildingIndex));
      if (typeof interiorEntitiesByBuilding !== 'undefined' && interiorEntitiesByBuilding && interiorEntitiesByBuilding[buildingIndex]) candidates.push(interiorEntitiesByBuilding[buildingIndex]);
      if (typeof unitEntitiesByBuilding !== 'undefined' && unitEntitiesByBuilding && unitEntitiesByBuilding[buildingIndex]) candidates.push(unitEntitiesByBuilding[buildingIndex]);
      if (typeof entitiesByBuilding !== 'undefined' && entitiesByBuilding && entitiesByBuilding[buildingIndex]) candidates.push(entitiesByBuilding[buildingIndex]);
      for (var i=0;i<candidates.length;i++){
        if (Array.isArray(candidates[i])) return candidates[i];
      }
    }catch(_){}
    return [];
  }

    }catch(_){}
    try{
      var opts = [];
      if (typeof viewSelect !== 'undefined' && viewSelect && viewSelect.options){
        for (var j=0;j<viewSelect.options.length;j++){
          var opt = viewSelect.options[j];
          if (!opt) continue;
          var txt = String(opt.textContent || opt.text || '').trim();
          if (!txt || /building view/i.test(txt)) continue;
          opts.push({ unit_name: txt, name: txt, __optionIndex: j, __fromViewSelect: true });
        }
      }
      return opts;
    }catch(_){}
    return [];
  }


  // ========== UI (left panel) ==========
  const chartDiv = document.createElement('div');
  chartDiv.id = "chartContainer";
  chartDiv.className = "ui-card";
  chartDiv.style.cssText = `
    position:fixed;
    left:16px;
    top:16px;
    width:380px;
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

  const headerLeft = document.createElement('div');
  headerLeft.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:nowrap;width:100%';
  header.appendChild(headerLeft);

  const collapseBtn = document.createElement('button');
  collapseBtn.type = "button";
  collapseBtn.textContent='✕';
  collapseBtn.title='Close controls';
  collapseBtn.setAttribute('aria-label','Close controls');
  collapseBtn.className = 'ui-btn';
  collapseBtn.style.cssText = `
    width:40px;
    height:40px;
    border-radius:10px;
    cursor:pointer;
    position:relative;
    z-index:500002;
    pointer-events:auto;
    touch-action:manipulation;
    font-size:20px;
    line-height:1;
    flex:0 0 auto;
  `;
  headerLeft.appendChild(collapseBtn);

  const hTitle = document.createElement('div');
  hTitle.textContent = 'Controls';
  hTitle.style.cssText="font-weight:700;font-size:16px;flex:0 0 auto";
  headerLeft.appendChild(hTitle);

  const aiAdvisorBtn = document.createElement('button');
  aiAdvisorBtn.type = 'button';
  aiAdvisorBtn.textContent = 'AI Advisor';
  aiAdvisorBtn.title = 'Open AI advisor';
  aiAdvisorBtn.setAttribute('aria-label', 'Open AI advisor');
  aiAdvisorBtn.className = 'ui-btn';
  aiAdvisorBtn.style.cssText = 'height:32px;padding:0 10px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;flex:0 0 auto;white-space:nowrap';
  // v65: action buttons are moved into the persistent row under the Controls title.

  const quickShowLabelsBtn = document.createElement('button');
  quickShowLabelsBtn.type = 'button';
  quickShowLabelsBtn.id = 'quickShowLabelsBtn';
  quickShowLabelsBtn.textContent = 'Show Labels';
  quickShowLabelsBtn.title = 'Show or hide 3D labels';
  quickShowLabelsBtn.setAttribute('aria-label', 'Show or hide 3D labels');
  quickShowLabelsBtn.className = 'ui-btn';
  quickShowLabelsBtn.style.cssText = 'height:32px;padding:0 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;flex:0 0 auto;display:none';
  // v65: Show Labels is also placed in the persistent action row below.


  const shareViewBtn = document.createElement('button');
  shareViewBtn.type = 'button';
  shareViewBtn.textContent = 'Share';
  shareViewBtn.title = 'Copy a direct link to the current building or unit';
  shareViewBtn.setAttribute('aria-label', 'Copy share link');
  shareViewBtn.className = 'ui-btn';
  shareViewBtn.style.cssText = 'height:32px;padding:0 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;flex:0 0 auto';
  // HomeView v63: keep Share logic but do not render it in the top header.
  // The visible Share button lives in quickLabelsRow below.

  const shareToast = document.createElement('div');
  shareToast.className = 'ui-card';
  shareToast.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(12px);opacity:0;pointer-events:none;z-index:900000;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:700;box-shadow:0 10px 28px rgba(0,0,0,.20);transition:opacity .18s ease, transform .18s ease;';
  shareToast.textContent = 'Link copied';
  document.body.appendChild(shareToast);
  let shareToastTimer = null;
  function showShareToast(message){
    shareToast.textContent = String(message || 'Link copied');
    shareToast.style.opacity = '1';
    shareToast.style.transform = 'translateX(-50%) translateY(0)';
    if(shareToastTimer) clearTimeout(shareToastTimer);
    shareToastTimer = setTimeout(function(){
      shareToast.style.opacity = '0';
      shareToast.style.transform = 'translateX(-50%) translateY(12px)';
    }, 1800);
  }
  async function copyTextToClipboard(text){
    const value = String(text || '');
    if(!value) return false;
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(value);
        return true;
      }
    }catch(_){ }
    try{
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly','');
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    }catch(_){ return false; }
  }
  let buildCurrentShareUrl = function(){ return window.location.href; };
  shareViewBtn.onclick = async function(){
    const url = buildCurrentShareUrl();
    const ok = await copyTextToClipboard(url);
    showShareToast(ok ? 'Direct link copied' : 'Copy failed — link is ready in console');
    if(!ok) console.log('HomeView share link:', url);
  };

  let setAiAdvisorOpen = function(){};

  const headerLabelsWrap = null;

  const headerFutureWrap = document.createElement('label');
  headerFutureWrap.style.cssText = "display:none;align-items:center;gap:6px;font-size:12px;white-space:nowrap";
  headerFutureWrap.innerHTML = '<input id="showFutureProjectsToggle" type="checkbox"><span>Show future</span>';
  header.appendChild(headerFutureWrap);

  const panelBody = document.createElement('div');
  panelBody.style.cssText="display:flex;flex-direction:column;gap:8px";
  chartDiv.appendChild(panelBody);

  const quickLabelsRow = document.createElement('div');
  quickLabelsRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 10px;flex-wrap:wrap;pointer-events:auto;';
  const quickLabelsText = document.createElement('div');
  quickLabelsText.style.cssText = 'display:none';
  quickLabelsText.textContent = '';
  quickLabelsRow.appendChild(quickLabelsText);
  // v65 layout: the main action buttons live under the Controls title, not on the title line.
  quickLabelsRow.appendChild(aiAdvisorBtn);
  quickShowLabelsBtn.style.height = '32px';
  quickShowLabelsBtn.style.padding = '0 14px';
  quickShowLabelsBtn.style.borderRadius = '8px';
  quickShowLabelsBtn.style.fontSize = '12px';
  quickShowLabelsBtn.style.textAlign = 'center';
  quickShowLabelsBtn.style.justifyContent = 'center';
  quickShowLabelsBtn.style.alignItems = 'center';
  quickShowLabelsBtn.style.touchAction = 'manipulation';
  quickShowLabelsBtn.style.cursor = 'pointer';
  quickShowLabelsBtn.style.userSelect = 'none';
  quickShowLabelsBtn.style.minWidth = '92px';
  quickShowLabelsBtn.style.zIndex = '500003';
  quickShowLabelsBtn.style.position = 'relative';
  quickShowLabelsBtn.style.pointerEvents = 'auto';
  quickLabelsRow.style.pointerEvents = 'auto';
  quickLabelsRow.appendChild(quickShowLabelsBtn);

  const quickShareBtn = document.createElement('button');
  quickShareBtn.type = 'button';
  quickShareBtn.id = 'quickShareBtn';
  quickShareBtn.textContent = 'Share Link';
  quickShareBtn.title = 'Share this HomeView';
  quickShareBtn.setAttribute('aria-label', 'Share this HomeView');
  quickShareBtn.className = 'ui-btn';
  quickShareBtn.style.cssText = 'width:auto;height:32px;padding:0 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap';
  quickShareBtn.style.pointerEvents = 'auto';
  quickShareBtn.style.position = 'relative';
  quickShareBtn.style.zIndex = '500003';
  quickShareBtn.style.touchAction = 'manipulation';
  quickShareBtn.style.cursor = 'pointer';
  quickShareBtn.style.userSelect = 'none';
  quickShareBtn.style.minWidth = '74px';

  // v65: Share belongs in the persistent action row under the title, so it remains visible when Controls is collapsed.
  try{ quickLabelsRow.appendChild(quickShareBtn); }catch(_){ }
  try{ chartDiv.insertBefore(quickLabelsRow, panelBody); }catch(_){ chartDiv.appendChild(quickLabelsRow); }


  let collapsed=false;
  function setCollapsed(c){
    collapsed=!!c;
    panelBody.style.display=collapsed?'none':'flex';
    collapseBtn.textContent=collapsed?'☰':'✕';
    collapseBtn.title=collapsed?'Open controls':'Close controls';
    collapseBtn.setAttribute('aria-label', collapsed?'Open controls':'Close controls');
  }
  collapseBtn.onclick=()=>setCollapsed(!collapsed);

  const buildingSelectTitle = document.createElement('div');
  buildingSelectTitle.className = 'hv-section-title';
  buildingSelectTitle.textContent = 'Building';
  panelBody.appendChild(buildingSelectTitle);

  const selectBox = document.createElement('select');
  selectBox.className = 'ui-select';
  selectBox.style.cssText="width:100%;padding:8px;border-radius:8px";
  panelBody.appendChild(selectBox);

  const viewSelectTitle = document.createElement('div');
  viewSelectTitle.className = 'hv-section-title';
  viewSelectTitle.textContent = 'View / Unit';
  panelBody.appendChild(viewSelectTitle);

  const viewSelect = document.createElement('select');
  viewSelect.className = 'ui-select';
  viewSelect.style.cssText="width:100%;padding:8px;border-radius:8px";
  panelBody.appendChild(viewSelect);

  const viewLoadStatus = document.createElement('div');
  viewLoadStatus.style.cssText="display:none;font-size:12px;color:#555;margin-top:-2px";
  viewLoadStatus.textContent = 'Loading selected model...';
  panelBody.appendChild(viewLoadStatus);

  const panoTransitionOverlay = document.createElement('div');
  panoTransitionOverlay.style.cssText = `
    position:fixed;
    inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    background:rgba(8,10,14,0);
    color:#fff;
    font-family:system-ui,sans-serif;
    font-size:18px;
    font-weight:600;
    letter-spacing:.2px;
    opacity:0;
    pointer-events:none;
    z-index:450000;
    transition:opacity .22s ease, background-color .22s ease;
  `;
  panoTransitionOverlay.innerHTML = '<div style="padding:14px 18px;border-radius:14px;background:rgba(0,0,0,.34);backdrop-filter:blur(4px);box-shadow:0 8px 24px rgba(0,0,0,.18)">Loading panorama...</div>';
  document.body.appendChild(panoTransitionOverlay);

  let panoTransitionVisible = false;
  function waitMs(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  async function showPanoramaTransition(message){
    const text = String(message || 'Loading panorama...').trim() || 'Loading panorama...';
    const inner = panoTransitionOverlay.firstElementChild;
    if(inner) inner.textContent = text;
    panoTransitionOverlay.style.pointerEvents = 'auto';
    panoTransitionOverlay.style.opacity = '1';
    panoTransitionOverlay.style.background = 'rgba(8,10,14,.32)';
    panoTransitionVisible = true;
    await waitMs(180);
  }
  async function hidePanoramaTransition(){
    if(!panoTransitionVisible) return;
    panoTransitionOverlay.style.opacity = '0';
    panoTransitionOverlay.style.background = 'rgba(8,10,14,0)';
    panoTransitionVisible = false;
    await waitMs(230);
    if(!panoTransitionVisible) panoTransitionOverlay.style.pointerEvents = 'none';
  }

  // General HomeView scene transition overlay. Reuses the soft panorama loading layer
  // so model switches, unit entry, and building-view returns feel consistent.
  async function showSceneTransition(message){
    return showPanoramaTransition(message || 'Loading view...');
  }
  async function hideSceneTransition(){
    return hidePanoramaTransition();
  }
  async function withSceneTransition(message, action, minVisibleMs){
    const minMs = Math.max(0, Number(minVisibleMs || (IS_MOBILE ? 120 : 180)) || 0);
    const t0 = performance.now();
    await showSceneTransition(message || 'Loading view...');
    try{
      return await action();
    } finally {
      const elapsed = performance.now() - t0;
      if(elapsed < minMs) await waitMs(minMs - elapsed);
      await hideSceneTransition();
    }
  }

  const finishCard = document.createElement('div');
  finishCard.className = 'ui-card';
  finishCard.style.cssText = "border-radius:12px;padding:10px;display:none";
  finishCard.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <div style="font-weight:700">Interior Finishes</div>
      <div id="finishStatus" style="font-size:12px;color:#555">Ready</div>
    </div>
    <div id="finishBody" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Flooring
        <select id="floorFinishSelect" class="ui-select" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></select>
      </label>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Cabinets
        <select id="cabinetFinishSelect" class="ui-select" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></select>
      </label>
    </div>`;
  panelBody.appendChild(finishCard);
  const finishStatus = finishCard.querySelector('#finishStatus');
  const floorFinishSelect = finishCard.querySelector('#floorFinishSelect');
  const cabinetFinishSelect = finishCard.querySelector('#cabinetFinishSelect');

  const nearbyPlacesTitle = document.createElement('div');
  nearbyPlacesTitle.className = 'hv-section-title';
  nearbyPlacesTitle.textContent = 'Nearby Places';
  panelBody.appendChild(nearbyPlacesTitle);

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

const unitSpecsCard = document.createElement('div');
unitSpecsCard.className = 'ui-card';
unitSpecsCard.style.cssText = "border-radius:12px;padding:10px;display:none";
unitSpecsCard.innerHTML = `
  <div style="font-weight:700;margin-bottom:6px">Unit Details</div>
  <div id="unitSpecsGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px"></div>`;
panelBody.appendChild(unitSpecsCard);
const unitSpecsGrid = unitSpecsCard.querySelector('#unitSpecsGrid');

const propertyDetailsCard = document.createElement('div');
propertyDetailsCard.className = 'ui-card';
propertyDetailsCard.style.cssText = "border-radius:12px;padding:10px;display:none";
propertyDetailsCard.innerHTML = `
  <div style="font-weight:700;margin-bottom:6px">Property Details</div>
  <div id="propertyDetailsGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px"></div>`;
panelBody.appendChild(propertyDetailsCard);
const propertyDetailsGrid = propertyDetailsCard.querySelector('#propertyDetailsGrid');

function makeChipSectionCard(sectionTitle){
  const card=document.createElement('div');
  card.className='ui-card';
  card.style.cssText="border-radius:12px;padding:10px;display:none";
  card.innerHTML='<div style="font-weight:700;margin-bottom:6px">'+sectionTitle+'</div><div class="chipWrap" style="display:flex;flex-wrap:wrap;gap:6px"></div>';
  panelBody.appendChild(card);
  return { card, wrap: card.querySelector('.chipWrap') };
}
const buildingFeaturesSec = makeChipSectionCard('Building Features');
const buildingAmenitiesSec = makeChipSectionCard('Building Amenities');
const structuresSec = makeChipSectionCard('Structures');
const heatingSec = makeChipSectionCard('Heating & Cooling');
const communitySec = makeChipSectionCard('Community Features');

// move description below unit details cards
panelBody.appendChild(descBox);

const adminBuildingViewsCard = document.createElement('div');
adminBuildingViewsCard.className = 'ui-card';
adminBuildingViewsCard.style.cssText = "border-radius:12px;padding:10px;display:none";
adminBuildingViewsCard.innerHTML = `
  <div style="font-weight:700;margin-bottom:6px">Unit View Stats</div>
  <div id="adminBuildingViewsSummary" style="font-size:13px;line-height:1.6;color:#333"></div>
  <div id="adminBuildingViewsList" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div>`;
panelBody.appendChild(adminBuildingViewsCard);
const adminBuildingViewsSummary = adminBuildingViewsCard.querySelector('#adminBuildingViewsSummary');
const adminBuildingViewsList = adminBuildingViewsCard.querySelector('#adminBuildingViewsList');

const adminUnitEditorCard = document.createElement('div');
adminUnitEditorCard.className = 'ui-card';
adminUnitEditorCard.style.cssText = "border-radius:12px;padding:10px;display:none";
adminUnitEditorCard.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
    <div style="font-weight:700">Admin Editor</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button id="adminApplyBtn" class="ui-btn" style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer">Apply locally</button>
      <button id="adminSaveBtn" class="ui-btn" style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer">Save changes</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px">
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Area<input id="adminAreaInput" class="ui-input" type="text" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Price<input id="adminPriceInput" class="ui-input" type="text" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Beds<input id="adminBedsInput" class="ui-input" type="text" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Bathrooms<input id="adminBathsInput" class="ui-input" type="text" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Maintenance Fee<input id="adminMaintenanceInput" class="ui-input" type="text" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Parking Spaces<input id="adminParkingInput" class="ui-input" type="text" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Year Built / Completion<input id="adminYearInput" class="ui-input" type="text" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Future Prices<input id="adminForecastInput" class="ui-input" type="text" placeholder="400000,480000,600000" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
  </div>
  <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;margin-top:8px">Description<textarea id="adminDescInput" class="ui-input" rows="4" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></textarea></label>
  <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;margin-top:8px">Building Features<input id="adminBuildingFeaturesInput" class="ui-input" type="text" placeholder="A|B|C" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
  <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;margin-top:8px">Building Amenities<input id="adminBuildingAmenitiesInput" class="ui-input" type="text" placeholder="A|B|C" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
  <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;margin-top:8px">Structures<input id="adminStructuresInput" class="ui-input" type="text" placeholder="A|B|C" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
  <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;margin-top:8px">Heating Type<input id="adminHeatingInput" class="ui-input" type="text" placeholder="A|B|C" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
  <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;margin-top:8px">Community Features<input id="adminCommunityInput" class="ui-input" type="text" placeholder="A|B|C" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
  <div id="adminEditorStatus" style="font-size:12px;color:#555;margin-top:8px">Changes can be applied locally, then saved securely.</div>`;
panelBody.appendChild(adminUnitEditorCard);
const adminApplyBtn = adminUnitEditorCard.querySelector('#adminApplyBtn');
const adminSaveBtn = adminUnitEditorCard.querySelector('#adminSaveBtn');
const adminAreaInput = adminUnitEditorCard.querySelector('#adminAreaInput');
const adminPriceInput = adminUnitEditorCard.querySelector('#adminPriceInput');
const adminBedsInput = adminUnitEditorCard.querySelector('#adminBedsInput');
const adminBathsInput = adminUnitEditorCard.querySelector('#adminBathsInput');
const adminMaintenanceInput = adminUnitEditorCard.querySelector('#adminMaintenanceInput');
const adminParkingInput = adminUnitEditorCard.querySelector('#adminParkingInput');
const adminYearInput = adminUnitEditorCard.querySelector('#adminYearInput');
const adminForecastInput = adminUnitEditorCard.querySelector('#adminForecastInput');
const adminDescInput = adminUnitEditorCard.querySelector('#adminDescInput');
const adminBuildingFeaturesInput = adminUnitEditorCard.querySelector('#adminBuildingFeaturesInput');
const adminBuildingAmenitiesInput = adminUnitEditorCard.querySelector('#adminBuildingAmenitiesInput');
const adminStructuresInput = adminUnitEditorCard.querySelector('#adminStructuresInput');
const adminHeatingInput = adminUnitEditorCard.querySelector('#adminHeatingInput');
const adminCommunityInput = adminUnitEditorCard.querySelector('#adminCommunityInput');
const adminEditorStatus = adminUnitEditorCard.querySelector('#adminEditorStatus');

function renderDetailGrid(target, pairs){
  target.innerHTML='';
  pairs.forEach(function(pair){
    if(!hasTextValue(pair[1])) return;
    const cell=document.createElement('div');
    cell.innerHTML='<div style="opacity:.7;font-size:12px">'+pair[0]+'</div><div style="font-weight:600">'+pair[1]+'</div>';
    target.appendChild(cell);
  });
}
function renderChipSection(section, items){
  section.wrap.innerHTML='';
  if(!items || !items.length){
    section.card.style.display='none';
    return;
  }
  items.forEach(function(txt){
    const chip=document.createElement('div');
    chip.className='ui-btn';
    chip.style.cssText='padding:6px 10px;border-radius:999px;font-size:12px;cursor:default';
    chip.textContent=txt;
    section.wrap.appendChild(chip);
  });
  section.card.style.display='block';
}

  const labelToolsCard = document.createElement('div');
  labelToolsCard.className = 'ui-card';
  labelToolsCard.style.cssText = "border-radius:12px;padding:10px;display:none;overflow:hidden";
  labelToolsCard.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div style="font-weight:700">3D Labels</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label id="showLabelsInlineWrap" style="display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap">
          <input id="showLabelsToggle" type="checkbox"><span>Show labels</span>
        </label>
        <button id="editLabelsBtn" class="ui-btn" style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer">Edit labels</button>
      </div>
    </div>
    <div id="labelDistanceWrap" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin-top:10px;min-width:0">
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Camera distance to labels
        <input id="labelDistanceRange" class="ui-input" type="range" min="0.5" max="50" step="0.5" value="8" style="width:100%;min-width:0;box-sizing:border-box">
      </label>
      <div id="labelDistanceValue" style="font-size:12px;font-weight:600;white-space:nowrap;align-self:center">8 m</div>
    </div>
    <div id="labelEditorBody" style="display:none;flex-direction:column;gap:8px;margin-top:10px;min-width:0">
      <div style="font-size:12px;line-height:1.5;color:#444">Click <b>Pick label position</b>, then click on the current 3D model to place or move the selected label.</div>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Label text
        <input id="labelTextInput" class="ui-input" type="text" placeholder="e.g. 4 m / King Bed / Balcony" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0">
      </label>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:8px;min-width:0">
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Raise (m)<input id="labelRaiseInput" class="ui-input" type="number" value="0" step="0.1" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Scale<input id="labelScaleInput" class="ui-input" type="number" value="1" step="0.1" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label>
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Label color<input id="labelColorInput" class="ui-input" type="color" value="#00ff88" style="padding:4px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0;height:38px"></label>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;min-width:0">
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">On click action
          <select id="labelActionTypeSelect" class="ui-select" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0">
            <option value="none">None</option>
            <option value="open_panorama">Open panorama</option>
            <option value="open_room_model">Open room model</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Action value
          <input id="labelActionValueInput" class="ui-input" type="text" placeholder="e.g. livingroom" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0">
        </label>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;min-width:0">
        <button id="pickLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer">Pick label position</button>
        <button id="newLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer">New label</button>
        <button id="saveLabelsBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer;font-weight:700">Save labels</button>
        <button id="deleteLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer;border-color:#ffcdd2;color:#b71c1c">Delete selected</button>
      </div>
      <div id="labelEditorStatus" style="font-size:12px;color:#555">No label selected</div>
      <div id="labelList" style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto;min-width:0"></div>
      <textarea id="labelsExportBox" class="ui-input" rows="2" style="display:none"></textarea>
    </div>`;
  panelBody.appendChild(labelToolsCard);
  const showLabelsToggle = labelToolsCard.querySelector('#showLabelsToggle');

    
    function hvEnsureCurrentLabelSelectionForActiveInterior(){
      try{
        // TDZ-safe: do not reference activeInteriorSelection here.
        // Some builds initialize that variable later, so direct access can throw before setup finishes.
        const sel = labelEditorState && labelEditorState.currentSelection ? labelEditorState.currentSelection : null;
        if(sel && !sel.isExterior) return sel;
      }catch(_){}
      return null;
    }

function syncQuickShowLabelsButton(){
      try{
        const sel = (labelEditorState && labelEditorState.currentSelection) ? labelEditorState.currentSelection : null;
        const usable = !!sel && !sel.isExterior && currentMode !== 'exterior';
        const labelsOn = !!((typeof infoLabelsEnabled !== 'undefined') ? infoLabelsEnabled : false);
        const navOn = !!((typeof navigationLabelsEnabled !== 'undefined') ? navigationLabelsEnabled : true);

        if(typeof quickLabelsRow !== 'undefined' && quickLabelsRow){
          quickLabelsRow.style.display = 'flex';
          quickLabelsRow.style.pointerEvents = 'auto';
        }

        if(typeof quickShowLabelsBtn !== 'undefined' && quickShowLabelsBtn){
          quickShowLabelsBtn.style.display = usable ? 'inline-flex' : 'none';
          quickShowLabelsBtn.textContent = labelsOn ? 'Hide Labels' : 'Show Labels';
          quickShowLabelsBtn.style.background = '#fff';
          quickShowLabelsBtn.style.color = '#111';
          quickShowLabelsBtn.style.webkitTextFillColor = quickShowLabelsBtn.style.color;
          quickShowLabelsBtn.style.pointerEvents = 'auto';
        }

        if(typeof quickShareBtn !== 'undefined' && quickShareBtn){
          quickShareBtn.style.display = 'inline-flex';
          quickShareBtn.textContent = 'Share Link';
          quickShareBtn.style.background = '#fff';
          quickShareBtn.style.color = '#111';
          quickShareBtn.style.webkitTextFillColor = quickShareBtn.style.color;
          quickShareBtn.style.pointerEvents = 'auto';
        }
        try{ hvSyncSettingsNavigationButton && hvSyncSettingsNavigationButton(); }catch(_){}
      }catch(e){ console.warn('Label/navigation controls sync failed:', e); }
    }

    function hvToggleInfoLabels(ev){
      try{
        if(ev){ ev.preventDefault(); ev.stopPropagation(); }
        const current = !!((typeof infoLabelsEnabled !== 'undefined') ? infoLabelsEnabled : false);
        infoLabelsEnabled = !current;
        if(typeof showLabelsToggle !== 'undefined' && showLabelsToggle) showLabelsToggle.checked = !!infoLabelsEnabled;
        console.log('HomeView info labels ->', !!infoLabelsEnabled);
        renderSelectionLabels();
        try{ if(typeof hvApplyLabelEntityVisibility === 'function') hvApplyLabelEntityVisibility(); }catch(_){}
        syncQuickShowLabelsButton();
        requestSceneRenderBurst(6);
      }catch(e){ console.warn('Labels toggle failed:', e); }
      return false;
    }
    function hvToggleNavigationLabels(ev){
      try{
        if(ev){ ev.preventDefault(); ev.stopPropagation(); }
        const current = !!((typeof navigationLabelsEnabled !== 'undefined') ? navigationLabelsEnabled : true);
        navigationLabelsEnabled = !current;
        console.log('HomeView navigation labels ->', !!navigationLabelsEnabled);
        renderSelectionLabels();
        try{ if(typeof hvApplyLabelEntityVisibility === 'function') hvApplyLabelEntityVisibility(); }catch(_){}
        syncQuickShowLabelsButton();
        try{ hvSyncSettingsNavigationButton(); }catch(_){}
        requestSceneRenderBurst(6);
      }catch(e){ console.warn('Navigation toggle failed:', e); }
      return false;
    }

    
    if(!window.__hvLabelNavGlobalClickInstalled){
      window.__hvLabelNavGlobalClickInstalled = true;
      document.addEventListener('click', function(ev){
        try{
          const t = ev && ev.target ? ev.target.closest && ev.target.closest('#quickShowLabelsBtn,#quickShareBtn,#settingsNavigationBtn') : null;
          if(!t) return;
          ev.preventDefault();
          ev.stopPropagation();

          if(t.id === 'quickShowLabelsBtn'){
            infoLabelsEnabled = !((typeof infoLabelsEnabled !== 'undefined') ? !!infoLabelsEnabled : false);
            if(typeof showLabelsToggle !== 'undefined' && showLabelsToggle) showLabelsToggle.checked = !!infoLabelsEnabled;
            console.log('HomeView Show/Hide Labels clicked ->', !!infoLabelsEnabled);
          }else if(t.id === 'quickShareBtn'){
            try{ if(typeof shareViewBtn !== 'undefined' && shareViewBtn) shareViewBtn.click(); }catch(_){}
            return;
          }else if(t.id === 'settingsNavigationBtn'){
            navigationLabelsEnabled = !((typeof navigationLabelsEnabled !== 'undefined') ? !!navigationLabelsEnabled : true);
            console.log('HomeView Settings Navigation clicked ->', !!navigationLabelsEnabled);
          }

          renderSelectionLabels();
          // Apply visibility defensively. Some generated builds placed
          // hvApplyLabelEntityVisibility in a later/nested scope, which made
          // the external Show/Hide buttons throw a ReferenceError.
          try{
            if(typeof hvApplyLabelEntityVisibility === 'function'){
              hvApplyLabelEntityVisibility();
            }else{
              const labelsOn = !!((typeof infoLabelsEnabled !== 'undefined') ? infoLabelsEnabled : false);
              const navOn = !!((typeof navigationLabelsEnabled !== 'undefined') ? navigationLabelsEnabled : true);
              const list = (typeof labelEditorState !== 'undefined' && labelEditorState && Array.isArray(labelEditorState.entities)) ? labelEditorState.entities : [];
              list.forEach(function(ent){
                try{
                  const kind = ent && ent.properties && ent.properties.hvLabelKind && ent.properties.hvLabelKind.getValue
                    ? String(ent.properties.hvLabelKind.getValue() || '')
                    : '';
                  const shouldShow = kind === 'navigation' ? navOn : labelsOn;
                  ent.show = shouldShow;
                  if(ent.label) ent.label.show = shouldShow;
                }catch(_){}
              });
            }
          }catch(e){ console.warn('visibility apply fallback:', e); }
          syncQuickShowLabelsButton();
          requestSceneRenderBurst(6);
        }catch(e){
          console.warn('HomeView labels/navigation global click failed:', e);
        }
      }, true);
    }

  const showFutureProjectsToggle = header.querySelector('#showFutureProjectsToggle');
  const editLabelsBtn = labelToolsCard.querySelector('#editLabelsBtn');
  const labelEditorBody = labelToolsCard.querySelector('#labelEditorBody');
  const labelTextInput = labelToolsCard.querySelector('#labelTextInput');
  const labelRaiseInput = labelToolsCard.querySelector('#labelRaiseInput');
  const labelScaleInput = labelToolsCard.querySelector('#labelScaleInput');
  const labelColorInput = labelToolsCard.querySelector('#labelColorInput');
  const labelActionTypeSelect = labelToolsCard.querySelector('#labelActionTypeSelect');
  const labelActionValueInput = labelToolsCard.querySelector('#labelActionValueInput');
  const labelActionValueList = document.createElement('datalist');
  labelActionValueList.id = 'labelActionValueList';
  labelToolsCard.appendChild(labelActionValueList);
  labelActionValueInput.setAttribute('list', 'labelActionValueList');
  const labelCurrentSceneHint = document.createElement('div');
  labelCurrentSceneHint.style.cssText = 'font-size:12px;color:#555;margin-top:6px';
  labelCurrentSceneHint.textContent = 'Current panorama scene: —';
  labelActionValueInput.parentElement.appendChild(labelCurrentSceneHint);
  const pickLabelBtn = labelToolsCard.querySelector('#pickLabelBtn');
  const newLabelBtn = labelToolsCard.querySelector('#newLabelBtn');
  const saveLabelsBtn = labelToolsCard.querySelector('#saveLabelsBtn');
  const deleteLabelBtn = labelToolsCard.querySelector('#deleteLabelBtn');
  const labelEditorStatus = labelToolsCard.querySelector('#labelEditorStatus');
  const labelList = labelToolsCard.querySelector('#labelList');
  const labelDistanceRange = labelToolsCard.querySelector('#labelDistanceRange');
  const labelDistanceValue = labelToolsCard.querySelector('#labelDistanceValue');
  const labelsExportBox = labelToolsCard.querySelector('#labelsExportBox');

  const unitMarkerTunerCard = document.createElement('div');
  unitMarkerTunerCard.className = 'ui-card';
  unitMarkerTunerCard.style.cssText = 'border-radius:12px;padding:10px;display:none;overflow:hidden';
  unitMarkerTunerCard.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <div style="font-weight:700">Unit Location Marker</div>
      <button id="markerCopyBtn" class="ui-btn" style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer">Copy for Sheet</button>
    </div>
    <div style="font-size:12px;line-height:1.45;color:#555;margin-bottom:8px">Open this from Building View, choose any unit or amenity in this building, then adjust the green box live with the Offset and Size fields, then copy the values into the Sheet row.</div>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;margin-bottom:8px">Target Unit / Amenity
      <select id="markerTargetSelect" class="ui-select" style="padding:8px;border-radius:8px;width:100%;box-sizing:border-box"></select>
    </label>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Offset X<input id="markerOffX" class="ui-input" type="number" step="0.5" style="padding:7px;border-radius:8px"></label>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Offset Y<input id="markerOffY" class="ui-input" type="number" step="0.5" style="padding:7px;border-radius:8px"></label>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Offset Z<input id="markerOffZ" class="ui-input" type="number" step="0.5" style="padding:7px;border-radius:8px"></label>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Size X<input id="markerScaleX" class="ui-input" type="number" step="0.5" min="0.4" style="padding:7px;border-radius:8px"></label>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Size Y<input id="markerScaleY" class="ui-input" type="number" step="0.5" min="0.4" style="padding:7px;border-radius:8px"></label>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Size Z<input id="markerScaleZ" class="ui-input" type="number" step="0.5" min="0.4" style="padding:7px;border-radius:8px"></label>
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin-top:8px"><label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Reveal Camera<input id="markerCameraInput" class="ui-input" type="text" placeholder="heading,pitch,distance" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0"></label><button id="markerUseCurrentCameraBtn" class="ui-btn" style="border-radius:8px;padding:8px 10px;font-size:12px;cursor:pointer">Use Current Camera</button></div><textarea id="markerSheetOutput" class="ui-input" rows="2" readonly style="margin-top:8px;width:100%;box-sizing:border-box;border-radius:8px;padding:8px;font-size:12px"></textarea>
    <div id="markerTunerStatus" style="font-size:12px;color:#555;margin-top:6px">Ready.</div>`;
  panelBody.appendChild(unitMarkerTunerCard);
  const markerOffX = unitMarkerTunerCard.querySelector('#markerOffX');
  const markerOffY = unitMarkerTunerCard.querySelector('#markerOffY');
  const markerOffZ = unitMarkerTunerCard.querySelector('#markerOffZ');
  const markerScaleX = unitMarkerTunerCard.querySelector('#markerScaleX');
  const markerScaleY = unitMarkerTunerCard.querySelector('#markerScaleY');
  const markerScaleZ = unitMarkerTunerCard.querySelector('#markerScaleZ');
  const markerEditorToggleBtn = unitMarkerTunerCard.querySelector('#markerEditorToggleBtn');
  const markerPreviewBtn = unitMarkerTunerCard.querySelector('#markerPreviewBtn');
  const markerViewBtn = unitMarkerTunerCard.querySelector('#markerViewBtn');
  const markerHideBtn = unitMarkerTunerCard.querySelector('#markerHideBtn');
  const markerCopyBtn = unitMarkerTunerCard.querySelector('#markerCopyBtn');
  const markerSheetOutput = unitMarkerTunerCard.querySelector('#markerSheetOutput');

  const markerOffsetXInput = markerOffX;
  const markerOffsetYInput = markerOffY;
  const markerOffsetZInput = markerOffZ;
  const markerSizeXInput = markerScaleX;
  const markerSizeYInput = markerScaleY;
  const markerSizeZInput = markerScaleZ;


  const markerCameraInput = document.getElementById('markerCameraInput') || (markerEditorPanel ? markerEditorPanel.querySelector('#markerCameraInput') : null);
  const markerUseCurrentCameraBtn = document.getElementById('markerUseCurrentCameraBtn') || (markerEditorPanel ? markerEditorPanel.querySelector('#markerUseCurrentCameraBtn') : null);
  let activeMarkerEditorWorldPosition = null;

  
  function hvApplyMarkerCameraFromSelectedMeta(meta){
    try{
      if(markerCameraInput){
        markerCameraInput.value = hvGetMarkerCameraTextFromMeta(meta) || '';
        hvUpdateMarkerSheetOutputWithCamera();
      }
    }catch(_){}
  }
function hvUpdateMarkerSheetOutputWithCamera(){
    try{
      if(!markerSheetOutput) return;
      var off = [
        markerOffsetXInput ? markerOffsetXInput.value : '0',
        markerOffsetYInput ? markerOffsetYInput.value : '0',
        markerOffsetZInput ? markerOffsetZInput.value : '0'
      ].join(',');
      var size = [
        markerSizeXInput ? markerSizeXInput.value : '1',
        markerSizeYInput ? markerSizeYInput.value : '1',
        markerSizeZInput ? markerSizeZInput.value : '1'
      ].join(',');
      var cam = markerCameraInput && markerCameraInput.value ? String(markerCameraInput.value).trim() : '';
      markerSheetOutput.value = 'exterior_marker_offset: ' + off + '\nexterior_marker_scale: ' + size + (cam ? ('\nexterior_marker_camera: ' + cam) : '');
    }catch(_){}
  }
  function hvPatchMarkerOutputListeners(){
    try{
      [markerOffsetXInput,markerOffsetYInput,markerOffsetZInput,markerSizeXInput,markerSizeYInput,markerSizeZInput,markerCameraInput].forEach(function(el){
        if(el && !el.__hvMarkerCameraPatched){
          el.__hvMarkerCameraPatched = true;
          el.addEventListener('input', function(){ setTimeout(hvUpdateMarkerSheetOutputWithCamera, 0); });
        }
      });
      if(markerUseCurrentCameraBtn && !markerUseCurrentCameraBtn.__hvMarkerCameraPatched){
        markerUseCurrentCameraBtn.__hvMarkerCameraPatched = true;
        markerUseCurrentCameraBtn.addEventListener('click', function(){
          var cam = hvCaptureCurrentCameraForMarker(activeMarkerEditorWorldPosition);
          if(cam && markerCameraInput){
            markerCameraInput.value = hvMarkerCameraToText(cam);
            hvUpdateMarkerSheetOutputWithCamera();
            try{ if(markerTunerStatus) markerTunerStatus.textContent = 'Reveal camera captured. Copy values into the Sheet.'; }catch(_){}
          }else{
            try{ if(markerTunerStatus) markerTunerStatus.textContent = 'Marker position not ready. Select a target first.'; }catch(_){}
          }
        });
      }
    }catch(_){}
  }
  hvPatchMarkerOutputListeners();

  function hvGetActiveMarkerEditorWorldPositionSafe(){
    try{
      if(activeMarkerEditorWorldPosition) return activeMarkerEditorWorldPosition;
    }catch(_){}
    try{
      if(typeof selectedUnitExteriorMarkerEntity !== 'undefined' && selectedUnitExteriorMarkerEntity && selectedUnitExteriorMarkerEntity.position){
        const p = selectedUnitExteriorMarkerEntity.position.getValue ? selectedUnitExteriorMarkerEntity.position.getValue(Cesium.JulianDate.now()) : selectedUnitExteriorMarkerEntity.position;
        if(p){ activeMarkerEditorWorldPosition = p; return p; }
      }
    }catch(_){}
    try{
      const ctx = getCurrentMarkerTunerContext ? getCurrentMarkerTunerContext() : null;
      if(ctx){
        const off = getMarkerTunerValues().offset;
        const lon = toNum(ctx.row.lng), lat = toNum(ctx.row.lat);
        const h = toNum(ctx.row.height) || 0;
        if(Number.isFinite(lon) && Number.isFinite(lat)){
          const p = placeWithEnuOffset(lon, lat, h, off.x, off.y, off.z);
          activeMarkerEditorWorldPosition = p;
          return p;
        }
      }
    }catch(_){}
    return null;
  }
  function hvInstallUseCurrentCameraButtonRobust(){
    try{
      if(!markerUseCurrentCameraBtn || !markerCameraInput) return;
      markerUseCurrentCameraBtn.onclick = function(evt){
        try{
          if(evt){ evt.preventDefault(); evt.stopPropagation(); }
          const pos = hvGetActiveMarkerEditorWorldPositionSafe();
          const cam = hvCaptureCurrentCameraForMarker(pos);
          if(cam){
            markerCameraInput.value = hvMarkerCameraToText(cam);
            hvUpdateMarkerSheetOutputWithCamera();
            try{ markerTunerStatus.textContent = 'Reveal camera captured. Copy values into the Sheet.'; }catch(_){}
          }else{
            try{ markerTunerStatus.textContent = 'Marker is not ready. Select a target first.'; }catch(_){}
            console.warn('Use Current Camera failed: no marker position');
          }
        }catch(e){
          console.warn('Use Current Camera failed:', e);
        }
        return false;
      };
    }catch(e){ console.warn('Could not install camera capture button:', e); }
  }

  hvInstallUseCurrentCameraButtonRobust();


  const markerTunerStatus = unitMarkerTunerCard.querySelector('#markerTunerStatus');
  const markerTargetSelect = unitMarkerTunerCard.querySelector('#markerTargetSelect');

  // Label editor state/list refresh are initialized later with the 3D label system.
  // They must exist before floating admin editor buttons query them during startup.
  let labelEditorState = null;
  let refreshLabelListUI = function(){};

  // ===== Floating editor panels (admin-only) =====
  // Keep heavy editor tools out of the main Controls panel. They behave like the Cinematic Camera Tool:
  // a small admin button opens a scrollable popup, while the main HomeView controls stay clean.
  let descriptionEditorPanelOpen = false;
  let labelEditorPanelOpen = false;
  let markerEditorPanelOpen = false;

  function makeAdminFloatingButton(label, title, rightPx){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ui-btn hv-chrome-anim';
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.style.cssText = 'position:fixed;right:' + rightPx + 'px;bottom:16px;width:44px;height:44px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.18);z-index:2125;cursor:pointer;display:none;align-items:center;justify-content:center;font-size:18px;line-height:1;';
    document.body.appendChild(btn);
    return btn;
  }

  const markerEditorBtn = makeAdminFloatingButton('▣', 'Unit / Amenity Location Marker Editor', 118);
  const labelsEditorBtn = makeAdminFloatingButton('🏷', '3D Labels Editor', 168);
  const descriptionEditorBtn = makeAdminFloatingButton('✎', 'Description / Data Editor', 218);

  function styleAsFloatingEditorPanel(el, widthPx, rightPx){
    if(!el) return;
    el.style.cssText = 'position:fixed;right:' + rightPx + 'px;bottom:68px;width:' + widthPx + 'px;max-width:92vw;max-height:74vh;overflow:auto;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.20);z-index:2360;padding:12px;font-family:sans-serif;font-size:14px;display:none;flex-direction:column;gap:8px;';
    try{ document.body.appendChild(el); }catch(_){ }
  }

  styleAsFloatingEditorPanel(unitMarkerTunerCard, 390, 118);
  styleAsFloatingEditorPanel(labelToolsCard, 360, 168);
  styleAsFloatingEditorPanel(adminUnitEditorCard, 380, 218);

  function closeAdminEditorPanels(exceptName){
    if(exceptName !== 'description'){ descriptionEditorPanelOpen = false; try{ adminUnitEditorCard.style.display = 'none'; }catch(_){ } }
    if(exceptName !== 'labels'){ labelEditorPanelOpen = false; try{ labelToolsCard.style.display = 'none'; }catch(_){ } }
    if(exceptName !== 'marker'){
      markerEditorPanelOpen = false;
      try{ unitMarkerTunerCard.style.display = 'none'; }catch(_){ }
      try{ if(markerEditorModeActive) exitMarkerEditorMode(); }catch(_){ }
    }
  }

  function updateAdminEditorButtonsVisibility(){
    const admin = isEditorAdmin();
    const sel = labelEditorState && labelEditorState.currentSelection ? labelEditorState.currentSelection : null;
    const usable = !!sel && !sel.isExterior;
    descriptionEditorBtn.style.display = (admin && usable) ? 'flex' : 'none';
    labelsEditorBtn.style.display = (admin && usable) ? 'flex' : 'none';
    markerEditorBtn.style.display = admin ? 'flex' : 'none';
    if(!admin){ closeAdminEditorPanels(); }
    if(!usable){
      descriptionEditorPanelOpen = false;
      labelEditorPanelOpen = false;
      try{ adminUnitEditorCard.style.display = 'none'; labelToolsCard.style.display = 'none'; }catch(_){ }
    }
  }

  descriptionEditorBtn.onclick = function(){
    if(!isEditorAdmin()) return;
    const sel = labelEditorState && labelEditorState.currentSelection ? labelEditorState.currentSelection : null;
    if(!sel || sel.isExterior){ showShareToast('Select a unit or amenity first'); return; }
    descriptionEditorPanelOpen = !descriptionEditorPanelOpen;
    closeAdminEditorPanels(descriptionEditorPanelOpen ? 'description' : '');
    adminUnitEditorCard.style.display = descriptionEditorPanelOpen ? 'flex' : 'none';
    markUiActive();
  };

  labelsEditorBtn.onclick = function(){
    if(!isEditorAdmin()) return;
    const sel = labelEditorState && labelEditorState.currentSelection ? labelEditorState.currentSelection : null;
    if(!sel || sel.isExterior){ showShareToast('Select a unit or amenity first'); return; }
    labelEditorPanelOpen = !labelEditorPanelOpen;
    closeAdminEditorPanels(labelEditorPanelOpen ? 'labels' : '');
    labelToolsCard.style.display = labelEditorPanelOpen ? 'flex' : 'none';
    if(labelEditorPanelOpen && labelEditorState){ labelEditorState.editMode = true; labelEditorBody.style.display = 'flex'; editLabelsBtn.textContent = 'Close editor'; refreshLabelListUI(); }
    markUiActive();
  };

  markerEditorBtn.onclick = function(){
    if(!isEditorAdmin()) return;
    markerEditorPanelOpen = !markerEditorPanelOpen;
    closeAdminEditorPanels(markerEditorPanelOpen ? 'marker' : '');
    unitMarkerTunerCard.style.display = markerEditorPanelOpen ? 'flex' : 'none';
    if(markerEditorPanelOpen){
      try{ rebuildMarkerTargetListForCurrentBuilding(); hvInstallUseCurrentCameraButtonRobust(); }catch(_){ }
      setTimeout(function(){ try{ rebuildMarkerTargetListForCurrentBuilding(); previewMarkerFromTuner(true); }catch(_){ } }, 250);
      setTimeout(function(){ try{ rebuildMarkerTargetListForCurrentBuilding(); previewMarkerFromTuner(false); }catch(_){ } }, 900);
      try{ markerEditorModeActive = true; setMarkerEditorButtonState(); enterMarkerEditorCameraMode(); }catch(_){ }
    }else{
      try{ clearSelectedUnitExteriorMarker(); }catch(_){ }
      try{ if(markerEditorModeActive) exitMarkerEditorMode(); }catch(_){ }
    }
    markUiActive();
  };

  let markerEditorModeActive = false;
  let markerEditorContext = null;
  // Stable cache for marker editor targets. This avoids relying on the current View/Unit selection
  // and lets the marker editor work from Building View as soon as sheet data is ready.
  let markerTargetItemsByBuilding = [];

  function isMarkerEditableKind(kind){
    return kind === 'unit' || kind === 'amenity';
  }

  function setMarkerEditorButtonState(){
    // Marker Editor is now always an outside-building editor while its popup is open.
    try{
      if(markerEditorToggleBtn){
        markerEditorToggleBtn.textContent = markerEditorModeActive ? 'Exit editor' : 'Edit outside';
        markerEditorToggleBtn.style.fontWeight = markerEditorModeActive ? '800' : '400';
      }
    }catch(_){ }
  }

  function enterMarkerEditorCameraMode(){
    try{
      stopCameraTracking();
      setInteriorMouseBindings();
      interiorNav.enable();
      setJoystickVisible(true);
      setCameraCollision(false);
      currentMode = 'exterior';
    }catch(_){ }
  }

  function exitMarkerEditorCameraMode(){
    try{
      setCameraCollision(true);
      if(currentMode === 'exterior'){
        setExteriorMouseBindings();
        interiorNav.disable();
        setJoystickVisible(false);
      }
    }catch(_){ }
  }

  async function enterMarkerEditorMode(flyToMarker){
    const ctxInfo = applyMarkerTunerValuesToMeta();
    if(!ctxInfo){ markerTunerStatus.textContent = 'Select a unit or amenity first.'; return; }
    markerEditorModeActive = true;
    markerEditorContext = ctxInfo;
    setMarkerEditorButtonState();
    markerTunerStatus.textContent = 'Marker editor is active. You can move around outside and adjust the green box live.';
    try{
      setCesiumGroundVisible(true);
      modelEntities.forEach(function(ent,i){ if(ent) ent.show = (i === ctxInfo.bIdx); });
      (interiorEntitiesByBuilding[ctxInfo.bIdx] || []).forEach(function(ent){ try{ if(ent) ent.show = false; }catch(_){ } });
      const ent = getCurrentInteriorEntityForMarker(ctxInfo) || await hvTryEnsureInteriorEntityForMarker(ctxInfo.bIdx, ctxInfo.itemIdx);
      try{ if(ent) ent.show = false; }catch(_){ }
      activeMarkerEditorWorldPosition = await showSelectedUnitExteriorMarker(ctxInfo.row, ctxInfo.meta, ent, { forceCreate:true });
      enterMarkerEditorCameraMode();
      if(flyToMarker) await flyToSelectedUnitExteriorMarker(ctxInfo.row, ctxInfo.meta, ent);
    }catch(err){
      markerTunerStatus.textContent = 'Could not enter marker editor.';
      console.warn('Marker editor failed:', err);
    }
  }

  function exitMarkerEditorMode(){
    markerEditorModeActive = false;
    markerEditorContext = null;
    setMarkerEditorButtonState();
    markerTunerStatus.textContent = 'Marker editor closed.';
    exitMarkerEditorCameraMode();
  }

  function formatMarkerNumber(v){
    const n = Number(v);
    if(!Number.isFinite(n)) return '0';
    return (Math.round(n * 100) / 100).toString();
  }
  function getMarkerTunerValues(){
    return {
      offset:{ x:Number(markerOffX.value)||0, y:Number(markerOffY.value)||0, z:Number(markerOffZ.value)||0 },
      scale:{ x:Math.max(0.4, Number(markerScaleX.value)||8), y:Math.max(0.4, Number(markerScaleY.value)||3), z:Math.max(0.4, Number(markerScaleZ.value)||4) }
    };
  }
  function updateMarkerSheetOutput(){
    const v = getMarkerTunerValues();
    const offset = [v.offset.x, v.offset.y, v.offset.z].map(formatMarkerNumber).join(',');
    const scale = [v.scale.x, v.scale.y, v.scale.z].map(formatMarkerNumber).join(',');
    hvUpdateMarkerSheetOutputWithCamera();
    return { offset, scale, camera:(markerCameraInput && markerCameraInput.value ? markerCameraInput.value : ''), values:v };
  }
  function setMarkerTunerFromMeta(meta){
    const off = getExteriorMarkerOffset(meta || {});
    const sc = getExteriorMarkerScale(meta || {});
    markerOffX.value = formatMarkerNumber(off.x);
    markerOffY.value = formatMarkerNumber(off.y);
    markerOffZ.value = formatMarkerNumber(off.z);
    markerScaleX.value = formatMarkerNumber(sc.x);
    markerScaleY.value = formatMarkerNumber(sc.y);
    markerScaleZ.value = formatMarkerNumber(sc.z);
    try{ if(markerCameraInput) markerCameraInput.value = hvGetMarkerCameraTextFromMeta(meta || {}) || ''; }catch(_){}
    updateMarkerSheetOutput();
  }
  function getCurrentMarkerTunerContext(){
    const bIdx = Number(selectBox.value || 0);
    let sourceValue = '';
    try{ sourceValue = markerTargetSelect && markerTargetSelect.value ? markerTargetSelect.value : ''; }catch(_){ }
    if(!sourceValue) return null;
    const parts = String(sourceValue || 'exterior:0').split(':');
    const kind = parts[0] || 'exterior';
    const itemIdx = Number(parts[1] || 0);
    const targets = hvGetMarkerEditorTargetsForBuilding(bIdx);
    let meta = targets[itemIdx] || null;
    let resolvedIdx = itemIdx;
    if(!meta && markerTargetSelect && markerTargetSelect.selectedIndex >= 0){
      const altIdx = markerTargetSelect.selectedIndex;
      if(targets[altIdx]){ meta = targets[altIdx]; resolvedIdx = altIdx; }
    }
    const row = buildingsData[bIdx] || null;
    if(!row || !meta || !isMarkerEditableKind(kind)) return null;
    return { bIdx, kind, itemIdx: resolvedIdx, meta, row };
  }

  function rebuildMarkerTargetListForCurrentBuilding(){
    if(!markerTargetSelect) return;
    const bIdx = Number(selectBox && selectBox.value || 0);
    let list = [];
    try{
      list = (markerTargetItemsByBuilding && markerTargetItemsByBuilding[bIdx]) ? markerTargetItemsByBuilding[bIdx] : [];
    }catch(_){ list = []; }
    // Fallbacks for older flows: use the View/Unit dropdown and then the live interior meta array if available.
    if((!list || !list.length)){
      try{ list = (interiorMetaByBuilding && interiorMetaByBuilding[bIdx]) ? interiorMetaByBuilding[bIdx] : []; }catch(_){ list = []; }
    }
    const prev = markerTargetSelect.value;
    markerTargetSelect.innerHTML = '';

    function addTargetOption(kind, idx, item){
      if(!item || !isMarkerEditableKind(kind)) return;
      const opt = document.createElement('option');
      opt.value = kind + ':' + idx;
      const fallback = (kind === 'amenity' ? 'Amenity #' : 'Unit #') + (idx + 1);
      opt.textContent = (kind === 'amenity' ? 'Amenity — ' : 'Unit — ') + getItemDisplayName(item, fallback);
      markerTargetSelect.appendChild(opt);
    }

    // Prefer the already-built View / Unit dropdown, because it reflects exactly what HomeView can open.
    // This makes the marker editor available from Building View before any unit has been entered.
    try{
      Array.from(viewSelect.options || []).forEach(function(opt){
        const value = String(opt.value || '');
        if(!value || value === 'exterior') return;
        const parts = value.split(':');
        const rawKind = parts[0] || '';
        const idx = Number(parts[1] || 0);
        if(!Number.isFinite(idx)) return;
        if(rawKind === 'panorama') return;
        const item = list[idx] || null;
        if(!item) return;
        const kind = rawKind === 'amenity' ? 'amenity' : 'unit';
        addTargetOption(kind, idx, item);
      });
    }catch(_){ }

    // Fallback if the dropdown was not ready yet.
    if(!markerTargetSelect.options.length){
      list.forEach(function(item, idx){
        if(!item || isPanoramaRow(item)) return;
        const kind = isAmenityRow(item) ? 'amenity' : 'unit';
        addTargetOption(kind, idx, item);
      });
    }

    if(prev){
      for(let i=0;i<markerTargetSelect.options.length;i++){
        if(markerTargetSelect.options[i].value === prev){ markerTargetSelect.value = prev; break; }
      }
    }
    if(!markerTargetSelect.value && markerTargetSelect.options.length) markerTargetSelect.selectedIndex = 0;

    if(!markerTargetSelect.options.length){
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No units or amenities found yet — wait a moment or check building_key';
      markerTargetSelect.appendChild(opt);
      markerTargetSelect.disabled = true;
      markerTunerStatus.textContent = 'No unit/amenity rows found for this building. Check that Interior building_key matches the Buildings sheet name/key.';
      // If the panel was opened before CSV processing finished, retry shortly.
      setTimeout(function(){ try{ rebuildMarkerTargetListForCurrentBuilding(); }catch(_){ } }, 800);
    }else{
      markerTargetSelect.disabled = false;
      markerTunerStatus.textContent = 'Choose a unit or amenity, then edit its marker.';
    }

    const ctx = getCurrentMarkerTunerContext();
    if(ctx){
      setMarkerTunerFromMeta(ctx.meta);
      if(markerEditorPanelOpen){
        try{ setTimeout(function(){ previewMarkerFromTuner(false); }, 120); }catch(_){ }
      }
    }
    updateMarkerSheetOutput();
  }

  function autoPreviewMarkerEditorTarget(flyToMarker){
    if(!markerEditorPanelOpen) return;
    if(!markerTargetSelect || markerTargetSelect.disabled || !markerTargetSelect.value) return;
    if(markerPreviewTimer) clearTimeout(markerPreviewTimer);
    markerPreviewTimer = setTimeout(function(){
      try{ previewMarkerFromTuner(!!flyToMarker); }catch(_){ }
    }, 120);
  }
  function applyMarkerTunerValuesToMeta(){
    const ctx = getCurrentMarkerTunerContext();
    if(!ctx) return null;
    const out = updateMarkerSheetOutput();
    ctx.meta.exterior_marker_offset = out.offset;
    ctx.meta.exterior_marker_scale = out.scale;
    return Object.assign(ctx, out);
  }
  function getCurrentInteriorEntityForMarker(ctx){
    try{ return (interiorEntitiesByBuilding[ctx.bIdx] || [])[ctx.itemIdx] || null; }catch(_){ return null; }
  }
  async function previewMarkerFromTuner(flyToMarker){
    const ctxInfo = applyMarkerTunerValuesToMeta();
    if(!ctxInfo){ markerTunerStatus.textContent = 'Select a unit or amenity first.'; return; }
    markerTunerStatus.textContent = 'Updating marker...';
    try{
      setCesiumGroundVisible(true);
      modelEntities.forEach(function(ent,i){ if(ent) ent.show = (i === ctxInfo.bIdx); });
      markerEditorModeActive = true;
      setMarkerEditorButtonState();
      enterMarkerEditorCameraMode();
      let ent = getCurrentInteriorEntityForMarker(ctxInfo);
      if(!ent){
        try{ ent = await hvTryEnsureInteriorEntityForMarker(ctxInfo.bIdx, ctxInfo.itemIdx); }
        catch(loadErr){ console.warn('Marker editor could not load target model; using fallback origin.', loadErr); ent = null; }
      }
      try{ if(ent) ent.show = false; }catch(_){ }
      const markerPos = await showSelectedUnitExteriorMarker(ctxInfo.row, ctxInfo.meta, ent, { forceCreate:true });
      activeMarkerEditorWorldPosition = markerPos;
      if(!markerPos){ markerTunerStatus.textContent = 'Could not create marker for this target.'; return; }
      if(flyToMarker) await flyToSelectedUnitExteriorMarker(ctxInfo.row, ctxInfo.meta, ent);
      markerTunerStatus.textContent = 'Marker visible. Adjust Offset and Size, then Copy for Sheet.';
    }catch(err){
      markerTunerStatus.textContent = 'Could not preview marker.';
      console.warn('Marker tuner preview failed:', err);
    }
  }
  let markerPreviewTimer = null;
  function scheduleMarkerPreview(){
    updateMarkerSheetOutput();
    if(markerPreviewTimer) clearTimeout(markerPreviewTimer);
    markerPreviewTimer = setTimeout(function(){ previewMarkerFromTuner(false); }, 120);
  }
  [markerOffX, markerOffY, markerOffZ, markerScaleX, markerScaleY, markerScaleZ, markerCameraInput].forEach(function(inp){
    inp.addEventListener('input', scheduleMarkerPreview);
  });
  unitMarkerTunerCard.querySelectorAll('[data-marker-nudge]').forEach(function(btn){
    btn.addEventListener('click', function(){
      const parts = String(btn.getAttribute('data-marker-nudge') || '').split(':');
      const axis = parts[0];
      const dir = Number(parts[1]) || 0;
      const step = 0.5;
      const map = { x:markerOffX, y:markerOffY, z:markerOffZ };
      if(map[axis]) map[axis].value = formatMarkerNumber((Number(map[axis].value)||0) + dir * step);
      scheduleMarkerPreview();
    });
  });
  unitMarkerTunerCard.querySelectorAll('[data-marker-size]').forEach(function(btn){
    btn.addEventListener('click', function(){
      const parts = String(btn.getAttribute('data-marker-size') || '').split(':');
      const axis = parts[0];
      const dir = Number(parts[1]) || 0;
      const step = 0.5;
      const map = { x:markerScaleX, y:markerScaleY, z:markerScaleZ };
      if(map[axis]) map[axis].value = formatMarkerNumber(Math.max(0.4, (Number(map[axis].value)||1) + dir * step));
      scheduleMarkerPreview();
    });
  });
  if(markerTargetSelect){
    markerTargetSelect.addEventListener('change', function(){
      const ctx = getCurrentMarkerTunerContext();
      if(ctx) setMarkerTunerFromMeta(ctx.meta); hvInstallUseCurrentCameraButtonRobust();
      // In marker editing mode, selecting a target must immediately create/show its green cube.
      previewMarkerFromTuner(true);
    });
  }

  if(markerEditorToggleBtn){
    markerEditorToggleBtn.onclick = function(){
      if(markerEditorModeActive) exitMarkerEditorMode();
      else enterMarkerEditorMode(true);
    };
  }
  if(markerPreviewBtn) markerPreviewBtn.onclick = function(){ previewMarkerFromTuner(false); };
  if(markerViewBtn) markerViewBtn.onclick = function(){ previewMarkerFromTuner(true); };
  if(markerHideBtn) markerHideBtn.onclick = function(){ clearSelectedUnitExteriorMarker(); markerTunerStatus.textContent = 'Marker hidden.'; };
  setMarkerEditorButtonState();
  markerCopyBtn.onclick = async function(){
    const out = updateMarkerSheetOutput();
    const copied = await copyTextToClipboard('exterior_marker_offset\t' + out.offset + '\nexterior_marker_scale\t' + out.scale + (out.camera ? ('\nexterior_marker_camera\t' + out.camera) : ''));
    markerTunerStatus.textContent = copied ? 'Copied. Paste into the Sheet.' : 'Copy failed. Select the text and copy manually.';
    try{ markerSheetOutput.select(); }catch(_){ }
  };

  // Hide label editing tools by default; only admins can unlock them.
  editLabelsBtn.style.display = 'none';
  labelEditorBody.style.display = 'none';


const futureProjectEntitiesByBuilding = [];
function clearFutureProjectEntities(bIdx){
  const list = futureProjectEntitiesByBuilding[bIdx] || [];
  list.forEach(function(ent){
    try{ viewer.entities.remove(ent); }catch(_){}
  });
  futureProjectEntitiesByBuilding[bIdx] = [];
}
function clearAllFutureProjectEntities(){
  for(let i=0;i<futureProjectEntitiesByBuilding.length;i++){
    clearFutureProjectEntities(i);
  }
}
async function refreshFutureProjects(bIdx){
  clearAllFutureProjectEntities();
  if(!showFutureProjectsToggle || !showFutureProjectsToggle.checked) return;

  const row = buildingsData[bIdx] || null;
  if(!row) return;

  const rawFuture = firstFilled(row.future_projects, row.futureprojects);
  const items = parseFutureProjects(rawFuture);

  if(!items.length) return;

  const ents = [];
  for (const fp of items){
    let groundH = 0;
    try{ groundH = await getSurfaceHeight(fp.lng, fp.lat); }catch(_){}

    const widthDepth = Math.max(20, Number(fp.scale)||24);
    const boxHeight = Math.max(12, Number(fp.height)||20);
    const centerH = groundH + (boxHeight / 2) + 5;

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(fp.lng, fp.lat, centerH),
      box: {
        dimensions: new Cesium.Cartesian3(widthDepth, widthDepth, boxHeight),
        material: Cesium.Color.WHITE.withAlpha(0.55),
        outline: true,
        outlineColor: Cesium.Color.RED,
        outlineWidth: 3
      },
      point: {
        pixelSize: 18,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.NONE
      },
      label: {
        text: fp.name + (fp.completion ? ('\nCompletion: ' + fp.completion) : ''),
        font: '18px sans-serif',
        fillColor: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.72),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -(Math.round(boxHeight / 2) + 26)),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.NONE
      }
    });
    ents.push(ent);
  }
  futureProjectEntitiesByBuilding[bIdx] = ents;
}

  const priceChartCard = document.createElement('div');
  priceChartCard.className = 'ui-card';
  priceChartCard.style.cssText = 'border-radius:12px;padding:10px;display:none;overflow:hidden;';
  const priceChartTitle = document.createElement('div');
  priceChartTitle.className = 'hv-section-title';
  priceChartTitle.textContent = 'Price Forecast';
  priceChartTitle.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:8px;display:block;';
  priceChartCard.appendChild(priceChartTitle);

  const priceCanvas = document.createElement('canvas');
  priceCanvas.width = 310; priceCanvas.height=140;
  priceCanvas.style.cssText = 'display:block;width:100%;max-width:310px;height:140px;';
  priceChartCard.appendChild(priceCanvas);
  panelBody.appendChild(priceChartCard);
  function setPriceChartVisible(flag){
    const show = !!flag;
    priceChartCard.style.display = show ? 'block' : 'none';
    priceCanvas.style.display = show ? 'block' : 'none';
  }
  setPriceChartVisible(false);

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
        <label style="display:flex;flex-direction:column;font-size:13px;">Interest rate (% APR)<input id="loanRate" class="ui-input" type="number" min="0" max="50" value="3.6" step="0.1" style="padding:8px;border-radius:8px"></label>
        <label style="display:flex;flex-direction:column;font-size:13px;">Term (years)
          <select id="loanTerm" class="ui-select" style="padding:8px;border-radius:8px">
            <option>5</option><option>10</option><option>15</option><option>20</option><option selected>25</option><option>30</option>
          </select>
        </label>
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
  const loanOut =loanCard.querySelector('#loanOut');
  try{ loanRate.value = String(DEFAULT_MORTGAGE_RATE_APR); loanTerm.value = String(DEFAULT_MORTGAGE_TERM_YEARS); }catch(_){ }
  let refreshCompareButtons = function(){};
  function setLoanOpen(o){ loanBody.style.display=o?'flex':'none'; loanToggle.textContent=o?'Close':'Open'; }
  setLoanOpen(false);
  function pmt(r,n,pv){ if(r===0) return -(pv/n); return -(pv*r)/(1-Math.pow(1+r,-n)); }
  function recalcLoan(){
    const P = Math.max(0, Number(loanPrice.value||0));
    const dp = Math.min(90, Math.max(0, Number(loanDPct.value||0)));
    const principal = Math.max(0, P - P*dp/100);
    const rate = Math.max(0, Number(loanRate.value || DEFAULT_MORTGAGE_RATE_APR))/100;
    const termY = Math.max(1, Number(loanTerm.value || DEFAULT_MORTGAGE_TERM_YEARS));
    const m = -pmt(rate/12, termY*12, principal);
    loanOut.innerHTML = `Loan amount: <b>${fmtUSD(principal)}</b><br>Estimated monthly payment: <b>${fmtUSD(m)}</b>`;
    return {rate, termY, dpct:dp};
  }
  ;[loanPrice,loanDPct,loanRate,loanTerm].forEach(el=>el.addEventListener('input', ()=>{ recalcLoan(); refreshCompareButtons(); }));
  loanToggle.onclick=()=>setLoanOpen(loanBody.style.display==='none');

  // ===== Tooltip for POIs =====
  const tip = document.createElement('div');
  tip.className = 'ui-card';
  tip.style.cssText="position:fixed;display:none;pointer-events:none;transform:translate(-50%,-120%);padding:8px 10px;font-size:12px;z-index:1200;max-width:260px";
  document.body.appendChild(tip);


  // ===== Unit ad logo =====
  const unitAdWrap = document.createElement('div');
  unitAdWrap.id = 'unitAdWrap';
  unitAdWrap.className = 'ui-card';
  unitAdWrap.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2150;padding:8px;border-radius:14px;display:none;align-items:center;justify-content:center;max-width:min(34vw,180px);max-height:92px;box-shadow:0 10px 26px rgba(0,0,0,.18)";
  const unitAdLink = document.createElement('a');
  unitAdLink.style.cssText = 'display:block;line-height:0';
  unitAdLink.rel = 'noopener noreferrer';
  const unitAdImg = document.createElement('img');
  unitAdImg.alt = 'Interior design partner';
  // v67: keep mobile logo loading as close to desktop as possible.
  // Some hosts reject no-referrer requests on mobile Safari/Chrome, so use a softer policy.
  unitAdImg.referrerPolicy = 'origin-when-cross-origin';
  unitAdImg.decoding = 'async';
  unitAdImg.loading = 'eager';
  unitAdImg.addEventListener('error', function(){
    try{
      // v67: do not replace the logo with the old arrow fallback on mobile.
      // First retry the exact original URL from the sheet. Some hosts work in <img>
      // only with their original URL and fail after normalization on mobile.
      const raw = unitAdImg.getAttribute('data-original-src') || '';
      const current = unitAdImg.getAttribute('src') || '';
      if(raw && raw !== current && !unitAdImg.__hvRetriedRawLogo){
        unitAdImg.__hvRetriedRawLogo = true;
        unitAdImg.style.display = 'block';
        unitAdLink.style.lineHeight = '0';
        unitAdImg.src = raw;
        return;
      }
      // If it still fails, keep the logo space hidden rather than showing the ugly arrow.
      unitAdImg.style.display = 'none';
      unitAdLink.style.lineHeight = '0';
      unitAdWrap.style.display = 'none';
    }catch(_){}
  });
  unitAdImg.style.cssText = 'display:block;max-width:min(30vw,160px);max-height:72px;width:auto;height:auto;object-fit:contain;border-radius:8px';
  unitAdLink.appendChild(unitAdImg);
  unitAdWrap.appendChild(unitAdLink);
  document.body.appendChild(unitAdWrap);

  function normalizeExternalUrl(url){
    const raw = String(url || '').trim();
    if(!raw) return '';
    if(/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw) || /^tel:/i.test(raw)) return raw;
    return 'https://' + raw.replace(/^\/+/, '');
  }

  function hvNormalizeImageAssetUrl(url){
    let raw = String(url || '').trim();
    if(!raw) return '';
    try{ raw = raw.replace(/&amp;/g, '&'); }catch(_){ }
    try{
      // Google Drive share links often show as a broken/question-mark image on mobile Safari.
      // Convert common share formats into a direct thumbnail URL.
      let m = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
      if(m && m[1]) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(m[1]) + '&sz=w1000';
      m = raw.match(/[?&]id=([^&]+)/i);
      if(/drive\.google\.com/i.test(raw) && m && m[1]) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(m[1]) + '&sz=w1000';

      // Dropbox share links need raw=1 for direct image rendering.
      if(/dropbox\.com/i.test(raw)){
        const u = new URL(raw);
        u.searchParams.delete('dl');
        u.searchParams.set('raw', '1');
        return u.href;
      }

      // GitHub blob links should be raw links for <img>.
      m = raw.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
      if(m) return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] + '/' + m[4];
    }catch(_){ }
    try{ return encodeURI(raw); }catch(_){ return raw; }
  }
  function hideUnitAdLogo(){
    unitAdWrap.style.display = 'none';
    unitAdImg.removeAttribute('src');
    unitAdImg.style.display = 'block';
    try{ const fb = unitAdLink.querySelector('.hv-ad-fallback'); if(fb) fb.remove(); }catch(_){ }
    unitAdLink.removeAttribute('href');
    unitAdLink.style.cursor = 'default';
    unitAdImg.style.cursor = 'default';
  }
  function getUnitAdLogoConfig(meta, row){
    const source = meta || row || {};
    const logoUrl = firstFilled(
      source.ad_logo_url,
      source.logo_image_url,
      source.logo_url,
      source.company_logo_url,
      source.partner_logo_url,
      source.ad_logo,
      source.logo,
      source.brand_logo,
      source.sponsor_logo_url,
      source.sponsor_logo
    );
    const linkUrl = normalizeExternalUrl(firstFilled(
      source.ad_link_url,
      source.logo_link_url,
      source.website_url,
      source.company_website,
      source.company_url,
      source.partner_url,
      source.ad_link,
      source.logo_link,
      source.url,
      source.website
    ));
    return { logoUrl: logoUrl, linkUrl: linkUrl };
  }
  function showUnitAdLogo(meta, row){
    const cfg = getUnitAdLogoConfig(meta, row);
    if(!cfg.logoUrl){
      hideUnitAdLogo();
      return;
    }
    try{ const fb = unitAdLink.querySelector('.hv-ad-fallback'); if(fb) fb.remove(); }catch(_){ }
    unitAdImg.__hvRetriedRawLogo = false;
    unitAdImg.setAttribute('data-original-src', String(cfg.logoUrl || '').trim());
    unitAdImg.style.display = 'block';
    unitAdLink.style.lineHeight = '0';
    unitAdImg.src = hvNormalizeImageAssetUrl(cfg.logoUrl);
    if(cfg.linkUrl){
      unitAdLink.href = cfg.linkUrl;
      unitAdLink.target = '_blank';
      unitAdLink.style.cursor = 'pointer';
      unitAdImg.style.cursor = 'pointer';
    }else{
      unitAdLink.removeAttribute('href');
      unitAdLink.removeAttribute('target');
      unitAdLink.style.cursor = 'default';
      unitAdImg.style.cursor = 'default';
    }
    unitAdWrap.style.display = 'flex';
  }

  // ===== Mouse bindings =====
  const ssc = viewer.scene.screenSpaceCameraController;
  function setExteriorMouseBindings(){
    panoramaDragController.disable();
    try{ exteriorOrbitController && exteriorOrbitController.enable(); }catch(_){ }

    // v58 Building View safety:
    // Native Cesium left-drag can still pitch through the terrain in a local orbit frame.
    // So Building View uses HomeView's own safe orbit drag with a hard pitch range.
    // Interior, Panorama, and Cinematic Camera remain free and are not clamped.
    viewer.scene.camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
    setCameraCollision(true);
    ssc.enableInputs = true;
    ssc.enableRotate = false;
    ssc.enableTranslate = false;
    ssc.enableTilt = false;
    ssc.enableLook = false;
    ssc.enableZoom = true;
    ssc.rotateEventTypes = [];
    ssc.translateEventTypes = [];
    ssc.tiltEventTypes = [];
    ssc.lookEventTypes = [];
    try{
      ssc.zoomEventTypes = [
        Cesium.CameraEventType.WHEEL,
        Cesium.CameraEventType.PINCH
      ];
    }catch(_){ }
  }
  function setInteriorMouseBindings(){
    panoramaDragController.disable();
    try{ exteriorOrbitController && exteriorOrbitController.disable(); }catch(_){ }
    viewer.scene.camera.constrainedAxis = undefined;
    ssc.enableInputs = true;
    ssc.enableRotate=false; ssc.enableTranslate=false; ssc.enableTilt=false;
    ssc.enableLook=true;
    ssc.lookEventTypes=[Cesium.CameraEventType.LEFT_DRAG];
    ssc.rotateEventTypes=[]; ssc.translateEventTypes=[]; ssc.tiltEventTypes=[];
  }
  function setPanoramaMouseBindings(){
    try{ exteriorOrbitController && exteriorOrbitController.disable(); }catch(_){ }
    viewer.scene.camera.constrainedAxis = undefined;
    ssc.enableInputs = false;
    ssc.enableRotate = false;
    ssc.enableTranslate = false;
    ssc.enableTilt = false;
    ssc.enableZoom = false;
    ssc.enableLook = false;
    ssc.lookEventTypes = [];
    ssc.rotateEventTypes = [];
    ssc.translateEventTypes = [];
    ssc.tiltEventTypes = [];
    panoramaDragController.enable();
  }

  function clampCameraRollZero(){
    const cam = viewer.scene.camera;
    if (Math.abs(cam.roll) > 1e-4) {
      cam.setView({ destination: cam.positionWC, orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0.0 } });
    }
  }

  const panoramaDragController = (function(){
    let enabled = false;
    let dragging = false;
    let pointerId = null;
    let lastX = 0, lastY = 0;
    const headingPerPixel = 0.0035;
    const pitchPerPixel = 0.0030;
    const el = viewer.scene.canvas;

    function beginAt(x, y){
      dragging = true;
      lastX = x;
      lastY = y;
    }
    function moveTo(x, y){
      if(!enabled || !dragging) return;
      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;
      const cam = viewer.camera;
      const heading = cam.heading - (dx * headingPerPixel);
      const pitchRaw = cam.pitch + (dy * pitchPerPixel);
      const pitch = Math.max(Cesium.Math.toRadians(-89), Math.min(Cesium.Math.toRadians(89), pitchRaw));
      cam.setView({
        destination: cam.positionWC,
        orientation: { heading: heading, pitch: pitch, roll: 0.0 }
      });
      clampCameraRollZero();
      requestSceneRender();
    }
    function end(){
      const capturedPointerId = pointerId;
      dragging = false;
      pointerId = null;
      try{ el.releasePointerCapture && capturedPointerId != null && el.releasePointerCapture(capturedPointerId); }catch(_){ }
    }

    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', function(evt){
      if(!enabled) return;
      if(evt.pointerType === 'touch' && !evt.isPrimary) return;
      pointerId = evt.pointerId;
      try{ el.setPointerCapture && el.setPointerCapture(pointerId); }catch(_){ }
      beginAt(evt.clientX, evt.clientY);
      evt.preventDefault();
      evt.stopPropagation();
    }, { passive:false });

    el.addEventListener('pointermove', function(evt){
      if(!enabled || !dragging) return;
      if(pointerId != null && evt.pointerId !== pointerId) return;
      moveTo(evt.clientX, evt.clientY);
      evt.preventDefault();
      evt.stopPropagation();
    }, { passive:false });

    el.addEventListener('pointerup', function(evt){
      if(pointerId != null && evt.pointerId !== pointerId) return;
      end();
      evt.preventDefault();
      evt.stopPropagation();
    }, { passive:false });

    el.addEventListener('pointercancel', function(evt){
      if(pointerId != null && evt.pointerId !== pointerId) return;
      end();
      evt.preventDefault();
      evt.stopPropagation();
    }, { passive:false });

    el.addEventListener('lostpointercapture', function(){ end(); }, { passive:true });

    return {
      enable(){ enabled = true; dragging = false; },
      disable(){ enabled = false; end(); }
    };
  })();

  const exteriorOrbitController = (function(){
    let enabled = false;
    let dragging = false;
    let pointerId = null;
    let lastX = 0, lastY = 0;
    let orbitFrame = null;
    let orbitCenter = null;
    let heading = 0;
    let pitch = Cesium.Math.toRadians(-28);
    let distance = 120;
    let pinchActive = false;
    let pinchStartDistance = 0;
    let pinchStartRange = 120;
    const MIN_PITCH = Cesium.Math.toRadians(-72); // steep enough to view the roof, never under terrain
    const MAX_PITCH = Cesium.Math.toRadians(-12); // prevents flipping upward/through the ground
    const headingPerPixel = 0.0042;
    const pitchPerPixel = 0.0024;
    const MIN_DRAG_PX = 3;
    const el = viewer.scene.canvas;

    function isCinematicFreeCamera(){
      return !!(window.__hvCinematicFreeCameraActive || window.__hvCinematicPlaying);
    }
    function shouldRun(){
      return enabled && currentMode === 'exterior' && !isCinematicFreeCamera() && !!orbitFrame;
    }
    function clampPitch(v){
      return Math.max(MIN_PITCH, Math.min(MAX_PITCH, Number(v) || Cesium.Math.toRadians(-28)));
    }
    function syncFromCamera(){
      try{
        const cam = viewer.camera;
        heading = Number.isFinite(cam.heading) ? cam.heading : heading;
        pitch = clampPitch(Number.isFinite(cam.pitch) ? cam.pitch : pitch);
        if(orbitCenter){
          const d = Cesium.Cartesian3.distance(cam.positionWC, orbitCenter);
          if(Number.isFinite(d) && d > 1) distance = d;
        }else if(cam.position){
          const d = Cesium.Cartesian3.magnitude(cam.position);
          if(Number.isFinite(d) && d > 1) distance = d;
        }
      }catch(_){ }
    }
    function clampDistance(v){
      const raw = Number(v);
      if(!Number.isFinite(raw)) return Math.max(8, distance || 120);
      return Math.max(18, Math.min(2500, raw));
    }
    function getTouchDistance(touches){
      try{
        if(!touches || touches.length < 2) return 0;
        const a = touches[0], b = touches[1];
        const dx = (a.clientX || 0) - (b.clientX || 0);
        const dy = (a.clientY || 0) - (b.clientY || 0);
        return Math.sqrt(dx * dx + dy * dy);
      }catch(_){ return 0; }
    }
    function apply(){
      if(!shouldRun()) return;
      try{
        distance = clampDistance(distance);
        viewer.camera.lookAtTransform(orbitFrame, new Cesium.HeadingPitchRange(heading, clampPitch(pitch), distance));
        requestSceneRender();
      }catch(_){ }
    }
    function setOrbit(frame, center, initialHeading, initialPitch, initialDistance){
      orbitFrame = frame || null;
      orbitCenter = center ? Cesium.Cartesian3.clone(center, new Cesium.Cartesian3()) : null;
      heading = Number.isFinite(initialHeading) ? initialHeading : heading;
      pitch = clampPitch(initialPitch);
      distance = clampDistance(Number(initialDistance) || distance || 120);
      if(enabled && currentMode === 'exterior' && !isCinematicFreeCamera()) apply();
    }

    el.addEventListener('pointerdown', function(evt){
      if(!shouldRun()) return;
      // Let the custom touchstart/touchmove pinch handler own two-finger zoom on mobile.
      if(evt.pointerType === 'touch' && pinchActive) return;
      if(evt.button !== undefined && evt.button !== 0) return;
      if(evt.pointerType === 'touch' && !evt.isPrimary) return;
      pointerId = evt.pointerId;
      lastX = evt.clientX;
      lastY = evt.clientY;
      dragging = false;
      syncFromCamera();
      try{ el.setPointerCapture && el.setPointerCapture(pointerId); }catch(_){ }
    }, { passive:false });

    el.addEventListener('pointermove', function(evt){
      if(!shouldRun()) return;
      // v59 fix: never orbit from plain mouse hover. Only the active captured
      // left-button pointer may drive the exterior orbit. This keeps the pitch
      // limit behavior without making the camera follow the mouse constantly.
      if(pointerId == null) return;
      if(evt.pointerId !== pointerId) return;
      if(evt.pointerType !== 'touch' && typeof evt.buttons === 'number' && (evt.buttons & 1) !== 1){
        end(evt);
        return;
      }
      const dx = evt.clientX - lastX;
      const dy = evt.clientY - lastY;
      if(!dragging && Math.sqrt(dx*dx + dy*dy) < MIN_DRAG_PX) return;
      dragging = true;
      lastX = evt.clientX;
      lastY = evt.clientY;
      heading -= dx * headingPerPixel;
      pitch = clampPitch(pitch + dy * pitchPerPixel);
      apply();
      evt.preventDefault();
      evt.stopPropagation();
    }, { passive:false });

    function end(evt){
      if(!shouldRun() && !dragging){ pointerId = null; return; }
      const capturedPointerId = pointerId;
      pointerId = null;
      const wasDragging = dragging;
      dragging = false;
      try{ el.releasePointerCapture && capturedPointerId != null && el.releasePointerCapture(capturedPointerId); }catch(_){ }
      if(wasDragging && evt){
        try{ evt.preventDefault(); evt.stopPropagation(); }catch(_){ }
      }
    }
    el.addEventListener('pointerup', end, { passive:false });
    el.addEventListener('pointercancel', end, { passive:false });
    el.addEventListener('lostpointercapture', function(){ dragging = false; pointerId = null; }, { passive:true });

    // Keep native wheel zoom on desktop, but refresh our stored range before the next safe orbit drag.
    el.addEventListener('wheel', function(){
      if(!shouldRun()) return;
      setTimeout(syncFromCamera, 0);
    }, { passive:true });

    // v67: Cesium's native PINCH zoom can be swallowed by the safe exterior orbit
    // controller on mobile. Implement a small, explicit two-finger pinch zoom only
    // for Building View. Panorama, 3D interior and Cinematic Camera remain untouched.
    el.addEventListener('touchstart', function(evt){
      if(!shouldRun()) return;
      if(!evt.touches || evt.touches.length !== 2) return;
      pinchActive = true;
      dragging = false;
      pointerId = null;
      syncFromCamera();
      pinchStartDistance = getTouchDistance(evt.touches);
      pinchStartRange = clampDistance(distance);
      try{ evt.preventDefault(); evt.stopPropagation(); }catch(_){ }
    }, { passive:false });

    el.addEventListener('touchmove', function(evt){
      if(!shouldRun() || !pinchActive) return;
      if(!evt.touches || evt.touches.length !== 2) return;
      const d = getTouchDistance(evt.touches);
      if(d > 4 && pinchStartDistance > 4){
        distance = clampDistance(pinchStartRange * (pinchStartDistance / d));
        apply();
      }
      try{ evt.preventDefault(); evt.stopPropagation(); }catch(_){ }
    }, { passive:false });

    function endPinch(){
      pinchActive = false;
      pinchStartDistance = 0;
      pinchStartRange = clampDistance(distance);
    }
    el.addEventListener('touchend', function(evt){
      if(!pinchActive) return;
      if(!evt.touches || evt.touches.length < 2) endPinch();
    }, { passive:false });
    el.addEventListener('touchcancel', function(){ endPinch(); }, { passive:false });

    return {
      enable(){ enabled = true; dragging = false; },
      disable(){ enabled = false; dragging = false; pointerId = null; pinchActive = false; },
      setOrbit:setOrbit,
      isDragging(){ return dragging; }
    };
  })();

  setExteriorMouseBindings();

  // ===== Keyboard/Joystick move =====
  function makeInteriorKeyboardMove(viewer){
    let enabled=false, down={}, baseSpeed=2.2, lastT=performance.now(), jx=0,jy=0,jz=0, rafId=0;
    const MOVE_KEYS = ['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'];
    function isTypingTarget(e){
      const tag=(e.target&&e.target.tagName)||'';
      if(e.target && e.target.isContentEditable) return true;
      if(tag === 'TEXTAREA') return true;
      // In HomeView interior mode, WASD/arrow keys should move the camera even when the controls panel is open.
      // We only protect real free-text typing fields. Select/buttons should not steal navigation keys.
      if(tag === 'INPUT'){
        const type = String((e.target && e.target.type) || '').toLowerCase();
        return ['text','search','url','email','password','number','tel'].includes(type) && !MOVE_KEYS.includes(e.code);
      }
      return false;
    }
    function onKD(e){
      if(!enabled) return;
      if(isTypingTarget(e)) return;
      if(MOVE_KEYS.includes(e.code)){
        try{ if(document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur(); }catch(_){ }
        try{ e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }catch(_){ }
        down[e.code]=true;
      }
    }
    function onKU(e){
      if(MOVE_KEYS.includes(e.code)){
        try{ e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }catch(_){ }
        down[e.code]=false;
      }
    }
    function tick(){
      if(!enabled) return;
      const now=performance.now(), dt=Math.min(0.05,(now-lastT)/1000); lastT=now;
      const cam=viewer.camera; const mult=(down.ShiftLeft||down.ShiftRight)?3:1; const v=baseSpeed*mult;
      const forward = (down.KeyW || down.ArrowUp ? 1 : 0) - (down.KeyS || down.ArrowDown ? 1 : 0) + (Math.abs(jy)>0.02 ? jy : 0);
      const right = (down.KeyD || down.ArrowRight ? 1 : 0) - (down.KeyA || down.ArrowLeft ? 1 : 0) + (Math.abs(jx)>0.02 ? jx : 0);
      const up = (down.KeyE || down.Space ? 1 : 0) - (down.KeyQ ? 1 : 0) + (Math.abs(jz)>0.02 ? jz : 0);
      if(Math.abs(forward)>0.001) cam.moveForward(v*dt*forward);
      if(Math.abs(right)>0.001) cam.moveRight(v*dt*right);
      if(Math.abs(up)>0.001) cam.moveUp(v*dt*up);
      clampCameraRollZero();
      if(Math.abs(forward)>0.001 || Math.abs(right)>0.001 || Math.abs(up)>0.001) requestSceneRender();
      rafId = requestAnimationFrame(tick);
    }
    return {
      enable(){
        if(enabled) return;
        enabled=true; down={}; lastT=performance.now();
        window.addEventListener('keydown',onKD,{capture:true, passive:false});
        window.addEventListener('keyup',onKU,{capture:true, passive:false});
        try{ viewer.clock.onTick.addEventListener(tick); }catch(_){ }
        if(rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tick);
      },
      disable(){
        if(!enabled) return;
        enabled=false; down={};
        window.removeEventListener('keydown',onKD,true);
        window.removeEventListener('keyup',onKU,true);
        try{ viewer.clock.onTick.removeEventListener(tick); }catch(_){ }
        if(rafId) cancelAnimationFrame(rafId); rafId=0;
        jx=jy=jz=0;
      },
      setSpeed(v){ baseSpeed=Number(v)||baseSpeed; }, setJoyAxes(ax,ay){ jx=ax; jy=ay; }, setJoyZ(az){ jz=az; }
    };
  }
  const interiorNav = makeInteriorKeyboardMove(viewer); interiorNav.setSpeed(2.2);

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
    const show = !!v && !!cameraJoystickEnabledByUser;
    joy.style.display = show ? 'flex' : 'none';
    vzWrap.style.display = show ? 'flex' : 'none';
    if(!show){ resetJoy(); upHeld = dnHeld = false; refreshJoyZ(); }
  }
  setJoystickVisible(false);

  // ===== Admin auth (editor-only) =====
  const EDITOR_AUTH_STORAGE_KEY = 'homeview.editorAuth';
  function getEditorAuthState(){
    try{
      const raw = sessionStorage.getItem(EDITOR_AUTH_STORAGE_KEY) || '';
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(parsed && parsed.username && parsed.password) return parsed;
    }catch(_){ }
    return null;
  }
  function isEditorAdmin(){
    return !!getEditorAuthState();
  }
  function setEditorAdminAuth(username, password){
    try{
      sessionStorage.setItem(EDITOR_AUTH_STORAGE_KEY, JSON.stringify({
        username: String(username || '').trim(),
        password: String(password || '')
      }));
    }catch(_){ }
  }
  function clearEditorAdminAuth(){
    try{ sessionStorage.removeItem(EDITOR_AUTH_STORAGE_KEY); }catch(_){ }
  }
  async function fetchAdminJson(action, extra){
    const auth = getEditorAuthState();
    if(!auth || !auth.username || !auth.password){
      throw new Error('Admin login required');
    }
    return fetchAppJson(action, Object.assign({
      editor_username: auth.username,
      editor_password: auth.password
    }, extra || {}));
  }

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
  gfxCard.innerHTML = `<div style="font-weight:700; font-size:14px; margin-bottom:8px;">Graphics</div><label style="display:block; font-size:13px; margin-bottom:6px;">Graphic Quality</label>`;
  document.body.appendChild(gfxCard);
  const presetSelect = document.createElement('select');
  presetSelect.className='ui-select';
  presetSelect.style.cssText = "width:100%; padding:8px; border-radius:8px;";
  ['low','balanced','high'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent = v.charAt(0).toUpperCase()+v.slice(1); presetSelect.appendChild(o); });
  gfxCard.appendChild(presetSelect);

  // 3D model quality control removed: Cesium applies rendering quality globally, so HomeView now exposes one Graphic Quality control only.

  const displayOptionsWrap = document.createElement('div');
  displayOptionsWrap.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,.08);display:flex;flex-direction:column;gap:8px;font-size:13px;';
  displayOptionsWrap.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input id="showJoystickToggle" type="checkbox"> Show camera joystick</label>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input id="showMinimapToggle" type="checkbox" checked> Show minimap</label>
    <button id="settingsNavigationBtn" class="ui-btn" style="width:100%;border-radius:8px;padding:8px;cursor:pointer;font-weight:700">Hide Navigation</button>
    <button id="presentationModeBtn" class="ui-btn" style="width:100%;border-radius:8px;padding:8px;cursor:pointer;font-weight:700">Presentation Mode</button>`;
  gfxCard.appendChild(displayOptionsWrap);
  const showJoystickToggle = displayOptionsWrap.querySelector('#showJoystickToggle');
  const showMinimapToggle = displayOptionsWrap.querySelector('#showMinimapToggle');
  if(showMinimapToggle){
    showMinimapToggle.checked = !IS_MOBILE && minimapEnabledByUser;
    if(IS_MOBILE){
      try{
        const lbl = showMinimapToggle.closest ? showMinimapToggle.closest('label') : null;
        if(lbl) lbl.style.display = 'none';
      }catch(_){ }
    }
  }
  const autoHideUIToggle = null; // HomeView v56: auto-hide UI removed
  const settingsNavigationBtn = displayOptionsWrap.querySelector('#settingsNavigationBtn');
  function hvSyncSettingsNavigationButton(){
    try{
      if(!settingsNavigationBtn) return;
      const navOn = !!((typeof navigationLabelsEnabled !== 'undefined') ? navigationLabelsEnabled : true);
      settingsNavigationBtn.textContent = navOn ? 'Hide Navigation' : 'Show Navigation';
      settingsNavigationBtn.title = navOn ? 'Hide 3D navigation labels' : 'Show 3D navigation labels';
      settingsNavigationBtn.setAttribute('aria-label', settingsNavigationBtn.title);
    }catch(_){ }
  }
  hvSyncSettingsNavigationButton();
  const presentationModeBtn = displayOptionsWrap.querySelector('#presentationModeBtn');
  showJoystickToggle.checked = cameraJoystickEnabledByUser;
  const editorAuthWrap = document.createElement('div');
  editorAuthWrap.style.cssText = "margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,0,0,.08);display:flex;flex-direction:column;gap:8px";
  editorAuthWrap.innerHTML = `
    <div style="font-weight:700;font-size:13px;">Editor access</div>
    <button id="openEditorAuthBtn" class="ui-btn" style="width:100%;">Enter editor</button>
    <div id="editorAuthPanel" style="display:none;flex-direction:column;gap:8px;">
      <input id="editorUsernameInput" class="ui-input" type="text" placeholder="Username" style="width:100%;padding:8px;border-radius:8px;">
      <input id="editorPasswordInput" class="ui-input" type="password" placeholder="Password" style="width:100%;padding:8px;border-radius:8px;">
      <div style="display:flex;gap:8px;">
        <button id="editorLoginBtn" class="ui-btn" style="flex:1;">Login</button>
        <button id="editorLogoutBtn" class="ui-btn" style="display:none;">Logout</button>
      </div>
      <div id="editorAuthStatus" style="font-size:12px;color:#555;">Editor mode is locked.</div>
    </div>`;
  gfxCard.appendChild(editorAuthWrap);
  const openEditorAuthBtn = editorAuthWrap.querySelector('#openEditorAuthBtn');
  const editorAuthPanel = editorAuthWrap.querySelector('#editorAuthPanel');
  const editorUsernameInput = editorAuthWrap.querySelector('#editorUsernameInput');
  const editorPasswordInput = editorAuthWrap.querySelector('#editorPasswordInput');
  const editorLoginBtn = editorAuthWrap.querySelector('#editorLoginBtn');
  const editorLogoutBtn = editorAuthWrap.querySelector('#editorLogoutBtn');
  const editorAuthStatus = editorAuthWrap.querySelector('#editorAuthStatus');
  const openAnalyticsBtn = document.createElement('button');
  openAnalyticsBtn.className = 'ui-btn';
  openAnalyticsBtn.textContent = 'Analytics';
  openAnalyticsBtn.style.cssText = 'width:100%;display:none;';
  editorAuthWrap.appendChild(openAnalyticsBtn);


  // ===== Cinematic Camera Tool (Admin-only MVP: Start -> End path) =====
  const cinematicCard = document.createElement('div');
  cinematicCard.className = 'ui-card';
  cinematicCard.style.cssText = 'position:fixed;right:16px;bottom:68px;width:320px;max-width:92vw;max-height:72vh;overflow:auto;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.20);z-index:2350;padding:12px;font-family:sans-serif;font-size:14px;display:none;flex-direction:column;gap:8px;';
  cinematicCard.innerHTML = `
    <div style="font-weight:700;font-size:13px;">Cinematic Camera Tool</div>
    <div style="font-size:12px;line-height:1.45;color:#555;">Move the camera to the desired start frame, save it, then move to the end frame and play.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button id="cinSetStartBtn" class="ui-btn" style="border-radius:8px;padding:8px;cursor:pointer;font-size:12px;">Set Start</button>
      <button id="cinSetEndBtn" class="ui-btn" style="border-radius:8px;padding:8px;cursor:pointer;font-size:12px;">Set End</button>
    </div>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;">Duration (seconds)
      <input id="cinDurationInput" class="ui-input" type="number" min="2" max="60" step="1" value="8" style="padding:8px;border-radius:8px;">
    </label>
    <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;">Camera rotation
      <select id="cinRotationModeSelect" class="ui-select" style="padding:8px;border-radius:8px;">
        <option value="smooth">Smooth start-to-end rotation</option>
        <option value="locked">Keep start angle fixed</option>
        <option value="focus">Look at focus target</option>
      </select>
    </label>
    <div style="border-top:1px solid rgba(0,0,0,.08);padding-top:8px;display:flex;flex-direction:column;gap:8px;">
      <div style="font-weight:700;font-size:12px;">Focus Target</div>
      <div style="font-size:12px;line-height:1.45;color:#555;">For focus mode, click Set Focus Target, then click any point in the scene. The camera will move from Start to End while looking at that point.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <button id="cinSetFocusBtn" class="ui-btn" style="border-radius:8px;padding:8px;cursor:pointer;font-size:12px;">Set Focus Target</button>
        <button id="cinClearFocusBtn" class="ui-btn" style="border-radius:8px;padding:8px;cursor:pointer;font-size:12px;">Clear Focus</button>
      </div>
      <div id="cinFocusStatus" style="font-size:12px;color:#555;line-height:1.45;">Focus target not set.</div>
    </div>
    <div style="border-top:1px solid rgba(0,0,0,.08);padding-top:8px;display:flex;flex-direction:column;gap:8px;">
      <div style="font-weight:700;font-size:12px;">Orbit Mode</div>
      <div style="font-size:12px;line-height:1.45;color:#555;">Create a smooth circular camera move around the selected building or the Focus Target.</div>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;">Orbit center
        <select id="cinOrbitCenterSelect" class="ui-select" style="padding:8px;border-radius:8px;">
          <option value="building">Selected building</option>
          <option value="focus">Focus target</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;">Orbit direction
        <select id="cinOrbitDirectionSelect" class="ui-select" style="padding:8px;border-radius:8px;">
          <option value="cw">Clockwise</option>
          <option value="ccw">Counterclockwise</option>
        </select>
      </label>
      <button id="cinOrbitPlayBtn" class="ui-btn" style="border-radius:8px;padding:8px;cursor:pointer;font-weight:700;">Play Orbit</button>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;"><input id="cinHideUiToggle" type="checkbox" checked> Hide UI while playing</label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button id="cinPlayBtn" class="ui-btn" style="border-radius:8px;padding:8px;cursor:pointer;font-weight:700;">Play Path</button>
      <button id="cinStopBtn" class="ui-btn" style="border-radius:8px;padding:8px;cursor:pointer;">Stop</button>
    </div>
    <div id="cinStatus" style="font-size:12px;color:#555;line-height:1.45;">Start and End are not set.</div>`;
  const cinematicToolBtn = document.createElement('button');
  cinematicToolBtn.type = 'button';
  cinematicToolBtn.className = 'ui-btn hv-chrome-anim';
  cinematicToolBtn.title = 'Cinematic Camera Tool';
  cinematicToolBtn.setAttribute('aria-label', 'Cinematic Camera Tool');
  cinematicToolBtn.textContent = '🎬';
  cinematicToolBtn.style.cssText = 'position:fixed;right:68px;bottom:16px;width:44px;height:44px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.18);z-index:2120;cursor:pointer;display:none;align-items:center;justify-content:center;font-size:18px;line-height:1;';
  document.body.appendChild(cinematicToolBtn);
  document.body.appendChild(cinematicCard);
  function isCinematicPanelOpen(){
    return !!(cinematicCard && cinematicCard.style.display !== 'none' && cinematicCard.style.display !== '');
  }
  let cinematicSetupFreeCameraActive = false;
  function enterCinematicSetupFreeCamera(){
    if(cinematicIsPlaying || currentMode !== 'exterior' || cinematicSetupFreeCameraActive) return;
    cinematicSetupFreeCameraActive = true;
    try{ window.__hvCinematicFreeCameraActive = true; }catch(_){ }
    try{
      // While setting Start/End in Building View, unlock the camera like interior mode
      // so admins can frame exact camera positions and angles.
      stopCameraTracking();
      setInteriorMouseBindings();
      interiorNav.enable();
      setJoystickVisible(true);
    }catch(_){ }
  }
  function exitCinematicSetupFreeCamera(){
    if(!cinematicSetupFreeCameraActive) return;
    cinematicSetupFreeCameraActive = false;
    try{ window.__hvCinematicFreeCameraActive = false; }catch(_){ }
    try{
      if(currentMode === 'exterior'){
        setExteriorMouseBindings();
        interiorNav.disable();
        setJoystickVisible(false);
      }else if(currentMode === 'interior'){
        setInteriorMouseBindings();
        interiorNav.enable();
        setJoystickVisible(true);
      }else if(currentMode === 'panorama'){
        setPanoramaMouseBindings();
        interiorNav.disable();
        setJoystickVisible(false);
      }
    }catch(_){ }
  }
  function setCinematicPanelOpen(open){
    const shouldOpen = !!open;
    cinematicCard.style.display = shouldOpen ? 'flex' : 'none';
    if(shouldOpen){
      try{ gfxCard.style.display = 'none'; }catch(_){ }
      enterCinematicSetupFreeCamera();
    }else{
      cinematicFocusPickPending = false;
      try{
        if(!cinematicIsPlaying){
          window.__hvCinematicFreeCameraActive = false;
          window.__hvCinematicPlaying = false;
          cinematicSetupFreeCameraActive = false;
          cinematicStopRequested = false;
        }
      }catch(_){ }
      updateCinematicStatus();
      exitCinematicSetupFreeCamera();
    }
    markUiActive();
  }
  cinematicToolBtn.addEventListener('click', function(){
    setCinematicPanelOpen(!isCinematicPanelOpen());
  });
  const cinSetStartBtn = cinematicCard.querySelector('#cinSetStartBtn');
  const cinSetEndBtn = cinematicCard.querySelector('#cinSetEndBtn');
  const cinDurationInput = cinematicCard.querySelector('#cinDurationInput');
  const cinRotationModeSelect = cinematicCard.querySelector('#cinRotationModeSelect');
  const cinSetFocusBtn = cinematicCard.querySelector('#cinSetFocusBtn');
  const cinClearFocusBtn = cinematicCard.querySelector('#cinClearFocusBtn');
  const cinFocusStatus = cinematicCard.querySelector('#cinFocusStatus');
  const cinOrbitCenterSelect = cinematicCard.querySelector('#cinOrbitCenterSelect');
  const cinOrbitDirectionSelect = cinematicCard.querySelector('#cinOrbitDirectionSelect');
  const cinOrbitPlayBtn = cinematicCard.querySelector('#cinOrbitPlayBtn');
  const cinHideUiToggle = cinematicCard.querySelector('#cinHideUiToggle');
  const cinPlayBtn = cinematicCard.querySelector('#cinPlayBtn');
  const cinStopBtn = cinematicCard.querySelector('#cinStopBtn');
  const cinStatus = cinematicCard.querySelector('#cinStatus');

  let cinematicStartCamera = null;
  let cinematicEndCamera = null;
  let cinematicFocusTarget = null;
  let cinematicFocusMarkerEntity = null;
  let cinematicFocusPickPending = false;
  let cinematicSavedEntityVisuals = null;
  let cinematicIsPlaying = false;
  let cinematicStopRequested = false;
  let cinematicSavedInputState = null;
  let cinematicSavedChromeState = null;

  function captureCameraState(){
    const cam = viewer.camera;
    return {
      position: Cesium.Cartesian3.clone(cam.positionWC),
      heading: cam.heading || 0,
      pitch: cam.pitch || 0,
      roll: cam.roll || 0
    };
  }
  function makeCameraOrientationLookAt(position, target){
    if(!Cesium.defined(position) || !Cesium.defined(target)) return null;
    const safePosition = Cesium.Cartesian3.clone(position, new Cesium.Cartesian3());
    const safeTarget = Cesium.Cartesian3.clone(target, new Cesium.Cartesian3());
    if(!Cesium.defined(safePosition) || !Cesium.defined(safeTarget)) return null;

    const direction = Cesium.Cartesian3.subtract(safeTarget, safePosition, new Cesium.Cartesian3());
    if(Cesium.Cartesian3.magnitude(direction) < 0.001) return null;
    Cesium.Cartesian3.normalize(direction, direction);

    let up = Cesium.Cartesian3.normalize(safePosition, new Cesium.Cartesian3());
    let right = Cesium.Cartesian3.cross(direction, up, new Cesium.Cartesian3());

    // If the camera direction is almost parallel to the world-up vector, use Cesium's unit Z as a stable fallback.
    if(Cesium.Cartesian3.magnitude(right) < 0.001){
      up = Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
      right = Cesium.Cartesian3.cross(direction, up, new Cesium.Cartesian3());
    }
    if(Cesium.Cartesian3.magnitude(right) < 0.001) return null;

    Cesium.Cartesian3.normalize(right, right);
    const correctedUp = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(correctedUp, correctedUp);

    // Cesium.Matrix4.fromCamera expects a camera-like object with `position`, not `destination`.
    const transform = Cesium.Matrix4.fromCamera({ position: safePosition, direction: direction, up: correctedUp });
    return Cesium.Transforms.fixedFrameToHeadingPitchRoll(transform);
  }

  // Camera-stand style look-at: move the camera position separately, then point the camera at target using direction/up.
  // This avoids heading/pitch/roll axis confusion in Cesium's Earth-fixed frame.
  function makeCameraDirectionUpLookAt(position, target){
    if(!Cesium.defined(position) || !Cesium.defined(target)) return null;
    const safePosition = Cesium.Cartesian3.clone(position, new Cesium.Cartesian3());
    const safeTarget = Cesium.Cartesian3.clone(target, new Cesium.Cartesian3());
    const direction = Cesium.Cartesian3.subtract(safeTarget, safePosition, new Cesium.Cartesian3());
    if(!Cesium.defined(direction) || Cesium.Cartesian3.magnitude(direction) < 0.001) return null;
    Cesium.Cartesian3.normalize(direction, direction);

    let upCandidate = null;
    try{
      const ellipsoid = viewer && viewer.scene && viewer.scene.globe && viewer.scene.globe.ellipsoid;
      if(ellipsoid) upCandidate = ellipsoid.geodeticSurfaceNormal(safePosition, new Cesium.Cartesian3());
    }catch(_){ upCandidate = null; }
    if(!Cesium.defined(upCandidate)){
      try{ upCandidate = Cesium.Cartesian3.normalize(safePosition, new Cesium.Cartesian3()); }catch(_){ upCandidate = null; }
    }
    if(!Cesium.defined(upCandidate) || Cesium.Cartesian3.magnitude(upCandidate) < 0.001){
      upCandidate = Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    }

    let right = Cesium.Cartesian3.cross(direction, upCandidate, new Cesium.Cartesian3());
    if(Cesium.Cartesian3.magnitude(right) < 0.001){
      upCandidate = Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Y, new Cesium.Cartesian3());
      right = Cesium.Cartesian3.cross(direction, upCandidate, new Cesium.Cartesian3());
    }
    if(Cesium.Cartesian3.magnitude(right) < 0.001){
      upCandidate = Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
      right = Cesium.Cartesian3.cross(direction, upCandidate, new Cesium.Cartesian3());
    }
    if(Cesium.Cartesian3.magnitude(right) < 0.001) return null;

    Cesium.Cartesian3.normalize(right, right);
    const up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(up, up);
    return { direction: direction, up: up };
  }
  function updateCinematicFocusMarker(){
    if(!cinematicFocusTarget){
      if(cinematicFocusMarkerEntity){ try{ viewer.entities.remove(cinematicFocusMarkerEntity); }catch(_){ } cinematicFocusMarkerEntity = null; }
      return;
    }
    if(!cinematicFocusMarkerEntity){
      cinematicFocusMarkerEntity = viewer.entities.add({
        position: cinematicFocusTarget,
        properties: { hvCinematicFocusTarget: true },
        point: { pixelSize: 12, color: Cesium.Color.fromCssColorString('#ffb300'), outlineColor: Cesium.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: 'Focus Target', font: 'bold 13px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#ff8f00').withAlpha(0.92), verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY }
      });
    }else{
      cinematicFocusMarkerEntity.position = cinematicFocusTarget;
      cinematicFocusMarkerEntity.show = true;
    }
    requestSceneRenderBurst(2);
  }
  function getWorldPositionFromScreen(screenPos){
    const scene = viewer.scene;
    let world = null;
    try{
      if(scene.pickPositionSupported){ world = scene.pickPosition(screenPos); }
    }catch(_){ world = null; }
    if(Cesium.defined(world)) return world;
    try{
      const ray = viewer.camera.getPickRay(screenPos);
      if(ray && scene.globe) world = scene.globe.pick(ray, scene);
    }catch(_){ world = null; }
    if(Cesium.defined(world)) return world;
    try{ world = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe && viewer.scene.globe.ellipsoid); }catch(_){ world = null; }
    return Cesium.defined(world) ? world : null;
  }
  function handleCinematicFocusPlacement(screenPos){
    if(!cinematicFocusPickPending) return false;
    cinematicFocusPickPending = false;
    const world = getWorldPositionFromScreen(screenPos);
    if(!world){
      if(cinFocusStatus) cinFocusStatus.textContent = 'Could not place focus target. Try clicking directly on a visible surface.';
      updateCinematicStatus();
      return true;
    }
    cinematicFocusTarget = Cesium.Cartesian3.clone(world);
    if(cinRotationModeSelect) cinRotationModeSelect.value = 'focus';
    updateCinematicFocusMarker();
    updateCinematicStatus();
    return true;
  }
  function shortestAngleLerp(a, b, t){
    let delta = (b - a) % (Math.PI * 2);
    if(delta > Math.PI) delta -= Math.PI * 2;
    if(delta < -Math.PI) delta += Math.PI * 2;
    return a + delta * t;
  }
  function easeInOutCubic(t){
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function updateCinematicStatus(){
    if(cinFocusStatus) cinFocusStatus.textContent = cinematicFocusTarget ? 'Focus target set.' : (cinematicFocusPickPending ? 'Click the scene to place focus target...' : 'Focus target not set.');
    if(!cinStatus) return;
    if(cinematicIsPlaying){ cinStatus.textContent = 'Playing cinematic camera move...'; return; }
    const s = cinematicStartCamera ? 'Start set' : 'Start not set';
    const e = cinematicEndCamera ? 'End set' : 'End not set';
    const f = cinematicFocusTarget ? 'Focus set' : 'Focus not set';
    cinStatus.textContent = s + ' • ' + e + ' • ' + f;
  }
  function setCinematicInputsEnabled(enabled){
    [cinSetStartBtn, cinSetEndBtn, cinSetFocusBtn, cinClearFocusBtn, cinDurationInput, cinRotationModeSelect, cinOrbitCenterSelect, cinOrbitDirectionSelect, cinOrbitPlayBtn, cinHideUiToggle, cinPlayBtn].forEach(function(el){ if(el) el.disabled = !enabled; });
    if(cinStopBtn) cinStopBtn.disabled = !!enabled;
  }
  function hideCinematicChrome(){
    if(!cinHideUiToggle || !cinHideUiToggle.checked || presentationModeActive) return;
    const miniRoot = getMiniRoot ? getMiniRoot() : document.getElementById('miniTopRight');
    const compassRoot = getCompassRoot ? getCompassRoot() : document.getElementById('compass');
    cinematicSavedChromeState = {
      chartDisplay: chartDiv.style.display,
      gfxBtnDisplay: gfxBtn.style.display,
      gfxCardDisplay: gfxCard.style.display,
      cinBtnDisplay: cinematicToolBtn ? cinematicToolBtn.style.display : null,
      cinCardDisplay: cinematicCard ? cinematicCard.style.display : null,
      miniDisplay: miniRoot ? miniRoot.style.display : null,
      compassDisplay: compassRoot ? compassRoot.style.display : null
    };
    try{ gfxCard.style.display = 'none'; }catch(_){ }
    try{ chartDiv.style.display = 'none'; }catch(_){ }
    try{ gfxBtn.style.display = 'none'; }catch(_){ }
    try{ if(cinematicToolBtn) cinematicToolBtn.style.display = 'none'; }catch(_){ }
      try{ descriptionEditorBtn.style.display = 'none'; labelsEditorBtn.style.display = 'none'; markerEditorBtn.style.display = 'none'; closeAdminEditorPanels(); }catch(_){ }
    try{ if(cinematicCard) cinematicCard.style.display = 'none'; }catch(_){ }
    if(miniRoot) miniRoot.style.display = 'none';
    if(compassRoot) compassRoot.style.display = 'none';
    try{
      cinematicSavedEntityVisuals = [];
      viewer.entities.values.forEach(function(ent){
        const rec = { ent: ent };
        let used = false;
        if(ent.label){ rec.labelShow = ent.label.show; ent.label.show = false; used = true; }
        if(ent.point && ent.properties && ent.properties.hvInteriorEntry){ rec.pointShow = ent.point.show; ent.point.show = false; used = true; }
        if(ent.properties && ent.properties.hvCinematicFocusTarget){ rec.entityShow = ent.show; ent.show = false; used = true; }
        if(used) cinematicSavedEntityVisuals.push(rec);
      });
    }catch(_){ cinematicSavedEntityVisuals = null; }
  }
  function restoreCinematicChrome(){
    if(!cinematicSavedChromeState || presentationModeActive) return;
    const st = cinematicSavedChromeState;
    const miniRoot = getMiniRoot ? getMiniRoot() : document.getElementById('miniTopRight');
    const compassRoot = getCompassRoot ? getCompassRoot() : document.getElementById('compass');
    try{ chartDiv.style.display = st.chartDisplay || 'flex'; setElementSoftHidden(chartDiv, false); }catch(_){ }
    try{ gfxBtn.style.display = st.gfxBtnDisplay || 'flex'; setElementSoftHidden(gfxBtn, false); }catch(_){ }
    try{ gfxCard.style.display = st.gfxCardDisplay || 'none'; }catch(_){ }
    try{ if(cinematicToolBtn){ cinematicToolBtn.style.display = st.cinBtnDisplay || (isEditorAdmin() ? 'flex' : 'none'); setElementSoftHidden(cinematicToolBtn, false); } }catch(_){ }
    try{ if(cinematicCard) cinematicCard.style.display = st.cinCardDisplay || 'none'; }catch(_){ }
    if(miniRoot){ miniRoot.style.display = (!IS_MOBILE && minimapEnabledByUser) ? (st.miniDisplay || 'block') : 'none'; setElementSoftHidden(miniRoot, false); }
    if(compassRoot){ compassRoot.style.display = st.compassDisplay || 'flex'; setElementSoftHidden(compassRoot, false); }
    try{
      if(cinematicSavedEntityVisuals){
        cinematicSavedEntityVisuals.forEach(function(rec){
          if(!rec || !rec.ent) return;
          if(rec.ent.label && Object.prototype.hasOwnProperty.call(rec, 'labelShow')) rec.ent.label.show = rec.labelShow;
          if(rec.ent.point && Object.prototype.hasOwnProperty.call(rec, 'pointShow')) rec.ent.point.show = rec.pointShow;
          if(Object.prototype.hasOwnProperty.call(rec, 'entityShow')) rec.ent.show = rec.entityShow;
        });
      }
    }catch(_){ }
    cinematicSavedEntityVisuals = null;
    cinematicSavedChromeState = null;
    uiAutoHidden = false;
    markUiActive();
  }
  function lockCameraInputsForCinematic(){
    const ctrl = viewer.scene && viewer.scene.screenSpaceCameraController;
    if(!ctrl) return;
    cinematicSavedInputState = {
      enableInputs: ctrl.enableInputs,
      enableRotate: ctrl.enableRotate,
      enableTranslate: ctrl.enableTranslate,
      enableTilt: ctrl.enableTilt,
      enableLook: ctrl.enableLook,
      enableZoom: ctrl.enableZoom
    };
    ctrl.enableInputs = false;
    ctrl.enableRotate = false;
    ctrl.enableTranslate = false;
    ctrl.enableTilt = false;
    ctrl.enableLook = false;
    ctrl.enableZoom = false;
    try{ interiorNav.disable(); }catch(_){ }
    try{ setJoystickVisible(false); }catch(_){ }
  }
  function restoreCameraInputsAfterCinematic(){
    const ctrl = viewer.scene && viewer.scene.screenSpaceCameraController;
    if(ctrl && cinematicSavedInputState){
      ctrl.enableInputs = cinematicSavedInputState.enableInputs;
      ctrl.enableRotate = cinematicSavedInputState.enableRotate;
      ctrl.enableTranslate = cinematicSavedInputState.enableTranslate;
      ctrl.enableTilt = cinematicSavedInputState.enableTilt;
      ctrl.enableLook = cinematicSavedInputState.enableLook;
      ctrl.enableZoom = cinematicSavedInputState.enableZoom;
    }
    cinematicSavedInputState = null;
    try{
      // v60: after a cinematic path/orbit completes, make sure stale global flags cannot keep
      // the Building View exterior orbit disabled. If the cinematic panel is still open, setup
      // free-camera mode is restored below; otherwise Building View returns to normal orbit.
      if(!(typeof isCinematicPanelOpen === 'function' && isCinematicPanelOpen())){
        try{ window.__hvCinematicFreeCameraActive = false; window.__hvCinematicPlaying = false; }catch(_){ }
        try{ cinematicSetupFreeCameraActive = false; }catch(_){ }
      }
      if(currentMode === 'interior'){
        setInteriorMouseBindings();
        interiorNav.enable();
        setJoystickVisible(true);
      }else if(currentMode === 'panorama'){
        setPanoramaMouseBindings();
      }else{
        if(isCinematicPanelOpen && isCinematicPanelOpen()){
          setInteriorMouseBindings();
          interiorNav.enable();
          setJoystickVisible(true);
          cinematicSetupFreeCameraActive = true;
          try{ window.__hvCinematicFreeCameraActive = true; }catch(_){ }
        }else{
          setExteriorMouseBindings();
          interiorNav.disable();
          setJoystickVisible(false);
        }
      }
    }catch(_){ }
  }
  async function getCinematicOrbitCenter(){
    const centerMode = String((cinOrbitCenterSelect && cinOrbitCenterSelect.value) || 'building');
    if(centerMode === 'focus'){
      if(!cinematicFocusTarget) return null;
      return Cesium.Cartesian3.clone(cinematicFocusTarget, new Cesium.Cartesian3());
    }
    try{
      const idx = Number(selectBox && selectBox.value || 0);
      const row = buildingsData[idx] || null;
      if(!row) return null;
      const lon = toNum(row.lng), lat = toNum(row.lat);
      const height = toNum(row.height) || 20;
      if(!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      const center = await getBuildingSurfacePosition(lon, lat, height);
      return Cesium.Cartesian3.clone(center, new Cesium.Cartesian3());
    }catch(_){ return null; }
  }

  async function playCinematicOrbit(){
    if(cinematicIsPlaying) return;
    if(!isEditorAdmin()){
      cinStatus.textContent = 'Editor login required.';
      return;
    }
    const center = await getCinematicOrbitCenter();
    if(!center){
      cinStatus.textContent = 'Orbit needs a valid center. Select Building or set a Focus Target first.';
      return;
    }
    const duration = Math.max(2, Math.min(60, Number(cinDurationInput.value || 8))) * 1000;
    const clockwise = String((cinOrbitDirectionSelect && cinOrbitDirectionSelect.value) || 'cw') === 'cw';
    const angleTotal = (clockwise ? -1 : 1) * Math.PI * 2;
    const startCamera = captureCameraState();
    const startPosition = Cesium.Cartesian3.clone(startCamera.position, new Cesium.Cartesian3());

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
    const localStart = Cesium.Matrix4.multiplyByPoint(invEnu, startPosition, new Cesium.Cartesian3());
    let radius = Math.hypot(localStart.x, localStart.y);
    if(!Number.isFinite(radius) || radius < 0.5){
      cinStatus.textContent = 'Move the camera away from the orbit center, then try again.';
      return;
    }
    const startAngle = Math.atan2(localStart.y, localStart.x);
    const localZ = Number.isFinite(localStart.z) ? localStart.z : 0;

    cinematicIsPlaying = true;
    try{ window.__hvCinematicPlaying = true; }catch(_){ }
    cinematicStopRequested = false;
    setCinematicInputsEnabled(false);
    updateCinematicStatus();
    hideCinematicChrome();
    cinematicSetupFreeCameraActive = false;
    lockCameraInputsForCinematic();

    const startTime = performance.now();
    const localPos = new Cesium.Cartesian3();
    const worldPos = new Cesium.Cartesian3();

    await new Promise(function(resolve){
      function frame(now){
        if(cinematicStopRequested){ resolve(); return; }
        const rawT = Math.min(1, (now - startTime) / duration);
        const t = easeInOutCubic(rawT);
        const a = startAngle + angleTotal * t;
        localPos.x = Math.cos(a) * radius;
        localPos.y = Math.sin(a) * radius;
        localPos.z = localZ;
        Cesium.Matrix4.multiplyByPoint(enu, localPos, worldPos);
        const look = makeCameraDirectionUpLookAt(worldPos, center);
        try{
          if(look){
            viewer.camera.setView({
              destination: Cesium.Cartesian3.clone(worldPos, new Cesium.Cartesian3()),
              orientation: { direction: look.direction, up: look.up }
            });
          }
          requestSceneRender();
        }catch(e){ console.warn('Cinematic orbit frame failed:', e); }
        if(rawT < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });

    cinematicIsPlaying = false;
    try{ window.__hvCinematicPlaying = false; }catch(_){ }
    cinematicStopRequested = false;
    restoreCameraInputsAfterCinematic();
    restoreCinematicChrome();
    setCinematicInputsEnabled(true);
    updateCinematicStatus();
    requestSceneRenderBurst(2);
  }

  async function playCinematicPath(){
    if(cinematicIsPlaying) return;
    if(!isEditorAdmin()){
      cinStatus.textContent = 'Editor login required.';
      return;
    }
    if(!cinematicStartCamera || !cinematicEndCamera){
      cinStatus.textContent = 'Please set both Start and End camera positions first.';
      return;
    }
    const duration = Math.max(2, Math.min(60, Number(cinDurationInput.value || 8))) * 1000;
    const rotationMode = String(cinRotationModeSelect.value || 'smooth');
    if(rotationMode === 'focus' && !cinematicFocusTarget){
      cinStatus.textContent = 'Focus mode needs a focus target. Press Set Focus Target and click the scene first.';
      return;
    }
    cinematicIsPlaying = true;
    try{ window.__hvCinematicPlaying = true; }catch(_){ }
    cinematicStopRequested = false;
    setCinematicInputsEnabled(false);
    updateCinematicStatus();
    hideCinematicChrome();
    cinematicSetupFreeCameraActive = false;
    lockCameraInputsForCinematic();

    const startTime = performance.now();
    const start = cinematicStartCamera;
    const end = cinematicEndCamera;
    const tmpPos = new Cesium.Cartesian3();

    await new Promise(function(resolve){
      function frame(now){
        if(cinematicStopRequested){ resolve(); return; }
        const rawT = Math.min(1, (now - startTime) / duration);
        const t = easeInOutCubic(rawT);
        Cesium.Cartesian3.lerp(start.position, end.position, t, tmpPos);
        let heading = start.heading;
        let pitch = start.pitch;
        let roll = start.roll;
        let focusLook = null;
        if(rotationMode === 'focus'){
          focusLook = makeCameraDirectionUpLookAt(tmpPos, cinematicFocusTarget);
        }else if(rotationMode !== 'locked'){
          heading = shortestAngleLerp(start.heading, end.heading, t);
          pitch = Cesium.Math.lerp(start.pitch, end.pitch, t);
          roll = shortestAngleLerp(start.roll, end.roll, t);
        }
        try{
          if(rotationMode === 'focus' && focusLook){
            // Unity-style camera stand behavior: destination moves on the path, camera direction looks at target.
            viewer.camera.setView({
              destination: Cesium.Cartesian3.clone(tmpPos, new Cesium.Cartesian3()),
              orientation: { direction: focusLook.direction, up: focusLook.up }
            });
          }else{
            viewer.camera.setView({
              destination: tmpPos,
              orientation: { heading: heading, pitch: pitch, roll: roll }
            });
          }
          requestSceneRender();
        }catch(e){ console.warn('Cinematic camera frame failed:', e); }
        if(rawT < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });

    cinematicIsPlaying = false;
    try{ window.__hvCinematicPlaying = false; }catch(_){ }
    cinematicStopRequested = false;
    restoreCameraInputsAfterCinematic();
    restoreCinematicChrome();
    setCinematicInputsEnabled(true);
    updateCinematicStatus();
    requestSceneRenderBurst(2);
  }
  cinSetStartBtn.addEventListener('click', function(){
    cinematicStartCamera = captureCameraState();
    updateCinematicStatus();
  });
  cinSetEndBtn.addEventListener('click', function(){
    cinematicEndCamera = captureCameraState();
    updateCinematicStatus();
  });
  cinSetFocusBtn.addEventListener('click', function(){
    cinematicFocusPickPending = true;
    updateCinematicStatus();
  });
  cinClearFocusBtn.addEventListener('click', function(){
    cinematicFocusPickPending = false;
    cinematicFocusTarget = null;
    updateCinematicFocusMarker();
    if(cinRotationModeSelect && cinRotationModeSelect.value === 'focus') cinRotationModeSelect.value = 'smooth';
    updateCinematicStatus();
  });
  cinPlayBtn.addEventListener('click', playCinematicPath);
  if(cinOrbitPlayBtn) cinOrbitPlayBtn.addEventListener('click', playCinematicOrbit);
  cinStopBtn.addEventListener('click', function(){
    cinematicStopRequested = true;
  });
  setCinematicInputsEnabled(true);
  updateCinematicStatus();

  function deg2rad(d){ return d * Math.PI / 180; }
  function applyFixedInteriorFov(){
    const fr = viewer.camera.frustum;
    if(fr && 'fov' in fr) fr.fov = deg2rad(DEFAULT_INTERIOR_FOV_DEG);
  }
  gfxBtn.addEventListener('click', ()=>{
    gfxCard.style.display = (gfxCard.style.display === 'none' || !gfxCard.style.display) ? 'block' : 'none';
    try{ if(cinematicCard) cinematicCard.style.display = 'none'; }catch(_){ }
    markUiActive();
  });
  showJoystickToggle.addEventListener('change', function(){
    cameraJoystickEnabledByUser = !!showJoystickToggle.checked;
    setJoystickVisible(currentMode === 'interior');
  });
  showMinimapToggle.addEventListener('change', function(){
    minimapEnabledByUser = IS_MOBILE ? false : !!showMinimapToggle.checked;
    if(IS_MOBILE) showMinimapToggle.checked = false;
    try{
      const miniRoot = document.getElementById('miniTopRight');
      if(typeof mini !== 'undefined' && mini) { if(!IS_MOBILE && minimapEnabledByUser) mini.show(); else mini.hide(); }
      if(miniRoot) miniRoot.style.display = (!IS_MOBILE && minimapEnabledByUser) ? 'block' : 'none';
    }catch(_){ }
  });


  const presentationExitBtn = document.createElement('button');
  presentationExitBtn.type = 'button';
  presentationExitBtn.className = 'ui-btn hv-chrome-anim';
  presentationExitBtn.textContent = 'Exit Presentation';
  presentationExitBtn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2600;border-radius:999px;padding:10px 14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.18);display:none;cursor:pointer';
  document.body.appendChild(presentationExitBtn);

  function setElementSoftHidden(el, hidden){
    if(!el) return;
    try{ el.classList.add('hv-chrome-anim'); }catch(_){ }
    if(hidden){
      el.style.opacity = '0';
      el.style.transform = 'translateY(4px)';
      el.style.pointerEvents = 'none';
    }else{
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      el.style.pointerEvents = 'auto';
    }
  }
  function getMiniRoot(){ return document.getElementById('miniTopRight'); }
  function getCompassRoot(){ return document.getElementById('compass'); }

  function applyPresentationMode(active){
    presentationModeActive = !!active;
    if(presentationModeActive){
      presentationSavedState = {
        collapsed: collapsed,
        minimap: minimapEnabledByUser,
        labels: !!(showLabelsToggle && showLabelsToggle.checked)
      };
      try{ gfxCard.style.display = 'none'; }catch(_){ }
      try{ if(cinematicCard) cinematicCard.style.display = 'none'; }catch(_){ }
      try{ setCollapsed(true); }catch(_){ }
      chartDiv.style.display = 'none';
      gfxBtn.style.display = 'none';
      try{ if(cinematicToolBtn) cinematicToolBtn.style.display = 'none'; }catch(_){ }
      if(showLabelsToggle){ showLabelsToggle.checked = false; if(typeof renderSelectionLabels === 'function') renderSelectionLabels(); }
      setJoystickVisible(false);
      try{ if(typeof mini !== 'undefined' && mini) mini.hide(); }catch(_){ }
      const miniRoot = getMiniRoot(); if(miniRoot) miniRoot.style.display = 'none';
      const compassRoot = getCompassRoot(); if(compassRoot) compassRoot.style.display = 'none';
      presentationExitBtn.style.display = 'block';
    }else{
      const saved = presentationSavedState || {};
      chartDiv.style.display = 'flex';
      gfxBtn.style.display = 'flex';
      try{ if(cinematicToolBtn && isEditorAdmin()) cinematicToolBtn.style.display = 'flex'; updateAdminEditorButtonsVisibility(); }catch(_){ }
      if(showLabelsToggle){ showLabelsToggle.checked = !!saved.labels; renderSelectionLabels(); }
      if(saved.minimap !== undefined){
        minimapEnabledByUser = !!saved.minimap;
        showMinimapToggle.checked = !IS_MOBILE && minimapEnabledByUser;
      }
      setJoystickVisible(currentMode === 'interior');
      try{ if(typeof mini !== 'undefined' && mini) { if(!IS_MOBILE && minimapEnabledByUser) mini.show(); else mini.hide(); } }catch(_){ }
      const compassRoot = getCompassRoot(); if(compassRoot) compassRoot.style.display = 'flex';
      presentationExitBtn.style.display = 'none';
      if(saved.collapsed !== undefined) setCollapsed(!!saved.collapsed);
      presentationSavedState = null;
      markUiActive();
    }
    presentationModeBtn.textContent = presentationModeActive ? 'Presentation Mode: On' : 'Presentation Mode';
    requestSceneRenderBurst(2);
  }
  presentationModeBtn.addEventListener('click', function(){ applyPresentationMode(true); });
  presentationExitBtn.addEventListener('click', function(){ applyPresentationMode(false); });

  let uiAutoHideTimer = null;
  function setUiAutoHidden(hidden){
    if(presentationModeActive) return;
    // HomeView v56: app UI should never auto-hide. Only presentation mode may hide UI.
    uiAutoHidden = false;
    if((gfxCard.style.display && gfxCard.style.display !== 'none') || (typeof cinematicCard !== 'undefined' && cinematicCard.style.display && cinematicCard.style.display !== 'none')) return;
    setElementSoftHidden(chartDiv, uiAutoHidden);
    setElementSoftHidden(gfxBtn, uiAutoHidden);
    if(typeof cinematicToolBtn !== 'undefined' && cinematicToolBtn.style.display !== 'none') setElementSoftHidden(cinematicToolBtn, uiAutoHidden);
    const miniRoot = getMiniRoot();
    if(miniRoot && !IS_MOBILE && minimapEnabledByUser) setElementSoftHidden(miniRoot, uiAutoHidden);
    const compassRoot = getCompassRoot();
    if(compassRoot) setElementSoftHidden(compassRoot, uiAutoHidden);
  }
  function markUiActive(){
    // HomeView v56: auto-hide UI is completely removed.
    // Keep this function as a compatibility no-op because many UI actions call markUiActive().
    try{
      if(uiAutoHideTimer){ clearTimeout(uiAutoHideTimer); uiAutoHideTimer = null; }
      setUiAutoHidden(false);
    }catch(_){ }
  }
  markUiActive();

  function updateEditorAuthUI(){
    const auth = getEditorAuthState();
    const unlocked = !!auth;
    openEditorAuthBtn.textContent = unlocked ? 'Editor unlocked' : 'Enter editor';
    editorAuthStatus.textContent = unlocked ? ('Editor mode is unlocked for ' + auth.username + '.') : 'Editor mode is locked.';
    editorLogoutBtn.style.display = unlocked ? 'inline-flex' : 'none';
    openAnalyticsBtn.style.display = unlocked ? 'inline-flex' : 'none';
    if(typeof cinematicToolBtn !== 'undefined') cinematicToolBtn.style.display = unlocked ? 'flex' : 'none';
    if(typeof cinematicCard !== 'undefined' && !unlocked) cinematicCard.style.display = 'none';
    if(!unlocked){
      editorPasswordInput.value = '';
    }
    try{
      if(typeof syncLabelToolsVisibility === 'function') syncLabelToolsVisibility();
      if(typeof refreshLabelListUI === 'function') refreshLabelListUI();
      if(typeof renderActiveLabels === 'function') renderActiveLabels();
    }catch(_){ }
  }
  openEditorAuthBtn.addEventListener('click', ()=>{
    editorAuthPanel.style.display = (editorAuthPanel.style.display === 'none' || !editorAuthPanel.style.display) ? 'flex' : 'none';
    if(editorAuthPanel.style.display === 'flex' && !isEditorAdmin()){
      setTimeout(()=>{ try{ editorUsernameInput.focus(); }catch(_){ } }, 0);
    }
  });
  editorLoginBtn.addEventListener('click', async ()=>{
    const u = String(editorUsernameInput.value || '').trim();
    const p = String(editorPasswordInput.value || '');
    if(!u || !p){
      editorAuthStatus.textContent = 'Enter username and password.';
      return;
    }
    editorLoginBtn.disabled = true;
    editorAuthStatus.textContent = 'Checking access...';
    try{
      const result = await fetchAppJson('verify_admin_login', {
        editor_username: u,
        editor_password: p
      });
      if(result && result.ok){
        setEditorAdminAuth(u, p);
        editorPasswordInput.value = '';
        editorAuthStatus.textContent = 'Login successful. Editor mode is now unlocked.';
        updateEditorAuthUI();
      }else{
        clearEditorAdminAuth();
        editorAuthStatus.textContent = (result && result.error) ? result.error : 'Incorrect username or password.';
      }
    }catch(err){
      clearEditorAdminAuth();
      editorAuthStatus.textContent = 'Login failed: ' + String(err && err.message ? err.message : err);
    }finally{
      editorLoginBtn.disabled = false;
    }
  });
  editorLogoutBtn.addEventListener('click', ()=>{
    clearEditorAdminAuth();
    editorPasswordInput.value = '';
    editorAuthStatus.textContent = 'You have been logged out from editor mode.';
    updateEditorAuthUI();
  });
  updateEditorAuthUI();


  const analyticsOverlay = document.createElement('div');
  analyticsOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.38);display:none;align-items:center;justify-content:center;z-index:2300;padding:20px;';
  const analyticsModal = document.createElement('div');
  analyticsModal.className = 'ui-card';
  analyticsModal.style.cssText = 'width:min(1100px,96vw);max-height:88vh;overflow:auto;border-radius:18px;padding:16px;box-shadow:0 18px 44px rgba(0,0,0,.25);';
  analyticsModal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:20px;font-weight:700">HomeView Analytics</div>
        <div style="font-size:12px;color:#666">Building performance and AI advisor insights</div>
      </div>
      <button id="analyticsCloseBtn" class="ui-btn" style="border-radius:10px;padding:8px 12px;cursor:pointer">Close</button>
    </div>
    <div id="analyticsStatus" style="font-size:12px;color:#666;margin-bottom:12px;">Loading analytics…</div>
    <div id="analyticsCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px"></div>
    <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:14px;align-items:start;">
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0;">
        <div class="ui-card" style="padding:12px;border-radius:14px;">
          <div style="font-weight:700;margin-bottom:8px">Activity Over Time</div>
          <div style="height:220px"><canvas id="analyticsSessionsChart"></canvas></div>
        </div>
        <div class="ui-card" style="padding:12px;border-radius:14px;">
          <div style="font-weight:700;margin-bottom:8px">Top AI Topics</div>
          <div style="height:240px"><canvas id="analyticsTopicsChart"></canvas></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0;">
        <div class="ui-card" style="padding:12px;border-radius:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="font-weight:700">Most Viewed Buildings</div>
            <button id="analyticsShowAllBuildingsBtn" class="ui-btn" style="border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer">Show all</button>
          </div>
          <div id="analyticsBuildingsList" style="display:flex;flex-direction:column;gap:8px"></div>
          <div id="analyticsBuildingsAll" style="display:none;flex-direction:column;gap:8px;margin-top:10px"></div>
        </div>
        <div class="ui-card" style="padding:12px;border-radius:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="font-weight:700">Most Viewed Units</div>
            <button id="analyticsShowAllUnitsBtn" class="ui-btn" style="border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer">Show all</button>
          </div>
          <div id="analyticsUnitsList" style="display:flex;flex-direction:column;gap:8px"></div>
          <div id="analyticsUnitsAll" style="display:none;flex-direction:column;gap:8px;margin-top:10px"></div>
        </div>
        <div class="ui-card" style="padding:12px;border-radius:14px;">
          <div style="font-weight:700;margin-bottom:8px">AI Insights</div>
          <div id="analyticsInsightsList" style="display:flex;flex-direction:column;gap:10px"></div>
          <div id="analyticsAiBreakdown" style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px"></div>
        </div>
      </div>
    </div>`;
  analyticsOverlay.appendChild(analyticsModal);
  document.body.appendChild(analyticsOverlay);
  const analyticsCloseBtn = analyticsModal.querySelector('#analyticsCloseBtn');
  const analyticsStatus = analyticsModal.querySelector('#analyticsStatus');
  const analyticsCards = analyticsModal.querySelector('#analyticsCards');
  const analyticsBuildingsList = analyticsModal.querySelector('#analyticsBuildingsList');
  const analyticsBuildingsAll = analyticsModal.querySelector('#analyticsBuildingsAll');
  const analyticsShowAllBuildingsBtn = analyticsModal.querySelector('#analyticsShowAllBuildingsBtn');
  const analyticsUnitsList = analyticsModal.querySelector('#analyticsUnitsList');
  const analyticsUnitsAll = analyticsModal.querySelector('#analyticsUnitsAll');
  const analyticsShowAllUnitsBtn = analyticsModal.querySelector('#analyticsShowAllUnitsBtn');
  const analyticsInsightsList = analyticsModal.querySelector('#analyticsInsightsList');
  const analyticsAiBreakdown = analyticsModal.querySelector('#analyticsAiBreakdown');
  const analyticsSessionsChart = analyticsModal.querySelector('#analyticsSessionsChart');
  const analyticsTopicsChart = analyticsModal.querySelector('#analyticsTopicsChart');
  let analyticsSessionsChartRef = null;
  let analyticsTopicsChartRef = null;
  function closeAnalyticsModal(){ analyticsOverlay.style.display = 'none'; }
  analyticsCloseBtn.addEventListener('click', closeAnalyticsModal);
  analyticsOverlay.addEventListener('click', function(evt){ if(evt.target === analyticsOverlay) closeAnalyticsModal(); });
  function csvList(v){ return String(v || '').split(',').map(function(item){ return String(item || '').trim(); }).filter(Boolean); }
  function makeMetricCard(label, value){
    const card = document.createElement('div');
    card.className = 'ui-card';
    card.style.cssText = 'padding:12px;border-radius:14px;';
    card.innerHTML = '<div style="font-size:12px;color:#666;margin-bottom:4px">' + label + '</div><div style="font-size:22px;font-weight:700">' + value + '</div>';
    return card;
  }
  function makeRankRow(name, value){
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:#f8f8f8;font-size:13px';
    row.innerHTML = '<div style="min-width:0;word-break:break-word">' + name + '</div><div style="font-weight:700;margin-left:8px">' + value + '</div>';
    return row;
  }

  function makeBulletCard(title, entries){
    const card = document.createElement('div');
    card.className = 'ui-card';
    card.style.cssText = 'padding:10px;border-radius:12px;';
    const safeEntries = (entries || []).filter(Boolean);
    card.innerHTML = '<div style="font-weight:700;margin-bottom:8px">' + title + '</div>';
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    if(!safeEntries.length){
      body.appendChild(makeRankRow('No data yet', '—'));
    }else{
      safeEntries.forEach(function(item){
        body.appendChild(makeRankRow(item[0], item[1]));
      });
    }
    card.appendChild(body);
    return card;
  }
  function setToggleButtonState(btn, expanded){
    btn.textContent = expanded ? 'Show less' : 'Show all';
  }
  function aggregateCounts(rows, keyGetter){
    const map = new Map();
    (rows || []).forEach(function(row){
      const items = keyGetter(row) || [];
      items.forEach(function(item){
        const clean = String(item || '').trim();
        if(!clean) return;
        map.set(clean, (map.get(clean) || 0) + 1);
      });
    });
    return Array.from(map.entries()).sort(function(a,b){ return b[1]-a[1]; });
  }
  function renderAnalyticsDashboard(data){
    const buildings = (data && data.buildings) || (latestPublicData && latestPublicData.buildings) || [];
    const interiors = (data && data.interiors) || (latestPublicData && latestPublicData.interiors) || [];
    const views = (data && data.views) || [];
    const aiRows = (data && data.ai_analytics) || [];
    analyticsCards.innerHTML = '';
    const totalViews = views.reduce(function(sum,row){ return sum + (parseInt(String(row.views || 0),10) || 0); }, 0);
    const totalAiConversations = aiRows.reduce(function(sum,row){ return sum + (parseInt(String(row.total_ai_conversations || 0),10) || 0); }, 0);
    const totalAiMinutes = aiRows.reduce(function(sum,row){ return sum + (parseFloat(String(row.total_ai_minutes || 0)) || 0); }, 0);
    const totalSessions = aiRows.reduce(function(sum,row){ return sum + (parseInt(String(row.total_sessions || 0),10) || 0); }, 0);
    [
      ['Buildings', (data && data.building_count) || buildings.length || 0],
      ['Units', (data && data.unit_count) || interiors.filter(function(item){ return isUnitRow(item); }).length || 0],
      ['Unit Views', totalViews.toLocaleString()],
      ['AI Sessions', totalSessions.toLocaleString()],
      ['AI Conversations', totalAiConversations.toLocaleString()],
      ['AI Minutes', totalAiMinutes.toLocaleString()]
    ].forEach(function(item){ analyticsCards.appendChild(makeMetricCard(item[0], item[1])); });

    const buildingAgg = new Map();
    const unitAgg = [];
    views.forEach(function(row){
      const buildingKey = firstFilled(row.building_key, row.name, 'Unknown');
      const unitName = firstFilled(row.unit_name, row.title, 'Unknown');
      const count = parseInt(String(row.views || 0), 10) || 0;
      buildingAgg.set(buildingKey, (buildingAgg.get(buildingKey) || 0) + count);
      unitAgg.push({ name: buildingKey + ' / ' + unitName, views: count });
    });
    analyticsBuildingsList.innerHTML = '';
    analyticsBuildingsAll.innerHTML = '';
    analyticsBuildingsAll.style.display = 'none';
    setToggleButtonState(analyticsShowAllBuildingsBtn, false);
    const buildingsAll = Array.from(buildingAgg.entries()).sort(function(a,b){ return b[1]-a[1]; });
    const buildingsTop = buildingsAll.slice(0,5);
    if(!buildingsTop.length){ analyticsBuildingsList.appendChild(makeRankRow('No building view data yet', '—')); }
    else buildingsTop.forEach(function(item){ analyticsBuildingsList.appendChild(makeRankRow(item[0], item[1])); });
    if(buildingsAll.length > 5){
      buildingsAll.forEach(function(item){ analyticsBuildingsAll.appendChild(makeRankRow(item[0], item[1])); });
      analyticsShowAllBuildingsBtn.style.display = 'inline-flex';
    } else {
      analyticsShowAllBuildingsBtn.style.display = 'none';
    }

    analyticsUnitsList.innerHTML = '';
    analyticsUnitsAll.innerHTML = '';
    analyticsUnitsAll.style.display = 'none';
    setToggleButtonState(analyticsShowAllUnitsBtn, false);
    const unitsAll = unitAgg.sort(function(a,b){ return b.views-a.views; });
    const unitsTop = unitsAll.slice(0,5);
    if(!unitsTop.length){ analyticsUnitsList.appendChild(makeRankRow('No unit view data yet', '—')); }
    else unitsTop.forEach(function(item){ analyticsUnitsList.appendChild(makeRankRow(item.name, item.views)); });
    if(unitsAll.length > 5){
      unitsAll.forEach(function(item){ analyticsUnitsAll.appendChild(makeRankRow(item.name, item.views)); });
      analyticsShowAllUnitsBtn.style.display = 'inline-flex';
    } else {
      analyticsShowAllUnitsBtn.style.display = 'none';
    }

    analyticsInsightsList.innerHTML = '';
    analyticsAiBreakdown.innerHTML = '';
    if(!aiRows.length){
      analyticsInsightsList.appendChild(makeRankRow('No AI analytics data yet', '—'));
    } else {
      const latest = aiRows.slice().sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); })[0] || {};
      const questionCounts = aggregateCounts(aiRows, function(row){ return csvList(row.top_questions); }).slice(0,5);
      const concernCounts = aggregateCounts(aiRows, function(row){ return csvList(row.top_concerns); }).slice(0,5);
      const interestCounts = aggregateCounts(aiRows, function(row){ return csvList(row.top_interests); }).slice(0,5);
      const intentCounts = aggregateCounts(aiRows, function(row){ return csvList(row.buyer_intent); }).slice(0,5);
      [
        ['Latest insight', firstFilled(latest.insight, 'No insight added yet')],
        ['Latest trend', firstFilled(latest.trend, 'No trend added yet')],
        ['Buyer intent', firstFilled(latest.buyer_intent, 'Unknown')],
        ['Top concern', csvList(latest.top_concerns).join(', ') || '—'],
        ['Top interest', csvList(latest.top_interests).join(', ') || '—']
      ].forEach(function(item){ analyticsInsightsList.appendChild(makeRankRow(item[0], item[1])); });
      analyticsAiBreakdown.appendChild(makeBulletCard('Top 5 Questions', questionCounts));
      analyticsAiBreakdown.appendChild(makeBulletCard('Top 5 Concerns', concernCounts));
      analyticsAiBreakdown.appendChild(makeBulletCard('Top 5 Interests', interestCounts));
      analyticsAiBreakdown.appendChild(makeBulletCard('Buyer Intent Breakdown', intentCounts));
    }

    try{ if(analyticsSessionsChartRef) analyticsSessionsChartRef.destroy(); }catch(_){ }
    try{ if(analyticsTopicsChartRef) analyticsTopicsChartRef.destroy(); }catch(_){ }
    const chartLabels = aiRows.map(function(row){ return row.date || ''; });
    analyticsSessionsChartRef = new Chart(analyticsSessionsChart.getContext('2d'), {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          { label:'Sessions', data: aiRows.map(function(row){ return parseInt(String(row.total_sessions || 0),10) || 0; }), tension:0.3 },
          { label:'AI Minutes', data: aiRows.map(function(row){ return parseFloat(String(row.total_ai_minutes || 0)) || 0; }), tension:0.3 }
        ]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true}}, scales:{y:{beginAtZero:true}} }
    });
    const topicCounts = aggregateCounts(aiRows, function(row){ return csvList(row.top_questions).concat(csvList(row.top_concerns), csvList(row.top_interests)); }).slice(0,6);
    analyticsTopicsChartRef = new Chart(analyticsTopicsChart.getContext('2d'), {
      type: 'bar',
      data: { labels: topicCounts.map(function(item){ return item[0]; }), datasets: [{ label:'Mentions', data: topicCounts.map(function(item){ return item[1]; }) }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
    });
    analyticsStatus.textContent = 'Analytics updated from secure admin data.';
  }
  analyticsShowAllBuildingsBtn.addEventListener('click', function(){
    const expanded = analyticsBuildingsAll.style.display !== 'none';
    analyticsBuildingsAll.style.display = expanded ? 'none' : 'flex';
    setToggleButtonState(analyticsShowAllBuildingsBtn, !expanded);
  });
  analyticsShowAllUnitsBtn.addEventListener('click', function(){
    const expanded = analyticsUnitsAll.style.display !== 'none';
    analyticsUnitsAll.style.display = expanded ? 'none' : 'flex';
    setToggleButtonState(analyticsShowAllUnitsBtn, !expanded);
  });
  openAnalyticsBtn.addEventListener('click', async function(){
    analyticsOverlay.style.display = 'flex';
    analyticsStatus.textContent = 'Loading analytics…';
    analyticsCards.innerHTML = '';
    analyticsBuildingsList.innerHTML = '';
    analyticsBuildingsAll.innerHTML = '';
    analyticsUnitsList.innerHTML = '';
    analyticsUnitsAll.innerHTML = '';
    analyticsInsightsList.innerHTML = '';
    analyticsAiBreakdown.innerHTML = '';
    analyticsBuildingsAll.style.display = 'none';
    analyticsUnitsAll.style.display = 'none';
    setToggleButtonState(analyticsShowAllBuildingsBtn, false);
    setToggleButtonState(analyticsShowAllUnitsBtn, false);
    try{
      const dashboard = await fetchAdminJson('get_admin_dashboard');
      if(!dashboard || !dashboard.ok) throw new Error((dashboard && dashboard.error) || 'Unable to load analytics');
      renderAnalyticsDashboard(dashboard);
    }catch(err){
      analyticsStatus.textContent = 'Analytics load failed: ' + String(err && err.message ? err.message : err);
    }
  });

  try{ presetSelect.value = IS_MOBILE ? 'low' : 'balanced'; }catch(_){ }

  function applyGfxPreset(preset){
    try { viewer.useBrowserRecommendedResolution = false; } catch(e){}
    const fxaaStage = viewer.scene?.postProcessStages?.fxaa;
    const DPR = window.devicePixelRatio || 1;
    if (preset === 'low'){ viewer.resolutionScale = 0.75; if (fxaaStage) fxaaStage.enabled = true; if ('msaaSamples' in viewer.scene) viewer.scene.msaaSamples = 1; desiredMSE=16; if(GOOGLE_3D_TILES) GOOGLE_3D_TILES.maximumScreenSpaceError=desiredMSE;
    } else if (preset === 'high'){ viewer.resolutionScale = Math.min(1.25, DPR); if (fxaaStage) fxaaStage.enabled = true; if ('msaaSamples' in viewer.scene) viewer.scene.msaaSamples = 4; desiredMSE=8;  if(GOOGLE_3D_TILES) GOOGLE_3D_TILES.maximumScreenSpaceError=desiredMSE;
    } else { viewer.resolutionScale = 1.0; if (fxaaStage) fxaaStage.enabled = true; if ('msaaSamples' in viewer.scene) viewer.scene.msaaSamples = 2; desiredMSE=12; if(GOOGLE_3D_TILES) GOOGLE_3D_TILES.maximumScreenSpaceError=desiredMSE; }
  }
  let initialPreset = IS_MOBILE ? 'low' : 'balanced';
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  try{ if (conn?.saveData) initialPreset = 'low'; else if (conn?.effectiveType && /(^|-)2g|(^|-)slow-2g|(^|-)3g/.test(conn.effectiveType)) initialPreset = 'low'; }catch(e){}
  applyGfxPreset(initialPreset);
  presetSelect.value = initialPreset;
  presetSelect.addEventListener('change', ()=> applyGfxPreset(presetSelect.value));

  // ===== Dynamic project source (single sheet_id + single Apps Script URL) =====
  const DEFAULT_SPREADSHEET_ID = "1ub-9XgxyuuLZPqO83hNjP3Gzm-uKMki_VtGrHeJiABI";
  const DEFAULT_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzZ2EJkpM5ufjauz4RZV8oWPpU-7Nz4O-ghvGQk_Bft3uy6wzy_u3_WIWqA4AgIrjA3mg/exec";
  const APP_SCRIPT_SECRET = "homeview123";

  function safeSessionGet(key){
    try{ return sessionStorage.getItem(key) || ''; }catch(_){ return ''; }
  }
  function safeSessionSet(key, value){
    try{ if(value) sessionStorage.setItem(key, value); }catch(_){ }
  }
  function getQueryParam(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      for(let i=0;i<arguments.length;i++){
        const value = String(params.get(arguments[i]) || '').trim();
        if(value) return value;
      }
    }catch(_){ }
    return '';
  }
  function resolveSpreadsheetId(){
    let value = getQueryParam('sheet','sheet_id') || String(DEFAULT_SPREADSHEET_ID || '').trim() || safeSessionGet('homeview.sheet_id');
    if(!value){
      try{ value = String(window.prompt('Enter Google Spreadsheet ID for this HomeView project:', '') || '').trim(); }catch(_){ value=''; }
    }
    if(!value) throw new Error('Missing Spreadsheet ID. Add ?sheet=YOUR_SPREADSHEET_ID or set DEFAULT_SPREADSHEET_ID.');
    safeSessionSet('homeview.sheet_id', value);
    return value;
  }
  function resolveAppScriptUrl(){
    let value = getQueryParam('api','api_url','app_script','appscript') || String(DEFAULT_APP_SCRIPT_URL || '').trim() || safeSessionGet('homeview.app_script_url');
    if(!value){
      try{ value = String(window.prompt('Enter Apps Script Web App URL for HomeView:', '') || '').trim(); }catch(_){ value=''; }
    }
    if(!value) throw new Error('Missing Apps Script URL. Add ?api=YOUR_WEB_APP_URL or set DEFAULT_APP_SCRIPT_URL.');
    safeSessionSet('homeview.app_script_url', value);
    return value;
  }

  const ACTIVE_SPREADSHEET_ID = resolveSpreadsheetId();
  const APP_SCRIPT_URL = resolveAppScriptUrl();
  const UNIT_VIEWS_API_URL = APP_SCRIPT_URL;
  const UNIT_VIEWS_URL = "";

  async function fetchAppJson(action, extra){
    const response = await fetch(APP_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({
        secret: APP_SCRIPT_SECRET,
        action: action,
        sheet_id: ACTIVE_SPREADSHEET_ID
      }, extra || {}))
    });
    const raw = await response.text();
    try{
      return JSON.parse(raw);
    }catch(_){
      throw new Error(raw || ('Invalid API response for action: ' + action));
    }
  }

  let buildingsData = [];
  let latestPublicData = null;

  // ===== Load & Build =====
  setLaunchLoadingText('Loading project data...');
  fetchAppJson('get_all_data').then(async (allData)=>{
    if(!allData || !allData.ok) throw new Error((allData && allData.error) || 'Unable to load project data from Apps Script');
    setLaunchLoadingText('Building the 3D scene...');
    const b = (allData.buildings || []).map(canonicalizeRow).filter(r=>r.model_url && r.lat && r.lng && (r.estimated_price || r.estimated_price_first));
    buildingsData = b;
    const p = (allData.pois || []).map(canonicalizeRow).filter(r=>r.name && r.lat && r.lng && r.type);
    const inter = (allData.interiors || []).map(canonicalizeRow).filter(r=>(r.unit_name || r.name || r.title) && (r.building_key || r.parent || r.name));
    const viewRows = (allData.views || []).map(canonicalizeRow);
    latestPublicData = { buildings: b, interiors: inter, pois: p, views: viewRows };

    function toViewCount(v){
      const n = parseInt(String(v == null ? '' : v).replace(/[^0-9-]/g,''), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    function makeUnitViewRowKey(buildingKey, unitName){
      return normKey(buildingKey) + '||' + String(unitName || '').trim();
    }
    function makeUnitViewApiPayload(action, extra){
      const body = Object.assign({
        secret: APP_SCRIPT_SECRET,
        action: action,
        sheet_id: ACTIVE_SPREADSHEET_ID
      }, extra || {});
      return {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      };
    }

    const unitViewsState = {
      rowsByKey: new Map(),
      lastTrackedKey: '',
      loadPromise: null
    };

    function upsertUnitViewRow(buildingKey, unitName, views){
      const cleanBuildingKey = String(buildingKey || '').trim();
      const cleanUnitName = String(unitName || '').trim();
      if(!cleanBuildingKey || !cleanUnitName) return null;
      const rowKey = makeUnitViewRowKey(cleanBuildingKey, cleanUnitName);
      const existing = unitViewsState.rowsByKey.get(rowKey);
      const row = {
        building_key: cleanBuildingKey,
        unit_name: cleanUnitName,
        views: Math.max(0, Number.isFinite(Number(views)) ? Number(views) : 0)
      };
      unitViewsState.rowsByKey.set(rowKey, Object.assign({}, existing || {}, row));
      return unitViewsState.rowsByKey.get(rowKey);
    }

    function seedUnitViewsFromInteriors(){
      inter.forEach(function(item){
        if(!isUnitRow(item)) return;
        const buildingKey = firstFilled(item.building_key, item.parent, item.name);
        const unitName = getItemDisplayName(item);
        upsertUnitViewRow(buildingKey, unitName, 0);
      });
    }

    function mergeUnitViewsRows(rows){
      (rows || []).forEach(function(item){
        if(!item) return;
        const buildingKey = firstFilled(item.building_key, item.parent);
        const unitName = firstFilled(item.unit_name, item.name, item.title);
        if(!buildingKey || !unitName) return;
        upsertUnitViewRow(buildingKey, unitName, toViewCount(item.views));
      });
    }

    async function fetchUnitViewsSnapshot(force){
      if(!UNIT_VIEWS_API_URL) return;
      if(unitViewsState.loadPromise && !force) return unitViewsState.loadPromise;
      unitViewsState.loadPromise = (async function(){
        try{
          const result = await fetchAppJson('get_all_data');
          if(result && result.ok && Array.isArray(result.views)) mergeUnitViewsRows((result.views || []).map(canonicalizeRow));
        }catch(err){
          console.warn('Unit views API load failed:', err);
        }
      })();
      try{
        await unitViewsState.loadPromise;
      }finally{
        unitViewsState.loadPromise = null;
      }
    }

    function getBuildingUnitViews(buildingKey){
      const target = normKey(buildingKey);
      const rows = [];
      unitViewsState.rowsByKey.forEach(function(item){
        if(normKey(item && item.building_key) !== target) return;
        rows.push({
          building_key: item.building_key,
          unit_name: item.unit_name,
          views: toViewCount(item.views)
        });
      });
      rows.sort(function(a,b){
        if((b.views||0) !== (a.views||0)) return (b.views||0) - (a.views||0);
        return String(a.unit_name || '').localeCompare(String(b.unit_name || ''));
      });
      return rows;
    }

    function renderAdminBuildingViews(buildingKey){
      adminBuildingViewsCard.style.display = 'none';
      adminBuildingViewsSummary.textContent = '';
      adminBuildingViewsList.innerHTML = '';
      return;
    }


    async function refreshBuildingUnitViews(buildingKey, opts){
      const options = opts || {};
      const cleanBuildingKey = String(buildingKey || '').trim();
      if(!cleanBuildingKey) return;
      if(UNIT_VIEWS_API_URL){
        try{
          const response = await fetch(UNIT_VIEWS_API_URL, makeUnitViewApiPayload('get_building_views', {
            building_key: cleanBuildingKey
          }));
          const raw = await response.text();
          let parsed = null;
          try{ parsed = JSON.parse(raw); }catch(_){ parsed = null; }
          if(parsed && parsed.ok && Array.isArray(parsed.units)){
            mergeUnitViewsRows(parsed.units);
          }
        }catch(err){
          console.warn('Building unit views refresh failed:', err);
        }
      }else if(options.forceCsv !== false){
        await fetchUnitViewsSnapshot(!!options.force);
      }
      renderAdminBuildingViews(cleanBuildingKey);
    }

    async function trackUnitView(buildingKey, unitName){
      const cleanBuildingKey = String(buildingKey || '').trim();
      const cleanUnitName = String(unitName || '').trim();
      if(!cleanBuildingKey || !cleanUnitName) return;
      const rowKey = makeUnitViewRowKey(cleanBuildingKey, cleanUnitName);
      if(unitViewsState.lastTrackedKey === rowKey) return;
      unitViewsState.lastTrackedKey = rowKey;

      const row = upsertUnitViewRow(cleanBuildingKey, cleanUnitName, 0);
      row.views = toViewCount(row.views) + 1;
      unitViewsState.rowsByKey.set(rowKey, row);

      if(viewSelect && viewSelect.value === 'exterior') renderAdminBuildingViews(cleanBuildingKey);

      if(!UNIT_VIEWS_API_URL) return;
      try{
        const response = await fetch(UNIT_VIEWS_API_URL, makeUnitViewApiPayload('increment_unit_view', {
          building_key: cleanBuildingKey,
          unit_name: cleanUnitName
        }));
        const raw = await response.text();
        let parsed = null;
        try{ parsed = JSON.parse(raw); }catch(_){ parsed = null; }
        if(parsed && parsed.ok && Number.isFinite(Number(parsed.views))){
          row.views = Math.max(row.views, Number(parsed.views));
          unitViewsState.rowsByKey.set(rowKey, row);
        }
      }catch(err){
        console.warn('Unit view increment failed:', err);
      }
    }

    seedUnitViewsFromInteriors();
    mergeUnitViewsRows(viewRows);
    await fetchUnitViewsSnapshot(false);

    // selectors
    b.forEach((row,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=row.name||('Model #'+(i+1)); selectBox.appendChild(o); });

    // entities
    const modelEntities=[];
    const interiorEntryEntities=[];
    for (let i=0;i<b.length;i++){
      const row = b[i];
      const ent = await createBuildingModel(row,viewer);
      ent.show=(i===0);
      modelEntities.push(ent);
      const entryEnt = await createInteriorEntryButton(row, viewer, i);
      entryEnt.show = false;
      interiorEntryEntities.push(entryEnt);
    }

    function getDirectInteriorViewValue(idx){
      const list = hvGetMarkerEditorTargetsForBuilding(idx);
      const unitIndexes = [];
      const fallbackIndexes = [];
      list.forEach(function(item, itemIdx){
        if(isUnitRow(item)) unitIndexes.push(itemIdx);
        else if(isPanoramaRow(item) || isAmenityRow(item)) fallbackIndexes.push(itemIdx);
      });
      if(unitIndexes.length === 1) return 'unit:' + unitIndexes[0];
      if(unitIndexes.length > 1) return '__multi__';
      if(fallbackIndexes.length === 1){
        const onlyIdx = fallbackIndexes[0];
        const onlyItem = list[onlyIdx] || null;
        return isPanoramaRow(onlyItem) ? ('panorama:' + onlyIdx) : ('amenity:' + onlyIdx);
      }
      if(fallbackIndexes.length > 1) return '__multi__';
      return '';
    }
    function setInteriorEntryButtonsVisibility(activeIdx, isExterior){
      interiorEntryEntities.forEach(function(ent, i){
        if(!ent) return;
        ent.show = !!isExterior && i === activeIdx && !!getDirectInteriorViewValue(i);
      });
      requestSceneRenderBurst(2);
    }
    function flashViewPicker(){
      const oldShadow = viewSelect.style.boxShadow;
      const oldBorder = viewSelect.style.borderColor;
      viewSelect.style.borderColor = '#1976d2';
      viewSelect.style.boxShadow = '0 0 0 3px rgba(25,118,210,.22)';
      setTimeout(function(){
        viewSelect.style.boxShadow = oldShadow;
        viewSelect.style.borderColor = oldBorder;
      }, 1200);
    }
    async function handleInteriorEntryClick(buildingIdx){
      const targetValue = getDirectInteriorViewValue(buildingIdx);
      if(!targetValue) return false;
      if(targetValue === '__multi__'){
        setCollapsed(false);
        try{ viewSelect.focus({ preventScroll:true }); }catch(_){ try{ viewSelect.focus(); }catch(__){} }
        flashViewPicker();
        title.textContent = (b[buildingIdx] && (b[buildingIdx].name || '')) || title.textContent;
        descBox.style.display = 'block';
        descBox.textContent = 'Select a unit from the list above to enter the interior.';
        return true;
      }
      viewSelect.value = targetValue;
      viewSelect.dispatchEvent(new Event('change'));
      return true;
    }

    for (let i=0;i<b.length;i++) futureProjectEntitiesByBuilding[i] = [];

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
    let hiddenPoiTypes = new Set();
    let futureProjectsChipBtn = null;
    const poiTypesByBuilding = [];
    const hasFutureProjectsByBuilding = [];

    function hasFutureProjectsForBuilding(row){
      const raw = firstFilled(row && row.future_projects, row && row.futureprojects);
      return parseFutureProjects(raw).length > 0;
    }
    function getPoiEntityType(ent){
      try{
        const p = ent && ent.properties;
        const raw = p && p.type && p.type.getValue ? p.type.getValue() : (p && p.type ? p.type : '');
        return String(raw || '').toLowerCase().trim();
      }catch(_){
        return '';
      }
    }
    function stylePoiChip(btn, hidden, type){
      const st = getAmenityStyle(type || (btn && btn.dataset && btn.dataset.poiType) || '');
      btn.style.opacity = hidden ? "0.55" : "1";
      btn.style.textDecoration = hidden ? "line-through" : "none";
      btn.style.borderColor = st.color;
      btn.style.background = hidden ? "#fff" : st.color;
      btn.style.color = hidden ? st.color : "#fff";
    }
    function syncFutureProjectsChip(){
      if(showFutureProjectsToggle) showFutureProjectsToggle.checked = !!(futureProjectsChipBtn && futureProjectsChipBtn.dataset.enabled === '1');
      if(!futureProjectsChipBtn) return;
      stylePoiChip(futureProjectsChipBtn, futureProjectsChipBtn.dataset.enabled !== '1', 'future projects');
    }
    function applyPoiTypeFilters(idx){
      const activeIdx = Number.isFinite(Number(idx)) ? Number(idx) : Number(selectBox && selectBox.value || 0);
      const isExterior = !!(viewSelect && viewSelect.value === 'exterior');
      poiSources.forEach((ds,i)=>{
        const baseShow = isExterior && i===activeIdx;
        ds.entities.values.forEach(ent=>{
          const type = getPoiEntityType(ent);
          const allowed = !hiddenPoiTypes.has(type);
          ent.show = !!(baseShow && allowed);
        });
      });
      requestSceneRender();
    }
    function rebuildChipsForBuilding(idx){
      filterRow.innerHTML = '';
      const types = Array.from(poiTypesByBuilding[idx] || []).sort();

      if(hasFutureProjectsByBuilding[idx]){
        futureProjectsChipBtn = document.createElement('button');
        futureProjectsChipBtn.className='ui-btn hv-filter-chip';
        futureProjectsChipBtn.textContent=getAmenityIcon('future projects') + ' ' + getAmenityDisplayLabel('future projects');
        futureProjectsChipBtn.dataset.poiType = 'future projects';
        futureProjectsChipBtn.dataset.enabled = (showFutureProjectsToggle && showFutureProjectsToggle.checked) ? '1' : '0';
        futureProjectsChipBtn.style.cssText="padding:6px 10px;border-radius:999px;cursor:pointer;font-size:12px";
        futureProjectsChipBtn.onclick = async ()=>{
          const enabled = futureProjectsChipBtn.dataset.enabled === '1';
          futureProjectsChipBtn.dataset.enabled = enabled ? '0' : '1';
          if(showFutureProjectsToggle) showFutureProjectsToggle.checked = !enabled;
          syncFutureProjectsChip();
          if(enabled){
            clearAllFutureProjectEntities();
          }else{
            await refreshFutureProjects(Number(selectBox.value || 0));
          }
        };
        filterRow.appendChild(futureProjectsChipBtn);
        syncFutureProjectsChip();
      } else {
        futureProjectsChipBtn = null;
        if(showFutureProjectsToggle) showFutureProjectsToggle.checked = false;
        clearAllFutureProjectEntities();
      }

      if(types.length===0){
        if(!hasFutureProjectsByBuilding[idx]){
          const d=document.createElement('div');
          d.style.cssText="font-size:12px;opacity:.7";
          d.textContent='No POI types';
          filterRow.appendChild(d);
        }
        return;
      }

      types.forEach(tn=>{
        const btn=document.createElement('button');
        const st = getAmenityStyle(tn);
        btn.className='ui-btn hv-filter-chip';
        btn.dataset.poiType = tn;
        btn.textContent=st.icon + ' ' + st.label;
        btn.style.cssText="padding:6px 10px;border-radius:999px;cursor:pointer;font-size:12px";
        stylePoiChip(btn, hiddenPoiTypes.has(tn), tn);
        btn.onclick=()=>{
          if(hiddenPoiTypes.has(tn)) hiddenPoiTypes.delete(tn);
          else hiddenPoiTypes.add(tn);
          stylePoiChip(btn, hiddenPoiTypes.has(tn), tn);
          applyPoiTypeFilters(Number(selectBox.value));
          mini.refreshCity(Number(selectBox.value));
          updateCommute(Number(selectBox.value));
        };
        filterRow.appendChild(btn);
      });
    }

    // POI sources
    const poiSources=[]; const poiIndexById=new Map(); const pinBuilder=new Cesium.PinBuilder();
    const POI_LABEL_HEIGHT_M = IS_MOBILE ? 34 : 42;
    const POI_LEADER_LINE_WIDTH = 1.0;
    const POI_GROUND_DOT_SIZE = IS_MOBILE ? 7 : 9;
    function colorForType(type){ return Cesium.Color.fromCssColorString(getAmenityStyle(type).color); }
    function poiBillboard(type,icon){ const col=colorForType(type); const txt = (icon || getAmenityIcon(type) || '').trim(); const img = txt ? pinBuilder.fromText(txt,col,42).toDataURL() : pinBuilder.fromColor(col,32).toDataURL(); return { image:img, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, scale:1, disableDepthTestDistance:Number.POSITIVE_INFINITY }; }
    function metersBetween(a,b){ const g=new Cesium.EllipsoidGeodesic(a,b); return g.surfaceDistance; }
    function getPoiRadiusMeters(buildingRow, poiRow, fallback){
      const poiRadius = toNum(firstFilled(
        poiRow && poiRow.radius,
        poiRow && poiRow.radius_m,
        poiRow && poiRow.poi_radius,
        poiRow && poiRow.max_distance,
        poiRow && poiRow.distance_m
      ));
      if(Number.isFinite(poiRadius) && poiRadius > 0) return poiRadius;
      const buildingRadius = toNum(firstFilled(
        buildingRow && buildingRow.radius_m,
        buildingRow && buildingRow.poi_radius,
        buildingRow && buildingRow.radius
      ));
      if(Number.isFinite(buildingRadius) && buildingRadius > 0) return buildingRadius;
      return Number.isFinite(fallback) && fallback > 0 ? fallback : 800;
    }

    function formatPoiTravelLine(distMeters){
      const SPEED_WALK = 4.5/3.6, SPEED_DRIVE = 35/3.6;
      function prettyMin(m){ if(!Number.isFinite(m)) return '—'; if(m < 1) return '<1m'; if(m < 60) return Math.round(m) + 'm'; const h = Math.floor(m/60), mm = Math.round(m%60); return h + 'h ' + (mm ? mm + 'm' : ''); }
      const walk = prettyMin(distMeters / (SPEED_WALK * 60));
      const drive = prettyMin(distMeters / (SPEED_DRIVE * 60));
      return 'walk ' + walk + ' • drive ' + drive;
    }

    function shortenPoiLine(text, maxLen){
      const s = String(text || '').replace(/\s+/g, ' ').trim();
      const limit = Number(maxLen) || 28;
      if(s.length <= limit) return s;
      return s.slice(0, Math.max(0, limit - 1)).trim() + '…';
    }

    function cleanPoiNameForLabel(rawName, rawType){
      let name = String(rawName || '').replace(/\s+/g, ' ').trim();
      if(!name) return '';

      const typeLabel = getAmenityDisplayLabel(rawType);
      const typeRx = new RegExp('^' + String(typeLabel || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\s*[:\-–—]?\s*', 'i');
      name = name.replace(typeRx, '').trim();

      // Transit stop names often arrive as directions or street-crossing addresses.
      // These are noisy in the 3D label, so keep the category and travel time only.
      const lower = name.toLowerCase();
      const hasStreetToken = /\b(rd|road|st|street|ave|avenue|hwy|highway|blvd|boulevard|dr|drive|way|overpass|cres|lane|ln|pl|place|w\s*\d+|e\s*\d+|n\s*\d+|s\s*\d+)\b/i.test(name);
      const looksLikeTransitAddress = /\s@\s/.test(name) || /^(inbound|outbound|northbound|southbound|eastbound|westbound)\b/i.test(name);
      const looksLikeCivicAddress = /\d+\s+[^,]+\b(rd|road|st|street|ave|avenue|hwy|highway|blvd|boulevard|dr|drive|way)\b/i.test(name);
      if((looksLikeTransitAddress && hasStreetToken) || looksLikeCivicAddress) return '';

      if(lower === String(typeLabel || '').toLowerCase()) return '';
      return shortenPoiLine(name, 30);
    }

    function getPoiLabelLines(poi, type, distMeters){
      const st = getAmenityStyle(type);
      const cleanName = cleanPoiNameForLabel(poi && poi.name, type);
      const lines = [{ text: st.label, role: 'type' }];
      if(cleanName) lines.push({ text: cleanName, role: 'name' });
      lines.push({ text: formatPoiTravelLine(distMeters), role: 'travel' });
      return lines;
    }

    function makePoiLabelBillboardImage(poi, type, distMeters){
      const st = getAmenityStyle(type);
      const color = st.color || '#455a64';
      const bg = st.bg || '#edf2f4';
      const icon = (st.icon || '').trim();
      const lines = getPoiLabelLines(poi, type, distMeters);

      const scale = Math.max(2, Math.min(3, Math.round(window.devicePixelRatio || 2)));
      const measure = document.createElement('canvas');
      const mctx = measure.getContext('2d');
      mctx.font = '700 14px system-ui, -apple-system, Segoe UI, Arial, sans-serif';

      const maxTextWidth = 210;
      const wrapped = [];
      function pushWrapped(line){
        const text = String(line.text || '').replace(/\s+/g, ' ').trim();
        if(!text) return;
        const words = text.split(' ');
        let cur = '';
        words.forEach(function(w){
          const trial = cur ? (cur + ' ' + w) : w;
          if(mctx.measureText(trial).width > maxTextWidth && cur){
            wrapped.push({ text: cur, role: line.role });
            cur = w;
          }else{
            cur = trial;
          }
        });
        if(cur) wrapped.push({ text: cur, role: line.role });
      }
      lines.forEach(pushWrapped);

      const padX = 12, padY = 8, radius = 10;
      const iconSize = icon ? 16 : 0;
      const gap = icon ? 6 : 0;
      const lineH = 17;
      let textW = 0;
      wrapped.forEach(function(l){ textW = Math.max(textW, mctx.measureText(l.text).width); });
      const w = Math.ceil(Math.min(260, Math.max(112, padX*2 + iconSize + gap + textW)));
      const h = Math.ceil(padY*2 + wrapped.length * lineH);

      const c = document.createElement('canvas');
      c.width = Math.ceil(w * scale);
      c.height = Math.ceil(h * scale);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.clearRect(0,0,w,h);

      ctx.shadowColor = 'rgba(0,0,0,.18)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = bg;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(w-radius, 0);
      ctx.quadraticCurveTo(w, 0, w, radius);
      ctx.lineTo(w, h-radius);
      ctx.quadraticCurveTo(w, h, w-radius, h);
      ctx.lineTo(radius, h);
      ctx.quadraticCurveTo(0, h, 0, h-radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.stroke();

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const contentW = w - padX*2;
      const textX = padX + iconSize + gap + (contentW - iconSize - gap) / 2;
      let y = padY + lineH/2;
      if(icon){
        ctx.font = '700 14px system-ui, -apple-system, Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(icon, padX + iconSize/2, padY + lineH/2);
      }
      wrapped.forEach(function(l, idx){
        ctx.font = (l.role === 'type' || l.role === 'name') ? '700 13px system-ui, -apple-system, Segoe UI, Arial, sans-serif' : '600 12px system-ui, -apple-system, Segoe UI, Arial, sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(l.text, textX, y);
        y += lineH;
      });

      return { image: c.toDataURL('image/png'), width: w, height: h, pixelRatio: scale };
    }

    b.forEach((br,i)=>{
      const ds=new Cesium.CustomDataSource('pois-'+i);
      ds.clustering=new Cesium.EntityCluster({enabled:true,pixelRange:40,minimumClusterSize:3});
      poiSources[i]=ds; viewer.dataSources.add(ds);

      const key=normKey(br.name); const listKey=poisByKey.get(key)||[];
      const defaultRadius=getPoiRadiusMeters(br, null, 800); const cLat=toNum(br.lat), cLng=toNum(br.lng);
      const center=Cesium.Cartographic.fromDegrees(cLng,cLat);
      const candidates = listKey.length>0 ? listKey : p;
      const types=new Set();
      hasFutureProjectsByBuilding[i] = hasFutureProjectsForBuilding(br);

      candidates.forEach(poi=>{
        const plat=toNum(poi.lat), plng=toNum(poi.lng); if(!Number.isFinite(plat)||!Number.isFinite(plng)) return;
        const poiRadius = getPoiRadiusMeters(br, poi, defaultRadius);
        const dist=metersBetween(center, Cesium.Cartographic.fromDegrees(plng,plat)); if(dist>poiRadius) return;
        const type=(poi.type||'').toLowerCase().trim();
        const poiHeight = toNum(firstFilled(
          poi.height,
          poi.height_m,
          poi.altitude,
          poi.elevation,
          poi.z,
          poi.ground_offset,
          poi.groundOffset
        ));
        // Leader-line POI layout:
        // Keep the amenity card floating above the surface, then draw a vertical
        // anchor line down to the real terrain/3D-tiles surface. This makes dense
        // nearby amenities easier to read and removes the need to manually tune
        // every POI height in the Sheet.
        const groundOffset = Number.isFinite(poiHeight) ? Math.max(8, poiHeight) : POI_LABEL_HEIGHT_M;
        const approxGroundZ = 0.8;
        const approxTopZ = groundOffset;

        const lineEnt = ds.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(plng, plat, approxGroundZ),
              Cesium.Cartesian3.fromDegrees(plng, plat, approxTopZ)
            ],
            width: POI_LEADER_LINE_WIDTH,
            material: Cesium.Color.WHITE.withAlpha(0.88),
            clampToGround: false
          },
          properties: { type, url: poi.url||'', name: poi.name||'', distance_m:Math.round(dist), baseLat:plat, baseLng:plng, groundOffset:groundOffset, hvPoiLeaderLine:true },
          show: i===0
        });

        // v54: Do not draw ground dots under POI leader lines.
        // The vertical line is enough and looks cleaner in both desktop and mobile views.
        const groundEnt = null;

        const ent=ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(plng,plat,groundOffset),
          billboard: (function(){
            const lbl = makePoiLabelBillboardImage(poi, type, dist);
            return {
              image: lbl.image,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              pixelOffset: new Cesium.Cartesian2(0, 0),
              scale: Math.min(0.42, 0.84 / (lbl.pixelRatio || 2)),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            };
          })(),
          properties: { type, url: poi.url||'', name: poi.name||'', distance_m:Math.round(dist), baseLat:plat, baseLng:plng, groundOffset:groundOffset },
          show: i===0
        });
        poiIndexById.set(ent.id,{dsIndex:i});
        poiIndexById.set(lineEnt.id,{dsIndex:i});
        if(groundEnt) poiIndexById.set(groundEnt.id,{dsIndex:i});
        types.add(type||'other');
      });

      poiTypesByBuilding[i] = types;
      if(i===0){ hiddenPoiTypes = new Set(); rebuildChipsForBuilding(0); }
      clampDataSourceToSurface(ds);
    });

    // Interiors / Amenities
    const interiorEntitiesByBuilding=[];
    const interiorMetaByBuilding=[];
    const interiorLoadPromisesByBuilding=[];
    const interiorBlobUrlsByBuilding=[];
    const interiorBlobFetchPromisesByBuilding=[];
    let activeInteriorSelection = null;
    let interiorSwitchToken = 0;
    let mobileViewChangeTimer = null;
    let viewLoadLockCount = 0;

    function setSelectionControlsDisabled(disabled, message){
      const flag = !!disabled;
      selectBox.disabled = flag;
      viewSelect.disabled = flag;
      selectBox.style.opacity = flag ? '0.7' : '1';
      viewSelect.style.opacity = flag ? '0.7' : '1';
      viewLoadStatus.style.display = flag ? 'block' : 'none';
      viewLoadStatus.textContent = message || 'Loading selected model...';
    }

    function beginViewLoad(message){
      viewLoadLockCount += 1;
      setSelectionControlsDisabled(true, message || 'Loading selected model...');
      hvSetMobileModelLoadMode(true);
    }

    function endViewLoad(){
      viewLoadLockCount = Math.max(0, viewLoadLockCount - 1);
      if(viewLoadLockCount === 0){
        setSelectionControlsDisabled(false, '');
        hvSetMobileModelLoadMode(false);
      }
    }

    function safeModelUrl(rawUrl){
      const src = String(rawUrl || '').trim();
      if(!src) return '';
      try{ return encodeURI(src); }catch(_){ return src; }
    }

    async function fetchModelBlobUrl(rawUrl, timeoutMs){
      const url = safeModelUrl(rawUrl);
      if(!url) throw new Error('Missing model URL');
      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      let timer = null;
      if(controller && timeoutMs > 0){
        timer = setTimeout(function(){ try{ controller.abort(); }catch(_){ } }, timeoutMs);
      }
      try{
        const res = await fetch(url, { signal: controller ? controller.signal : undefined, cache: 'default', mode: 'cors' });
        if(!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } finally {
        if(timer) clearTimeout(timer);
      }
    }

    async function ensureInteriorBlobUrl(bIdx, itemIdx, rawUrl){
      if(!isLikelyModelUrl(rawUrl)) throw new Error('Invalid model URL');
      if((interiorBlobUrlsByBuilding[bIdx]||[])[itemIdx]) return interiorBlobUrlsByBuilding[bIdx][itemIdx];
      if((interiorBlobFetchPromisesByBuilding[bIdx]||[])[itemIdx]) return interiorBlobFetchPromisesByBuilding[bIdx][itemIdx];
      const attempts = [45000, 90000];
      const p = (async function(){
        let lastErr = null;
        for(let ai=0; ai<attempts.length; ai++){
          try{
            const blobUrl = await fetchModelBlobUrl(rawUrl, attempts[ai]);
            if(!interiorBlobUrlsByBuilding[bIdx]) interiorBlobUrlsByBuilding[bIdx]=[];
            interiorBlobUrlsByBuilding[bIdx][itemIdx] = blobUrl;
            return blobUrl;
          } catch(err){
            lastErr = err;
            console.warn('Model fetch attempt failed:', err);
          }
        }
        throw lastErr || new Error('Unable to fetch model');
      })().finally(function(){
        if(interiorBlobFetchPromisesByBuilding[bIdx]) interiorBlobFetchPromisesByBuilding[bIdx][itemIdx] = null;
      });
      if(!interiorBlobFetchPromisesByBuilding[bIdx]) interiorBlobFetchPromisesByBuilding[bIdx]=[];
      interiorBlobFetchPromisesByBuilding[bIdx][itemIdx] = p;
      return p;
    }

    for (let i=0;i<b.length;i++){
      const br = b[i];
      const possibleKeys = [br.name, br.building_key, br.key, br.id, br.slug].map(normKey).filter(Boolean);
      const seenRows = new Set();
      const list = [];
      possibleKeys.forEach(function(key){
        (interiorsByKey.get(key) || []).forEach(function(item){
          if(seenRows.has(item)) return;
          seenRows.add(item);
          list.push(item);
        });
      });
      interiorMetaByBuilding[i]=list;
      interiorEntitiesByBuilding[i]=new Array(list.length).fill(null);
      interiorLoadPromisesByBuilding[i]=new Array(list.length).fill(null);
      interiorBlobUrlsByBuilding[i]=new Array(list.length).fill(null);
      interiorBlobFetchPromisesByBuilding[i]=new Array(list.length).fill(null);
    }
    markerTargetItemsByBuilding = interiorMetaByBuilding;
    try{ rebuildViewOptions(Number(selectBox && selectBox.value || 0)); }catch(_){ }
    try{ rebuildMarkerTargetListForCurrentBuilding(); }catch(_){ }

    async function hvTryEnsureInteriorEntityForMarker(bIdx, itemIdx){
      const meta = hvGetMarkerEditorTargetsForBuilding(bIdx)[itemIdx] || null;
      if(!meta || !isLikelyModelUrl(meta.model_url)) return null;
      if((interiorEntitiesByBuilding[bIdx]||[])[itemIdx]) return interiorEntitiesByBuilding[bIdx][itemIdx];
      if((interiorLoadPromisesByBuilding[bIdx]||[])[itemIdx]) return interiorLoadPromisesByBuilding[bIdx][itemIdx];

      const buildingRow = b[bIdx];
      const p = (async function(){
        let lastErr = null;
        for(let attempt=0; attempt<2; attempt++){
          try{
            const blobUrl = await ensureInteriorBlobUrl(bIdx, itemIdx, meta.model_url);
            const finishSelections = customizationSelectionsByKey.get(makeCustomizationSelectionKey(bIdx, itemIdx)) || null;
            let panoramaSelection = panoramaSelectionsByKey.get(makeCustomizationSelectionKey(bIdx, itemIdx)) || null;
            if(isPanoramaRow(meta) && (!panoramaSelection || !panoramaSelection.url)){
              panoramaSelection = getPanoramaConfig(meta, buildingRow).defaultItem || null;
              if(panoramaSelection) panoramaSelectionsByKey.set(makeCustomizationSelectionKey(bIdx, itemIdx), panoramaSelection);
            }
            if(isPanoramaRow(meta) && panoramaSelection && panoramaSelection.url){
              panoramaSelection = hvRuntimePanoramaSelection(panoramaSelection);
              panoramaSelectionsByKey.set(makeCustomizationSelectionKey(bIdx, itemIdx), panoramaSelection);
              await preloadPanoramaSelectionImage(panoramaSelection, { forceReload: true });
            }
            const ent = await createInteriorModel(buildingRow, meta, viewer, blobUrl, finishSelections, panoramaSelection);
            if(!interiorEntitiesByBuilding[bIdx]) interiorEntitiesByBuilding[bIdx]=[];
            interiorEntitiesByBuilding[bIdx][itemIdx] = ent;
            if(ent) ent.show = false;
            requestSceneRenderBurst(8);
            return ent;
          } catch(err){
            lastErr = err;
            console.warn('Interior model load failed:', err);
            destroyInteriorEntity(bIdx, itemIdx, { keepBlobUrl: false, silent: true });
          }
        }
        return null;
      })().finally(function(){
        if(interiorLoadPromisesByBuilding[bIdx]) interiorLoadPromisesByBuilding[bIdx][itemIdx] = null;
        requestSceneRenderBurst(6);
      });

      interiorLoadPromisesByBuilding[bIdx][itemIdx] = p;
      return p;
    }

    function destroyInteriorEntity(bIdx, itemIdx, opts){
      const options = opts || {};
      const arr = interiorEntitiesByBuilding[bIdx] || [];
      const ent = arr[itemIdx] || null;
      if(ent){
        try{ if(ent.anchorEntity) viewer.entities.remove(ent.anchorEntity); }catch(_){ }
        try{ if(ent.modelPrimitive) viewer.scene.primitives.remove(ent.modelPrimitive); }catch(_){ }
        try{ if(ent.destroy) ent.destroy(); }catch(_){ }
      }
      if(arr) arr[itemIdx] = null;
      if(interiorLoadPromisesByBuilding[bIdx]) interiorLoadPromisesByBuilding[bIdx][itemIdx] = null;
      if(!options.keepBlobUrl && interiorBlobUrlsByBuilding[bIdx] && interiorBlobUrlsByBuilding[bIdx][itemIdx]){
        try{ URL.revokeObjectURL(interiorBlobUrlsByBuilding[bIdx][itemIdx]); }catch(_){ }
        interiorBlobUrlsByBuilding[bIdx][itemIdx] = null;
      }
      if(interiorBlobFetchPromisesByBuilding[bIdx]) interiorBlobFetchPromisesByBuilding[bIdx][itemIdx] = null;
      try{ viewer.scene.requestRender(); }catch(_){ }
      try{ if(GOOGLE_3D_TILES && GOOGLE_3D_TILES.trimLoadedTiles) GOOGLE_3D_TILES.trimLoadedTiles(); }catch(_){ }
      if(!options.silent) requestSceneRenderBurst(4);
    }

    activeRoomModelState = { key:'', currentRoomKey:'__base__', currentRoomMeta:null, handle:null, cache:new Map(), token:0, lastBlobUrl:null };

    // Room memory policy:
    // A hidden Cesium model can still keep GPU buffers/textures alive. Keep only one active interior/room
    // model in GPU memory on both desktop and mobile. Mobile pre-destroys before loading to avoid peak
    // Safari/WebGL memory. Desktop destroys the previous/base model after the new room is visible.
    const HV_DESTROY_ROOM_MODELS_ON_SWITCH = true;
    const HV_PRE_DESTROY_ROOM_MODELS_BEFORE_LOAD = IS_MOBILE;
    let activeRoomModelLoading = false;
    const HV_ROOM_LOAD_PROFILING = false;

    function hvRoomPerf(label, startTime){
      try{
        if(!HV_ROOM_LOAD_PROFILING) return;
        const ms = Math.round((performance.now() - startTime) * 10) / 10;
        console.log('[HomeView RoomLoad]', label + ':', ms + 'ms');
      }catch(_){ }
    }

    function hvScheduleDeferredDestroy(label, destroyFn, delayMs){
      const delay = Math.max(0, Number(delayMs) || 250);
      let tries = 0;
      function runDestroyWhenSafe(){
        try{
          // v53: Never run GPU cleanup while another room is inside Model.fromGltfAsync.
          // v51 was fast, but its deferred destroy timer could fire during the next room load
          // if the user clicked quickly, causing random 7s/25s/33s stalls.
          if(activeRoomModelLoading && tries < 40){
            tries += 1;
            setTimeout(runDestroyWhenSafe, 90);
            return;
          }
        }catch(_){ }
        const t0 = performance.now();
        try{ if(typeof destroyFn === 'function') destroyFn(); }
        catch(err){ console.warn('HomeView deferred destroy failed:', label, err); }
        hvRoomPerf('deferred destroy ' + (label || ''), t0);
        try{ requestSceneRenderBurst(1); }catch(_){ }
      }
      setTimeout(runDestroyWhenSafe, delay);
    }

    function hvDestroyModelHandle(handle){
      if(!handle) return;
      try{ handle.show = false; }catch(_){ }
      try{ if(handle.anchorEntity) viewer.entities.remove(handle.anchorEntity); }catch(_){ }
      try{ if(handle.modelPrimitive) viewer.scene.primitives.remove(handle.modelPrimitive); }catch(_){ }
      try{ if(handle.destroy) handle.destroy(); }catch(_){ }
      try{ requestSceneRenderBurst(2); }catch(_){ }
    }

    function hvShowModelHandle(handle, visible){
      if(!handle) return;
      const show = !!visible;
      try{ handle.show = show; }catch(_){ }
      try{ if(handle.anchorEntity) handle.anchorEntity.show = show; }catch(_){ }
      try{ if(handle.modelPrimitive) handle.modelPrimitive.show = show; }catch(_){ }
    }

    function hvReleaseRoomBlobUrl(){
      // v40: Do not revoke room blob URLs during room-to-room navigation.
      // The heavy memory is the active WebGL model/texture buffers, which we destroy separately.
      // Keeping the downloaded Blob URL cached prevents repeated Dropbox/network fetches and
      // stops the 3rd/4th room switch from becoming extremely slow.
      try{ activeRoomModelState.lastBlobUrl = null; }catch(_){ }
    }

    async function hvGetRoomCachedBlobUrl(cacheKey, rawUrl){
      const key = String(cacheKey || rawUrl || '').trim();
      if(!key) return await fetchModelBlobUrl(rawUrl, 180000);
      try{
        const cached = activeRoomModelState.cache.get(key);
        if(cached && cached.blobUrl) return cached.blobUrl;
        if(cached && cached.promise) return await cached.promise;
      }catch(_){}

      const p = fetchModelBlobUrl(rawUrl, 180000).then(function(blobUrl){
        activeRoomModelState.cache.set(key, { blobUrl: blobUrl, url: rawUrl, createdAt: Date.now() });
        return blobUrl;
      }).catch(function(err){
        try{ activeRoomModelState.cache.delete(key); }catch(_){}
        throw err;
      });
      try{ activeRoomModelState.cache.set(key, { promise: p, url: rawUrl, createdAt: Date.now() }); }catch(_){}
      return await p;
    }

    function hvRevokeRoomModelCache(){
      try{
        activeRoomModelState.cache.forEach(function(v){
          try{ if(v && v.blobUrl) URL.revokeObjectURL(v.blobUrl); }catch(_){}
        });
        activeRoomModelState.cache.clear();
      }catch(_){}
    }

    function getActiveRoomContextKey(){
      try{
        if(activeRoomModelState && activeRoomModelState.currentRoomKey){
          return hvSlugifyRoomKey(activeRoomModelState.currentRoomKey);
        }
      }catch(_){}
      return '__base__';
    }
    function normalizeLabelRoomKey(v){
      const raw = String(v || '').trim();
      const s = raw.toLowerCase().replace(/[^a-z0-9]+/g,'');
      if(!s || s === 'base' || s === 'main' || s === 'original' || s === 'default' || s === 'living' || s === 'livingroom' || s === 'livingarea' || s === 'lounge' || raw === '__base__') return '__base__';
      return hvSlugifyRoomKey(raw);
    }
    function labelBelongsToActiveRoom(it){
      const active = normalizeLabelRoomKey(getActiveRoomContextKey());
      const rk = normalizeLabelRoomKey(it && it.roomKey);
      return rk === active;
    }
    function getRoomContextDisplayName(){
      const active = normalizeLabelRoomKey(getActiveRoomContextKey());
      return active === '__base__' ? 'main model' : active.replace(/_/g, ' ');
    }


    function hvBuildBaseRoomCameraRow(meta, buildingRow){
      // Living Room is treated internally as __base__ so labels can return to the original unit model.
      // Without this bridge, the base/living model uses only the unit row camera fields and ignores
      // living|Living Room|...|model_heading|camera_xyz|camera_heading from room_model_items.
      try{
        const baseMeta = Object.assign({}, meta || {});
        const items = parseRoomModelItems(meta, buildingRow) || [];
        let livingRoom = null;
        for(let i=0;i<items.length;i++){
          const it = items[i] || {};
          const k = normalizeLabelRoomKey(it.key || it.label || '');
          if(k === '__base__'){ livingRoom = it; break; }
        }
        if(!livingRoom){
          livingRoom = getRoomModelItem(meta, buildingRow, 'living')
            || getRoomModelItem(meta, buildingRow, 'living_room')
            || getRoomModelItem(meta, buildingRow, 'livingroom')
            || getRoomModelItem(meta, buildingRow, 'main')
            || getRoomModelItem(meta, buildingRow, 'base');
        }
        if(livingRoom){
          if(hasTextValue(livingRoom.camera_xyz)) baseMeta.camera_xyz = livingRoom.camera_xyz;
          else if(hasTextValue(livingRoom.cameraXyz)) baseMeta.camera_xyz = livingRoom.cameraXyz;
          if(hasTextValue(livingRoom.camera_heading)) baseMeta.camera_heading = livingRoom.camera_heading;
          else if(hasTextValue(livingRoom.cameraHeading)) baseMeta.camera_heading = livingRoom.cameraHeading;
          if(hasTextValue(livingRoom.camera_pitch)) baseMeta.camera_pitch = livingRoom.camera_pitch;
          if(hasTextValue(livingRoom.camera_look_distance)) baseMeta.camera_look_distance = livingRoom.camera_look_distance;
          if(hasTextValue(livingRoom.audio_url)) baseMeta.audio_url = livingRoom.audio_url;
          else if(hasTextValue(livingRoom.audioUrl)) baseMeta.audio_url = livingRoom.audioUrl;
          baseMeta.__baseRoomCameraSource = livingRoom.key || livingRoom.label || 'living';
        }
        return baseMeta;
      }catch(_){
        return meta || {};
      }
    }

    function clearActiveRoomModel(options){
      const keepCache = !!(options && options.keepCache);
      activeRoomModelState.token += 1;
      if(activeRoomModelState.handle){
        hvDestroyModelHandle(activeRoomModelState.handle);
      }
      hvReleaseRoomBlobUrl();
      activeRoomModelState.key = '';
      activeRoomModelState.currentRoomKey = '__base__';
      activeRoomModelState.currentRoomMeta = null;
      activeRoomModelState.handle = null;
      try{ renderSelectionLabels(); syncQuickShowLabelsButton(); }catch(_){ }
      if(!keepCache){
        hvRevokeRoomModelCache();
      }
      requestSceneRenderBurst(4);
    }
    
    async function returnToBaseRoomModelForCurrent(){
      try{
        const sel = activeInteriorSelection;
        if(!sel) return false;
        if(activeRoomModelState.handle){
          hvDestroyModelHandle(activeRoomModelState.handle);
        }
        activeRoomModelState.key = '';
        activeRoomModelState.currentRoomKey = '__base__';
        activeRoomModelState.currentRoomMeta = null;
        activeRoomModelState.handle = null;
        hvReleaseRoomBlobUrl();
        let baseHandle = (interiorEntitiesByBuilding[sel.bIdx] || [])[sel.itemIdx] || null;
        if(!baseHandle){
          // The base/living model may have been destroyed to free GPU memory.
          // Re-create it only when the user actually returns to it.
          try{ showSceneTransition('Loading Living Room...'); }catch(_){ }
          beginViewLoad('Loading Living Room...');
          try{
            baseHandle = await hvTryEnsureInteriorEntityForMarker(sel.bIdx, sel.itemIdx);
          }finally{
            endViewLoad();
            try{ hideSceneTransition().catch(function(){}); }catch(_){ }
          }
        }
        hvShowModelHandle(baseHandle, true);
        try{
          const meta = (interiorMetaByBuilding[sel.bIdx] || [])[sel.itemIdx] || {};
          const buildingRow = b[sel.bIdx] || {};
          const baseCameraRow = hvBuildBaseRoomCameraRow(meta, buildingRow);
          try{ activeRoomModelState.currentRoomMeta = baseCameraRow; }catch(_){ }
          await hvFrameActiveInteriorModelCamera(baseHandle, baseCameraRow, buildingRow, { burst:10, maxTries:45, roomKey:'__base__' });
          title.textContent = (buildingRow.name||'') + ' — ' + getItemDisplayName(meta, 'Unit');
          currentMode = 'interior';
          try{ mini.hide(); }catch(_){ }
          setCesiumGroundVisible(true);
          setCameraCollision(false);
          setInteriorMouseBindings();
          interiorNav.enable();
          setJoystickVisible(cameraJoystickEnabledByUser);
        }catch(_){}
        try{ hvEnsureCurrentLabelSelectionForActiveInterior(); renderSelectionLabels(); syncQuickShowLabelsButton(); }catch(_){}
        try{ hvUpdateNarrationAudioForSelection(labelEditorState.currentSelection); }catch(_){}
        requestSceneRenderBurst(8);
        return true;
      }catch(err){
        console.warn('Return to base room failed:', err);
        return false;
      }
    }

async function applyRoomModelForCurrent(actionValue){
      const sel = activeInteriorSelection;
      if(!sel || sel.bIdx == null || sel.itemIdx == null) return false;
      if(activeRoomModelLoading){
        try{ console.warn('HomeView room switch ignored because another room is still loading.'); }catch(_){}
        try{ labelEditorStatus.textContent = 'Please wait — room is still loading.'; }catch(_){ }
        return false;
      }

      const cleanActionValue = String(actionValue || '').split('|')[0].trim();
      const requestedRoomKey = normalizeLabelRoomKey(cleanActionValue);
      try{ console.log('HomeView room action:', actionValue, 'clean:', cleanActionValue, '=>', requestedRoomKey); }catch(_){}

      if(requestedRoomKey === '__base__'){
        return await returnToBaseRoomModelForCurrent();
      }

      const meta = (interiorMetaByBuilding[sel.bIdx] || [])[sel.itemIdx] || null;
      const buildingRow = b[sel.bIdx] || {};
      const room = getRoomModelItem(meta, buildingRow, cleanActionValue);

      if(!room || !room.url){
        console.warn('HomeView room model not found:', cleanActionValue, parseRoomModelItems(meta, buildingRow));
        try{ labelEditorStatus.textContent = 'Room model not found: ' + String(cleanActionValue || actionValue || ''); }catch(_){ }
        return false;
      }

      const token = ++activeRoomModelState.token;
      activeRoomModelLoading = true;
      // v45: show the loading layer without adding an extra artificial wait before model creation.
      try{ showSceneTransition('Loading ' + (room.label || 'room') + '...'); }catch(_){ }
      beginViewLoad('Loading ' + (room.label || 'room') + '...');
      try{
        // v51: do NOT destroy old/base models before the new room is ready.
        // v50 proved that pre-load GPU cleanup can stall Cesium.Model.fromGltfAsync badly.
        // Hide old visuals immediately, load the new room first, then destroy old GPU resources after the new room is visible.
        const baseHandle = (interiorEntitiesByBuilding[sel.bIdx] || [])[sel.itemIdx] || null;
        let baseHandleToDestroy = baseHandle || null;
        const previousRoomHandle = activeRoomModelState.handle || null;
        const previousRoomKeyForDestroy = activeRoomModelState.currentRoomKey || '';

        if(HV_PRE_DESTROY_ROOM_MODELS_BEFORE_LOAD){
          // Mobile/iPhone fix: free GPU memory before creating the next GLB.
          // Hiding is not enough on Safari; the old model can still keep textures/buffers alive.
          if(previousRoomHandle){
            hvDestroyModelHandle(previousRoomHandle);
          }
          if(baseHandle){
            destroyInteriorEntity(sel.bIdx, sel.itemIdx, { keepBlobUrl: true, silent: true });
          }
          baseHandleToDestroy = null;
        }else{
          // Desktop keeps the previous model hidden only until the new room is visible,
          // then deferred cleanup below destroys its GPU buffers/textures.
          if(baseHandle) hvShowModelHandle(baseHandle, false);
          if(previousRoomHandle) hvShowModelHandle(previousRoomHandle, false);
        }

        activeRoomModelState.handle = null;
        hvReleaseRoomBlobUrl();

        // v46: Use Cesium's native URL loading path for room models.
        // The previous room pipeline did: fetch -> Blob -> objectURL -> Model.fromGltfAsync.
        // Testing showed Cesium's own direct URL path is dramatically faster, especially after several room switches.
        const roomModelUrl = safeModelUrl(room.url);
        if(!roomModelUrl) throw new Error('Missing room model URL for ' + (room.key || room.label || cleanActionValue || 'room'));
        if(token !== activeRoomModelState.token){
          return true;
        }

        const roomRow = Object.assign({}, meta || {});
        roomRow.model_url = room.url;
        roomRow.unit_name = room.label || room.key || getItemDisplayName(meta, 'Room');
        roomRow.name = roomRow.unit_name;
        // First heading after URL controls the 3D model rotation.
        if(hasTextValue(room.heading)) roomRow.heading = room.heading;
        else if(hasTextValue(room.modelHeading)) roomRow.heading = room.modelHeading;
        else if(hasTextValue(room.model_heading)) roomRow.heading = room.model_heading;

        // Manual camera pose for this room/model.
        // Format: key|Label|URL|model_heading|camera_x,camera_y,camera_z|camera_heading
        if(hasTextValue(room.camera_xyz)) roomRow.camera_xyz = room.camera_xyz;
        else if(hasTextValue(room.cameraXyz)) roomRow.camera_xyz = room.cameraXyz;
        if(hasTextValue(room.camera_heading)) roomRow.camera_heading = room.camera_heading;
        else if(hasTextValue(room.cameraHeading)) roomRow.camera_heading = room.cameraHeading;
        if(hasTextValue(room.audio_url)) roomRow.audio_url = room.audio_url;
        else if(hasTextValue(room.audioUrl)) roomRow.audio_url = room.audioUrl;

        const createStart = performance.now();
        const handle = await createInteriorModel(buildingRow, roomRow, viewer, roomModelUrl, null, null);
        hvRoomPerf('createInteriorModel ' + (room.label || room.key || cleanActionValue || 'room'), createStart);
        if(token !== activeRoomModelState.token){
          try{ if(handle && handle.anchorEntity) viewer.entities.remove(handle.anchorEntity); }catch(_){}
          try{ if(handle && handle.modelPrimitive) viewer.scene.primitives.remove(handle.modelPrimitive); }catch(_){}
          return true;
        }

        activeRoomModelState.key = sel.bIdx + ':' + sel.itemIdx + ':' + (room.key || cleanActionValue);
        activeRoomModelState.currentRoomKey = hvSlugifyRoomKey(room.key || room.label || cleanActionValue);
        activeRoomModelState.currentRoomMeta = roomRow;
        activeRoomModelState.handle = handle;
        activeRoomModelState.lastBlobUrl = roomModelUrl;

        hvShowModelHandle(handle, true);
        const cameraStart = performance.now();
        await hvFrameActiveInteriorModelCamera(handle, roomRow, meta || buildingRow, { burst:3, roomKey: activeRoomModelState.currentRoomKey });
        hvRoomPerf('manual camera frame ' + (room.label || room.key || cleanActionValue || 'room'), cameraStart);

        // Clean old GPU resources after the new room is visible.
        // Mobile pre-destroys before load, so there is usually nothing left to defer here.
        // Desktop now also cleans up, so Living Room + Bedroom + other rooms do not stay in GPU memory.
        if(HV_DESTROY_ROOM_MODELS_ON_SWITCH && !HV_PRE_DESTROY_ROOM_MODELS_BEFORE_LOAD){
          if(previousRoomHandle){
            hvScheduleDeferredDestroy('previous room', function(){
              if(activeRoomModelState && activeRoomModelState.handle !== previousRoomHandle){
                hvDestroyModelHandle(previousRoomHandle);
              }
            }, 220);
          }
          if(baseHandleToDestroy && activeRoomModelState.currentRoomKey !== '__base__'){
            hvScheduleDeferredDestroy('base interior', function(){
              // Only destroy the base if we are still inside a room. If the user already returned to base, keep it.
              if(activeRoomModelState && activeRoomModelState.currentRoomKey !== '__base__'){
                destroyInteriorEntity(sel.bIdx, sel.itemIdx, { keepBlobUrl: true, silent: true });
              }
            }, 320);
          }
        }

        try{ title.textContent = (buildingRow.name||'') + ' — ' + getItemDisplayName(meta, '') + ' — ' + (room.label || room.key || 'Room'); }catch(_){ }
        try{ hvUpdateNarrationAudioForSelection(labelEditorState.currentSelection); }catch(_){ }
        try{
          currentMode = 'interior';
          try{ mini.hide(); }catch(_){ }
          setCesiumGroundVisible(true);
          setCameraCollision(false);
          setInteriorMouseBindings();
          interiorNav.enable();
          setJoystickVisible(cameraJoystickEnabledByUser);
        }catch(_){ }

        try{
          hvEnsureCurrentLabelSelectionForActiveInterior();
          renderSelectionLabels();
          syncQuickShowLabelsButton();
          labelEditorStatus.textContent = 'Room model active: ' + (room.label || room.key || 'Room') + '.';
        }catch(_){ }

        requestSceneRenderBurst(10);
        return true;
      }catch(err){
        console.warn('Room model load failed:', err);
        try{ labelEditorStatus.textContent = 'Could not load room model. Check URL/key: ' + cleanActionValue; }catch(_){ }

        // Restore base model if room loading failed.
        try{
          let baseHandle = (interiorEntitiesByBuilding[sel.bIdx] || [])[sel.itemIdx] || null;
          if(!baseHandle) baseHandle = await hvTryEnsureInteriorEntityForMarker(sel.bIdx, sel.itemIdx);
          hvShowModelHandle(baseHandle, true);
          hvReleaseRoomBlobUrl();
          activeRoomModelState.currentRoomKey = '__base__';
          activeRoomModelState.currentRoomMeta = null;
          activeRoomModelState.key = '';
          activeRoomModelState.handle = null;
          renderSelectionLabels();
          syncQuickShowLabelsButton();
        }catch(_){}
        return false;
      }finally{
        activeRoomModelLoading = false;
        endViewLoad();
        hideSceneTransition().catch(function(){});
      }
    }


    reloadActiveInteriorForModelQuality = async function(){
      try{
        if(!activeInteriorSelection){ requestSceneRenderBurst(4); return; }
        const sel = activeInteriorSelection;
        destroyInteriorEntity(sel.bIdx, sel.itemIdx, { keepBlobUrl: true, silent: true });
        await hvTryEnsureInteriorEntityForMarker(sel.bIdx, sel.itemIdx);
        await updateView(sel.bIdx, { forceViewValue: (sel.kind || 'unit') + ':' + sel.itemIdx });
      }catch(err){
        console.warn('Model quality reload failed:', err);
        requestSceneRenderBurst(4);
      }
    };

    function destroyNonActiveInteriorEntities(nextSelection){
      const keepB = nextSelection ? nextSelection.bIdx : -1;
      const keepI = nextSelection ? nextSelection.itemIdx : -1;
      for(let bi=0; bi<interiorEntitiesByBuilding.length; bi++){
        const arr = interiorEntitiesByBuilding[bi] || [];
        for(let ii=0; ii<arr.length; ii++){
          if(bi===keepB && ii===keepI) continue;
          if(arr[ii]) destroyInteriorEntity(bi, ii, { keepBlobUrl: true });
        }
      }
    }


    let customizationApplyToken = 0;
    let activeCustomizationState = null;
    const customizationSelectionsByKey = new Map();
    const panoramaSelectionsByKey = new Map();
    let panoramaApplyToken = 0;
    const panoramaImagePreloadCache = new Map();
    function hvStripPanoramaCacheBust(url){
      const raw = String(url || '').trim();
      if(!raw) return '';
      try{
        const u = new URL(raw, window.location.href);
        u.searchParams.delete('hvpan');
        return u.href;
      }catch(_){
        return raw.replace(/([?&])hvpan=\d+(&?)/, function(match, lead, tail){ return tail ? lead : ''; }).replace(/[?&]$/, '');
      }
    }

    function hvMakePanoramaRuntimeUrl(url){
      const base = hvStripPanoramaCacheBust(url);
      if(!base) return '';
      return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'hvpan=' + Date.now();
    }

    function hvRuntimePanoramaSelection(item){
      if(!item || !item.url) return item;
      const originalUrl = item.__hvOriginalUrl || hvStripPanoramaCacheBust(item.url);
      const copy = Object.assign({}, item);
      copy.__hvOriginalUrl = originalUrl;
      copy.url = hvMakePanoramaRuntimeUrl(originalUrl);
      return copy;
    }

    function preloadPanoramaImage(url, options){
      const raw = String(url || '').trim();
      const forceReload = !!(options && options.forceReload);
      if(!raw) return Promise.resolve(false);
      const cacheKey = hvStripPanoramaCacheBust(raw) || raw;
      if(!forceReload && panoramaImagePreloadCache.has(cacheKey)) return panoramaImagePreloadCache.get(cacheKey);
      if(forceReload){ try{ panoramaImagePreloadCache.delete(cacheKey); }catch(_){ } }
      const src = forceReload ? hvMakePanoramaRuntimeUrl(cacheKey) : raw;
      const p = new Promise(function(resolve){
        let settled = false;
        const img = new Image();
        function done(ok){
          if(settled) return;
          settled = true;
          try{
            if(!ok) panoramaImagePreloadCache.delete(cacheKey);
          }catch(_){ }
          resolve(!!ok);
        }
        const timer = setTimeout(function(){ done(false); }, 15000);
        img.onload = function(){
          clearTimeout(timer);
          try{
            const dec = (typeof img.decode === 'function') ? img.decode() : null;
            if(dec && typeof dec.then === 'function'){
              dec.then(function(){ done(true); }).catch(function(){ done(true); });
            } else {
              done(true);
            }
          }catch(_){
            done(true);
          }
        };
        img.onerror = function(){
          clearTimeout(timer);
          done(false);
        };
        try{ img.crossOrigin = 'anonymous'; }catch(_){ }
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = src;
      });
      panoramaImagePreloadCache.set(cacheKey, p);
      return p;
    }
    async function preloadPanoramaSelectionImage(item, options){
      if(!item || !item.url) return false;
      try{ return await preloadPanoramaImage(item.url, options); }catch(_){ return false; }
    }
    function makeCustomizationSelectionKey(bIdx, itemIdx){ return String(bIdx) + ':' + String(itemIdx); }

    function parseBoolish(v){
      if(v === true || v === false) return v;
      const s = String(v == null ? '' : v).trim().toLowerCase();
      if(!s) return false;
      return ['1','true','yes','y','on','enable','enabled','customizable','allowed'].includes(s);
    }

    function decodeTextureLabelFromUrl(url){
      const clean = String(url || '').split('?')[0].split('#')[0];
      const last = clean.split('/').pop() || clean;
      try{
        return decodeURIComponent(last.replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').trim()) || 'Option';
      }catch(_){
        return last.replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').trim() || 'Option';
      }
    }

    function parseTextureOptions(raw){
      if(raw == null) return [];
      if(Array.isArray(raw)){
        return raw.map(function(item, idx){
          if(item == null) return null;
          if(typeof item === 'string'){
            const s = item.trim();
            if(!s) return null;
            return { label: decodeTextureLabelFromUrl(s), url: s, value: s };
          }
          const url = firstFilled(item.url, item.href, item.src, item.texture, item.image);
          if(!url) return null;
          const label = firstFilled(item.name, item.label, item.title, decodeTextureLabelFromUrl(url), 'Option ' + (idx + 1));
          return { label: label, url: url, value: url };
        }).filter(Boolean);
      }
      const src = String(raw).trim();
      if(!src) return [];
      if((src.startsWith('[') && src.endsWith(']')) || (src.startsWith('{') && src.endsWith('}'))){
        try{ return parseTextureOptions(JSON.parse(src)); }catch(_){ }
      }
      return src
        .split(/\r?\n|;/)
        .map(function(chunk){
          const s = String(chunk || '').trim();
          if(!s) return null;
          const parts = s.split('|').map(function(x){ return String(x || '').trim(); }).filter(Boolean);
          if(parts.length >= 2){
            const url = parts.slice(1).join('|');
            return { label: parts[0] || decodeTextureLabelFromUrl(url), url: url, value: url };
          }
          return { label: decodeTextureLabelFromUrl(s), url: s, value: s };
        })
        .filter(function(opt){ return !!(opt && opt.url); });
    }

    function uniqueTextureOptions(list){
      const out = [];
      const seen = new Set();
      (list || []).forEach(function(opt){
        if(!opt || !opt.url) return;
        const key = String(opt.url).trim();
        if(!key || seen.has(key)) return;
        seen.add(key);
        out.push({ label: opt.label || decodeTextureLabelFromUrl(key), url: key, value: key });
      });
      return out;
    }


    function parsePanoramaItems(raw){
      if(raw == null) return [];
      const src = String(raw).trim();
      if(!src) return [];
      return src.split(/\r?\n|;/).join('|').split('|').map(function(chunk, idx){
        const s = String(chunk || '').trim();
        if(!s) return null;
        const parts = s.split('::').map(function(x){ return String(x || '').trim(); });
        let key = '';
        let title = '';
        let url = '';
        let audioUrl = '';
        // Supported:
        //   imageUrl
        //   Title::imageUrl
        //   sceneKey::Scene Title::imageUrl
        //   sceneKey::Scene Title::imageUrl::audioUrl
        if(parts.length >= 4){
          key = parts[0];
          title = parts[1];
          url = parts[2];
          audioUrl = parts.slice(3).join('::');
        } else if(parts.length >= 3){
          key = parts[0];
          title = parts[1];
          url = parts.slice(2).join('::');
        } else if(parts.length === 2){
          title = parts[0];
          url = parts[1];
          key = title;
        } else {
          url = parts[0];
          title = 'Panorama ' + (idx + 1);
          key = title;
        }
        if(!url) return null;
        key = (key || title || ('panorama_' + (idx + 1))).trim();
        title = (title || key || ('Panorama ' + (idx + 1))).trim();
        const item = { key:key, title:title, url:url.trim() };
        if(audioUrl) item.audioUrl = audioUrl.trim();
        return item;
      }).filter(Boolean);
    }

    function getPanoramaConfig(meta, row){
      const items = parsePanoramaItems(firstFilled(
        meta && meta.panorama_items,
        meta && meta.panorama_item,
        meta && meta.panorama_images,
        meta && meta.panorama_urls,
        row && row.panorama_items,
        row && row.panorama_item,
        row && row.panorama_images,
        row && row.panorama_urls
      ));
      return {
        items: items,
        defaultItem: items[0] || null
      };
    }

    function resolvePanoramaItem(meta, row, actionValue){
      const cfg = getPanoramaConfig(meta, row);
      const items = cfg.items || [];
      const raw = String(actionValue || '').trim();
      if(!items.length) return null;
      if(!raw) return cfg.defaultItem || items[0];
      const key = raw.toLowerCase();
      return items.find(function(it){
        return String(it.key || '').toLowerCase() === key
          || String(it.title || '').toLowerCase() === key
          || String(it.url || '').toLowerCase() === key;
      }) || cfg.defaultItem || items[0];
    }

    function getPanoramaSelectionKey(sel){
      return sel ? makeCustomizationSelectionKey(sel.bIdx, sel.itemIdx) : '';
    }
    function getActivePanoramaItemForSelection(sel){
      if(!sel || !sel.meta || !isPanoramaRow(sel.meta)) return null;
      const key = getPanoramaSelectionKey(sel);
      return panoramaSelectionsByKey.get(key) || getPanoramaConfig(sel.meta, sel.row).defaultItem || null;
    }
    function getCurrentPanoramaSceneKey(sel){
      const item = getActivePanoramaItemForSelection(sel);
      return item ? String(item.key || item.title || '').trim() : '';
    }

    // ===== HomeView Narration Audio (Panorama + 3D Models) =====
    // Optional audio fields:
    // 1) For panorama_items:
    //      sceneKey::Scene Title::imageUrl::audioUrl
    //    audioUrl is optional. If it is empty, no narration button is shown.
    //
    // 2) For any selected 3D model / unit / panorama row, add one of these columns:
    //      audio_url, narration_url, voice_url, model_audio_url, interior_audio_url, unit_audio_url
    //    If a panorama scene has its own audioUrl, that scene audio wins. Otherwise the row-level audio_url is used.
    const hvNarrationAudio = new Audio();
    hvNarrationAudio.preload = 'none';
    let hvActiveNarrationAudioUrl = '';
    let hvActiveNarrationAudioLabel = '';
    const hvNarrationAudioBtn = document.createElement('button');
    hvNarrationAudioBtn.type = 'button';
    hvNarrationAudioBtn.id = 'hvNarrationAudioBtn';
    hvNarrationAudioBtn.textContent = '🎧 Narration';
    hvNarrationAudioBtn.title = 'Play narration';
    hvNarrationAudioBtn.setAttribute('aria-label', 'Play narration');
    hvNarrationAudioBtn.className = 'ui-btn';
    hvNarrationAudioBtn.style.cssText = 'height:32px;padding:0 10px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;flex:0 0 auto;display:none;align-items:center;gap:5px;white-space:nowrap';
    // Keep narration in the top controls row, next to AI Advisor.
    // Because the header remains visible when Controls is collapsed, the narration button remains accessible too.
    try{ headerLeft.insertBefore(hvNarrationAudioBtn, quickShareBtn); }catch(_){ headerLeft.appendChild(hvNarrationAudioBtn); }

    function hvNormalizeNarrationAudioUrl(raw){
      try{
        let url = String(raw || '').trim();
        if(!url) return '';
        // Sheet cells often keep a trailing delimiter when copied from room_model_items.
        // Examples: audio.mp3?;  audio.mp3;  "audio.mp3"
        url = url.replace(/^[\s"'`]+|[\s"'`;]+$/g, '').trim();
        // Remove only empty query/hash marks left by copy/paste. Do not remove real query tokens.
        while(/[?#&]$/.test(url)) url = url.slice(0, -1).trim();
        if(!/^https?:\/\//i.test(url) && !/^blob:/i.test(url) && !/^data:audio\//i.test(url)) return '';

        // Dropbox sharing links should be converted to a direct media response for <audio>.
        if(/^https?:\/\/(www\.)?dropbox\.com\//i.test(url)){
          url = url.replace(/^https?:\/\/(www\.)?dropbox\.com\//i, 'https://dl.dropboxusercontent.com/');
        }
        if(/dropboxusercontent\.com|dropbox\.com/i.test(url)){
          // If a Dropbox query exists, prefer dl=1. If there is no query, leave the direct URL alone.
          if(/[?&]dl=0(?:&|$)/i.test(url)) url = url.replace(/([?&])dl=0(?=&|$)/i, '$1dl=1');
          if(/^https?:\/\/www\.dropbox\.com\//i.test(String(raw || '')) && !/[?&]dl=1(?:&|$)/i.test(url)){
            url += (url.indexOf('?') >= 0 ? '&' : '?') + 'dl=1';
          }
        }
        return url;
      }catch(_){ return ''; }
    }

    function hvGetNarrationAudioUrlFromObject(obj){
      return hvNormalizeNarrationAudioUrl(firstFilled(
        obj && obj.audioUrl,
        obj && obj.audio_url,
        obj && obj.narrationUrl,
        obj && obj.narration_url,
        obj && obj.voiceUrl,
        obj && obj.voice_url,
        obj && obj.model_audio_url,
        obj && obj.interior_audio_url,
        obj && obj.unit_audio_url,
        obj && obj.pano_audio_url,
        obj && obj.panorama_audio_url
      ));
    }

    function hvSetNarrationAudioButtonState(){
      try{
        if(!hvActiveNarrationAudioUrl){
          hvNarrationAudioBtn.style.display = 'none';
          return;
        }
        hvNarrationAudioBtn.style.display = 'flex';
        hvNarrationAudioBtn.textContent = hvNarrationAudio.paused ? '🎧 Narration' : '⏸ Pause';
        hvNarrationAudioBtn.title = hvActiveNarrationAudioLabel ? ('Narration: ' + hvActiveNarrationAudioLabel) : 'HomeView narration';
        hvNarrationAudioBtn.style.background = hvNarrationAudio.paused ? '#fff' : '#111';
        hvNarrationAudioBtn.style.color = hvNarrationAudio.paused ? '#111' : '#fff';
      }catch(_){ }
    }

    function hvStopNarrationAudio(){
      try{ hvNarrationAudio.pause(); }catch(_){ }
      try{ hvNarrationAudio.currentTime = 0; }catch(_){ }
      try{ hvNarrationAudio.removeAttribute('src'); hvNarrationAudio.load(); }catch(_){ }
      hvActiveNarrationAudioUrl = '';
      hvActiveNarrationAudioLabel = '';
      hvSetNarrationAudioButtonState();
    }

    function hvResolveNarrationForSelection(sel){
      try{
        if(!sel || sel.isExterior || !sel.meta) return null;

        // Panorama: per-scene audio is independent and has priority.
        if(currentMode === 'panorama' && isPanoramaRow(sel.meta)){
          const item = getActivePanoramaItemForSelection(sel);
          const sceneAudio = hvGetNarrationAudioUrlFromObject(item);
          if(sceneAudio){
            return { url: sceneAudio, label: (item && (item.title || item.key)) || getItemDisplayName(sel.meta, 'Panorama') };
          }
          const rowAudio = hvGetNarrationAudioUrlFromObject(sel.meta) || hvGetNarrationAudioUrlFromObject(sel.row);
          if(rowAudio){
            return { url: rowAudio, label: getItemDisplayName(sel.meta, 'Panorama') };
          }
          return null;
        }

        // 3D model/unit/amenity/interior:
        // - If the user is inside a room model and that room has its own audio_url, use it.
        // - Otherwise use the selected unit/model row's audio_url.
        if(currentMode === 'interior' || currentMode === 'amenity'){
          const roomMeta = activeRoomModelState && activeRoomModelState.currentRoomMeta ? activeRoomModelState.currentRoomMeta : null;
          const roomAudio = hvGetNarrationAudioUrlFromObject(roomMeta);
          if(roomAudio){
            return { url: roomAudio, label: getItemDisplayName(roomMeta, getRoomContextDisplayName ? getRoomContextDisplayName() : 'Room') };
          }
          const modelAudio = hvGetNarrationAudioUrlFromObject(sel.meta) || hvGetNarrationAudioUrlFromObject(sel.row);
          if(modelAudio){
            return { url: modelAudio, label: getItemDisplayName(sel.meta, '3D model') };
          }
        }
      }catch(_){ }
      return null;
    }

    function hvUpdateNarrationAudioForSelection(sel){
      try{
        const resolved = hvResolveNarrationForSelection(sel);
        const audioUrl = hvNormalizeNarrationAudioUrl(resolved && resolved.url ? String(resolved.url).trim() : '');
        if(!audioUrl){
          hvStopNarrationAudio();
          return;
        }
        if(audioUrl !== hvActiveNarrationAudioUrl){
          try{ hvNarrationAudio.pause(); hvNarrationAudio.currentTime = 0; }catch(_){ }
          hvActiveNarrationAudioUrl = audioUrl;
          hvActiveNarrationAudioLabel = (resolved && resolved.label) || '';
          hvNarrationAudio.src = audioUrl;
          try{ hvNarrationAudio.load(); }catch(_){ }
        }
        hvSetNarrationAudioButtonState();
      }catch(_){
        hvStopNarrationAudio();
      }
    }

    hvNarrationAudioBtn.addEventListener('click', function(evt){
      try{ evt.preventDefault(); evt.stopPropagation(); }catch(_){ }
      if(!hvActiveNarrationAudioUrl) return;
      if(hvNarrationAudio.paused){
        try{
          // Re-assign the src right before play. This fixes some mobile/Dropbox cases where the audio element
          // keeps a failed source state after a room switch.
          if(hvNarrationAudio.src !== hvActiveNarrationAudioUrl){
            hvNarrationAudio.src = hvActiveNarrationAudioUrl;
          }
          hvNarrationAudio.load();
        }catch(_){ }
        hvNarrationAudio.play().then(hvSetNarrationAudioButtonState).catch(function(err){
          console.warn('HomeView narration could not play:', err, hvActiveNarrationAudioUrl);
          hvNarrationAudioBtn.textContent = '🎧 Tap again';
        });
      }else{
        hvNarrationAudio.pause();
        hvSetNarrationAudioButtonState();
      }
    });
    hvNarrationAudio.addEventListener('play', hvSetNarrationAudioButtonState);
    hvNarrationAudio.addEventListener('pause', hvSetNarrationAudioButtonState);
    hvNarrationAudio.addEventListener('ended', hvSetNarrationAudioButtonState);

    function getRawPanoramaSceneAnnotationString(meta){
      if(!meta) return '';
      const direct = firstFilled(meta.panorama_label_annotations, meta.panorama_labels);
      if(hasTextValue(direct)) return direct;
      const fallbacks = [meta.label_annotations, meta.labels_3d, meta.text_annotations, meta.annotation_labels];
      for(let i=0;i<fallbacks.length;i++){
        const raw = String(fallbacks[i] || '').trim();
        if(raw && raw.indexOf('>>') >= 0) return raw;
      }
      return '';
    }
    function parsePanoramaSceneLabelAnnotations(str){
      const out = {};
      const raw = String(str || '').trim();
      if(!raw) return out;
      raw.split('||').forEach(function(sceneChunk){
        const chunk = String(sceneChunk || '').trim();
        if(!chunk) return;
        const splitIdx = chunk.indexOf('>>');
        if(splitIdx < 0) return;
        const sceneKey = chunk.slice(0, splitIdx).trim();
        const labelsRaw = chunk.slice(splitIdx + 2).trim();
        if(!sceneKey) return;
        out[sceneKey] = labelsRaw ? parseLabelAnnotations(labelsRaw.replace(/##/g, '; ')) : [];
      });
      return out;
    }
    function formatPanoramaSceneLabelAnnotations(mapObj){
      const out = [];
      Object.keys(mapObj || {}).forEach(function(sceneKey){
        const items = (mapObj[sceneKey] || []).filter(Boolean);
        if(!items.length) return;
        const encoded = formatLabelAnnotations(items).replace(/;\s*/g, '##');
        out.push(String(sceneKey).replace(/[|>;]/g, ' ').trim() + '>>' + encoded);
      });
      return out.join('||');
    }

    function patchRawGltfTextureForAll(gltf, textureUrl){
      if(!gltf || !textureUrl) return false;
      const materials = Array.isArray(gltf.materials) ? gltf.materials : null;
      const textures = Array.isArray(gltf.textures) ? gltf.textures : null;
      if(!materials || !textures) return false;
      if(!Array.isArray(gltf.images)) gltf.images = [];
      const images = gltf.images;
      let changed = false;

      materials.forEach(function(sourceMaterial){
        if(!sourceMaterial) return;
        const clonedMaterial = cloneJson(sourceMaterial);
        const pbr = clonedMaterial && clonedMaterial.pbrMetallicRoughness;
        const texInfo = pbr && pbr.baseColorTexture;
        if(!texInfo || typeof texInfo.index !== 'number') return;
        const sourceTexture = textures[texInfo.index];
        if(!sourceTexture) return;
        const clonedTexture = cloneJson(sourceTexture) || {};
        let clonedImage = {};
        if(typeof sourceTexture.source === 'number' && images[sourceTexture.source]){
          clonedImage = cloneJson(images[sourceTexture.source]) || {};
        }
        delete clonedImage.bufferView;
        delete clonedImage.mimeType;
        clonedImage.uri = textureUrl;
        images.push(clonedImage);
        const newImageIdx = images.length - 1;
        clonedTexture.source = newImageIdx;
        textures.push(clonedTexture);
        texInfo.index = textures.length - 1;
        clonedMaterial.pbrMetallicRoughness = pbr;
        sourceMaterial.pbrMetallicRoughness = clonedMaterial.pbrMetallicRoughness;
        changed = true;
      });
      return changed;
    }

    function getCustomizationConfig(meta, row){
      const enabled = parseBoolish(firstFilled(
        meta && meta.customizable,
        meta && meta.is_customizable,
        meta && meta.allow_customization,
        meta && meta.can_customize,
        meta && meta.customization_enabled,
        meta && meta.customize,
        row && row.customizable,
        row && row.is_customizable,
        row && row.allow_customization,
        row && row.can_customize,
        row && row.customization_enabled,
        row && row.customize
      ));
      const floorOptions = uniqueTextureOptions(parseTextureOptions(firstFilled(
        meta && meta.kafpoosh_textures,
        meta && meta.floor_textures,
        meta && meta.flooring_textures,
        meta && meta.kafpoosh_options,
        meta && meta.floor_options,
        row && row.kafpoosh_textures,
        row && row.floor_textures,
        row && row.flooring_textures,
        row && row.kafpoosh_options,
        row && row.floor_options
      )));
      const cabinetOptions = uniqueTextureOptions(parseTextureOptions(firstFilled(
        meta && meta.kabinet_textures,
        meta && meta.cabinet_textures,
        meta && meta.kitchen_cabinet_textures,
        meta && meta.kabinet_options,
        meta && meta.cabinet_options,
        row && row.kabinet_textures,
        row && row.cabinet_textures,
        row && row.kitchen_cabinet_textures,
        row && row.kabinet_options,
        row && row.cabinet_options
      )));
      return {
        enabled: enabled && (floorOptions.length > 0 || cabinetOptions.length > 0),
        floorOptions: floorOptions,
        cabinetOptions: cabinetOptions,
        defaults: {
          kafpoosh: firstFilled(meta && meta.selected_kafpoosh_texture, meta && meta.default_kafpoosh_texture, meta && meta.selected_floor_texture, meta && meta.default_floor_texture),
          kabinet: firstFilled(meta && meta.selected_kabinet_texture, meta && meta.default_kabinet_texture, meta && meta.selected_cabinet_texture, meta && meta.default_cabinet_texture)
        }
      };
    }

    function setFinishControlsDisabled(disabled, message){
      const flag = !!disabled;
      floorFinishSelect.disabled = flag || floorFinishSelect.options.length <= 1;
      cabinetFinishSelect.disabled = flag || cabinetFinishSelect.options.length <= 1;
      floorFinishSelect.style.opacity = floorFinishSelect.disabled ? '0.7' : '1';
      cabinetFinishSelect.style.opacity = cabinetFinishSelect.disabled ? '0.7' : '1';
      finishStatus.textContent = message || 'Ready';
    }

    function hideFinishCard(){
      finishCard.style.display = 'none';
      floorFinishSelect.innerHTML = '';
      cabinetFinishSelect.innerHTML = '';
      activeCustomizationState = null;
      setFinishControlsDisabled(false, 'Ready');
    }

    function fillFinishSelect(selectEl, options, placeholder){
      selectEl.innerHTML = '';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = placeholder;
      selectEl.appendChild(noneOpt);
      (options || []).forEach(function(opt){
        const o = document.createElement('option');
        o.value = opt.url;
        o.textContent = opt.label || decodeTextureLabelFromUrl(opt.url);
        selectEl.appendChild(o);
      });
    }

    function normalizeFinishName(name){
      return String(name == null ? '' : name).trim().toLowerCase();
    }

    function isMaterialLike(obj){
      if(!obj || typeof obj !== 'object') return false;
      return !!(
        obj.metallicRoughness ||
        obj.pbrMetallicRoughness ||
        obj.baseColorTexture ||
        obj.baseColorFactor ||
        obj.emissiveTexture ||
        obj.normalTexture ||
        obj.occlusionTexture
      );
    }

    function debugListKnownFinishNames(model){
      const out = new Set();
      try{
        const raw = model && model.__hvRawGltf;
        if(raw && Array.isArray(raw.materials)) raw.materials.forEach(function(m){ if(m && m.name) out.add(String(m.name)); });
        if(raw && Array.isArray(raw.nodes)) raw.nodes.forEach(function(n){ if(n && n.name) out.add(String(n.name)); });
      }catch(_){ }
      try{
        const map = model && model._nodesByName ? model._nodesByName : null;
        if(map) Object.keys(map).forEach(function(k){ if(k) out.add(String(k)); });
      }catch(_){ }
      try{
        const sceneGraph = model && model._sceneGraph;
        const runtimeNodes = sceneGraph && (sceneGraph._runtimeNodes || sceneGraph.runtimeNodes || sceneGraph.runtimeNodesById);
        if(Array.isArray(runtimeNodes)) runtimeNodes.forEach(function(rn){
          if(rn && rn.node && rn.node.name) out.add(String(rn.node.name));
          const rps = rn && (rn.runtimePrimitives || (rn.node && rn.node.runtimePrimitives)) || [];
          rps.forEach(function(rp){
            const mat = rp && (rp.material || (rp.primitive && rp.primitive.material));
            if(mat && mat.name) out.add(String(mat.name));
          });
        });
      }catch(_){ }
      return Array.from(out);
    }

    function getNodeByNameCI(model, targetName){
      if(!model || !targetName) return null;
      try{
        if(typeof model.getNode === 'function'){
          const direct = model.getNode(targetName);
          if(direct) return direct;
        }
      }catch(_){ }
      const map = model._nodesByName || {};
      const wanted = normalizeFinishName(targetName);
      const keys = Object.keys(map);
      for(let i=0; i<keys.length; i++){
        const key = keys[i];
        if(normalizeFinishName(key) === wanted){
          try{ return typeof model.getNode === 'function' ? model.getNode(key) : map[key]; }catch(_){ return map[key]; }
        }
      }
      return null;
    }

    function collectMaterialRefsForTarget(model, objectName, materialName){
      const refs = [];
      const seenMaterials = new WeakSet();
      const wantedObject = normalizeFinishName(objectName);
      const wantedMaterial = normalizeFinishName(materialName || objectName);

      function pushMaterial(material, primitive, nodeName, source){
        if(!material || typeof material !== 'object') return;
        if(seenMaterials.has(material)) return;
        seenMaterials.add(material);
        refs.push({ material: material, primitive: primitive || null, nodeName: nodeName || '', source: source || '' });
      }

      function maybePushNamedMaterial(candidate, primitive, nodeName, source){
        if(!candidate || typeof candidate !== 'object') return;
        const candName = normalizeFinishName(candidate.name);
        if(isMaterialLike(candidate) && (!wantedMaterial || candName === wantedMaterial)){
          pushMaterial(candidate, primitive, nodeName, source);
        }
        if(candidate.material && isMaterialLike(candidate.material)){
          const nestedName = normalizeFinishName(candidate.material.name);
          if(!wantedMaterial || nestedName === wantedMaterial || candName === wantedMaterial){
            pushMaterial(candidate.material, primitive || candidate, nodeName, source + ':material');
          }
        }
      }

      function scanRuntimePrimitives(list, nodeName, source){
        (list || []).forEach(function(rp){
          if(!rp) return;
          const primitive = rp.primitive || rp;
          const material = primitive && primitive.material ? primitive.material : (rp.material || null);
          maybePushNamedMaterial(material, primitive, nodeName, source + ':runtime');
          maybePushNamedMaterial(primitive, primitive, nodeName, source + ':primitive');
        });
      }

      // 1) Direct named node lookup using the public API.
      try{
        const node = getNodeByNameCI(model, objectName);
        if(node){
          const runtimeNode = node._runtimeNode || node.runtimeNode || null;
          const runtimePrimitives = (runtimeNode && (runtimeNode.runtimePrimitives || (runtimeNode.node && runtimeNode.node.primitives))) || [];
          scanRuntimePrimitives(runtimePrimitives, objectName, 'getNode');
        }
      }catch(_){ }
      if(refs.length) return refs;

      // 2) Walk the scene graph internals used by newer Cesium versions.
      try{
        const sceneGraph = model && model._sceneGraph;
        const runtimeNodes = sceneGraph && (sceneGraph._runtimeNodes || sceneGraph.runtimeNodes || sceneGraph.runtimeNodesById);
        if(Array.isArray(runtimeNodes)){
          runtimeNodes.forEach(function(rn){
            const nodeName = firstFilled(rn && rn.node && rn.node.name, rn && rn.name, '');
            if(wantedObject && normalizeFinishName(nodeName) !== wantedObject) return;
            scanRuntimePrimitives(rn && (rn.runtimePrimitives || (rn.node && rn.node.runtimePrimitives) || []), nodeName, 'sceneGraph');
          });
        }
      }catch(_){ }
      if(refs.length) return refs;

      // 3) Generic deep scan as a robust fallback when Cesium internals differ.
      const roots = [model, model && model._sceneGraph, model && model._loader, model && model.components, model && model.__hvRawGltf].filter(Boolean);
      const visited = new WeakSet();
      const queue = roots.map(function(root){ return { value: root, depth: 0, path: 'root', objectMatch: false }; });
      let guard = 0;
      while(queue.length && guard < 8000){
        guard++;
        const item = queue.shift();
        const value = item.value;
        if(!value || typeof value !== 'object') continue;
        if(visited.has(value)) continue;
        visited.add(value);

        const valueName = normalizeFinishName(value.name);
        const objectMatch = item.objectMatch || (!!wantedObject && valueName === wantedObject);

        if(isMaterialLike(value)){
          if((objectMatch && !wantedMaterial) || (wantedMaterial && valueName === wantedMaterial)){
            pushMaterial(value, item.primitive || null, item.nodeName || item.path, 'deep:' + item.path);
          }
        }
        if(value.material && isMaterialLike(value.material)){
          const nestedName = normalizeFinishName(value.material.name);
          if(objectMatch || (wantedMaterial && nestedName === wantedMaterial)){
            pushMaterial(value.material, value, item.nodeName || item.path, 'deep:' + item.path + ':material');
          }
        }

        if(item.depth >= 7) continue;
        const entries = [];
        if(Array.isArray(value)){
          const limit = Math.min(value.length, 80);
          for(let ai=0; ai<limit; ai++){
            if(!(ai in value)) continue;
            entries.push([String(ai), value[ai]]);
          }
        }else{
          const rawEntries = Object.entries(value);
          for(let ei=0; ei<rawEntries.length && ei<80; ei++) entries.push(rawEntries[ei]);
        }
        for(let i=0; i<entries.length; i++){
          const pair = entries[i];
          if(!pair) continue;
          const key = pair[0];
          const child = pair[1];
          if(!child || typeof child !== 'object') continue;
          queue.push({
            value: child,
            depth: item.depth + 1,
            path: item.path + '.' + key,
            objectMatch: objectMatch,
            primitive: item.primitive || (key === 'primitive' ? child : null),
            nodeName: item.nodeName || (valueName ? value.name : '')
          });
        }
      }
      return refs;
    }


    function cloneJson(value){
      try{ return JSON.parse(JSON.stringify(value)); }catch(_){ return null; }
    }

    function findNodeIndicesByNameCI(gltf, targetName){
      const out = [];
      const nodes = gltf && Array.isArray(gltf.nodes) ? gltf.nodes : [];
      const wanted = normalizeFinishName(targetName);
      for(let i=0; i<nodes.length; i++){
        const n = nodes[i];
        if(n && normalizeFinishName(n.name) === wanted) out.push(i);
      }
      return out;
    }

    function collectNodeSubtreeIndices(gltf, startIndices){
      const nodes = gltf && Array.isArray(gltf.nodes) ? gltf.nodes : [];
      const out = new Set();
      const queue = Array.isArray(startIndices) ? startIndices.slice() : [];
      let guard = 0;
      while(queue.length && guard < 5000){
        guard++;
        const idx = queue.shift();
        if(typeof idx !== 'number' || idx < 0 || idx >= nodes.length) continue;
        if(out.has(idx)) continue;
        out.add(idx);
        const node = nodes[idx];
        const kids = node && Array.isArray(node.children) ? node.children : [];
        for(let i=0; i<kids.length; i++) queue.push(kids[i]);
      }
      return Array.from(out);
    }

    function patchRawGltfTextureForObject(gltf, objectName, textureUrl){
      if(!gltf || !objectName || !textureUrl) return false;
      const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : null;
      const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : null;
      const materials = Array.isArray(gltf.materials) ? gltf.materials : null;
      const textures = Array.isArray(gltf.textures) ? gltf.textures : null;
      if(!nodes || !meshes || !materials || !textures) return false;
      if(!Array.isArray(gltf.images)) gltf.images = [];
      const images = gltf.images;

      const startIndices = findNodeIndicesByNameCI(gltf, objectName);
      if(!startIndices.length) return false;
      const nodeIndices = collectNodeSubtreeIndices(gltf, startIndices);
      let changed = false;

      nodeIndices.forEach(function(nodeIdx){
        const node = nodes[nodeIdx];
        if(!node || typeof node.mesh !== 'number') return;
        const mesh = meshes[node.mesh];
        if(!mesh || !Array.isArray(mesh.primitives)) return;
        mesh.primitives.forEach(function(primitive){
          if(!primitive || typeof primitive.material !== 'number') return;
          const sourceMaterial = materials[primitive.material];
          if(!sourceMaterial) return;
          const clonedMaterial = cloneJson(sourceMaterial);
          const pbr = clonedMaterial && clonedMaterial.pbrMetallicRoughness;
          const texInfo = pbr && pbr.baseColorTexture;
          if(!texInfo || typeof texInfo.index !== 'number') return;
          const sourceTexture = textures[texInfo.index];
          if(!sourceTexture) return;

          const clonedTexture = cloneJson(sourceTexture) || {};
          let clonedImage = {};
          if(typeof sourceTexture.source === 'number' && images[sourceTexture.source]){
            clonedImage = cloneJson(images[sourceTexture.source]) || {};
          }
          delete clonedImage.bufferView;
          delete clonedImage.mimeType;
          clonedImage.uri = textureUrl;
          images.push(clonedImage);
          const newImageIdx = images.length - 1;

          clonedTexture.source = newImageIdx;
          textures.push(clonedTexture);
          const newTextureIdx = textures.length - 1;

          texInfo.index = newTextureIdx;
          materials.push(clonedMaterial);
          primitive.material = materials.length - 1;
          changed = true;
        });
      });
      return changed;
    }

    const applyVisualSelectionsToRawGltf = (globalThis.applyVisualSelectionsToRawGltf = function applyVisualSelectionsToRawGltf(gltf, finishSelections, panoramaSelection){
      if(!gltf) return false;
      let changed = false;
      if(panoramaSelection && panoramaSelection.url){
        changed = patchRawGltfTextureForAll(gltf, panoramaSelection.url) || changed;
      }
      if(finishSelections && finishSelections.kafpoosh) changed = patchRawGltfTextureForObject(gltf, 'Kafpoosh', finishSelections.kafpoosh) || changed;
      if(finishSelections && finishSelections.kabinet) changed = patchRawGltfTextureForObject(gltf, 'Kabinet', finishSelections.kabinet) || changed;
      return changed;
    });

    function assignTextureToMaterialRef(ref, textureUrl){
      const material = ref && ref.material ? ref.material : null;
      if(!material) return false;
      const pbr = material.metallicRoughness || material.pbrMetallicRoughness || material._metallicRoughness || null;
      const textureUniform = new Cesium.TextureUniform({ url: textureUrl, repeat: true });
      const white4 = new Cesium.Cartesian4(1.0, 1.0, 1.0, 1.0);
      let changed = false;
      function trySet(obj, key, value){
        if(!obj) return;
        try{ obj[key] = value; changed = true; }catch(_){ }
      }
      function tryPatchBaseTexture(obj){
        if(!obj) return;
        try{ if(obj.baseColorTexture && typeof obj.baseColorTexture === 'object'){ obj.baseColorTexture.texture = textureUniform; changed = true; } }catch(_){ }
        try{ obj.baseColorTexture = textureUniform; changed = true; }catch(_){ }
        try{ obj.baseColorTexture = { texture: textureUniform, texCoord: 0 }; changed = true; }catch(_){ }
      }
      trySet(pbr, 'baseColorFactor', white4);
      trySet(material, 'baseColorFactor', white4);
      tryPatchBaseTexture(pbr);
      tryPatchBaseTexture(material);
      try{ if(ref.primitive && ref.primitive.material !== material){ ref.primitive.material = material; changed = true; } }catch(_){ }
      return changed;
    }

    async function applyFinishTextureToEntity(entity, targetKey, textureUrl){
      if(!entity || !entity.modelPrimitive || !textureUrl) return false;
      const model = entity.modelPrimitive;
      if(model.readyPromise){
        try{ await model.readyPromise; }catch(_){ }
      }
      const prettyName = targetKey === 'kafpoosh' ? 'Kafpoosh' : 'Kabinet';
      const refs = collectMaterialRefsForTarget(model, prettyName, prettyName);
      if(!refs.length){
        const known = debugListKnownFinishNames(model);
        throw new Error('Target material was not found in the loaded model: ' + targetKey + (known.length ? ' | known names: ' + known.join(', ') : ''));
      }
      let changed = false;
      refs.forEach(function(ref){ if(assignTextureToMaterialRef(ref, textureUrl)) changed = true; });
      requestSceneRenderBurst(12);
      return changed;
    }

    async function applyFinishSelection(targetKey){
      const state = activeCustomizationState;
      if(!state) return;
      const selectEl = targetKey === 'kafpoosh' ? floorFinishSelect : cabinetFinishSelect;
      const value = String(selectEl.value || '').trim();
      if(!value) return;
      const thisToken = ++customizationApplyToken;
      setFinishControlsDisabled(true, 'Applying selected finish...');
      try{
        state.selections[targetKey] = value;
        customizationSelectionsByKey.set(makeCustomizationSelectionKey(state.bIdx, state.itemIdx), Object.assign({}, state.selections));
        destroyInteriorEntity(state.bIdx, state.itemIdx, { keepBlobUrl: true, silent: true });
        const reloaded = await hvTryEnsureInteriorEntityForMarker(state.bIdx, state.itemIdx);
        if(thisToken !== customizationApplyToken) return;
        if(!reloaded) throw new Error('Model reload failed after finish change');
        reloaded.show = true;
        state.entity = reloaded;
        finishStatus.textContent = 'Finish updated';
        requestSceneRenderBurst(10);
      } catch(err){
        if(thisToken !== customizationApplyToken) return;
        console.warn('Finish apply failed:', err);
        finishStatus.textContent = 'Could not apply this finish';
      } finally {
        if(thisToken === customizationApplyToken) setFinishControlsDisabled(false, finishStatus.textContent || 'Ready');
      }
    }

    floorFinishSelect.addEventListener('change', function(){ applyFinishSelection('kafpoosh'); });
    cabinetFinishSelect.addEventListener('change', function(){ applyFinishSelection('kabinet'); });

    async function syncCustomizationUIForSelection(bIdx, itemIdx, meta, row, entity){
      const cfg = getCustomizationConfig(meta, row);
      if(!cfg.enabled || !entity){
        hideFinishCard();
        return;
      }
      fillFinishSelect(floorFinishSelect, cfg.floorOptions, cfg.floorOptions.length ? 'Choose flooring' : 'No flooring options');
      fillFinishSelect(cabinetFinishSelect, cfg.cabinetOptions, cfg.cabinetOptions.length ? 'Choose cabinets' : 'No cabinet options');
      finishCard.style.display = 'block';

      const key = makeCustomizationSelectionKey(bIdx, itemIdx);
      const savedSelections = customizationSelectionsByKey.get(key) || {};
      const floorDefault = savedSelections.kafpoosh || cfg.defaults.kafpoosh || (cfg.floorOptions[0] && cfg.floorOptions[0].url) || '';
      const cabinetDefault = savedSelections.kabinet || cfg.defaults.kabinet || (cfg.cabinetOptions[0] && cfg.cabinetOptions[0].url) || '';
      const selections = { kafpoosh: floorDefault || '', kabinet: cabinetDefault || '' };
      customizationSelectionsByKey.set(key, Object.assign({}, selections));

      activeCustomizationState = {
        bIdx: bIdx,
        itemIdx: itemIdx,
        entity: entity,
        config: cfg,
        selections: selections
      };
      if(floorDefault) floorFinishSelect.value = floorDefault;
      if(cabinetDefault) cabinetFinishSelect.value = cabinetDefault;
      setFinishControlsDisabled(false, 'Ready');
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
      const v = (unitRow && (unitRow.list_price||unitRow.price||unitRow.estimated_price_unit||unitRow.estimated_price||unitRow.current_price))
             || (buildingRow && (buildingRow.estimated_price_first||buildingRow.estimated_price||buildingRow.current_price));
      return parseFirstNumber(v);
    }
    function getAreaSqft(unitRow){
      const sqftDirect = unitRow ? (
        unitRow.area_sqft ||
        unitRow.square_footage ||
        unitRow.sqft ||
        unitRow.sq_ft ||
        unitRow.sqm_ft
      ) : null;
      let v = parseFirstNumber(sqftDirect);
      if(Number.isFinite(v)){
        const s = String(sqftDirect).toLowerCase();
        if(s.includes('m²') || s.includes('sqm') || s.includes('sq m') || s.includes('meter')) return v * 10.7639;
        return v;
      }
      const metricRaw = unitRow ? (unitRow.area_m2 || unitRow.area_sqm || unitRow.sqm || unitRow.area) : null;
      v = parseFirstNumber(metricRaw);
      if(Number.isFinite(v)){
        const s = String(metricRaw).toLowerCase();
        if(s.includes('sqft') || s.includes('ft²') || s.includes('ft2') || s.includes('sq ft')) return v;
        return v * 10.7639;
      }
      return NaN;
    }
    function fmtAreaSqftValue(v, digits){
      return Number.isFinite(v) ? v.toFixed(digits == null ? 1 : digits) + ' sqft' : '';
    }
    function getAreaDisplayText(unitRow, digits){
      const sqft = getAreaSqft(unitRow);
      if(Number.isFinite(sqft)) return fmtAreaSqftValue(sqft, digits);
      return firstFilled(unitRow && unitRow.area_sqft, unitRow && unitRow.square_footage, unitRow && unitRow.area, unitRow && unitRow.area_m2, unitRow && unitRow.area_sqm);
    }
    function getBeds(unitRow){ const b = parseFirstNumber(unitRow && (unitRow.bedrooms||unitRow.beds||unitRow.bed)); return Number.isFinite(b)? b : null; }

function getBaths(unitRow){
  const b = parseFirstNumber(unitRow && (unitRow.bathrooms||unitRow.baths||unitRow.bath));
  return Number.isFinite(b)? b : null;
}
function getParkingSpaces(unitRow){
  const v = parseFirstNumber(unitRow && (
    unitRow.parking_spaces ||
    unitRow.parkingspaces ||
    unitRow.total_parking_spaces ||
    unitRow.parking
  ));
  return Number.isFinite(v)? v : null;
}
function getMaintenanceFee(unitRow){
  const v = parseFirstNumber(unitRow && (
    unitRow.maintenance_fee ||
    unitRow.maintenancefees ||
    unitRow.maintenance_fees ||
    unitRow.strata_fee
  ));
  return Number.isFinite(v)? v : null;
}
function getYearBuilt(unitRow){
  const v = parseFirstNumber(unitRow && (
    unitRow.year_built ||
    unitRow.yearbuilt ||
    unitRow.completion_year ||
    unitRow.delivery_year
  ));
  return Number.isFinite(v)? v : null;
}
function splitPipeList(v){
  return String(v||'').split('|').map(function(s){ return String(s||'').trim(); }).filter(Boolean);
}
function firstNonEmptyList(){
  for(let i=0;i<arguments.length;i++){
    const arr = splitPipeList(arguments[i]);
    if(arr.length) return arr;
  }
  return [];
}
function getFeatureLists(unitRow){
  return {
    buildingFeatures: firstNonEmptyList(unitRow && (unitRow.building_features || unitRow.buildingfeatures)),
    buildingAmenities: firstNonEmptyList(unitRow && (unitRow.building_amenities || unitRow.buildingamenities)),
    structures: firstNonEmptyList(unitRow && unitRow.structures),
    heating: firstNonEmptyList(unitRow && (unitRow.heating_type || unitRow.heatingtype)),
    community: firstNonEmptyList(unitRow && (unitRow.community_features || unitRow.communityfeatures))
  };
}
function fmtMoneyNoDash(n){
  const v=parseFirstNumber(n);
  return Number.isFinite(v) ? ('$'+v.toLocaleString()) : '';
}

    btnAddCurrent.onclick=()=>{
      if(!(viewSelect.value.startsWith('unit:') || viewSelect.value.startsWith('panorama:'))) return;
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
        const br=b[bIdx], ur=hvGetMarkerEditorTargetsForBuilding(bIdx)[uIdx]||{};
        const price=getCurrentPrice(ur,br);
        const area=getAreaSqft(ur);
        const beds=getBeds(ur);
        const baths=getBaths(ur);
        const parking=getParkingSpaces(ur);
        const fee=getMaintenanceFee(ur);
        const year=getYearBuilt(ur);
        const monthly = Number.isFinite(price) ? -pmt((loan.rate||0)/12, (loan.termY||20)*12, price*(1-(loan.dpct||20)/100)) : NaN;
        const name=ur.unit_name||ur.name||('Unit '+(uIdx+1));
        const buildingName = firstFilled(br && br.name, br && br.title, br && br.building_name, 'Building');
        return {name,buildingName,price,area,beds,baths,parking,fee,year,monthly};
      });
      const head='<tr style="font-weight:700"><td></td><td>Price</td><td>Area</td><td>Beds</td><td>Baths</td><td>Parking</td><td>Fee</td><td>Year</td><td>Monthly</td></tr>';
      const trs=rows.map(r=>`<tr><td><div style="font-weight:700">${r.name}</div><div style="font-size:12px;opacity:.68">${r.buildingName || ''}</div></td><td>${fmtUSD(r.price)}</td><td>${Number.isFinite(r.area)?fmtAreaSqftValue(r.area,1):'—'}</td><td>${r.beds!=null?r.beds:'—'}</td><td>${r.baths!=null?r.baths:'—'}</td><td>${r.parking!=null?r.parking:'—'}</td><td>${fmtMoneyNoDash(r.fee)||'—'}</td><td>${r.year!=null?r.year:'—'}</td><td>${fmtUSD(r.monthly)}</td></tr>`).join('');
      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:700">Compare Units</div>
          <button id="closeModal" class="ui-btn" style="border-radius:10px;padding:6px 10px;cursor:pointer">✕</button>
        </div>
        <div style="overflow:auto;max-height:70vh">
          <table style="width:100%;border-collapse:collapse">${head}${trs || `<tr><td colspan="9" style="opacity:.7">No units added yet</td></tr>`}</table>
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
      const list=hvGetMarkerEditorTargetsForBuilding(bIdx);
      const br=b[bIdx];
      const base=list[uIdx]||{};
      const priceBase=getCurrentPrice(base,br);
      const areaBase=getAreaSqft(base);
      if(!Number.isFinite(priceBase)){ similarBody.innerHTML='<div style="opacity:.7">No similar units found</div>'; return; }

      const priceTol=0.15*priceBase;
      const areaTol = Number.isFinite(areaBase)? Math.max(5,0.15*areaBase) : Infinity;
      const bathsBase=getBaths(base);
      const parkingBase=getParkingSpaces(base);
      const yearBase=getYearBuilt(base);

      const items=[];
      list.forEach((ur,k)=>{
        if(k===uIdx) return;
        if(!isUnitRow(ur)) return;
        const pr=getCurrentPrice(ur,br); if(!Number.isFinite(pr)) return;
        if(Math.abs(pr-priceBase)>priceTol) return;
        const ar=getAreaSqft(ur);
        const ba=getBaths(ur);
        const pk=getParkingSpaces(ur);
        const yr=getYearBuilt(ur);
        if(Number.isFinite(areaBase) && Number.isFinite(ar) && Math.abs(ar-areaBase)>areaTol) return;
        if(bathsBase!=null && ba!=null && Math.abs(ba-bathsBase)>1) return;
        items.push({ur,k,pr,ar,ba,pk,yr});
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
        btn.innerHTML=`<div style="font-weight:600">${nm}</div><div style="font-size:12px;opacity:.8">${fmtUSD(it.pr)} ${Number.isFinite(it.ar)?'• '+fmtAreaSqftValue(it.ar,0):''} ${it.ba!=null?'• '+it.ba+' bath':''} ${it.pk!=null?'• '+it.pk+' parking':''} ${it.yr!=null?'• '+it.yr:''}</div>`;
        btn.onclick=()=>{ viewSelect.value='unit:'+it.k; viewSelect.dispatchEvent(new Event('change')); };
        similarBody.appendChild(btn);
      });
    }

    // ===== Commute =====
    const commuteCard=document.createElement('div');
    commuteCard.className='ui-card';
    commuteCard.style.cssText="border-radius:12px;padding:10px;display:none";
    commuteCard.innerHTML='<div style="font-weight:700;margin-bottom:6px">Commute & Proximity</div><div id="commuteBody" style="display:flex;flex-direction:column;gap:6px"></div>';
    // Commute card removed from Controls UI; times are shown directly on POI labels.
    const commuteBody=commuteCard.querySelector('#commuteBody');
    const SPEED_WALK=4.5/3.6, SPEED_DRIVE=35/3.6;
    const COMMUTE=['school','transit','station','bus','park','hospital','clinic','super','supermarket','cafe'];
    function prettyMin(m){ if(!Number.isFinite(m)) return '—'; if(m<1) return '<1m'; if(m<60) return Math.round(m)+'m'; const h=Math.floor(m/60), mm=Math.round(m%60); return h+'h '+(mm?mm+'m':''); }
    function updateCommute(bIdx){
      commuteBody.innerHTML = '';
      commuteCard.style.display = 'none';
    }

    // ===== Price Insights removed intentionally =====
    const priceCard = { style: { display: 'none' } };
    function renderInsights(){ /* Removed: incomplete area/building averages can mislead users. */ }

    // ===== Mini (city/plan) + floating AI advisor =====
    const mini=(function(){
      const DEFAULT_ANAM_AGENT_ID = 'f2dc1521-b3b7-46b7-92c0-2f6c85cb8617';
      function getAnamAgentIdFromUrl(){
        try{
          const params = new URLSearchParams(window.location.search || '');
          const raw = (params.get('hx') || params.get('ax') || '').trim();
          return raw || DEFAULT_ANAM_AGENT_ID;
        }catch(_){
          return DEFAULT_ANAM_AGENT_ID;
        }
      }
      const ANAM_AGENT_ID = getAnamAgentIdFromUrl();
      let anamScriptPromise = null;
      function ensureAnamWidgetScript(){
        if(window.customElements && window.customElements.get('anam-agent')) return Promise.resolve(true);
        if(anamScriptPromise) return anamScriptPromise;
        anamScriptPromise = new Promise(function(resolve, reject){
          const existing = document.querySelector('script[data-homeview-anam-widget="1"]');
          if(existing){
            existing.addEventListener('load', function(){ resolve(true); }, { once:true });
            existing.addEventListener('error', function(err){ reject(err || new Error('Anam widget failed to load')); }, { once:true });
            return;
          }
          const s = document.createElement('script');
          s.src = 'https://unpkg.com/@anam-ai/agent-widget';
          s.async = true;
          s.dataset.homeviewAnamWidget = '1';
          s.onload = function(){ resolve(true); };
          s.onerror = function(err){ reject(err || new Error('Anam widget failed to load')); };
          document.head.appendChild(s);
        });
        return anamScriptPromise;
      }

      const root=document.createElement('div');
      root.id='miniTopRight';
      root.className='ui-card';
      root.style.cssText="position:fixed;right:16px;top:16px;width:260px;height:260px;border-radius:12px;z-index:2100;overflow:hidden;display:" + (IS_MOBILE ? 'none' : 'block') + ";background:#fff";
      document.body.appendChild(root);

      const stage=document.createElement('div');
      stage.style.cssText='position:absolute;left:0;right:0;top:0;bottom:0;overflow:hidden;background:#fff';
      root.appendChild(stage);

      const cityDiv=document.createElement('div'); cityDiv.style.cssText='position:absolute;inset:0;display:block;background:#fff'; stage.appendChild(cityDiv);
      const map=L.map(cityDiv,{attributionControl:false,zoomControl:false,dragging:true,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,tap:false});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
      const layerBuildings=L.layerGroup().addTo(map);
      const layerSelected=L.layerGroup().addTo(map);
      const layerPois=L.layerGroup().addTo(map);

      let anamAgentEl = null;
      let aiOpen = false;
      const AI_ADVISOR_LIMIT_SECONDS = 180;
      let aiSecondsLeft = AI_ADVISOR_LIMIT_SECONDS;
      let aiTimerInterval = null;
      function formatAiCountdown(totalSeconds){
        const sec = Math.max(0, Number(totalSeconds) || 0);
        const mm = String(Math.floor(sec / 60));
        const ss = String(sec % 60).padStart(2, '0');
        return mm + ':' + ss;
      }
      function stopAiTimer(reset){
        if(aiTimerInterval){ clearInterval(aiTimerInterval); aiTimerInterval = null; }
        if(reset) aiSecondsLeft = AI_ADVISOR_LIMIT_SECONDS;
      }
      function updateAiButton(){
        aiAdvisorBtn.style.background = aiOpen ? '#111' : '#fff';
        aiAdvisorBtn.style.color = aiOpen ? '#fff' : '#111';
        aiAdvisorBtn.textContent = aiOpen ? ('AI Advisor ' + formatAiCountdown(aiSecondsLeft)) : 'AI Advisor';
        aiAdvisorBtn.title = aiOpen ? 'Hide AI advisor' : 'Open AI advisor';
        aiAdvisorBtn.setAttribute('aria-label', aiOpen ? 'Hide AI advisor' : 'Open AI advisor');
      }
      function mountAnamAgent(){
        if(anamAgentEl) return anamAgentEl;
        anamAgentEl = document.createElement('anam-agent');
        anamAgentEl.setAttribute('agent-id', ANAM_AGENT_ID);
        anamAgentEl.style.cssText = 'display:none';
        document.body.appendChild(anamAgentEl);
        return anamAgentEl;
      }
      async function ensureAiAdvisorReady(){
        try{
          await ensureAnamWidgetScript();
          return mountAnamAgent();
        }catch(err){
          console.warn('Failed to load Anam widget:', err);
          return null;
        }
      }
      function startAiTimer(){
        stopAiTimer(true);
        updateAiButton();
        aiTimerInterval = setInterval(function(){
          aiSecondsLeft = Math.max(0, aiSecondsLeft - 1);
          updateAiButton();
          if(aiSecondsLeft <= 0){
            stopAiTimer(true);
            setAiOpen(false);
          }
        }, 1000);
      }
      async function setAiOpen(nextOpen){
        const desired = !!nextOpen;
        const agent = await ensureAiAdvisorReady();
        if(!agent) return false;
        aiOpen = desired;
        agent.style.display = aiOpen ? 'block' : 'none';
        if(aiOpen) startAiTimer();
        else stopAiTimer(true);
        updateAiButton();
        return true;
      }
      setAiAdvisorOpen = function(force){
        if(typeof force === 'boolean') return setAiOpen(force);
        return setAiOpen(!aiOpen);
      };
      updateAiButton();
      aiAdvisorBtn.onclick = function(){ setAiAdvisorOpen(); };

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

      const planDiv=document.createElement('div'); planDiv.style.cssText='position:absolute;inset:0;display:none;background:#fff'; stage.appendChild(planDiv);
      const planInner=document.createElement('div'); planInner.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)'; planDiv.appendChild(planInner);
      const planImg=document.createElement('img'); planImg.style.cssText='display:block;width:100%;height:100%;object-fit:contain'; planInner.appendChild(planImg);
      const planMarker=document.createElement('div'); planMarker.style.cssText='position:absolute;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #d32f2f;transform-origin:50% 60%'; planDiv.appendChild(planMarker);

      let ps={url:'',rot:0,w:10,h:10,cE:0,cN:0,nw:0,nh:0,zoom:1,ready:false,u:null,b:null};
      let currentMiniMode='city';
      function setMode(m){ currentMiniMode = (m==='plan') ? 'plan' : 'city'; cityDiv.style.display=currentMiniMode==='city'?'block':'none'; planDiv.style.display=currentMiniMode==='plan'?'block' : 'none'; }
      function layoutPlan(){ if(!ps.ready) return; const cw=planDiv.clientWidth, ch=planDiv.clientHeight, arI=ps.nw/ps.nh, arC=cw/ch; let dw,dh; if(arI>arC){ dw=cw; dh=cw/arI; } else { dh=ch; dw=ch*arI; } dw*=ps.zoom; dh*=ps.zoom; planInner.style.width=dw+'px'; planInner.style.height=dh+'px'; }
      window.addEventListener('resize',()=>{ layoutPlan(); updatePlanCam(); });

      function enuBasisAt(origin){ const enu=Cesium.Transforms.eastNorthUpToFixedFrame(origin); const east=Cesium.Matrix4.getColumn(enu,0,new Cesium.Cartesian3()); const north=Cesium.Matrix4.getColumn(enu,1,new Cesium.Cartesian3()); const origin3=Cesium.Matrix4.getColumn(enu,3,new Cesium.Cartesian3()); const norm=v=>Cesium.Cartesian3.normalize(v,new Cesium.Cartesian3()); return {east:norm(east), north:norm(north), origin:origin3}; }
      function updatePlanCam(){
        if(!ps.ready || ps.b==null || ps.u==null) return;
        const {east,north,origin} = enuBasisAt(buildingOrigins[ps.b]);
        const cam=viewer.camera.positionWC;
        const v=Cesium.Cartesian3.subtract(cam,origin,new Cesium.Cartesian3());
        const eCam=Cesium.Cartesian3.dot(v,east), nCam=Cesium.Cartesian3.dot(v,north);
        const uRow=hvGetMarkerEditorTargetsForBuilding(ps.b)[ps.u]||{};
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
        // Floorplan/minimap inside unit view has been retired.
        // Minimap is now reserved for Building View city map only.
        setMode('city');
        root.style.display = 'none';
      }

      let raf=false;
      viewer.camera.changed.addEventListener(()=>{ if(root.style.display==='block' && cityDiv.style.display==='block') updateCityCamera(); });
      map.on('click',e=>{ try{ const h=viewer.camera.positionCartographic.height; viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(e.latlng.lng,e.latlng.lat,h), duration:0.6}); }catch(err){} });

      const zb=document.createElement('div'); zb.style.cssText="position:absolute;right:6px;bottom:6px;display:flex;flex-direction:column;gap:6px;z-index:50"; stage.appendChild(zb);
      function zbtn(t,ttl){ const b=document.createElement('button'); b.className='ui-btn'; b.textContent=t; b.title=ttl||''; b.style.cssText='width:28px;height:28px;border-radius:8px;cursor:pointer'; return b;}
      const zp=zbtn('+','Zoom in'), zm=zbtn('−','Zoom out'); zb.appendChild(zp); zb.appendChild(zm);
      zp.onclick=()=>{ if(planDiv.style.display==='block'){ ps.zoom=Math.min(4,ps.zoom*1.25); layoutPlan(); updatePlanCam(); } else { map.zoomIn(1); } };
      zm.onclick=()=>{ if(planDiv.style.display==='block'){ ps.zoom=Math.max(0.5,ps.zoom/1.25); layoutPlan(); updatePlanCam(); } else { map.zoomOut(1); } };

      return {
        root,
        show(){ root.style.display = (!IS_MOBILE && minimapEnabledByUser && currentMode === 'exterior') ? 'block' : 'none'; },
        hide(){ root.style.display='none'; },
        setMode,
        setPane(pane){ if(pane === 'ai'){ setAiAdvisorOpen(true); return; } setMode('city'); },
        showAI(){ setAiAdvisorOpen(true); },
        showMap(){ setMode('city'); },
        refreshCity(idx){
          const row=b[idx]; if(!row) return;
          const lat=toNum(row.lat), lng=toNum(row.lng), radius=getPoiRadiusMeters(row, null, 800);
          try{ map.setView([lat,lng],15); }catch(e){}
          layerSelected.clearLayers(); layerPois.clearLayers();
          L.circle([lat,lng],{radius,color:'#1976d2',weight:1,fill:false}).addTo(layerSelected);
          const cCarto=Cesium.Cartographic.fromDegrees(lng,lat);
          p.forEach(poi=>{
            const plat=toNum(poi.lat), plng=toNum(poi.lng); if(!Number.isFinite(plat)||!Number.isFinite(plng)) return;
            let dist=Infinity; try{ dist=new Cesium.EllipsoidGeodesic(cCarto,Cesium.Cartographic.fromDegrees(plng,plat)).surfaceDistance; }catch(_){ }
            const poiRadius = getPoiRadiusMeters(row, poi, radius);
            if(dist>poiRadius) return;
            const type=(poi.type||'').toLowerCase().trim();
            if(hiddenPoiTypes.has(type)) return;
            const mStyle = getAmenityStyle(type);
            const m=L.circleMarker([plat,plng],{radius:4,color:mStyle.color,weight:1,fillColor:mStyle.color,fillOpacity:0.9});
            if(poi.name) m.bindTooltip(mStyle.icon + ' ' + mStyle.label + '<br>' + poi.name,{direction:'top',offset:[0,-2]});
            m.addTo(layerPois);
          });
          setMode(currentMiniMode);
          try{ map.invalidateSize(); }catch(_){ }
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


    // ===== 3D Label Overlay / Editor =====
    labelEditorState = {
      enabled: false,
      editMode: false,
      pendingPick: false,
      selectedLabelIndex: -1,
      currentSelection: null,
      cache: new Map(),
      entities: []
    };
    navigationLabelsEnabled = true;

    function getSelectionBaseKey(sel){
      if(!sel || sel.isExterior) return '';
      return [sel.bIdx, sel.kind, sel.itemIdx].join(':');
    }
    function getSelectionKey(sel){
      const baseKey = getSelectionBaseKey(sel);
      if(!baseKey) return '';
      if(sel && sel.meta && isPanoramaRow(sel.meta)){
        const sceneKey = getCurrentPanoramaSceneKey(sel) || '__default__';
        return baseKey + '@' + sceneKey;
      }
      return baseKey;
    }
    function parseLabelAnnotations(str){
      if(!str || !String(str).trim()) return [];
      return String(str).split(';').map(function(part){
        const p = part.trim(); if(!p) return null;
        const bits = p.split('|');
        const text = (bits[0]||'').trim();
        const posBits = (bits[1]||'0,0,0').split(',').map(v=>Number(String(v).trim()));
        const x = Number.isFinite(posBits[0]) ? posBits[0] : 0;
        const y = Number.isFinite(posBits[1]) ? posBits[1] : 0;
        const z = Number.isFinite(posBits[2]) ? posBits[2] : 0;
        const scale = Number(bits[2]);
        const color = (bits[3]||'#00ff88').trim() || '#00ff88';
        const actionType = String(bits[4] || 'none').trim() || 'none';
        const actionValue = String(bits[5] || '').trim();
        const roomKey = String(bits[6] || '').trim();
        return {
          text:text||'Label',
          x, y, z,
          scale:Number.isFinite(scale)&&scale>0?scale:1,
          color,
          actionType,
          actionValue,
          roomKey
        };
      }).filter(Boolean);
    }
    function formatLabelAnnotations(items){
      return (items||[]).map(function(it){
        const x = Number(it.x||0).toFixed(2).replace(/\.00$/,'');
        const y = Number(it.y||0).toFixed(2).replace(/\.00$/,'');
        const z = Number(it.z||0).toFixed(2).replace(/\.00$/,'');
        const sc = Number(it.scale||1).toFixed(2).replace(/\.00$/,'');
        const roomKey = String(it.roomKey || '').replace(/[;|]/g,' ').trim();
        const arr = [
          String(it.text||'Label').replace(/[;|]/g,' ').trim(),
          [x,y,z].join(','),
          sc,
          it.color||'#00ff88',
          String(it.actionType||'none').replace(/[;|]/g,' ').trim() || 'none',
          String(it.actionValue||'').replace(/[;]/g,' ').trim()
        ];
        if(roomKey) arr.push(roomKey);
        return arr.join('|');
      }).join('; ');
    }
    function normalizeLabelColor(v){
      const s = String(v || '').trim();
      return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#00ff88';
    }
    function getPanoramaSceneLabelMapForSelection(sel){
      if(!sel || !sel.meta || !isPanoramaRow(sel.meta)) return null;
      const baseKey = getSelectionBaseKey(sel);
      if(!baseKey) return null;
      const mapKey = baseKey + '@@sceneMap';
      if(!labelEditorState.cache.has(mapKey)){
        const meta = sel.meta || {};
        const sceneMap = parsePanoramaSceneLabelAnnotations(getRawPanoramaSceneAnnotationString(meta));
        if(!Object.keys(sceneMap).length){
          const defaultSceneKey = getCurrentPanoramaSceneKey(sel) || '__default__';
          const legacy = parseLabelAnnotations(firstFilled(meta.label_annotations, meta.labels_3d, meta.text_annotations, meta.annotation_labels));
          sceneMap[defaultSceneKey] = legacy;
        }
        labelEditorState.cache.set(mapKey, sceneMap);
      }
      return labelEditorState.cache.get(mapKey);
    }
    function getCurrentSelectionLabels(){
      const sel = labelEditorState.currentSelection;
      const key = getSelectionKey(sel);
      if(!key) return [];
      if(sel && sel.meta && isPanoramaRow(sel.meta)){
        const sceneMap = getPanoramaSceneLabelMapForSelection(sel) || {};
        const sceneKey = getCurrentPanoramaSceneKey(sel) || '__default__';
        if(!Array.isArray(sceneMap[sceneKey])) sceneMap[sceneKey] = [];
        labelEditorState.cache.set(key, sceneMap[sceneKey]);
        return sceneMap[sceneKey];
      }
      if(!labelEditorState.cache.has(key)){
        const meta = sel.meta || {};
        const raw = firstFilled(meta.label_annotations, meta.labels_3d, meta.text_annotations, meta.annotation_labels);
        labelEditorState.cache.set(key, parseLabelAnnotations(raw));
      }
      return labelEditorState.cache.get(key);
    }
    function setCurrentSelectionLabels(items){
      const sel = labelEditorState.currentSelection;
      const key = getSelectionKey(sel);
      if(!key) return;
      const clean = (items||[]).map(function(it){
        return {
          text:String(it.text||'Label'),
          x:Number(it.x)||0,
          y:Number(it.y)||0,
          z:Number(it.z)||0,
          scale:(Number(it.scale)>0?Number(it.scale):1),
          color:it.color||'#00ff88',
          actionType:String(it.actionType || 'none'),
          actionValue:String(it.actionValue || ''),
          roomKey:normalizeLabelRoomKey(it.roomKey || '')
        };
      });
      labelEditorState.cache.set(key, clean);
      if(sel && sel.meta){
        if(isPanoramaRow(sel.meta)){
          const sceneMap = getPanoramaSceneLabelMapForSelection(sel) || {};
          const sceneKey = getCurrentPanoramaSceneKey(sel) || '__default__';
          sceneMap[sceneKey] = clean;
          const sceneString = formatLabelAnnotations(clean);
          const allScenesString = formatPanoramaSceneLabelAnnotations(sceneMap);
          sel.meta.panorama_label_annotations = allScenesString;
          sel.meta.panorama_labels = allScenesString;
          sel.meta.current_scene_label_annotations = sceneString;
          sel.meta.label_annotations = allScenesString;
          sel.meta.labels_3d = allScenesString;
          sel.meta.text_annotations = allScenesString;
          sel.meta.annotation_labels = allScenesString;
          labelsExportBox.value = allScenesString;
          return;
        }
        const labelString = formatLabelAnnotations(clean);
        sel.meta.label_annotations = labelString;
        sel.meta.labels_3d = labelString;
        sel.meta.text_annotations = labelString;
        sel.meta.annotation_labels = labelString;
        labelsExportBox.value = labelString;
      }
    }
    function clearRenderedLabels(){
      while(labelEditorState.entities.length){
        const e = labelEditorState.entities.pop();
        try{ viewer.entities.remove(e); }catch(_){ }
      }
    }
    function getLabelMaxViewDistanceM(sel){
      const meta = (sel && sel.meta) ? sel.meta : {};
      const v = firstFilled(
        meta.label_max_view_distance_m,
        meta.label_view_distance_m,
        meta.labels_max_view_distance_m,
        meta.labels_view_distance_m,
        meta.max_label_distance_m,
        meta.view_distance_m
      );
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 8;
    }
    function getSelectionLabelDistanceValue(sel){
      const meta = (sel && sel.meta) ? sel.meta : {};
      const n = Number(firstFilled(
        meta.label_max_view_distance_m,
        meta.label_view_distance_m,
        meta.labels_max_view_distance_m,
        meta.labels_view_distance_m,
        meta.max_label_distance_m,
        meta.view_distance_m
      ));
      return Number.isFinite(n) && n > 0 ? Math.min(50, Math.max(0.5, n)) : 8;
    }
    function updateLabelDistanceUI(sel){
      const v = getSelectionLabelDistanceValue(sel || labelEditorState.currentSelection);
      if(labelDistanceRange) labelDistanceRange.value = String(v);
      if(labelDistanceValue) labelDistanceValue.textContent = v.toFixed(v % 1 ? 1 : 0) + ' m';
    }
    function getSelectionAnchor(sel){
      if(!sel || sel.isExterior) return null;
      let ent = null;
      try{
        if(activeRoomModelState && activeRoomModelState.handle && activeRoomModelState.handle.modelPrimitive){
          ent = activeRoomModelState.handle.anchorEntity || activeRoomModelState.handle;
        }
      }catch(_){ }
      if(!ent) ent = (interiorEntitiesByBuilding[sel.bIdx]||[])[sel.itemIdx] || null;
      let pos = null, q = null;
      const now = Cesium.JulianDate.now();
      if(ent && ent.position){
        try{ pos = ent.position.getValue(now); }catch(_){ }
        try{ q = ent.orientation && ent.orientation.getValue ? ent.orientation.getValue(now) : null; }catch(_){ }
      }
      if(!pos){
        const br = b[sel.bIdx] || {};
        const m = sel.meta || {};
        const baseLon=toNum(br.lng), baseLat=toNum(br.lat), baseH=toNum(br.height)||20;
        const surfaceH = 0;
        pos = placeWithEnuOffset(baseLon,baseLat,surfaceH + baseH,toNum(m.offset_east_m)||0,toNum(m.offset_north_m)||0,toNum(m.offset_up_m)||0);
      }
      if(!q){
        const br = b[sel.bIdx] || {};
        const m = sel.meta || {};
        const hd=parseFirstNumber(m.heading!=null?m.heading:br.heading)||0;
        const hpr=new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(hd), Cesium.Math.toRadians(toNum(m.pitch)||0), Cesium.Math.toRadians(toNum(m.roll)||0));
        q = Cesium.Transforms.headingPitchRollQuaternion(pos,hpr);
      }
      const rot = Cesium.Matrix3.fromQuaternion(q, new Cesium.Matrix3());
      const matrix = Cesium.Matrix4.fromRotationTranslation(rot, pos, new Cesium.Matrix4());
      const inv = Cesium.Matrix4.inverseTransformation(matrix, new Cesium.Matrix4());
      return { pos, q, matrix, inv };
    }
    function updatePanoramaLabelUiHints(){
      const sel = labelEditorState.currentSelection;
      const isPano = !!(sel && sel.meta && isPanoramaRow(sel.meta));
      const roomItems = (sel && sel.meta) ? parseRoomModelItems(sel.meta, sel.row) : [];
      const actionType = labelActionTypeSelect ? String(labelActionTypeSelect.value || 'none') : 'none';
      if(labelActionValueList) labelActionValueList.innerHTML = '';
      if(actionType === 'open_panorama'){
        if(labelActionValueInput) labelActionValueInput.placeholder = 'e.g. kitchen';
      }else if(actionType === 'open_room_model'){
        if(labelActionValueInput) labelActionValueInput.placeholder = roomItems.length ? 'e.g. ' + roomItems[0].key : 'room key from room_model_items';
      }else{
        if(labelActionValueInput) labelActionValueInput.placeholder = '';
      }
      if(labelCurrentSceneHint) labelCurrentSceneHint.style.display = (isPano || roomItems.length) ? 'block' : 'none';
      if(isPano){
        const active = getActivePanoramaItemForSelection(sel);
        if(labelCurrentSceneHint) labelCurrentSceneHint.textContent = 'Current panorama scene: ' + (active ? (active.title || active.key) : '—');
        const cfg = getPanoramaConfig(sel.meta, sel.row);
        (cfg.items || []).forEach(function(it){
          const op = document.createElement('option');
          op.value = String(it.key || it.title || '');
          op.label = String(it.title || it.key || '');
          labelActionValueList.appendChild(op);
        });
      }else if(roomItems.length){
        if(labelCurrentSceneHint) labelCurrentSceneHint.textContent = 'Available room models: ' + roomItems.map(function(it){ return it.label + ' (' + it.key + ')'; }).join(', ');
        roomItems.forEach(function(it){
          const op = document.createElement('option');
          op.value = String(it.key || '');
          op.label = String(it.label || it.key || '');
          labelActionValueList.appendChild(op);
        });
      }else{
        if(labelCurrentSceneHint) labelCurrentSceneHint.textContent = 'Current panorama scene: —';
      }
    }

    
    function hvIsNavigationLabelItem(it){
      const actionType = String(it && it.actionType || 'none').trim();
      return !!(actionType && actionType !== 'none');
    }
    function hvApplyLabelEntityVisibility(){
      try{
        const labelsOn = !!((typeof infoLabelsEnabled !== 'undefined') ? infoLabelsEnabled : false);
        const navOn = !!((typeof navigationLabelsEnabled !== 'undefined') ? navigationLabelsEnabled : true);
        (labelEditorState.entities || []).forEach(function(ent){
          try{
            const kind = ent && ent.properties && ent.properties.hvLabelKind && ent.properties.hvLabelKind.getValue
              ? String(ent.properties.hvLabelKind.getValue() || '')
              : '';
            const shouldShow = kind === 'navigation' ? navOn : labelsOn;
            ent.show = shouldShow;
            if(ent.label) ent.label.show = shouldShow;
          }catch(_){}
        });
        requestSceneRenderBurst(3);
      }catch(e){ console.warn('Apply label entity visibility failed:', e); }
    }
    // Compatibility aliases for previous generated typos.
    var hvApplyLabelEntityVisiibility = hvApplyLabelEntityVisibility;
    var hvApplyLabelEntityVisiblity = hvApplyLabelEntityVisibility;



    // Compatibility alias for older generated builds / typos.
function renderSelectionLabels(){
      clearRenderedLabels();

      const sel = (typeof hvEnsureCurrentLabelSelectionForActiveInterior === 'function'
        ? hvEnsureCurrentLabelSelectionForActiveInterior()
        : null) || labelEditorState.currentSelection;

      if(!sel || sel.isExterior) return;
      const anchor = getSelectionAnchor(sel); if(!anchor) return;

      // Render all labels for the active room, then direct-apply visibility by kind.
      // This makes the external buttons reliable even without opening the editor.
      const items = getCurrentSelectionLabels().filter(function(it){
        if(typeof labelBelongsToActiveRoom === 'function' && !labelBelongsToActiveRoom(it)) return false;
        return true;
      });

      items.forEach(function(it){
        const isNav = hvIsNavigationLabelItem(it);
        const kind = isNav ? 'navigation' : 'info';
        const local = new Cesium.Cartesian3(Number(it.x)||0, Number(it.y)||0, Number(it.z)||0);
        const world = Cesium.Matrix4.multiplyByPoint(anchor.matrix, local, new Cesium.Cartesian3());
        const col = Cesium.Color.fromCssColorString(it.color||'#00ff88');
        const e = viewer.entities.add({
          position: world,
          show: kind === 'navigation' ? !!navigationLabelsEnabled : !!infoLabelsEnabled,
          label: {
            text: String(it.text||'Label'),
            font: Math.max(14, Math.round((Number(it.scale)||1)*18)) + 'px sans-serif',
            fillColor: col,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground: false,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, getLabelMaxViewDistanceM(sel)),
            scale: 1.0,
            show: kind === 'navigation' ? !!navigationLabelsEnabled : !!infoLabelsEnabled
          },
          properties: {
            hvLabelActionType: String(it.actionType || 'none'),
            hvLabelActionValue: String(it.actionValue || ''),
            hvLabelText: String(it.text || 'Label'),
            hvLabelKind: kind
          }
        });
        labelEditorState.entities.push(e);
      });
      hvApplyLabelEntityVisibility();
    }
    refreshLabelListUI = function(){
      const items = getCurrentSelectionLabels();
      if(labelEditorState.currentSelection && labelEditorState.currentSelection.meta && isPanoramaRow(labelEditorState.currentSelection.meta)) {
        labelsExportBox.value = firstFilled(labelEditorState.currentSelection.meta.panorama_label_annotations, labelEditorState.currentSelection.meta.panorama_labels, formatLabelAnnotations(items));
      } else {
        labelsExportBox.value = formatLabelAnnotations(items);
      }
      updatePanoramaLabelUiHints();
      labelList.innerHTML='';
      items.forEach(function(it, idx){
        const btn = document.createElement('button');
        btn.className='ui-btn';
        btn.style.cssText='text-align:left;border-radius:10px;padding:8px;cursor:pointer';
        if(idx===labelEditorState.selectedLabelIndex) btn.style.background='#eef6ff';
        const actionNote = (it.actionType && it.actionType !== 'none')
          ? (' • action ' + it.actionType + (it.actionValue ? ' → ' + it.actionValue : ''))
          : '';
        const roomNote = it.roomKey ? (' • room ' + it.roomKey) : ' • room main';
        btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-weight:600">'+(it.text||('Label '+(idx+1)))+'</div><div style="width:14px;height:14px;border-radius:999px;border:1px solid #bbb;flex:0 0 auto;background:'+(it.color||'#00ff88')+'"></div></div><div style="font-size:12px;opacity:.8">x '+Number(it.x).toFixed(2)+' • y '+Number(it.y).toFixed(2)+' • z '+Number(it.z).toFixed(2)+' • scale '+Number(it.scale||1).toFixed(2)+ actionNote + roomNote +'</div>';
        btn.onclick=function(){
          labelEditorState.selectedLabelIndex = idx;
          labelTextInput.value = it.text||'';
          labelRaiseInput.value = Number(it.z||0).toFixed(2).replace(/\.00$/,'');
          labelScaleInput.value = Number(it.scale||1).toFixed(2).replace(/\.00$/,'');
          if(labelColorInput) labelColorInput.value = normalizeLabelColor(it.color || '#00ff88');
          if(labelActionTypeSelect) labelActionTypeSelect.value = String(it.actionType || 'none');
          if(labelActionValueInput) labelActionValueInput.value = String(it.actionValue || '');
          labelEditorStatus.textContent = 'Selected label #' + (idx+1) + ' — position is already stored; click Pick label position to move it.';
          refreshLabelListUI();
        };
        labelList.appendChild(btn);
      });
      if(!items.length) labelList.innerHTML='<div style="font-size:12px;color:#666">No labels yet for this item.</div>';
      updateLabelDistanceUI(labelEditorState.currentSelection);
      renderSelectionLabels();
    }
    function syncLabelToolsVisibility(){
      const sel = labelEditorState.currentSelection;
      const usable = !!sel && !sel.isExterior;
      const admin = isEditorAdmin();

      if(headerLabelsWrap) headerLabelsWrap.style.display = 'none';

      updateAdminEditorButtonsVisibility();
      syncQuickShowLabelsButton();
      labelToolsCard.style.display = (usable && admin && labelEditorPanelOpen) ? 'flex' : 'none';
      adminUnitEditorCard.style.display = (usable && admin && descriptionEditorPanelOpen) ? 'flex' : 'none';
      try{
        const markerUsable = !!(sel && sel.meta && isMarkerEditableKind(sel.kind) && admin);
        unitMarkerTunerCard.style.display = (admin && markerEditorPanelOpen) ? 'flex' : 'none';
        if(admin) rebuildMarkerTargetListForCurrentBuilding();
      }catch(_){ }
      if(!usable){
        try{ if(markerEditorModeActive) exitMarkerEditorMode(); }catch(_){ }
        if(!markerEditorPanelOpen) { try{ unitMarkerTunerCard.style.display = 'none'; }catch(_){ } }
        showLabelsToggle.checked = false;
        labelEditorState.editMode = false;
        labelEditorState.pendingPick = false;
        editLabelsBtn.style.display = 'none';
        labelEditorBody.style.display='none';
        clearRenderedLabels();
        return;
      }

      editLabelsBtn.style.display = admin ? 'inline-flex' : 'none';

      if(!admin){
        try{ if(markerEditorModeActive) exitMarkerEditorMode(); }catch(_){ }
        try{ unitMarkerTunerCard.style.display = 'none'; }catch(_){ }
        labelEditorState.editMode = false;
        labelEditorState.pendingPick = false;
        labelEditorBody.style.display='none';
        editLabelsBtn.textContent = 'Edit labels';
        refreshLabelListUI();
        return;
      }

      editLabelsBtn.textContent = labelEditorState.editMode ? 'Close editor' : 'Edit labels';
      labelEditorBody.style.display = labelEditorState.editMode ? 'flex' : 'none';
      refreshLabelListUI();
    }
    showLabelsToggle.checked = false;
    showLabelsToggle.addEventListener('change', function(){ infoLabelsEnabled = !!showLabelsToggle.checked; renderSelectionLabels(); hvApplyLabelEntityVisibility(); syncQuickShowLabelsButton(); });
    labelDistanceRange.addEventListener('input', function(){
      const sel = labelEditorState.currentSelection;
      const v = Math.min(50, Math.max(0.5, Number(labelDistanceRange.value)||8));
      labelDistanceValue.textContent = v.toFixed(v % 1 ? 1 : 0) + ' m';
      if(sel && sel.meta){
        sel.meta.label_max_view_distance_m = String(v);
        sel.meta.label_view_distance_m = String(v);
      }
      renderSelectionLabels();
    });
    showFutureProjectsToggle.checked = false;
    showFutureProjectsToggle.addEventListener('change', async function(){
      if(futureProjectsChipBtn) futureProjectsChipBtn.dataset.enabled = showFutureProjectsToggle.checked ? '1' : '0';
      syncFutureProjectsChip();
      if(!showFutureProjectsToggle.checked){
        clearAllFutureProjectEntities();
        return;
      }
      await refreshFutureProjects(Number(selectBox.value||0));
    });
    editLabelsBtn.onclick = function(){
      if(!isEditorAdmin()){
        labelEditorState.editMode = false;
        labelEditorState.pendingPick = false;
        labelEditorBody.style.display = 'none';
        return;
      }
      labelEditorState.editMode = !labelEditorState.editMode;
      if(!labelEditorState.editMode) labelEditorState.pendingPick = false;
      syncLabelToolsVisibility();
    };
    function commitSelectedLabelFormChanges(){
      const items = getCurrentSelectionLabels().slice();
      const idx = labelEditorState.selectedLabelIndex;
      if(idx < 0 || idx >= items.length) return;
      const it = items[idx];
      it.text = String(labelTextInput.value || '').trim() || 'Label';
      it.z = Number(labelRaiseInput.value || 0) || 0;
      it.scale = Math.max(0.1, Number(labelScaleInput.value || 1) || 1);
      it.color = normalizeLabelColor(labelColorInput.value || '#00ff88');
      it.actionType = String(labelActionTypeSelect.value || 'none');
      it.actionValue = String(labelActionValueInput.value || '').trim();
      setCurrentSelectionLabels(items);
      refreshLabelListUI();
    }
    [labelTextInput, labelRaiseInput, labelScaleInput, labelColorInput, labelActionTypeSelect, labelActionValueInput].forEach(function(el){
      if(!el) return;
      el.addEventListener('input', commitSelectedLabelFormChanges);
      el.addEventListener('change', commitSelectedLabelFormChanges);
    });

    newLabelBtn.onclick = function(){
      labelEditorState.selectedLabelIndex = -1;
      labelTextInput.value = '';
      labelRaiseInput.value = '0';
      labelScaleInput.value = '1';
      if(labelColorInput) labelColorInput.value = '#00ff88';
      if(labelActionTypeSelect) labelActionTypeSelect.value = 'none';
      if(labelActionValueInput) labelActionValueInput.value = '';
      labelEditorStatus.textContent = 'New label ready — click Pick label position.';
      refreshLabelListUI();
    };
    deleteLabelBtn.onclick = function(){
      const items = getCurrentSelectionLabels().slice();
      const idx = labelEditorState.selectedLabelIndex;
      if(idx<0 || idx>=items.length) return;
      items.splice(idx,1);
      labelEditorState.selectedLabelIndex = -1;
      setCurrentSelectionLabels(items);
      labelEditorStatus.textContent = 'Selected label deleted.';
      refreshLabelListUI();
    };
    pickLabelBtn.onclick = function(){
      if(!labelEditorState.currentSelection || labelEditorState.currentSelection.isExterior) return;
      labelEditorState.pendingPick = true;
      labelEditorStatus.textContent = 'Now click directly on the current interior surface to place the label.';
    };
    function getActiveInteriorHandleForLabelPlacement(){
      if(!activeInteriorSelection) return null;
      try{
        if(activeRoomModelState && activeRoomModelState.handle && activeRoomModelState.handle.modelPrimitive){
          return activeRoomModelState.handle;
        }
      }catch(_){ }
      const arr = interiorEntitiesByBuilding[activeInteriorSelection.bIdx] || [];
      return arr[activeInteriorSelection.itemIdx] || null;
    }
    function isPickedFromActiveInterior(picked, handle){
      if(!picked || !handle || !handle.modelPrimitive) return false;
      if(picked.primitive === handle.modelPrimitive) return true;
      const detail = picked.detail || picked.content || null;
      if(detail){
        if(detail.model === handle.modelPrimitive) return true;
        if(detail.primitive === handle.modelPrimitive) return true;
        if(detail.pickPrimitive === handle.modelPrimitive) return true;
      }
      if(picked.id && handle.anchorEntity && picked.id === handle.anchorEntity) return true;
      return false;
    }
    function handleLabelPlacement(screenPos){
      if(!labelEditorState.pendingPick) return false;
      const sel = labelEditorState.currentSelection;
      if(!sel || sel.isExterior) return false;
      const activeHandle = getActiveInteriorHandleForLabelPlacement();
      if(!activeHandle || !activeHandle.modelPrimitive){
        labelEditorStatus.textContent = 'Current interior model is not ready for label placement yet.';
        return true;
      }
      const scene = viewer.scene;
      const picked = scene.pick(screenPos);
      if(!isPickedFromActiveInterior(picked, activeHandle)){
        labelEditorStatus.textContent = 'Click directly on the current interior model, not outside surfaces.';
        return true;
      }
      if(!scene.pickPositionSupported){
        labelEditorStatus.textContent = 'This browser does not support precise 3D label placement.';
        return true;
      }
      let world = null;
      try{ world = scene.pickPosition(screenPos); }catch(_){ }
      if(!Cesium.defined(world)){
        labelEditorStatus.textContent = 'Could not read that surface position. Try another point on the interior model.';
        return true;
      }
      const anchor = getSelectionAnchor(sel);
      if(!anchor){
        labelEditorStatus.textContent = 'Could not resolve the local anchor for this item.';
        return true;
      }
      const local = Cesium.Matrix4.multiplyByPoint(anchor.inv, world, new Cesium.Cartesian3());
      const items = getCurrentSelectionLabels().slice();
      const idx = labelEditorState.selectedLabelIndex;
      const item = {
        text: String(labelTextInput.value||'Label').trim() || 'Label',
        x: Number(local.x)||0,
        y: Number(local.y)||0,
        z: (Number(local.z)||0) + (Number(labelRaiseInput.value)||0),
        scale: Number(labelScaleInput.value)>0 ? Number(labelScaleInput.value) : 1,
        color: normalizeLabelColor(labelColorInput && labelColorInput.value),
        actionType: String(labelActionTypeSelect && labelActionTypeSelect.value || 'none').trim() || 'none',
        actionValue: String(labelActionValueInput && labelActionValueInput.value || '').trim(),
        roomKey: normalizeLabelRoomKey(getActiveRoomContextKey())
      };
      if(idx>=0 && idx<items.length){ items[idx] = item; }
      else { items.push(item); labelEditorState.selectedLabelIndex = items.length-1; }
      setCurrentSelectionLabels(items);
      labelEditorState.pendingPick = false;
      labelEditorStatus.textContent = 'Label saved for current item.';
      refreshLabelListUI();
      requestSceneRenderBurst(3);
      return true;
    }

function populateAdminEditor(meta, row){
  if(!meta) return;
  adminAreaInput.value = firstFilled(meta.square_footage, meta.area, meta.area_m2, meta.area_sqm, meta.area_sqft);
  adminPriceInput.value = firstFilled(meta.list_price, meta.price, meta.estimated_price_unit, meta.estimated_price);
  adminBedsInput.value = firstFilled(meta.bedrooms, meta.beds, meta.bed);
  adminBathsInput.value = firstFilled(meta.bathrooms, meta.baths, meta.bath);
  adminMaintenanceInput.value = firstFilled(meta.maintenance_fee, meta.maintenance_fees, meta.strata_fee);
  adminParkingInput.value = firstFilled(meta.parking_spaces, meta.total_parking_spaces, meta.parking);
  adminYearInput.value = firstFilled(meta.year_built, meta.completion_year, meta.delivery_year);
  adminForecastInput.value = firstFilled(meta.estimated_price, meta.rate_scenarios, row && row.estimated_price);
  adminDescInput.value = getItemDescription(meta, row);
  adminBuildingFeaturesInput.value = firstFilled(meta.building_features);
  adminBuildingAmenitiesInput.value = firstFilled(meta.building_amenities);
  adminStructuresInput.value = firstFilled(meta.structures);
  adminHeatingInput.value = firstFilled(meta.heating_type);
  adminCommunityInput.value = firstFilled(meta.community_features);
}


async function saveEditorPayloadToSheet(payload){
  try{
    const response = await fetchAdminJson('save_interior_updates', payload);
    return response;
  }catch(err){
    return { ok:false, error: String(err && err.message ? err.message : err) };
  }
}
function buildEditorSavePayload(){
  const sel = labelEditorState.currentSelection;
  if(!sel || sel.isExterior || !sel.meta) return null;

  const meta = sel.meta || {};
  const row = sel.row || {};
  const buildingKey = firstFilled(meta.building_key, meta.parent, row.building_key, row.name, row.title);
  const unitName = firstFilled(meta.unit_name, meta.name, meta.title, meta.unit, meta.unit_number);
  const labelString = formatLabelAnnotations(getCurrentSelectionLabels());
  const panoSceneString = (sel.meta && isPanoramaRow(sel.meta)) ? getRawPanoramaSceneAnnotationString(sel.meta) : '';
  const distanceString = String(Math.min(50, Math.max(0.5, Number(labelDistanceRange.value)||8)));

  if(!hasTextValue(buildingKey) || !hasTextValue(unitName)) return null;

  return {
    building_key: buildingKey,
    building_name: firstFilled(row.name, row.title, buildingKey),
    unit_name: unitName,
    unit: unitName,
    unit_number: unitName,
    name: unitName,
    title: unitName,
    kind: sel.kind || 'unit',
    updates: {
      description: adminDescInput.value.trim(),
      desc: adminDescInput.value.trim(),
      about: adminDescInput.value.trim(),

      square_footage: adminAreaInput.value.trim(),
      area: adminAreaInput.value.trim(),
      area_m2: adminAreaInput.value.trim(),
      area_sqm: adminAreaInput.value.trim(),

      price: adminPriceInput.value.trim(),
      list_price: adminPriceInput.value.trim(),
      estimated_price_unit: adminPriceInput.value.trim(),

      beds: adminBedsInput.value.trim(),
      bedrooms: adminBedsInput.value.trim(),

      bathrooms: adminBathsInput.value.trim(),
      baths: adminBathsInput.value.trim(),

      maintenance_fee: adminMaintenanceInput.value.trim(),
      maintenance_fees: adminMaintenanceInput.value.trim(),
      strata_fee: adminMaintenanceInput.value.trim(),

      parking_spaces: adminParkingInput.value.trim(),
      total_parking_spaces: adminParkingInput.value.trim(),
      parking: adminParkingInput.value.trim(),

      year_built: adminYearInput.value.trim(),
      completion_year: adminYearInput.value.trim(),
      delivery_year: adminYearInput.value.trim(),

      estimated_price: adminForecastInput.value.trim(),
      rate_scenarios: adminForecastInput.value.trim(),

      building_features: adminBuildingFeaturesInput.value.trim(),
      building_amenities: adminBuildingAmenitiesInput.value.trim(),
      structures: adminStructuresInput.value.trim(),
      heating_type: adminHeatingInput.value.trim(),
      community_features: adminCommunityInput.value.trim(),

      label_annotations: (sel.meta && isPanoramaRow(sel.meta)) ? panoSceneString : labelString,
      labels_3d: (sel.meta && isPanoramaRow(sel.meta)) ? panoSceneString : labelString,
      text_annotations: (sel.meta && isPanoramaRow(sel.meta)) ? panoSceneString : labelString,
      annotation_labels: (sel.meta && isPanoramaRow(sel.meta)) ? panoSceneString : labelString,
      current_scene_label_annotations: labelString,
      panorama_label_annotations: panoSceneString,
      panorama_labels: panoSceneString,

      label_max_view_distance_m: distanceString,
      label_view_distance_m: distanceString,
      labels_max_view_distance_m: distanceString,
      labels_view_distance_m: distanceString
    }
  };
}

adminSaveBtn.onclick = async function(){
  const sel = labelEditorState.currentSelection;
  if(!isEditorAdmin()){
    adminEditorStatus.textContent = 'Admin access required.';
    return;
  }
  if(!sel || sel.isExterior || !sel.meta){
    adminEditorStatus.textContent = 'No editable unit selected.';
    return;
  }

  adminApplyBtn.click();

  const payload = buildEditorSavePayload();
  if(!payload){
    adminEditorStatus.textContent = 'Unable to build save payload for this item.';
    return;
  }

  adminSaveBtn.disabled = true;
  adminSaveBtn.textContent = 'Saving...';
  adminEditorStatus.textContent = 'Saving changes...';

  try{
    const result = await saveEditorPayloadToSheet(payload);
    if(result && result.ok){
      adminEditorStatus.textContent = 'Saved successfully.';
      adminSaveBtn.textContent = 'Saved ✓';
      setTimeout(function(){
        adminSaveBtn.disabled = false;
        adminSaveBtn.textContent = 'Save changes';
      }, 1200);
    }else{
      adminEditorStatus.textContent = 'Save failed: ' + ((result && result.error) || 'Unknown error');
      adminSaveBtn.disabled = false;
      adminSaveBtn.textContent = 'Save changes';
    }
  }catch(err){
    adminEditorStatus.textContent = 'Save failed: ' + err;
    adminSaveBtn.disabled = false;
    adminSaveBtn.textContent = 'Save changes';
  }
};

adminApplyBtn.onclick = function(){
  const sel = labelEditorState.currentSelection;
  if(!sel || sel.isExterior || !sel.meta) return;
  const meta = sel.meta;
  const labelString = formatLabelAnnotations(getCurrentSelectionLabels());
  const panoSceneString = (meta && isPanoramaRow(meta)) ? getRawPanoramaSceneAnnotationString(meta) : '';
  const distanceString = String(Math.min(50, Math.max(0.5, Number(labelDistanceRange.value)||8)));

  meta.area = adminAreaInput.value.trim();
  meta.square_footage = adminAreaInput.value.trim();
  meta.area_m2 = adminAreaInput.value.trim();
  meta.area_sqm = adminAreaInput.value.trim();

  meta.price = adminPriceInput.value.trim();
  meta.list_price = adminPriceInput.value.trim();
  meta.estimated_price_unit = adminPriceInput.value.trim();

  meta.beds = adminBedsInput.value.trim();
  meta.bedrooms = adminBedsInput.value.trim();

  meta.bathrooms = adminBathsInput.value.trim();
  meta.baths = adminBathsInput.value.trim();

  meta.maintenance_fee = adminMaintenanceInput.value.trim();
  meta.maintenance_fees = adminMaintenanceInput.value.trim();
  meta.strata_fee = adminMaintenanceInput.value.trim();

  meta.parking_spaces = adminParkingInput.value.trim();
  meta.total_parking_spaces = adminParkingInput.value.trim();
  meta.parking = adminParkingInput.value.trim();

  meta.year_built = adminYearInput.value.trim();
  meta.completion_year = adminYearInput.value.trim();
  meta.delivery_year = adminYearInput.value.trim();

  meta.estimated_price = adminForecastInput.value.trim();
  meta.rate_scenarios = adminForecastInput.value.trim();

  meta.description = adminDescInput.value;
  meta.desc = adminDescInput.value;
  meta.about = adminDescInput.value;

  meta.building_features = adminBuildingFeaturesInput.value.trim();
  meta.building_amenities = adminBuildingAmenitiesInput.value.trim();
  meta.structures = adminStructuresInput.value.trim();
  meta.heating_type = adminHeatingInput.value.trim();
  meta.community_features = adminCommunityInput.value.trim();

  if(isPanoramaRow(meta)){
    meta.current_scene_label_annotations = labelString;
    meta.label_annotations = panoSceneString || labelString;
    meta.labels_3d = panoSceneString || labelString;
    meta.text_annotations = panoSceneString || labelString;
    meta.annotation_labels = panoSceneString || labelString;
    meta.panorama_label_annotations = panoSceneString;
    meta.panorama_labels = panoSceneString;
    labelsExportBox.value = panoSceneString || labelString;
  } else {
    meta.label_annotations = labelString;
    meta.labels_3d = labelString;
    meta.text_annotations = labelString;
    meta.annotation_labels = labelString;
    labelsExportBox.value = labelString;
  }

  meta.label_max_view_distance_m = distanceString;
  meta.label_view_distance_m = distanceString;
  meta.labels_max_view_distance_m = distanceString;
  meta.labels_view_distance_m = distanceString;

  adminEditorStatus.textContent = 'Changes applied locally. Press Save changes to persist them.';
  updateView(Number(selectBox.value));
};


if(saveLabelsBtn){
  saveLabelsBtn.onclick = async function(){
    if(!isEditorAdmin()) return;
    if(!labelEditorState || !labelEditorState.currentSelection || labelEditorState.currentSelection.isExterior){
      labelEditorStatus.textContent = 'Select a unit or amenity first.';
      return;
    }
    try{ adminApplyBtn.onclick && adminApplyBtn.onclick(); }catch(_){ }
    const payload = buildEditorSavePayload();
    if(!payload){
      labelEditorStatus.textContent = 'Unable to build save payload for labels.';
      return;
    }
    saveLabelsBtn.disabled = true;
    saveLabelsBtn.textContent = 'Saving...';
    labelEditorStatus.textContent = 'Saving labels...';
    try{
      const result = await saveEditorPayloadToSheet(payload);
      if(result && result.ok){
        labelEditorStatus.textContent = 'Labels saved successfully.';
        saveLabelsBtn.textContent = 'Saved ✓';
        setTimeout(function(){ saveLabelsBtn.disabled = false; saveLabelsBtn.textContent = 'Save labels'; }, 1200);
      }else{
        labelEditorStatus.textContent = 'Save failed: ' + ((result && result.error) || 'Unknown error');
        saveLabelsBtn.disabled = false;
        saveLabelsBtn.textContent = 'Save labels';
      }
    }catch(err){
      labelEditorStatus.textContent = 'Save failed: ' + err;
      saveLabelsBtn.disabled = false;
      saveLabelsBtn.textContent = 'Save labels';
    }
  };
}


    async function applyPanoramaSelectionForCurrent(actionValue){
      const sel = labelEditorState.currentSelection;
      if(!sel || sel.isExterior || !sel.meta || !isPanoramaRow(sel.meta)) return false;
      const item = resolvePanoramaItem(sel.meta, sel.row, actionValue);
      if(!item || !item.url) return false;

      const key = makeCustomizationSelectionKey(sel.bIdx, sel.itemIdx);
      const runtimeItem = hvRuntimePanoramaSelection(item);
      panoramaSelectionsByKey.set(key, runtimeItem);

      const thisToken = ++panoramaApplyToken;
      beginViewLoad('Loading panorama...');
      await showPanoramaTransition('Loading panorama...');
      try{
        await preloadPanoramaSelectionImage(runtimeItem, { forceReload: true });
        if(thisToken !== panoramaApplyToken) return true;
        destroyInteriorEntity(sel.bIdx, sel.itemIdx, { keepBlobUrl: true, silent: true });
        const reloaded = await hvTryEnsureInteriorEntityForMarker(sel.bIdx, sel.itemIdx);
        if(thisToken !== panoramaApplyToken) return true;
        if(reloaded) reloaded.show = true;
        updatePanoramaLabelUiHints();
        try{ hvUpdateNarrationAudioForSelection(labelEditorState.currentSelection); }catch(_){ }
        refreshLabelListUI();
        labelEditorStatus.textContent = 'Panorama changed to ' + (item.title || item.key || 'selected view') + '.';
        requestSceneRenderBurst(10);
        await waitMs(80);
        return true;
      } catch(err){
        console.warn('Panorama apply failed:', err);
        labelEditorStatus.textContent = 'Could not load that panorama.';
        return false;
      } finally {
        if(thisToken === panoramaApplyToken){
          endViewLoad();
          hidePanoramaTransition().catch(function(){});
        }
      }
    }

    async function handleInteractiveLabelActionFromPick(picked){
      const ent = picked && picked.id ? picked.id : null;
      const props = ent && ent.properties ? ent.properties : null;
      if(!props) return false;
      const actionType = props.hvLabelActionType && props.hvLabelActionType.getValue ? props.hvLabelActionType.getValue() : '';
      const actionValue = props.hvLabelActionValue && props.hvLabelActionValue.getValue ? props.hvLabelActionValue.getValue() : '';
      if(!actionType || actionType === 'none') return false;
      if(actionType === 'open_panorama'){
        return await applyPanoramaSelectionForCurrent(actionValue);
      }
      if(actionType === 'open_room_model'){
        return await applyRoomModelForCurrent(actionValue);
      }
      return false;
    }

    // ===== Picking (POI tooltip) =====
    const handler=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(async function (m){
      if(typeof handleCinematicFocusPlacement === 'function' && handleCinematicFocusPlacement(m.position)){
        tip.style.display='none';
        return;
      }
      if(labelEditorState.editMode && labelEditorState.pendingPick){
        const used = handleLabelPlacement(m.position);
        if(used){ tip.style.display='none'; return; }
      }
      const picked=viewer.scene.pick(m.position);
      if(picked && picked.id && picked.id.properties && picked.id.properties.hvInteriorEntry){
        const buildingIdx = Number(picked.id.properties.hvBuildingIndex.getValue());
        tip.style.display='none';
        await handleInteriorEntryClick(buildingIdx);
        return;
      }
      if(await handleInteractiveLabelActionFromPick(picked)){ tip.style.display='none'; return; }
      if(picked && picked.id && poiIndexById.has(picked.id.id)){
        // POI / amenity labels are informational only. They must never become
        // the selected/tracked entity or change the Building View camera target.
        try{ viewer.selectedEntity = undefined; }catch(_){ }
        try{ viewer.trackedEntity = undefined; }catch(_){ }
        try{ stopCameraTracking(); }catch(_){ }
        tip.style.display='none';
        requestSceneRenderBurst(2);
        return;
      }
      tip.style.display='none';
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    viewer.camera.changed.addEventListener(()=>{ tip.style.display='none'; });

    function refreshPoisForSelection(){
      const idx=Number(selectBox.value);
      applyPoiTypeFilters(idx);
    }

    function rebuildViewOptions(idx){
      viewSelect.innerHTML='';
      const o=document.createElement('option'); o.value='exterior'; o.textContent='Building View'; viewSelect.appendChild(o);
      let list = [];
      try{ list = (markerTargetItemsByBuilding && markerTargetItemsByBuilding[idx]) ? markerTargetItemsByBuilding[idx] : []; }catch(_){ list = []; }
      if(!list || !list.length){ try{ list = (interiorMetaByBuilding && interiorMetaByBuilding[idx]) ? interiorMetaByBuilding[idx] : []; }catch(_){ list = []; } }
      if(!list || !list.length) list = hvGetMarkerEditorTargetsForBuilding(idx);
      list.forEach((u,k)=>{
        const o2=document.createElement('option');
        const panorama = isPanoramaRow(u);
        const amenity = !panorama && isAmenityRow(u);
        const prefix = panorama ? 'panorama:' : (amenity ? 'amenity:' : 'unit:');
        const fallback = panorama ? 'Panorama #' : (amenity ? 'Amenity #' : 'Unit #');
        o2.value = prefix + k;
        o2.textContent = getItemDisplayName(u, fallback + (k+1));
        viewSelect.appendChild(o2);
      });
      viewSelect.value='exterior';
      try{ rebuildMarkerTargetListForCurrentBuilding(); }catch(_){ }
    }

    // ===== Direct share links =====
    function hvShareCleanKey(value){
      return String(value || '').trim().toLowerCase()
        .replace(/[\u200b\u200c\u200d\ufeff]/g,'')
        .replace(/[^a-z0-9]+/g,'_')
        .replace(/^_+|_+$/g,'');
    }
    function getBuildingShareKey(row, idx){
      return firstFilled(row && row.building_key, row && row.key, row && row.id, row && row.slug, row && row.name, String(idx));
    }
    function getItemShareKey(item, idx){
      return firstFilled(item && item.unit_key, item && item.unit_id, item && item.key, item && item.id, item && item.unit_name, item && item.name, item && item.title, item && item.unit_number, String(idx));
    }
    function optionExists(value){
      for(let i=0;i<viewSelect.options.length;i++){
        if(viewSelect.options[i].value === value) return true;
      }
      return false;
    }
    function findBuildingIndexForShare(value, fallbackIndex){
      if(Number.isFinite(Number(fallbackIndex)) && buildingsData[Number(fallbackIndex)]) return Number(fallbackIndex);
      const raw = String(value || '').trim();
      if(!raw) return 0;
      if(Number.isFinite(Number(raw)) && buildingsData[Number(raw)]) return Number(raw);
      const key = hvShareCleanKey(raw);
      for(let i=0;i<buildingsData.length;i++){
        const row = buildingsData[i] || {};
        const candidates = [row.building_key, row.key, row.id, row.slug, row.name, String(i)];
        if(candidates.some(function(v){ return hvShareCleanKey(v) === key; })) return i;
      }
      return 0;
    }
    function findViewValueForShare(bIdx, rawView, rawUnit){
      const view = String(rawView || '').trim();
      if(view && optionExists(view)) return view;
      const unitRaw = String(rawUnit || '').trim();
      if(!unitRaw) return 'exterior';
      const list = hvGetMarkerEditorTargetsForBuilding(bIdx);
      if(Number.isFinite(Number(unitRaw))){
        const n = Number(unitRaw);
        const values = ['unit:'+n, 'panorama:'+n, 'amenity:'+n];
        for(const v of values){ if(optionExists(v)) return v; }
      }
      const key = hvShareCleanKey(unitRaw);
      for(let k=0;k<list.length;k++){
        const item = list[k] || {};
        const panorama = isPanoramaRow(item);
        const amenity = !panorama && isAmenityRow(item);
        const prefix = panorama ? 'panorama:' : (amenity ? 'amenity:' : 'unit:');
        const candidates = [item.unit_key, item.unit_id, item.key, item.id, item.unit_name, item.name, item.title, item.unit_number, String(k)];
        if(candidates.some(function(v){ return hvShareCleanKey(v) === key; })) return prefix + k;
      }
      return 'exterior';
    }
    function getCurrentShareTarget(){
      const bIdx = Number(selectBox && selectBox.value || 0);
      const row = buildingsData[bIdx] || {};
      const viewValue = String((viewSelect && viewSelect.value) || 'exterior');
      const params = {
        b: getBuildingShareKey(row, bIdx),
        bi: String(bIdx),
        v: viewValue
      };
      if(viewValue !== 'exterior'){
        const parts = viewValue.split(':');
        const itemIdx = Number(parts[1] || 0);
        const item = hvGetMarkerEditorTargetsForBuilding(bIdx)[itemIdx] || {};
        params.u = getItemShareKey(item, itemIdx);
      }
      return params;
    }
    buildCurrentShareUrl = function(){
      const url = new URL(window.location.href);
      const target = getCurrentShareTarget();
      // Keep existing project parameters such as ?sheet=... and ?api=..., but refresh HomeView target params.
      ['hv_b','hv_bi','hv_v','hv_u','building','unit','view','b','u'].forEach(function(k){ url.searchParams.delete(k); });
      url.searchParams.set('hv_b', target.b);
      url.searchParams.set('hv_bi', target.bi);
      url.searchParams.set('hv_v', target.v);
      if(target.u) url.searchParams.set('hv_u', target.u);
      return url.toString();
    };
    function applyInitialShareLinkFromUrl(){
      let sp;
      try{ sp = new URLSearchParams(window.location.search || ''); }catch(_){ return false; }
      const hasTarget = sp.has('hv_b') || sp.has('hv_bi') || sp.has('hv_v') || sp.has('hv_u') || sp.has('building') || sp.has('unit') || sp.has('view') || sp.has('b') || sp.has('u');
      if(!hasTarget) return false;
      const bIdx = findBuildingIndexForShare(sp.get('hv_b') || sp.get('building') || sp.get('b'), sp.get('hv_bi'));
      if(selectBox) selectBox.value = String(bIdx);
      hiddenPoiTypes = new Set();
      rebuildChipsForBuilding(bIdx);
      rebuildViewOptions(bIdx);
      const viewValue = findViewValueForShare(bIdx, sp.get('hv_v') || sp.get('view'), sp.get('hv_u') || sp.get('unit') || sp.get('u'));
      if(viewSelect) viewSelect.value = viewValue;
      applyPoiTypeFilters(bIdx);
      syncFutureProjectsChip();
      setLaunchLoadingText(viewValue && viewValue !== 'exterior' ? 'Opening shared unit...' : 'Opening shared building...');
      return true;
    }

    // ===== Update View =====
    function getViewTransitionMessage(){
      const selectedValue = viewSelect.value || 'exterior';
      if(selectedValue === 'exterior') return 'Returning to Building View...';
      const selectedParts = selectedValue.split(':');
      const kind = selectedParts[0] || 'unit';
      const idx = Number(selectedParts[1] || 0);
      const meta = hvGetMarkerEditorTargetsForBuilding(Number(selectBox.value))[idx] || null;
      const name = getItemDisplayName(meta, 'selected view');
      if(kind === 'panorama') return 'Loading panorama...';
      if(kind === 'amenity') return 'Loading amenity...';
      return name ? ('Entering ' + name + '...') : 'Entering unit...';
    }
    function selectedTargetHasExteriorReveal(){
      try{
        const selectedValue = viewSelect.value || 'exterior';
        if(selectedValue === 'exterior') return false;
        const parts = selectedValue.split(':');
        if((parts[0] || '') !== 'unit') return false;
        const bIdx = Number(selectBox.value);
        const itemIdx = Number(parts[1] || 0);
        const meta = hvGetMarkerEditorTargetsForBuilding(bIdx)[itemIdx] || null;
        return !!meta && hasExteriorMarkerConfig(meta);
      }catch(_){ return false; }
    }
    async function runViewUpdateWithTransition(idx){
      const selectedValue = viewSelect.value || 'exterior';
      const isExteriorTarget = selectedValue === 'exterior';
      const useExteriorReveal = selectedTargetHasExteriorReveal();
      const shouldUseOverlay = (!isExteriorTarget || currentMode !== 'exterior');
// v39: unit-location reveal also gets a loading overlay now.
// Without it, mobile looked frozen while the GLB was being created before the cinematic reveal.
      if(!shouldUseOverlay){
        return updateView(idx);
      }
      return withSceneTransition(getViewTransitionMessage(), function(){ return updateView(idx); }, IS_MOBILE ? 180 : 240);
    }
    function scheduleViewUpdate(){
      const idx = Number(selectBox.value);
      const delay = IS_MOBILE ? 180 : 0;
      if(mobileViewChangeTimer){ clearTimeout(mobileViewChangeTimer); mobileViewChangeTimer = null; }
      if(delay > 0){
        mobileViewChangeTimer = setTimeout(function(){
          mobileViewChangeTimer = null;
          runViewUpdateWithTransition(idx);
        }, delay);
      } else {
        runViewUpdateWithTransition(idx);
      }
    }

    selectBox.addEventListener('change', async ()=>{
      try{ if(markerEditorModeActive) exitMarkerEditorMode(); }catch(_){ }
      const idx = Number(selectBox.value);
      hiddenPoiTypes = new Set();
      rebuildChipsForBuilding(idx);
      rebuildViewOptions(idx);
      scheduleViewUpdate();
      applyPoiTypeFilters(idx);
      if(showFutureProjectsToggle && showFutureProjectsToggle.checked && hasFutureProjectsByBuilding[idx]){
        await refreshFutureProjects(idx);
      }else{
        if(showFutureProjectsToggle) showFutureProjectsToggle.checked = false;
        clearAllFutureProjectEntities();
        syncFutureProjectsChip();
      }
    });
    viewSelect.addEventListener('change', async ()=>{
      try{ if(markerEditorModeActive) exitMarkerEditorMode(); }catch(_){ }
      const idx = Number(selectBox.value);
      applyPoiTypeFilters(idx);
      if(showFutureProjectsToggle && showFutureProjectsToggle.checked && hasFutureProjectsByBuilding[idx]){
        await refreshFutureProjects(idx);
      }else{
        clearAllFutureProjectEntities();
        syncFutureProjectsChip();
      }
      scheduleViewUpdate();
    });


function renderUnitMetaUI(meta, row){
  const source = meta || row || {};
  const price = getCurrentPrice(source, row);
  const area = getAreaSqft(source);
  const beds = getBeds(source);
  const baths = getBaths(source);
  const parking = getParkingSpaces(source);
  const fee = getMaintenanceFee(source);
  const year = getYearBuilt(source);
  const lists = getFeatureLists(source);

  renderDetailGrid(unitSpecsGrid, [
    ['Price', fmtMoneyNoDash(price)],
    ['Area', getAreaDisplayText(source, 1)],
    ['Beds', beds!=null ? String(beds) : ''],
    ['Bathrooms', baths!=null ? String(baths) : '']
  ]);
  unitSpecsCard.style.display = unitSpecsGrid.children.length ? 'block' : 'none';

  renderDetailGrid(propertyDetailsGrid, [
    ['Maintenance Fee', fmtMoneyNoDash(fee)],
    ['Parking Spaces', parking!=null ? String(parking) : ''],
    ['Year Built / Completion', year!=null ? String(year) : '']
  ]);
  propertyDetailsCard.style.display = propertyDetailsGrid.children.length ? 'block' : 'none';

  renderChipSection(buildingFeaturesSec, lists.buildingFeatures);
  renderChipSection(buildingAmenitiesSec, lists.buildingAmenities);
  renderChipSection(structuresSec, lists.structures);
  renderChipSection(heatingSec, lists.heating);
  renderChipSection(communitySec, lists.community);
}
function hideUnitMetaUI(){
  unitSpecsCard.style.display='none';
  propertyDetailsCard.style.display='none';
  buildingFeaturesSec.card.style.display='none';
  buildingAmenitiesSec.card.style.display='none';
  structuresSec.card.style.display='none';
  heatingSec.card.style.display='none';
  communitySec.card.style.display='none';
  adminBuildingViewsCard.style.display='none';
  adminUnitEditorCard.style.display='none';
}

    async function updateView(idx){
      const row=b[idx];
      const selectedValue=viewSelect.value||'exterior';
      disableInteriorClip();
      setCameraCollision(true);
      let didBeginLoad = false;
      const isExterior=(selectedValue==='exterior');
      const selectedParts=selectedValue.split(':');
      const selectedKind=selectedParts[0]||'exterior';
      const selectedIndex=Number(selectedParts[1]||0);
      const selectedMeta=hvGetMarkerEditorTargetsForBuilding(idx)[selectedIndex]||null;
      const selectedIsAmenity = !isExterior && selectedKind==='amenity' && !!selectedMeta;
      const selectedIsPanorama = !isExterior && selectedKind==='panorama' && !!selectedMeta;
      setInteriorEntryButtonsVisibility(idx, isExterior);
      hideUnitAdLogo();
      if(SHOULD_COLLAPSE_CONTROLS_ON_INTERIOR){
        setCollapsed(!isExterior);
      } else {
        setCollapsed(false);
      }
      setCesiumGroundVisible(!selectedIsPanorama);
      if(selectedIsPanorama){
        navigationLabelsEnabled = true;
        infoLabelsEnabled = false;
        showLabelsToggle.checked = false;
      }
      if(isExterior || selectedIsAmenity || !selectedMeta || (selectedKind!=='unit' && selectedKind!=='panorama')){
        unitViewsState.lastTrackedKey = '';
      }
      currentMode = isExterior ? 'exterior' : (selectedIsPanorama ? 'panorama' : (selectedIsAmenity ? 'amenity' : 'interior'));
      try{ syncQuickShowLabelsButton(); }catch(_){ }
      labelEditorState.currentSelection = { bIdx: idx, kind: selectedKind, itemIdx: selectedIndex, meta: selectedMeta, row: row, isExterior: isExterior };
      try{ hvUpdateNarrationAudioForSelection(labelEditorState.currentSelection); }catch(_){ }
      try{ syncQuickShowLabelsButton(); }catch(_){ }

      const thisSwitchToken = ++interiorSwitchToken;
      const hasRealModel = !!selectedMeta && isLikelyModelUrl(selectedMeta.model_url);
      const wantsInteriorModel = !isExterior && !!selectedMeta && hasRealModel && (selectedKind==='unit' || selectedKind==='amenity' || selectedKind==='panorama');
      const useUnitExteriorReveal = wantsInteriorModel && selectedKind === 'unit' && hasExteriorMarkerConfig(selectedMeta);

      stopCameraTracking();
      clearActiveRoomModel({ keepCache:true });
      if(!useUnitExteriorReveal) clearSelectedUnitExteriorMarker();
      modelEntities.forEach((ent,i)=> ent.show=(i===idx)&&(isExterior || useUnitExteriorReveal));
      destroyNonActiveInteriorEntities(wantsInteriorModel ? { bIdx: idx, itemIdx: selectedIndex } : null);

      let activeInteriorEntity = null;
      if(wantsInteriorModel){
        activeInteriorSelection = { bIdx: idx, itemIdx: selectedIndex };
        navigationLabelsEnabled = true;
        infoLabelsEnabled = false;
        showLabelsToggle.checked = false;
        try{ syncQuickShowLabelsButton(); }catch(_){ }
        title.textContent = (row.name||'') + (getItemDisplayName(selectedMeta) ? ' — ' + getItemDisplayName(selectedMeta) : '') + ' (loading...)';
        beginViewLoad(useUnitExteriorReveal ? 'Locating selected unit...' : 'Loading selected model...');
        didBeginLoad = true;
        requestSceneRenderBurst(3);
        let loadPromise = null;
        try{
          loadPromise = hvTryEnsureInteriorEntityForMarker(idx, selectedIndex);

          // v39: do not let the screen sit frozen while we wait for the selected unit GLB.
          // First load the model under the transition overlay, then hide it and start the exterior reveal.
          activeInteriorEntity = await loadPromise;
          if(thisSwitchToken !== interiorSwitchToken) return;

          if(useUnitExteriorReveal && activeInteriorEntity){
            try{ await hideSceneTransition(); }catch(_){ }
            await playSelectedUnitExteriorReveal(idx, selectedMeta, Promise.resolve(activeInteriorEntity));
          }
        } finally {
          if(didBeginLoad){ endViewLoad(); didBeginLoad = false; }
        }
        if(thisSwitchToken !== interiorSwitchToken) return;
      } else {
        activeInteriorSelection = null;
      }

      (interiorEntitiesByBuilding[idx]||[]).forEach((ent,k)=>{
        if(ent) ent.show = !!activeInteriorEntity && (selectedIndex===k) && (selectedKind==='unit' || selectedKind==='amenity' || selectedKind==='panorama');
      });
      if(useUnitExteriorReveal && activeInteriorEntity){
        modelEntities.forEach((ent,i)=>{ if(ent && i===idx) ent.show = false; });
        clearSelectedUnitExteriorMarker();
      }

      if(wantsInteriorModel && !activeInteriorEntity){
        clearSelectedUnitExteriorMarker();
        modelEntities.forEach((ent,i)=>{ if(ent) ent.show = (i===idx) && false; });
        title.textContent = (row.name||'') + (getItemDisplayName(selectedMeta) ? ' — ' + getItemDisplayName(selectedMeta) : '') + ' (model failed to load)';
        descBox.style.display = 'block';
        descBox.textContent = 'The model did not finish loading. Please try this unit again.';
        hideUnitMetaUI();
        hideFinishCard();
        setPriceChartVisible(false);
        loanCard.style.display='none';
        compareCard.style.display='none';
        similarCard.style.display='none';
        priceCard.style.display='none';
        commuteCard.style.display='none';
        disableInteriorClip();
        setCameraCollision(true);
        refreshPoisForSelection();
        if(showFutureProjectsToggle && showFutureProjectsToggle.checked && hasFutureProjectsByBuilding[idx]) refreshFutureProjects(idx); else clearAllFutureProjectEntities();
        return;
      }

      refreshPoisForSelection();
      if(showFutureProjectsToggle && showFutureProjectsToggle.checked && hasFutureProjectsByBuilding[idx]) refreshFutureProjects(idx); else clearAllFutureProjectEntities();

      if(isExterior){
        // v60: returning to Building View after Cinematic Camera must always restore the normal
        // safe exterior orbit. A completed/closed cinematic session could leave HomeView's
        // global cinematic flags in a free-camera state, which made the camera look locked until refresh.
        try{
          if(!(typeof isCinematicPanelOpen === 'function' && isCinematicPanelOpen())){
            window.__hvCinematicFreeCameraActive = false;
            window.__hvCinematicPlaying = false;
            if(typeof cinematicSetupFreeCameraActive !== 'undefined') cinematicSetupFreeCameraActive = false;
            if(typeof cinematicIsPlaying !== 'undefined') cinematicIsPlaying = false;
            if(typeof cinematicStopRequested !== 'undefined') cinematicStopRequested = false;
          }
        }catch(_){ }
        setExteriorMouseBindings(); interiorNav.disable(); setJoystickVisible(false);
        setCameraCollision(true);
        const lon=toNum(row.lng), lat=toNum(row.lat);
        const height=toNum(row.height)||20, scale=toNum(row.scale)||10;
        const heading=Cesium.Math.toRadians(toNum(row.heading)||0), pitch=Cesium.Math.toRadians(-28);

        function getExteriorCameraDistance(row, scale, height){
          const explicit = parseFirstNumber(
            firstFilled(
              row.exterior_camera_distance,
              row.camera_distance_exterior,
              row.building_camera_distance,
              row.default_camera_distance,
              row.camera_distance
            )
          );
          if(Number.isFinite(explicit) && explicit > 0) return explicit;

          // Previous logic could end up too close to the building for some datasets.
          // Keep a safer default exterior range so the whole building is readable.
          const byScale = scale > 0 ? scale * 42 : 0;
          const byHeight = height > 0 ? height * 18 : 0;
          const dist = Math.max(byScale, byHeight, 120);
          return dist;
        }

        const distance = getExteriorCameraDistance(row, scale, height);
        getBuildingSurfacePosition(lon,lat,height).then(center=>{
          stopCameraTracking();
          setExteriorMouseBindings();
          const sphereRadius = Math.max(12, Math.max(scale || 0, height || 0));
          const duration = currentMode === 'exterior' ? (IS_MOBILE ? 0.7 : 1.0) : (IS_MOBILE ? 0.9 : 1.2);
          const orbitFrame = Cesium.Transforms.eastNorthUpToFixedFrame(center);
          const orbitOffset = new Cesium.HeadingPitchRange(heading, pitch, distance);
          function lockExteriorOrbitCamera(){
            try{
              // Keep Building View in a local ENU frame so left-drag rotates around the selected building,
              // not around the globe/camera position. This restores the original orbit-style exterior control.
              try{ exteriorOrbitController && exteriorOrbitController.setOrbit(orbitFrame, center, heading, pitch, distance); }catch(_){ }
              viewer.scene.camera.lookAtTransform(orbitFrame, new Cesium.HeadingPitchRange(heading, pitch, distance));
            }catch(_){ }
            setExteriorMouseBindings();
            requestSceneRenderBurst(4);
          }
          try{
            viewer.camera.flyToBoundingSphere(
              new Cesium.BoundingSphere(center, sphereRadius),
              {
                duration: duration,
                offset: orbitOffset,
                complete: lockExteriorOrbitCamera,
                cancel: lockExteriorOrbitCamera
              }
            );
          }catch(_){
            lockExteriorOrbitCamera();
          }
        });
        const fr=viewer.camera.frustum; if(fr && 'fov' in fr) fr.fov=Math.PI/3;

        syncInteriorClipForSelection(null, row, true);
        title.textContent=row.name||'';
        hideUnitMetaUI();
        hideFinishCard();
        const d = getItemDescription(row).trim();
        descBox.style.display = d ? 'block' : 'none';
        descBox.textContent = d;
        if(isEditorAdmin()){
          refreshBuildingUnitViews(firstFilled(row.building_key, row.name, row.title), { force:false, forceCsv:false });
        }else{
          adminBuildingViewsCard.style.display = 'none';
        }

        setPriceChartVisible(false);
        loanCard.style.display='none';
        compareCard.style.display='none';
        similarCard.style.display='none';
        priceCard.style.display='none';

        mini.show();
        mini.setMode('city'); mini.refreshCity(idx); mini.updateCityCamera();
        updateCommute(idx);
      } else if (selectedIsPanorama) {
        const k=selectedIndex;
        const ent=activeInteriorEntity || (interiorEntitiesByBuilding[idx]||[])[k] || null;
        const meta=selectedMeta||{};
        const panoCfg = getPanoramaConfig(meta, row);
        const activePano = panoramaSelectionsByKey.get(makeCustomizationSelectionKey(idx, k)) || panoCfg.defaultItem || null;

        if(ent){
          const target=ent.position.getValue(Cesium.JulianDate.now());
          const camHead=Cesium.Math.toRadians(
            parseFirstNumber(
              meta.camera_heading != null
                ? meta.camera_heading
                : meta.heading != null
                  ? meta.heading
                  : row.heading
            ) || 0
          );
          const camPitch=Cesium.Math.toRadians(parseFirstNumber(meta.camera_pitch)||0);
          const range = Math.max(0.01, parseFirstNumber(meta.camera_distance) || 0.1);

          viewer.scene.camera.lookAt(target, new Cesium.HeadingPitchRange(camHead,camPitch,range));
          viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          requestSceneRender();
        }

        syncInteriorClipForSelection(meta, row, false);
        setCameraCollision(false);
        setPanoramaMouseBindings();
        interiorNav.disable();
        setJoystickVisible(false);
        clampCameraRollZero();
        updatePanoramaLabelUiHints();
        try{ hvUpdateNarrationAudioForSelection(labelEditorState.currentSelection); }catch(_){ }

        applyFixedInteriorFov();

        title.textContent=(row.name||'') + (getItemDisplayName(selectedMeta) ? ' — ' + getItemDisplayName(selectedMeta) : '');
        renderUnitMetaUI(meta, row);
        hideFinishCard();
        if(isEditorAdmin()) populateAdminEditor(selectedMeta, row);
        await trackUnitView(firstFilled(meta.building_key, row.building_key, row.name, row.title), getItemDisplayName(meta));
        const dBase = getItemDescription(selectedMeta, row).trim();
        // Public UI: do not show internal panorama keys/names such as Part1, Part2, ...
        // Those are project/navigation metadata and make the listing description look like a debug panel.
        const d = dBase;
        descBox.style.display = d ? 'block' : 'none';
        descBox.textContent = d;
        adminBuildingViewsCard.style.display = 'none';
        showUnitAdLogo(meta, row);

        const chartSeries = firstFilled(meta.estimated_price_unit, meta.estimated_price, row.estimated_price);
        if (chartSeries) {
          setPriceChartVisible(true);
          drawPriceChart(priceCanvas, chartSeries);
        } else {
          setPriceChartVisible(false);
        }

        const autoPrice=getCurrentPrice(meta,row);
        const hasComparablePrice = Number.isFinite(autoPrice) && autoPrice > 0;
        loanCard.style.display = hasComparablePrice ? 'block' : 'none';
        compareCard.style.display = hasComparablePrice ? 'block' : 'none';
        similarCard.style.display = hasComparablePrice ? 'block' : 'none';
        priceCard.style.display = 'none';
        commuteCard.style.display='none';
        if(hasComparablePrice){
          loanPrice.value = String(autoPrice);
          recalcLoan();
          buildSimilarList(idx,k);
          renderInsights(idx,k);
        } else {
          similarCard.style.display='none';
          priceCard.style.display='none';
          if (typeof compareModal !== 'undefined' && compareModal) compareModal.style.display='none';
        }

        mini.hide();
      } else if (selectedIsAmenity) {
        const k=selectedIndex;
        const ent=activeInteriorEntity || (interiorEntitiesByBuilding[idx]||[])[k] || null;
        const meta=selectedMeta||{};

        if(ent){
          const target=ent.position.getValue(Cesium.JulianDate.now());
          const camHead=Cesium.Math.toRadians(
            parseFirstNumber(
              meta.camera_heading != null
                ? meta.camera_heading
                : meta.heading != null
                  ? meta.heading
                  : row.heading
            ) || 0
          );
          const camPitch=Cesium.Math.toRadians(parseFirstNumber(meta.camera_pitch)||-15);
          const range = parseFirstNumber(meta.camera_distance) || Math.max(25,(parseFirstNumber(meta.scale)||8)*12);

          viewer.scene.camera.lookAt(target, new Cesium.HeadingPitchRange(camHead,camPitch,range));
          viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          requestSceneRender();
        }

        syncInteriorClipForSelection(meta, row, false);
        setCameraCollision(false);
        // Amenities should behave like interior navigation, not exterior orbit mode.
        // v39 fix: mobile amenities need the same joystick as units.
        setInteriorMouseBindings();
        interiorNav.enable();
        setJoystickVisible(cameraJoystickEnabledByUser);

        applyFixedInteriorFov();

        title.textContent=(row.name||'') + (getItemDisplayName(selectedMeta) ? ' — ' + getItemDisplayName(selectedMeta) : '');
        hideUnitMetaUI();
        await syncCustomizationUIForSelection(idx, k, selectedMeta, row, ent);
        if(isEditorAdmin()) populateAdminEditor(selectedMeta, row);
        const d = getItemDescription(selectedMeta, row).trim();
        descBox.style.display = d ? 'block' : 'none';
        descBox.textContent = d;
        adminBuildingViewsCard.style.display = 'none';
        hideUnitAdLogo();

        setPriceChartVisible(false);
        loanCard.style.display='none';
        compareCard.style.display='none';
        similarCard.style.display='none';
        priceCard.style.display='none';
        commuteCard.style.display='none';
        if (typeof compareModal !== 'undefined' && compareModal) compareModal.style.display='none';

        mini.show();
        mini.setMode('city'); mini.refreshCity(idx); mini.updateCityCamera();
      } else {
        const k=selectedIndex;
        const ent=activeInteriorEntity || (interiorEntitiesByBuilding[idx]||[])[k] || null;
        const meta=selectedMeta||{};
        if(ent){
          const baseCameraRow = hvBuildBaseRoomCameraRow(meta, row);
          try{
            activeRoomModelState.currentRoomKey = '__base__';
            activeRoomModelState.currentRoomMeta = baseCameraRow;
          }catch(_){ }
          await hvFrameActiveInteriorModelCamera(ent, baseCameraRow, row, { burst:10, roomKey:'__base__' });
          syncInteriorClipForSelection(meta, row, false);
          setCameraCollision(false);
          setInteriorMouseBindings(); interiorNav.enable(); setJoystickVisible(true);

          applyFixedInteriorFov();

          title.textContent=(row.name||'') + (getItemDisplayName(meta) ? ' — '+getItemDisplayName(meta) : '');
          renderUnitMetaUI(meta, row);
          hideFinishCard();
          await syncCustomizationUIForSelection(idx, k, meta, row, ent);
          if(isEditorAdmin()) populateAdminEditor(meta, row);
          await trackUnitView(firstFilled(meta.building_key, row.building_key, row.name, row.title), getItemDisplayName(meta));
          const d = getItemDescription(meta, row).trim();
          descBox.style.display = d ? 'block' : 'none';
          descBox.textContent = d;
          adminBuildingViewsCard.style.display = 'none';
          showUnitAdLogo(meta, row);
          try{ hvUpdateNarrationAudioForSelection(labelEditorState.currentSelection); }catch(_){ }

          const chartSeries = firstFilled(meta.estimated_price_unit, meta.estimated_price, row.estimated_price);
          if (chartSeries) {
            setPriceChartVisible(true);
            drawPriceChart(priceCanvas, chartSeries);
          } else {
            setPriceChartVisible(false);
          }

          loanCard.style.display='block';
          compareCard.style.display='block';
          similarCard.style.display='block';
          priceCard.style.display='none';

          const autoPrice=getCurrentPrice(meta,row);
          loanPrice.value = Number.isFinite(autoPrice) && autoPrice>0 ? String(autoPrice) : '';
          recalcLoan();

          mini.hide();
          buildSimilarList(idx,k);
          renderInsights(idx,k);
          updateCommute(idx);
        } else {
          disableInteriorClip();
          setCameraCollision(true);
          setExteriorMouseBindings(); interiorNav.disable(); setJoystickVisible(false);
          title.textContent=(row.name||'') + (getItemDisplayName(meta) ? ' — '+getItemDisplayName(meta) : '');
          renderUnitMetaUI(meta, row);
          await syncCustomizationUIForSelection(idx, k, meta, row, ent);
          if(isEditorAdmin()) populateAdminEditor(meta, row);
          await trackUnitView(firstFilled(meta.building_key, row.building_key, row.name, row.title), getItemDisplayName(meta));
          const d = getItemDescription(meta, row).trim();
          descBox.style.display = d ? 'block' : 'none';
          descBox.textContent = d;
          adminBuildingViewsCard.style.display = 'none';
          showUnitAdLogo(meta, row);
          setPriceChartVisible(false);
          loanCard.style.display='none';
          compareCard.style.display='none';
          similarCard.style.display='none';
          priceCard.style.display='none';
          mini.show();
          mini.setMode('city'); mini.refreshCity(idx); mini.updateCityCamera();
        }
      }
      syncLabelToolsVisibility();
      renderSelectionLabels();
      hvScheduleContextGuide(650);
    }

    function refreshAllCityLayers(idx){
      applyPoiTypeFilters(idx);
    }
    selectBox.addEventListener('change',()=>{ refreshAllCityLayers(Number(selectBox.value)); try{ rebuildMarkerTargetListForCurrentBuilding(); }catch(_){} });


    // ===== First Launch Chooser + First Run Guide =====
    const HV_ONBOARDING_VERSION = 'v1';
    function hvSafeLocalGet(key){
      try{ return localStorage.getItem(key); }catch(_){ return null; }
    }
    function hvSafeLocalSet(key, value){
      try{ localStorage.setItem(key, value); }catch(_){ }
    }
    function hvOnboardingSeenKey(kind){ return 'homeview.onboarding.' + HV_ONBOARDING_VERSION + '.' + kind; }
    function hvGetBuildingLabelByIndex(i){
      const row = b[i] || buildingsData[i] || {};
      return firstFilled(row.name, row.title, row.building_key, 'Building ' + (Number(i)+1));
    }
    function hvGetTargetsForOnboardingBuilding(bIdx){
      let list = [];
      try{ list = hvGetMarkerEditorTargetsForBuilding(bIdx) || []; }catch(_){ list = []; }
      return list.filter(function(item){ return item && !getExplicitItemType(item).includes('future_project'); });
    }
    function hvMakeLaunchChooserOption(text, value){
      const opt = document.createElement('option');
      opt.value = String(value);
      opt.textContent = text;
      return opt;
    }
    function showHomeViewLaunchChooser(){
      return new Promise(function(resolve){
        try{
          launchLoadingOverlay.style.background = 'linear-gradient(180deg, rgba(7,10,16,.88), rgba(7,10,16,.72))';
          launchLoadingOverlay.style.pointerEvents = 'auto';
          launchLoadingOverlay.innerHTML = `
            <div class="ui-card" style="width:min(92vw,420px);border-radius:22px;padding:20px 22px;box-shadow:0 24px 70px rgba(0,0,0,.32);font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:rgba(255,255,255,.96)!important;color:#111!important">
              <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#666!important;margin-bottom:6px">HomeView</div>
              <div style="font-size:22px;font-weight:900;line-height:1.2;margin-bottom:8px">What would you like to explore?</div>
              <div style="font-size:13px;line-height:1.45;color:#555!important;margin-bottom:14px">Choose a building or jump directly into a unit. You can change this later from Controls.</div>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;margin-bottom:10px">Building
                <select id="hvLaunchBuildingSelect" class="ui-select" style="padding:10px;border-radius:10px;font-size:14px;width:100%"></select>
              </label>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;margin-bottom:14px">View / Unit
                <select id="hvLaunchUnitSelect" class="ui-select" style="padding:10px;border-radius:10px;font-size:14px;width:100%"></select>
              </label>
              <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap">
                <button id="hvLaunchSkipBtn" class="ui-btn" style="border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer">Skip</button>
                <button id="hvLaunchConfirmBtn" class="ui-btn" style="border-radius:10px;padding:10px 16px;font-weight:900;cursor:pointer;background:#111!important;color:#fff!important;border-color:#111!important">Start Exploring</button>
              </div>
            </div>
          `;
          const bSel = launchLoadingOverlay.querySelector('#hvLaunchBuildingSelect');
          const uSel = launchLoadingOverlay.querySelector('#hvLaunchUnitSelect');
          const confirmBtn = launchLoadingOverlay.querySelector('#hvLaunchConfirmBtn');
          const skipBtn = launchLoadingOverlay.querySelector('#hvLaunchSkipBtn');

          for(let i=0;i<b.length;i++){
            bSel.appendChild(hvMakeLaunchChooserOption(hvGetBuildingLabelByIndex(i), i));
          }
          function refreshUnits(){
            const bIdx = Number(bSel.value || 0);
            uSel.innerHTML = '';
            uSel.appendChild(hvMakeLaunchChooserOption('Building View', 'exterior'));
            hvGetTargetsForOnboardingBuilding(bIdx).forEach(function(item, k){
              const panorama = isPanoramaRow(item);
              const amenity = !panorama && isAmenityRow(item);
              const prefix = panorama ? 'panorama:' : (amenity ? 'amenity:' : 'unit:');
              const fallback = panorama ? 'Panorama #' : (amenity ? 'Amenity #' : 'Unit #');
              uSel.appendChild(hvMakeLaunchChooserOption(getItemDisplayName(item, fallback + (k+1)), prefix + k));
            });
          }
          bSel.addEventListener('change', refreshUnits);
          refreshUnits();
          function hvCommitLaunchChoice(choice){
            try{
              const isUnit = choice && choice.viewValue && String(choice.viewValue) !== 'exterior';
              showLaunchLoadingMessage(isUnit ? 'Opening selected unit...' : 'Opening selected building...');
            }catch(_){ }
            resolve(choice);
          }
          skipBtn.onclick = function(){
            hvCommitLaunchChoice({ skipped:true, bIdx:0, viewValue:'exterior' });
          };
          confirmBtn.onclick = function(){
            hvCommitLaunchChoice({ skipped:false, bIdx:Number(bSel.value || 0), viewValue:String(uSel.value || 'exterior') });
          };
        }catch(err){
          console.warn('Launch chooser failed:', err);
          resolve({ skipped:true, bIdx:0, viewValue:'exterior' });
        }
      });
    }

    let hvGuideActive = false;
    const hvGuideOverlay = document.createElement('div');
    hvGuideOverlay.id = 'hvFirstRunGuideOverlay';
    hvGuideOverlay.style.cssText = 'position:fixed;inset:0;z-index:910000;display:none;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    hvGuideOverlay.innerHTML = `
      <div id="hvGuideDim" style="position:absolute;inset:0;background:rgba(0,0,0,.28);pointer-events:auto"></div>
      <div id="hvGuideHighlight" style="position:fixed;border:3px solid #fff;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.28),0 12px 38px rgba(0,0,0,.28);display:none;transition:all .2s ease;pointer-events:none"></div>
      <div id="hvGuideBubble" class="ui-card" style="position:fixed;max-width:min(86vw,320px);border-radius:16px;padding:14px 15px;box-shadow:0 16px 44px rgba(0,0,0,.28);pointer-events:auto">
        <div id="hvGuideTitle" style="font-weight:900;font-size:15px;margin-bottom:5px">HomeView tip</div>
        <div id="hvGuideText" style="font-size:13px;line-height:1.45;color:#444!important;margin-bottom:12px"></div>
        <div style="display:flex;gap:8px;justify-content:space-between;align-items:center">
          <button id="hvGuideSkip" class="ui-btn" style="border-radius:9px;padding:7px 10px;font-size:12px;font-weight:800;cursor:pointer">Skip</button>
          <button id="hvGuideNext" class="ui-btn" style="border-radius:9px;padding:7px 12px;font-size:12px;font-weight:900;cursor:pointer;background:#111!important;color:#fff!important;border-color:#111!important">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(hvGuideOverlay);
    const hvGuideHighlight = hvGuideOverlay.querySelector('#hvGuideHighlight');
    const hvGuideBubble = hvGuideOverlay.querySelector('#hvGuideBubble');
    const hvGuideTitle = hvGuideOverlay.querySelector('#hvGuideTitle');
    const hvGuideText = hvGuideOverlay.querySelector('#hvGuideText');
    const hvGuideSkip = hvGuideOverlay.querySelector('#hvGuideSkip');
    const hvGuideNext = hvGuideOverlay.querySelector('#hvGuideNext');

    function hvGetRectForGuide(target){
      try{
        if(!target) return null;
        const el = (typeof target === 'function') ? target() : target;
        if(!el || !el.getBoundingClientRect) return null;
        const r = el.getBoundingClientRect();
        if(!r || r.width <= 0 || r.height <= 0) return null;
        return r;
      }catch(_){ return null; }
    }
    function hvPositionGuideStep(step){
      const r = hvGetRectForGuide(step.target);
      hvGuideTitle.textContent = step.title || 'HomeView tip';
      hvGuideText.textContent = step.text || '';
      hvGuideNext.textContent = step.last ? 'Start Exploring' : 'Next';
      if(r){
        const pad = 6;
        hvGuideHighlight.style.display = 'block';
        hvGuideHighlight.style.left = Math.max(8, r.left - pad) + 'px';
        hvGuideHighlight.style.top = Math.max(8, r.top - pad) + 'px';
        hvGuideHighlight.style.width = Math.max(24, r.width + pad*2) + 'px';
        hvGuideHighlight.style.height = Math.max(24, r.height + pad*2) + 'px';

        const bubbleW = Math.min(320, window.innerWidth - 24);
        let left = Math.min(Math.max(12, r.left), window.innerWidth - bubbleW - 12);
        let top = r.bottom + 14;
        if(top + 150 > window.innerHeight) top = Math.max(12, r.top - 170);
        hvGuideBubble.style.left = left + 'px';
        hvGuideBubble.style.top = top + 'px';
      }else{
        hvGuideHighlight.style.display = 'none';
        hvGuideBubble.style.left = '50%';
        hvGuideBubble.style.top = '50%';
        hvGuideBubble.style.transform = 'translate(-50%,-50%)';
        return;
      }
      hvGuideBubble.style.transform = 'none';
    }
    function hvRunGuide(kind, steps){
      if(hvGuideActive || !steps || !steps.length) return;
      if(hvSafeLocalGet(hvOnboardingSeenKey(kind))) return;
      hvGuideActive = true;
      let i = 0;
      function finish(){
        hvSafeLocalSet(hvOnboardingSeenKey(kind), '1');
        hvGuideOverlay.style.display = 'none';
        hvGuideActive = false;
      }
      function render(){
        const step = Object.assign({}, steps[i]);
        step.last = i >= steps.length - 1;
        hvGuideOverlay.style.display = 'block';
        hvPositionGuideStep(step);
      }
      hvGuideSkip.onclick = finish;
      hvGuideNext.onclick = function(){
        if(i >= steps.length - 1) finish();
        else { i += 1; render(); }
      };
      render();
      requestSceneRenderBurst(2);
    }
    function hvMaybeRunContextGuide(){
      try{
        if(currentMode === 'exterior'){
          hvRunGuide('building', [
            { title:'Choose a building', text:'Use this menu to switch between buildings.', target:function(){ return selectBox; } },
            { title:'Open a unit or view', text:'Pick a unit, amenity, or panorama here. HomeView will take you there.', target:function(){ return viewSelect; } },
            { title:'Ask the AI Advisor', text:'Use AI Advisor when you want quick answers about the project.', target:function(){ return aiAdvisorBtn; } }
          ]);
        }else if(currentMode === 'interior' || currentMode === 'amenity'){
          hvRunGuide('interior', [
            { title:'Look around', text:'Drag with your mouse or finger to look around the space.' },
            { title:'Move inside the unit', text:'Use the joystick to move without the keyboard.', target:function(){ return document.getElementById('cameraJoystick') || document.querySelector('[id*="joystick"], .joystick'); } }
          ]);
        }else if(currentMode === 'panorama'){
          hvRunGuide('panorama', [
            { title:'Look around', text:'Drag with your mouse or finger to look around the 360° photo.' },
            { title:'Move through the home', text:'Click the 3D hotspot buttons inside the panorama to move to another spot.' }
          ]);
        }
      }catch(err){ console.warn('HomeView guide failed:', err); }
    }
    function hvScheduleContextGuide(delay){
      setTimeout(hvMaybeRunContextGuide, Number(delay || 550));
    }


    // init
    setCollapsed(false);
    setLaunchLoadingText('Opening HomeView...');
    const usedSharedTarget = applyInitialShareLinkFromUrl();
    if(!usedSharedTarget){
      rebuildViewOptions(0);
      if(selectBox) selectBox.value = '0';
      if(viewSelect) viewSelect.value = 'exterior';
      try{
        const launchChoice = await showHomeViewLaunchChooser();
        const chosenBuildingIdx = Number(launchChoice && launchChoice.bIdx || 0);
        if(selectBox) selectBox.value = String(chosenBuildingIdx);
        hiddenPoiTypes = new Set();
        rebuildChipsForBuilding(chosenBuildingIdx);
        rebuildViewOptions(chosenBuildingIdx);
        if(viewSelect) viewSelect.value = String((launchChoice && launchChoice.viewValue) || 'exterior');
        applyPoiTypeFilters(chosenBuildingIdx);
        syncFutureProjectsChip();
        showLaunchLoadingMessage((viewSelect && viewSelect.value !== 'exterior') ? 'Opening selected unit...' : 'Opening selected building...');
      }catch(err){
        console.warn('Launch chooser selection failed:', err);
      }
    }
    const initialBuildingIdx = Number(selectBox && selectBox.value || 0);
    setInteriorEntryButtonsVisibility(initialBuildingIdx, true);
    try{
      await updateView(initialBuildingIdx);
    }finally{
      hideLaunchLoading();
      hvScheduleContextGuide(650);
    }
    requestSceneRender();

    // hide tooltip on camera move
    viewer.camera.changed.addEventListener(()=>{ tip.style.display='none'; });

  }).catch(err=>{
    console.error(err);
    setLaunchLoadingText('Could not load HomeView. Please refresh or check the project link.');
    try{ launchLoadingOverlay.style.background = 'rgba(255,255,255,.96)'; launchLoadingOverlay.style.color = '#111'; }catch(_){ }
  });

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

  async function createInteriorEntryButton(row, viewer, buildingIdx){
    const lon = toNum(row.lng), lat = toNum(row.lat);
    const baseHeight = toNum(row.height) || 20;
    const pos = await getBuildingSurfacePosition(lon, lat, baseHeight + 18);
    return viewer.entities.add({
      position: pos,
      properties: {
        hvInteriorEntry: true,
        hvBuildingIndex: buildingIdx
      },
      label: {
        text: 'Interior',
        font: 'bold 15px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#1976d2').withAlpha(0.92),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -44),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#1976d2'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      show: false
    });
  }

  async function createInteriorModel(bRow,uRow,viewer,modelUrl,finishSelections,panoramaSelection){
    const baseLon=toNum(bRow.lng), baseLat=toNum(bRow.lat), baseH=toNum(bRow.height)||20;
    const hvCreateT0 = performance.now();
    const surfaceT0 = performance.now();
    const baseSurfaceH = await getSurfaceHeight(baseLon, baseLat);
    hvRoomPerf('getSurfaceHeight', surfaceT0);
    const offE=toNum(uRow.offset_east_m)||0, offN=toNum(uRow.offset_north_m)||0, offU=toNum(uRow.offset_up_m)||0;
    const pos=placeWithEnuOffset(baseLon,baseLat,baseSurfaceH + baseH,offE,offN,offU);
    const hd=parseFirstNumber(uRow.heading!=null?uRow.heading:bRow.heading)||0;
    const hpr=new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(hd), Cesium.Math.toRadians(toNum(uRow.pitch)||0), Cesium.Math.toRadians(toNum(uRow.roll)||0));
    const ori=Cesium.Transforms.headingPitchRollQuaternion(pos,hpr);
    const scale=toNum(uRow.scale)||8;
    const name=uRow.unit_name||uRow.name||'Unit';
    // Model quality is not exposed as a separate user setting because Cesium's rendering quality is effectively global.
    // Keep imported 3D models consistent and let the Graphic Quality preset control the overall scene performance.
    const minPx = IS_MOBILE ? 64 : 128;
    const maxScale = scale;

    const anchorEntity = viewer.entities.add({
      name:name,
      position:pos,
      orientation:new Cesium.ConstantProperty(ori),
      label:{ text:name, font:"15px sans-serif", fillColor:Cesium.Color.WHITE, outlineColor:Cesium.Color.BLACK, outlineWidth:2, style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance:Number.POSITIVE_INFINITY, pixelOffset:new Cesium.Cartesian2(0, -24) },
      show:false
    });

    const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(pos, hpr);
    let hvRawGltf = null;
    const modelOptions = {
      url:modelUrl,
      modelMatrix:modelMatrix,
      scale:scale,
      minimumPixelSize:minPx,
      maximumScale:maxScale,
      shadows:Cesium.ShadowMode.DISABLED,
      // v45/v46: allow Cesium to show the model as soon as core geometry is ready, then stream textures progressively.
      incrementallyLoadTextures:true,
      asynchronous:true,
      allowPicking:true
    };
    // v46: Skip raw glTF patching for normal room switches. It is only needed when a unit has
    // finish/panorama customization; otherwise the callback adds unnecessary work to every model load.
    if(finishSelections || panoramaSelection){
      modelOptions.gltfCallback = function(gltf){
        hvRawGltf = gltf;
        try{
          const fn = (typeof applyVisualSelectionsToRawGltf==='function'
            ? applyVisualSelectionsToRawGltf
            : (globalThis && typeof globalThis.applyVisualSelectionsToRawGltf==='function'
              ? globalThis.applyVisualSelectionsToRawGltf
              : null));
          if(fn) fn(gltf, finishSelections || null, panoramaSelection || null);
          else console.warn('Raw glTF visual patch skipped: applyVisualSelectionsToRawGltf not available');
        }catch(err){ console.warn('Raw glTF visual patch failed:', err); }
      };
    }
    const gltfLoadT0 = performance.now();
    const modelPrimitive = await Cesium.Model.fromGltfAsync(modelOptions);
    hvRoomPerf('Cesium.Model.fromGltfAsync', gltfLoadT0);
    hvRoomPerf('createInteriorModel total before add', hvCreateT0);
    try{ modelPrimitive.__hvRawGltf = hvRawGltf; }catch(_){ }
    modelPrimitive.show = false;
    viewer.scene.primitives.add(modelPrimitive);

    const handle = {
      anchorEntity: anchorEntity,
      modelPrimitive: modelPrimitive,
      position: anchorEntity.position,
      orientation: anchorEntity.orientation,
      _show: false,
      destroy: function(){
        try{ if(this.modelPrimitive && !this.modelPrimitive.isDestroyed()) this.modelPrimitive.destroy(); }catch(_){ }
        this.modelPrimitive = null;
        this.anchorEntity = null;
      }
    };
    Object.defineProperty(handle, 'show', {
      get: function(){ return this._show; },
      set: function(v){
        const flag = !!v;
        this._show = flag;
        if(this.anchorEntity) this.anchorEntity.show = flag;
        if(this.modelPrimitive) this.modelPrimitive.show = flag;
      }
    });
    handle.show = false;
    return handle;
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

// v37 safeguard
window.renderSelectionLabels = window.renderSelectionLabels || function(){};
