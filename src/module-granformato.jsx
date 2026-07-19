// ========== GRAN FORMATO MODULE ==========

// La pieza puede ir normal (el ancho cruza el rollo) o girada (el alto cruza
// el rollo). Cada pieza necesita margen de sellado/dobladillo por lado
// (GF_PARAMS.margen): ese margen decide cuántas piezas caben lado a lado en el
// ancho del rollo (porFila) y si la pieza siquiera cabe sin partirse. Si no
// cabe, se parte en tiras y cada unión consume traslape (GF_PARAMS.traslape).
// Se cobra rollo × largo usado (el alto de las filas impresas); m2 es el TOTAL
// para toda la cantidad. Todo el pedido sale del MISMO rollo porque la textura
// y el tono varían entre rollos.
function _planRollo(ancho, alto, r, qty) {
  qty = Math.max(1, qty || 1);
  const P  = window.GF_PARAMS || { margen: 0.025, traslape: 0.05 };
  const mg = Math.max(0, Number(P.margen)   || 0);
  const tr = Math.max(0, Number(P.traslape) || 0);
  const orient = (w, h) => {           // w es el lado que cruza el rollo
    const wEff = w + 2 * mg;           // pieza + dobladillo por lado
    if (wEff <= r + 1e-9) {
      const porFila = Math.max(1, Math.floor((r + 1e-9) / wEff));
      const filas   = Math.ceil(qty / porFila);
      return { tiras: 1, porFila, m2: r * filas * h };
    }
    // pieza más ancha que el rollo: t tiras cubren wEff más los traslapes
    const t = r > tr ? Math.max(2, Math.ceil((wEff - tr) / (r - tr) - 1e-9)) : Infinity;
    return { tiras: t, porFila: 1, m2: t === Infinity ? Infinity : t * r * h * qty };
  };
  const N = orient(ancho, alto), G = orient(alto, ancho);
  const girado = G.tiras < N.tiras || (G.tiras === N.tiras && G.m2 < N.m2);
  const o = girado ? G : N;
  if (o.m2 === Infinity) return null;
  return {
    rollo: r,
    girado,
    tiras: o.tiras,
    porFila: Math.min(o.porFila, qty),
    m2: Math.round(o.m2 * 100) / 100,
  };
}

// Rollo recomendado: menos tiras; en empate, menos m² consumidos; el recorrido
// va de rollo chico a grande, así que en empate total queda el más pequeño.
function _bestPlan(ancho, alto, rollos, qty) {
  if (!rollos || !rollos.length) return null;
  const sorted = [...rollos].map(Number).filter(r => r > 0).sort((a, b) => a - b);
  let best = null;
  for (const r of sorted) {
    const p = _planRollo(ancho, alto, r, qty);
    if (p && (!best || p.tiras < best.tiras || (p.tiras === best.tiras && p.m2 < best.m2))) best = p;
  }
  return best;
}

function ModuleGranFormato({ addToTicket }) {
  const [anchoStr,      setAnchoStr]      = React.useState('2');
  const [altoStr,       setAltoStr]       = React.useState('1');
  const [material,      setMaterial]      = React.useState(window.GF_MATERIALS[0]);
  const [finish,        setFinish]        = React.useState(window.GF_FINISH[0]);
  const [qty,           setQty]           = React.useState(1);
  const [rolloOverride, setRolloOverride] = React.useState(null);

  const ancho = Math.max(0.01, parseFloat(anchoStr) || 0.01);
  const alto  = Math.max(0.01, parseFloat(altoStr)  || 0.01);

  // Al cambiar material, medidas o cantidad, volver a la recomendación automática
  React.useEffect(() => { setRolloOverride(null); }, [material?.id, ancho, alto, qty]);

  // Guard: catálogo vaciado desde Config
  if (!material) return (
    <div className="module-body" style={{padding:32}}>
      <p style={{fontSize:13, color:'var(--text-3)'}}>No hay materiales de gran formato activos en el catálogo. Agrégalos o actívalos en Configuración.</p>
    </div>
  );

  const normDim = (str) => {
    const v = parseFloat(str);
    return isNaN(v) || v <= 0 ? '0.10' : String(Math.max(0.01, v));
  };

  const recPlan    = _bestPlan(ancho, alto, material.rollos, qty);
  const recRollo   = recPlan ? recPlan.rollo : null;
  const activePlan = rolloOverride != null ? _planRollo(ancho, alto, rolloOverride, qty) : recPlan;
  const activeRollo = activePlan ? activePlan.rollo : null;

  const tiras   = activePlan ? activePlan.tiras : 1;
  const girado  = activePlan ? activePlan.girado : false;
  const porFila = activePlan ? activePlan.porFila : 1;

  const m2Work  = Math.round(ancho * alto * 100) / 100;          // por pieza
  const m2Total = activePlan ? activePlan.m2 : Math.round(m2Work * qty * 100) / 100;
  const m2Desp  = Math.max(0, Math.round((m2Total - m2Work * qty) * 100) / 100);
  const pctDesp = m2Total > 0 ? Math.round((m2Desp / m2Total) * 100) : 0;

  const total    = window.round2(m2Total * material.price + finish.add * qty);
  const baseUnit = window.round2(total / qty);

  const maxA     = Math.max(ancho, alto, 0.1);
  const previewW = (ancho / maxA) * 240;
  const previewH = (alto / maxA) * 130;

  const rollosSorted = material.rollos
    ? [...material.rollos].map(Number).filter(r => r > 0).sort((a, b) => a - b)
    : [];

  return (
    <>
      <div className="module-header">
        <div className="module-title">
          <div className="mt-icon" style={{background:'var(--cyan)'}}><window.IconLayout size={20} /></div>
          <div>
            <h1>Gran Formato</h1>
            <div className="mt-sub">Lonas · Vinil · Banner · Cálculo por m²</div>
          </div>
        </div>
      </div>

      <div className="module-body">
        <div className="form-module">
          <div>
            {/* PASO 1 — DIMENSIONES */}
            <div className="form-card">
              <h3><span className="num">1</span>Dimensiones del trabajo</h3>
              <div className="form-grid cols-3">
                <div className="field">
                  <label>Ancho</label>
                  <div className="suffix-input">
                    <input type="text" inputMode="decimal" value={anchoStr}
                      onChange={e => setAnchoStr(e.target.value)}
                      onBlur={e => setAnchoStr(normDim(e.target.value))} />
                    <span className="suffix">m</span>
                  </div>
                </div>
                <div className="field">
                  <label>Alto</label>
                  <div className="suffix-input">
                    <input type="text" inputMode="decimal" value={altoStr}
                      onChange={e => setAltoStr(e.target.value)}
                      onBlur={e => setAltoStr(normDim(e.target.value))} />
                    <span className="suffix">m</span>
                  </div>
                </div>
                <div className="field">
                  <label>Cantidad</label>
                  <input type="number" min="1" value={qty}
                    onChange={e => setQty(Math.max(1, parseInt(e.target.value)||1))} />
                </div>
              </div>
              <div className="hint" style={{marginTop:10}}>
                Área del trabajo: <strong className="mono">{m2Work.toFixed(2)} m²</strong>
                {qty > 1 && <span> · Total <strong className="mono">{(m2Work * qty).toFixed(2)} m²</strong></span>}
              </div>
            </div>

            <div style={{height:14}}></div>

            {/* PASO 2 — MATERIAL */}
            <div className="form-card">
              <h3><span className="num">2</span>Material</h3>
              <div className="material-grid">
                {window.GF_MATERIALS.map(m => (
                  <div key={m.id}
                    className={'material-card' + (material.id === m.id ? ' active' : '')}
                    onClick={() => setMaterial(m)}>
                    <div className="mc-name">{m.name}</div>
                    <div style={{fontSize:10, color:'var(--text-3)', marginTop:2}}>{m.desc}</div>
                    <div className="mc-price">${m.price}/m²</div>
                    {m.rollos && m.rollos.length > 0 && (
                      <div style={{fontSize:9, color:'var(--text-3)', marginTop:3}}>
                        {m.rollos.map(r => r + 'm').join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{height:14}}></div>

            {/* PASO 3 — TERMINADO */}
            <div className="form-card">
              <h3><span className="num">3</span>Terminado</h3>
              <div className="opt-chips" style={{gap:8}}>
                {window.GF_FINISH.map(f => (
                  <button key={f.id}
                    className={'material-card' + (finish.id === f.id ? ' active' : '')}
                    style={{flex:1, cursor:'pointer'}}
                    onClick={() => setFinish(f)}>
                    <div className="mc-name">{f.name}</div>
                    <div className="mc-price">{f.add > 0 ? `+$${f.add}` : 'Incluido'}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* PANEL DERECHO — PREVIEW + ROLLO */}
          <div className="preview-side">
            <h4>Previsualización</h4>
            <div className="preview-canvas">
              <div className="preview-shape" style={{width: previewW + 'px', height: previewH + 'px'}}>
                <div className="preview-dim top mono">{ancho.toFixed(2)} m</div>
                <div className="preview-dim right mono">{alto.toFixed(2)} m</div>
              </div>
            </div>

            {/* SELECTOR DE ROLLO */}
            {rollosSorted.length > 0 && (
              <div style={{padding:'10px 12px 4px'}}>
                <div style={{fontSize:'0.72rem', color:'var(--text-3)', marginBottom:6,
                  textTransform:'uppercase', letterSpacing:'0.05em'}}>
                  Rollo a usar
                </div>
                <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
                  {rollosSorted.map(r => {
                    const plan   = _planRollo(ancho, alto, r, qty);
                    if (!plan) return null;
                    const t      = plan.tiras;
                    const isRec  = r === recRollo;
                    const isAct  = r === activeRollo;
                    return (
                      <button key={r}
                        onClick={() => setRolloOverride(isRec ? null : r)}
                        title={isRec ? 'Recomendado' : 'Seleccionar este rollo'}
                        style={{
                          padding:'5px 10px', borderRadius:6, fontSize:'0.8rem',
                          border: isAct ? '2px solid var(--orange)' : '1px solid var(--border)',
                          background: isAct ? 'rgba(232,93,4,0.12)' : 'var(--surface-2)',
                          color: isAct ? 'var(--orange)' : 'var(--text-2)',
                          cursor:'pointer', fontWeight: isAct ? 700 : 400,
                          display:'flex', alignItems:'center', gap:5,
                        }}>
                        <span className="mono">{r}m</span>
                        {t > 1 && (
                          <span style={{fontSize:'0.7rem', opacity:0.75}}>×{t}</span>
                        )}
                        {isRec && (
                          <span style={{fontSize:'0.65rem', color:'var(--green)',
                            fontWeight:700}}>★</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {rolloOverride && (
                  <div style={{fontSize:'0.72rem', color:'var(--text-3)', marginTop:5}}>
                    Cambiado manualmente ·{' '}
                    <span style={{color:'var(--orange)', cursor:'pointer', textDecoration:'underline'}}
                      onClick={() => setRolloOverride(null)}>
                      Restaurar recomendación
                    </span>
                  </div>
                )}
              </div>
            )}

            <div style={{borderTop:'1px solid var(--border)', margin:'8px 0'}} />

            {/* RESUMEN DE CONSUMO */}
            <div className="preview-detail">
              <span className="pd-l">Material</span>
              <span className="pd-v">{material.name}</span>
            </div>
            <div className="preview-detail">
              <span className="pd-l">Área cobrada</span>
              <span className="pd-v mono">{m2Total.toFixed(2)} m²</span>
            </div>

            {activeRollo && (
              <>
                <div className="preview-detail">
                  <span className="pd-l">Rollo</span>
                  <span className="pd-v mono">
                    {tiras > 1 ? `${tiras} tiras × ${activeRollo}m` : `${activeRollo}m`}
                    {girado ? ' · girada' : ''}
                  </span>
                </div>
                {girado && (
                  <div style={{
                    margin:'4px 12px 0', padding:'5px 9px',
                    background:'rgba(6,182,212,0.08)', borderRadius:6,
                    fontSize:'0.73rem', color:'var(--cyan)', lineHeight:1.4
                  }}>
                    La pieza se imprime girada: el alto ({alto.toFixed(2)}m) cruza el rollo para aprovechar mejor el material.
                  </div>
                )}
                {porFila > 1 && (
                  <div style={{
                    margin:'4px 12px 0', padding:'5px 9px',
                    background:'rgba(22,163,74,0.08)', borderRadius:6,
                    fontSize:'0.73rem', color:'var(--green)', lineHeight:1.4
                  }}>
                    Se acomodan {porFila} piezas lado a lado en el ancho del rollo — se cobra solo el material usado.
                  </div>
                )}
                <div className="preview-detail">
                  <span className="pd-l">Consumo real</span>
                  <span className="pd-v mono">{m2Total.toFixed(2)} m²</span>
                </div>
                {m2Desp > 0 && (
                  <div className="preview-detail" style={{color:'var(--text-3)'}}>
                    <span className="pd-l">Desperdicio</span>
                    <span className="pd-v mono">
                      {m2Desp.toFixed(2)} m² ({pctDesp}%)
                    </span>
                  </div>
                )}
                {tiras > 1 && (
                  <div style={{
                    margin:'4px 12px 0', padding:'5px 9px',
                    background:'rgba(232,93,4,0.08)', borderRadius:6,
                    fontSize:'0.73rem', color:'var(--orange)', lineHeight:1.4
                  }}>
                    Requiere unir {tiras} tiras — considerar costura o traslape.
                  </div>
                )}
              </>
            )}

            <div style={{borderTop:'1px solid var(--border)', margin:'8px 0'}} />

            <div className="preview-detail">
              <span className="pd-l">Precio m²</span>
              <span className="pd-v mono">${material.price}</span>
            </div>
            <div className="preview-detail">
              <span className="pd-l">Terminado</span>
              <span className="pd-v">{finish.name}</span>
            </div>
            <div className="preview-detail">
              <span className="pd-l">Cantidad</span>
              <span className="pd-v mono">×{qty}</span>
            </div>
            <div className="preview-total">
              <span className="pt-l">Total</span>
              <span className="pt-v mono">{window.fmt(total)}</span>
            </div>

            <button className="btn-add" onClick={() => {
              const rolloLabel = activeRollo
                ? (tiras > 1 ? ` (${tiras} tiras ${activeRollo}m)` : ` rollo ${activeRollo}m`)
                : '';
              addToTicket({
                id: window.uid(),
                name: `${material.name} ${ancho}×${alto}m${rolloLabel}`,
                qty,
                unitPrice: window.round2(baseUnit),
                meta: [
                  `${m2Total.toFixed(2)} m² (rollo ${activeRollo ?? ancho}m${girado ? ', girada' : ''}${porFila > 1 ? `, ${porFila}/fila` : ''})`,
                  m2Desp > 0 ? `trabajo ${(m2Work * qty).toFixed(2)} m² · desp. ${m2Desp.toFixed(2)} m²` : null,
                  finish.name,
                ].filter(Boolean),
                module: 'granformato',
              });
            }}>
              <window.IconPlus size={14} stroke={3}/>Agregar al ticket
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

window.ModuleGranFormato = ModuleGranFormato;
