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
  const SHOULD_COLLAPSE_CONTROLS_ON_INTERIOR = IS_MOBILE;

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
  let desiredMSE = IS_IOS ? 14 : 12;

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
    const carto = Cesium.Cartographic.fromDegrees(lon, lat);
    if (GOOGLE_3D_TILES) {
      try {
        await GOOGLE_3D_TILES.readyPromise;
        const h = await Cesium.sampleHeightMostDetailed(GOOGLE_3D_TILES, carto);
        if (Number.isFinite(h)) return h;
      } catch(e){}
    }
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

  const headerLeft = document.createElement('div');
  headerLeft.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0';
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
  hTitle.style.cssText="font-weight:700;font-size:16px";
  headerLeft.appendChild(hTitle);

  const headerLabelsWrap = null;

  const headerFutureWrap = document.createElement('label');
  headerFutureWrap.style.cssText = "display:none;align-items:center;gap:6px;font-size:12px;white-space:nowrap";
  headerFutureWrap.innerHTML = '<input id="showFutureProjectsToggle" type="checkbox"><span>Show future</span>';
  header.appendChild(headerFutureWrap);

  const panelBody = document.createElement('div');
  panelBody.style.cssText="display:flex;flex-direction:column;gap:8px";
  chartDiv.appendChild(panelBody);

  let collapsed=false;
  function setCollapsed(c){
    collapsed=!!c;
    panelBody.style.display=collapsed?'none':'flex';
    collapseBtn.textContent=collapsed?'☰':'✕';
    collapseBtn.title=collapsed?'Open controls':'Close controls';
    collapseBtn.setAttribute('aria-label', collapsed?'Open controls':'Close controls');
  }
  collapseBtn.onclick=()=>setCollapsed(!collapsed);

  const selectBox = document.createElement('select');
  selectBox.className = 'ui-select';
  selectBox.style.cssText="width:100%;padding:8px;border-radius:8px";
  panelBody.appendChild(selectBox);

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
          </select>
        </label>
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px;min-width:0">Panorama key / title
          <input id="labelActionValueInput" class="ui-input" type="text" placeholder="e.g. livingroom" style="padding:8px;border-radius:8px;box-sizing:border-box;width:100%;min-width:0">
        </label>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;min-width:0">
        <button id="pickLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer">Pick label position</button>
        <button id="newLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer">New label</button>
        <button id="deleteLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer;border-color:#ffcdd2;color:#b71c1c">Delete selected</button>
      </div>
      <div id="labelEditorStatus" style="font-size:12px;color:#555">No label selected</div>
      <div id="labelList" style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto;min-width:0"></div>
      <textarea id="labelsExportBox" class="ui-input" rows="2" style="display:none"></textarea>
    </div>`;
  panelBody.appendChild(labelToolsCard);
  const showLabelsToggle = labelToolsCard.querySelector('#showLabelsToggle');
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
  const deleteLabelBtn = labelToolsCard.querySelector('#deleteLabelBtn');
  const labelEditorStatus = labelToolsCard.querySelector('#labelEditorStatus');
  const labelList = labelToolsCard.querySelector('#labelList');
  const labelDistanceRange = labelToolsCard.querySelector('#labelDistanceRange');
  const labelDistanceValue = labelToolsCard.querySelector('#labelDistanceValue');
  const labelsExportBox = labelToolsCard.querySelector('#labelsExportBox');

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
    panoramaDragController.disable();
    viewer.scene.camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
    ssc.enableInputs = true;
    ssc.enableRotate = true;
    ssc.enableTranslate = false;
    ssc.enableTilt = true;
    ssc.enableLook = false;
    ssc.enableZoom = true;
    ssc.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
    ssc.translateEventTypes = [];
    ssc.tiltEventTypes = [Cesium.CameraEventType.RIGHT_DRAG, Cesium.CameraEventType.PINCH];
    ssc.lookEventTypes = [];
  }
  function setInteriorMouseBindings(){
    panoramaDragController.disable();
    viewer.scene.camera.constrainedAxis = undefined;
    ssc.enableInputs = true;
    ssc.enableRotate=false; ssc.enableTranslate=false; ssc.enableTilt=false;
    ssc.enableLook=true;
    ssc.lookEventTypes=[Cesium.CameraEventType.LEFT_DRAG];
    ssc.rotateEventTypes=[]; ssc.translateEventTypes=[]; ssc.tiltEventTypes=[];
  }
  function setPanoramaMouseBindings(){
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
  setExteriorMouseBindings();

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

  // ===== Admin auth (editor-only) =====
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = 'HomeView2026!';
  const EDITOR_AUTH_STORAGE_KEY = 'homeview.editorAuth';
  const EDITOR_SAVE_ENDPOINT = '/api/save-editor';
  const EDITOR_SAVE_SECRET = '';
  function isEditorAdmin(){
    try{ return sessionStorage.getItem(EDITOR_AUTH_STORAGE_KEY) === '1'; }catch(_){ return false; }
  }
  function setEditorAdmin(v){
    try{
      if(v) sessionStorage.setItem(EDITOR_AUTH_STORAGE_KEY,'1');
      else sessionStorage.removeItem(EDITOR_AUTH_STORAGE_KEY);
    }catch(_){ }
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

  function updateEditorAuthUI(){
    const unlocked = isEditorAdmin();
    openEditorAuthBtn.textContent = unlocked ? 'Editor unlocked' : 'Enter editor';
    editorAuthStatus.textContent = unlocked ? 'Editor mode is unlocked on this device session.' : 'Editor mode is locked.';
    editorLogoutBtn.style.display = unlocked ? 'inline-flex' : 'none';
    if(!unlocked){
      editorPasswordInput.value = '';
    }
    try{
      if(typeof syncLabelToolsVisibility === 'function') syncLabelToolsVisibility();
      if(typeof refreshLabelListUI === 'function') refreshLabelListUI();
      if(typeof renderActiveLabels === 'function') renderActiveLabels();
    }catch(_){}
  }
  openEditorAuthBtn.addEventListener('click', ()=>{
    editorAuthPanel.style.display = (editorAuthPanel.style.display === 'none' || !editorAuthPanel.style.display) ? 'flex' : 'none';
    if(editorAuthPanel.style.display === 'flex' && !isEditorAdmin()){
      setTimeout(()=>{ try{ editorUsernameInput.focus(); }catch(_){ } }, 0);
    }
  });
  editorLoginBtn.addEventListener('click', ()=>{
    const u = String(editorUsernameInput.value || '').trim();
    const p = String(editorPasswordInput.value || '');
    if(u === ADMIN_USERNAME && p === ADMIN_PASSWORD){
      setEditorAdmin(true);
      editorPasswordInput.value = '';
      editorAuthStatus.textContent = 'Login successful. Editor mode is now unlocked.';
      updateEditorAuthUI();
      try{
        if(typeof syncLabelToolsVisibility === 'function') syncLabelToolsVisibility();
        if(typeof refreshLabelListUI === 'function') refreshLabelListUI();
      }catch(_){}
    }else{
      editorAuthStatus.textContent = 'Incorrect username or password.';
    }
  });
  editorLogoutBtn.addEventListener('click', ()=>{
    setEditorAdmin(false);
    editorPasswordInput.value = '';
    editorAuthStatus.textContent = 'You have been logged out from editor mode.';
    updateEditorAuthUI();
  });
  updateEditorAuthUI();

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
  const DEFAULT_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzIiszffeGdD1fnvB0iHNVzwYD3izOcVMlwQnZqVjQ3gqFCbmKPb2voejL1re1pBxL44w/exec";
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

  // ===== Load & Build =====
  fetchAppJson('get_all_data').then(async (allData)=>{
    if(!allData || !allData.ok) throw new Error((allData && allData.error) || 'Unable to load project data from Apps Script');
    const b = (allData.buildings || []).map(canonicalizeRow).filter(r=>r.model_url && r.lat && r.lng && (r.estimated_price || r.estimated_price_first));
    buildingsData = b;
    const p = (allData.pois || []).map(canonicalizeRow).filter(r=>r.name && r.lat && r.lng && r.type);
    const inter = (allData.interiors || []).map(canonicalizeRow).filter(r=>(r.unit_name || r.name || r.title) && (r.building_key || r.parent || r.name));
    const viewRows = (allData.views || []).map(canonicalizeRow);

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
      if(!isEditorAdmin()){
        adminBuildingViewsCard.style.display = 'none';
        adminBuildingViewsSummary.textContent = '';
        adminBuildingViewsList.innerHTML = '';
        return;
      }
      const rows = getBuildingUnitViews(buildingKey);
      const total = rows.reduce(function(sum, item){ return sum + toViewCount(item.views); }, 0);
      adminBuildingViewsSummary.innerHTML = '<div><strong>Total Unit Views:</strong> ' + total.toLocaleString() + '</div>';
      adminBuildingViewsList.innerHTML = '';
      if(!rows.length){
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:12px;color:#666';
        empty.textContent = 'No unit view data found for this building yet.';
        adminBuildingViewsList.appendChild(empty);
      }else{
        rows.forEach(function(item){
          const rowEl = document.createElement('div');
          rowEl.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:6px 8px;border-radius:8px;background:#f8f8f8';
          const nameEl = document.createElement('div');
          nameEl.textContent = item.unit_name;
          const valueEl = document.createElement('div');
          valueEl.style.cssText = 'font-weight:700';
          valueEl.textContent = String(toViewCount(item.views));
          rowEl.appendChild(nameEl);
          rowEl.appendChild(valueEl);
          adminBuildingViewsList.appendChild(rowEl);
        });
      }
      adminBuildingViewsCard.style.display = 'block';
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
    for (let i=0;i<b.length;i++){
      const row = b[i];
      const ent = await createBuildingModel(row,viewer);
      ent.show=(i===0);
      modelEntities.push(ent);
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
    function stylePoiChip(btn, hidden){
      btn.style.opacity = hidden ? "0.6" : "1";
      btn.style.background = hidden ? "#fff" : "#eef2ff";
    }
    function syncFutureProjectsChip(){
      if(showFutureProjectsToggle) showFutureProjectsToggle.checked = !!(futureProjectsChipBtn && futureProjectsChipBtn.dataset.enabled === '1');
      if(!futureProjectsChipBtn) return;
      stylePoiChip(futureProjectsChipBtn, futureProjectsChipBtn.dataset.enabled !== '1');
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
        futureProjectsChipBtn.className='ui-btn';
        futureProjectsChipBtn.textContent='Future projects';
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
        btn.className='ui-btn';
        btn.textContent=tn;
        btn.style.cssText="padding:6px 10px;border-radius:999px;cursor:pointer;font-size:12px";
        stylePoiChip(btn, hiddenPoiTypes.has(tn));
        btn.onclick=()=>{
          if(hiddenPoiTypes.has(tn)) hiddenPoiTypes.delete(tn);
          else hiddenPoiTypes.add(tn);
          stylePoiChip(btn, hiddenPoiTypes.has(tn));
          applyPoiTypeFilters(Number(selectBox.value));
          mini.refreshCity(Number(selectBox.value));
          updateCommute(Number(selectBox.value));
        };
        filterRow.appendChild(btn);
      });
    }

    // POI sources
    const poiSources=[]; const poiIndexById=new Map(); const pinBuilder=new Cesium.PinBuilder();
    function colorForType(type){ const t=(type||'').toLowerCase(); if(t.includes('super'))return Cesium.Color.fromCssColorString('#2e7d32'); if(t.includes('school')||t.includes('univ'))return Cesium.Color.fromCssColorString('#1565c0'); if(t.includes('hosp')||t.includes('clinic'))return Cesium.Color.fromCssColorString('#c62828'); if(t.includes('park'))return Cesium.Color.fromCssColorString('#2e7d32').withAlpha(0.85); if(t.includes('transit')||t.includes('station')||t.includes('bus'))return Cesium.Color.fromCssColorString('#6d4c41'); if(t.includes('gym')||t.includes('fitness'))return Cesium.Color.fromCssColorString('#8e24aa'); if(t.includes('cafe')||t.includes('coffee'))return Cesium.Color.fromCssColorString('#5d4037'); return Cesium.Color.fromCssColorString('#455a64'); }
    function poiBillboard(type,icon){ const col=colorForType(type); const img = icon? pinBuilder.fromText(icon,col,42).toDataURL() : pinBuilder.fromColor(col,32).toDataURL(); return { image:img, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, scale:1, disableDepthTestDistance:Number.POSITIVE_INFINITY }; }
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
        const ent=ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(plng,plat,0),
          billboard: poiBillboard(type,(poi.icon||'').trim()),
          label: { text: (poi.name||'') + '\n' + formatPoiTravelLine(dist), font:"14px sans-serif", fillColor:Cesium.Color.BLACK, outlineColor:Cesium.Color.WHITE, outlineWidth:3, style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.TOP, horizontalOrigin: Cesium.HorizontalOrigin.CENTER, pixelOffset: new Cesium.Cartesian2(0, -42), showBackground:true, backgroundColor:Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.75), disableDepthTestDistance:Number.POSITIVE_INFINITY },
          properties: { type, url: poi.url||'', name: poi.name||'', distance_m:Math.round(dist), baseLat:plat, baseLng:plng, groundOffset:2 },
          show: i===0
        });
        poiIndexById.set(ent.id,{dsIndex:i});
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
    }

    function endViewLoad(){
      viewLoadLockCount = Math.max(0, viewLoadLockCount - 1);
      if(viewLoadLockCount === 0) setSelectionControlsDisabled(false, '');
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
      const attempts = [18000, 26000];
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
      const key=normKey(br.name); const list=interiorsByKey.get(key)||[];
      interiorMetaByBuilding[i]=list;
      interiorEntitiesByBuilding[i]=new Array(list.length).fill(null);
      interiorLoadPromisesByBuilding[i]=new Array(list.length).fill(null);
      interiorBlobUrlsByBuilding[i]=new Array(list.length).fill(null);
      interiorBlobFetchPromisesByBuilding[i]=new Array(list.length).fill(null);
    }

    async function ensureInteriorEntity(bIdx, itemIdx){
      const meta = (interiorMetaByBuilding[bIdx]||[])[itemIdx] || null;
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
      if(!options.silent) requestSceneRenderBurst(4);
    }

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
        if(parts.length >= 3){
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
        return { key:key, title:title, url:url.trim() };
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
        const reloaded = await ensureInteriorEntity(state.bIdx, state.itemIdx);
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
    function getAreaM2(unitRow){
      let a = unitRow ? (unitRow.area_m2||unitRow.area_sqm||unitRow.area||unitRow.square_footage) : null;
      if(a && String(a).toLowerCase().includes('sqft')){ const n=parseFirstNumber(a); return Number.isFinite(n)? n*0.092903 : NaN; }
      let v = parseFirstNumber(a);
      if(Number.isFinite(v)){
        const s = String(a).toLowerCase();
        if(s.includes('sqft') || s.includes('ft²') || s.includes('ft2') || s.includes('sq ft')) return v*0.092903;
        return v;
      }
      const sqft = unitRow ? (unitRow.area_sqft||unitRow.sqm_ft) : null;
      const s2 = parseFirstNumber(sqft);
      return Number.isFinite(s2) ? s2*0.092903 : NaN;
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
        const br=b[bIdx], ur=(interiorMetaByBuilding[bIdx]||[])[uIdx]||{};
        const price=getCurrentPrice(ur,br);
        const area=getAreaM2(ur);
        const beds=getBeds(ur);
        const baths=getBaths(ur);
        const parking=getParkingSpaces(ur);
        const fee=getMaintenanceFee(ur);
        const year=getYearBuilt(ur);
        const monthly = Number.isFinite(price) ? -pmt((loan.rate||0)/12, (loan.termY||20)*12, price*(1-(loan.dpct||20)/100)) : NaN;
        const name=ur.unit_name||ur.name||('Unit '+(uIdx+1));
        return {name,price,area,beds,baths,parking,fee,year,monthly};
      });
      const head='<tr style="font-weight:700"><td></td><td>Price</td><td>Area</td><td>Beds</td><td>Baths</td><td>Parking</td><td>Fee</td><td>Year</td><td>Monthly</td></tr>';
      const trs=rows.map(r=>`<tr><td style="font-weight:600">${r.name}</td><td>${fmtUSD(r.price)}</td><td>${Number.isFinite(r.area)?r.area.toFixed(1)+' m²':'—'}</td><td>${r.beds!=null?r.beds:'—'}</td><td>${r.baths!=null?r.baths:'—'}</td><td>${r.parking!=null?r.parking:'—'}</td><td>${fmtMoneyNoDash(r.fee)||'—'}</td><td>${r.year!=null?r.year:'—'}</td><td>${fmtUSD(r.monthly)}</td></tr>`).join('');
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
      const list=(interiorMetaByBuilding[bIdx]||[]);
      const br=b[bIdx];
      const base=list[uIdx]||{};
      const priceBase=getCurrentPrice(base,br);
      const areaBase=getAreaM2(base);
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
        const ar=getAreaM2(ur);
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
        btn.innerHTML=`<div style="font-weight:600">${nm}</div><div style="font-size:12px;opacity:.8">${fmtUSD(it.pr)} ${Number.isFinite(it.ar)?'• '+it.ar.toFixed(0)+' m²':''} ${it.ba!=null?'• '+it.ba+' bath':''} ${it.pk!=null?'• '+it.pk+' parking':''} ${it.yr!=null?'• '+it.yr:''}</div>`;
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
        root,
        show(){ root.style.display='block'; },
        hide(){ root.style.display='none'; },
        setMode, refreshCity(idx){
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


    // ===== 3D Label Overlay / Editor =====
    const labelEditorState = {
      enabled: false,
      editMode: false,
      pendingPick: false,
      selectedLabelIndex: -1,
      currentSelection: null,
      cache: new Map(),
      entities: []
    };

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
        const actionValue = String(bits.slice(5).join('|') || '').trim();
        return {
          text:text||'Label',
          x, y, z,
          scale:Number.isFinite(scale)&&scale>0?scale:1,
          color,
          actionType,
          actionValue
        };
      }).filter(Boolean);
    }
    function formatLabelAnnotations(items){
      return (items||[]).map(function(it){
        const x = Number(it.x||0).toFixed(2).replace(/\.00$/,'');
        const y = Number(it.y||0).toFixed(2).replace(/\.00$/,'');
        const z = Number(it.z||0).toFixed(2).replace(/\.00$/,'');
        const sc = Number(it.scale||1).toFixed(2).replace(/\.00$/,'');
        return [
          String(it.text||'Label').replace(/[;|]/g,' ').trim(),
          [x,y,z].join(','),
          sc,
          it.color||'#00ff88',
          String(it.actionType||'none').replace(/[;|]/g,' ').trim() || 'none',
          String(it.actionValue||'').replace(/[;]/g,' ').trim()
        ].join('|');
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
          actionValue:String(it.actionValue || '')
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
      const ent = (interiorEntitiesByBuilding[sel.bIdx]||[])[sel.itemIdx] || null;
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
      if(labelActionValueInput) labelActionValueInput.placeholder = isPano ? 'e.g. kitchen' : '';
      if(labelCurrentSceneHint) labelCurrentSceneHint.style.display = isPano ? 'block' : 'none';
      if(labelActionValueList) labelActionValueList.innerHTML = '';
      if(!isPano){
        if(labelCurrentSceneHint) labelCurrentSceneHint.textContent = 'Current panorama scene: —';
        return;
      }
      const active = getActivePanoramaItemForSelection(sel);
      if(labelCurrentSceneHint) labelCurrentSceneHint.textContent = 'Current panorama scene: ' + (active ? (active.title || active.key) : '—');
      const cfg = getPanoramaConfig(sel.meta, sel.row);
      (cfg.items || []).forEach(function(it){
        const op = document.createElement('option');
        op.value = String(it.key || it.title || '');
        op.label = String(it.title || it.key || '');
        labelActionValueList.appendChild(op);
      });
    }

    function renderSelectionLabels(){
      clearRenderedLabels();
      const sel = labelEditorState.currentSelection;
      if(!sel || sel.isExterior || !showLabelsToggle.checked) return;
      const anchor = getSelectionAnchor(sel); if(!anchor) return;
      const items = getCurrentSelectionLabels();
      items.forEach(function(it){
        const local = new Cesium.Cartesian3(Number(it.x)||0, Number(it.y)||0, Number(it.z)||0);
        const world = Cesium.Matrix4.multiplyByPoint(anchor.matrix, local, new Cesium.Cartesian3());
        const col = Cesium.Color.fromCssColorString(it.color||'#00ff88');
        const e = viewer.entities.add({
          position: world,
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
            scale: 1.0
          },
          properties: {
            hvLabelActionType: String(it.actionType || 'none'),
            hvLabelActionValue: String(it.actionValue || ''),
            hvLabelText: String(it.text || 'Label')
          }
        });
        labelEditorState.entities.push(e);
      });
    }
    function refreshLabelListUI(){
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
        btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-weight:600">'+(it.text||('Label '+(idx+1)))+'</div><div style="width:14px;height:14px;border-radius:999px;border:1px solid #bbb;flex:0 0 auto;background:'+(it.color||'#00ff88')+'"></div></div><div style="font-size:12px;opacity:.8">x '+Number(it.x).toFixed(2)+' • y '+Number(it.y).toFixed(2)+' • z '+Number(it.z).toFixed(2)+' • scale '+Number(it.scale||1).toFixed(2)+ actionNote +'</div>';
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

      labelToolsCard.style.display = usable ? 'block' : 'none';
      adminUnitEditorCard.style.display = (usable && admin) ? 'block' : 'none';
      if(!usable){
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
    showLabelsToggle.addEventListener('change', function(){ renderSelectionLabels(); });
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
        actionValue: String(labelActionValueInput && labelActionValueInput.value || '').trim()
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
    const response = await fetchAppJson('save_interior_updates', payload);
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


    async function applyPanoramaSelectionForCurrent(actionValue){
      const sel = labelEditorState.currentSelection;
      if(!sel || sel.isExterior || !sel.meta || !isPanoramaRow(sel.meta)) return false;
      const item = resolvePanoramaItem(sel.meta, sel.row, actionValue);
      if(!item || !item.url) return false;

      const key = makeCustomizationSelectionKey(sel.bIdx, sel.itemIdx);
      panoramaSelectionsByKey.set(key, item);

      const thisToken = ++panoramaApplyToken;
      beginViewLoad('Loading panorama...');
      await showPanoramaTransition('Loading panorama...');
      try{
        destroyInteriorEntity(sel.bIdx, sel.itemIdx, { keepBlobUrl: true, silent: true });
        const reloaded = await ensureInteriorEntity(sel.bIdx, sel.itemIdx);
        if(thisToken !== panoramaApplyToken) return true;
        if(reloaded) reloaded.show = true;
        updatePanoramaLabelUiHints();
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
      return false;
    }

    // ===== Picking (POI tooltip) =====
    const handler=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(async function (m){
      if(labelEditorState.editMode && labelEditorState.pendingPick){
        const used = handleLabelPlacement(m.position);
        if(used){ tip.style.display='none'; return; }
      }
      const picked=viewer.scene.pick(m.position);
      if(await handleInteractiveLabelActionFromPick(picked)){ tip.style.display='none'; return; }
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
      const idx=Number(selectBox.value);
      applyPoiTypeFilters(idx);
    }

    function rebuildViewOptions(idx){
      viewSelect.innerHTML='';
      const o=document.createElement('option'); o.value='exterior'; o.textContent='Building View'; viewSelect.appendChild(o);
      const list=interiorMetaByBuilding[idx]||[];
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
    }

    // ===== Update View =====
    function scheduleViewUpdate(){
      const idx = Number(selectBox.value);
      const delay = IS_MOBILE ? 180 : 0;
      if(mobileViewChangeTimer){ clearTimeout(mobileViewChangeTimer); mobileViewChangeTimer = null; }
      if(delay > 0){
        mobileViewChangeTimer = setTimeout(function(){
          mobileViewChangeTimer = null;
          updateView(idx);
        }, delay);
      } else {
        updateView(idx);
      }
    }

    selectBox.addEventListener('change', async ()=>{
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
  const area = getAreaM2(source);
  const beds = getBeds(source);
  const baths = getBaths(source);
  const parking = getParkingSpaces(source);
  const fee = getMaintenanceFee(source);
  const year = getYearBuilt(source);
  const lists = getFeatureLists(source);

  renderDetailGrid(unitSpecsGrid, [
    ['Price', fmtMoneyNoDash(price)],
    ['Area', Number.isFinite(area) ? area.toFixed(1) + ' m²' : firstFilled(source.square_footage, source.area, source.area_sqft)],
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
      const selectedMeta=(interiorMetaByBuilding[idx]||[])[selectedIndex]||null;
      const selectedIsAmenity = !isExterior && selectedKind==='amenity' && !!selectedMeta;
      const selectedIsPanorama = !isExterior && selectedKind==='panorama' && !!selectedMeta;
      if(SHOULD_COLLAPSE_CONTROLS_ON_INTERIOR){
        setCollapsed(!isExterior);
      } else {
        setCollapsed(false);
      }
      setCesiumGroundVisible(!selectedIsPanorama);
      if(selectedIsPanorama){
        showLabelsToggle.checked = true;
      }
      if(isExterior || selectedIsAmenity || !selectedMeta || (selectedKind!=='unit' && selectedKind!=='panorama')){
        unitViewsState.lastTrackedKey = '';
      }
      currentMode = isExterior ? 'exterior' : (selectedIsPanorama ? 'panorama' : (selectedIsAmenity ? 'amenity' : 'interior'));
      labelEditorState.currentSelection = { bIdx: idx, kind: selectedKind, itemIdx: selectedIndex, meta: selectedMeta, row: row, isExterior: isExterior };

      const thisSwitchToken = ++interiorSwitchToken;
      const hasRealModel = !!selectedMeta && isLikelyModelUrl(selectedMeta.model_url);
      const wantsInteriorModel = !isExterior && !!selectedMeta && hasRealModel && (selectedKind==='unit' || selectedKind==='amenity' || selectedKind==='panorama');

      stopCameraTracking();
      modelEntities.forEach((ent,i)=> ent.show=(i===idx)&&isExterior);
      destroyNonActiveInteriorEntities(wantsInteriorModel ? { bIdx: idx, itemIdx: selectedIndex } : null);

      let activeInteriorEntity = null;
      if(wantsInteriorModel){
        activeInteriorSelection = { bIdx: idx, itemIdx: selectedIndex };
        title.textContent = (row.name||'') + (getItemDisplayName(selectedMeta) ? ' — ' + getItemDisplayName(selectedMeta) : '') + ' (loading...)';
        beginViewLoad('Loading selected model...');
        didBeginLoad = true;
        requestSceneRenderBurst(3);
        try{
          activeInteriorEntity = await ensureInteriorEntity(idx, selectedIndex);
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

      if(wantsInteriorModel && !activeInteriorEntity){
        title.textContent = (row.name||'') + (getItemDisplayName(selectedMeta) ? ' — ' + getItemDisplayName(selectedMeta) : '') + ' (model failed to load)';
        descBox.style.display = 'block';
        descBox.textContent = 'The model did not finish loading. Please try this unit again.';
        hideUnitMetaUI();
        hideFinishCard();
        priceCanvas.style.display='none';
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
          const orbitFrame = Cesium.Transforms.eastNorthUpToFixedFrame(center);
          viewer.scene.camera.lookAtTransform(orbitFrame, new Cesium.HeadingPitchRange(heading,pitch,distance));
          requestSceneRenderBurst(3);
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

        priceCanvas.style.display='none';
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

        const saved = Number(localStorage.getItem('ui.fovInterior'))||80;
        const fr=viewer.camera.frustum;
        if(fr && 'fov' in fr) fr.fov = saved * Math.PI/180;
        fovRange.value = String(saved);
        fovValEl.textContent = saved;

        title.textContent=(row.name||'') + (getItemDisplayName(selectedMeta) ? ' — ' + getItemDisplayName(selectedMeta) : '');
        renderUnitMetaUI(meta, row);
        hideFinishCard();
        if(isEditorAdmin()) populateAdminEditor(selectedMeta, row);
        await trackUnitView(firstFilled(meta.building_key, row.building_key, row.name, row.title), getItemDisplayName(meta));
        const panoNames = panoCfg.items.map(function(it){ return it.title || it.key; }).filter(Boolean);
        const dBase = getItemDescription(selectedMeta, row).trim();
        const dExtra = activePano ? ('Current panorama: ' + (activePano.title || activePano.key || '—')) : '';
        const dList = panoNames.length ? ('Available panoramas: ' + panoNames.join(', ')) : '';
        const d = [dBase, dExtra, dList].filter(Boolean).join('\n');
        descBox.style.display = d ? 'block' : 'none';
        descBox.textContent = d;
        adminBuildingViewsCard.style.display = 'none';

        const chartSeries = firstFilled(meta.estimated_price_unit, meta.estimated_price, row.estimated_price);
        if (chartSeries) {
          priceCanvas.style.display='block';
          drawPriceChart(priceCanvas, chartSeries);
        } else {
          priceCanvas.style.display='none';
        }

        const autoPrice=getCurrentPrice(meta,row);
        const hasComparablePrice = Number.isFinite(autoPrice) && autoPrice > 0;
        loanCard.style.display = hasComparablePrice ? 'block' : 'none';
        compareCard.style.display = hasComparablePrice ? 'block' : 'none';
        similarCard.style.display = hasComparablePrice ? 'block' : 'none';
        priceCard.style.display = hasComparablePrice ? 'block' : 'none';
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
        setInteriorMouseBindings();
        interiorNav.enable();
        setJoystickVisible(true);

        const saved = Number(localStorage.getItem('ui.fovInterior'))||80;
        const fr=viewer.camera.frustum;
        if(fr && 'fov' in fr) fr.fov = saved * Math.PI/180;
        fovRange.value = String(saved);
        fovValEl.textContent = saved;

        title.textContent=(row.name||'') + (getItemDisplayName(selectedMeta) ? ' — ' + getItemDisplayName(selectedMeta) : '');
        hideUnitMetaUI();
        await syncCustomizationUIForSelection(idx, k, selectedMeta, row, ent);
        if(isEditorAdmin()) populateAdminEditor(selectedMeta, row);
        const d = getItemDescription(selectedMeta, row).trim();
        descBox.style.display = d ? 'block' : 'none';
        descBox.textContent = d;
        adminBuildingViewsCard.style.display = 'none';

        priceCanvas.style.display='none';
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
          const target=ent.position.getValue(Cesium.JulianDate.now());
          const camHead=Cesium.Math.toRadians(parseFirstNumber(meta.camera_heading!=null?meta.camera_heading:row.heading)||0);
          const camPitch=Cesium.Math.toRadians(parseFirstNumber(meta.camera_pitch)||-15);
          const range = parseFirstNumber(meta.camera_distance) || Math.max(30,(parseFirstNumber(meta.scale)||8)*15);

          viewer.scene.camera.lookAt(target, new Cesium.HeadingPitchRange(camHead,camPitch,range));
          viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          requestSceneRender();
          syncInteriorClipForSelection(meta, row, false);
          setCameraCollision(false);
          setInteriorMouseBindings(); interiorNav.enable(); setJoystickVisible(true);

          const saved = Number(localStorage.getItem('ui.fovInterior'))||80;
          const fr=viewer.camera.frustum; if(fr && 'fov' in fr) fr.fov = saved * Math.PI/180;
          fovRange.value = String(saved); fovValEl.textContent = saved;

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

          const chartSeries = firstFilled(meta.estimated_price_unit, meta.estimated_price, row.estimated_price);
          if (chartSeries) {
            priceCanvas.style.display='block';
            drawPriceChart(priceCanvas, chartSeries);
          } else {
            priceCanvas.style.display='none';
          }

          loanCard.style.display='block';
          compareCard.style.display='block';
          similarCard.style.display='block';
          priceCard.style.display='block';

          const autoPrice=getCurrentPrice(meta,row);
          loanPrice.value = Number.isFinite(autoPrice) && autoPrice>0 ? String(autoPrice) : '';
          recalcLoan();

          mini.show();
          mini.showPlanForUnit(idx,k,meta);
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
          priceCanvas.style.display='none';
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
    }

    function refreshAllCityLayers(idx){
      applyPoiTypeFilters(idx);
    }
    selectBox.addEventListener('change',()=>refreshAllCityLayers(Number(selectBox.value)));

    // init
    setCollapsed(false);
    rebuildViewOptions(0);
    updateView(0);
    requestSceneRender();

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

  async function createInteriorModel(bRow,uRow,viewer,modelUrl,finishSelections,panoramaSelection){
    const baseLon=toNum(bRow.lng), baseLat=toNum(bRow.lat), baseH=toNum(bRow.height)||20;
    const baseSurfaceH = await getSurfaceHeight(baseLon, baseLat);
    const offE=toNum(uRow.offset_east_m)||0, offN=toNum(uRow.offset_north_m)||0, offU=toNum(uRow.offset_up_m)||0;
    const pos=placeWithEnuOffset(baseLon,baseLat,baseSurfaceH + baseH,offE,offN,offU);
    const hd=parseFirstNumber(uRow.heading!=null?uRow.heading:bRow.heading)||0;
    const hpr=new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(hd), Cesium.Math.toRadians(toNum(uRow.pitch)||0), Cesium.Math.toRadians(toNum(uRow.roll)||0));
    const ori=Cesium.Transforms.headingPitchRollQuaternion(pos,hpr);
    const scale=toNum(uRow.scale)||8;
    const name=uRow.unit_name||uRow.name||'Unit';
    const minPx = IS_MOBILE ? 48 : 96;
    const maxScale = IS_MOBILE ? Math.min(scale, 6) : scale;

    const anchorEntity = viewer.entities.add({
      name:name,
      position:pos,
      orientation:new Cesium.ConstantProperty(ori),
      label:{ text:name, font:"15px sans-serif", fillColor:Cesium.Color.WHITE, outlineColor:Cesium.Color.BLACK, outlineWidth:2, style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance:Number.POSITIVE_INFINITY, pixelOffset:new Cesium.Cartesian2(0, -24) },
      show:false
    });

    const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(pos, hpr);
    let hvRawGltf = null;
    const modelPrimitive = await Cesium.Model.fromGltfAsync({
      url:modelUrl,
      modelMatrix:modelMatrix,
      scale:scale,
      minimumPixelSize:minPx,
      maximumScale:maxScale,
      shadows:Cesium.ShadowMode.DISABLED,
      incrementallyLoadTextures:false,
      asynchronous:true,
      allowPicking:true,
      gltfCallback:function(gltf){
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
      }
    });
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
