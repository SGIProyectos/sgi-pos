// ========== MÓDULO COTIZADOR EXPRESS ==========

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function _capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

// ─── Análisis IA: extrae nombre, categoría y specs de descripciones de PDF ────
async function _analyzeProductDescs(descs) {
  const apiKey = window.storageLoad('sgi_api_key', '');
  if (!apiKey || !descs.length) return null;

  const prompt = `Eres experto en categorización de productos industriales, de señalización y de impresión gráfica.

Para cada descripción de producto de una requisición de compra, extrae:
- "nombre": nombre comercial limpio y conciso (3-6 palabras en español, sin cantidades ni dimensiones)
- "categoria": categoría apropiada en español (2-4 palabras en plural, ej. "Señalamientos laminados", "Equipos de protección", "Materiales eléctricos")
- "specs": características técnicas clave separadas por " · " (máximo 3, incluye dimensiones o material si son importantes)

Descripciones a analizar:
${descs.map((d, i) => `${i + 1}. "${d}"`).join('\n')}

Responde ÚNICAMENTE con un array JSON válido sin markdown ni texto adicional:
[{"nombre":"...","categoria":"...","specs":"..."}]`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const text = (data.content?.[0]?.text || '').trim();
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.error('[SGI IA]', e);
    return null;
  }
}

// ─── Productos para cotización manual (todos los módulos + catálogo) ──────────
function _buildManualCatalog() {
  const catalog = window.COTI_CATALOG || [];
  const sections = [];

  // ── Copiado directo ──────────────────────────────────────────────────────
  const copiadoDirect = (window.COPIADO_DIRECT_RAW || []).filter(s => s.activo !== false);
  if (copiadoDirect.length) sections.push({
    id: 'copiado', label: 'Centro de Copiado',
    items: copiadoDirect.map(s => ({
      id: s.id, nombre: s.name, specs: s.desc, precio: s.price, unidad: s.unidad || 'hoja',
    })),
  });

  // ── Tarjetas / Papelería (del catálogo express) ──────────────────────────
  const papCats = ['tarjetas','volantes','tripticos','posters','folders','imanes','membretadas'];
  for (const catId of papCats) {
    const items = catalog.filter(c => c.cat === catId);
    if (!items.length) continue;
    const catLabel = (window.COTI_CATS || []).find(c => c.id === catId)?.label || catId;
    sections.push({
      id: catId, label: catLabel,
      items: items.map(p => ({
        id: p.id, nombre: p.nombre, specs: p.specs, unidad: p.unidad,
        tiered: p.tiered, precios: p.precios,
        precio: p.precios[0]?.precio || 0,
      })),
    });
  }

  // ── Formatos / Bloques ───────────────────────────────────────────────────
  const blks = catalog.filter(c => c.cat === 'formatos');
  if (blks.length) sections.push({
    id: 'formatos', label: 'Formatos / Bloques',
    items: blks.map(p => ({
      id: p.id, nombre: p.nombre, specs: p.specs, unidad: p.unidad,
      tiered: p.tiered, precios: p.precios, precio: p.precios[0]?.precio || 0,
    })),
  });

  // ── Gran Formato ─────────────────────────────────────────────────────────
  const gfMats = (window.GF_MATERIALS || []);
  if (gfMats.length) sections.push({
    id: 'granformato', label: 'Gran Formato',
    items: gfMats.map(m => ({
      id: m.id, nombre: m.name, specs: `${m.type} · ${m.finish || ''}`.trim(), precio: m.price, unidad: 'm²',
    })),
  });

  // ── Catálogo gran formato (catálogo express) ─────────────────────────────
  const gfExtra = catalog.filter(c => c.cat === 'granformato');
  if (gfExtra.length) sections.push({
    id: 'gf-extra', label: 'Lonas / Vinil (express)',
    items: gfExtra.map(p => ({
      id: p.id, nombre: p.nombre, specs: p.specs, unidad: p.unidad,
      tiered: false, precios: p.precios, precio: p.precios[0]?.precio || 0,
    })),
  });

  // ── Bordado ──────────────────────────────────────────────────────────────
  const telas = (window.BORDADO_TELAS || []);
  if (telas.length) sections.push({
    id: 'bordado', label: 'Bordado',
    items: [
      { id: 'bordado-base', nombre: 'Bordado (cotización personalizada)', specs: 'Según puntadas, tela y urgencia', precio: 0, unidad: 'pza' },
      ...telas.map(t => ({ id: t.id, nombre: `Bordado en ${t.name}`, specs: `Multiplicador ×${t.mult}`, precio: 0, unidad: 'pza' })),
    ],
  });

  // ── Acabados ─────────────────────────────────────────────────────────────
  const acabados = catalog.filter(c => c.cat === 'acabados');
  if (acabados.length) sections.push({
    id: 'acabados', label: 'Acabados',
    items: acabados.map(p => ({
      id: p.id, nombre: p.nombre, specs: p.specs, unidad: p.unidad,
      tiered: false, precios: p.precios, precio: p.precios[0]?.precio || 0,
    })),
  });

  // Categorías personalizadas (productos dados de alta por el operador)
  const _knownCatIds = new Set(['copiado','tarjetas','volantes','tripticos','posters','folders','imanes','membretadas','formatos','granformato','gf-extra','bordado','letras','neon','acabados']);
  const _customByGroup = {};
  for (const item of catalog) {
    if (_knownCatIds.has(item.cat)) continue;
    (_customByGroup[item.cat] = _customByGroup[item.cat] || []).push({
      id: item.id, nombre: item.nombre, specs: item.specs || '', unidad: item.unidad,
      tiered: false, precios: item.precios, precio: item.precios[0]?.precio || 0,
    });
  }
  for (const [cat, items] of Object.entries(_customByGroup)) {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, ' ');
    sections.push({ id: cat, label, items });
  }

  return sections;
}

// ─── Parser de PDF de requisición ────────────────────────────────────────────
function _parseCotiPdf(text) {
  const rfcM = text.match(/[A-Z]{3,4}\d{6}[A-Z0-9]{3}/);
  const rfc  = rfcM ? rfcM[0] : '';

  let empresa = '';
  if (rfc) {
    const idx    = text.indexOf(rfc);
    const before = text.slice(Math.max(0, idx - 600), idx);
    const lines  = before.split(/\n|\s{3,}/).map(l => l.trim())
      .filter(l => l.length > 4 && !/^\d/.test(l) && !/^[A-Z]{2,4}\d/.test(l));
    empresa = lines[lines.length - 1] || '';
  }

  const reqM      = text.match(/Requisici[oó]n[:\s#]+(\S+)/i);
  const folioReq  = reqM ? reqM[1] : '';
  const isoDate   = s => { const [d,m,y] = s.split('/'); return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; };
  const allDates  = [...text.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map(m => isoDate(m[1]));
  const fechaReq  = allDates[0] || '';
  const fechaEnt  = allDates.find(d => d !== fechaReq) || '';
  const proyM     = text.match(/Centro\s+de\s+Costo[:\s]+([^\n]+)/i);
  const proyecto  = proyM ? proyM[1].trim().slice(0, 90) : '';

  const catalog  = window.COTI_CATALOG || [];
  const partidas = [];
  const re = /(\d+)\s+\d{7}\s+([\w\s\-\/\.\,\(\)áéíóúüñÁÉÍÓÚÜÑ]+?)(?=\d+-\d+|\d{2}\/\d{2}\/\d{4})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const desc = m[2].trim().replace(/\s+/g, ' ');
    if (desc.length < 5) continue;
    const cat  = _matchCat(desc, catalog);
    if (cat) {
      const t = cat.precios[0];
      partidas.push({
        id: uid(), pda: parseInt(m[1]),
        descripcion: cat.nombre,
        cantidad: cat.unidad === 'millar' ? 1 : t.qty,
        unidad: cat.unidad === 'millar' ? `lote ${t.qty.toLocaleString('es-MX')} pzas` : cat.unidad,
        precioUnit: t.precio,
        subtotal: cat.unidad === 'millar' ? t.precio : round2(t.qty * t.precio),
        catalogoRef: cat.id,
      });
    } else {
      partidas.push({ id: uid(), pda: parseInt(m[1]), descripcion: desc, cantidad: 1, unidad: 'pza', precioUnit: 0, subtotal: 0, catalogoRef: null, unmatched: true });
    }
  }
  return { empresa, rfc, folioReq, proyecto, fechaReq, fechaEntrega: fechaEnt, partidas, contacto: '', notas: '' };
}

function _matchCat(desc, catalog) {
  const d = desc.toLowerCase();
  if (d.includes('bloque') || d.includes('taco') || d.includes('block')) {
    const isCol = d.includes('color') || d.includes('a color');
    const nm    = d.match(/(\d+)\s*hoja/);
    const h     = nm ? parseInt(nm[1]) : 100;
    const bkt   = h >= 250 ? 300 : h >= 150 ? 200 : 100;
    return catalog.find(c => c.id === (isCol ? `blk-col-${bkt}` : `blk-bn-${bkt}`));
  }
  if (d.includes('tarjeta'))      return catalog.find(c => c.id === (d.includes('hotstamp')?'tc-hs': d.includes('mate')?'tc-lm-2': d.includes('2 lado')?'tc-bz-2':'tc-bz-f'));
  if (d.includes('volante'))      return catalog.find(c => c.id === (d.includes('1/2')?'vol-med-4x0':'vol-qto-4x0'));
  if (d.includes('trip'))         return catalog.find(c => c.id === 'trip-c');
  if (d.includes('folder'))       return catalog.find(c => c.id === 'fold-ec');
  if (d.includes('iman'))         return catalog.find(c => c.id === 'iman-std');
  if (d.includes('membretad'))    return catalog.find(c => c.id === 'memb-bond');
  if (d.includes('lona'))         return catalog.find(c => c.id === 'gf-lona-13');
  if (d.includes('vinil') && !d.includes('corte')) return catalog.find(c => c.id === 'gf-vinil');
  // Búsqueda difusa por nombre — cubre productos personalizados guardados previamente
  const words = d.split(/\W+/).filter(w => w.length > 3);
  if (words.length) {
    let best = null, bestScore = 0;
    for (const c of catalog) {
      const score = words.filter(w => c.nombre.toLowerCase().includes(w)).length;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (bestScore >= Math.min(2, words.length)) return best;
  }
  return null;
}

// ─── Documento imprimible ─────────────────────────────────────────────────────
function CotizPrintDoc({ cot, partidas, subtotal, iva, total, logoSrc }) {
  const logoUrl = logoSrc || (window.location.origin + '/logosgi.jpg');

  const fmtFecha = (iso) => {
    if (!iso) return '';
    const [y,m,d] = iso.split('-');
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
  };

  const S = {
    page:   { fontFamily:'Geist,Arial,sans-serif', fontSize:11, color:'#1a1a1a', background:'#fff',
              padding:'1.8cm 1.8cm 1.4cm', boxSizing:'border-box', minHeight:'27.9cm' },
    // encabezado
    hdr:    { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 },
    logo:   { width:88, height:88, objectFit:'contain', flexShrink:0, marginRight:16 },
    brand:  { flex:1 },
    bName:  { fontFamily:'Archivo Black,Arial,sans-serif', fontSize:17, color:'#1A1A1A', lineHeight:1.1, marginBottom:3 },
    bSub:   { fontSize:10, color:'#E85D04', fontWeight:700, letterSpacing:.5, textTransform:'uppercase', marginBottom:6 },
    bInfo:  { fontSize:9.5, color:'#555', lineHeight:1.7 },
    folioBox:{ textAlign:'right', flexShrink:0, marginLeft:16 },
    folio:  { fontFamily:'Courier New,monospace', fontSize:18, fontWeight:700, color:'#E85D04', letterSpacing:1 },
    folLbl: { fontSize:8.5, color:'#888', letterSpacing:1.2, textTransform:'uppercase', marginTop:2 },
    folFec: { fontSize:9, color:'#666', marginTop:4 },
    // banda naranja separadora
    banda:  { height:4, background:'linear-gradient(90deg,#E85D04,#ff8c42)', borderRadius:2, margin:'10px 0 16px' },
    // lugar y fecha
    lugar:  { fontSize:10, color:'#555', textAlign:'right', marginBottom:14 },
    // datos cliente
    dest:   { marginBottom:14 },
    destTit:{ fontSize:9, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:'#aaa', marginBottom:5 },
    destBox:{ background:'#f7f7f5', border:'1px solid #e8e8e4', borderRadius:5, padding:'9px 13px' },
    destGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 20px', fontSize:10.5 },
    lbl:    { color:'#999', fontSize:8.5, textTransform:'uppercase', letterSpacing:.4 },
    val:    { fontWeight:600, color:'#1a1a1a' },
    // saludo
    saludo: { fontSize:11, color:'#333', lineHeight:1.75, marginBottom:16,
              borderLeft:'3px solid #E85D04', paddingLeft:12, fontStyle:'italic' },
    // tabla
    tblWrap:{ marginBottom:14 },
    thRow:  { background:'#1A1A1A', color:'#fff' },
    th:     { padding:'6px 8px', fontSize:8.5, fontWeight:700, letterSpacing:.9, textTransform:'uppercase' },
    td:     { padding:'6px 8px', borderBottom:'1px solid #ebebeb', verticalAlign:'middle', fontSize:10.5 },
    // totales
    totals: { display:'flex', justifyContent:'flex-end', marginBottom:14 },
    totBox: { width:236, borderTop:'1px solid #ddd', paddingTop:8 },
    totRow: { display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:11, color:'#555' },
    totFin: { display:'flex', justifyContent:'space-between', padding:'8px 0 0', borderTop:'2px solid #1A1A1A', marginTop:5 },
    // notas
    notBox: { background:'#f7f7f5', border:'1px solid #e8e8e4', borderRadius:5,
              padding:'8px 12px', fontSize:10, color:'#555', marginBottom:14 },
    notLbl: { fontSize:8, textTransform:'uppercase', letterSpacing:1, color:'#bbb', marginBottom:3 },
    // despedida
    desp:   { fontSize:10.5, color:'#444', lineHeight:1.8, marginBottom:20 },
    // firmas
    firmas: { display:'flex', justifyContent:'space-around', marginTop:36, paddingTop:0 },
    firma:  { textAlign:'center', flex:1, margin:'0 20px' },
    linea:  { borderTop:'1px solid #888', paddingTop:6, fontSize:9.5, color:'#777' },
    // pie
    pie:    { marginTop:18, paddingTop:8, borderTop:'1px solid #eee',
              textAlign:'center', fontSize:8.5, color:'#bbb', letterSpacing:.3 },
  };

  return (
    <div className="cq-print-doc" style={{display:'none'}}>
      <div style={S.page}>

        {/* ── ENCABEZADO MEMBRETE ── */}
        <div style={S.hdr}>
          <img src={logoUrl} alt="SGI" style={S.logo} />
          <div style={S.brand}>
            <div style={S.bName}>{(window.NEGOCIO||{}).nombre || 'Servicios Gráficos de Impresión'}</div>
            <div style={S.bSub}>Todo en impresión</div>
            <div style={S.bInfo}>
              C. Ramos Millán No. 27, Col. Kennedy, Hgo. del Parral, Chih.<br/>
              Tel. (627) 523 0705 &nbsp;·&nbsp; WhatsApp (627) 105 8353<br/>
              {((window.NEGOCIO||{}).rfc || 'MACM720128MW6') && <span>RFC: {(window.NEGOCIO||{}).rfc || 'MACM720128MW6'}</span>}
            </div>
          </div>
          <div style={S.folioBox}>
            <div style={S.folio}>{cot.folio}</div>
            <div style={S.folLbl}>Cotización</div>
            <div style={S.folFec}>Fecha: {fmtFecha(cot.fecha)}</div>
            {cot.fechaEntrega && <div style={{...S.folFec,color:'#E85D04',fontWeight:600}}>Entrega: {fmtFecha(cot.fechaEntrega)}</div>}
          </div>
        </div>

        {/* ── BANDA NARANJA ── */}
        <div style={S.banda}/>

        {/* ── LUGAR Y FECHA ── */}
        <div style={S.lugar}>
          Hidalgo del Parral, Chihuahua, a {fmtFecha(cot.fecha)}
        </div>

        {/* ── DESTINATARIO ── */}
        <div style={S.dest}>
          <div style={S.destTit}>Dirigido a:</div>
          <div style={S.destBox}>
            <div style={S.destGrid}>
              {cot.empresa  && <div style={{gridColumn:'1/-1'}}><div style={S.lbl}>Empresa / Cliente</div><div style={{...S.val,fontSize:12}}>{cot.empresa}</div></div>}
              {cot.rfc      && <div><div style={S.lbl}>RFC</div><div style={{...S.val,fontFamily:'monospace'}}>{cot.rfc}</div></div>}
              {cot.contacto && <div><div style={S.lbl}>Contacto</div><div style={S.val}>{cot.contacto}</div></div>}
              {cot.folioReq && <div><div style={S.lbl}>No. Requisición</div><div style={{...S.val,fontFamily:'monospace'}}>{cot.folioReq}</div></div>}
              {cot.proyecto && <div style={{gridColumn:'1/-1'}}><div style={S.lbl}>Proyecto / Centro de costo</div><div style={S.val}>{cot.proyecto}</div></div>}
            </div>
          </div>
        </div>

        {/* ── SALUDO ── */}
        <div style={S.saludo}>
          {cot.contacto ? `Estimado(a) ${cot.contacto}:` : 'A quien corresponda:'}<br/>
          Por medio de la presente, nos es grato poner a su disposición la siguiente cotización
          de productos y servicios, esperando poder cubrir satisfactoriamente con sus requerimientos.
          A continuación le presentamos el detalle:
        </div>

        {/* ── TABLA DE PARTIDAS ── */}
        <div style={S.tblWrap}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:10.5}}>
            <thead>
              <tr style={S.thRow}>
                {[['#','center',28],['Descripción','left',''],['Cant.','right',58],['Unidad','left',72],['P.U.','right',78],['Importe','right',82]].map(([h,a,w])=>(
                  <th key={h} style={{...S.th,textAlign:a,width:w||undefined}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partidas.map((p,i) => (
                <tr key={p.id} style={{background:i%2===0?'#fff':'#fafaf8'}}>
                  <td style={{...S.td,textAlign:'center',color:'#bbb',fontSize:9.5}}>{p.pda}</td>
                  <td style={S.td}>{p.descripcion}</td>
                  <td style={{...S.td,textAlign:'right',fontFamily:'monospace'}}>{(p.cantidad||0).toLocaleString('es-MX')}</td>
                  <td style={{...S.td,color:'#666',fontSize:9.5}}>{p.unidad}</td>
                  <td style={{...S.td,textAlign:'right',fontFamily:'monospace'}}>{fmt(p.precioUnit||0)}</td>
                  <td style={{...S.td,textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#1a1a1a'}}>{fmt(p.subtotal||0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── TOTALES ── */}
        <div style={S.totals}>
          <div style={S.totBox}>
            {[['Subtotal',fmt(subtotal)],['IVA 16%',fmt(iva)]].map(([l,v])=>(
              <div key={l} style={S.totRow}><span>{l}</span><span style={{fontFamily:'monospace'}}>{v}</span></div>
            ))}
            <div style={S.totFin}>
              <strong style={{fontFamily:'Archivo Black,Arial,sans-serif',fontSize:13}}>TOTAL</strong>
              <strong style={{fontFamily:'monospace',fontSize:15,color:'#E85D04'}}>{fmt(total)}</strong>
            </div>
          </div>
        </div>

        {/* ── NOTAS ── */}
        {cot.notas && (
          <div style={S.notBox}>
            <div style={S.notLbl}>Notas y condiciones particulares</div>
            {cot.notas}
          </div>
        )}

        {/* ── DESPEDIDA ── */}
        <div style={S.desp}>
          En espera de contar con su preferencia y aprobación, quedamos a sus órdenes para
          cualquier duda, aclaración o información adicional que pudiera surgir al respecto.<br/>
          Agradecemos de antemano su confianza depositada en <strong>Servicios Gráficos de Impresión SGI</strong>.
        </div>

        {/* ── FIRMAS ── */}
        <div style={S.firmas}>
          <div style={S.firma}>
            <div style={S.linea}>Elaboró / Autorizado por SGI</div>
          </div>
          <div style={S.firma}>
            <div style={S.linea}>Vo. Bo. / Aceptado por el cliente</div>
          </div>
        </div>

        {/* ── PIE DE PÁGINA ── */}
        <div style={S.pie}>
          Precios expresados en moneda nacional (MXN) más IVA 16% &nbsp;·&nbsp;
          Cotización válida por 30 días naturales a partir de su fecha de emisión &nbsp;·&nbsp;
          Hidalgo del Parral, Chihuahua
        </div>

      </div>
    </div>
  );
}

// ─── Modal de aprobación → Pedido ────────────────────────────────────────────
function _CotizApproveModal({ cot, total, onConfirm, onCancel }) {
  const hoy = window.localISO();
  const [pct,   setPct]   = React.useState(50);
  const [fecha, setFecha] = React.useState(cot.fechaEntrega || '');
  const [notas, setNotas] = React.useState('');
  const anticipo = round2(total * pct / 100);

  return (
    <div className="cfg-overlay" onMouseDown={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="cfg-modal" style={{maxWidth:430}}>
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">Convertir a Pedido de trabajo</span>
          <button className="cfg-modal-x" onClick={onCancel}><window.IconX size={18}/></button>
        </div>
        <div className="cfg-modal-body">
          <div style={{background:'var(--orange-soft)',border:'1px solid rgba(232,93,4,0.2)',
            borderRadius:'var(--radius)',padding:'10px 14px',marginBottom:16}}>
            <div style={{fontFamily:'Geist Mono,monospace',fontWeight:700,color:'var(--orange)',fontSize:'0.9rem'}}>{cot.folio}</div>
            <div style={{fontSize:'0.84rem',color:'var(--text-2)',marginTop:2}}>{cot.empresa||'Sin empresa'}</div>
            <div style={{fontWeight:700,fontSize:'1.1rem',marginTop:4}}>{fmt(total)}</div>
          </div>
          <div className="cfg-form-grid">
            <div className="field">
              <label>Anticipo esperado</label>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="number" min="0" max="100" value={pct}
                  onChange={e=>setPct(Math.min(100,Math.max(0,parseInt(e.target.value)||0)))}
                  style={{width:70}}/>
                <span style={{fontSize:'0.8rem',color:'var(--text-2)'}}>% = <strong>{fmt(anticipo)}</strong></span>
              </div>
            </div>
            <div className="field">
              <label>Fecha de entrega</label>
              <input type="date" value={fecha} min={hoy} onChange={e=>setFecha(e.target.value)}/>
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Notas internas de producción</label>
              <textarea value={notas} onChange={e=>setNotas(e.target.value)}
                placeholder="Material a usar, operador, instrucciones de producción…"
                style={{minHeight:68,resize:'vertical',width:'100%',padding:'8px',
                  border:'1px solid var(--border)',borderRadius:'var(--radius)',
                  fontFamily:'inherit',fontSize:'inherit'}}/>
            </div>
          </div>
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onCancel}>Cancelar</button>
          <button className="cfg-btn-save" onClick={()=>onConfirm({anticipoPct:pct,fechaEntrega:fecha,notas})}>
            <window.IconCheck size={15}/> Convertir a Pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: productos nuevos detectados en PDF ────────────────────────────────
function _NewProdsModal({ prods, onSave, onSkip }) {
  const allCats = (window.COTI_CATS || []);
  const [entries, setEntries] = React.useState(() =>
    prods.map(p => ({
      partidaId: p.id,
      rawDesc:   p.descripcion,
      nombre:    _capitalize(p.descripcion),
      cat:       '',
      newCat:    '',
      precio:    '',
      unidad:    p.unidad || 'pza',
      specs:     '',
      guardar:   true,
      skip:      false,
    }))
  );
  const [analyzing, setAnalyzing] = React.useState(false);
  const [iaUsed,    setIaUsed]    = React.useState(false);

  // Análisis automático con IA al abrir el modal
  React.useEffect(() => {
    const key = window.storageLoad('sgi_api_key', '');
    if (!key) return;
    setAnalyzing(true);
    _analyzeProductDescs(prods.map(p => p.descripcion)).then(results => {
      if (!results) return;
      setEntries(es => es.map((e, i) => {
        const r = results[i];
        if (!r) return e;
        // Si la categoría sugerida ya existe, seleccionarla; si no, crearla
        const existing = allCats.find(c =>
          c.label.toLowerCase() === r.categoria?.toLowerCase() ||
          c.id === r.categoria?.toLowerCase().replace(/\s+/g, '-')
        );
        return {
          ...e,
          nombre: r.nombre || e.nombre,
          cat:    existing ? existing.id : (r.categoria ? '__new__' : e.cat),
          newCat: existing ? '' : (r.categoria || e.newCat),
          specs:  r.specs || e.specs,
        };
      }));
      setIaUsed(true);
    }).finally(() => setAnalyzing(false));
  }, []);

  function upd(i, field, val) {
    setEntries(es => es.map((e, j) => j === i ? { ...e, [field]: val } : e));
  }

  const readyToSave = entries.filter(e =>
    !e.skip && e.guardar && e.precio &&
    e.cat && (e.cat !== '__new__' || e.newCat.trim())
  );

  return (
    <div className="cfg-overlay">
      <div className="cfg-modal cq-np-modal">
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">
            <window.IconAlertTriangle size={15} style={{color:'var(--orange)',marginRight:6,flexShrink:0}}/>
            Productos nuevos detectados · {prods.length}
          </span>
          <button className="cfg-modal-x" onClick={onSkip}><window.IconX size={18}/></button>
        </div>
        <p className="cq-np-subtitle">
          Estos artículos no están en el catálogo. Asígnales precio y categoría para guardarlos y reconocerlos en futuros PDFs automáticamente.
        </p>
        {analyzing && (
          <div className="cq-np-analyzing">
            <span className="cq-np-spinner"/>
            Analizando productos con IA — Claude Haiku…
          </div>
        )}
        {iaUsed && !analyzing && (
          <div className="cq-np-ia-badge">
            <window.IconCheck size={13}/> Campos pre-llenados por IA · Revisa y ajusta antes de guardar
          </div>
        )}
        <div className="cq-np-list">
          {entries.map((e, i) => (
            <div key={e.partidaId} className={'cq-np-card' + (e.skip ? ' cq-np-skipped' : '')}>
              <div className="cq-np-row1">
                <span className="cq-np-rawdesc">{e.rawDesc}</span>
                <button className="cq-np-skip-btn" onClick={() => upd(i, 'skip', !e.skip)}>
                  {e.skip ? 'Restaurar' : 'Omitir'}
                </button>
              </div>
              {!e.skip && (
                <div className="cq-np-inputs">
                  <div className="cq-field">
                    <label>Nombre en catálogo</label>
                    <input value={e.nombre} onChange={ev => upd(i, 'nombre', ev.target.value)} />
                  </div>
                  <div className="cq-field">
                    <label>Categoría</label>
                    <select value={e.cat} onChange={ev => upd(i, 'cat', ev.target.value)}>
                      <option value="">— elegir —</option>
                      {allCats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      <option value="__new__">+ Nueva categoría…</option>
                    </select>
                  </div>
                  {e.cat === '__new__' && (
                    <div className="cq-field cq-np-fullcol">
                      <label>Nombre de nueva categoría</label>
                      <input autoFocus placeholder="ej. Señalamientos"
                        value={e.newCat} onChange={ev => upd(i, 'newCat', ev.target.value)} />
                    </div>
                  )}
                  <div className="cq-field">
                    <label>Precio unitario</label>
                    <div className="cq-np-price-row">
                      <input className="mono" type="number" min="0" step="0.01" placeholder="0.00"
                        value={e.precio} onChange={ev => upd(i, 'precio', ev.target.value)} />
                      <select value={e.unidad} onChange={ev => upd(i, 'unidad', ev.target.value)}>
                        {['pza','m','m²','hoja','kit','juego','lote'].map(u =>
                          <option key={u} value={u}>{u}</option>
                        )}
                      </select>
                    </div>
                  </div>
                  <div className="cq-field cq-np-fullcol">
                    <label>Especificaciones (opcional)</label>
                    <input placeholder="Material, norma, dimensiones…"
                      value={e.specs} onChange={ev => upd(i, 'specs', ev.target.value)} />
                  </div>
                  <label className="cq-np-check cq-np-fullcol">
                    <input type="checkbox" checked={e.guardar}
                      onChange={ev => upd(i, 'guardar', ev.target.checked)} />
                    Guardar en catálogo para futuros PDFs
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onSkip}>Omitir todo</button>
          <button className="cfg-btn-save" onClick={() => onSave(entries)}>
            <window.IconCheck size={14}/>
            {readyToSave.length > 0
              ? `Guardar ${readyToSave.length} en catálogo`
              : 'Aplicar precios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Editor principal (usado por ambos modos) ─────────────────────────────────
function CotizEditor({ cot: init, onBack }) {
  const [cot,     setCot]     = React.useState(init);
  const [mode,    setMode]    = React.useState(init.partidas?.length ? 'quote' : 'quote');
  const [secTab,  setSecTab]  = React.useState('');
  const [showMan, setShowMan] = React.useState(false);
  const [man,     setMan]     = React.useState({ descripcion:'', cantidad:1, unidad:'pza', precioUnit:'' });
  const [parsing,     setParsing]     = React.useState(false);
  const [logoB64,     setLogoB64]     = React.useState('');
  const [showApprove,  setShowApprove]  = React.useState(false);
  const [showNewProds, setShowNewProds] = React.useState(false);
  const [catalogVer,   setCatalogVer]   = React.useState(0);
  const fileRef = React.useRef();

  // Precargar logo como base64 para impresión confiable
  React.useEffect(() => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        setLogoB64(cv.toDataURL('image/jpeg', 0.92));
      } catch(e) {}
    };
    img.src = '/logosgi.jpg';
  }, []);

  const sections  = React.useMemo(() => _buildManualCatalog(), [catalogVer]);
  const curSec    = sections.find(s => s.id === secTab) || sections[0];

  const partidas  = cot.partidas || [];
  const subtotal  = round2(partidas.reduce((s,p) => s+(p.subtotal||0), 0));
  const iva       = round2(subtotal * 0.16);
  const total     = round2(subtotal + iva);

  React.useEffect(() => { if (sections.length && !secTab) setSecTab(sections[0].id); }, [sections]);

  // Auto-abrir modal si el documento ya tiene partidas sin precio del PDF (carga desde lista)
  React.useEffect(() => {
    if ((init.partidas || []).some(p => p.unmatched && !p.precioUnit)) setShowNewProds(true);
  }, []);

  const unmatchedPartidas = (cot.partidas || []).filter(p => p.unmatched && !p.precioUnit);

  function save(next) { setCot(next); window.saveCotizacion(next); }
  function setF(f, v) { save({...cot, [f]: v}); }

  function addPartida(fields) {
    const item = { id: uid(), pda: partidas.length + 1, ...fields };
    save({ ...cot, partidas: [...partidas, item] });
  }

  function addSimple(item) {
    // item simple (precio fijo por unidad)
    const q = item.cantidad > 0 ? item.cantidad : 1;
    addPartida({ descripcion: item.nombre, cantidad: q, unidad: item.unidad || 'pza', precioUnit: item.precio, subtotal: round2(q * item.precio), catalogoRef: item.id });
  }

  function addTiered(prod, tier) {
    const isMillar = prod.unidad === 'millar';
    addPartida({
      descripcion: prod.nombre,
      cantidad:    isMillar ? 1 : tier.qty,
      unidad:      isMillar ? `lote ${tier.qty.toLocaleString('es-MX')} pzas` : prod.unidad,
      precioUnit:  tier.precio,
      subtotal:    isMillar ? tier.precio : round2(tier.qty * tier.precio),
      catalogoRef: prod.id,
    });
  }

  function updateP(id, field, val) {
    const next = partidas.map(p => {
      if (p.id !== id) return p;
      const u = {...p, [field]: val};
      if (field === 'cantidad' || field === 'precioUnit')
        u.subtotal = round2((parseFloat(u.cantidad)||0)*(parseFloat(u.precioUnit)||0));
      return u;
    });
    save({...cot, partidas: next});
  }

  function removeP(id) {
    const next = partidas.filter(p=>p.id!==id).map((p,i)=>({...p,pda:i+1}));
    save({...cot, partidas: next});
  }

  function addManual() {
    if (!man.descripcion || !man.precioUnit) return;
    const q = parseFloat(man.cantidad)||1;
    const p = parseFloat(man.precioUnit)||0;
    addPartida({ descripcion:man.descripcion, cantidad:q, unidad:man.unidad||'pza', precioUnit:p, subtotal:round2(q*p), catalogoRef:null });
    setMan({ descripcion:'', cantidad:1, unidad:'pza', precioUnit:'' });
    setShowMan(false);
  }

  function saveNewProds(entries) {
    // 1. Guardar en catálogo los que el operador marcó
    const toAdd = entries.filter(e =>
      !e.skip && e.guardar && e.precio &&
      e.cat && (e.cat !== '__new__' || e.newCat.trim())
    );
    if (toAdd.length) {
      const catalog = [...(window.COTI_CATALOG || [])];
      toAdd.forEach(e => {
        const catId = e.cat === '__new__'
          ? e.newCat.trim().toLowerCase().replace(/\s+/g, '-')
          : e.cat;
        catalog.push({
          id: uid(), cat: catId,
          nombre: e.nombre.trim(), specs: e.specs.trim(),
          unidad: e.unidad, tiered: false,
          precios: [{ qty: 1, precio: parseFloat(e.precio) }],
        });
      });
      window.refreshCotiCatalog(catalog);
      setCatalogVer(v => v + 1);
    }
    // 2. Aplicar precios a las partidas actuales
    const priceMap = {};
    entries.filter(e => !e.skip && e.precio).forEach(e => {
      priceMap[e.partidaId] = parseFloat(e.precio);
    });
    if (Object.keys(priceMap).length) {
      const next = (cot.partidas || []).map(p => {
        if (!priceMap[p.id]) return p;
        const pr = priceMap[p.id];
        return { ...p, precioUnit: pr, subtotal: round2((p.cantidad || 1) * pr), unmatched: false };
      });
      save({ ...cot, partidas: next });
    }
    setShowNewProds(false);
  }

  function toPedido(opts) {
    if (!partidas.length) return;
    const pedId = uid();
    const ped = {
      id: pedId, ticketNum: cot.folio, modulo: 'cotizador',
      items: partidas.map(p=>({id:p.id,name:p.descripcion,qty:p.cantidad,unitPrice:p.precioUnit,meta:[p.unidad],module:'cotizador'})),
      total, totalCotizado: total,
      anticipoPct:  opts?.anticipoPct  ?? 50,
      abonos: [], estadoPago: 'sin_anticipo',
      fecha: cot.fecha, estado: 'pendiente',
      cliente: cot.empresa,
      fechaEntrega: opts?.fechaEntrega || cot.fechaEntrega,
      tiempoElaboracion: 3,
      notas: [cot.folioReq?'Ref req: '+cot.folioReq:'', cot.proyecto, cot.notas, opts?.notas].filter(Boolean).join('\n'),
    };
    window.savePedido(ped);
    save({...cot, estado:'aprobada', pedidoId: pedId,
      fechaEntrega: opts?.fechaEntrega || cot.fechaEntrega});
    setShowApprove(false);
  }

  async function loadPdf(file) {
    if (!file || !window.pdfjsLib) return;
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await window.pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
      let txt = '';
      for (let i=1;i<=doc.numPages;i++) {
        const pg=await doc.getPage(i);const ct=await pg.getTextContent();
        txt+=ct.items.map(it=>it.str).join(' ')+'\n';
      }
      const p = _parseCotiPdf(txt);
      save({...cot,
        empresa:      cot.empresa      || p.empresa,
        rfc:          cot.rfc          || p.rfc,
        folioReq:     cot.folioReq     || p.folioReq,
        proyecto:     cot.proyecto     || p.proyecto,
        fechaReq:     cot.fechaReq     || p.fechaReq,
        fechaEntrega: cot.fechaEntrega || p.fechaEntrega,
        contacto:     cot.contacto     || p.contacto,
        partidas: [...partidas, ...p.partidas.map((x,i)=>({...x,pda:partidas.length+i+1}))],
      });
      if (p.partidas.some(x => x.unmatched)) setShowNewProds(true);
      if (!p.empresa && !p.folioReq && p.partidas.length === 0) {
        alert('No se reconocieron datos de requisición en el PDF. Captura la cotización manualmente.');
      }
    } catch(e){
      console.error(e);
      alert('No se pudo leer el PDF: ' + (e.message || 'archivo dañado o protegido'));
    }
    finally { setParsing(false); }
  }

  const estadoClr = {borrador:'var(--text-3)',enviada:'var(--cyan)',aprobada:'var(--green)',cancelada:'var(--magenta)'};
  const locked = cot.estado === 'aprobada';

  return (
    <div className="cq-wrap">

      {/* ── BARRA SUPERIOR ─────────────────────────────────────────── */}
      <div className="cq-topbar">
        <button className="cq-back" onClick={onBack}>
          <window.IconChevronRight size={14} style={{transform:'rotate(180deg)'}}/> Cotizaciones
        </button>
        <span className="cq-folio mono">{cot.folio}</span>
        {cot.empresa && <span className="cq-empresa">{cot.empresa}</span>}
        <span className="cq-badge" style={{color:estadoClr[cot.estado]||'var(--text-3)',background:(estadoClr[cot.estado]||'var(--text-3)')+'1a'}}>{cot.estado}</span>
        <div style={{flex:1}}/>
        {cot.estado === 'aprobada' ? (
          <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',
            background:'rgba(22,163,74,0.12)',border:'1px solid rgba(22,163,74,0.3)',
            borderRadius:'var(--radius)',fontSize:'0.8rem',fontWeight:700,color:'var(--green)'}}>
            <window.IconCheck size={13}/> Aprobada · En Pedidos
          </span>
        ) : (
          <select className="cq-sel" value={cot.estado}
            onChange={e => e.target.value==='aprobada' ? setShowApprove(true) : setF('estado',e.target.value)}>
            <option value="borrador">Borrador</option>
            <option value="enviada">Enviada</option>
            <option value="aprobada">Aprobada → Pedido</option>
            <option value="cancelada">Cancelada</option>
          </select>
        )}
        <button className="cq-btn-sec" onClick={()=>window.printSgiDoc('.cq-print-doc')}>
          <window.IconPrint size={14}/> Imprimir
        </button>
        {cot.estado !== 'aprobada' && (
          <button className="cq-btn-orange" onClick={()=>partidas.length&&setShowApprove(true)} disabled={!partidas.length}>
            <window.IconNote size={14}/> → Pedido
          </button>
        )}
      </div>

      {/* ── BANNER APROBADA ────────────────────────────────────────── */}
      {cot.estado === 'aprobada' && (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 18px',
          background:'rgba(22,163,74,0.08)',borderBottom:'1px solid rgba(22,163,74,0.2)',
          fontSize:'0.82rem',color:'var(--green)',flexShrink:0}}>
          <window.IconCheck size={15}/>
          <span>Esta cotización fue <strong>aprobada y convertida a pedido</strong>. Puedes consultarla en el módulo de Pedidos con la referencia <strong>{cot.folio}</strong>.</span>
        </div>
      )}

      {/* ── CUERPO DOS COLUMNAS ─────────────────────────────────────── */}
      <div className="cq-body">

        {/* IZQUIERDA: datos del cliente + partidas + totales */}
        <div className="cq-left">

          {/* Datos del cliente */}
          <div className="cq-section" style={locked?{pointerEvents:'none',opacity:.65}:{}}>
            <div className="cq-section-title">Datos del cliente</div>
            <div className="cq-fields">
              <div className="cq-field cq-span2">
                <label>Empresa / Cliente</label>
                <input value={cot.empresa||''} placeholder="Nombre de la empresa" onChange={e=>setF('empresa',e.target.value)}/>
              </div>
              <div className="cq-field">
                <label>RFC</label>
                <input className="mono" value={cot.rfc||''} placeholder="RFC000000000" onChange={e=>setF('rfc',e.target.value.toUpperCase())}/>
              </div>
              <div className="cq-field">
                <label>No. Requisición cliente</label>
                <input className="mono" value={cot.folioReq||''} placeholder="195-001379" onChange={e=>setF('folioReq',e.target.value)}/>
              </div>
              <div className="cq-field cq-span2">
                <label>Proyecto / Centro de costo</label>
                <input value={cot.proyecto||''} placeholder="Descripción del proyecto" onChange={e=>setF('proyecto',e.target.value)}/>
              </div>
              <div className="cq-field">
                <label>Contacto</label>
                <input value={cot.contacto||''} placeholder="Nombre del solicitante" onChange={e=>setF('contacto',e.target.value)}/>
              </div>
              <div className="cq-field cq-span2">
                <label>Fecha de entrega estimada</label>
                <div className="cq-delivery-row">
                  {[['1 día',1],['3 días',3],['1 sem.',7],['2 sem.',14]].map(([lbl,dias])=>{
                    const iso = (()=>{ const d=new Date(); d.setDate(d.getDate()+dias); return window.localISO(d); })();
                    return (
                      <button key={lbl}
                        className={'cq-del-quick'+(cot.fechaEntrega===iso?' active':'')}
                        onClick={()=>setF('fechaEntrega', cot.fechaEntrega===iso ? '' : iso)}>
                        {lbl}
                      </button>
                    );
                  })}
                  <input type="date" className="cq-del-date"
                    value={cot.fechaEntrega||''}
                    min={window.localISO()}
                    onChange={e=>setF('fechaEntrega',e.target.value)}/>
                </div>
                {cot.fechaEntrega && (()=>{
                  const dias = Math.ceil((new Date(cot.fechaEntrega+'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000);
                  const txt = dias<0 ? 'Fecha vencida' : dias===0 ? 'Hoy' : dias===1 ? 'Mañana' : `En ${dias} días`;
                  const clr = dias<0 ? 'var(--magenta)' : dias<=1 ? 'var(--orange)' : 'var(--green)';
                  return <span style={{fontSize:'0.72rem',color:clr,fontWeight:600,marginTop:3}}>{txt}</span>;
                })()}
              </div>
            </div>
          </div>

          {/* Partidas */}
          <div className="cq-section" style={{flex:1,minHeight:0,display:'flex',flexDirection:'column'}}>
            <div className="cq-section-title">
              Partidas
              <span style={{fontWeight:400,color:'var(--text-3)',fontSize:'0.78rem'}}> · {partidas.length} ítem{partidas.length!==1?'s':''}</span>
            </div>

            {!locked && !showNewProds && unmatchedPartidas.length > 0 && (
              <div className="cq-unmatched-banner" onClick={() => setShowNewProds(true)}>
                <window.IconAlertTriangle size={14}/>
                <span>{unmatchedPartidas.length} producto{unmatchedPartidas.length !== 1 ? 's' : ''} sin precio detectado{unmatchedPartidas.length !== 1 ? 's' : ''} en el PDF</span>
                <span className="cq-unmatched-link">Revisar y guardar en catálogo →</span>
              </div>
            )}

            {partidas.length === 0 ? (
              <div className="cq-empty-partidas">Selecciona productos del panel derecho o agrega un ítem libre.</div>
            ) : (
              <div className="cq-table-wrap">
                <table className="cq-table">
                  <thead>
                    <tr>
                      <th style={{width:28}}>#</th>
                      <th>Descripción</th>
                      <th style={{width:70,textAlign:'right'}}>Cant.</th>
                      <th style={{width:90}}>Unidad</th>
                      <th style={{width:88,textAlign:'right',color:'var(--orange)'}}>P.U. ✎</th>
                      <th style={{width:95,textAlign:'right'}}>Importe</th>
                      <th style={{width:24}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {partidas.map(p=><CqRow key={p.id} p={p} onUpdate={updateP} onRemove={removeP} locked={locked}/>)}
                  </tbody>
                </table>
              </div>
            )}

            {/* Ítem libre */}
            {!locked && (!showMan ? (
              <button className="cq-add-free" onClick={()=>setShowMan(true)}>
                <window.IconPlus size={13}/> Agregar ítem libre
              </button>
            ) : (
              <div className="cq-free-form">
                <input className="cq-inp" placeholder="Descripción del producto o servicio" autoFocus
                  value={man.descripcion} onChange={e=>setMan({...man,descripcion:e.target.value})}
                  onKeyDown={e=>e.key==='Enter'&&addManual()} style={{gridColumn:'1/-1'}}/>
                <input className="cq-inp mono" placeholder="Cant" type="number" min="0.01" step="any"
                  value={man.cantidad} onChange={e=>setMan({...man,cantidad:e.target.value})}/>
                <input className="cq-inp" placeholder="Unidad"
                  value={man.unidad} onChange={e=>setMan({...man,unidad:e.target.value})}/>
                <input className="cq-inp mono" placeholder="$ P.U." type="number" min="0" step="0.01"
                  value={man.precioUnit} onChange={e=>setMan({...man,precioUnit:e.target.value})}
                  onKeyDown={e=>e.key==='Enter'&&addManual()}/>
                <button className="cq-btn-orange" onClick={addManual}>+ Agregar</button>
                <button className="cq-btn-sec" onClick={()=>setShowMan(false)}>✕</button>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="cq-totals">
            <div className="cq-total-row"><span>Subtotal</span><span className="mono">{fmt(subtotal)}</span></div>
            <div className="cq-total-row"><span>IVA 16%</span><span className="mono">{fmt(iva)}</span></div>
            <div className="cq-total-row cq-total-big"><span>TOTAL</span><span className="mono">{fmt(total)}</span></div>
          </div>

          <div style={{padding:'0 16px 14px'}}>
            <div className="cq-field-lbl">Notas / condiciones</div>
            <textarea className="cq-inp cq-textarea" rows={2} value={cot.notas||''} placeholder="Tiempo de entrega, condiciones de pago…" onChange={e=>setF('notas',e.target.value)}/>
          </div>
        </div>

        {/* DERECHA: catálogo de productos */}
        <div className="cq-right">
          {!locked && <div className="cq-right-head">
            <span className="cq-section-title" style={{margin:0}}>Catálogo de productos</span>
            <div style={{display:'flex',gap:6}}>
              <input type="file" accept=".pdf" ref={fileRef} style={{display:'none'}}
                onChange={e=>{loadPdf(e.target.files[0]);e.target.value='';}}/>
              <button className="cq-btn-sec cq-btn-sm" onClick={()=>fileRef.current.click()} disabled={parsing}>
                <window.IconUpload size={13}/> {parsing?'Leyendo PDF…':'Subir Req. PDF'}
              </button>
            </div>
          </div>}

          {locked ? (
            <div className="cq-locked-panel">
              <window.IconCheck size={36} style={{color:'var(--green)',marginBottom:12}}/>
              <div style={{fontWeight:700,fontSize:'0.95rem',marginBottom:6}}>Cotización aprobada</div>
              <div style={{fontSize:'0.82rem',color:'var(--text-2)',textAlign:'center',lineHeight:1.6}}>
                Este documento está cerrado y protegido.<br/>
                El pedido fue creado con la referencia<br/>
                <strong style={{fontFamily:'monospace',color:'var(--orange)'}}>{cot.folio}</strong>
              </div>
              <div style={{marginTop:16,fontSize:'0.78rem',color:'var(--text-3)'}}>
                Solo el campo de notas permanece editable.
              </div>
            </div>
          ) : (
            <>
              {/* Tabs de sección */}
              <div className="cq-sec-tabs">
                {sections.map(s=>(
                  <button key={s.id} className={'cq-sec-tab'+(curSec?.id===s.id?' active':'')} onClick={()=>setSecTab(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Productos de la sección activa */}
              <div className="cq-products">
                {(curSec?.items||[]).map(item => (
                  <CqProdItem key={item.id} item={item} onAddSimple={addSimple} onAddTiered={addTiered}/>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal de aprobación */}
      {showApprove && (
        <_CotizApproveModal
          cot={cot} total={total}
          onConfirm={toPedido}
          onCancel={()=>setShowApprove(false)}
        />
      )}

      {/* Modal: productos nuevos del PDF */}
      {showNewProds && unmatchedPartidas.length > 0 && (
        <_NewProdsModal
          prods={unmatchedPartidas}
          onSave={saveNewProds}
          onSkip={() => setShowNewProds(false)}
        />
      )}

      {/* Documento imprimible oculto */}
      <CotizPrintDoc cot={cot} partidas={partidas} subtotal={subtotal} iva={iva} total={total} logoSrc={logoB64}/>
    </div>
  );
}

// ─── Fila editable de partida ─────────────────────────────────────────────────
function CqRow({ p, onUpdate, onRemove, locked }) {
  const [ef, setEf] = React.useState(null);
  const [dr, setDr] = React.useState('');

  function startEdit(f){ if(locked) return; setEf(f); setDr(String(p[f])); }
  function commit(f){
    const v=(f==='cantidad'||f==='precioUnit')?(parseFloat(dr)||0):dr;
    onUpdate(p.id,f,v); setEf(null);
  }

  const C = ({field,children,style={}}) => (!locked && ef===field)
    ? <input className="cq-cell-inp" style={style} value={dr} autoFocus
        onChange={e=>setDr(e.target.value)}
        onBlur={()=>commit(field)} onKeyDown={e=>{if(e.key==='Enter')commit(field);if(e.key==='Escape')setEf(null);}}/>
    : <span className="cq-cell" style={style} title={locked?'':'"Clic para editar"'} onClick={()=>startEdit(field)}>{children}</span>;

  return (
    <tr className="cq-row">
      <td style={{textAlign:'center',color:'var(--text-3)',fontSize:'0.72rem'}}>{p.pda}</td>
      <td><C field="descripcion">{p.descripcion}</C></td>
      <td style={{textAlign:'right'}}><C field="cantidad" style={{textAlign:'right'}}>{(p.cantidad||0).toLocaleString('es-MX')}</C></td>
      <td style={{fontSize:'0.75rem',color:'var(--text-2)'}}><C field="unidad" style={{fontSize:'0.75rem'}}>{p.unidad}</C></td>
      <td style={{textAlign:'right'}}><C field="precioUnit" style={{textAlign:'right',color:locked?'inherit':'var(--orange)',fontWeight:600}}>{fmt(p.precioUnit||0)}</C></td>
      <td style={{textAlign:'right',fontWeight:700}}>{fmt(p.subtotal||0)}</td>
      {!locked && <td><button className="cq-del-row" onClick={()=>onRemove(p.id)}><window.IconX size={11}/></button></td>}
    </tr>
  );
}

// ─── Ítem de catálogo en el panel derecho ─────────────────────────────────────
function CqProdItem({ item, onAddSimple, onAddTiered }) {
  const [qty, setQty] = React.useState('');
  const [open, setOpen] = React.useState(false);

  if (item.tiered && item.precios?.length > 1) {
    // Producto con precios escalonados → mostrar tiers
    return (
      <div className="cq-prod">
        <div className="cq-prod-header" onClick={()=>setOpen(o=>!o)}>
          <div>
            <div className="cq-prod-name">{item.nombre}</div>
            {item.specs && <div className="cq-prod-specs">{item.specs}</div>}
          </div>
          <window.IconChevronRight size={14} style={{transform:open?'rotate(90deg)':'none',transition:'transform 0.15s',color:'var(--text-3)',flexShrink:0}}/>
        </div>
        {open && (
          <div className="cq-prod-tiers">
            {item.precios.map(t=>{
              const isMillar = item.unidad==='millar';
              const label    = isMillar
                ? `${t.qty.toLocaleString('es-MX')} pzas — ${fmt(t.precio)}`
                : `${t.qty} ${item.unidad} — ${fmt(round2(t.qty*t.precio))}`;
              return (
                <button key={t.qty} className="cq-tier-btn" onClick={()=>{ onAddTiered(item,t); setOpen(false); }}>
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Producto con precio único → cantidad input + agregar
  const basePrice = item.precios?.[0]?.precio ?? item.precio ?? 0;
  return (
    <div className="cq-prod cq-prod-simple">
      <div style={{flex:1,minWidth:0}}>
        <div className="cq-prod-name">{item.nombre}</div>
        {item.specs && <div className="cq-prod-specs">{item.specs}</div>}
        <div className="cq-prod-price">{fmt(basePrice)} / {item.unidad}</div>
      </div>
      <div className="cq-prod-add">
        <input className="cq-qty-inp mono" type="number" min="0.01" step="any" placeholder="cant"
          value={qty} onChange={e=>setQty(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){ onAddSimple({...item,precio:basePrice,cantidad:parseFloat(qty)||1}); setQty(''); }}}/>
        <button className="cq-add-btn" onClick={()=>{ onAddSimple({...item,precio:basePrice,cantidad:parseFloat(qty)||1}); setQty(''); }}
          title="Agregar al presupuesto">
          <window.IconPlus size={13}/>
        </button>
      </div>
    </div>
  );
}

// ─── Lista de cotizaciones guardadas ──────────────────────────────────────────
function CotizList({ onNew, onOpen, onDelete }) {
  const [list,    setList]    = React.useState(() => storageLoad('sgi_cotizaciones', []));
  const [parsing, setParsing] = React.useState(false);
  const fileRef = React.useRef();

  async function handlePdf(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.pdfjsLib) { alert('PDF.js no está cargado. Verifica la conexión a internet.'); return; }
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await window.pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
      let txt = '';
      for (let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);const ct=await pg.getTextContent();txt+=ct.items.map(it=>it.str).join(' ')+'\n';}
      const p = _parseCotiPdf(txt);
      if (!p.empresa && !p.folioReq && p.partidas.length === 0) {
        alert('No se reconocieron datos de requisición en el PDF. Se abrirá una cotización en blanco.');
      }
      onOpen({id:uid(), folio:nextCotizNum(), fecha:window.localISO(), estado:'borrador', ...p});
    } catch(err){
      console.error(err);
      alert('No se pudo leer el PDF: ' + (err.message || 'archivo dañado o protegido') + '. Se abrirá una cotización en blanco.');
      onNew();
    }
    finally { setParsing(false); e.target.value=''; }
  }

  const clr = {borrador:'var(--text-3)',enviada:'var(--cyan)',aprobada:'var(--green)',cancelada:'var(--magenta)'};

  return (
    <div className="cq-wrap">
      <div className="cq-list-head">
        <div>
          <h2 className="cq-h2">Cotizador Express</h2>
          <p className="cq-sub">{list.length} cotización{list.length!==1?'es':''} guardada{list.length!==1?'s':''}</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <input type="file" accept=".pdf" ref={fileRef} style={{display:'none'}} onChange={handlePdf}/>
          <button className="cq-btn-sec" onClick={()=>fileRef.current.click()} disabled={parsing}>
            <window.IconUpload size={14}/> {parsing?'Leyendo…':'Subir Req. PDF'}
          </button>
          <button className="cq-btn-orange" onClick={onNew}>
            <window.IconPlus size={14}/> Nueva cotización
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="cq-list-empty">
          <window.IconFileText size={42} style={{color:'var(--border-2)',marginBottom:10}}/>
          <p style={{fontWeight:600,marginBottom:4}}>Sin cotizaciones guardadas</p>
          <p style={{fontSize:'0.8rem',color:'var(--text-3)'}}>Sube un PDF de requisición (automático) o crea una cotización manual.</p>
        </div>
      ) : (
        <div style={{overflowX:'auto',padding:'0 24px 24px'}}>
          <table className="cq-list-tbl">
            <thead><tr>
              <th>Folio</th><th>Empresa</th><th>Req. cliente</th>
              <th>Fecha</th><th>Entrega</th><th>Total</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>
              {list.map(c=>{
                const sub=(c.partidas||[]).reduce((s,p)=>s+(p.subtotal||0),0);
                const tot=round2(sub*1.16);
                return (
                  <tr key={c.id} className="cq-list-row" onClick={()=>onOpen({...c})}>
                    <td className="mono" style={{color:'var(--orange)',fontWeight:700}}>{c.folio}</td>
                    <td>{c.empresa||<span style={{color:'var(--text-3)'}}>Sin empresa</span>}</td>
                    <td className="mono" style={{fontSize:'0.78rem',color:'var(--text-2)'}}>{c.folioReq||'—'}</td>
                    <td style={{fontSize:'0.8rem'}}>{c.fecha||'—'}</td>
                    <td style={{fontSize:'0.8rem',color:c.fechaEntrega?'inherit':'var(--text-3)'}}>{c.fechaEntrega||'—'}</td>
                    <td className="mono" style={{fontWeight:600}}>{fmt(tot)}</td>
                    <td><span className="cq-badge" style={{color:clr[c.estado]||'var(--text-3)',background:(clr[c.estado]||'var(--text-3)')+'1a'}}>{c.estado}</span></td>
                    <td onClick={ev=>ev.stopPropagation()}>
                      <button className="cq-list-del" onClick={()=>{if(confirm(`¿Eliminar ${c.folio}?`)){window.deleteCotizacion(c.id);setList(storageLoad('sgi_cotizaciones',[]));}}}>
                        <window.IconTrash size={13}/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Módulo raíz ─────────────────────────────────────────────────────────────
window.ModuleCotizador = function ModuleCotizador() {
  const [view,    setView]    = React.useState('list');
  const [editing, setEditing] = React.useState(null);

  function handleNew() {
    const c = {id:uid(),folio:nextCotizNum(),empresa:'',rfc:'',folioReq:'',proyecto:'',contacto:'',fechaReq:'',fechaEntrega:'',fecha:window.localISO(),estado:'borrador',partidas:[],notas:''};
    window.saveCotizacion(c); setEditing(c); setView('editor');
  }
  function handleOpen(c){ setEditing({...c}); setView('editor'); }
  function handleDelete(id){ window.deleteCotizacion(id); }
  function handleBack(){ setView('list'); setEditing(null); }

  if (view==='editor'&&editing) return <CotizEditor cot={editing} onBack={handleBack}/>;
  return <CotizList onNew={handleNew} onOpen={handleOpen} onDelete={handleDelete}/>;
};
