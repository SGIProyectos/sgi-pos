// ========== TICKET PANEL ==========

// ---- Cabecera de negocio compartida ----
function _BizHdr() {
  const neg = window.NEGOCIO || {};
  return (
    <div className="coti-biz-block">
      <div className="coti-biz-name">{neg.nombre || 'Servicios Gráficos de Impresión'}</div>
      {neg.rfc       && <div className="coti-biz-line">RFC: {neg.rfc}</div>}
      {neg.direccion && <div className="coti-biz-line">{neg.direccion}{neg.colonia ? ', '+neg.colonia : ''}</div>}
      {(neg.ciudad||neg.estado) && <div className="coti-biz-line">{[neg.ciudad,neg.estado,neg.cp].filter(Boolean).join(', ')}</div>}
      {neg.telefono  && <div className="coti-biz-line">Tel: {neg.telefono}</div>}
      {neg.email     && <div className="coti-biz-line">{neg.email}</div>}
    </div>
  );
}

// ---- Tabla de partidas ----
function _ItemsTable({ items, showUnitPrice, discGlobal }) {
  return (
    <table className="coti-table">
      <thead>
        <tr>
          <th className="al coti-n-hd">#</th>
          <th className="al">Descripción</th>
          <th className="ar">Cant.</th>
          {showUnitPrice && <th className="ar">P. Unitario</th>}
          {showUnitPrice && discGlobal > 0 && <th className="ar">Desc.</th>}
          <th className="ar">Importe</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => {
          const base = it.unitPrice * it.qty;
          const dsc  = it.discount ? base * it.discount / 100 : 0;
          return (
            <tr key={it.id}>
              <td className="coti-n">{i + 1}</td>
              <td>
                <div className="coti-iname">{it.name}</div>
                {it.meta && it.meta.length > 0 && <div className="coti-imeta">{it.meta.join(' · ')}</div>}
                {it.note && <div className="coti-inote">{showUnitPrice ? 'Nota: ' : ''}{it.note}</div>}
              </td>
              <td className="ar mono">{it.qty}</td>
              {showUnitPrice && <td className="ar mono">{window.fmt(it.unitPrice)}</td>}
              {showUnitPrice && discGlobal > 0 && <td className="ar mono">{it.discount ? `-${it.discount}%` : '—'}</td>}
              <td className="ar mono coti-imp">{window.fmt(base - dsc)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---- Totales compartidos ----
function _TotalesBlock({ subtotal, discGlobal, discAmount, iva, total }) {
  return (
    <div className="coti-totales-wrap">
      <div className="coti-totales">
        <div className="coti-tot-row"><span>Subtotal</span><span className="mono">{window.fmt(subtotal)}</span></div>
        {discAmount > 0 && (
          <div className="coti-tot-row coti-tot-desc">
            <span>Descuento {discGlobal}%</span>
            <span className="mono">− {window.fmt(discAmount)}</span>
          </div>
        )}
        <div className="coti-tot-row"><span>IVA 16%</span><span className="mono">{window.fmt(iva)}</span></div>
        <div className="coti-tot-row coti-tot-grand"><span>TOTAL</span><span className="mono">{window.fmt(total)}</span></div>
      </div>
    </div>
  );
}

// ---- Documento: Cotización ----
function _CotiDoc({ folio, fecha, cliente, validez, items, subtotal, discGlobal, discAmount, iva, total }) {
  const neg = window.NEGOCIO || {};
  return (
    <div className="coti-doc">
      <div className="coti-hdr">
        <_BizHdr />
        <div className="coti-folio-block">
          <div className="coti-doc-tipo">COTIZACIÓN</div>
          <div className="coti-folio-num">{folio}</div>
          <div className="coti-folio-date">Fecha: {fecha}</div>
        </div>
      </div>

      <div className="coti-hr" />

      <div className="coti-saludo">
        <div className="coti-dest">{cliente ? `Estimado(a): ${cliente}` : 'A Quien Corresponda:'}</div>
        <p className="coti-intro">
          Por medio de la presente, ponemos a su distinguida consideración la siguiente cotización
          por los servicios y/o productos descritos a continuación, mismos que han sido preparados
          conforme a sus requerimientos.
        </p>
      </div>

      <_ItemsTable items={items} showUnitPrice discGlobal={discGlobal} />
      <_TotalesBlock subtotal={subtotal} discGlobal={discGlobal} discAmount={discAmount} iva={iva} total={total} />

      <div className="coti-hr" />

      <div className="coti-condiciones">
        <div className="coti-cond-title">CONDICIONES DE LA COTIZACIÓN</div>
        <ul className="coti-cond-list">
          <li>La presente cotización tiene una vigencia de <strong>{validez} días naturales</strong> a partir de la fecha de emisión.</li>
          <li>Los precios están sujetos a modificación sin previo aviso en caso de que los costos de insumos o materiales sufran una variación repentina en el mercado.</li>
          <li>Se requiere un anticipo del <strong>50%</strong> del total cotizado para iniciar la producción del trabajo.</li>
          <li>El saldo restante deberá liquidarse en su totalidad al momento de la entrega.</li>
          <li>Los tiempos de producción y entrega se cuentan a partir de la confirmación y recepción del anticipo.</li>
          <li>Los precios no incluyen impuestos adicionales más allá del IVA indicado en el presente documento.</li>
        </ul>
      </div>

      <div className="coti-firmas">
        <div className="coti-firma">
          <div className="coti-firma-line" />
          <div className="coti-firma-nombre">{neg.nombre || 'Servicios Gráficos de Impresión'}</div>
          <div className="coti-firma-rol">Proveedor de servicios</div>
        </div>
        <div className="coti-firma">
          <div className="coti-firma-line" />
          <div className="coti-firma-nombre">{cliente || 'Nombre del cliente'}</div>
          <div className="coti-firma-rol">Acepta términos y condiciones</div>
        </div>
      </div>

      {(neg.telefono || neg.email) && (
        <div className="coti-footer-doc">
          {neg.telefono && `Tel: ${neg.telefono}`}{neg.telefono && neg.email ? ' · ' : ''}{neg.email}
        </div>
      )}
    </div>
  );
}

// ---- Documento: Orden de Trabajo ----
function _OrdenDoc({ folio, fecha, fechaEntrega, responsable, cliente, notas, items, subtotal, discGlobal, discAmount, iva, total }) {
  const neg = window.NEGOCIO || {};
  return (
    <div className="coti-doc">
      <div className="coti-hdr">
        <_BizHdr />
        <div className="coti-folio-block">
          <div className="coti-doc-tipo">ORDEN DE TRABAJO</div>
          <div className="coti-folio-num">{folio}</div>
          <div className="coti-folio-date">Fecha: {fecha}</div>
        </div>
      </div>

      <div className="coti-hr" />

      <div className="ped-conf-grid" style={{marginBottom:16}}>
        <div className="ped-conf-cell">
          <span className="ped-conf-lbl">Cliente</span>
          <span className="ped-conf-val">{cliente || 'Mostrador'}</span>
        </div>
        <div className="ped-conf-cell">
          <span className="ped-conf-lbl">Fecha compromiso</span>
          <span className="ped-conf-val mono">{fechaEntrega || '_______________'}</span>
        </div>
        <div className="ped-conf-cell">
          <span className="ped-conf-lbl">Operario / Responsable</span>
          <span className="ped-conf-val">{responsable || '_______________'}</span>
        </div>
        <div className="ped-conf-cell">
          <span className="ped-conf-lbl">Prioridad</span>
          <span className="ped-conf-val">☐ Normal &nbsp;&nbsp; ☐ Urgente</span>
        </div>
      </div>

      <div className="coti-cond-title">TRABAJOS A REALIZAR</div>
      <_ItemsTable items={items} showUnitPrice={false} discGlobal={0} />
      <_TotalesBlock subtotal={subtotal} discGlobal={discGlobal} discAmount={discAmount} iva={iva} total={total} />

      {notas && (
        <>
          <div className="coti-cond-title" style={{marginTop:14}}>ESPECIFICACIONES TÉCNICAS / OBSERVACIONES</div>
          <div className="ped-conf-nota">{notas}</div>
        </>
      )}

      <div className="coti-hr" style={{marginTop:16}} />

      <div className="coti-cond-title">SEGUIMIENTO</div>
      <div className="ot-status-row">
        {['Recibido', 'En producción', 'Revisión / acabados', 'Entregado'].map((s, i) => (
          <div key={i} className="ot-status-box"><span className="ot-check">☐</span>{s}</div>
        ))}
      </div>

      <div className="coti-firmas" style={{marginTop:20}}>
        <div className="coti-firma">
          <div className="coti-firma-line" />
          <div className="coti-firma-nombre">{cliente || 'Cliente'}</div>
          <div className="coti-firma-rol">Autoriza y aprueba especificaciones</div>
        </div>
        <div className="coti-firma">
          <div className="coti-firma-line" />
          <div className="coti-firma-nombre">{responsable || neg.nombre || 'Operario'}</div>
          <div className="coti-firma-rol">Recibe y se compromete a ejecutar</div>
        </div>
      </div>

      {(neg.telefono || neg.email) && (
        <div className="coti-footer-doc">
          {neg.telefono && `Tel: ${neg.telefono}`}{neg.telefono && neg.email ? ' · ' : ''}{neg.email}
        </div>
      )}
    </div>
  );
}

// ---- Componente principal del ticket ----
function Ticket({ items, setItems, onCobrar, cobrarRef, ticketNumber }) {
  const [editingPrice, setEditingPrice] = React.useState(null);
  const [editingNote,  setEditingNote]  = React.useState(null);
  const [tempPrice,    setTempPrice]    = React.useState('');
  const [tempNote,     setTempNote]     = React.useState('');
  const [globalDiscount, setGlobalDiscount] = React.useState(0);
  const [showCoti,   setShowCoti]   = React.useState(false);
  const [cotiData,   setCotiData]   = React.useState(null);
  const [cliente,    setCliente]    = React.useState('');
  const [pausados,   setPausados]   = React.useState(() => window.storageLoad('sgi_tickets_pausados', []));
  const [showPausados, setShowPausados] = React.useState(false);
  const [conIva,     setConIva]     = React.useState(true);

  const sd = (k, v) => setCotiData(d => ({ ...d, [k]: v }));

  const updateItem = (id, patch) =>
    setItems(items.map(it => it.id === id ? { ...it, ...patch } : it));
  const removeItem = (id) => setItems(items.filter(it => it.id !== id));

  const subtotal = window.round2(items.reduce((s, it) => {
    const base = it.unitPrice * it.qty;
    const disc = it.discount ? base * it.discount / 100 : 0;
    return s + (base - disc);
  }, 0));
  const globalDiscAmount = window.round2(subtotal * globalDiscount / 100);
  const subAfterDisc = window.round2(subtotal - globalDiscAmount);
  const iva   = conIva ? window.round2(subAfterDisc * 0.16) : 0;
  const total = window.round2(subAfterDisc + iva);

  // F12 desde App dispara el cobro con los totales vigentes del ticket
  if (cobrarRef) cobrarRef.current = () => {
    if (items.length > 0) onCobrar(total, subtotal, iva, globalDiscAmount);
  };

  // Al vaciarse el ticket (cobro o borrado) el descuento global y el cliente
  // no deben arrastrarse al siguiente cliente
  React.useEffect(() => {
    if (items.length === 0) {
      if (globalDiscount !== 0) setGlobalDiscount(0);
      if (cliente) setCliente('');
      if (!conIva) setConIva(true);
    }
  }, [items.length]);

  const savePausados = (next) => {
    setPausados(next);
    window.storageSave('sgi_tickets_pausados', next);
  };

  const pausarTicket = () => {
    if (!items.length) return;
    savePausados([{
      id: window.uid(),
      cliente: cliente || 'Cliente mostrador',
      fecha: window.localISO(),
      hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
      items,
      total,
    }, ...pausados]);
    setItems([]);
  };

  const reanudarTicket = (rec) => {
    setItems([...items, ...rec.items]);
    if (rec.cliente && rec.cliente !== 'Cliente mostrador') setCliente(rec.cliente);
    savePausados(pausados.filter(p => p.id !== rec.id));
    setShowPausados(false);
  };

  const cambiarCliente = () => {
    const v = window.prompt('Nombre del cliente:', cliente);
    if (v === null) return;
    setCliente(v.trim());
  };

  const startEditPrice = (it) => { setEditingPrice(it.id); setTempPrice(String(it.unitPrice)); };
  const commitEditPrice = (id) => {
    const v = parseFloat(tempPrice);
    if (!isNaN(v) && v >= 0) updateItem(id, { unitPrice: window.round2(v) });
    setEditingPrice(null);
  };
  const startEditNote = (it) => { setEditingNote(it.id); setTempNote(it.note || ''); };
  const commitEditNote = (id) => {
    updateItem(id, { note: tempNote.trim() || null });
    setEditingNote(null);
  };
  const promptDiscount = (it) => {
    const v = window.prompt('Descuento % para este artículo (0-100):', it.discount || 0);
    if (v === null) return;
    const n = parseFloat(v);
    if (!isNaN(n) && n >= 0 && n <= 100) updateItem(it.id, { discount: n });
  };

  const openCoti = () => {
    if (!items.length) return;
    const today = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    // Folio generado una sola vez; el prefijo cambia según el tipo elegido
    const baseNum = window.nextCotiNum(); // 'COT-2026-007'
    setCotiData({ tipo: 'cotizacion', baseNum, cliente: cliente || '', validez: 10, fecha: today, fechaEntrega: '', responsable: '', notas: '' });
    setShowCoti(true);
  };

  // folio visible según tipo (mismo número, prefijo distinto)
  const folio = cotiData
    ? (cotiData.tipo === 'cotizacion' ? cotiData.baseNum : cotiData.baseNum.replace(/^COT-/, 'OT-'))
    : '';

  return (
    <div className="ticket">
      <div className="ticket-header">
        <div>
          <h2>Ticket {ticketNumber}</h2>
          <div className="ticket-meta">{items.length} artículo{items.length !== 1 ? 's' : ''} · Activo</div>
        </div>
        <div className="ticket-actions">
          <button className="ticket-action-btn" title="Pausar ticket"
            onClick={pausarTicket} disabled={!items.length}>
            <window.IconPause size={14} />
          </button>
          <button className="ticket-action-btn" title="Tickets en pausa"
            onClick={() => setShowPausados(true)}
            style={{position:'relative'}}>
            <window.IconSearch size={14} />
            {pausados.length > 0 && (
              <span style={{position:'absolute', top:-4, right:-4, background:'var(--orange)', color:'#fff',
                borderRadius:'50%', width:15, height:15, fontSize:9, fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center'}}>{pausados.length}</span>
            )}
          </button>
          <button className="ticket-action-btn" title="Limpiar"
            onClick={() => items.length && confirm('¿Limpiar ticket?') && setItems([])}>
            <window.IconRotate size={14} />
          </button>
        </div>
      </div>

      <div className="customer-bar">
        <div className="cb-icon"><window.IconUser size={14} /></div>
        <div className="cb-name">{cliente || 'Cliente mostrador'}</div>
        <button className="cb-change" onClick={cambiarCliente}>Cambiar</button>
      </div>

      <div className="ticket-items">
        {items.length === 0 ? (
          <div className="ticket-empty">
            <div className="te-icon"><window.IconShoppingCart size={26} /></div>
            <div className="te-title">Ticket vacío</div>
            <div className="te-sub">Selecciona servicios del módulo activo<br/>para agregar al ticket</div>
          </div>
        ) : items.map(it => {
          const base = it.unitPrice * it.qty;
          const disc = it.discount ? base * it.discount / 100 : 0;
          const lineTotal = base - disc;
          return (
            <div key={it.id} className="ticket-item">
              <div className="ti-top">
                <div className="ti-info">
                  <div className="ti-name">
                    {it.name}
                    {it.discount > 0 && (
                      <span className="ti-discount-badge">
                        <window.IconPercent size={9} stroke={3} />-{it.discount}%
                      </span>
                    )}
                  </div>
                  {it.meta && it.meta.length > 0 && (
                    <div className="ti-meta">
                      {it.meta.map((m, i) => <span key={i}>{m}</span>)}
                    </div>
                  )}
                </div>
                <div className="ti-price-block">
                  <div className="ti-total mono">{window.fmt(lineTotal)}</div>
                  <div className="ti-unit">{window.fmt(it.unitPrice)} c/u</div>
                </div>
              </div>

              <div className="ti-controls">
                <div className="qty-stepper">
                  <button onClick={() => updateItem(it.id, { qty: Math.max(1, it.qty - 1) })}><window.IconMinus size={12} /></button>
                  <input type="number" min="1" value={it.qty}
                    onChange={e => updateItem(it.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })} />
                  <button onClick={() => updateItem(it.id, { qty: it.qty + 1 })}><window.IconPlus size={12} /></button>
                </div>
                <button className="ti-action" title="Editar precio" onClick={() => startEditPrice(it)}>
                  <window.IconEdit size={12} />
                </button>
                <button className="ti-action" title="Descuento" onClick={() => promptDiscount(it)}>
                  <window.IconPercent size={12} />
                </button>
                <button className="ti-action" title="Nota" onClick={() => startEditNote(it)}>
                  <window.IconNote size={12} />
                </button>
                <div style={{flex:1}}></div>
                <button className="ti-action delete" title="Eliminar" onClick={() => removeItem(it.id)}>
                  <window.IconTrash size={12} />
                </button>
              </div>

              {editingPrice === it.id && (
                <div className="ti-edit-row">
                  <input autoFocus type="number" step="0.01" className="ti-edit-input"
                    value={tempPrice} onChange={e => setTempPrice(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitEditPrice(it.id); if (e.key === 'Escape') setEditingPrice(null); }}
                    placeholder="Nuevo precio unitario" />
                  <button className="ti-action" onClick={() => commitEditPrice(it.id)}><window.IconCheck size={12} /></button>
                  <button className="ti-action" onClick={() => setEditingPrice(null)}><window.IconX size={12} /></button>
                </div>
              )}
              {editingNote === it.id && (
                <div className="ti-edit-row">
                  <input autoFocus className="ti-edit-input" value={tempNote}
                    onChange={e => setTempNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitEditNote(it.id); if (e.key === 'Escape') setEditingNote(null); }}
                    placeholder="Nota para este artículo…" />
                  <button className="ti-action" onClick={() => commitEditNote(it.id)}><window.IconCheck size={12} /></button>
                </div>
              )}
              {it.note && editingNote !== it.id && (
                <div className="ti-note"><window.IconNote size={11} />{it.note}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ticket-summary">
        <div className="summary-row"><span className="sr-l">Subtotal</span><span className="sr-v mono">{window.fmt(subtotal)}</span></div>
        {globalDiscount > 0 && (
          <div className="summary-row discount">
            <span className="sr-l">Descuento global ({globalDiscount}%)</span>
            <span className="sr-v mono">-{window.fmt(globalDiscAmount)}</span>
          </div>
        )}
        <div className="summary-row">
          <span className="sr-l" onClick={() => setConIva(v => !v)}
            title={conIva ? 'Clic para vender SIN IVA' : 'Clic para volver a cobrar IVA'}
            style={{cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, userSelect:'none'}}>
            <span style={{width:26, height:14, borderRadius:7, position:'relative', transition:'background 0.15s',
              background: conIva ? 'var(--green)' : 'var(--text-3)'}}>
              <span style={{position:'absolute', top:2, left: conIva ? 14 : 2, width:10, height:10,
                borderRadius:'50%', background:'white', transition:'left 0.15s'}} />
            </span>
            {conIva ? 'IVA 16%' : 'Sin IVA'}
          </span>
          <span className="sr-v mono">{window.fmt(iva)}</span>
        </div>
        <div className="summary-row total"><span className="sr-l">TOTAL</span><span className="sr-v mono">{window.fmt(total)}</span></div>
      </div>

      <div className="ticket-buttons">
        <button className="btn-secondary" onClick={() => {
          const v = window.prompt('Descuento global % (0-100):', globalDiscount);
          if (v === null) return;
          const n = parseFloat(v);
          if (!isNaN(n) && n >= 0 && n <= 100) setGlobalDiscount(n);
        }}>
          <window.IconPercent size={13} />Descuento global
        </button>
        <button className="btn-secondary" onClick={openCoti} disabled={items.length === 0}>
          <window.IconPrint size={13} />Cotización / OT
        </button>
        <button className="btn-cobrar" disabled={items.length === 0}
          onClick={() => onCobrar(total, subtotal, iva, globalDiscAmount)}>
          <window.IconCash size={20} />Cobrar
          <span className="kbd-hint">F12</span>
        </button>
      </div>

      {/* ---- Modal de tickets en pausa ---- */}
      {showPausados && (
        <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && setShowPausados(false)}>
          <div className="cfg-modal" style={{maxWidth:480}}>
            <div className="cfg-modal-head">
              <span className="cfg-modal-title">Tickets en pausa</span>
              <button className="cfg-modal-x" onClick={() => setShowPausados(false)}><window.IconX size={18} /></button>
            </div>
            <div className="cfg-modal-body">
              {pausados.length === 0 ? (
                <p style={{fontSize:13, color:'var(--text-3)', padding:'16px 0', textAlign:'center'}}>
                  No hay tickets en pausa. Usa el botón ⏸ para guardar el ticket actual y atender a otro cliente.
                </p>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {pausados.map(p => (
                    <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                      border:'1px solid var(--border)', borderRadius:8, background:'var(--surface-2)'}}>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontWeight:600, fontSize:13}}>{p.cliente}</div>
                        <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>
                          {p.items.length} artículo{p.items.length !== 1 ? 's' : ''} · {p.fecha} {p.hora} · <span className="mono">{window.fmt(p.total)}</span>
                        </div>
                      </div>
                      <button className="cfg-btn-save" style={{padding:'6px 12px', fontSize:12}}
                        onClick={() => reanudarTicket(p)}>Reanudar</button>
                      <button className="cfg-act danger" style={{fontSize:12}}
                        onClick={() => confirm(`¿Descartar ticket de ${p.cliente}?`) && savePausados(pausados.filter(x => x.id !== p.id))}>
                        <window.IconTrash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Modal de cotización / orden de trabajo ---- */}
      {showCoti && cotiData && (
        <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && setShowCoti(false)}>
          <div className="cfg-modal coti-modal">
            <div className="cfg-modal-head">
              <span className="cfg-modal-title">
                {cotiData.tipo === 'cotizacion' ? 'Cotización' : 'Orden de Trabajo'} · {folio}
              </span>
              <button className="cfg-modal-x" onClick={() => setShowCoti(false)}><window.IconX size={18} /></button>
            </div>
            <div className="cfg-modal-body">

              {/* Barra de forma — no se imprime (no es el último hijo) */}
              <div className="coti-form-bar">
                {/* Selector de tipo */}
                <div className="doc-tipo-tabs">
                  <button className={cotiData.tipo === 'cotizacion' ? 'active' : ''}
                    onClick={() => sd('tipo', 'cotizacion')}>
                    Cotización
                  </button>
                  <button className={cotiData.tipo === 'orden' ? 'active' : ''}
                    onClick={() => sd('tipo', 'orden')}>
                    Orden de trabajo
                  </button>
                </div>

                {/* Campos según tipo */}
                <div className="coti-form-fields">
                  <div className="field" style={{flex:2}}>
                    <label>{cotiData.tipo === 'cotizacion' ? 'Dirigido a (opcional)' : 'Cliente *'}</label>
                    <input value={cotiData.cliente}
                      onChange={e => sd('cliente', e.target.value)}
                      placeholder={cotiData.tipo === 'cotizacion' ? 'A Quien Corresponda' : 'Nombre del cliente'}
                      autoFocus />
                  </div>
                  {cotiData.tipo === 'cotizacion' ? (
                    <div className="field" style={{width:150}}>
                      <label>Vigencia (días)</label>
                      <input type="number" min="1" max="90" value={cotiData.validez}
                        onChange={e => sd('validez', parseInt(e.target.value) || 10)} />
                    </div>
                  ) : (
                    <>
                      <div className="field" style={{width:170}}>
                        <label>Fecha de entrega</label>
                        <input type="date" value={cotiData.fechaEntrega}
                          onChange={e => sd('fechaEntrega', e.target.value)} />
                      </div>
                      <div className="field" style={{flex:1}}>
                        <label>Responsable / operario</label>
                        <input value={cotiData.responsable}
                          onChange={e => sd('responsable', e.target.value)}
                          placeholder="Nombre del operario..." />
                      </div>
                    </>
                  )}
                </div>

                {cotiData.tipo === 'orden' && (
                  <div className="field">
                    <label>Especificaciones técnicas / observaciones</label>
                    <input value={cotiData.notas}
                      onChange={e => sd('notas', e.target.value)}
                      placeholder="Materiales, acabados, colores, instrucciones especiales..." />
                  </div>
                )}
              </div>

              {/* Documento imprimible — DEBE ser el último hijo del modal-body */}
              {cotiData.tipo === 'cotizacion' ? (
                <_CotiDoc
                  folio={folio}
                  fecha={cotiData.fecha}
                  cliente={cotiData.cliente}
                  validez={cotiData.validez}
                  items={items}
                  subtotal={subtotal}
                  discGlobal={globalDiscount}
                  discAmount={globalDiscAmount}
                  iva={iva}
                  total={total}
                />
              ) : (
                <_OrdenDoc
                  folio={folio}
                  fecha={cotiData.fecha}
                  fechaEntrega={cotiData.fechaEntrega}
                  responsable={cotiData.responsable}
                  cliente={cotiData.cliente}
                  notas={cotiData.notas}
                  items={items}
                  subtotal={subtotal}
                  discGlobal={globalDiscount}
                  discAmount={globalDiscAmount}
                  iva={iva}
                  total={total}
                />
              )}
            </div>
            <div className="cfg-modal-foot">
              <button className="cfg-btn-cancel" onClick={() => setShowCoti(false)}>Cerrar</button>
              <button className="cfg-btn-save" onClick={() => window.printSgiDoc('.coti-doc')}>
                <window.IconPrint size={15} /> Imprimir / Guardar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.Ticket = Ticket;
