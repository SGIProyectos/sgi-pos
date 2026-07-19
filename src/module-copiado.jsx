// ========== CENTRO DE COPIADO MODULE ==========

function ModuleCopiado({ addToTicket, onModuleChange }) {
  const [activeOption, setActiveOption] = React.useState(null);

  // Hotkeys 1–8 para servicios directos
  const addRef = React.useRef(addToTicket);
  React.useEffect(() => { addRef.current = addToTicket; }, [addToTicket]);
  React.useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      const idx = parseInt(e.key) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < window.COPIADO_DIRECT.length) {
        e.preventDefault();
        const s = window.COPIADO_DIRECT[idx];
        addRef.current({ id: window.uid(), name: s.name, qty: 1, unitPrice: s.price, meta: [s.desc], module: 'copiado' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <div className="module-header">
        <div className="module-title">
          <div className="mt-icon"><window.IconCopy size={20} /></div>
          <div>
            <h1>Centro de Copiado</h1>
            <div className="mt-sub">Copiado · Impresión · Acabados · Material Impreso</div>
          </div>
        </div>
        <div className="module-actions">
          <button className="module-tab active"><window.IconLayers size={13} />Servicios</button>
          <button className="module-tab"><window.IconClock size={13} />Recientes</button>
        </div>
      </div>

      <div className="module-body">
        <div className="copiado-grid">
          <div>
            <div className="copiado-services">
              <h3>Servicios directos · clic o tecla 1–8 para agregar</h3>
              <div className="service-grid cols-4">
                {window.COPIADO_DIRECT.map((s, i) => {
                  const Ico = s.Icon;
                  return (
                    <button key={s.id} className="service-card direct" onClick={() => addToTicket({
                      id: window.uid(), name: s.name, qty: 1, unitPrice: s.price,
                      meta: [s.desc], module: 'copiado'
                    })}>
                      <div className="sc-icon"><Ico size={20} /></div>
                      <div className="sc-name">{s.name}</div>
                      <div className="sc-desc">{s.desc}</div>
                      <div className="sc-price mono">{window.fmt(s.price)}</div>
                      <div className="sc-hotkey">{i + 1}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="copiado-services">
              <h3>Servicios con opciones · configurar antes de agregar</h3>
              <div className="service-grid cols-4">
                {window.COPIADO_OPTIONS.map(s => {
                  const Ico = s.Icon;
                  const selected = activeOption === s.id;
                  return (
                    <button key={s.id}
                      className={'service-card options' + (selected ? ' selected' : '')}
                      onClick={() => setActiveOption(selected ? null : s.id)}
                    >
                      <div className="sc-icon"><Ico size={20} /></div>
                      <div className="sc-name">{s.name}</div>
                      <div className="sc-desc">{s.desc}</div>
                    </button>
                  );
                })}
                <button
                  className="service-card cotizador-btn"
                  onClick={() => onModuleChange && onModuleChange('cotizador')}
                >
                  <div className="sc-icon"><window.IconFileText size={20} /></div>
                  <div className="sc-name">Cotizador Express</div>
                  <div className="sc-desc">Cotizaciones B2B · PDF de requisición · imprime y convierte a pedido</div>
                </button>
              </div>
            </div>
          </div>

          <div>
            {!activeOption && (
              <div className="shortcuts-panel">
                <h4>Atajos de teclado</h4>
                {window.COPIADO_DIRECT.slice(0, 9).map((s, i) => (
                  <div key={s.id} className="shortcut-row"><span>{s.name}</span><kbd>{i + 1}</kbd></div>
                ))}
                <div className="shortcut-row" style={{marginTop:8, borderTop:'1px solid #333', paddingTop:8}}>
                  <span>Cambiar módulo</span><kbd>F1–F{window.MODULES.filter(m => !m.admin).length}</kbd>
                </div>
                <div className="shortcut-row"><span>Cobrar</span><kbd>F12</kbd></div>
                <div className="shortcut-row"><span>Enfocar cantidad</span><kbd>Q</kbd></div>
                <div className="shortcut-row"><span>Limpiar ticket</span><kbd>Esc</kbd></div>
              </div>
            )}
            {activeOption === 'impresion'   && <PrintOptionsPanel   onClose={() => setActiveOption(null)} addToTicket={addToTicket} />}
            {activeOption === 'impreso'     && <MaterialImpresoPanel onClose={() => setActiveOption(null)} addToTicket={addToTicket} />}
            {activeOption === 'engargolado' && <EngargoOptionsPanel  onClose={() => setActiveOption(null)} addToTicket={addToTicket} />}
            {activeOption === 'planos'      && <PlanosOptionsPanel   onClose={() => setActiveOption(null)} addToTicket={addToTicket} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────────────
function Stepper({ value, onChange, min = 1 }) {
  return (
    <div className="opt-stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))}><window.IconMinus size={14}/></button>
      <input type="number" min={min} value={value}
        onChange={e => onChange(Math.max(min, parseInt(e.target.value) || min))} />
      <button onClick={() => onChange(value + 1)}><window.IconPlus size={14}/></button>
    </div>
  );
}

// ─── Panel: Impresión ────────────────────────────────────────────────────────
function PrintOptionsPanel({ onClose, addToTicket }) {
  const [paper,   setPaper]   = React.useState(window.PRINT_PAPER[0]);
  const [color,   setColor]   = React.useState('bn');
  const [faces,   setFaces]   = React.useState('1');
  const [finish,  setFinish]  = React.useState(window.PRINT_FINISH[0]);
  const [urgency, setUrgency] = React.useState(window.PRINT_URGENCY[0]);
  const [qty,     setQty]     = React.useState(10);

  // Guard: catálogo vaciado desde Config
  if (!paper) return (
    <div className="options-panel" style={{padding:24}}>
      <p style={{fontSize:13, color:'var(--text-3)'}}>No hay papeles activos en el catálogo. Agrégalos o actívalos en Configuración.</p>
      <button className="options-close" onClick={onClose} style={{marginTop:10}}>Cerrar</button>
    </div>
  );

  const colorMult  = color === 'color' ? (window.COPIADO_OPC.colorMult || 4) : 1;
  const facesMult  = faces === '2' ? (window.COPIADO_OPC.dobleCaraMult || 1.6) : 1;
  const baseUnit   = paper.price * colorMult * facesMult + finish.price;
  const unit       = window.round2(baseUnit * urgency.mult);
  const total      = unit * qty;

  return (
    <div className="options-panel">
      <div className="options-header">
        <span><window.IconPrinter size={14}/> Impresión</span>
        <button className="options-close" onClick={onClose}><window.IconX size={14}/></button>
      </div>
      <div className="options-body">
        <div className="opt-group">
          <label className="opt-label">Papel</label>
          <select className="opt-select" value={paper.id}
            onChange={e => setPaper(window.PRINT_PAPER.find(p => p.id === e.target.value))}>
            {window.PRINT_PAPER.map(p => (
              <option key={p.id} value={p.id}>{p.name} · ${p.price}</option>
            ))}
          </select>
        </div>
        <div className="opt-group">
          <label className="opt-label">Color</label>
          <div className="opt-chips">
            {window.PRINT_COLOR.map(c => (
              <button key={c.id} className={'opt-chip' + (color === c.id ? ' active' : '')}
                onClick={() => setColor(c.id)}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="opt-group">
          <label className="opt-label">Caras</label>
          <div className="opt-chips">
            {window.PRINT_FACES.map(f => (
              <button key={f.id} className={'opt-chip' + (faces === f.id ? ' active' : '')}
                onClick={() => setFaces(f.id)}>{f.name}</button>
            ))}
          </div>
        </div>
        <div className="opt-group">
          <label className="opt-label">Acabado</label>
          <div className="opt-chips">
            {window.PRINT_FINISH.map(f => (
              <button key={f.id} className={'opt-chip' + (finish.id === f.id ? ' active' : '')}
                onClick={() => setFinish(f)}>
                {f.name}{f.price > 0 ? ` +$${f.price}` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="opt-group">
          <label className="opt-label">Urgencia</label>
          <div className="opt-chips">
            {window.PRINT_URGENCY.map(u => (
              <button key={u.id} className={'opt-chip' + (urgency.id === u.id ? ' active' : '')}
                onClick={() => setUrgency(u)}>
                {u.name} · {u.time}{u.mult > 1 ? ` (+${((u.mult - 1) * 100) | 0}%)` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="opt-group">
          <label className="opt-label">Cantidad de hojas</label>
          <Stepper value={qty} onChange={setQty} />
        </div>
        <div className="opt-summary">
          <div>
            <div className="ps-label">Total</div>
            <div style={{fontSize:10, color:'#aaa', marginTop:2}}>{window.fmt(unit)} × {qty}</div>
          </div>
          <div className="ps-value mono">{window.fmt(total)}</div>
        </div>
        <button className="opt-add-btn" onClick={() => {
          const meta = [
            color === 'color' ? 'Color' : 'B/N',
            faces === '2' ? '2 caras' : '1 cara',
            finish.id !== 'ninguno' ? finish.name : '',
            urgency.id !== 'normal' ? urgency.name : '',
          ].filter(Boolean);
          addToTicket({
            id: window.uid(), name: `Impresión ${paper.name}`,
            qty, unitPrice: window.round2(unit), meta, module: 'copiado',
          });
          onClose();
        }}>
          <window.IconPlus size={14} stroke={3}/>Agregar al ticket
        </button>
      </div>
    </div>
  );
}

// ─── Panel: Material Impreso ─────────────────────────────────────────────────
function MaterialImpresoPanel({ onClose, addToTicket }) {
  const [tipo,     setTipo]     = React.useState(window.IMPRESO_TIPOS[0]);
  const [papel,    setPapel]    = React.useState(window.IMPRESO_PAPELES[0]);
  const [acabado,  setAcabado]  = React.useState(window.IMPRESO_ACABADOS[0]);
  const [urgencia, setUrgencia] = React.useState(window.IMPRESO_URGENCIA[0]);
  const [vol,      setVol]      = React.useState(
    () => window.IMPRESO_VOL.find(v => v.qty >= 100) || window.IMPRESO_VOL[4]
  );

  // Cuando cambia el tipo, asegura que el volumen sea válido para el mínimo
  React.useEffect(() => {
    if (!tipo) return;
    const available = window.IMPRESO_VOL.filter(v => v.qty >= tipo.minQty);
    if (available.length > 0 && !available.find(v => v.id === vol.id)) {
      setVol(available[0]);
    }
  }, [tipo?.id]);

  // Guard: catálogo vaciado desde Config
  if (!tipo) return (
    <div className="options-panel" style={{padding:24}}>
      <p style={{fontSize:13, color:'var(--text-3)'}}>No hay tipos de material impreso activos en el catálogo. Agrégalos o actívalos en Configuración.</p>
      <button className="options-close" onClick={onClose} style={{marginTop:10}}>Cerrar</button>
    </div>
  );

  const volsDisponibles = window.IMPRESO_VOL.filter(v => v.qty >= tipo.minQty);

  // Cálculo de precio
  const precioUnitario = tipo.unitPrice * vol.priceMult * papel.mult;
  let subtotal = precioUnitario * vol.qty;
  if (acabado.addPct > 0) subtotal *= (1 + acabado.addPct);
  if (acabado.addFlat > 0) subtotal += acabado.addFlat;
  const total = window.round2(subtotal * urgencia.mult);

  return (
    <div className="options-panel">
      <div className="options-header">
        <span><window.IconImage size={14}/> Material Impreso</span>
        <button className="options-close" onClick={onClose}><window.IconX size={14}/></button>
      </div>
      <div className="options-body">

        <div className="opt-group">
          <label className="opt-label">Tipo de material</label>
          <div className="opt-chips impreso-tipos">
            {window.IMPRESO_TIPOS.map(t => (
              <button key={t.id}
                className={'opt-chip impreso-chip' + (tipo.id === t.id ? ' active' : '')}
                onClick={() => setTipo(t)}>
                <span className="ic-name">{t.name}</span>
                <span className="ic-size">{t.size}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="opt-group">
          <label className="opt-label">Cantidad</label>
          <div className="opt-chips">
            {volsDisponibles.map(v => (
              <button key={v.id} className={'opt-chip' + (vol.id === v.id ? ' active' : '')}
                onClick={() => setVol(v)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="opt-group">
          <label className="opt-label">Papel</label>
          <div className="opt-chips">
            {window.IMPRESO_PAPELES.map(p => (
              <button key={p.id} className={'opt-chip' + (papel.id === p.id ? ' active' : '')}
                onClick={() => setPapel(p)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="opt-group">
          <label className="opt-label">Acabado</label>
          <div className="opt-chips">
            {window.IMPRESO_ACABADOS.map(a => (
              <button key={a.id} className={'opt-chip' + (acabado.id === a.id ? ' active' : '')}
                onClick={() => setAcabado(a)}>
                {a.name}
                {a.addPct > 0 ? <span style={{opacity:.7}}> +{(a.addPct * 100) | 0}%</span> : ''}
                {a.addFlat > 0 ? <span style={{opacity:.7}}> +${a.addFlat}</span> : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="opt-group">
          <label className="opt-label">Urgencia</label>
          <div className="opt-chips">
            {window.IMPRESO_URGENCIA.map(u => (
              <button key={u.id} className={'opt-chip' + (urgencia.id === u.id ? ' active' : '')}
                onClick={() => setUrgencia(u)}>
                {u.name} · {u.time}
                {u.mult > 1 ? <span style={{opacity:.7}}> (+{((u.mult - 1) * 100) | 0}%)</span> : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="opt-summary">
          <div>
            <div className="ps-label">Total · {vol.label}</div>
            <div style={{fontSize:10, color:'#aaa', marginTop:2}}>
              {papel.name}{acabado.id !== 'ninguno' ? ` · ${acabado.name}` : ''}
            </div>
          </div>
          <div className="ps-value mono">{window.fmt(total)}</div>
        </div>

        <button className="opt-add-btn" onClick={() => {
          const meta = [
            vol.label,
            papel.name,
            acabado.id !== 'ninguno' ? acabado.name : '',
            urgencia.id !== 'normal' ? urgencia.name : '',
          ].filter(Boolean);
          addToTicket({
            id: window.uid(),
            name: `${tipo.name} × ${vol.qty}`,
            qty: 1,
            unitPrice: total,
            meta,
            module: 'copiado',
          });
          onClose();
        }}>
          <window.IconPlus size={14} stroke={3}/>Agregar al ticket
        </button>
      </div>
    </div>
  );
}

// ─── Panel: Engargolado ──────────────────────────────────────────────────────
function EngargoOptionsPanel({ onClose, addToTicket }) {
  const [tipo,  setTipo]  = React.useState(window.ENGARGO_TYPES[0]);
  const [pasta, setPasta] = React.useState(window.ENGARGO_PASTAS[0]);
  const [hojas, setHojas] = React.useState(50);
  const [qty,   setQty]   = React.useState(1);
  const unit  = tipo.price + pasta.price * 2;
  const total = unit * qty;

  return (
    <div className="options-panel">
      <div className="options-header">
        <span><window.IconBook size={14}/> Engargolado</span>
        <button className="options-close" onClick={onClose}><window.IconX size={14}/></button>
      </div>
      <div className="options-body">
        <div className="opt-group">
          <label className="opt-label">Tipo de encuadernación</label>
          <div className="opt-chips">
            {window.ENGARGO_TYPES.map(t => (
              <button key={t.id} className={'opt-chip' + (tipo.id === t.id ? ' active' : '')}
                onClick={() => setTipo(t)}>
                {t.name} · ${t.price}
              </button>
            ))}
          </div>
        </div>
        <div className="opt-group">
          <label className="opt-label">Pasta (frente + contraportada)</label>
          <div className="opt-chips">
            {window.ENGARGO_PASTAS.map(p => (
              <button key={p.id} className={'opt-chip' + (pasta.id === p.id ? ' active' : '')}
                onClick={() => setPasta(p)}>
                {p.name} · ${p.price}
              </button>
            ))}
          </div>
        </div>
        <div className="opt-row">
          <div className="opt-group" style={{flex:1}}>
            <label className="opt-label">N° de hojas</label>
            <input type="number" className="opt-input" value={hojas}
              onChange={e => setHojas(parseInt(e.target.value) || 0)} />
          </div>
          <div className="opt-group" style={{flex:1}}>
            <label className="opt-label">Cantidad</label>
            <Stepper value={qty} onChange={setQty} />
          </div>
        </div>
        <div className="opt-summary">
          <span className="ps-label">Total</span>
          <span className="ps-value mono">{window.fmt(total)}</span>
        </div>
        <button className="opt-add-btn" onClick={() => {
          addToTicket({
            id: window.uid(), name: `Engargolado ${tipo.name}`,
            qty, unitPrice: window.round2(unit),
            meta: [`${hojas} hojas`, `Pasta ${pasta.name}`], module: 'copiado',
          });
          onClose();
        }}>
          <window.IconPlus size={14} stroke={3}/>Agregar al ticket
        </button>
      </div>
    </div>
  );
}

// ─── Panel: Planos ───────────────────────────────────────────────────────────
function PlanosOptionsPanel({ onClose, addToTicket }) {
  const [tipo, setTipo] = React.useState(window.PLANOS_TIPO[0]);
  const [tam,  setTam]  = React.useState(window.PLANOS_TAM[0]);
  const [qty,  setQty]  = React.useState(1);
  const unit  = tipo.price * tam.mult;
  const total = unit * qty;

  return (
    <div className="options-panel">
      <div className="options-header">
        <span><window.IconBlueprint size={14}/> Planos</span>
        <button className="options-close" onClick={onClose}><window.IconX size={14}/></button>
      </div>
      <div className="options-body">
        <div className="opt-group">
          <label className="opt-label">Tipo de impresión</label>
          <div className="opt-chips">
            {window.PLANOS_TIPO.map(t => (
              <button key={t.id} className={'opt-chip' + (tipo.id === t.id ? ' active' : '')}
                onClick={() => setTipo(t)}>
                {t.name} · ${t.price}/m
              </button>
            ))}
          </div>
        </div>
        <div className="opt-group">
          <label className="opt-label">Tamaño</label>
          <div className="opt-chips">
            {window.PLANOS_TAM.map(t => (
              <button key={t.id} className={'opt-chip' + (tam.id === t.id ? ' active' : '')}
                onClick={() => setTam(t)}>{t.name}</button>
            ))}
          </div>
        </div>
        <div className="opt-group">
          <label className="opt-label">Cantidad</label>
          <Stepper value={qty} onChange={setQty} />
        </div>
        <div className="opt-summary">
          <span className="ps-label">Total</span>
          <span className="ps-value mono">{window.fmt(total)}</span>
        </div>
        <button className="opt-add-btn" onClick={() => {
          addToTicket({
            id: window.uid(), name: `Plano ${tam.name}`,
            qty, unitPrice: window.round2(unit),
            meta: [tipo.name, tam.name], module: 'copiado',
          });
          onClose();
        }}>
          <window.IconPlus size={14} stroke={3}/>Agregar al ticket
        </button>
      </div>
    </div>
  );
}

window.ModuleCopiado = ModuleCopiado;
