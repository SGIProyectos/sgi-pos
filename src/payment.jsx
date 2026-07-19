// ========== PAYMENT MODAL ==========

function PaymentModal({ total, subtotal, iva, discount, items, onClose, onConfirm }) {
  const [method, setMethod] = React.useState('efectivo');
  const [cash, setCash] = React.useState(0);
  const [withInvoice, setWithInvoice] = React.useState(false);
  const [rfc, setRfc] = React.useState('');
  const [razonSocial, setRazonSocial] = React.useState('');
  const [emailFactura, setEmailFactura] = React.useState('');
  const [usoCfdi, setUsoCfdi] = React.useState('G03');
  // Concepto SPEI fijo por sesión de cobro (no debe cambiar entre renders)
  const [speiRef] = React.useState(() => 'SGI-' + Math.floor(Math.random() * 9000 + 1000));

  const change = window.round2(cash - total);
  const canConfirm = method === 'efectivo' ? window.round2(cash) >= window.round2(total)
    : method === 'transferencia' ? true
    : (rfc.length >= 10 && razonSocial.length > 2);

  const quickAmounts = [
    Math.ceil(total),
    Math.ceil(total / 100) * 100,
    Math.ceil(total / 100) * 100 + 100,
    Math.ceil(total / 500) * 500,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-left">
          <h2 className="modal-title">Cobro</h2>
          <div className="modal-sub">Selecciona método de pago</div>

          <div className="pay-methods">
            <div className={'pay-method' + (method === 'efectivo' ? ' active' : '')} onClick={() => setMethod('efectivo')}>
              <div className="pm-icon"><window.IconCash size={28} /></div>
              <div className="pm-name">Efectivo</div>
            </div>
            <div className={'pay-method' + (method === 'transferencia' ? ' active' : '')} onClick={() => setMethod('transferencia')}>
              <div className="pm-icon"><window.IconCard size={28} /></div>
              <div className="pm-name">Transferencia</div>
            </div>
            <div className={'pay-method' + (method === 'factura' ? ' active' : '')} onClick={() => { setMethod('factura'); setWithInvoice(true); }}>
              <div className="pm-icon"><window.IconReceipt size={28} /></div>
              <div className="pm-name">Factura</div>
            </div>
          </div>

          {method === 'efectivo' && (
            <>
              <div className="cash-quick">
                <button className="exact" onClick={() => setCash(total)}>Exacto</button>
                {quickAmounts.slice(0, 3).map((a, i) => (
                  <button key={i} onClick={() => setCash(a)}>${a.toLocaleString('es-MX')}</button>
                ))}
              </div>
              <input
                type="number" step="0.01"
                className="cash-input mono"
                value={cash || ''}
                onChange={e => setCash(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                autoFocus
              />
              {cash > 0 && (
                <div className="change-display" style={{background: change < 0 ? 'var(--magenta)' : 'var(--green)'}}>
                  <span className="cd-label">{change < 0 ? 'Falta' : 'Cambio'}</span>
                  <span className="cd-value mono">{window.fmt(Math.abs(change))}</span>
                </div>
              )}
            </>
          )}

          {method === 'transferencia' && (
            <div style={{padding:'24px', background:'white', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', textAlign:'center'}}>
              <div style={{width:160, height:160, margin:'0 auto 14px', background:`
                repeating-linear-gradient(0deg, var(--black) 0 6px, white 6px 12px),
                repeating-linear-gradient(90deg, var(--black) 0 6px, transparent 6px 12px)
              `, backgroundBlendMode:'difference', border:'4px solid var(--black)', borderRadius:'8px'}}></div>
              <div style={{fontWeight:700, fontSize:13, marginBottom:4}}>SGI Servicios Gráficos S.A.</div>
              <div style={{fontSize:12, color:'var(--text-2)'}}>BBVA · 0123 4567 8900 1234</div>
              <div style={{fontSize:11, color:'var(--text-3)', marginTop:8}}>Escanea QR o transfiere por SPEI</div>
              <div style={{marginTop:14, padding:'10px', background:'var(--bg)', borderRadius:6, fontSize:12}}>
                Concepto: <strong className="mono">{speiRef}</strong>
              </div>
            </div>
          )}

          {method === 'factura' && (
            <div className="invoice-form">
              <div className="field">
                <label>RFC</label>
                <input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" maxLength={13} />
              </div>
              <div className="field">
                <label>Razón social</label>
                <input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Nombre o empresa" />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Uso CFDI</label>
                  <select value={usoCfdi} onChange={e => setUsoCfdi(e.target.value)}>
                    <option value="G01">G01 — Adquisición de mercancías</option>
                    <option value="G03">G03 — Gastos en general</option>
                    <option value="P01">P01 — Por definir</option>
                  </select>
                </div>
                <div className="field">
                  <label>Email envío</label>
                  <input type="email" value={emailFactura} onChange={e => setEmailFactura(e.target.value)} placeholder="cliente@correo.com" />
                </div>
              </div>
              <div className="invoice-toggle">
                <div className={'toggle-switch on'}></div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600, fontSize:12}}>Pago en efectivo + factura</div>
                  <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>Se generará CFDI 4.0 al confirmar</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-right">
          <h4>Resumen del ticket</h4>
          <div className="modal-items">
            {items.map(it => {
              const lt = it.unitPrice * it.qty * (1 - (it.discount || 0)/100);
              return (
                <div key={it.id} className="modal-item">
                  <span className="mi-name">{it.qty}× {it.name}</span>
                  <span className="mi-price mono">{window.fmt(lt)}</span>
                </div>
              );
            })}
          </div>
          <div className="modal-summary-row"><span className="ms-l">Subtotal</span><span className="ms-v">{window.fmt(subtotal)}</span></div>
          {discount > 0 && <div className="modal-summary-row" style={{color:'#7fdca0'}}><span className="ms-l">Descuento</span><span className="ms-v">-{window.fmt(discount)}</span></div>}
          <div className="modal-summary-row"><span className="ms-l">IVA 16%</span><span className="ms-v">{window.fmt(iva)}</span></div>
          <div className="modal-summary-row total"><span className="ms-l">TOTAL</span><span className="ms-v">{window.fmt(total)}</span></div>

          <button className="modal-cta" disabled={!canConfirm} onClick={() => onConfirm({ method, cash, change, withInvoice: method === 'factura', rfc, razonSocial, emailFactura, usoCfdi })}>
            <window.IconCheck size={18} stroke={3} />
            Confirmar cobro
          </button>
          <button className="modal-cancel" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

window.PaymentModal = PaymentModal;
