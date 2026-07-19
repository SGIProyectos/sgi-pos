// ========== MÓDULO PEDIDOS Y SEGUIMIENTO ==========

const _PED_ESTADOS  = ['pendiente', 'en_proceso', 'listo', 'entregado', 'cancelado'];
const _PED_LABELS   = { pendiente:'Pendiente', en_proceso:'En proceso', listo:'Listo p/ entregar', entregado:'Entregado', cancelado:'Cancelado' };
const _PED_METODOS  = { efectivo:'Efectivo', transferencia:'Transferencia', tarjeta:'Tarjeta', cheque:'Cheque', otro:'Otro' };
const _PED_TIPOS_P  = { anticipo:'Anticipo', abono:'Abono', liquidacion:'Liquidación', otro:'Otro' };
// letras/neon/luces se conservan solo para mostrar pedidos históricos (módulos eliminados)
const _MOD_NAMES    = { copiado:'Copiado', granformato:'Gran Formato', bordado:'Bordado', materiales:'Materiales', letras:'Letras 3D', neon:'Neón', luces:'Luces LED' };

// ---- Helpers financieros ----
function _fin(ped) {
  const total    = ped.totalCotizado || ped.total || 0;
  const abonado  = (ped.abonos || []).reduce((s, a) => s + (a.monto || 0), 0);
  const saldo    = Math.max(0, total - abonado);
  const pct      = total > 0 ? Math.min(100, Math.round(abonado / total * 100)) : 0;
  const liquidado = saldo < 0.01;
  return { total, abonado, saldo, pct, liquidado };
}

function _urgCls(fechaEntrega, estado) {
  if (!fechaEntrega || estado === 'entregado' || estado === 'cancelado') return '';
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const dias = Math.ceil((new Date(fechaEntrega + 'T00:00:00') - hoy) / 86400000);
  if (dias < 0)  return 'ped-vencido';
  if (dias <= 2) return 'ped-urgente';
  return 'ped-ok';
}

function _urgTxt(fechaEntrega, estado) {
  if (!fechaEntrega) return 'Sin fecha';
  if (estado === 'entregado') return 'Entregado';
  if (estado === 'cancelado') return 'Cancelado';
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const dias = Math.ceil((new Date(fechaEntrega + 'T00:00:00') - hoy) / 86400000);
  if (dias < 0)  return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`;
  if (dias === 0) return 'Entrega HOY';
  if (dias === 1) return 'Entrega mañana';
  return `${dias} días`;
}

// ---- Modal de Abonos / Pagos ----
function _AbonosModal({ pedido, onClose, onSave }) {
  const [form,   setForm]   = React.useState({ monto:'', metodo:'efectivo', tipo:'anticipo', nota:'' });
  const [delAId, setDelAId] = React.useState(null);
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const abonos = pedido.abonos || [];
  const fin    = _fin(pedido);

  // Monto sugerido: anticipo 50% si no hay abonos; saldo si ya hay abonos previos
  const sugerido = abonos.length === 0
    ? Math.round(fin.total * ((pedido.anticipoPct || 50) / 100) * 100) / 100
    : fin.saldo;

  const registrar = () => {
    const monto = parseFloat(form.monto);
    if (!monto || monto <= 0) return;
    if (monto > fin.saldo + 0.01) {
      window.alert(`El pago de ${window.fmt(monto)} excede el saldo pendiente de ${window.fmt(fin.saldo)}. Ajusta el monto.`);
      return;
    }
    const nuevoAbono = { id: window.uid(), fecha: window.localISO(), monto, metodo: form.metodo, tipo: form.tipo, nota: form.nota };
    const newAbonos  = [...abonos, nuevoAbono];
    const newTotal   = newAbonos.reduce((s, a) => s + a.monto, 0);
    const realTotal  = fin.total;
    const estadoPago = newTotal >= realTotal - 0.01 ? 'liquidado' : newTotal > 0 ? 'con_anticipo' : 'sin_anticipo';
    onSave({ ...pedido, abonos: newAbonos, estadoPago });
    setForm({ monto:'', metodo:'efectivo', tipo:'abono', nota:'' });
  };

  const eliminarAbono = (id) => {
    const newAbonos  = abonos.filter(a => a.id !== id);
    const newTotal   = newAbonos.reduce((s, a) => s + a.monto, 0);
    const estadoPago = newTotal >= fin.total - 0.01 ? 'liquidado' : newTotal > 0 ? 'con_anticipo' : 'sin_anticipo';
    onSave({ ...pedido, abonos: newAbonos, estadoPago });
    setDelAId(null);
  };

  const pctColor = fin.pct >= 100 ? '#16a34a' : fin.pct >= 50 ? '#ea580c' : '#dc2626';

  return (
    <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal" style={{maxWidth:580}}>
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">Abonos · {pedido.ticketNum}{pedido.cliente ? ' — ' + pedido.cliente : ''}</span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18} /></button>
        </div>
        <div className="cfg-modal-body">

          {/* Resumen financiero */}
          <div className="abono-resumen">
            <div className="abono-res-trio">
              <div className="abono-res-item">
                <div className="abono-res-lbl">Total cotizado</div>
                <div className="abono-res-val mono">{window.fmt(fin.total)}</div>
              </div>
              <div className="abono-res-item ok">
                <div className="abono-res-lbl">Abonado</div>
                <div className="abono-res-val mono" style={{color:'#16a34a'}}>{window.fmt(fin.abonado)}</div>
              </div>
              <div className={'abono-res-item' + (fin.saldo > 0 ? ' warn' : ' done')}>
                <div className="abono-res-lbl">Saldo pendiente</div>
                <div className="abono-res-val mono" style={{color: fin.saldo > 0 ? '#dc2626' : '#16a34a'}}>
                  {fin.saldo > 0 ? window.fmt(fin.saldo) : '✅ Liquidado'}
                </div>
              </div>
            </div>
            <div className="abono-bar-wrap">
              <div className="abono-bar-fill" style={{width: fin.pct + '%', background: pctColor}} />
            </div>
            <div className="abono-bar-labels">
              <span style={{color: pctColor, fontWeight:700}}>{fin.pct}% abonado</span>
              {fin.pct < (pedido.anticipoPct || 50) && fin.saldo > 0 && (
                <span className="abono-aviso">
                  Anticipo mínimo sugerido ({pedido.anticipoPct || 50}%): {window.fmt(Math.round(fin.total * (pedido.anticipoPct||50) / 100 * 100)/100)}
                </span>
              )}
            </div>
          </div>

          {/* Historial de pagos */}
          {abonos.length > 0 && (
            <div style={{marginBottom:20}}>
              <div className="abono-section-title">Historial de pagos</div>
              <table className="cfg-table">
                <thead>
                  <tr><th>Fecha</th><th className="r">Monto</th><th>Método</th><th>Tipo</th><th>Nota</th><th></th></tr>
                </thead>
                <tbody>
                  {abonos.map(a => (
                    <tr key={a.id}>
                      <td className="mono">{a.fecha}</td>
                      <td className="mono r fw6">{window.fmt(a.monto)}</td>
                      <td className="muted">{_PED_METODOS[a.metodo] || a.metodo}</td>
                      <td><span className={'abono-tipo-badge abono-tipo-' + a.tipo}>{_PED_TIPOS_P[a.tipo] || a.tipo}</span></td>
                      <td className="muted" style={{maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{a.nota || '—'}</td>
                      <td className="cfg-row-actions">
                        {delAId === a.id ? (
                          <>
                            <button className="cfg-act danger" onClick={() => eliminarAbono(a.id)}>¿Eliminar?</button>
                            <button className="cfg-act" onClick={() => setDelAId(null)}>No</button>
                          </>
                        ) : (
                          <button className="cfg-act danger-soft" onClick={() => setDelAId(a.id)} title="Eliminar">
                            <window.IconTrash size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Formulario de nuevo pago */}
          {fin.saldo > 0 ? (
            <div>
              <div className="abono-section-title">Registrar nuevo pago</div>
              <div className="abono-form-grid">
                <div className="field" style={{gridColumn:'1/-1'}}>
                  <label>
                    Monto a recibir *
                    {sugerido > 0 && (
                      <button className="abono-sug-btn"
                        onClick={() => sf('monto', String(sugerido))}>
                        Usar sugerido: {window.fmt(sugerido)}
                      </button>
                    )}
                  </label>
                  <div className="suffix-input">
                    <input type="number" min="0.01" step="0.01" value={form.monto}
                      onChange={e => sf('monto', e.target.value)}
                      placeholder="0.00" autoFocus />
                    <span className="suffix">MXN</span>
                  </div>
                </div>
                <div className="field">
                  <label>Método de pago</label>
                  <select value={form.metodo} onChange={e => sf('metodo', e.target.value)}>
                    {Object.entries(_PED_METODOS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Tipo de pago</label>
                  <select value={form.tipo} onChange={e => sf('tipo', e.target.value)}>
                    <option value="anticipo">Anticipo (primer pago)</option>
                    <option value="abono">Abono parcial</option>
                    <option value="liquidacion">Liquidación — pago final</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div className="field" style={{gridColumn:'1/-1'}}>
                  <label>Nota / referencia</label>
                  <input value={form.nota} onChange={e => sf('nota', e.target.value)}
                    placeholder="Ej: Transferencia SPEI, folio 123…" />
                </div>
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', marginTop:14}}>
                <button className="cfg-btn-save"
                  disabled={!form.monto || parseFloat(form.monto) <= 0}
                  onClick={registrar}>
                  <window.IconCheck size={15} /> Registrar pago
                </button>
              </div>
            </div>
          ) : (
            <div className="abono-liquidado-msg">
              ✅ Pedido completamente liquidado — saldo en cero
            </div>
          )}
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ---- Modal: nuevo pedido manual (desde cotización aprobada) ----
function _NuevoPedidoModal({ onClose, onSave }) {
  const hoy = window.localISO();
  const [form, setForm] = React.useState({
    ticketNum: '', cliente: '', modulo: 'copiado',
    totalCotizado: '', anticipoPct: 50,
    fechaEntrega: '', tiempoElaboracion: '5', notas: '', estado: 'pendiente',
  });
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const totalNum   = parseFloat(form.totalCotizado) || 0;
  const anticipoAmt = Math.round(totalNum * form.anticipoPct / 100 * 100) / 100;

  const save = () => {
    if (!form.cliente || !form.totalCotizado) return;
    const pedido = {
      id:                window.uid(),
      ticketNum:         form.ticketNum.trim() || `PED-${Date.now().toString(36).toUpperCase().slice(-5)}`,
      modulo:            form.modulo,
      items:             [],
      total:             totalNum,
      totalCotizado:     totalNum,
      anticipoPct:       form.anticipoPct,
      abonos:            [],
      estadoPago:        'sin_anticipo',
      fecha:             hoy,
      estado:            form.estado,
      cliente:           form.cliente,
      fechaEntrega:      form.fechaEntrega,
      tiempoElaboracion: parseInt(form.tiempoElaboracion) || 0,
      notas:             form.notas,
    };
    onSave(pedido);
  };

  return (
    <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal" style={{maxWidth:520}}>
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">Nuevo pedido — desde cotización autorizada</span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18} /></button>
        </div>
        <div className="cfg-modal-body">
          <div className="cfg-form-grid">
            <div className="field">
              <label>N° de cotización / referencia</label>
              <input value={form.ticketNum} onChange={e => sf('ticketNum', e.target.value)}
                placeholder="Ej: COT-2026-001" autoFocus />
            </div>
            <div className="field">
              <label>Módulo / tipo de trabajo</label>
              <select value={form.modulo} onChange={e => sf('modulo', e.target.value)}>
                {(window.MODULES || []).filter(m => !m.admin).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Nombre del cliente *</label>
              <input value={form.cliente} onChange={e => sf('cliente', e.target.value)}
                placeholder="Nombre completo del cliente" />
            </div>
            <div className="field">
              <label>Total cotizado *</label>
              <div className="suffix-input">
                <input type="number" min="0" step="100" value={form.totalCotizado}
                  onChange={e => sf('totalCotizado', e.target.value)} placeholder="0.00" />
                <span className="suffix">MXN</span>
              </div>
            </div>
            <div className="field">
              <label>Anticipo sugerido (%)</label>
              <div className="suffix-input">
                <input type="number" min="10" max="100" step="5" value={form.anticipoPct}
                  onChange={e => sf('anticipoPct', parseInt(e.target.value) || 50)} />
                <span className="suffix">%</span>
              </div>
            </div>
            {anticipoAmt > 0 && (
              <div className="field" style={{gridColumn:'1/-1'}}>
                <div className="abono-aviso" style={{margin:0}}>
                  Anticipo a solicitar: <strong>{window.fmt(anticipoAmt)}</strong>
                  {' '}— Saldo al entregar: <strong>{window.fmt(totalNum - anticipoAmt)}</strong>
                </div>
              </div>
            )}
            <div className="field">
              <label>Fecha de entrega comprometida</label>
              <input type="date" value={form.fechaEntrega} min={hoy}
                onChange={e => sf('fechaEntrega', e.target.value)} />
            </div>
            <div className="field">
              <label>Días de elaboración</label>
              <input type="number" min="1" value={form.tiempoElaboracion}
                onChange={e => sf('tiempoElaboracion', e.target.value)} />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Descripción / notas técnicas</label>
              <textarea value={form.notas} onChange={e => sf('notas', e.target.value)}
                placeholder="Describe el trabajo: materiales, dimensiones, colores, especificaciones..."
                style={{minHeight:80, resize:'vertical', width:'100%', padding:'8px',
                  border:'1px solid var(--border)', borderRadius:'var(--radius)',
                  fontFamily:'inherit', fontSize:'inherit'}} />
            </div>
          </div>
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="cfg-btn-save" disabled={!form.cliente || !form.totalCotizado} onClick={save}>
            <window.IconCheck size={15} /> Crear pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Modal editar pedido ----
function _PedidoEditModal({ pedido, onClose, onSave }) {
  const [form, setForm] = React.useState({ ...pedido, totalCotizado: String(pedido.totalCotizado || pedido.total || ''), anticipoPct: pedido.anticipoPct || 50 });
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal" style={{maxWidth:520}}>
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">Editar pedido · {form.ticketNum}</span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18} /></button>
        </div>
        <div className="cfg-modal-body">
          <div className="cfg-form-grid">
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Cliente</label>
              <input value={form.cliente || ''} onChange={e => sf('cliente', e.target.value)}
                placeholder="Nombre del cliente" autoFocus />
            </div>
            <div className="field">
              <label>Total cotizado</label>
              <div className="suffix-input">
                <input type="number" min="0" step="100" value={form.totalCotizado}
                  onChange={e => sf('totalCotizado', e.target.value)} />
                <span className="suffix">MXN</span>
              </div>
            </div>
            <div className="field">
              <label>Anticipo sugerido (%)</label>
              <div className="suffix-input">
                <input type="number" min="10" max="100" step="5" value={form.anticipoPct}
                  onChange={e => sf('anticipoPct', parseInt(e.target.value) || 50)} />
                <span className="suffix">%</span>
              </div>
            </div>
            <div className="field">
              <label>Estado del trabajo</label>
              <select value={form.estado} onChange={e => sf('estado', e.target.value)}>
                {_PED_ESTADOS.map(e => <option key={e} value={e}>{_PED_LABELS[e]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Fecha de entrega</label>
              <input type="date" value={form.fechaEntrega || ''}
                onChange={e => sf('fechaEntrega', e.target.value)} />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Notas / especificaciones técnicas</label>
              <textarea value={form.notas || ''} onChange={e => sf('notas', e.target.value)}
                placeholder="Materiales, dimensiones, colores, acuerdos..."
                style={{minHeight:80, resize:'vertical', width:'100%', padding:'8px',
                  border:'1px solid var(--border)', borderRadius:'var(--radius)',
                  fontFamily:'inherit', fontSize:'inherit'}} />
            </div>
          </div>
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="cfg-btn-save" onClick={() => onSave({ ...form, totalCotizado: parseFloat(form.totalCotizado) || form.total || 0 })}>
            <window.IconCheck size={15} /> Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Carta de Recepción-Conformidad (documento imprimible) ----
function _CartaConformidadDoc({ pedido }) {
  const neg  = window.NEGOCIO || {};
  const hoy  = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' });
  const folio = `RC-${pedido.ticketNum || 'S/N'}`;
  const fin   = _fin(pedido);
  const isLuminoso = ['letras', 'neon'].includes(pedido.modulo);
  const modNombre  = { copiado:'Servicios de Copiado e Impresión', granformato:'Impresión Gran Formato', bordado:'Bordado Industrial / Uniformes', letras:'Letras 3D y Anuncios Luminosos', neon:'Anuncios de Neón / LED' }[pedido.modulo] || 'Servicios Gráficos';

  return (
    <div className="coti-doc">
      <div className="coti-hdr">
        <div className="coti-biz-block">
          <div className="coti-biz-name">{neg.nombre || 'Servicios Gráficos de Impresión'}</div>
          {neg.rfc       && <div className="coti-biz-line">RFC: {neg.rfc}</div>}
          {neg.direccion && <div className="coti-biz-line">{neg.direccion}{neg.colonia ? ', '+neg.colonia : ''}</div>}
          {(neg.ciudad || neg.estado) && <div className="coti-biz-line">{[neg.ciudad, neg.estado, neg.cp].filter(Boolean).join(', ')}</div>}
          {neg.telefono  && <div className="coti-biz-line">Tel: {neg.telefono}</div>}
          {neg.email     && <div className="coti-biz-line">{neg.email}</div>}
        </div>
        <div className="coti-folio-block">
          <div className="coti-doc-tipo">ACTA DE RECEPCIÓN<br/>Y CONFORMIDAD</div>
          <div className="coti-folio-num">{folio}</div>
          <div className="coti-folio-date">Fecha: {hoy}</div>
        </div>
      </div>
      <div className="coti-hr" />
      <div className="coti-saludo">
        <div className="coti-dest">{pedido.cliente ? `Estimado(a): ${pedido.cliente}` : 'A Quien Corresponda:'}</div>
        <p className="coti-intro">
          Por medio del presente documento se hace constar que el trabajo solicitado ha sido concluido
          satisfactoriamente y entregado al cliente que suscribe, de acuerdo con las especificaciones
          y condiciones pactadas al momento de la contratación.
        </p>
      </div>

      <div className="coti-cond-title" style={{marginTop:20}}>DATOS GENERALES DEL PEDIDO</div>
      <div className="ped-conf-grid">
        <div className="ped-conf-cell"><span className="ped-conf-lbl">N° de orden</span><span className="ped-conf-val mono">{pedido.ticketNum}</span></div>
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Tipo de trabajo</span><span className="ped-conf-val">{modNombre}</span></div>
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Fecha de pedido</span><span className="ped-conf-val mono">{pedido.fecha || '—'}</span></div>
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Fecha de entrega</span><span className="ped-conf-val mono">{pedido.fechaEntrega || hoy}</span></div>
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Cliente</span><span className="ped-conf-val">{pedido.cliente || 'Mostrador'}</span></div>
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Total cotizado</span><span className="ped-conf-val mono">{window.fmt(fin.total)}</span></div>
      </div>

      {/* Resumen financiero en la carta */}
      <div className="coti-cond-title" style={{marginTop:16}}>ESTADO DE CUENTA DEL PEDIDO</div>
      <div className="ped-conf-grid">
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Total cotizado</span><span className="ped-conf-val mono">{window.fmt(fin.total)}</span></div>
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Total recibido</span><span className="ped-conf-val mono">{window.fmt(fin.abonado)}</span></div>
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Saldo pendiente</span><span className="ped-conf-val mono" style={{color: fin.saldo > 0 ? '#dc2626' : '#16a34a'}}>{fin.saldo > 0 ? window.fmt(fin.saldo) : '$ 0.00 — LIQUIDADO'}</span></div>
        <div className="ped-conf-cell"><span className="ped-conf-lbl">Estado de pago</span><span className="ped-conf-val">{fin.liquidado ? 'Liquidado' : `${fin.pct}% abonado`}</span></div>
      </div>

      {/* Historial de abonos en la carta */}
      {(pedido.abonos || []).length > 0 && (
        <>
          <div className="coti-cond-title" style={{marginTop:16}}>HISTORIAL DE PAGOS RECIBIDOS</div>
          <table className="coti-table">
            <thead>
              <tr><th className="al">#</th><th className="al">Fecha</th><th className="al">Tipo</th><th className="al">Método</th><th className="ar">Monto</th></tr>
            </thead>
            <tbody>
              {pedido.abonos.map((a, i) => (
                <tr key={a.id}>
                  <td className="coti-n">{i+1}</td>
                  <td className="mono">{a.fecha}</td>
                  <td>{_PED_TIPOS_P[a.tipo] || a.tipo}</td>
                  <td>{_PED_METODOS[a.metodo] || a.metodo}{a.nota ? ' — ' + a.nota : ''}</td>
                  <td className="ar mono coti-imp">{window.fmt(a.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Trabajos realizados */}
      {pedido.items && pedido.items.length > 0 && (
        <>
          <div className="coti-cond-title" style={{marginTop:16}}>DESCRIPCIÓN DE TRABAJOS REALIZADOS</div>
          <table className="coti-table">
            <thead>
              <tr><th className="al coti-n-hd">#</th><th className="al">Descripción</th><th className="ar">Cant.</th><th className="ar">Importe</th></tr>
            </thead>
            <tbody>
              {pedido.items.map((it, i) => {
                const base = (it.unitPrice||0)*(it.qty||1);
                const dsc  = it.discount ? base*it.discount/100 : 0;
                return (
                  <tr key={i}>
                    <td className="coti-n">{i+1}</td>
                    <td>
                      <div className="coti-iname">{it.name}</div>
                      {it.meta && it.meta.length > 0 && <div className="coti-imeta">{it.meta.join(' · ')}</div>}
                    </td>
                    <td className="ar mono">{it.qty||1}</td>
                    <td className="ar mono coti-imp">{window.fmt(base-dsc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Notas / especificaciones */}
      {pedido.notas && (
        <>
          <div className="coti-cond-title" style={{marginTop:16}}>{isLuminoso ? 'ESPECIFICACIONES TÉCNICAS' : 'OBSERVACIONES'}</div>
          <div className="ped-conf-nota">{pedido.notas}</div>
        </>
      )}

      {/* Verificación para luminosos */}
      {isLuminoso && (
        <>
          <div className="coti-cond-title" style={{marginTop:16}}>VERIFICACIÓN DE FUNCIONAMIENTO</div>
          <div className="ped-check-list">
            {['Se realizaron pruebas de encendido y funcionamiento de la iluminación LED / neón.','Se verificó la uniformidad del brillo y distribución de luz en toda la superficie.','Se comprobó el correcto funcionamiento de la fuente de poder / transformador.','Se revisó la hermeticidad y protección de conexiones eléctricas (IP65 donde aplique).','El anuncio fue instalado y nivelado conforme a las indicaciones del cliente.','Se entregaron instrucciones básicas de uso, mantenimiento y cuidados al cliente.'].map((item, i) => (
              <div key={i} className="ped-check-row"><span className="ped-check-box">☑</span><span>{item}</span></div>
            ))}
          </div>
        </>
      )}

      <div className="coti-hr" style={{marginTop:20}} />
      <div className="coti-condiciones">
        <div className="coti-cond-title">TÉRMINOS Y CONDICIONES DE ENTREGA</div>
        <ul className="coti-cond-list">
          {isLuminoso ? (
            <>
              <li>El anuncio luminoso cuenta con garantía de <strong>6 meses</strong> en materiales y mano de obra a partir de la fecha de entrega indicada en el presente documento.</li>
              <li>La garantía cubre defectos de fabricación, fallas en iluminación LED y conexiones eléctricas realizadas por el proveedor.</li>
              <li>La garantía no aplica a daños por mal uso, vandalismo, exposición a agentes externos fuera de especificación, o modificaciones por terceros.</li>
              <li>Para hacer válida la garantía, comunicarse con anticipación al número de contacto del proveedor.</li>
            </>
          ) : (
            <>
              <li>El trabajo ha sido revisado y aprobado por el cliente al momento de la recepción y firma del presente documento.</li>
              <li>Una vez firmada esta acta, no se aceptarán reclamaciones sobre acabados, colores o especificaciones previamente aprobadas.</li>
              <li>Defectos de fabricación deben notificarse dentro de las <strong>72 horas</strong> siguientes a la recepción.</li>
            </>
          )}
          {fin.saldo > 0 && <li style={{color:'#dc2626'}}><strong>Saldo pendiente de pago: {window.fmt(fin.saldo)}.</strong> El cliente se compromete a liquidar el saldo en el plazo acordado.</li>}
          <li>El proveedor queda exento de responsabilidad una vez firmada la presente acta de recepción conforme.</li>
        </ul>
      </div>

      <div className="coti-firmas">
        <div className="coti-firma">
          <div className="coti-firma-line" />
          <div className="coti-firma-nombre">{neg.nombre || 'Servicios Gráficos de Impresión'}</div>
          <div className="coti-firma-rol">Proveedor — Entrega conforme</div>
        </div>
        <div className="coti-firma">
          <div className="coti-firma-line" />
          <div className="coti-firma-nombre">{pedido.cliente || 'Nombre del cliente'}</div>
          <div className="coti-firma-rol">Cliente — Recibe y acepta conforme</div>
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

function _CartaConformidadModal({ pedido, onClose }) {
  return (
    <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal coti-modal">
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">Acta de Recepción-Conformidad · {pedido.ticketNum}</span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18} /></button>
        </div>
        <div className="cfg-modal-body">
          <div style={{padding:'4px 0 12px', fontSize:'0.8rem', color:'var(--text-3)'}}>
            Vista previa — haz clic en "Imprimir / PDF" para generar el documento final.
          </div>
          <_CartaConformidadDoc pedido={pedido} />
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cerrar</button>
          <button className="cfg-btn-save" onClick={() => window.printSgiDoc('.coti-doc')}>
            <window.IconPrint size={15} /> Imprimir / Guardar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Módulo principal ----
function ModulePedidos() {
  const [pedidos,   setPedidos]   = React.useState(() => [...(window.PEDIDOS_LIST || [])]);
  const [filtro,    setFiltro]    = React.useState('activos');
  const [editForm,  setEditForm]  = React.useState(null);
  const [abonosFor, setAbonosFor] = React.useState(null);
  const [cartaFor,  setCartaFor]  = React.useState(null);
  const [nuevoOpen, setNuevoOpen] = React.useState(false);
  const [delId,     setDelId]     = React.useState(null);
  const [toast,     setToast]     = React.useState(null);

  const toastTimer = React.useRef(null);
  const showToast = msg => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };
  const refresh   = list => setPedidos([...list]);

  const saveItem = (form) => {
    // Si cambió el total cotizado, el estado de pago debe recalcularse
    // contra los abonos ya registrados
    const total      = form.totalCotizado || form.total || 0;
    const abonado    = (form.abonos || []).reduce((s, a) => s + (a.monto || 0), 0);
    const estadoPago = (total > 0 && abonado >= total - 0.01) ? 'liquidado'
                     : abonado > 0 ? 'con_anticipo' : 'sin_anticipo';
    const fixed = { ...form, estadoPago };
    refresh(window.savePedido(fixed));
    setEditForm(null);
    setAbonosFor(prev => prev ? fixed : null); // actualizar si abonos está abierto
    showToast('Pedido actualizado');
  };

  const saveAbonos = (updated) => {
    const list = window.savePedido(updated);
    refresh(list);
    // Refrescar el pedido abierto en el modal de abonos
    setAbonosFor(updated);
    const msg = updated.estadoPago === 'liquidado' ? '✅ Pedido liquidado — saldo en cero' : 'Pago registrado';
    showToast(msg);
  };

  const delItem = id => {
    refresh(window.deletePedido(id));
    setDelId(null);
    showToast('Pedido eliminado');
  };

  const changeEstado = (id, estado) => {
    const p = pedidos.find(x => x.id === id);
    if (!p) return;
    if (estado === 'entregado') {
      const fin = _fin(p);
      if (fin.saldo > 0.01) {
        const ok = window.confirm(
          `⚠️ Este pedido tiene un SALDO PENDIENTE de ${window.fmt(fin.saldo)}.\n\n` +
          `Total: ${window.fmt(fin.total)} · Abonado: ${window.fmt(fin.abonado)}\n\n` +
          `¿Entregar de todas formas sin cobrar el saldo?`
        );
        if (!ok) { setAbonosFor(p); return; }
      }
    }
    refresh(window.savePedido({ ...p, estado }));
  };

  const hoy = new Date(); hoy.setHours(0,0,0,0);

  const vencidos = pedidos.filter(p =>
    p.fechaEntrega && p.estado !== 'entregado' && p.estado !== 'cancelado' &&
    new Date(p.fechaEntrega + 'T00:00:00') < hoy
  );
  const urgentes = pedidos.filter(p => {
    if (!p.fechaEntrega || p.estado === 'entregado' || p.estado === 'cancelado') return false;
    const d = Math.ceil((new Date(p.fechaEntrega + 'T00:00:00') - hoy) / 86400000);
    return d >= 0 && d <= 2;
  });
  const activos = pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado');

  // Total saldo por cobrar (pedidos activos)
  const totalPorCobrar = activos.reduce((s, p) => s + _fin(p).saldo, 0);
  const totalCobrado   = activos.reduce((s, p) => s + _fin(p).abonado, 0);

  const visible =
    filtro === 'activos'    ? activos :
    filtro === 'entregados' ? pedidos.filter(p => p.estado === 'entregado') :
    pedidos;

  const sorted = [...visible].sort((a, b) => {
    const da = a.fechaEntrega ? new Date(a.fechaEntrega).getTime() : Infinity;
    const db = b.fechaEntrega ? new Date(b.fechaEntrega).getTime() : Infinity;
    return da - db;
  });

  return (
    <div className="cfg-module">
      <div className="module-header">
        <div className="module-title">
          <div className="mt-icon" style={{background:'var(--orange-soft)', color:'var(--orange)'}}>
            <window.IconNote size={20} />
          </div>
          <div>
            <h1>Pedidos y Seguimiento</h1>
            <div className="mt-sub">Anticipos · Abonos · Saldo por cobrar · Fechas de entrega</div>
          </div>
        </div>
        <button className="cfg-btn-add" onClick={() => setNuevoOpen(true)} style={{marginRight:24}}>
          <window.IconPlus size={15} /> Nuevo pedido
        </button>
      </div>

      {/* Tarjetas de resumen */}
      <div className="ped-summary-row" style={{gridTemplateColumns:'repeat(6,1fr)'}}>
        <div className="ped-sum-card">
          <div className="ped-sum-num">{activos.length}</div>
          <div className="ped-sum-lbl">Pedidos activos</div>
        </div>
        <div className={'ped-sum-card' + (vencidos.length > 0 ? ' ped-sum-venc' : '')}>
          <div className="ped-sum-num">{vencidos.length}</div>
          <div className="ped-sum-lbl">Vencidos</div>
        </div>
        <div className={'ped-sum-card' + (urgentes.length > 0 ? ' ped-sum-urg' : '')}>
          <div className="ped-sum-num">{urgentes.length}</div>
          <div className="ped-sum-lbl">Urgentes ≤2d</div>
        </div>
        <div className="ped-sum-card">
          <div className="ped-sum-num">{pedidos.filter(p => p.estado==='entregado').length}</div>
          <div className="ped-sum-lbl">Entregados</div>
        </div>
        <div className="ped-sum-card ped-sum-cobrar">
          <div className="ped-sum-num ped-sum-num-sm">{window.fmt(totalCobrado)}</div>
          <div className="ped-sum-lbl">Abonado (activos)</div>
        </div>
        <div className={'ped-sum-card ped-sum-cobrar' + (totalPorCobrar > 0 ? ' ped-sum-urg' : '')}>
          <div className="ped-sum-num ped-sum-num-sm">{window.fmt(totalPorCobrar)}</div>
          <div className="ped-sum-lbl">Por cobrar</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="cfg-tabs" style={{marginBottom:0}}>
        {[['activos','Activos'],['todos','Todos'],['entregados','Entregados']].map(([f,l]) => (
          <button key={f} className={'cfg-tab-btn'+(filtro===f?' active':'')} onClick={() => setFiltro(f)}>{l}</button>
        ))}
      </div>

      <div className="cfg-body">
        {sorted.length === 0 ? (
          <div style={{textAlign:'center', padding:'60px 0', color:'var(--text-3)'}}>
            <window.IconNote size={40} />
            <div style={{marginTop:12, fontSize:'1rem'}}>No hay pedidos en esta vista</div>
            <div style={{fontSize:'0.85rem', marginTop:6}}>
              Usa "Nuevo pedido" para registrar una cotización autorizada, o el sistema los crea al cobrar.
            </div>
          </div>
        ) : (
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Ticket/Ref</th>
                <th>Cliente</th>
                <th>Módulo</th>
                <th>F. Entrega</th>
                <th>Urgencia</th>
                <th className="r">Total</th>
                <th>Pagos</th>
                <th>Estado trabajo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const fin = _fin(p);
                const uc  = _urgCls(p.fechaEntrega, p.estado);
                const pctColor = fin.pct >= 100 ? '#16a34a' : fin.pct >= 50 ? '#ea580c' : '#dc2626';
                return (
                  <tr key={p.id}
                    className={uc==='ped-vencido'?'ped-row-venc':uc==='ped-urgente'?'ped-row-urg':''}>
                    <td className="mono fw6">{p.ticketNum}</td>
                    <td>{p.cliente || <span className="muted">—</span>}</td>
                    <td><span className={'tag module '+(p.modulo||'')}>{_MOD_NAMES[p.modulo] || p.modulo}</span></td>
                    <td className="mono" style={{whiteSpace:'nowrap'}}>
                      {p.fechaEntrega || <span className="muted">—</span>}
                    </td>
                    <td>
                      {p.fechaEntrega && p.estado !== 'entregado' && p.estado !== 'cancelado' && (
                        <span className={'ped-urg-badge '+uc}>{_urgTxt(p.fechaEntrega, p.estado)}</span>
                      )}
                    </td>
                    <td className="r mono">{window.fmt(fin.total)}</td>
                    <td>
                      <div className="ped-fin-cell">
                        <div className="ped-fin-bar-wrap">
                          <div className="ped-fin-bar" style={{width:fin.pct+'%', background:pctColor}} />
                        </div>
                        <div className="ped-fin-nums">
                          <span style={{color:pctColor, fontWeight:700, fontSize:'0.75rem'}}>{fin.pct}%</span>
                          {fin.saldo > 0
                            ? <span className="muted" style={{fontSize:'0.72rem'}}>Saldo: {window.fmt(fin.saldo)}</span>
                            : <span style={{color:'#16a34a', fontSize:'0.72rem'}}>✅ Liquidado</span>
                          }
                        </div>
                        <button className="ped-abono-btn" onClick={() => setAbonosFor(p)}
                          title="Ver abonos y registrar pagos">
                          {fin.liquidado ? '✅' : '💰'} Abonos
                        </button>
                      </div>
                    </td>
                    <td>
                      <select className={'ped-estado-sel ped-estado-'+p.estado} value={p.estado}
                        onChange={e => changeEstado(p.id, e.target.value)}>
                        {_PED_ESTADOS.map(e => <option key={e} value={e}>{_PED_LABELS[e]}</option>)}
                      </select>
                    </td>
                    <td className="cfg-row-actions">
                      <button className="cfg-act" title="Acta de recepción" style={{color:'var(--orange)'}}
                        onClick={() => setCartaFor(p)}>
                        <window.IconPrint size={14} />
                      </button>
                      <button className="cfg-act" title="Editar" onClick={() => setEditForm({...p})}>
                        <window.IconEdit size={14} />
                      </button>
                      {delId === p.id ? (
                        <>
                          <button className="cfg-act danger" onClick={() => delItem(p.id)}>¿Eliminar?</button>
                          <button className="cfg-act" onClick={() => setDelId(null)}>No</button>
                        </>
                      ) : (
                        <button className="cfg-act danger-soft" title="Eliminar" onClick={() => setDelId(p.id)}>
                          <window.IconTrash size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {nuevoOpen && (
        <_NuevoPedidoModal onClose={() => setNuevoOpen(false)}
          onSave={p => { refresh(window.savePedido(p)); setNuevoOpen(false); showToast('Pedido creado'); }} />
      )}
      {editForm  && <_PedidoEditModal pedido={editForm}  onClose={() => setEditForm(null)}  onSave={saveItem} />}
      {abonosFor && <_AbonosModal     pedido={abonosFor} onClose={() => setAbonosFor(null)} onSave={saveAbonos} />}
      {cartaFor  && <_CartaConformidadModal pedido={cartaFor} onClose={() => setCartaFor(null)} />}

      {toast && (
        <div className="toast success">
          <span className="toast-icon"><window.IconCheck size={16} stroke={3} /></span>
          {toast}
        </div>
      )}
    </div>
  );
}

window.ModulePedidos = ModulePedidos;
