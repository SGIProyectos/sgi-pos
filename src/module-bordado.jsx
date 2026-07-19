// ========== BORDADO MODULE ==========

// ── Tablas de precios ───────────────────────────────────────────
// Todos los precios de negocio (digitalización, tarifas por millar, prendas,
// posiciones, mínimo de puntadas) viven en window.BORDADO_PRECIOS —
// persistidos en localStorage (sgi_bordado_precios) y editables desde
// Configuración → Bordado. Las densidades de puntadas (densTrazo/densArea/
// densLinea) están calibradas contra los .DST reales del taller.

// ── Estimación de puntadas: motor v3 ────────────────────────────
// La segmentación (fondo, colores, regiones, ancho local por región) vive en
// src/motor_v3.js (window.MotorBordadoV3). El conteo usa un modelo continuo
// calibrado (2026-07-18) contra 11 pares imagen+DST generados con el
// AUTO-DIGITIZE de Wilcom, tamaños 5-30cm:
//   puntadas = densTrazo·largo_cm + densArea·área_cm² + densLinea·línea_cm
// Underlay, contornos y amarres del automático van absorbidos en densTrazo.
// Error mediano ~9%; diseños chicos muy detallados pueden variar ±30%.
function bdDens() {
  const p = window.BORDADO_PRECIOS || {};
  return {
    por_cm_largo: p.densTrazo ?? 148.48,  // pt por cm de trazo (satín/relleno)
    por_cm2_area: p.densArea  ?? 53.58,   // pt por cm² de área
    linea_por_cm: p.densLinea ?? 50,      // pt por cm de línea fina (<1mm)
  };
}

function bdPuntadas(t) {
  if (!t || t.activo_mm2 <= 0)
    return { total:0, densidad:0, valido:true, warn:false, trazo_st:0, area_st:0, linea_st:0 };
  const D = bdDens();
  const trazo_st = D.por_cm_largo * t.largo_cm;
  const area_st  = D.por_cm2_area * t.area_cm2;
  const linea_st = D.linea_por_cm * t.linea_cm;
  const total    = Math.round(trazo_st + area_st + linea_st);
  const densidad = total / t.activo_mm2;
  return {
    total,
    densidad: +densidad.toFixed(2),
    trazo_st: Math.round(trazo_st),
    area_st:  Math.round(area_st),
    linea_st: Math.round(linea_st),
    warn:   (t.frac_linea || 0) > 0.3,   // gran parte del diseño queda en trazos <1mm a este tamaño
    valido: densidad <= 12,
  };
}

function bdCotizar(puntadas, { prenda, pos, cantidad, digit, rush, precios, telaMult }) {
  const t        = precios.tarifas.find(x => !x.hasta || puntadas <= x.hasta) || precios.tarifas[precios.tarifas.length-1];
  const tarifa   = t?.precio || 0;
  const millares = puntadas / 1000;
  const c_base   = +(millares * tarifa).toFixed(2);
  const factor   = precios.prendas.find(p => p.id === prenda)?.factor || 1;
  const tMult    = telaMult || 1;
  const pos_p    = precios.posiciones.find(p => p.id === pos)?.precio || 0;
  const sub_u    = +(c_base * factor * tMult + pos_p).toFixed(2);
  const sub_c    = +(sub_u * cantidad).toFixed(2);
  let c_digit    = 0;
  if (digit) c_digit = rush ? precios.digitRush : puntadas > 10000 ? precios.digitComplejo : precios.digitBasico;
  return { puntadas, millares:+millares.toFixed(2), tarifa, c_base, factor, telaMult:tMult, pos_p, sub_u, cantidad, sub_c, c_digit, total:+(sub_c+c_digit).toFixed(2) };
}

// ── Análisis de imagen ──────────────────────────────────────────
// Estrategia: detectar pixels no-blancos → dilatar K px para sellar huecos
// (anti-aliasing, colores claros) → flood-fill fondo desde borde → lo que
// no es fondo = silueta real a bordar, pintada sólida en el overlay.
function bdAnalizar(img) {
  const MAX = 600;
  const esc = Math.min(MAX/img.width, MAX/img.height, 1);
  const w   = Math.round(img.width*esc);
  const h   = Math.round(img.height*esc);

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // PASO 1 — detectar píxeles no-fondo: cualquier cosa que no sea blanco.
  // Distancia L1 desde blanco > 30 → diseño. Captura crema, rosa claro, etc.
  // (>30 y no >20: el ruido de compresión JPG deja el fondo en 245–250)
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w*h; i++) {
    const r=px[i*4], g=px[i*4+1], b=px[i*4+2], a=px[i*4+3];
    if (a < 128) continue;
    if ((255-r)+(255-g)+(255-b) > 30) raw[i] = 1;
  }

  // PASO 1.5 — filtro de mayoría 3×3: elimina motas de ruido JPG aisladas.
  // Sin esto, el ruido disperso en el fondo blanco se dilata en PASO 2 y
  // sella el flood-fill del fondo → todo el canvas cuenta como diseño.
  const orig = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y*w+x;
    if (!raw[i]) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const yy = y+dy, xx = x+dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w && raw[yy*w+xx]) n++;
    }
    if (n >= 3) orig[i] = 1;
  }

  // PASO 2 — dilatar K píxeles con barrido lineal separable (O(w·h), sin loops internos)
  // K=10 cierra huecos de hasta 20px — suficiente para anti-aliasing y áreas claras
  const K  = 10;
  const tmp = new Uint8Array(w * h);  // resultado de dilatar horizontal
  const dil = new Uint8Array(w * h);  // resultado de dilatar vertical

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -K - 1;
    for (let x = 0; x < w; x++) { if (orig[row+x]) last = x; if (x-last <= K) tmp[row+x]=1; }
    last = w + K + 1;
    for (let x = w-1; x >= 0; x--) { if (orig[row+x]) last = x; if (last-x <= K) tmp[row+x]=1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -K - 1;
    for (let y = 0; y < h; y++) { if (tmp[y*w+x]) last = y; if (y-last <= K) dil[y*w+x]=1; }
    last = h + K + 1;
    for (let y = h-1; y >= 0; y--) { if (tmp[y*w+x]) last = y; if (last-y <= K) dil[y*w+x]=1; }
  }

  // PASO 3 — flood-fill fondo desde los 4 bordes (la pared es la máscara dilatada)
  const bg    = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0, qt = 0;
  const seed = (i) => { if (!bg[i] && !dil[i]) { bg[i]=1; queue[qt++]=i; } };
  for (let x=0; x<w; x++) { seed(x); seed((h-1)*w+x); }
  for (let y=1; y<h-1; y++) { seed(y*w); seed(y*w+w-1); }
  while (qh < qt) {
    const i = queue[qh++];
    const px_x = i%w, px_y = (i/w)|0;
    if (px_x > 0)   { const n=i-1;   if(!bg[n]&&!dil[n]){bg[n]=1;queue[qt++]=n;} }
    if (px_x < w-1) { const n=i+1;   if(!bg[n]&&!dil[n]){bg[n]=1;queue[qt++]=n;} }
    if (px_y > 0)   { const n=i-w;   if(!bg[n]&&!dil[n]){bg[n]=1;queue[qt++]=n;} }
    if (px_y < h-1) { const n=i+w;   if(!bg[n]&&!dil[n]){bg[n]=1;queue[qt++]=n;} }
  }

  // PASO 3.5 — huecos internos: regiones que no son fondo ni diseño original.
  // Dos clases: (a) tocan el fondo = halo de la dilatación → nunca se bordan;
  // (b) encerradas por el diseño (blanco interior de un anillo/logo) → por
  // defecto no se bordan (el auto-digitize las deja como tela, confirmado con
  // los DSTs de calibración) pero se marcan "interior" para poder activarlas
  // cuando la prenda es oscura. Componentes pequeños (anti-aliasing) se rellenan.
  const hole     = new Uint8Array(w * h);
  const interior = new Uint8Array(w * h);
  const visited  = new Uint8Array(w * h);
  const minHole  = Math.max(80, Math.round(w*h*0.0008));
  for (let s = 0; s < w*h; s++) {
    if (bg[s] || orig[s] || visited[s]) continue;
    let qh2 = 0, qt2 = 0, tocaBg = false;
    queue[qt2++] = s; visited[s] = 1;
    while (qh2 < qt2) {
      const i = queue[qh2++];
      const x = i%w, y = (i/w)|0;
      if (x>0)   { const n=i-1; if(bg[n]) tocaBg=true; else if(!visited[n]&&!orig[n]){visited[n]=1;queue[qt2++]=n;} }
      if (x<w-1) { const n=i+1; if(bg[n]) tocaBg=true; else if(!visited[n]&&!orig[n]){visited[n]=1;queue[qt2++]=n;} }
      if (y>0)   { const n=i-w; if(bg[n]) tocaBg=true; else if(!visited[n]&&!orig[n]){visited[n]=1;queue[qt2++]=n;} }
      if (y<h-1) { const n=i+w; if(bg[n]) tocaBg=true; else if(!visited[n]&&!orig[n]){visited[n]=1;queue[qt2++]=n;} }
    }
    if (qt2 >= minHole) {
      const dest = tocaBg ? hole : interior;
      for (let k=0;k<qt2;k++) dest[queue[k]] = 1;
    }
  }

  // PASO 4 — overlays + conteo + bounding box de la silueta activa.
  // overlay: solo diseño (verde). overlayFull: diseño + blanco interior (ámbar),
  // para cuando el blanco encerrado sí se bordará (prenda oscura).
  let areaPx = 0, interiorPx = 0;
  let x0=w, x1=0, y0=h, y1=0;
  const overlay = new ImageData(w, h);
  const overlayFull = new ImageData(w, h);
  for (let i = 0; i < w*h; i++) {
    if (!bg[i] && !hole[i] && !interior[i]) {
      areaPx++;
      const ix=i%w, iy=(i/w)|0;
      if (ix<x0) x0=ix; if (ix>x1) x1=ix;
      if (iy<y0) y0=iy; if (iy>y1) y1=iy;
      overlay.data[i*4]   = 57;
      overlay.data[i*4+1] = 255;
      overlay.data[i*4+2] = 20;
      overlay.data[i*4+3] = 160;
      overlayFull.data[i*4]   = 57;
      overlayFull.data[i*4+1] = 255;
      overlayFull.data[i*4+2] = 20;
      overlayFull.data[i*4+3] = 160;
    } else if (interior[i]) {
      interiorPx++;
      overlayFull.data[i*4]   = 255;
      overlayFull.data[i*4+1] = 190;
      overlayFull.data[i*4+2] = 0;
      overlayFull.data[i*4+3] = 160;
    }
  }

  // Coverage relativa al bounding box del diseño (no al canvas total).
  // Elimina el efecto de márgenes blancos en la imagen.
  const bbArea   = areaPx > 0 ? Math.max(1, (x1-x0+1) * (y1-y0+1)) : w*h;
  const coverage = areaPx / bbArea;

  // Colores dominantes de los píxeles de diseño originales
  const buckets = {};
  for (let i = 0; i < w*h; i+=4) {
    if (!orig[i]) continue;
    const r=px[i*4], g=px[i*4+1], b=px[i*4+2];
    const k = `${Math.round(r/40)*40},${Math.round(g/40)*40},${Math.round(b/40)*40}`;
    buckets[k] = (buckets[k]||0)+1;
  }
  const colores = Object.entries(buckets).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([k]) => { const [r,g,b]=k.split(','); return `rgb(${r},${g},${b})`; });

  return { overlay, overlayFull, hayInterior: interiorPx >= minHole, w, h, colores, coverage };
}

// ── Componente ──────────────────────────────────────────────────
const CW = 300, CH = 220;

function ModuleBordado({ addToTicket }) {
  const [paso,       setPaso]       = React.useState(1);
  const [file,       setFile]       = React.useState(null);
  const [imgUrl,     setImgUrl]     = React.useState(null);
  const [analisis,   setAnalisis]   = React.useState(null);
  const [analizando, setAnalizando] = React.useState(false);
  const [geo,        setGeo]        = React.useState(null);  // regiones del motor v3
  const [clasif,     setClasif]     = React.useState(null);  // totales de geometría tras aplicar la máscara
  const [maskVer,    setMaskVer]    = React.useState(0);     // bump al editar la máscara → reclasifica

  // Tamaño físico del bordado. Ancho y alto van amarrados a la proporción real
  // del contenido detectado (bbox del motor): el usuario mueve uno y el otro se
  // deriva — así el valor tecleado siempre es efectivo (el motor encaja el
  // contenido conservando proporción, un lado suelto sería ignorado).
  const [ancho, setAncho] = React.useState(8);
  const [alto,  setAlto]  = React.useState(6);
  const ratioRef = React.useRef(null);   // alto/ancho del contenido; null hasta analizar

  const cambiaAncho = (v) => {
    const a = parseFloat(v) || 1;
    setAncho(a);
    if (ratioRef.current) setAlto(+((a * ratioRef.current).toFixed(1)));
  };
  const cambiaAlto = (v) => {
    const h = parseFloat(v) || 1;
    setAlto(h);
    if (ratioRef.current) setAncho(+((h / ratioRef.current).toFixed(1)));
  };
  const ponLadoMayor = (n) => {
    const r = ratioRef.current || alto / ancho;
    if (r > 1) { setAlto(n); setAncho(+((n / r).toFixed(1))); }
    else { setAncho(n); setAlto(+((n * r).toFixed(1))); }
  };

  // Precios de negocio (globales, persistidos vía refreshBordadoPrecios)
  const [precios,   setPrecios]   = React.useState(() => window.BORDADO_PRECIOS);
  const [showCfg,   setShowCfg]   = React.useState(false);

  // Bordar el blanco encerrado dentro del diseño (prenda oscura). Por defecto
  // apagado: los DSTs del auto-digitize lo dejan como tela (calibración).
  const [blancoInt, setBlancoInt] = React.useState(false);

  // Editor de canvas
  const [tool,     setTool]     = React.useState('pincel');
  const [tamano,   setTamano]   = React.useState(20);
  const [zoom,     setZoom]     = React.useState(1);
  const [undoLen,  setUndoLen]  = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);

  // Opciones de cotización
  const [hilos,    setHilos]    = React.useState(1);   // colores de hilo (≠ colores de imagen)
  const [prenda,   setPrenda]   = React.useState('polo');
  const [telaId,   setTelaId]   = React.useState(() => (window.BORDADO_TELAS || [])[0]?.id || 'algodon');
  const [pos,      setPos]      = React.useState('pecho_izq');
  const [cantidad, setCantidad] = React.useState(1);
  const [digit,    setDigit]    = React.useState(true);
  const [rush,     setRush]     = React.useState(false);

  // Refs
  const cOrigRef  = React.useRef(null);
  const cOverRef  = React.useRef(null);
  const imgRef    = React.useRef(null);
  const imgDataRef = React.useRef(null); // ImageData con alpha para el motor v3
  const origOvRef = React.useRef(null);
  const fullOvRef = React.useRef(null);   // overlay con blanco interior incluido
  const maskRef   = React.useRef(null);   // canvas offscreen: solo áreas activas, sin imagen de fondo
  const dibRef    = React.useRef(false);
  const histRef   = React.useRef([]);

  const telas     = window.BORDADO_TELAS || [];
  const tela      = telas.find(t => t.id === telaId) || telas[0] || { id:'algodon', name:'Algodón', mult:1 };
  const prendaSel = precios.prendas.find(p => p.id === prenda) || precios.prendas[0] || { id:'', label:'—', factor:1 };
  const posSel    = precios.posiciones.find(p => p.id === pos) || precios.posiciones[0] || { id:'', label:'—', precio:0 };

  const bdResult  = clasif ? bdPuntadas(clasif) : null;
  const puntadas  = bdResult ? Math.max(precios.minPunt, bdResult.total) : 0;
  const cot       = puntadas > 0 && bdResult?.valido ? bdCotizar(puntadas, { prenda: prendaSel.id, pos: posSel.id, cantidad, digit, rush, precios, telaMult: tela.mult }) : null;
  const bdWarn    = bdResult?.warn;   // detalles satín al ancho mínimo ⇒ demasiado finos a este tamaño
  const coverage  = clasif ? clasif.coverage : (analisis?.coverage || 0);

  // ── Upload ───────────────────────────────────────────────────
  function handleFile(f) {
    if (!f) return;
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    const url = URL.createObjectURL(f);
    setFile(f); setImgUrl(url);
    setAnalisis(null); setUndoLen(0); histRef.current = []; imgDataRef.current = null;
    ratioRef.current = null; fullOvRef.current = null; setBlancoInt(false);
    setPaso(2);
  }

  // ── Análisis ─────────────────────────────────────────────────
  async function runAnalisis() {
    if (!imgUrl) return;
    setAnalizando(true);
    await new Promise(r => setTimeout(r, 40));

    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      try {
        // ImageData para el motor v3 — SIN aplanar sobre blanco: el motor
        // detecta el fondo por alpha o por color de borde él solo.
        const escM = Math.min(700/img.width, 700/img.height, 1);
        const mw = Math.max(1, Math.round(img.width*escM));
        const mh = Math.max(1, Math.round(img.height*escM));
        const mc = document.createElement('canvas');
        mc.width = mw; mc.height = mh;
        const mcx = mc.getContext('2d', { willReadFrequently:true });
        mcx.drawImage(img, 0, 0, mw, mh);
        imgDataRef.current = mcx.getImageData(0, 0, mw, mh);

        const res = bdAnalizar(img);
        origOvRef.current = res.overlay;
        fullOvRef.current = res.overlayFull;
        setBlancoInt(false);
        setAnalisis(res);
        setAnalizando(false);
        setPaso(3);
        requestAnimationFrame(() => { drawOrig(img); applyOverlay(res.overlay, res.w, res.h); });
      } catch(e) {
        setAnalizando(false);
        alert('Error al analizar. Usa JPG o PNG.');
      }
    };
    img.onerror = () => { setAnalizando(false); alert('No se pudo cargar la imagen.'); };
    img.crossOrigin = 'anonymous';
    img.src = imgUrl;
  }

  function drawOrig(img) {
    const cv = cOrigRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext('2d');
    const s = Math.min(CW/img.width, CH/img.height);
    const dw = img.width*s, dh = img.height*s;
    ctx.clearRect(0,0,CW,CH);
    ctx.drawImage(img, (CW-dw)/2, (CH-dh)/2, dw, dh);
  }

  function applyOverlay(ovData, ow, oh) {
    const cv = cOverRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const img = imgRef.current;
    if (img) {
      const s = Math.min(CW/img.width, CH/img.height);
      const dw=img.width*s, dh=img.height*s;
      ctx.clearRect(0,0,CW,CH);
      ctx.drawImage(img, (CW-dw)/2, (CH-dh)/2, dw, dh);
    }
    const tmp = document.createElement('canvas');
    tmp.width=ow; tmp.height=oh;
    tmp.getContext('2d').putImageData(ovData, 0, 0);
    const s2 = Math.min(CW/ow, CH/oh);
    ctx.drawImage(tmp, (CW-ow*s2)/2, (CH-oh*s2)/2, ow*s2, oh*s2);

    let mv = maskRef.current;
    if (!mv) { mv = document.createElement('canvas'); mv.width=CW; mv.height=CH; maskRef.current = mv; }
    const mctx = mv.getContext('2d');
    mctx.clearRect(0,0,CW,CH);
    mctx.drawImage(tmp, (CW-ow*s2)/2, (CH-oh*s2)/2, ow*s2, oh*s2);
    setMaskVer(v => v+1);
  }

  // Motor v3: segmenta la imagen en regiones. Depende del tamaño físico
  // (la clasificación línea/satín/relleno usa el ancho en mm de cada región).
  React.useEffect(() => {
    if (!analisis || !imgDataRef.current || !window.MotorBordadoV3) { setGeo(null); return; }
    try {
      const g = window.MotorBordadoV3.analizarImagen(imgDataRef.current,
        { anchoCm: ancho, altoCm: alto, conMapa: true });
      setGeo(g);
      // primera vez por imagen: fija la proporción real y ajusta el alto
      if (ratioRef.current === null && g.bboxPx && g.bboxPx.w > 0) {
        ratioRef.current = g.bboxPx.h / g.bboxPx.w;
        setAlto(+((ancho * ratioRef.current).toFixed(1)));
      }
    } catch (e) { setGeo(null); }
  }, [analisis, ancho, alto]);

  // Aplica la máscara editable (pincel/goma) sobre las regiones del motor:
  // cada región aporta su geometría escalada por la fracción que sigue activa.
  React.useEffect(() => {
    if (!geo || !analisis || !maskRef.current) { setClasif(null); return; }
    const { w, h } = geo.dimsPx;
    const md = maskRef.current.getContext('2d').getImageData(0,0,CW,CH).data;
    // misma transformación letterbox que applyOverlay: px del motor → px de la máscara
    const ow = analisis.w, oh = analisis.h;
    const s2 = Math.min(CW/ow, CH/oh);
    const offX = (CW-ow*s2)/2, offY = (CH-oh*s2)/2;
    let maxId = -1;
    for (const reg of geo.regiones) if (reg.id > maxId) maxId = reg.id;
    const tot = new Float64Array(maxId+1), act = new Float64Array(maxId+1);
    for (let p = 0; p < w*h; p++) {
      const r = geo.mapa[p];
      if (r < 0 || r > maxId) continue;
      tot[r]++;
      const x = p % w, y = (p / w) | 0;
      const mx = (offX + ((x+0.5)/w)*ow*s2) | 0;
      const my = (offY + ((y+0.5)/h)*oh*s2) | 0;
      if (mx >= 0 && mx < CW && my >= 0 && my < CH && md[(my*CW+mx)*4+3] > 60) act[r]++;
    }
    // Máscara totalmente vacía sin ediciones del usuario = el canvas no llegó a
    // pintarse (carrera de montado); en ese caso las regiones cuentan completas.
    let sumaAct = 0;
    for (let i = 0; i <= maxId; i++) sumaAct += act[i];
    const maskFallida = sumaAct === 0 && histRef.current.length === 0;
    let largo=0, area=0, linea=0, activoMm2=0, lineaMm2=0;
    for (const reg of geo.regiones) {
      const f = maskFallida
        ? (reg.interior && !blancoInt ? 0 : 1)
        : (tot[reg.id] > 0 ? act[reg.id]/tot[reg.id] : 0);
      activoMm2 += reg.area_mm2 * f;
      if (reg.tipo === 'linea') { linea += (reg.largo_mm/10)*f; lineaMm2 += reg.area_mm2*f; }
      else { largo += (reg.largo_mm/10)*f; area += (reg.area_mm2/100)*f; }
    }
    setClasif({
      largo_cm:   +largo.toFixed(1),
      area_cm2:   +area.toFixed(2),
      linea_cm:   +linea.toFixed(1),
      activo_mm2: activoMm2,
      frac_linea: activoMm2 > 0 ? lineaMm2/activoMm2 : 0,
      coverage:   Math.min(1, activoMm2/(ancho*alto*100)),
    });
  }, [geo, maskVer, blancoInt]);

  // Redibuja overlay+máscara tras montar el canvas. Corre en useEffect (post-commit,
  // el canvas ya existe) — el rAF dentro de runAnalisis puede perder la carrera
  // contra el montado del paso 3 y dejar la máscara vacía en silencio.
  // También corre al alternar "bordar blanco interior" (cambia el overlay base).
  React.useEffect(() => {
    if (paso===3 && imgRef.current && analisis && origOvRef.current) {
      const ov = blancoInt && fullOvRef.current ? fullOvRef.current : origOvRef.current;
      requestAnimationFrame(() => { drawOrig(imgRef.current); applyOverlay(ov, analisis.w, analisis.h); });
    }
  }, [paso, analisis, blancoInt]);

  // ── Editor ───────────────────────────────────────────────────
  function getPos(e) {
    const cv = cOverRef.current;
    const rect = cv.getBoundingClientRect();
    return { x:(e.clientX-rect.left)*(CW/rect.width), y:(e.clientY-rect.top)*(CH/rect.height) };
  }

  function saveUndo() {
    const cv = cOverRef.current, mv = maskRef.current;
    if (!cv || !mv) return;
    const snap = {
      view: cv.getContext('2d').getImageData(0,0,CW,CH),
      mask: mv.getContext('2d').getImageData(0,0,CW,CH),
    };
    histRef.current = [...histRef.current.slice(-9), snap];
    setUndoLen(histRef.current.length);
  }

  function paint(e) {
    if (!dibRef.current || tool==='zoom') return;
    const ctx = cOverRef.current.getContext('2d');
    const {x,y} = getPos(e);
    ctx.globalCompositeOperation = tool==='pincel' ? 'source-over' : 'destination-out';
    ctx.fillStyle = tool==='pincel' ? 'rgba(57,255,20,0.55)' : 'rgba(0,0,0,1)';
    ctx.beginPath(); ctx.arc(x,y,tamano/2,0,Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const mctx = maskRef.current?.getContext('2d');
    if (mctx) {
      mctx.globalCompositeOperation = tool==='pincel' ? 'source-over' : 'destination-out';
      mctx.fillStyle = '#39ff14';
      mctx.beginPath(); mctx.arc(x,y,tamano/2,0,Math.PI*2); mctx.fill();
      mctx.globalCompositeOperation = 'source-over';
    }
  }

  function undo() {
    if (!histRef.current.length) return;
    const last = histRef.current[histRef.current.length-1];
    cOverRef.current?.getContext('2d').putImageData(last.view, 0, 0);
    maskRef.current?.getContext('2d').putImageData(last.mask, 0, 0);
    histRef.current = histRef.current.slice(0,-1);
    setUndoLen(histRef.current.length);
    setMaskVer(v => v+1);
  }

  React.useEffect(() => {
    function onKey(e) { if (e.ctrlKey && e.key==='z' && paso===3) undo(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paso]);

  function handleWheel(e) {
    if (tool!=='zoom') return;
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(4, z-e.deltaY*0.001)));
  }

  function cfgSet(key, val) {
    const next = { ...window.BORDADO_PRECIOS, [key]: parseFloat(val)||0 };
    window.refreshBordadoPrecios(next);
    setPrecios(next);
  }
  function cfgRestore() {
    const d = window.BORDADO_PRECIOS_DEFAULTS;
    const next = { ...window.BORDADO_PRECIOS,
      minPunt:d.minPunt, digitBasico:d.digitBasico, digitComplejo:d.digitComplejo, digitRush:d.digitRush };
    window.refreshBordadoPrecios(next);
    setPrecios(next);
  }

  // ── Estilos inline reutilizables ─────────────────────────────
  const sSelect = {width:'100%',background:'var(--bg)',border:'1px solid var(--border-2)',padding:'8px 10px',borderRadius:'var(--radius)',fontSize:13,outline:'none'};
  const sInput  = {border:'1px solid var(--border-2)',padding:'7px 8px',borderRadius:'var(--radius)',fontSize:13,outline:'none'};
  const sLabel  = {fontSize:11,fontWeight:600,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:.5,display:'block',marginBottom:4};
  const sToolBtn = (active) => ({display:'flex',alignItems:'center',gap:4,padding:'5px 10px',fontSize:12,fontWeight:600,background:active?'var(--magenta)':'white',color:active?'white':'var(--text-2)',border:'1px solid var(--border-2)',borderRadius:'var(--radius)',cursor:'pointer'});

  const steps = ['Diseño','Análisis','Editor'];

  return (
    <>
      <div className="module-header">
        <div className="module-title">
          <div className="mt-icon" style={{background:'var(--magenta)'}}><window.IconNeedle size={20}/></div>
          <div>
            <h1>Bordado</h1>
            <div className="mt-sub">Imagen · Detección automática · Editor de áreas</div>
          </div>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',marginLeft:'auto',paddingRight:8}}>
          {steps.map((s,i) => (
            <React.Fragment key={i}>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:24,height:24,borderRadius:'50%',display:'grid',placeItems:'center',fontSize:11,fontWeight:700,
                  background:paso>i+1?'var(--orange)':paso===i+1?'var(--magenta)':'var(--border)',
                  color:paso>=i+1?'white':'var(--text-3)'}}>
                  {paso>i+1?<window.IconCheck size={11}/>:i+1}
                </div>
                <span style={{fontSize:11,fontWeight:paso===i+1?600:400,color:paso===i+1?'var(--text-1)':'var(--text-3)'}}>{s}</span>
              </div>
              {i<2&&<div style={{width:16,height:1,background:'var(--border-2)'}}/>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="module-body">
        <div className="form-module">
          <div style={{flex:1,minWidth:0}}>

            {/* ── PASO 1 ─────────────────────────────────────── */}
            {paso===1 && (
              <div className="form-card">
                <h3><span className="num">1</span>Subir imagen del diseño</h3>
                <input id="bordado-file-input" type="file" accept=".jpg,.jpeg,.png,.svg"
                  style={{display:'none'}}
                  onChange={e=>{const f=e.target.files[0];if(f)handleFile(f);e.target.value='';}}/>
                <div className={'bd-drop-wrap'+(dragOver?' drag':'')}>
                  <label htmlFor="bordado-file-input" className="bd-dropzone"
                    onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                    onDragLeave={()=>setDragOver(false)}
                    onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files?.[0];if(f)handleFile(f);}}>
                    <span className="bd-crop tl"/><span className="bd-crop tr"/>
                    <span className="bd-crop bl"/><span className="bd-crop br"/>
                    <div className="bd-dz-hoop">
                      <div className="bd-dz-orbit"><i/><i/><i/><i/></div>
                      <window.IconNeedle size={34}/>
                    </div>
                    <div className="bd-dz-title">{dragOver?'¡Suéltalo aquí!':'Arrastra tu diseño'}</div>
                    <div className="bd-dz-sub">o haz clic para seleccionar el archivo</div>
                    <div className="bd-dz-chips">
                      {['JPG','PNG','SVG','MÁX 10 MB'].map(c=>(
                        <span key={c} className="bd-dz-chip">{c}</span>
                      ))}
                    </div>
                    <div className="bd-dz-calib">
                      {['#00B8D4','#80DCEA','#E91E63','#F48FB1','#FFC107','#FFE082','#555555','#8C8C8C','#E85D04','#F2AE81'].map((c,i)=>(
                        <span key={i} style={{background:c}}/>
                      ))}
                    </div>
                  </label>
                </div>
                <div className="bd-steps-row">
                  <div className="bd-step"><b style={{background:'var(--cyan)'}}>1</b><span>Sube tu diseño</span></div>
                  <span className="bd-step-arrow">→</span>
                  <div className="bd-step"><b style={{background:'var(--magenta)'}}>2</b><span>Detección automática</span></div>
                  <span className="bd-step-arrow">→</span>
                  <div className="bd-step"><b style={{background:'var(--orange)'}}>3</b><span>Edita y cotiza</span></div>
                </div>
              </div>
            )}

            {/* ── PASO 2 ─────────────────────────────────────── */}
            {paso===2 && (
              <div className="form-card">
                <h3><span className="num">2</span>Imagen cargada — detectar áreas</h3>
                <div style={{display:'flex',gap:14,alignItems:'flex-start',marginBottom:16}}>
                  <img src={imgUrl} alt="preview"
                    style={{width:120,height:90,objectFit:'contain',borderRadius:8,
                      border:'1px solid var(--border-2)',background:'#f7f7f7',display:'block'}}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{file?.name}</div>
                    <div style={{fontSize:11,color:'var(--text-3)',marginBottom:14}}>
                      {file?Math.round(file.size/1024)+' KB':''}
                    </div>
                    <button className="btn-add" style={{marginTop:0}}
                      onClick={runAnalisis} disabled={analizando}>
                      {analizando
                        ?<><window.IconRotate size={14}/>Analizando...</>
                        :<><window.IconSearch size={14}/>Detectar áreas de bordado</>}
                    </button>
                  </div>
                </div>
                <button type="button" style={{fontSize:11,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}
                  onClick={()=>{setFile(null);setImgUrl(null);setPaso(1);}}>
                  ← Cambiar imagen
                </button>
              </div>
            )}

            {/* ── PASO 3 ─────────────────────────────────────── */}
            {paso===3 && analisis && (
              <>
                {/* Tamaño físico + colores */}
                <div className="form-card" style={{marginBottom:12}}>
                  <h3 style={{marginBottom:12}}><span className="num">2</span>Tamaño del bordado</h3>
                  <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
                    <div>
                      <label style={sLabel}>Ancho</label>
                      <div className="suffix-input">
                        <input type="number" min=".5" step=".5" value={ancho}
                          onChange={e=>cambiaAncho(e.target.value)}
                          style={{...sInput,width:70}}/>
                        <span className="suffix">cm</span>
                      </div>
                    </div>
                    <div style={{paddingBottom:8,color:'var(--text-3)',fontSize:18}}>×</div>
                    <div>
                      <label style={sLabel}>Alto</label>
                      <div className="suffix-input">
                        <input type="number" min=".5" step=".5" value={alto}
                          onChange={e=>cambiaAlto(e.target.value)}
                          style={{...sInput,width:70}}/>
                        <span className="suffix">cm</span>
                      </div>
                    </div>
                    <div style={{paddingBottom:6,flex:1,minWidth:140}}>
                      <div style={{fontSize:11,color:'var(--text-3)',marginBottom:2}}>
                        Área: <strong>{(ancho*alto).toFixed(1)} cm²</strong>
                        {' · '}Cobertura: <strong>{Math.round(coverage*100)}%</strong>
                      </div>
                      <div style={{fontSize:12,color:'var(--magenta)',fontWeight:700}}>
                        ≈ {puntadas.toLocaleString()} puntadas
                      </div>
                      {bdWarn && (
                        <div style={{fontSize:10,color:'#b45309',marginTop:2}}>
                          Detalles muy finos para bordar a este tamaño — considera aumentarlo
                        </div>
                      )}
                      {bdResult && !bdResult.valido && (
                        <div style={{fontSize:10,color:'#dc2626',marginTop:2}}>
                          Densidad fuera de rango — revisa las áreas marcadas
                        </div>
                      )}
                    </div>
                    <div style={{display:'flex',gap:4,marginBottom:2}}>
                      {analisis.colores.map((c,i)=>(
                        <div key={i} title={c} style={{width:16,height:16,borderRadius:3,background:c,border:'1px solid rgba(0,0,0,0.12)'}}/>
                      ))}
                      <span style={{fontSize:11,color:'var(--text-3)',marginLeft:4,paddingTop:2}}>{analisis.colores.length} col.</span>
                    </div>
                  </div>

                  {/* Tamaños frecuentes: fijan el lado mayor, el otro sale de la proporción */}
                  <div style={{display:'flex',gap:5,marginTop:10,flexWrap:'wrap'}}>
                    <span style={{fontSize:11,color:'var(--text-3)',paddingTop:2}}>Lado mayor:</span>
                    {[4,5,8,10,12,15,20,25,30].map(n=>(
                      <button key={n} type="button" onClick={()=>ponLadoMayor(n)}
                        style={{padding:'3px 8px',fontSize:11,fontWeight:600,background:Math.max(ancho,alto)===n?'var(--orange)':'white',
                          color:Math.max(ancho,alto)===n?'white':'var(--text-2)',border:'1px solid var(--border-2)',borderRadius:'var(--radius)',cursor:'pointer'}}>
                        {n} cm
                      </button>
                    ))}
                  </div>
                </div>

                {/* Canvas editor */}
                <div className="form-card" style={{marginBottom:12}}>
                  <h3 style={{marginBottom:10}}><span className="num">3</span>Editor de áreas</h3>
                  {analisis.hayInterior && (
                    <label style={{display:'flex',alignItems:'center',gap:7,marginBottom:10,padding:'6px 10px',
                      background:blancoInt?'#fff7e0':'var(--bg-2, #f6f6f6)',border:'1px solid '+(blancoInt?'#f0c040':'var(--border-2)'),
                      borderRadius:'var(--radius)',cursor:'pointer',fontSize:12}}>
                      <input type="checkbox" checked={blancoInt}
                        onChange={e=>{setBlancoInt(e.target.checked);histRef.current=[];setUndoLen(0);}}/>
                      <span style={{width:12,height:12,borderRadius:3,background:'rgba(255,190,0,0.75)',display:'inline-block',border:'1px solid rgba(200,140,0,.5)'}}/>
                      <span>
                        <b>Bordar blanco interior</b>
                        <span style={{color:'var(--text-3)'}}> — hay áreas color fondo encerradas en el diseño; actívalo si se bordarán (p. ej. prenda oscura)</span>
                      </span>
                    </label>
                  )}
                  <div style={{display:'flex',gap:5,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
                    {[{id:'pincel',label:'Pincel',icon:<window.IconEdit size={13}/>},{id:'goma',label:'Goma',icon:<window.IconX size={13}/>},{id:'zoom',label:'Zoom',icon:<window.IconSearch size={13}/>}].map(t=>(
                      <button key={t.id} type="button" style={sToolBtn(tool===t.id)} onClick={()=>setTool(t.id)}>
                        {t.icon}{t.label}
                      </button>
                    ))}
                    <div style={{width:1,height:22,background:'var(--border-2)',margin:'0 2px'}}/>
                    <button type="button" disabled={!undoLen}
                      style={sToolBtn(false)} onClick={undo}>
                      ↩ Deshacer{undoLen?<span style={{opacity:.6}}> ({undoLen})</span>:null}
                    </button>
                    <button type="button" style={sToolBtn(false)}
                      onClick={()=>{applyOverlay(blancoInt&&fullOvRef.current?fullOvRef.current:origOvRef.current,analisis.w,analisis.h);histRef.current=[];setUndoLen(0);}}>
                      <window.IconRotate size={13}/>Reset
                    </button>
                    {tool!=='zoom'
                      ?<div style={{display:'flex',alignItems:'center',gap:7,marginLeft:4}}>
                          <span style={{fontSize:11,color:'var(--text-3)',whiteSpace:'nowrap'}}>Tamaño: {tamano}px</span>
                          <input type="range" min="5" max="50" value={tamano} onChange={e=>setTamano(+e.target.value)} style={{width:76}}/>
                        </div>
                      :<span style={{fontSize:11,color:'var(--text-3)',marginLeft:6}}>Rueda del mouse · ×{zoom.toFixed(1)}</span>
                    }
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:'var(--text-3)',letterSpacing:.5,textTransform:'uppercase',marginBottom:4}}>Original</div>
                      <canvas ref={cOrigRef} width={CW} height={CH}
                        style={{display:'block',width:'100%',borderRadius:6,border:'1px solid var(--border-2)',background:'#f7f7f7'}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:'var(--text-3)',letterSpacing:.5,textTransform:'uppercase',marginBottom:4,display:'flex',gap:6,alignItems:'center'}}>
                        Áreas a bordar
                        <span style={{width:12,height:12,borderRadius:3,background:'rgba(57,255,20,0.65)',display:'inline-block',border:'1px solid rgba(0,180,0,.4)'}}/>
                      </div>
                      <div style={{overflow:'hidden',borderRadius:6,border:'1px solid var(--border-2)',background:'#f7f7f7'}}>
                        <canvas ref={cOverRef} width={CW} height={CH}
                          style={{display:'block',width:'100%',cursor:tool==='zoom'?'zoom-in':tool==='pincel'?'crosshair':'cell',
                            transform:`scale(${zoom})`,transformOrigin:'top left'}}
                          onMouseDown={e=>{saveUndo();dibRef.current=true;paint(e);}}
                          onMouseMove={paint}
                          onMouseUp={()=>{if(dibRef.current){dibRef.current=false;setMaskVer(v=>v+1);}}}
                          onMouseLeave={()=>{if(dibRef.current){dibRef.current=false;setMaskVer(v=>v+1);}}}
                          onWheel={handleWheel}/>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Opciones de cotización */}
                <div className="form-card">
                  <h3><span className="num">4</span>Opciones</h3>

                  {/* Colores de hilo — separado de colores detectados en imagen */}
                  <div style={{marginBottom:14,padding:'10px 12px',background:'var(--bg)',borderRadius:'var(--radius)',border:'1px solid var(--border-2)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                      <div>
                        <label style={sLabel}>Colores de hilo</label>
                        <div style={{display:'flex',gap:5,alignItems:'center'}}>
                          <input type="number" min="1" max="20" value={hilos}
                            onChange={e=>setHilos(Math.max(1,parseInt(e.target.value)||1))}
                            style={{...sInput,width:58,fontWeight:700}}/>
                          {[1,2,3,4,5,6].map(n=>(
                            <button key={n} type="button" onClick={()=>setHilos(n)}
                              style={{padding:'6px 9px',background:hilos===n?'var(--magenta)':'white',
                                color:hilos===n?'white':'var(--text-2)',border:'1px solid var(--border-2)',
                                borderRadius:'var(--radius)',fontWeight:600,fontSize:12,cursor:'pointer'}}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{flex:1,minWidth:120}}>
                        <div style={{fontSize:10,color:'var(--text-3)',marginBottom:4,textTransform:'uppercase',letterSpacing:.5}}>Paleta detectada en imagen</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          {(analisis?.colores||[]).map((c,i)=>(
                            <div key={i} title={c} style={{width:18,height:18,borderRadius:3,background:c,border:'1px solid rgba(0,0,0,0.12)',cursor:'pointer'}}
                              onClick={()=>setHilos(i+1)}/>
                          ))}
                          <span style={{fontSize:10,color:'var(--text-3)',paddingTop:4,marginLeft:2}}>← clic para contar</span>
                        </div>
                      </div>
                    </div>
                    <div style={{fontSize:10,color:'var(--text-3)',marginTop:6,fontStyle:'italic'}}>
                      Cuenta los hilos reales que usará la máquina (ej. el DST de Wilcom indica CO: = cambios de color)
                    </div>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
                    <div className="field">
                      <label>Tipo de prenda</label>
                      <select value={prendaSel.id} onChange={e=>setPrenda(e.target.value)} style={sSelect}>
                        {precios.prendas.map(p=>(
                          <option key={p.id} value={p.id}>{p.label} ×{p.factor}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Tela</label>
                      <select value={tela.id} onChange={e=>setTelaId(e.target.value)} style={sSelect}>
                        {telas.map(t=>(
                          <option key={t.id} value={t.id}>{t.name}{t.mult!==1?` ×${t.mult}`:''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Posición</label>
                      <select value={posSel.id} onChange={e=>setPos(e.target.value)} style={sSelect}>
                        {precios.posiciones.map(p=>(
                          <option key={p.id} value={p.id}>{p.label}{p.precio>0?` +$${p.precio}`:''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:14}}>
                    <div>
                      <label style={sLabel}>Cantidad</label>
                      <div style={{display:'flex',gap:5,alignItems:'center'}}>
                        <input type="number" min="1" value={cantidad}
                          onChange={e=>setCantidad(Math.max(1,parseInt(e.target.value)||1))}
                          style={{...sInput,width:58}}/>
                        {[12,24,50,100].map(n=>(
                          <button key={n} type="button" onClick={()=>setCantidad(n)}
                            style={{padding:'7px 9px',background:cantidad===n?'var(--orange)':'white',color:cantidad===n?'white':'var(--text-2)',border:'1px solid var(--border-2)',borderRadius:'var(--radius)',fontWeight:600,fontSize:12}}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:7,marginTop:18}}>
                      <label style={{display:'flex',alignItems:'center',gap:7,fontSize:12,cursor:'pointer'}}>
                        <input type="checkbox" checked={digit} onChange={e=>setDigit(e.target.checked)}/>
                        Digitalización nueva
                      </label>
                      <label style={{display:'flex',alignItems:'center',gap:7,fontSize:12,cursor:'pointer'}}>
                        <input type="checkbox" checked={rush} onChange={e=>setRush(e.target.checked)}/>
                        Rush (entrega express)
                      </label>
                    </div>
                  </div>

                  {/* ⚙ Ajustar tarifas */}
                  <button type="button"
                    style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',padding:0,marginBottom:showCfg?10:0}}
                    onClick={()=>setShowCfg(v=>!v)}>
                    <window.IconSettings size={13}/>
                    {showCfg?'▲':'▼'} Ajustar tarifas y densidades
                  </button>

                  {showCfg && (
                    <div style={{background:'var(--bg)',borderRadius:'var(--radius)',border:'1px solid var(--border-2)',padding:12}}>
                      <div style={{fontSize:11,color:'var(--text-3)',marginBottom:10,fontStyle:'italic'}}>
                        Tarifa por millar automática: {precios.tarifas.map(t=>t.hasta?`hasta ${t.hasta/1000}K→$${(+t.precio).toFixed(2)}`:`más→$${(+t.precio).toFixed(2)}`).join(' · ')} — catálogo completo en Configuración → Bordado
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
                        <div>
                          <label style={sLabel}>Digit. básico $</label>
                          <input type="number" value={precios.digitBasico} onChange={e=>cfgSet('digitBasico',e.target.value)} style={{...sInput,width:'100%'}}/>
                        </div>
                        <div>
                          <label style={sLabel}>Digit. complejo $</label>
                          <input type="number" value={precios.digitComplejo} onChange={e=>cfgSet('digitComplejo',e.target.value)} style={{...sInput,width:'100%'}}/>
                        </div>
                        <div>
                          <label style={sLabel}>Rush $</label>
                          <input type="number" value={precios.digitRush} onChange={e=>cfgSet('digitRush',e.target.value)} style={{...sInput,width:'100%'}}/>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <div style={{flex:1}}>
                          <label style={sLabel}>Mínimo de puntadas</label>
                          <input type="number" value={precios.minPunt} onChange={e=>cfgSet('minPunt',e.target.value)} style={{...sInput,width:'100%'}}/>
                        </div>
                        <button type="button" onClick={cfgRestore}
                          style={{marginTop:16,padding:'7px 12px',fontSize:11,color:'var(--text-2)',background:'white',border:'1px solid var(--border-2)',borderRadius:'var(--radius)',cursor:'pointer'}}>
                          Restaurar defaults
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button type="button"
                  style={{marginTop:10,fontSize:11,color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}
                  onClick={()=>setPaso(2)}>← Volver al análisis</button>
              </>
            )}
          </div>

          {/* ── Preview side ────────────────────────────────── */}
          <div className="preview-side">
            <h4>Resumen</h4>

            {/* Imagen completa en el resumen */}
            <div style={{width:'100%',height:110,display:'flex',alignItems:'center',justifyContent:'center',
              background:'var(--bg)',borderRadius:'var(--radius)',border:'1px solid var(--border-2)',
              marginBottom:10,overflow:'hidden'}}>
              {imgUrl
                ? <img src={imgUrl} alt="diseño"
                    style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}}/>
                : <window.IconNeedle size={26} style={{color:'var(--magenta)'}}/>
              }
            </div>

            {analisis ? (
              <>
                <div className="preview-detail"><span className="pd-l">Tamaño</span><span className="pd-v">{ancho}×{alto} cm</span></div>
                <div className="preview-detail"><span className="pd-l">Hilos</span><span className="pd-v mono">{hilos}</span></div>
                <div className="preview-detail"><span className="pd-l">Cobertura</span><span className="pd-v">{Math.round(coverage*100)}%</span></div>
                <div className="preview-detail">
                  <span className="pd-l">Puntadas</span>
                  <span className="pd-v mono" style={{color:'var(--magenta)',fontWeight:700}}>{puntadas.toLocaleString()}</span>
                </div>
                {bdResult && bdResult.total > 0 && clasif && (
                  <>
                    {bdResult.trazo_st > 0 && (
                      <div className="preview-detail" style={{opacity:.6}}>
                        <span className="pd-l" style={{fontSize:10}}>· Trazo satín/relleno ({clasif.largo_cm} cm)</span>
                        <span className="pd-v mono" style={{fontSize:10}}>{bdResult.trazo_st.toLocaleString()} pt</span>
                      </div>
                    )}
                    {bdResult.area_st > 0 && (
                      <div className="preview-detail" style={{opacity:.6}}>
                        <span className="pd-l" style={{fontSize:10}}>· Área de relleno ({clasif.area_cm2} cm²)</span>
                        <span className="pd-v mono" style={{fontSize:10}}>{bdResult.area_st.toLocaleString()} pt</span>
                      </div>
                    )}
                    {bdResult.linea_st > 0 && (
                      <div className="preview-detail" style={{opacity:.6}}>
                        <span className="pd-l" style={{fontSize:10}}>· Línea fina ({clasif.linea_cm} cm)</span>
                        <span className="pd-v mono" style={{fontSize:10}}>{bdResult.linea_st.toLocaleString()} pt</span>
                      </div>
                    )}
                  </>
                )}
                <div className="preview-detail" style={{opacity:.6}}>
                  <span className="pd-l" style={{fontSize:10}}>Densidad</span>
                  <span className="pd-v mono" style={{fontSize:10,color: bdWarn ? '#b45309' : 'inherit'}}>
                    {bdResult?.densidad ?? '—'} p/mm²{bdWarn ? ' ⚠' : ''}
                  </span>
                </div>
                <div className="preview-detail"><span className="pd-l">Millares</span><span className="pd-v mono">{cot?.millares}</span></div>
                <div className="preview-detail"><span className="pd-l">Tarifa/millar</span><span className="pd-v mono">{cot?window.fmt(cot.tarifa):'—'}</span></div>
                <div className="preview-detail"><span className="pd-l">Prenda</span><span className="pd-v">{prendaSel.label} ×{prendaSel.factor}</span></div>
                <div className="preview-detail"><span className="pd-l">Tela</span><span className="pd-v">{tela.name}{tela.mult!==1?` ×${tela.mult}`:''}</span></div>
                <div className="preview-detail"><span className="pd-l">Posición</span><span className="pd-v">{posSel.label}</span></div>
                {digit&&<div className="preview-detail"><span className="pd-l">Digitalización</span><span className="pd-v mono">{cot?window.fmt(cot.c_digit):'—'}</span></div>}
                <div className="preview-detail"><span className="pd-l">Precio unitario</span><span className="pd-v mono">{cot?window.fmt(cot.sub_u):'—'}</span></div>
                <div className="preview-detail"><span className="pd-l">Cantidad</span><span className="pd-v mono">×{cantidad}</span></div>
              </>
            ) : (
              <div style={{fontSize:12,color:'var(--text-3)',textAlign:'center',padding:'18px 0',lineHeight:1.6}}>
                Sube una imagen y<br/>ejecuta el análisis
              </div>
            )}

            <div className="preview-total">
              <span className="pt-l">Total</span>
              <span className="pt-v mono">{cot?window.fmt(cot.total):'$—'}</span>
            </div>

            <button className="btn-add" disabled={!cot}
              onClick={()=>{
                if(!cot||!analisis) return;
                addToTicket({
                  id:window.uid(),
                  name:`Bordado ${ancho}×${alto}cm`,
                  qty:cantidad,
                  unitPrice:window.round2(cot.sub_u),
                  meta:[prendaSel.label, tela.name, `${puntadas.toLocaleString()} punt.`, posSel.label],
                  module:'bordado'
                });
                if(cot.c_digit>0){
                  addToTicket({
                    id:window.uid(),
                    name:'Digitalización de diseño',
                    qty:1,
                    unitPrice:window.round2(cot.c_digit),
                    meta:[rush?'Urgente':puntadas>10000?'Compleja':'Básica',`Bordado ${ancho}×${alto}cm`],
                    module:'bordado'
                  });
                }
              }}>
              <window.IconPlus size={14} stroke={3}/>Agregar al ticket
            </button>

            {paso===3&&(
              <button type="button"
                style={{width:'100%',marginTop:8,padding:'8px',fontSize:11,color:'var(--text-3)',background:'none',border:'1px dashed var(--border-2)',borderRadius:'var(--radius)',cursor:'pointer'}}
                onClick={()=>{if(imgUrl)URL.revokeObjectURL(imgUrl);setFile(null);setImgUrl(null);setAnalisis(null);histRef.current=[];setUndoLen(0);setPaso(1);}}>
                + Nuevo diseño
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

window.ModuleBordado = ModuleBordado;
