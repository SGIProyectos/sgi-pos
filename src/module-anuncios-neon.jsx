// ========== MÓDULO ANUNCIOS NEÓN (servicio) ==========
// Flujo simple, se usa como bordado:
//   sube SVG → mide → captura ancho real → elige base/perfil → agrega al ticket
//
// Arquitectura:
//   store.jsx  ← catálogo (perfiles + params) + calcularNeon() (función pura)
//   este file  ← solo UI

// Aclara un color (hex #RRGGBB, #RGB o rgb(...)) mezclándolo con blanco.
// amt=0 → mismo color; amt=1 → blanco puro. Se usa para el "núcleo" del tubo neón.
function _neonLighten(input, amt) {
  const t = Math.max(0, Math.min(1, amt));
  let r = 255, g = 255, b = 255;
  if (typeof input === 'string') {
    const s = input.trim();
    if (s.charAt(0) === '#') {
      let h = s.slice(1);
      if (h.length === 3) h = h.split('').map(c => c+c).join('');
      if (h.length >= 6) {
        r = parseInt(h.slice(0,2),16);
        g = parseInt(h.slice(2,4),16);
        b = parseInt(h.slice(4,6),16);
      }
    } else {
      const m = s.match(/rgba?\s*\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
      if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    }
  }
  const lr = Math.round(r + (255 - r) * t);
  const lg = Math.round(g + (255 - g) * t);
  const lb = Math.round(b + (255 - b) * t);
  return `rgb(${lr},${lg},${lb})`;
}

// Elementos SVG medibles
const _NEON_MEASURABLE = ['path','line','polyline','polygon','circle','ellipse','rect'];

// Contenedores que definen plantillas, no dibujos reales
const _NEON_TEMPLATE_TAGS = new Set(['defs','clippath','mask','symbol','pattern','marker']);

// True si el elemento vive dentro de <defs>/<clipPath>/<mask>/<symbol>/<pattern>/<marker>
function _isInsideTemplate(el) {
  let p = el.parentNode;
  while (p && p.nodeType === 1 && p.tagName) {
    const t = p.tagName.toLowerCase();
    if (t === 'svg') return false;
    if (_NEON_TEMPLATE_TAGS.has(t)) return true;
    p = p.parentNode;
  }
  return false;
}

// Palabras que en el id/class/label marcan a un elemento como base del anuncio
const _NEON_BASE_KEYWORDS = ['base','fondo','panel','background','bg'];
// Palabras que marcan a un elemento como recorrido de neón (default si no hay marca)
const _NEON_NEON_KEYWORDS = ['neon','neón','led','luz','trace','trazo','recorrido'];

// Normaliza (lowercase + sin acentos) para comparar id/class
function _normLbl(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
}

// Devuelve 'base' | 'neon' revisando el elemento y sus ancestros por
// id/class/inkscape:label que contenga alguna palabra clave.
function _elRole(el) {
  let node = el;
  while (node && node.nodeType === 1 && node.tagName) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'svg') break;
    const bag = [
      node.getAttribute && node.getAttribute('id'),
      node.getAttribute && node.getAttribute('class'),
      node.getAttribute && node.getAttribute('inkscape:label'),
      node.getAttribute && node.getAttribute('data-role'),
    ].filter(Boolean).map(_normLbl).join(' ');
    if (bag) {
      for (const kw of _NEON_BASE_KEYWORDS) if (bag.includes(kw)) return 'base';
      for (const kw of _NEON_NEON_KEYWORDS) if (bag.includes(kw)) return 'neon';
    }
    node = node.parentNode;
  }
  return 'neon';  // default: si no hay marca explícita, el elemento es del neón
}

// Matriz local → viewBox del SVG.
// getCTM() en Chrome incluye la transformación del viewport, o sea devuelve local→pixels.
// Para obtener local→viewBox usamos: svgRoot.getScreenCTM().inverse() * el.getScreenCTM()
function _elementToViewBoxMatrix(el, svgRoot) {
  try {
    const elCTM  = el.getScreenCTM  && el.getScreenCTM();
    const svgCTM = svgRoot.getScreenCTM && svgRoot.getScreenCTM();
    if (elCTM && svgCTM) return svgCTM.inverse().multiply(elCTM);
  } catch {}
  return null;
}

// Escala lineal de una DOMMatrix (raíz del determinante del bloque lineal)
function _ctmScale(m) {
  if (!m) return 1;
  const det = Math.abs(m.a * m.d - m.b * m.c);
  const s = Math.sqrt(det);
  return s > 0 ? s : 1;
}

// Transforma un bbox local al sistema del viewBox usando la matriz dada.
function _bboxToViewBox(bb, m) {
  if (!bb) return { x:0, y:0, w:0, h:0 };
  if (!m)  return { x:bb.x, y:bb.y, w:bb.width, h:bb.height };
  const corners = [
    { x: bb.x,             y: bb.y              },
    { x: bb.x + bb.width,  y: bb.y              },
    { x: bb.x,             y: bb.y + bb.height  },
    { x: bb.x + bb.width,  y: bb.y + bb.height  },
  ];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of corners) {
    const tx = m.a * c.x + m.c * c.y + m.e;
    const ty = m.b * c.x + m.d * c.y + m.f;
    if (tx < x0) x0 = tx;
    if (ty < y0) y0 = ty;
    if (tx > x1) x1 = tx;
    if (ty > y1) y1 = ty;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Longitud del elemento en su sistema de coordenadas local
function _measureSvgEl(el) {
  const tag = el.tagName.toLowerCase();
  if (['path','line','polyline','polygon'].includes(tag)) {
    try { return el.getTotalLength(); } catch { return 0; }
  }
  if (tag === 'circle') {
    const r = parseFloat(el.getAttribute('r')) || 0;
    return 2 * Math.PI * r;
  }
  if (tag === 'ellipse') {
    const rx = parseFloat(el.getAttribute('rx')) || 0;
    const ry = parseFloat(el.getAttribute('ry')) || 0;
    const h = Math.pow((rx - ry) / ((rx + ry) || 1), 2);
    return Math.PI * (rx + ry) * (1 + 3*h / (10 + Math.sqrt(4 - 3*h)));
  }
  if (tag === 'rect') {
    const w = parseFloat(el.getAttribute('width')) || 0;
    const h = parseFloat(el.getAttribute('height')) || 0;
    return 2 * (w + h);
  }
  return 0;
}

// Parseo de longitudes SVG con unidades
function _parseSvgLen(str) {
  const m = String(str || '').match(/^([\d.]+)\s*([a-z%]*)$/i);
  if (!m) return null;
  return { value: parseFloat(m[1]) || 0, unit: (m[2] || '').toLowerCase() };
}
function _toCm(len) {
  if (!len) return null;
  switch (len.unit) {
    case 'mm': return len.value / 10;
    case 'cm': return len.value;
    case 'in': return len.value * 2.54;
    case 'pt': return len.value * 2.54 / 72;   // 1 pt = 1/72 in
    case 'pc': return len.value * 12 * 2.54 / 72;
    case 'px': return len.value * 2.54 / 96;   // 1 px = 1/96 in (CSS)
    default:   return null;
  }
}

// Detecta el programa que generó el SVG leyendo el comentario/header
function _detectGenerator(text) {
  const s = String(text || '').slice(0, 800).toLowerCase();
  if (s.includes('illustrator')) return 'illustrator';
  if (s.includes('coreldraw'))   return 'corel';
  if (s.includes('inkscape'))    return 'inkscape';
  if (s.includes('figma'))       return 'figma';
  return 'unknown';
}

// Normaliza SVG y detecta escala real. Si el archivo no trae unidades físicas,
// asume DPI según el generador (Illustrator = 72 pt/in, resto = 96 px/in CSS).
function _sanitizeSvg(text) {
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;

    const generator = _detectGenerator(text);

    const wLen = _parseSvgLen(svg.getAttribute('width'));
    const hLen = _parseSvgLen(svg.getAttribute('height'));
    const wCm  = _toCm(wLen);
    const hCm  = _toCm(hLen);

    let vb = svg.getAttribute('viewBox');
    if (!vb) {
      const w = (wLen?.value) || 300;
      const h = (hLen?.value) || 300;
      vb = `0 0 ${w} ${h}`;
      svg.setAttribute('viewBox', vb);
    }
    const parts    = vb.split(/[\s,]+/).map(parseFloat);
    const vbWidth  = parts[2] || 300;
    const vbHeight = parts[3] || 300;

    // Escala cm por unidad de viewBox
    let scaleCmPerPx = 0;
    let scaleSource  = 'unknown';   // 'file' | 'pt' | 'px'
    if (wCm && vbWidth > 0) {
      scaleCmPerPx = wCm / vbWidth;
      scaleSource  = 'file';
    } else if (hCm && vbHeight > 0) {
      scaleCmPerPx = hCm / vbHeight;
      scaleSource  = 'file';
    } else {
      // Sin unidades físicas: asumir puntos si es Illustrator, pixels si no
      if (generator === 'illustrator') {
        scaleCmPerPx = 2.54 / 72;   // 1 pt en cm
        scaleSource  = 'pt';
      } else {
        scaleCmPerPx = 2.54 / 96;   // 1 px CSS en cm
        scaleSource  = 'px';
      }
    }

    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.width  = '100%';
    svg.style.height = '100%';

    return { html: svg.outerHTML, vbWidth, vbHeight, scaleCmPerPx, scaleSource, generator };
  } catch { return null; }
}

// Bounding box unión (engloba todos los elementos del diseño)
function _unionBBox(bboxes) {
  if (!bboxes.length) return { x:0, y:0, w:0, h:0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of bboxes) {
    if (b.w <= 0 || b.h <= 0) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  if (!isFinite(x0)) return { x:0, y:0, w:0, h:0 };
  return { x:x0, y:y0, w:x1-x0, h:y1-y0 };
}

// Color visible del perfil
function _colorPerfil(perfil) {
  const c = (perfil?.color || '').toLowerCase();
  if (c.includes('blanco'))   return '#fff5d9';
  if (c.includes('azul'))     return '#00d4ff';
  if (c.includes('rojo'))     return '#ff2d55';
  if (c.includes('verde'))    return '#39ff14';
  if (c.includes('rosa'))     return '#ff36c7';
  if (c.includes('amarillo')) return '#ffe600';
  if (c.includes('naranja'))  return '#ff8a00';
  if (c.includes('morado') || c.includes('violeta') || c.includes('púrpura') || c.includes('purpura') || c.includes('purple'))
                              return '#b026ff';
  if (c.includes('rgb'))      return '#c14bff';
  return '#b026ff';
}

// ─── Upload ───────────────────────────────────────────────────────────────────
function _NeonUpload({ onSvg }) {
  const inpRef = React.useRef(null);
  const [drag, setDrag] = React.useState(false);
  const readFile = (f) => {
    if (!f || !/\.svg$/i.test(f.name)) { alert('El archivo debe ser un SVG (.svg)'); return; }
    const rd = new FileReader();
    rd.onload = () => {
      const safe = _sanitizeSvg(rd.result);
      if (!safe) { alert('El SVG no se pudo interpretar.'); return; }
      onSvg({ name:f.name, ...safe });
    };
    rd.readAsText(f);
  };
  return (
    <div
      className={'neon-upload'+(drag?' dragging':'')}
      onDragOver={e=>{e.preventDefault(); setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files?.[0]);}}
      onClick={()=>inpRef.current?.click()}
    >
      <input type="file" accept=".svg,image/svg+xml" ref={inpRef} style={{display:'none'}}
        onChange={e=>readFile(e.target.files?.[0])}/>
      <window.IconUpload size={38} stroke={1.4}/>
      <div className="neon-upload-title">Sube el diseño en SVG</div>
      <div className="neon-upload-sub">Archivo vectorial de Illustrator, Corel, Inkscape…</div>
    </div>
  );
}

// ─── Visor con neón como STROKE (línea del color siguiendo contorno) ─────────
function _NeonSvgViewer({ svgHtml, color, colorFor, onScan, excluded, onToggleEl, showTrazos, encendido = true, trazoActivo = null, coloreando = false }) {
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !svgHtml) return;
    wrap.innerHTML = svgHtml;
    const svg = wrap.querySelector('svg');
    if (!svg) return;
    const found = [], bboxes = [];
    _NEON_MEASURABLE.forEach(tag => {
      wrap.querySelectorAll(tag).forEach(el => {
        if (_isInsideTemplate(el)) return;
        const rawLocal = _measureSvgEl(el);
        if (rawLocal < 0.5) return;
        const m        = _elementToViewBoxMatrix(el, svg);
        const scale    = _ctmScale(m);
        const rawVB    = rawLocal * scale;
        let bb = null;
        try { bb = el.getBBox(); } catch { bb = null; }
        const bbVB = _bboxToViewBox(bb, m);
        if (bbVB.w <= 0 && bbVB.h <= 0) return;
        const role = _elRole(el);
        const idx  = found.length;
        el.setAttribute('data-neon-idx', String(idx));
        el.setAttribute('data-neon-role', role);
        found.push({ idx, tag, raw: rawVB, role });
        bboxes.push({ idx, role, x: bbVB.x, y: bbVB.y, w: bbVB.w, h: bbVB.h, area: bbVB.w * bbVB.h });
      });
    });
    onScan(found, bboxes);
  }, [svgHtml]);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const svg = wrap.querySelector('svg');
    if (!svg) return;

    // Grosor de trazo relativo al tamaño del diseño para que se vea consistente
    const vb = (svg.getAttribute('viewBox') || '0 0 300 300').split(/[\s,]+/).map(parseFloat);
    const size   = Math.max(vb[2] || 300, vb[3] || 300);
    const stroke = size * 0.005;  // tubo delgado — la mayor parte del "grosor" visual viene del bloom
    const glowFor = (c) => [
      `drop-shadow(0 0 ${size*0.005}px ${c})`,
      `drop-shadow(0 0 ${size*0.013}px ${c})`,
      `drop-shadow(0 0 ${size*0.028}px ${c})`,
    ].join(' ');

    wrap.querySelectorAll('[data-neon-idx]').forEach(el => {
      const idx  = parseInt(el.getAttribute('data-neon-idx'), 10);
      const role = el.getAttribute('data-neon-role') || 'neon';
      const isOut = excluded.includes(idx);
      const isActivo = trazoActivo === idx;
      const cThis = colorFor ? colorFor(idx) : color;
      const coreThis = _neonLighten(cThis, 0.4);
      el.style.cursor = 'pointer';
      el.style.transition = 'opacity .15s, stroke .15s, filter .15s';
      if (isOut) {
        el.style.fill = '#2a2a2a';
        el.style.stroke = '#555';
        el.style.strokeWidth = String(stroke * 0.4);
        el.style.filter = 'none';
        el.style.opacity = '0.3';
      } else if (role === 'base') {
        // Base del anuncio: silueta blanca tenue, sin glow
        el.style.fill = 'rgba(255,255,255,0.04)';
        el.style.stroke = 'rgba(255,255,255,0.55)';
        el.style.strokeWidth = String(stroke * 0.5);
        el.style.strokeLinejoin = 'round';
        el.style.strokeLinecap  = 'round';
        el.style.filter = 'none';
        el.style.opacity = '1';
      } else if (!encendido) {
        // Modo "apagado": manguera sin luz, se ve como tubo gris sobre la base
        el.style.fill = 'none';
        el.style.stroke = 'rgba(210,210,215,0.55)';
        el.style.strokeWidth = String(stroke);
        el.style.strokeLinejoin = 'round';
        el.style.strokeLinecap  = 'round';
        el.style.filter = 'none';
        el.style.opacity = '1';
      } else {
        // Neón encendido: núcleo casi blanco (vidrio iluminado) + halos del color del trazo
        el.style.fill = 'rgba(255,255,255,0.04)';
        el.style.stroke = coreThis;
        el.style.strokeWidth = String(isActivo ? stroke * 1.6 : stroke);
        el.style.strokeLinejoin = 'round';
        el.style.strokeLinecap  = 'round';
        // Si el trazo está seleccionado (modo colorear), agregar un halo blanco extra pulsante
        el.style.filter = isActivo
          ? `drop-shadow(0 0 ${size*0.008}px #fff) drop-shadow(0 0 ${size*0.02}px #fff) ${glowFor(cThis)}`
          : glowFor(cThis);
        el.style.opacity = '1';
      }
    });
  }, [svgHtml, color, colorFor, excluded, encendido, trazoActivo]);

  const onClick = (e) => {
    if (!showTrazos && !coloreando) return;
    const idx = e.target.getAttribute && e.target.getAttribute('data-neon-idx');
    if (idx != null) onToggleEl(parseInt(idx, 10));
  };

  return (
    <div className={'neon-canvas'+(showTrazos?' adjusting':'')+(coloreando?' coloreando':'')} onClick={onClick} ref={wrapRef}>
      {!svgHtml && (
        <div className="neon-canvas-empty">
          <window.IconBolt size={48} stroke={1.2}/>
          <p>Aún no hay diseño cargado</p>
        </div>
      )}
    </div>
  );
}

// ─── Editor del catálogo (mismo que antes, tal cual) ──────────────────────────
function _NeonConfigModal({ onClose }) {
  const [tab,      setTab]      = React.useState('params');
  const [perfiles, setPerfiles] = React.useState(() => window.NEON_PERFILES_RAW || []);
  const [params,   setParams]   = React.useState(() => ({ ...window.NEON_PARAMS }));

  const guardar = () => {
    window.refreshNeonPerfiles(perfiles);
    window.refreshNeonParams(params);
    onClose();
  };
  const setP = (k, v) => setParams(p => ({ ...p, [k]: v }));
  const setUrg = (i, k, v) => setParams(p => ({
    ...p, urgencias: p.urgencias.map((u,j) => j===i ? { ...u, [k]: v } : u),
  }));
  const addUrg = () => setParams(p => ({ ...p,
    urgencias: [...(p.urgencias||[]), { id:'urg'+Date.now(), nombre:'Nuevo', dias:'', mult:1 }],
  }));
  const rmUrg  = (i) => setParams(p => ({ ...p, urgencias: p.urgencias.filter((_,j)=>j!==i) }));

  const updPerfil = (idx, k, v) => setPerfiles(ps => ps.map((p,i) => i===idx ? { ...p, [k]: v } : p));
  const rmPerfil  = (idx) => setPerfiles(ps => ps.filter((_,i) => i!==idx));
  const addPerfil = () => setPerfiles(ps => [...ps, {
    id:'perfil'+Date.now(), nombre:'Nuevo perfil', color:'Blanco', precioM:0, wattsM:0, alturaMinCm:5, activo:true,
  }]);

  const bases       = params.bases       || [];
  const formas      = params.formas      || [];
  const fuentes     = params.fuentes     || [];
  const consumibles = params.consumibles || [];
  const updBase = (idx, k, v) => setParams(p => ({ ...p, bases: p.bases.map((b,i) => i===idx ? { ...b, [k]: v } : b) }));
  const rmBase  = (idx) => setParams(p => ({ ...p, bases: p.bases.filter((_,i) => i!==idx) }));
  const addBase = () => setParams(p => ({ ...p,
    bases: [...(p.bases||[]), {
      id:'base'+Date.now(), nombre:'Nuevo material',
      tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:0, precioM2:0,
      activo:true,
    }],
  }));
  const updForma = (idx, k, v) => setParams(p => ({ ...p, formas: p.formas.map((f,i) => i===idx ? { ...f, [k]: v } : f) }));
  const rmForma  = (idx) => setParams(p => ({ ...p, formas: p.formas.filter((_,i) => i!==idx) }));
  const addForma = () => setParams(p => ({ ...p,
    formas: [...(p.formas||[]), { id:'forma'+Date.now(), nombre:'Nueva forma', factorArea:1, corteM:0 }],
  }));
  const updFuente = (idx, k, v) => setParams(p => ({ ...p, fuentes: (p.fuentes||[]).map((f,i) => i===idx ? { ...f, [k]: v } : f) }));
  const rmFuente  = (idx) => setParams(p => ({ ...p, fuentes: (p.fuentes||[]).filter((_,i) => i!==idx) }));
  const addFuente = () => setParams(p => ({ ...p,
    fuentes: [...(p.fuentes||[]), { id:'fnt'+Date.now(), nombre:'Nueva fuente', watts:100, precio:0, tipo:'fuente', activo:true }],
  }));
  const updCons = (idx, k, v) => setParams(p => ({ ...p, consumibles: (p.consumibles||[]).map((c,i) => i===idx ? { ...c, [k]: v } : c) }));
  const rmCons  = (idx) => setParams(p => ({ ...p, consumibles: (p.consumibles||[]).filter((_,i) => i!==idx) }));
  const addCons = () => setParams(p => ({ ...p,
    consumibles: [...(p.consumibles||[]), { id:'cons'+Date.now(), nombre:'Nuevo consumible', precio:0, unidad:'pza', activo:true }],
  }));

  const num = (val, k, setter) => (
    <input type="number" min="0" step="0.01" value={val ?? ''}
      onChange={e=>setter(k, parseFloat(e.target.value)||0)} className="mono neon-num"/>
  );

  return (
    <div className="cfg-overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="cfg-modal neon-cfg-modal">
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">Catálogo de Neón</span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18}/></button>
        </div>
        <div className="neon-cfg-tabs">
          <button className={'neon-cfg-tab'+(tab==='params'?' active':'')}      onClick={()=>setTab('params')}>Parámetros</button>
          <button className={'neon-cfg-tab'+(tab==='perfiles'?' active':'')}    onClick={()=>setTab('perfiles')}>Neón ({perfiles.length})</button>
          <button className={'neon-cfg-tab'+(tab==='bases'?' active':'')}       onClick={()=>setTab('bases')}>Bases ({bases.length})</button>
          <button className={'neon-cfg-tab'+(tab==='fuentes'?' active':'')}     onClick={()=>setTab('fuentes')}>Fuentes ({fuentes.length})</button>
          <button className={'neon-cfg-tab'+(tab==='consumibles'?' active':'')} onClick={()=>setTab('consumibles')}>Consumibles ({consumibles.length})</button>
        </div>
        <div className="cfg-modal-body neon-cfg-body">
          {tab === 'params' && (
            <div className="neon-cfg-params">
              <h3 className="neon-cfg-h">Insumos por metro de neón</h3>
              <div className="neon-cfg-grid">
                <div className="field"><label>Cable (MXN/m)</label>{num(params.cableM,'cableM',setP)}</div>
                <div className="field"><label>Accesorios (MXN/m)</label>{num(params.accesM,'accesM',setP)}
                  <div className="neon-hint">grapas, tornillos, conectores</div>
                </div>
              </div>

              <h3 className="neon-cfg-h">Consumibles (cianoacrilato + soldadura)</h3>
              <div className="neon-cfg-grid">
                <div className="field">
                  <label>% sobre materiales</label>
                  <input type="number" min="0" max="1" step="0.01" value={params.consumiblesPct ?? 0.08}
                    onChange={e=>setP('consumiblesPct', parseFloat(e.target.value)||0)} className="mono neon-num"/>
                  <div className="neon-hint">
                    {Math.round((params.consumiblesPct||0)*100)}% sobre neón + cable + accesorios + fuente + base
                  </div>
                </div>
              </div>
              <h3 className="neon-cfg-h">Factor de seguridad de fuente</h3>
              <div className="neon-cfg-grid">
                <div className="field">
                  <label>Factor</label>
                  <input type="number" min="0.1" max="1" step="0.05" value={params.fuenteFactor}
                    onChange={e=>setP('fuenteFactor', parseFloat(e.target.value)||0.8)} className="mono neon-num"/>
                  <div className="neon-hint">
                    Usar solo {Math.round((params.fuenteFactor||0.8)*100)}% de la capacidad nominal (evita sobrecarga).
                    Las fuentes se dan de alta en la pestaña "Fuentes".
                  </div>
                </div>
              </div>
              <h3 className="neon-cfg-h">Mano de obra</h3>
              <div className="neon-cfg-grid">
                <div className="field"><label>Metros por minuto</label>{num(params.mPorMin,'mPorMin',setP)}</div>
                <div className="field"><label>Tarifa por hora</label>{num(params.tarifaHora,'tarifaHora',setP)}</div>
              </div>
              <h3 className="neon-cfg-h">Desperdicio de lámina</h3>
              <div className="neon-cfg-grid">
                <div className="field">
                  <label>Umbral cobrable (cm)</label>
                  <input type="number" min="0" max="100" step="1" value={params.desperdicioUmbralCm||30}
                    onChange={e=>setP('desperdicioUmbralCm', parseFloat(e.target.value)||30)} className="mono neon-num"/>
                  <div className="neon-hint">
                    Tiras sobrantes de la lámina ≤ {params.desperdicioUmbralCm||30} cm se cobran (no reutilizables).
                    Sobrantes más anchos se asumen reutilizables y no se cobran.
                  </div>
                </div>
              </div>

              <h3 className="neon-cfg-h">Merma y margen</h3>
              <div className="neon-cfg-grid">
                <div className="field">
                  <label>Merma</label>
                  <input type="number" min="0" max="1" step="0.01" value={params.merma}
                    onChange={e=>setP('merma', parseFloat(e.target.value)||0)} className="mono neon-num"/>
                  <div className="neon-hint">{Math.round((params.merma||0)*100)}% sobre insumos</div>
                </div>
                <div className="field">
                  <label>Margen</label>
                  <input type="number" min="0" max="1" step="0.01" value={params.margen}
                    onChange={e=>setP('margen', parseFloat(e.target.value)||0)} className="mono neon-num"/>
                  <div className="neon-hint">{Math.round((params.margen||0)*100)}% sobre costo</div>
                </div>
              </div>
              <h3 className="neon-cfg-h">Urgencias</h3>
              <div className="neon-urg-list">
                {(params.urgencias||[]).map((u,i) => (
                  <div key={u.id} className="neon-urg-row">
                    <input value={u.nombre} onChange={e=>setUrg(i,'nombre',e.target.value)}/>
                    <input value={u.dias}   onChange={e=>setUrg(i,'dias',e.target.value)}/>
                    <input type="number" min="0.5" step="0.05" value={u.mult}
                      onChange={e=>setUrg(i,'mult',parseFloat(e.target.value)||1)} className="mono neon-num"/>
                    <button className="neon-icon-btn" onClick={()=>rmUrg(i)}><window.IconTrash size={13}/></button>
                  </div>
                ))}
                <button className="neon-btn-ghost neon-btn-small" onClick={addUrg}><window.IconPlus size={13}/> Agregar</button>
              </div>
            </div>
          )}
          {tab === 'perfiles' && (
            <div>
              <p className="neon-hint" style={{marginBottom:10}}>
                <strong>Altura mín</strong>: la altura mínima de letra/forma que se puede formar con esa manguera
                (por radio de curvatura). Debajo de ese valor, el sistema muestra advertencia al cotizar.
              </p>
              <table className="neon-perfil-tab">
                <thead><tr><th>Perfil</th><th>Color</th><th>Precio/m</th><th>Watts/m</th><th>Altura mín (cm)</th><th>Activo</th><th></th></tr></thead>
                <tbody>
                  {perfiles.map((p,i) => (
                    <tr key={p.id}>
                      <td><input value={p.nombre} onChange={e=>updPerfil(i,'nombre',e.target.value)}/></td>
                      <td><input value={p.color}  onChange={e=>updPerfil(i,'color',e.target.value)}/></td>
                      <td><input type="number" min="0" step="0.01" value={p.precioM}
                        onChange={e=>updPerfil(i,'precioM',parseFloat(e.target.value)||0)} className="mono neon-num"/></td>
                      <td><input type="number" min="0" step="0.01" value={p.wattsM}
                        onChange={e=>updPerfil(i,'wattsM',parseFloat(e.target.value)||0)} className="mono neon-num"/></td>
                      <td><input type="number" min="0" step="0.5" value={p.alturaMinCm||5}
                        onChange={e=>updPerfil(i,'alturaMinCm',parseFloat(e.target.value)||5)} className="mono neon-num"/></td>
                      <td className="c"><input type="checkbox" checked={p.activo!==false}
                        onChange={e=>updPerfil(i,'activo',e.target.checked)}/></td>
                      <td><button className="neon-icon-btn" onClick={()=>rmPerfil(i)}><window.IconTrash size={13}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="neon-btn-ghost neon-btn-small" onClick={addPerfil}><window.IconPlus size={13}/> Agregar perfil</button>
            </div>
          )}
          {tab === 'bases' && (
            <div>
              <h3 className="neon-cfg-h">Materiales para base</h3>
              <p className="neon-hint" style={{marginBottom:10}}>
                <strong>Pieza</strong>: compras ya cortado a medida (ej. MDF). Se cobra por m² directo.
                <br/>
                <strong>Lámina</strong>: compras la lámina completa (ej. acrílico). Se cobra el pedazo usado y el
                sobrante se puede cobrar como desperdicio (toggle por cotización).
              </p>
              <table className="neon-perfil-tab">
                <thead><tr>
                  <th>Material</th><th>Tipo</th><th>Lámina W×H (cm)</th><th>Precio</th><th>Activo</th><th></th>
                </tr></thead>
                <tbody>
                  {bases.map((b,i) => {
                    const tipo = b.tipoPrecio || (b.precioLamina ? 'lamina' : 'pieza');
                    return (
                      <tr key={b.id}>
                        <td><input value={b.nombre} onChange={e=>updBase(i,'nombre',e.target.value)}/></td>
                        <td>
                          <select value={tipo} onChange={e=>updBase(i,'tipoPrecio',e.target.value)} className="mono neon-num">
                            <option value="pieza">Pieza</option>
                            <option value="lamina">Lámina</option>
                          </select>
                        </td>
                        <td>
                          {tipo === 'lamina' ? (
                            <div style={{display:'flex', gap:4, alignItems:'center'}}>
                              <input type="number" min="1" step="1" value={b.laminaW||120}
                                onChange={e=>updBase(i,'laminaW',parseFloat(e.target.value)||120)}
                                className="mono neon-num" style={{width:'50px'}}/>
                              <span>×</span>
                              <input type="number" min="1" step="1" value={b.laminaH||240}
                                onChange={e=>updBase(i,'laminaH',parseFloat(e.target.value)||240)}
                                className="mono neon-num" style={{width:'50px'}}/>
                            </div>
                          ) : (
                            <span style={{color:'var(--text-3)'}}>—</span>
                          )}
                        </td>
                        <td>
                          {tipo === 'lamina' ? (
                            <div style={{display:'flex', gap:4, alignItems:'center'}}>
                              <input type="number" min="0" step="1" value={b.precioLamina||0}
                                onChange={e=>updBase(i,'precioLamina',parseFloat(e.target.value)||0)}
                                className="mono neon-num"/>
                              <span style={{fontSize:'0.7rem', color:'var(--text-3)'}}>/lám</span>
                            </div>
                          ) : (
                            <div style={{display:'flex', gap:4, alignItems:'center'}}>
                              <input type="number" min="0" step="0.01" value={b.precioM2||0}
                                onChange={e=>updBase(i,'precioM2',parseFloat(e.target.value)||0)}
                                className="mono neon-num"/>
                              <span style={{fontSize:'0.7rem', color:'var(--text-3)'}}>/m²</span>
                            </div>
                          )}
                        </td>
                        <td className="c"><input type="checkbox" checked={b.activo!==false}
                          onChange={e=>updBase(i,'activo',e.target.checked)}/></td>
                        <td><button className="neon-icon-btn" onClick={()=>rmBase(i)}><window.IconTrash size={13}/></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="neon-btn-ghost neon-btn-small" onClick={addBase} style={{marginTop:8}}><window.IconPlus size={13}/> Agregar material</button>

              <h3 className="neon-cfg-h" style={{marginTop:22}}>Formas de la base</h3>
              <table className="neon-perfil-tab">
                <thead><tr><th>Forma</th><th>Factor área</th><th>Corte MXN/m</th><th></th></tr></thead>
                <tbody>
                  {formas.map((f,i) => (
                    <tr key={f.id}>
                      <td><input value={f.nombre} onChange={e=>updForma(i,'nombre',e.target.value)}/></td>
                      <td><input type="number" min="0.1" max="1.2" step="0.01" value={f.factorArea}
                        onChange={e=>updForma(i,'factorArea',parseFloat(e.target.value)||1)} className="mono neon-num"/></td>
                      <td><input type="number" min="0" step="0.5" value={f.corteM}
                        onChange={e=>updForma(i,'corteM',parseFloat(e.target.value)||0)} className="mono neon-num"/></td>
                      <td><button className="neon-icon-btn" onClick={()=>rmForma(i)}><window.IconTrash size={13}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="neon-btn-ghost neon-btn-small" onClick={addForma} style={{marginTop:8}}><window.IconPlus size={13}/> Agregar forma</button>

              <h3 className="neon-cfg-h" style={{marginTop:22}}>Kit de separadores / soportes</h3>
              <div className="field">
                <label>Precio del kit (MXN)</label>
                {num(params.soportePrecio,'soportePrecio',setP)}
              </div>
            </div>
          )}
          {tab === 'fuentes' && (
            <div>
              <p className="neon-hint" style={{marginBottom:10}}>
                Fuentes de poder, adaptadores y pilas. Al cotizar puedes elegir "Auto"
                (el sistema toma la más chica que aguante los watts) o una específica.
              </p>
              <table className="neon-perfil-tab">
                <thead><tr><th>Nombre</th><th>Tipo</th><th>Watts</th><th>Precio</th><th>Activo</th><th></th></tr></thead>
                <tbody>
                  {fuentes.map((f,i) => (
                    <tr key={f.id}>
                      <td><input value={f.nombre} onChange={e=>updFuente(i,'nombre',e.target.value)}/></td>
                      <td>
                        <select value={f.tipo||'fuente'} onChange={e=>updFuente(i,'tipo',e.target.value)} className="mono neon-num">
                          <option value="fuente">Fuente</option>
                          <option value="adaptador">Adaptador</option>
                          <option value="pila">Pila / batería</option>
                        </select>
                      </td>
                      <td><input type="number" min="0" step="1" value={f.watts||0}
                        onChange={e=>updFuente(i,'watts',parseFloat(e.target.value)||0)} className="mono neon-num"/></td>
                      <td><input type="number" min="0" step="1" value={f.precio||0}
                        onChange={e=>updFuente(i,'precio',parseFloat(e.target.value)||0)} className="mono neon-num"/></td>
                      <td className="c"><input type="checkbox" checked={f.activo!==false}
                        onChange={e=>updFuente(i,'activo',e.target.checked)}/></td>
                      <td><button className="neon-icon-btn" onClick={()=>rmFuente(i)}><window.IconTrash size={13}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="neon-btn-ghost neon-btn-small" onClick={addFuente} style={{marginTop:8}}>
                <window.IconPlus size={13}/> Agregar fuente / adaptador / pila
              </button>
            </div>
          )}
          {tab === 'consumibles' && (
            <div>
              <p className="neon-hint" style={{marginBottom:10}}>
                Referencia de consumibles usados (cianoacrilato, soldadura, termofit, flux…).
                El costo se cobra automáticamente como <strong>{Math.round((params.consumiblesPct||0.08)*100)}%
                sobre materiales</strong> (se configura en pestaña Parámetros). Esta lista sirve
                para tener registro de precios y saber cuáles tienes en inventario.
              </p>
              <table className="neon-perfil-tab">
                <thead><tr><th>Nombre</th><th>Precio</th><th>Unidad</th><th>Activo</th><th></th></tr></thead>
                <tbody>
                  {consumibles.map((c,i) => (
                    <tr key={c.id}>
                      <td><input value={c.nombre} onChange={e=>updCons(i,'nombre',e.target.value)}/></td>
                      <td><input type="number" min="0" step="1" value={c.precio||0}
                        onChange={e=>updCons(i,'precio',parseFloat(e.target.value)||0)} className="mono neon-num"/></td>
                      <td><input value={c.unidad||'pza'} onChange={e=>updCons(i,'unidad',e.target.value)} className="mono neon-num" style={{textAlign:'left'}}/></td>
                      <td className="c"><input type="checkbox" checked={c.activo!==false}
                        onChange={e=>updCons(i,'activo',e.target.checked)}/></td>
                      <td><button className="neon-icon-btn" onClick={()=>rmCons(i)}><window.IconTrash size={13}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="neon-btn-ghost neon-btn-small" onClick={addCons} style={{marginTop:8}}>
                <window.IconPlus size={13}/> Agregar consumible
              </button>
            </div>
          )}
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="cfg-btn-save" onClick={guardar}><window.IconCheck size={15}/> Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de proyectos (guardar / abrir) ────────────────────────────────────
function _NeonProyectosModal({ mode, currentSnapshot, onClose, onLoad }) {
  const [lista, setLista] = React.useState(() => window.storageLoad('sgi_neon_proyectos', []));
  const [nombre, setNombre] = React.useState(currentSnapshot?.nombre || '');
  const [cliente, setCliente] = React.useState(currentSnapshot?.cliente || '');
  const [busqueda, setBusqueda] = React.useState('');

  const guardar = () => {
    if (!nombre.trim()) { alert('Escribe un nombre para el proyecto.'); return; }
    if (!currentSnapshot?.svgFile) { alert('No hay diseño cargado que guardar.'); return; }
    const proyecto = {
      ...currentSnapshot,
      id: window.uid(),
      nombre: nombre.trim(),
      cliente: cliente.trim(),
      fecha: new Date().toISOString(),
    };
    const nueva = [proyecto, ...lista];
    window.storageSave('sgi_neon_proyectos', nueva);
    setLista(nueva);
    onClose();
  };

  const borrar = (id) => {
    if (!confirm('¿Borrar este proyecto?')) return;
    const nueva = lista.filter(p => p.id !== id);
    window.storageSave('sgi_neon_proyectos', nueva);
    setLista(nueva);
  };

  const filtrada = lista.filter(p => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (p.nombre||'').toLowerCase().includes(q) || (p.cliente||'').toLowerCase().includes(q);
  });

  return (
    <div className="cfg-modal-overlay" onClick={onClose}>
      <div className="cfg-modal neon-cfg-modal" onClick={(e)=>e.stopPropagation()} style={{maxWidth:'720px'}}>
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">
            {mode === 'guardar' ? 'Guardar proyecto de neón' : 'Abrir proyecto guardado'}
          </span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18}/></button>
        </div>
        <div className="cfg-modal-body" style={{padding:16}}>
          {mode === 'guardar' ? (
            <>
              <div className="field" style={{marginBottom:12}}>
                <label>Nombre del proyecto</label>
                <input value={nombre} onChange={e=>setNombre(e.target.value)}
                  placeholder="Ej: Logo Restaurante Alba" autoFocus
                  style={{width:'100%'}}/>
              </div>
              <div className="field" style={{marginBottom:12}}>
                <label>Cliente (opcional)</label>
                <input value={cliente} onChange={e=>setCliente(e.target.value)}
                  placeholder="Nombre del cliente"
                  style={{width:'100%'}}/>
              </div>
              <div className="neon-hint">
                Se guarda: diseño SVG, medidas, perfil, fuente, base y todos los ajustes actuales.
                Podrás abrirlo desde <strong>Abrir proyecto</strong> para retomarlo sin recapturar.
              </div>
            </>
          ) : (
            <>
              <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o cliente…"
                style={{width:'100%', marginBottom:12}}/>
              {filtrada.length === 0 ? (
                <div className="neon-hint" style={{textAlign:'center', padding:20}}>
                  {lista.length === 0 ? 'No hay proyectos guardados aún.' : 'Sin coincidencias.'}
                </div>
              ) : (
                <div style={{maxHeight:'50vh', overflowY:'auto'}}>
                  {filtrada.map(p => (
                    <div key={p.id} className="neon-proyecto-item">
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontWeight:600}}>{p.nombre}</div>
                        <div className="neon-hint" style={{fontSize:'0.72rem'}}>
                          {p.cliente && `${p.cliente} · `}
                          {new Date(p.fecha).toLocaleDateString('es-MX')}
                          {p.anchoCm > 0 && ` · ${p.anchoCm} cm`}
                        </div>
                      </div>
                      <button className="neon-btn-ghost neon-btn-small"
                        onClick={()=>{ onLoad(p); onClose(); }}>
                        Abrir
                      </button>
                      <button className="neon-icon-btn" onClick={()=>borrar(p.id)} title="Borrar">
                        <window.IconTrash size={13}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cerrar</button>
          {mode === 'guardar' && (
            <button className="cfg-btn-save" onClick={guardar}>
              <window.IconSave size={15}/> Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Simulador en fachada (foto del muro + neón overlay draggable) ───────────
function _NeonFachadaModal({ svgHtml, color, colorFor, excluded, onClose }) {
  const [foto,       setFoto]       = React.useState(null);  // { url, w, h }
  const [pos,        setPos]        = React.useState({ x: 40, y: 40 });
  const [escala,     setEscala]     = React.useState(0.6);
  const [rotacion,   setRotacion]   = React.useState(0);
  const [opacidad,   setOpacidad]   = React.useState(1);
  const [tamNeon,    setTamNeon]    = React.useState({ w: 320, h: 180 });
  const [descargando,setDescargando]= React.useState(false);
  const dragRef  = React.useRef(null);
  const stageRef = React.useRef(null);
  const neonRef  = React.useRef(null);

  const cargarFoto = (f) => {
    if (!f || !f.type.startsWith('image/')) { alert('Sube una imagen (JPG, PNG).'); return; }
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => setFoto({ url: rd.result, w: img.naturalWidth, h: img.naturalHeight });
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };

  // Cuando cambia el SVG, medir su tamaño natural (viewBox)
  React.useEffect(() => {
    if (!neonRef.current) return;
    const svg = neonRef.current.querySelector('svg');
    if (!svg) return;
    const vb = (svg.getAttribute('viewBox') || '0 0 300 300').split(/[\s,]+/).map(parseFloat);
    setTamNeon({ w: vb[2] || 300, h: vb[3] || 300 });
  }, [svgHtml]);

  // Drag
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y };
  };
  React.useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ESC para cerrar
  React.useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Descargar PNG compuesto: foto de fondo + SVG del neón encima con transform
  const descargar = async () => {
    if (!foto || !stageRef.current || !neonRef.current) return;
    setDescargando(true);
    try {
      const stage = stageRef.current;
      const stageRect = stage.getBoundingClientRect();
      const scaleFotoStage = foto.w / stageRect.width;

      const canvas = document.createElement('canvas');
      canvas.width = foto.w;
      canvas.height = foto.h;
      const ctx = canvas.getContext('2d');

      // Fondo
      const bgImg = new Image();
      await new Promise((res, rej) => { bgImg.onload = res; bgImg.onerror = rej; bgImg.src = foto.url; });
      ctx.drawImage(bgImg, 0, 0, foto.w, foto.h);

      // Serializar el SVG (con estilos inline ya aplicados por el viewer)
      const svgEl = neonRef.current.querySelector('svg');
      if (!svgEl) throw new Error('SVG no encontrado');
      const clone = svgEl.cloneNode(true);
      const vb = (svgEl.getAttribute('viewBox') || `0 0 ${tamNeon.w} ${tamNeon.h}`).split(/[\s,]+/).map(parseFloat);
      // Añadir padding al viewBox para no cortar el bloom
      const pad = Math.max(vb[2], vb[3]) * 0.15;
      clone.setAttribute('viewBox', `${vb[0]-pad} ${vb[1]-pad} ${vb[2]+pad*2} ${vb[3]+pad*2}`);
      clone.setAttribute('width', String(vb[2]+pad*2));
      clone.setAttribute('height', String(vb[3]+pad*2));
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const svgStr = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const svgImg = new Image();
      await new Promise((res, rej) => { svgImg.onload = res; svgImg.onerror = rej; svgImg.src = svgUrl; });

      // Tamaño del neón en la foto (escalado desde stage → foto)
      const neonWStage = tamNeon.w * escala;
      const neonHStage = tamNeon.h * escala;
      const wF = neonWStage * scaleFotoStage;
      const hF = neonHStage * scaleFotoStage;
      const padF = wF * 0.15;  // mismo padding proporcional
      const centroX = (pos.x + neonWStage / 2) * scaleFotoStage;
      const centroY = (pos.y + neonHStage / 2) * scaleFotoStage;

      ctx.save();
      ctx.globalAlpha = opacidad;
      ctx.translate(centroX, centroY);
      ctx.rotate((rotacion * Math.PI) / 180);
      ctx.drawImage(svgImg, -(wF + padF*2) / 2, -(hF + padF*2) / 2, wF + padF*2, hF + padF*2);
      ctx.restore();

      URL.revokeObjectURL(svgUrl);

      const link = document.createElement('a');
      link.download = `neon-en-fachada-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      alert('No se pudo generar la imagen: ' + err.message);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="neon-fach-overlay">
      <div className="neon-fach-head">
        <div>
          <div style={{fontWeight:700, fontSize:'1rem'}}>Simulador en fachada</div>
          <div style={{fontSize:'0.75rem', opacity:0.6}}>Sube la foto del muro y arrastra el neón para posicionarlo</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="neon-btn-ghost neon-btn-small" onClick={descargar} disabled={!foto || descargando}>
            <window.IconUpload size={13} style={{transform:'rotate(180deg)'}}/> {descargando ? 'Generando…' : 'Descargar PNG'}
          </button>
          <button className="neon-fach-close" onClick={onClose} title="Cerrar (ESC)">
            <window.IconX size={18}/>
          </button>
        </div>
      </div>

      <div className="neon-fach-body">
        <div className="neon-fach-stage-wrap">
          {!foto ? (
            <label className="neon-fach-empty">
              <input type="file" accept="image/*" style={{display:'none'}}
                onChange={(e)=>cargarFoto(e.target.files?.[0])}/>
              <window.IconImage size={48} stroke={1.2}/>
              <div style={{marginTop:8, fontSize:'0.9rem'}}>Click para subir foto del muro</div>
              <div style={{marginTop:4, fontSize:'0.75rem', opacity:0.6}}>JPG, PNG</div>
            </label>
          ) : (
            <div className="neon-fach-stage" ref={stageRef}
              style={{backgroundImage:`url(${foto.url})`, aspectRatio:`${foto.w}/${foto.h}`}}>
              <div ref={neonRef}
                className="neon-fach-overlay-neon"
                style={{
                  left: pos.x, top: pos.y,
                  width: tamNeon.w * escala, height: tamNeon.h * escala,
                  transform: `rotate(${rotacion}deg)`,
                  opacity: opacidad,
                  cursor: dragRef.current ? 'grabbing' : 'grab',
                }}
                onMouseDown={onMouseDown}
              >
                <_NeonSvgViewer
                  svgHtml={svgHtml} color={color}
                  colorFor={colorFor}
                  excluded={excluded} onToggleEl={()=>{}}
                  onScan={()=>{}} showTrazos={false}
                  encendido={true}
                />
              </div>
            </div>
          )}
        </div>

        <div className="neon-fach-controls">
          <div className="field">
            <label>Foto del muro</label>
            <label className="neon-btn-ghost neon-btn-small" style={{cursor:'pointer', textAlign:'center'}}>
              <input type="file" accept="image/*" style={{display:'none'}}
                onChange={(e)=>cargarFoto(e.target.files?.[0])}/>
              {foto ? 'Cambiar foto' : 'Subir foto'}
            </label>
          </div>

          <div className="field">
            <label>Tamaño ({Math.round(escala*100)}%)</label>
            <input type="range" min="10" max="200" step="1" value={escala*100}
              onChange={e=>setEscala(parseFloat(e.target.value)/100)}/>
          </div>

          <div className="field">
            <label>Rotación ({rotacion}°)</label>
            <input type="range" min="-45" max="45" step="1" value={rotacion}
              onChange={e=>setRotacion(parseFloat(e.target.value))}/>
          </div>

          <div className="field">
            <label>Intensidad ({Math.round(opacidad*100)}%)</label>
            <input type="range" min="20" max="100" step="1" value={opacidad*100}
              onChange={e=>setOpacidad(parseFloat(e.target.value)/100)}/>
          </div>

          <div className="neon-hint">
            <strong>Tip:</strong> arrastra el neón sobre la foto con el mouse.
            Ajusta el tamaño y la rotación con los sliders. Descarga el PNG para enviárselo al cliente.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Componente raíz del módulo (servicio, panel único) ──────────────────────
function ModuleAnunciosNeon({ addToTicket }) {
  const [svgFile,   setSvgFile]   = React.useState(null);
  const [elements,  setElements]  = React.useState([]);   // {idx, tag, raw}
  const [bboxes,    setBboxes]    = React.useState([]);
  const [excluded,  setExcluded]  = React.useState([]);   // idx de elementos que NO llevan neón
  const [anchoCm,   setAnchoCm]   = React.useState(0);    // ancho real del anuncio
  const [showTrazos,setShowTrazos]= React.useState(false);// modo "excluir trazos"
  const [showCfg,   setShowCfg]   = React.useState(false);
  const [uniones,   setUniones]   = React.useState(0);
  const [unionesTocado, setUnionesTocado] = React.useState(false);
  const [encendido, setEncendido] = React.useState(true);
  const [presentando, setPresentando] = React.useState(false);
  const [proyectoModal, setProyectoModal] = React.useState(null);  // null | 'guardar' | 'abrir'
  const [cliente, setCliente] = React.useState('');
  const [nombreProyecto, setNombreProyecto] = React.useState('');
  const [fachadaOpen, setFachadaOpen] = React.useState(false);
  const [trazoPerfiles, setTrazoPerfiles] = React.useState({});  // { idx: perfilId }
  const [trazoActivo,   setTrazoActivo]   = React.useState(null); // idx del trazo seleccionado para colorear
  const [showColorear,  setShowColorear]  = React.useState(false);
  const [perfilId,  setPerfilId]  = React.useState(window.NEON_PERFILES[0]?.id || '');
  const [fuenteId,  setFuenteId]  = React.useState('auto');  // 'auto' = elegir por watts, o id específico
  const [urgId,     setUrgId]     = React.useState(window.NEON_PARAMS.urgencias[0]?.id || 'normal');
  const [baseMatId, setBaseMatId] = React.useState(window.NEON_PARAMS.bases.find(b=>b.activo!==false)?.id || 'sin-base');
  const [baseFormaId, setBaseFormaId] = React.useState('rect');
  const [incSoporte,setIncSoporte]= React.useState(false);
  const [cobrarDesperdicio, setCobrarDesperdicio] = React.useState(true); // cobra la tira sobrante de la lámina
  const [piezaCostoManual, setPiezaCostoManual] = React.useState('');    // '' = usa auto; número = costo manual de la pieza (solo tipoPrecio pieza)
  const [manualOverride, setManualOverride] = React.useState(false); // muestra inputs de ancho/alto
  const [corteExtra, setCorteExtra] = React.useState(0);              // corte láser manual adicional (MXN)
  const [consumiblesPct, setConsumiblesPct] = React.useState(         // % consumibles override para esta cotización
    Math.round((window.NEON_PARAMS.consumiblesPct || 0.08) * 100)
  );
  const [manoObraManual, setManoObraManual] = React.useState('');     // '' = usa auto; número = override

  const params    = window.NEON_PARAMS;
  const perfil    = window.NEON_PERFILES.find(p => p.id === perfilId) || window.NEON_PERFILES[0];
  const urgencia  = params.urgencias.find(u => u.id === urgId) || params.urgencias[0];
  const fuentesActivas = (params.fuentes || []).filter(f => f.activo !== false && f.tipo !== 'pila')
    .sort((a,b) => (a.watts||0) - (b.watts||0));
  const fuentesAll = (params.fuentes || []).filter(f => f.activo !== false);
  const baseMat   = (params.bases  || []).find(b => b.id === baseMatId)   || { nombre:'Sin base', precioM2:0 };
  const baseForma = (params.formas || []).find(f => f.id === baseFormaId) || params.formas?.[0];
  const color     = _colorPerfil(perfil);

  // Separación base vs neón (viene del rol asignado al escanear el SVG)
  const baseBboxes = React.useMemo(() => bboxes.filter(b => b.role === 'base'), [bboxes]);
  const neonBboxes = React.useMemo(() => bboxes.filter(b => b.role !== 'base'), [bboxes]);
  const hasBase    = baseBboxes.length > 0;

  // Bbox que define el ancho/alto del anuncio:
  //   - si hay una capa "base" → usamos SOLO su bbox (la base es literalmente el panel)
  //   - si no → union de todo (comportamiento anterior)
  const bbox     = React.useMemo(
    () => _unionBBox(hasBase ? baseBboxes : bboxes),
    [bboxes, baseBboxes, hasBase]
  );
  const svgAncho = bbox.w || 0;
  const svgAlto  = bbox.h || 0;
  // Ancho detectado del archivo (si trae unidades reales)
  const anchoArchivoCm = svgFile?.scaleCmPerPx > 0 ? window.round2(svgAncho * svgFile.scaleCmPerPx) : 0;
  // Prellenar el input con el ancho del archivo cuando esté disponible
  React.useEffect(() => {
    if (anchoArchivoCm > 0 && anchoCm === 0) setAnchoCm(anchoArchivoCm);
  }, [anchoArchivoCm]);

  // Escala efectiva
  const scaleEff = anchoCm > 0 && svgAncho > 0 ? anchoCm / svgAncho : 0;
  const altoCm   = window.round2(svgAlto * scaleEff);

  // Longitud del neón = perímetro solo de los elementos con rol "neon" (excluidos aparte)
  const Lm = React.useMemo(() => {
    if (!scaleEff) return 0;
    return elements.reduce((s,e) => {
      if (e.role === 'base') return s;
      if (excluded.includes(e.idx)) return s;
      return s + e.raw * scaleEff;
    }, 0) / 100;
  }, [elements, excluded, scaleEff]);

  // Elementos del neón que quedan por debajo de la altura mínima del perfil elegido.
  // Un elemento "chico" no se puede formar con la manguera (curva no cierra).
  const alturaMinPerfilCm = perfil?.alturaMinCm || 5;
  const elementosChicos = React.useMemo(() => {
    if (!scaleEff || !neonBboxes.length) return [];
    return neonBboxes
      .filter(b => !excluded.includes(b.idx))
      .map(b => ({ idx:b.idx, wCm: b.w * scaleEff, hCm: b.h * scaleEff }))
      .filter(e => Math.min(e.wCm, e.hCm) < alturaMinPerfilCm);
  }, [neonBboxes, excluded, scaleEff, alturaMinPerfilCm]);

  // Perfil sugerido: el más chico (menor alturaMinCm) que sí cabe en el elemento más pequeño detectado.
  // Solo se sugiere si el perfil actual NO cabe (elementosChicos > 0) y hay otro que sí.
  const perfilSugerido = React.useMemo(() => {
    if (!scaleEff || elementosChicos.length === 0) return null;
    const activos = neonBboxes.filter(b => !excluded.includes(b.idx));
    if (!activos.length) return null;
    const minCm = Math.min(...activos.map(b => Math.min(b.w, b.h) * scaleEff));
    const perfilesOrd = window.NEON_PERFILES.slice().sort((a,b) => (a.alturaMinCm||5) - (b.alturaMinCm||5));
    const encaja = perfilesOrd.find(p => (p.alturaMinCm||5) <= minCm);
    return (encaja && encaja.id !== perfilId) ? encaja : null;
  }, [neonBboxes, excluded, scaleEff, elementosChicos, perfilId]);

  // Uniones auto: 1 por cada trazo activo (cada trazo separado requiere al menos una conexión).
  // Si el usuario tocó el input manualmente, se respeta su valor.
  const unionesAuto = React.useMemo(() => {
    const activos = neonBboxes.filter(b => !excluded.includes(b.idx)).length;
    return Math.max(0, activos);
  }, [neonBboxes, excluded]);
  React.useEffect(() => {
    if (!unionesTocado) setUniones(unionesAuto);
  }, [unionesAuto, unionesTocado]);

  // Fuente: si 'auto', elige la más chica del catálogo (excluyendo pilas) que cubra los watts totales × factor de seguridad
  const wattsNeeded = Lm * (perfil?.wattsM || 0);
  const fuenteAuto = React.useMemo(() => {
    if (!fuentesActivas.length) return null;
    const cap = (w) => (w || 0) * params.fuenteFactor;
    return fuentesActivas.find(f => cap(f.watts) >= wattsNeeded) || fuentesActivas[fuentesActivas.length - 1];
  }, [fuentesActivas, wattsNeeded, params.fuenteFactor]);
  const fuente = fuenteId === 'auto'
    ? (fuenteAuto || fuentesAll[0] || { nombre:'—', watts:100, precio:0 })
    : (fuentesAll.find(f => f.id === fuenteId) || fuenteAuto || fuentesAll[0] || { nombre:'—', watts:100, precio:0 });

  // Perfil asignado a cada trazo (override o perfil global)
  const perfilDeTrazo = (idx) => {
    const pid = trazoPerfiles[idx];
    if (pid) return window.NEON_PERFILES.find(p => p.id === pid) || perfil;
    return perfil;
  };
  // Color del trazo (para pintar en el viewer)
  const colorDeTrazo = (idx) => _colorPerfil(perfilDeTrazo(idx));

  // Tramos = agrupación de longitud por perfil, para cotizar con múltiples colores/mangueras
  const tramos = React.useMemo(() => {
    if (!scaleEff) return [];
    const map = new Map();
    for (const e of elements) {
      if (e.role === 'base' || excluded.includes(e.idx)) continue;
      const pf = perfilDeTrazo(e.idx);
      const key = pf?.id || '_';
      const lm = (e.raw * scaleEff) / 100;
      if (!map.has(key)) map.set(key, { perfil: pf, Lm: 0 });
      map.get(key).Lm += lm;
    }
    return Array.from(map.values());
  }, [elements, excluded, scaleEff, trazoPerfiles, perfilId]);

  // Los params se pasan con el % de consumibles override (por si se ajustó para esta cotización)
  const paramsRun = { ...params, consumiblesPct: Math.max(0, consumiblesPct) / 100 };
  const result = window.calcularNeon({
    Lm, uniones, perfil, tramos, fuente,
    dimensiones: { anchoCm, altoCm },
    base: {
      material: baseMat, forma: baseForma, incluirSoporte: incSoporte,
      corteExtra, cobrarDesperdicio,
      piezaCostoOverride: piezaCostoManual === '' ? 0 : Number(piezaCostoManual) || 0,
    },
    params: paramsRun, urgenciaMult: urgencia?.mult || 1,
    manoObraOverride: manoObraManual === '' ? undefined : manoObraManual,
  });

  const onScan = (found, bbs) => {
    setBboxes(bbs);
    setElements(found);
  };
  // Establecer un nuevo SVG (desde upload) reseteando el estado dependiente del archivo
  const cargarSvgFile = (sf) => {
    setSvgFile(sf);
    setExcluded([]);
    setUnionesTocado(false);
    setAnchoCm(0);
    setTrazoPerfiles({}); setTrazoActivo(null);
  };
  const onClickTrazo = (idx) => {
    if (showColorear) {
      setTrazoActivo(prev => (prev === idx ? null : idx));
      return;
    }
    if (showTrazos) {
      setExcluded(x => x.includes(idx) ? x.filter(i => i !== idx) : [...x, idx]);
    }
  };

  // Asignar un perfil al trazo seleccionado (o quitar el override → vuelve al global)
  const asignarPerfilATrazoActivo = (pid) => {
    if (trazoActivo == null) return;
    setTrazoPerfiles(prev => {
      const next = { ...prev };
      if (!pid || pid === perfilId) delete next[trazoActivo];
      else next[trazoActivo] = pid;
      return next;
    });
    setTrazoActivo(null);
  };

  const resetSvg = () => {
    setSvgFile(null); setElements([]); setBboxes([]); setExcluded([]); setAnchoCm(0);
    setUnionesTocado(false);
    setTrazoPerfiles({}); setTrazoActivo(null); setShowColorear(false);
  };

  // ESC para salir del modo presentación
  React.useEffect(() => {
    if (!presentando) return;
    const onEsc = (e) => { if (e.key === 'Escape') setPresentando(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [presentando]);

  // Snapshot serializable del proyecto actual (para guardar)
  const snapshotProyecto = () => ({
    svgFile, anchoCm, excluded,
    perfilId, fuenteId, urgId, baseMatId, baseFormaId,
    incSoporte, cobrarDesperdicio, piezaCostoManual,
    corteExtra, consumiblesPct, manoObraManual,
    uniones, unionesTocado,
    trazoPerfiles,
    cliente, nombre: nombreProyecto,
  });

  // Restaurar todos los estados desde un proyecto guardado
  const cargarProyecto = (p) => {
    setSvgFile(p.svgFile || null);
    setExcluded(Array.isArray(p.excluded) ? p.excluded : []);
    setAnchoCm(Number(p.anchoCm) || 0);
    if (p.perfilId)   setPerfilId(p.perfilId);
    if (p.fuenteId)   setFuenteId(p.fuenteId);
    if (p.urgId)      setUrgId(p.urgId);
    if (p.baseMatId)  setBaseMatId(p.baseMatId);
    if (p.baseFormaId) setBaseFormaId(p.baseFormaId);
    setIncSoporte(!!p.incSoporte);
    setCobrarDesperdicio(p.cobrarDesperdicio !== false);
    setPiezaCostoManual(p.piezaCostoManual ?? '');
    setCorteExtra(Number(p.corteExtra) || 0);
    if (typeof p.consumiblesPct === 'number') setConsumiblesPct(p.consumiblesPct);
    setManoObraManual(p.manoObraManual ?? '');
    setUniones(Number(p.uniones) || 0);
    setUnionesTocado(!!p.unionesTocado);
    setTrazoPerfiles(p.trazoPerfiles && typeof p.trazoPerfiles === 'object' ? p.trazoPerfiles : {});
    setCliente(p.cliente || '');
    setNombreProyecto(p.nombre || '');
  };

  // Imprimir cotización — llama a printSgiDoc con el div oculto de la cotización
  const imprimirCotizacion = () => {
    if (Lm <= 0) { alert('Sube el diseño y captura el ancho para poder imprimir.'); return; }
    window.printSgiDoc('.neon-print-doc');
  };

  const agregarTicket = () => {
    if (Lm <= 0) { alert('Sube el diseño y captura el ancho del anuncio para poder cotizar.'); return; }
    const multiColor = tramos.length > 1;
    const descColor = multiColor
      ? `${tramos.length} colores`
      : `${perfil.nombre} ${perfil.color}`;
    const desgloseTramos = multiColor
      ? tramos.map(t => `${t.perfil.color} ${t.Lm.toFixed(2)}m`).join(' · ')
      : null;
    const item = {
      id:        window.uid(),
      name:      `Anuncio neón ${anchoCm}×${altoCm} cm · ${descColor}`,
      qty:       1,
      unitPrice: result.precio,
      module:    'neon',
      iconKey:   'zap',
      meta: [
        `${result.Lm.toFixed(2)} m de neón · ${result.uniones} uniones`,
        ...(desgloseTramos ? [desgloseTramos] : []),
        `Base: ${baseMat.nombre} (${baseForma.nombre}) · ${result.areaM2.toFixed(2)} m²`,
        `${result.numFuentes} × ${result.fuenteNombre}`,
        `Urgencia: ${urgencia.nombre} (${urgencia.dias})`,
      ],
    };
    addToTicket(item);
    // Reset básico para siguiente cotización (dejar el catálogo elegido)
    setSvgFile(null); setElements([]); setBboxes([]); setExcluded([]);
    setAnchoCm(0); setUniones(0); setUnionesTocado(false); setCorteExtra(0);
    setTrazoPerfiles({}); setTrazoActivo(null); setShowColorear(false);
    setConsumiblesPct(Math.round((window.NEON_PARAMS.consumiblesPct || 0.08) * 100));
    setManoObraManual('');
    setPiezaCostoManual('');
  };

  return (
    <div className="neon-svc">
      <div className="neon-svc-head">
        <div>
          <h1 className="neon-svc-title">Anuncios Neón</h1>
          <p className="neon-svc-sub">Sube el diseño en SVG, captura el ancho real y agrega al ticket</p>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="neon-btn-ghost" onClick={()=>setProyectoModal('abrir')}
            title="Abrir un proyecto de neón guardado">
            <window.IconFolder size={14}/> Abrir
          </button>
          <button className="neon-btn-ghost" onClick={()=>setProyectoModal('guardar')}
            title="Guardar el diseño y ajustes actuales" disabled={!svgFile}>
            <window.IconSave size={14}/> Guardar
          </button>
          <button className="neon-btn-primary" onClick={()=>setShowCfg(true)}
            title="Configurar perfiles, materiales, insumos, urgencias, mano de obra">
            <window.IconSettings size={15}/> Catálogo del módulo
          </button>
        </div>
      </div>

      <div className="neon-svc-grid">
        {/* Columna izquierda: SVG + medidas */}
        <div className="neon-svc-left">
          {!svgFile ? (
            <_NeonUpload onSvg={cargarSvgFile}/>
          ) : (
            <>
              <div className="neon-file-bar">
                <span><window.IconFileText size={13}/> {svgFile.name}</span>
                <div style={{display:'flex', gap:6}}>
                  <button className={'neon-btn-ghost neon-btn-small'+(encendido?' active':'')}
                    onClick={()=>setEncendido(!encendido)}
                    title={encendido ? 'Ver como se ve apagado (de día)' : 'Ver encendido (de noche)'}>
                    <window.IconBolt size={12}/> {encendido ? 'Encendido' : 'Apagado'}
                  </button>
                  <button className="neon-btn-ghost neon-btn-small"
                    onClick={()=>setPresentando(true)}
                    title="Mostrar al cliente en pantalla completa">
                    <window.IconMaximize size={12}/> Presentar
                  </button>
                  <button className="neon-btn-ghost neon-btn-small"
                    onClick={()=>setFachadaOpen(true)}
                    title="Montar el neón sobre una foto de la fachada">
                    <window.IconImage size={12}/> En fachada
                  </button>
                  <button className={'neon-btn-ghost neon-btn-small'+(showColorear?' active':'')}
                    onClick={()=>{ setShowColorear(!showColorear); setShowTrazos(false); setTrazoActivo(null); }}
                    title="Asignar colores/perfiles distintos por trazo">
                    <window.IconBulb size={12}/> {showColorear ? 'Listo' : 'Colorear'}
                  </button>
                  <button className={'neon-btn-ghost neon-btn-small'+(showTrazos?' active':'')}
                    onClick={()=>{ setShowTrazos(!showTrazos); setShowColorear(false); setTrazoActivo(null); }}>
                    <window.IconEdit size={12}/> {showTrazos ? 'Listo' : 'Excluir trazos'}
                  </button>
                  <button className="neon-btn-ghost neon-btn-small" onClick={resetSvg}>Cambiar</button>
                </div>
              </div>
              <_NeonSvgViewer
                svgHtml={svgFile.html} color={color}
                colorFor={colorDeTrazo}
                excluded={excluded} onToggleEl={onClickTrazo}
                onScan={onScan} showTrazos={showTrazos}
                encendido={encendido}
                trazoActivo={trazoActivo} coloreando={showColorear}
              />
              {showTrazos && (
                <div className="neon-help">
                  Click en un trazo para marcarlo como "no lleva neón" (queda gris tenue).
                </div>
              )}
              {showColorear && (
                <div className="neon-color-panel">
                  <div className="neon-color-help">
                    {trazoActivo == null
                      ? 'Click en un trazo del diseño para seleccionarlo, luego elige el color.'
                      : `Trazo #${trazoActivo+1} seleccionado — elige el color a aplicar.`}
                  </div>
                  <div className="neon-swatches">
                    {window.NEON_PERFILES.map(p => {
                      const c = _colorPerfil(p);
                      const activo = trazoActivo != null && (trazoPerfiles[trazoActivo] === p.id || (!trazoPerfiles[trazoActivo] && p.id === perfilId));
                      return (
                        <button key={p.id}
                          className={'neon-swatch'+(activo?' current':'')}
                          disabled={trazoActivo == null}
                          onClick={()=>asignarPerfilATrazoActivo(p.id)}
                          title={`${p.nombre} · ${p.color} · ${window.fmt(p.precioM)}/m`}>
                          <span className="neon-swatch-dot" style={{background:c, boxShadow:`0 0 10px ${c}`}}/>
                          <span className="neon-swatch-lbl">{p.color}</span>
                        </button>
                      );
                    })}
                  </div>
                  {trazoActivo != null && trazoPerfiles[trazoActivo] && (
                    <button className="neon-btn-ghost neon-btn-small"
                      onClick={()=>asignarPerfilATrazoActivo(null)}
                      style={{marginTop:8}}>
                      ↺ Volver al perfil global para este trazo
                    </button>
                  )}
                  {Object.keys(trazoPerfiles).length > 0 && (
                    <button className="neon-btn-ghost neon-btn-small"
                      onClick={()=>{ setTrazoPerfiles({}); setTrazoActivo(null); }}
                      style={{marginTop:8}}>
                      ↺ Un solo color para todo
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Columna derecha: dimensiones, catálogo, desglose, botón */}
        <div className="neon-svc-right">
          <div className="neon-panel">
            <h3 className="neon-panel-h">Dimensiones</h3>
            <div className="neon-dim-field" style={{marginBottom:10}}>
              <label>Cliente (opcional)</label>
              <div className="neon-dim-input">
                <input value={cliente} onChange={e=>setCliente(e.target.value)}
                  placeholder="Nombre del cliente" style={{flex:1}}/>
              </div>
            </div>
            {!svgFile ? (
              <div className="neon-readout-src">Sube un diseño para ver medidas detectadas.</div>
            ) : (() => {
              const altoArchivoCm = svgFile.scaleCmPerPx > 0 ? window.round2(svgAlto * svgFile.scaleCmPerPx) : 0;
              const srcLabel = {
                file: 'del archivo (unidades físicas)',
                pt:   'asumido: puntos Illustrator (72 pt/pulg)',
                px:   'asumido: pixels CSS (96 px/pulg)',
              }[svgFile.scaleSource] || '';
              return (
                <>
                  <div className="neon-readout">
                    <div className="neon-readout-row">
                      <span className="neon-readout-lbl">Base</span>
                      <span className="neon-readout-val mono">
                        {hasBase
                          ? `${anchoCm || anchoArchivoCm} × ${altoCm || altoArchivoCm} cm`
                          : <span style={{color:'var(--text-3)'}}>— (no hay capa "base")</span>}
                      </span>
                    </div>
                    <div className="neon-readout-row">
                      <span className="neon-readout-lbl">Neón</span>
                      <span className="neon-readout-val mono">
                        {Lm > 0
                          ? `${Lm.toFixed(2)} m · ${neonBboxes.length} traz${neonBboxes.length===1?'o':'os'}`
                          : <span style={{color:'var(--text-3)'}}>—</span>}
                      </span>
                    </div>
                  </div>
                  <div className="neon-readout-src">
                    Escala: {srcLabel} · unidades del archivo <span className="mono">{svgAncho.toFixed(0)} × {svgAlto.toFixed(0)}</span>
                  </div>
                  <button
                    className="neon-btn-ghost neon-btn-small neon-override-btn"
                    onClick={()=>setManualOverride(!manualOverride)}
                  >
                    {manualOverride ? 'Ocultar ajuste manual' : 'Ajustar dimensiones manualmente'}
                  </button>
                  {manualOverride && (
                    <>
                      <div className="neon-dim-row">
                        <div className="neon-dim-field">
                          <label>Ancho real</label>
                          <div className="neon-dim-input">
                            <input type="number" min="1" step="0.5" value={anchoCm || ''}
                              placeholder={anchoArchivoCm || 'ej: 194'}
                              onChange={e=>setAnchoCm(Math.max(0, parseFloat(e.target.value)||0))} className="mono"/>
                            <span>cm</span>
                          </div>
                        </div>
                        <div className="neon-dim-x">×</div>
                        <div className="neon-dim-field">
                          <label>Alto (proporcional)</label>
                          <div className="neon-dim-input">
                            <input value={altoCm > 0 ? altoCm : ''} readOnly className="mono neon-readonly" placeholder="—"/>
                            <span>cm</span>
                          </div>
                        </div>
                      </div>
                      <div className="neon-hint">
                        Cambiar el ancho re-escala todo (base y neón) proporcionalmente sin tocar el archivo.
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>

          {svgFile && scaleEff > 0 && elementosChicos.length > 0 && (
            <div className="neon-warn">
              <div className="neon-warn-title">
                <window.IconBolt size={14}/> Advertencia técnica
              </div>
              <div className="neon-warn-body">
                <strong>{elementosChicos.length} elemento{elementosChicos.length!==1?'s':''}</strong> del
                neón mide{elementosChicos.length===1?'':'n'} menos de <strong>{alturaMinPerfilCm} cm</strong> —
                el mínimo del perfil <strong>{perfil?.nombre} {perfil?.color}</strong>.
                <ul style={{margin:'4px 0 0 18px', padding:0}}>
                  {elementosChicos.slice(0,5).map(e => (
                    <li key={e.idx} className="mono" style={{fontSize:'0.72rem'}}>
                      Elemento #{e.idx+1}: {e.wCm.toFixed(1)} × {e.hCm.toFixed(1)} cm
                    </li>
                  ))}
                  {elementosChicos.length > 5 && (
                    <li style={{fontSize:'0.72rem'}}>… y {elementosChicos.length-5} más</li>
                  )}
                </ul>
                <div style={{marginTop:6, fontSize:'0.72rem'}}>
                  Con esa medida la manguera no puede doblarse lo suficiente para formar la letra o figura.
                  Opciones: <strong>subir el ancho</strong> del anuncio (Ajustar manualmente),
                  o <strong>cambiar a un perfil más delgado</strong>.
                </div>
                {perfilSugerido && (
                  <button
                    className="neon-btn-ghost neon-btn-small"
                    style={{marginTop:8}}
                    onClick={()=>setPerfilId(perfilSugerido.id)}
                    title={`Perfil ${perfilSugerido.nombre} tiene altura mínima ${perfilSugerido.alturaMinCm} cm`}
                  >
                    ↳ Usar {perfilSugerido.nombre} {perfilSugerido.color} ({window.fmt(perfilSugerido.precioM)}/m)
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="neon-panel">
            <h3 className="neon-panel-h">Base</h3>
            <select value={baseMatId} onChange={e=>setBaseMatId(e.target.value)} className="neon-select">
              {(params.bases||[]).filter(b=>b.activo!==false).map(b => {
                const isLam = (b.tipoPrecio || (b.precioLamina ? 'lamina' : 'pieza')) === 'lamina';
                const label = isLam
                  ? (b.precioLamina > 0 ? ` · ${window.fmt(b.precioLamina)}/lám ${b.laminaW||120}×${b.laminaH||240}` : '')
                  : (b.precioM2 > 0    ? ` · ${window.fmt(b.precioM2)}/m²` : '');
                return <option key={b.id} value={b.id}>{b.nombre}{label}</option>;
              })}
            </select>
            {(baseMat.tipoPrecio === 'pieza' || (!baseMat.tipoPrecio && !baseMat.precioLamina)) && baseMat.precioM2 > 0 && anchoCm > 0 && (
              <div className="neon-dim-field" style={{marginTop:10}}>
                <label>Costo de la pieza (MXN)</label>
                <div className="neon-dim-input">
                  <input type="number" min="0" step="10" value={piezaCostoManual}
                    placeholder={String(result.importeBaseAuto || 0)}
                    onChange={e=>setPiezaCostoManual(e.target.value)} className="mono"/>
                  <span>MXN</span>
                </div>
                <div className="neon-hint">
                  <strong>{baseMat.nombre}</strong> se compra ya cortado a medida.
                  Estimado por referencia: <strong>{window.fmt(result.importeBaseAuto)}</strong>
                  ({result.areaM2.toFixed(2)} m² × ${baseMat.precioM2}/m²).
                  Escribe el costo real que te cobra el proveedor.
                </div>
              </div>
            )}
            <div className="neon-forma-btns">
              {(params.formas||[]).map(f => (
                <button key={f.id} className={'neon-forma-btn'+(baseFormaId===f.id?' active':'')} onClick={()=>setBaseFormaId(f.id)}>
                  {f.nombre}
                  {f.corteM > 0 && <span className="neon-forma-extra">+corte {window.fmt(f.corteM)}/m</span>}
                </button>
              ))}
            </div>
            <label className="neon-check">
              <input type="checkbox" checked={incSoporte} onChange={e=>setIncSoporte(e.target.checked)}/>
              Kit de separadores ({window.fmt(params.soportePrecio||0)})
            </label>
            {(baseMat.tipoPrecio === 'lamina' || baseMat.precioLamina) && (
              <>
                <label className="neon-check">
                  <input type="checkbox" checked={cobrarDesperdicio} onChange={e=>setCobrarDesperdicio(e.target.checked)}/>
                  Cobrar desperdicio de lámina
                </label>
                {cobrarDesperdicio && result.desperdicioM2 > 0 && (
                  <div className="neon-hint" style={{marginTop:4}}>
                    Tira sobrante <strong>{result.desperdicioTiraCm.toFixed(0)} cm</strong> × {baseMat.laminaH||240} cm
                    ({result.desperdicioM2.toFixed(2)} m²) = <strong>{window.fmt(result.importeDesperdicio)}</strong>
                  </div>
                )}
                {cobrarDesperdicio && result.desperdicioM2 === 0 && result.desperdicioTiraCm > 0 && (
                  <div className="neon-hint" style={{marginTop:4}}>
                    Tira sobrante de <strong>{result.desperdicioTiraCm.toFixed(0)} cm</strong> —
                    supera el umbral ({params.desperdicioUmbralCm||30} cm), se asume reutilizable, no se cobra.
                  </div>
                )}
                {cobrarDesperdicio && result.desperdicioTiraCm === 0 && anchoCm > 0 && (
                  <div className="neon-hint" style={{marginTop:4}}>
                    La base cabe exacto en la lámina o la excede — sin tira sobrante para cobrar.
                  </div>
                )}
              </>
            )}
            <div className="neon-dim-field" style={{marginTop:10}}>
              <label>Consumibles (% sobre materiales)</label>
              <div className="neon-dim-input">
                <input type="number" min="0" max="100" step="1" value={consumiblesPct}
                  onChange={e=>setConsumiblesPct(Math.max(0, parseFloat(e.target.value)||0))} className="mono"/>
                <span>%</span>
              </div>
              <div className="neon-hint">
                Cianoacrilato + soldadura + varios. Default del catálogo: {Math.round((params.consumiblesPct||0.08)*100)}%.
                Puedes ajustarlo aquí solo para esta cotización.
              </div>
            </div>
            <div className="neon-dim-field" style={{marginTop:10}}>
              <label>Corte láser adicional (MXN)</label>
              <div className="neon-dim-input">
                <input type="number" min="0" step="10" value={corteExtra || ''}
                  placeholder="0"
                  onChange={e=>setCorteExtra(Math.max(0, parseFloat(e.target.value)||0))} className="mono"/>
                <span>MXN</span>
              </div>
              <div className="neon-hint">
                Se suma como partida extra. Úsalo cuando el corte no encaja en las 3 formas de arriba (ej. detalles internos, calados especiales).
              </div>
            </div>
            <div className="neon-dim-field" style={{marginTop:10}}>
              <label>Mano de obra (MXN)</label>
              <div className="neon-dim-input">
                <input type="number" min="0" step="10" value={manoObraManual}
                  placeholder={String(result.manoObraAuto || 0)}
                  onChange={e=>setManoObraManual(e.target.value)} className="mono"/>
                <span>MXN</span>
              </div>
              <div className="neon-hint">
                Sugerencia auto: <strong>{window.fmt(result.manoObraAuto)}</strong>
                &nbsp;({result.horas.toFixed(2)} h × ${(params.tarifaHora||0)}/h a {params.mPorMin} m/min).
                Deja vacío para usar la sugerencia, o escribe el monto que cobras.
              </div>
            </div>
          </div>

          <div className="neon-panel">
            <h3 className="neon-panel-h">Neón</h3>
            <label className="neon-mini-lbl">Manguera</label>
            <select value={perfilId} onChange={e=>setPerfilId(e.target.value)} className="neon-select">
              {window.NEON_PERFILES.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} · {p.color} · {window.fmt(p.precioM)}/m</option>
              ))}
            </select>
            <label className="neon-mini-lbl" style={{marginTop:8}}>Fuente / adaptador / pila</label>
            <select value={fuenteId} onChange={e=>setFuenteId(e.target.value)} className="neon-select">
              <option value="auto">
                Auto ({fuenteAuto ? `${fuenteAuto.nombre} — ${result.numFuentes} pza` : 'sin fuentes'})
              </option>
              {fuentesAll.map(f => (
                <option key={f.id} value={f.id}>
                  {f.nombre} · {f.watts}W · {window.fmt(f.precio)}
                </option>
              ))}
            </select>
            <div className="neon-hint">
              Watts totales: <strong>{result.wattsTotal.toFixed(1)} W</strong>
              {' · '}Fuente elegida: <strong>{result.fuenteNombre}</strong> × {result.numFuentes}
            </div>
            <div className="neon-two-cols">
              <div>
                <label className="neon-mini-lbl">Uniones</label>
                <div className="neon-uniones">
                  <button onClick={()=>{ setUniones(Math.max(0,uniones-1)); setUnionesTocado(true); }}><window.IconMinus size={13}/></button>
                  <input type="number" min="0" value={uniones}
                    onChange={e=>{ setUniones(Math.max(0,parseInt(e.target.value)||0)); setUnionesTocado(true); }} className="mono"/>
                  <button onClick={()=>{ setUniones(uniones+1); setUnionesTocado(true); }}><window.IconPlus size={13}/></button>
                </div>
                {!unionesTocado && unionesAuto > 0 && (
                  <div className="neon-hint" style={{marginTop:3}}>
                    Auto: 1 por trazo. Ajusta si sabes cuántas necesitas.
                  </div>
                )}
                {unionesTocado && (
                  <button className="neon-btn-ghost neon-btn-small" style={{marginTop:3, fontSize:'0.7rem', padding:'2px 6px'}}
                    onClick={()=>setUnionesTocado(false)}>
                    ↺ Volver a auto ({unionesAuto})
                  </button>
                )}
              </div>
              <div>
                <label className="neon-mini-lbl">Urgencia</label>
                <select value={urgId} onChange={e=>setUrgId(e.target.value)} className="neon-select">
                  {params.urgencias.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} · {u.dias}{u.mult!==1?` (×${u.mult})`:''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Desglose compacto y total */}
          <div className="neon-total-panel">
            {Lm > 0 ? (
              <>
                <div className="neon-total-lines">
                  {result.insumos.map((r,i) => (
                    <div key={i} className="neon-total-line">
                      <span>{r.concepto}</span>
                      <span className="mono">{window.fmt(r.importe)}</span>
                    </div>
                  ))}
                  <div className="neon-total-line neon-total-mo">
                    <span>Mano de obra ({result.horas.toFixed(1)} h)</span>
                    <span className="mono">{window.fmt(result.manoObra)}</span>
                  </div>
                  <div className="neon-total-line neon-total-sub">
                    <span>Subtotal + merma + margen{urgencia?.mult>1?` × urgencia`:''}</span>
                    <span className="mono">{window.fmt(result.precio)}</span>
                  </div>
                  <div className="neon-total-line">
                    <span>IVA 16%</span>
                    <span className="mono">{window.fmt(result.iva)}</span>
                  </div>
                </div>
                <div className="neon-total-big">
                  <span>Total</span>
                  <span className="mono">{window.fmt(result.precioIva)}</span>
                </div>
              </>
            ) : (
              <div className="neon-total-empty">Captura el ancho del anuncio para ver el precio</div>
            )}
            <button className="neon-btn-add" onClick={agregarTicket} disabled={Lm <= 0}>
              <window.IconPlus size={16}/> Agregar al ticket
            </button>
            <button className="neon-btn-ghost" onClick={imprimirCotizacion} disabled={Lm <= 0}
              style={{marginTop:6, width:'100%'}}>
              <window.IconPrint size={14}/> Imprimir cotización
            </button>
          </div>
        </div>
      </div>

      {showCfg && <_NeonConfigModal onClose={()=>setShowCfg(false)}/>}

      {proyectoModal && (
        <_NeonProyectosModal
          mode={proyectoModal}
          currentSnapshot={snapshotProyecto()}
          onClose={()=>setProyectoModal(null)}
          onLoad={cargarProyecto}
        />
      )}

      {/* Documento imprimible de cotización (oculto en pantalla, se muestra dentro del iframe de printSgiDoc) */}
      {svgFile && Lm > 0 && (
        <div className="cq-print-doc neon-print-doc" style={{display:'none'}}>
          <div className="np-head">
            <div className="np-negocio">
              <div className="np-neg-name">{window.NEGOCIO?.nombre || 'SGI'}</div>
              <div className="np-neg-line">{window.NEGOCIO?.direccion}, {window.NEGOCIO?.colonia}</div>
              <div className="np-neg-line">{window.NEGOCIO?.ciudad}, {window.NEGOCIO?.estado} {window.NEGOCIO?.cp}</div>
              <div className="np-neg-line">RFC {window.NEGOCIO?.rfc} · Tel {window.NEGOCIO?.telefono}</div>
              {window.NEGOCIO?.email && <div className="np-neg-line">{window.NEGOCIO.email}</div>}
            </div>
            <div className="np-doc-info">
              <div className="np-doc-title">COTIZACIÓN</div>
              <div className="np-doc-sub">Anuncio en Neón LED</div>
              <div className="np-doc-line">Fecha: {new Date().toLocaleDateString('es-MX', {day:'2-digit', month:'long', year:'numeric'})}</div>
              <div className="np-doc-line">Vigencia: 15 días</div>
            </div>
          </div>

          {(cliente || nombreProyecto) && (
            <div className="np-cliente">
              {cliente && <div><strong>Cliente:</strong> {cliente}</div>}
              {nombreProyecto && <div><strong>Proyecto:</strong> {nombreProyecto}</div>}
            </div>
          )}

          <div className="np-preview-box">
            <div className="np-preview">
              <_NeonSvgViewer
                svgHtml={svgFile.html} color={color}
                colorFor={colorDeTrazo}
                excluded={excluded} onToggleEl={()=>{}}
                onScan={()=>{}} showTrazos={false}
                encendido={true}
              />
            </div>
            <div className="np-detalle">
              <div className="np-det-row"><span>Dimensiones</span><strong>{anchoCm} × {altoCm} cm</strong></div>
              <div className="np-det-row"><span>{tramos.length > 1 ? 'Colores de neón' : 'Perfil de neón'}</span>
                <strong>{tramos.length > 1
                  ? tramos.map(t => `${t.perfil.color} (${t.Lm.toFixed(1)}m)`).join(' · ')
                  : `${perfil?.nombre} · ${perfil?.color}`}</strong>
              </div>
              <div className="np-det-row"><span>Longitud total de neón</span><strong>{result.Lm.toFixed(2)} m</strong></div>
              <div className="np-det-row"><span>Uniones/empalmes</span><strong>{result.uniones}</strong></div>
              <div className="np-det-row"><span>Base</span><strong>{baseMat.nombre} ({baseForma.nombre})</strong></div>
              <div className="np-det-row"><span>Fuente de poder</span><strong>{result.numFuentes} × {result.fuenteNombre}</strong></div>
              <div className="np-det-row"><span>Watts totales</span><strong>{result.wattsTotal.toFixed(1)} W</strong></div>
              <div className="np-det-row"><span>Tiempo de entrega</span><strong>{urgencia?.dias}</strong></div>
            </div>
          </div>

          <table className="np-partidas">
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>Concepto</th>
                <th style={{textAlign:'right'}}>Cantidad</th>
                <th style={{textAlign:'right'}}>Unitario</th>
                <th style={{textAlign:'right'}}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {result.insumos.map((r,i) => (
                <tr key={i}>
                  <td>{r.concepto}</td>
                  <td style={{textAlign:'right'}} className="mono">{r.cantidad.toFixed(2)} {r.unidad}</td>
                  <td style={{textAlign:'right'}} className="mono">{window.fmt(r.unit)}</td>
                  <td style={{textAlign:'right'}} className="mono">{window.fmt(r.importe)}</td>
                </tr>
              ))}
              <tr>
                <td>Mano de obra ({result.horas.toFixed(1)} h)</td>
                <td></td>
                <td></td>
                <td style={{textAlign:'right'}} className="mono">{window.fmt(result.manoObra)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="np-sub">
                <td colSpan="3" style={{textAlign:'right'}}>Subtotal</td>
                <td style={{textAlign:'right'}} className="mono">{window.fmt(result.precio)}</td>
              </tr>
              <tr>
                <td colSpan="3" style={{textAlign:'right'}}>IVA 16%</td>
                <td style={{textAlign:'right'}} className="mono">{window.fmt(result.iva)}</td>
              </tr>
              <tr className="np-total">
                <td colSpan="3" style={{textAlign:'right'}}>TOTAL</td>
                <td style={{textAlign:'right'}} className="mono">{window.fmt(result.precioIva)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="np-notas">
            <strong>Notas:</strong> Precios en MXN. Cotización válida por 15 días.
            Tiempo de entrega sujeto a confirmación al recibir anticipo del 50%.
            Instalación en sitio se cotiza por separado según ubicación.
          </div>
        </div>
      )}

      {fachadaOpen && svgFile && (
        <_NeonFachadaModal
          svgHtml={svgFile.html} color={color} colorFor={colorDeTrazo}
          excluded={excluded}
          onClose={()=>setFachadaOpen(false)}
        />
      )}

      {presentando && svgFile && (
        <div className="neon-present-overlay" onClick={()=>setPresentando(false)}>
          <div className="neon-present-stage" onClick={(e)=>e.stopPropagation()}>
            <_NeonSvgViewer
              svgHtml={svgFile.html} color={color}
              colorFor={colorDeTrazo}
              excluded={excluded} onToggleEl={()=>{}}
              onScan={()=>{}} showTrazos={false}
              encendido={true}
            />
          </div>
          <div className="neon-present-info">
            <div className="mono" style={{fontSize:'0.95rem'}}>
              {anchoCm && altoCm ? `${anchoCm} × ${altoCm} cm` : '—'}
              {' · '}{perfil?.nombre} {perfil?.color}
              {Lm > 0 && `  ·  ${Lm.toFixed(2)} m de neón`}
            </div>
          </div>
          <button className="neon-present-close" onClick={()=>setPresentando(false)} title="Cerrar (ESC)">
            <window.IconX size={20}/>
          </button>
          <div className="neon-present-hint">Click fuera o ESC para cerrar</div>
        </div>
      )}
    </div>
  );
}

window.ModuleAnunciosNeon = ModuleAnunciosNeon;
