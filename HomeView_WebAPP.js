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
  function hasTextValue(v){ return v !== undefined && v !== null && String(v).trim() !== ''; }
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
  function isAmenityRow(item){
    if(!item) return false;
    const explicit = firstFilled(item.category, item.type, item.kind, item.item_type).toLowerCase();
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
  function isUnitRow(item){ return !!item && !isAmenityRow(item); }

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

  const headerLabelsWrap = document.createElement('label');
  headerLabelsWrap.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;margin-left:auto;white-space:nowrap";
  headerLabelsWrap.innerHTML = '<input id="showLabelsHeaderToggle" type="checkbox"><span>Show labels</span>';
  header.appendChild(headerLabelsWrap);

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
  labelToolsCard.style.cssText = "border-radius:12px;padding:10px;display:none";
  labelToolsCard.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div style="font-weight:700">3D Labels</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px">
          <input id="showLabelsToggle" type="checkbox">
          <span>Show labels</span>
        </label>
        <button id="editLabelsBtn" class="ui-btn" style="border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer">Edit labels</button>
      </div>
    </div>
    <div id="labelEditorBody" style="display:none;flex-direction:column;gap:8px;margin-top:10px">
      <div style="font-size:12px;line-height:1.5;color:#444">Click <b>Pick label position</b>, then click anywhere on the current 3D model to place a text label. Copy the exported string and save it into the sheet column <b>label_annotations</b>.</div>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Label text
        <input id="labelTextInput" class="ui-input" type="text" placeholder="e.g. 4 m / King Bed / Balcony" style="padding:8px;border-radius:8px">
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Raise (m)<input id="labelRaiseInput" class="ui-input" type="number" value="0" step="0.1" style="padding:8px;border-radius:8px"></label>
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Scale<input id="labelScaleInput" class="ui-input" type="number" value="1" step="0.1" style="padding:8px;border-radius:8px"></label>
        <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Color<input id="labelColorInput" class="ui-input" type="color" value="#00ff88" style="padding:4px;border-radius:8px;height:38px"></label>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button id="pickLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer">Pick label position</button>
        <button id="newLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer">New label</button>
        <button id="deleteLabelBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer;border-color:#ffcdd2;color:#b71c1c">Delete selected</button>
        <button id="copyLabelsBtn" class="ui-btn" style="border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer">Copy export string</button>
      </div>
      <div id="labelEditorStatus" style="font-size:12px;color:#555">No label selected</div>
      <div id="labelList" style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto"></div>
      <label style="display:flex;flex-direction:column;font-size:12px;gap:4px">Export string
        <textarea id="labelsExportBox" class="ui-input" rows="5" style="padding:8px;border-radius:8px;resize:vertical"></textarea>
      </label>
    </div>`;
  panelBody.appendChild(labelToolsCard);
  const showLabelsToggle = header.querySelector('#showLabelsHeaderToggle');
  const editLabelsBtn = labelToolsCard.querySelector('#editLabelsBtn');
  const labelEditorBody = labelToolsCard.querySelector('#labelEditorBody');
  const labelTextInput = labelToolsCard.querySelector('#labelTextInput');
  const labelRaiseInput = labelToolsCard.querySelector('#labelRaiseInput');
  const labelScaleInput = labelToolsCard.querySelector('#labelScaleInput');
  const labelColorInput = labelToolsCard.querySelector('#labelColorInput');
  const pickLabelBtn = labelToolsCard.querySelector('#pickLabelBtn');
  const newLabelBtn = labelToolsCard.querySelector('#newLabelBtn');
  const deleteLabelBtn = labelToolsCard.querySelector('#deleteLabelBtn');
  const labelEditorStatus = labelToolsCard.querySelector('#labelEditorStatus');
  const labelList = labelToolsCard.querySelector('#labelList');
  const labelsExportBox = labelToolsCard.querySelector('#labelsExportBox');

  // Hide label editing tools by default; only admins can unlock them.
  editLabelsBtn.style.display = 'none';
  labelEditorBody.style.display = 'none';

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
    const b = Papa.parse(csvB,{header:true}).data.map(canonicalizeRow).filter(r=>r.model_url && r.lat && r.lng && (r.estimated_price || r.estimated_price_first));
    const p = Papa.parse(csvP,{header:true}).data.map(canonicalizeRow).filter(r=>r.name && r.lat && r.lng && r.type);
    const inter = Papa.parse(csvI,{header:true}).data.map(canonicalizeRow).filter(r=>(r.unit_name || r.name || r.title) && (r.building_key || r.parent || r.name));

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

    // Interiors / Amenities
    const interiorEntitiesByBuilding=[]; const interiorMetaByBuilding=[];
    for (let i=0;i<b.length;i++){
      const br = b[i];
      const key=normKey(br.name); const list=interiorsByKey.get(key)||[];
      interiorEntitiesByBuilding[i]=[]; interiorMetaByBuilding[i]=list;
      for (let k=0;k<list.length;k++){
        const u = list[k];
        let e = null;
        // Amenities may also have their own 3D model and placement data.
        // Create an entity for any selectable interior item that has a model_url.
        if (hasTextValue(u.model_url)) {
          e = await createInteriorModel(br,u,viewer);
          e.show=false;
        }
        interiorEntitiesByBuilding[i][k]=e;
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

    function getSelectionKey(sel){
      if(!sel || sel.isExterior) return '';
      return [sel.bIdx, sel.kind, sel.itemIdx].join(':');
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
        return { text:text||'Label', x, y, z, scale:Number.isFinite(scale)&&scale>0?scale:1, color };
      }).filter(Boolean);
    }
    function formatLabelAnnotations(items){
      return (items||[]).map(function(it){
        const x = Number(it.x||0).toFixed(2).replace(/\.00$/,'');
        const y = Number(it.y||0).toFixed(2).replace(/\.00$/,'');
        const z = Number(it.z||0).toFixed(2).replace(/\.00$/,'');
        const sc = Number(it.scale||1).toFixed(2).replace(/\.00$/,'');
        return [String(it.text||'Label').replace(/[;|]/g,' ').trim(), [x,y,z].join(','), sc, it.color||'#00ff88'].join('|');
      }).join('; ');
    }
    function getCurrentSelectionLabels(){
      const key = getSelectionKey(labelEditorState.currentSelection);
      if(!key) return [];
      if(!labelEditorState.cache.has(key)){
        const meta = labelEditorState.currentSelection.meta || {};
        const raw = firstFilled(meta.label_annotations, meta.labels_3d, meta.text_annotations, meta.annotation_labels);
        labelEditorState.cache.set(key, parseLabelAnnotations(raw));
      }
      return labelEditorState.cache.get(key);
    }
    function setCurrentSelectionLabels(items){
      const key = getSelectionKey(labelEditorState.currentSelection);
      if(!key) return;
      const clean = (items||[]).map(it=>({ text:String(it.text||'Label'), x:Number(it.x)||0, y:Number(it.y)||0, z:Number(it.z)||0, scale:(Number(it.scale)>0?Number(it.scale):1), color:it.color||'#00ff88' }));
      labelEditorState.cache.set(key, clean);
      if(labelEditorState.currentSelection && labelEditorState.currentSelection.meta){
        labelEditorState.currentSelection.meta.label_annotations = formatLabelAnnotations(clean);
      }
      labelsExportBox.value = formatLabelAnnotations(clean);
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
          }
        });
        labelEditorState.entities.push(e);
      });
    }
    function refreshLabelListUI(){
      const items = getCurrentSelectionLabels();
      labelsExportBox.value = formatLabelAnnotations(items);
      labelList.innerHTML='';
      items.forEach(function(it, idx){
        const btn = document.createElement('button');
        btn.className='ui-btn';
        btn.style.cssText='text-align:left;border-radius:10px;padding:8px;cursor:pointer';
        if(idx===labelEditorState.selectedLabelIndex) btn.style.background='#eef6ff';
        btn.innerHTML = '<div style="font-weight:600">'+(it.text||('Label '+(idx+1)))+'</div><div style="font-size:12px;opacity:.8">x '+Number(it.x).toFixed(2)+' • y '+Number(it.y).toFixed(2)+' • z '+Number(it.z).toFixed(2)+' • scale '+Number(it.scale||1).toFixed(2)+'</div>';
        btn.onclick=function(){
          labelEditorState.selectedLabelIndex = idx;
          labelTextInput.value = it.text||'';
          labelRaiseInput.value = Number(it.z||0).toFixed(2).replace(/\.00$/,'');
          labelScaleInput.value = Number(it.scale||1).toFixed(2).replace(/\.00$/,'');
          labelColorInput.value = it.color||'#00ff88';
          labelEditorStatus.textContent = 'Selected label #' + (idx+1) + ' — position is already stored; click Pick label position to move it.';
          refreshLabelListUI();
        };
        labelList.appendChild(btn);
      });
      if(!items.length) labelList.innerHTML='<div style="font-size:12px;color:#666">No labels yet for this item.</div>';
      renderSelectionLabels();
    }
    function syncLabelToolsVisibility(){
      const sel = labelEditorState.currentSelection;
      const usable = !!sel && !sel.isExterior;
      const admin = isEditorAdmin();

      labelToolsCard.style.display = (usable && admin) ? 'block' : 'none';
      adminUnitEditorCard.style.display = (usable && admin) ? 'block' : 'none';
      if(!usable){
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
        return;
      }

      editLabelsBtn.textContent = labelEditorState.editMode ? 'Close editor' : 'Edit labels';
      labelEditorBody.style.display = labelEditorState.editMode ? 'flex' : 'none';
      refreshLabelListUI();
    }
    showLabelsToggle.checked = false;
    showLabelsToggle.addEventListener('change', function(){ renderSelectionLabels(); });
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
    newLabelBtn.onclick = function(){
      labelEditorState.selectedLabelIndex = -1;
      labelTextInput.value = '';
      labelRaiseInput.value = '0';
      labelScaleInput.value = '1';
      labelColorInput.value = '#00ff88';
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
    copyLabelsBtn.onclick = async function(){
      labelsExportBox.value = formatLabelAnnotations(getCurrentSelectionLabels());
      try{ await navigator.clipboard.writeText(labelsExportBox.value); labelEditorStatus.textContent='Label export prepared.'; }catch(_){ labelEditorStatus.textContent='Export string ready below. Copy it manually if needed.'; }
    };
    pickLabelBtn.onclick = function(){
      if(!labelEditorState.currentSelection || labelEditorState.currentSelection.isExterior) return;
      labelEditorState.pendingPick = true;
      labelEditorStatus.textContent = 'Now click on the 3D model to place the label.';
    };
    function handleLabelPlacement(screenPos){
      if(!labelEditorState.pendingPick) return false;
      const sel = labelEditorState.currentSelection;
      if(!sel || sel.isExterior) return false;
      let world = null;
      try{ if(viewer.scene.pickPositionSupported) world = viewer.scene.pickPosition(screenPos); }catch(_){ }
      if(!world){
        try{
          const ray = viewer.camera.getPickRay(screenPos);
          world = viewer.scene.globe.pick(ray, viewer.scene);
        }catch(_){ }
      }
      if(!world) return true;
      const anchor = getSelectionAnchor(sel); if(!anchor) return true;
      const local = Cesium.Matrix4.multiplyByPoint(anchor.inv, world, new Cesium.Cartesian3());
      const items = getCurrentSelectionLabels().slice();
      const idx = labelEditorState.selectedLabelIndex;
      const item = {
        text: String(labelTextInput.value||'Label').trim() || 'Label',
        x: Number(local.x)||0,
        y: Number(local.y)||0,
        z: (Number(local.z)||0) + (Number(labelRaiseInput.value)||0),
        scale: Number(labelScaleInput.value)>0 ? Number(labelScaleInput.value) : 1,
        color: labelColorInput.value || '#00ff88'
      };
      if(idx>=0 && idx<items.length){ items[idx] = item; }
      else { items.push(item); labelEditorState.selectedLabelIndex = items.length-1; }
      setCurrentSelectionLabels(items);
      labelEditorState.pendingPick = false;
      labelEditorStatus.textContent = 'Label changes are included when you save changes.';
      refreshLabelListUI();
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
  const response = await fetch('https://home-view-ruddy.vercel.app/api/save-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  try{
    return JSON.parse(raw);
  }catch(_){
    return { ok:false, error: raw || 'Unknown response' };
  }
}
function buildEditorSavePayload(){
  const sel = labelEditorState.currentSelection;
  if(!sel || sel.isExterior || !sel.meta) return null;

  const meta = sel.meta || {};
  const buildingKey = firstFilled(meta.building_key, sel.row && sel.row.name, sel.row && sel.row.building_key);
  const unitName = firstFilled(meta.unit_name, meta.name, meta.title);

  if(!hasTextValue(buildingKey) || !hasTextValue(unitName)) return null;

  return {
building_key: buildingKey,
    unit_name: unitName,
    updates: {
      description: adminDescInput.value.trim(),
      square_footage: adminAreaInput.value.trim(),
      area: adminAreaInput.value.trim(),
      beds: adminBedsInput.value.trim(),
      bedrooms: adminBedsInput.value.trim(),
      bathrooms: adminBathsInput.value.trim(),
      baths: adminBathsInput.value.trim(),
      maintenance_fee: adminMaintenanceInput.value.trim(),
      parking_spaces: adminParkingInput.value.trim(),
      total_parking_spaces: adminParkingInput.value.trim(),
      year_built: adminYearInput.value.trim(),
      estimated_price: adminForecastInput.value.trim(),
      building_features: adminBuildingFeaturesInput.value.trim(),
      building_amenities: adminBuildingAmenitiesInput.value.trim(),
      structures: adminStructuresInput.value.trim(),
      heating_type: adminHeatingInput.value.trim(),
      community_features: adminCommunityInput.value.trim(),
      label_annotations: labelsExportBox.value.trim()
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
  meta.area = adminAreaInput.value.trim();
  meta.price = adminPriceInput.value.trim();
  meta.beds = adminBedsInput.value.trim();
  meta.bathrooms = adminBathsInput.value.trim();
  meta.maintenance_fee = adminMaintenanceInput.value.trim();
  meta.parking_spaces = adminParkingInput.value.trim();
  meta.year_built = adminYearInput.value.trim();
  meta.estimated_price = adminForecastInput.value.trim();
  meta.description = adminDescInput.value;
  meta.building_features = adminBuildingFeaturesInput.value.trim();
  meta.building_amenities = adminBuildingAmenitiesInput.value.trim();
  meta.structures = adminStructuresInput.value.trim();
  meta.heating_type = adminHeatingInput.value.trim();
  meta.community_features = adminCommunityInput.value.trim();
  adminEditorStatus.textContent = 'Changes applied locally. Press Save changes to persist them.';
  updateView(Number(selectBox.value));
};

    // ===== Picking (POI tooltip) =====
    const handler=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(function (m){
      if(labelEditorState.editMode && labelEditorState.pendingPick){
        const used = handleLabelPlacement(m.position);
        if(used){ tip.style.display='none'; return; }
      }
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
      list.forEach((u,k)=>{
        const o2=document.createElement('option');
        const amenity = isAmenityRow(u);
        o2.value=(amenity ? 'amenity:' : 'unit:')+k;
        o2.textContent=getItemDisplayName(u, (amenity ? 'Amenity #' : 'Unit #')+(k+1));
        viewSelect.appendChild(o2);
      });
      viewSelect.value='exterior';
    }

    // ===== Update View =====
    selectBox.addEventListener('change', ()=>{ rebuildViewOptions(Number(selectBox.value)); updateView(Number(selectBox.value)); });
    viewSelect.addEventListener('change', ()=>{ updateView(Number(selectBox.value)); });


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
  adminUnitEditorCard.style.display='none';
}

    function updateView(idx){
      const row=b[idx];
      const selectedValue=viewSelect.value||'exterior';
      const isExterior=(selectedValue==='exterior');
      const selectedParts=selectedValue.split(':');
      const selectedKind=selectedParts[0]||'exterior';
      const selectedIndex=Number(selectedParts[1]||0);
      const selectedMeta=(interiorMetaByBuilding[idx]||[])[selectedIndex]||null;
      const selectedIsAmenity = !isExterior && selectedKind==='amenity' && !!selectedMeta;
      currentMode = isExterior ? 'exterior' : (selectedIsAmenity ? 'amenity' : 'interior');
      labelEditorState.currentSelection = { bIdx: idx, kind: selectedKind, itemIdx: selectedIndex, meta: selectedMeta, row: row, isExterior: isExterior };

      modelEntities.forEach((ent,i)=> ent.show=(i===idx)&&isExterior);
      (interiorEntitiesByBuilding[idx]||[]).forEach((ent,k)=>{
        if(ent) ent.show = !isExterior && (selectedIndex===k) && (selectedKind==='unit' || selectedKind==='amenity');
      });

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
        hideUnitMetaUI();
        const d = getItemDescription(row).trim();
        descBox.style.display = d ? 'block' : 'none';
        descBox.textContent = d;

        priceCanvas.style.display='none';
        loanCard.style.display='none';
        compareCard.style.display='none';
        similarCard.style.display='none';
        priceCard.style.display='none';

        mini.setMode('city'); mini.refreshCity(idx); mini.updateCityCamera();
        updateCommute(idx); commuteCard.style.display='block';
      } else if (selectedIsAmenity) {
        const k=selectedIndex;
        const ent=(interiorEntitiesByBuilding[idx]||[])[k];
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
        }

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
        if(isEditorAdmin()) populateAdminEditor(selectedMeta, row);
        const d = getItemDescription(selectedMeta, row).trim();
        descBox.style.display = d ? 'block' : 'none';
        descBox.textContent = d;

        priceCanvas.style.display='none';
        loanCard.style.display='none';
        compareCard.style.display='none';
        similarCard.style.display='none';
        priceCard.style.display='none';
        commuteCard.style.display='none';
        if (typeof compareModal !== 'undefined' && compareModal) compareModal.style.display='none';

        mini.setMode('city'); mini.refreshCity(idx); mini.updateCityCamera();
      } else {
        const k=selectedIndex;
        const ent=(interiorEntitiesByBuilding[idx]||[])[k];
        const meta=selectedMeta||{};
        if(ent){
          const target=ent.position.getValue(Cesium.JulianDate.now());
          const camHead=Cesium.Math.toRadians(parseFirstNumber(meta.camera_heading!=null?meta.camera_heading:row.heading)||0);
          const camPitch=Cesium.Math.toRadians(parseFirstNumber(meta.camera_pitch)||-15);
          const range = parseFirstNumber(meta.camera_distance) || Math.max(30,(parseFirstNumber(meta.scale)||8)*15);

          viewer.scene.camera.lookAt(target, new Cesium.HeadingPitchRange(camHead,camPitch,range));
          viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          setInteriorMouseBindings(); interiorNav.enable(); setJoystickVisible(true);

          const saved = Number(localStorage.getItem('ui.fovInterior'))||80;
          const fr=viewer.camera.frustum; if(fr && 'fov' in fr) fr.fov = saved * Math.PI/180;
          fovRange.value = String(saved); fovValEl.textContent = saved;

          title.textContent=(row.name||'') + (getItemDisplayName(meta) ? ' — '+getItemDisplayName(meta) : '');
          renderUnitMetaUI(meta, row);
          if(isEditorAdmin()) populateAdminEditor(meta, row);
          const d = getItemDescription(meta, row).trim();
          descBox.style.display = d ? 'block' : 'none';
          descBox.textContent = d;

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
          commuteCard.style.display='block';

          const autoPrice=getCurrentPrice(meta,row);
          loanPrice.value = Number.isFinite(autoPrice) && autoPrice>0 ? String(autoPrice) : '';
          recalcLoan();

          mini.showPlanForUnit(idx,k,meta);
          buildSimilarList(idx,k);
          renderInsights(idx,k);
          updateCommute(idx);
        } else {
          setExteriorMouseBindings(); interiorNav.disable(); setJoystickVisible(false);
          title.textContent=(row.name||'') + (getItemDisplayName(meta) ? ' — '+getItemDisplayName(meta) : '');
          renderUnitMetaUI(meta, row);
          if(isEditorAdmin()) populateAdminEditor(meta, row);
          const d = getItemDescription(meta, row).trim();
          descBox.style.display = d ? 'block' : 'none';
          descBox.textContent = d;
          priceCanvas.style.display='none';
          loanCard.style.display='none';
          compareCard.style.display='none';
          similarCard.style.display='none';
          priceCard.style.display='none';
          commuteCard.style.display='none';
          mini.setMode('city'); mini.refreshCity(idx); mini.updateCityCamera();
        }
      }
      syncLabelToolsVisibility();
      renderSelectionLabels();
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
