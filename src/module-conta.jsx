// ========== MÓDULO CONTABILIDAD RESICO ==========

// ---- Constantes y helpers ----

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const RESICO_TABLA = [
  { max:25000,    rate:0.0100, pct:'1.00%',  label:'Hasta $25,000' },
  { max:50000,    rate:0.0110, pct:'1.10%',  label:'$25,001 – $50,000' },
  { max:83333,    rate:0.0150, pct:'1.50%',  label:'$50,001 – $83,333' },
  { max:208333,   rate:0.0200, pct:'2.00%',  label:'$83,334 – $208,333' },
  { max:416667,   rate:0.0250, pct:'2.50%',  label:'$208,334 – $416,667' },
  { max:708333,   rate:0.0300, pct:'3.00%',  label:'$416,668 – $708,333' },
  { max:1000000,  rate:0.0400, pct:'4.00%',  label:'$708,334 – $1,000,000' },
  { max:1250000,  rate:0.0500, pct:'5.00%',  label:'$1,000,001 – $1,250,000' },
  { max:1500000,  rate:0.0600, pct:'6.00%',  label:'$1,250,001 – $1,500,000' },
  { max:2083333,  rate:0.0700, pct:'7.00%',  label:'$1,500,001 – $2,083,333' },
  { max:3500000,  rate:0.0900, pct:'9.00%',  label:'$2,083,334 – $3,500,000' },
  { max:5000000,  rate:0.1100, pct:'11.00%', label:'$3,500,001 – $5,000,000' },
  { max:7083333,  rate:0.1300, pct:'13.00%', label:'$5,000,001 – $7,083,333' },
  { max:Infinity, rate:0.1500, pct:'15.00%', label:'Más de $7,083,333' },
];

function calcISR(base) {
  const b = RESICO_TABLA.find(r => base <= r.max) || RESICO_TABLA[RESICO_TABLA.length - 1];
  return { rate: b.rate, pct: b.pct, isr: window.round2(base * b.rate), label: b.label };
}

function fDate(iso) {
  if (!iso) return '—';
  const parts = iso.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function inPeriod(fecha, year, month) {
  if (!fecha) return false;
  const parts = fecha.split('-').map(Number);
  return parts[0] === year && parts[1] === month;
}

function sumField(arr, field) {
  return window.round2(arr.reduce((s, x) => s + (Number(x[field]) || 0), 0));
}

// Base gravable de una venta POS: monto cobrado SIN IVA (total incluye IVA)
function sumBaseSinIva(salesArr) {
  return window.round2(salesArr.reduce((s, x) => s + ((Number(x.total) || 0) - (Number(x.iva) || 0)), 0));
}

function nextFolio(list) {
  const max = list.reduce((acc, c) => {
    const n = parseInt((c.folio || '').replace(/\D/g, ''), 10) || 0;
    return n > acc ? n : acc;
  }, 0);
  return 'F-' + String(max + 1).padStart(3, '0');
}

// ---- KPI Card ----
function KpiCard({ label, value, sub, color, icon: Ico }) {
  return (
    <div className={'kpi-card ' + (color || 'orange')}>
      <div className="kpi-label">
        {Ico && <Ico size={13} />}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ---- Period Selector ----
function PeriodSelector({ year, month, onYear, onMonth }) {
  const cy = new Date().getFullYear();
  const years = [cy - 2, cy - 1, cy, cy + 1];
  return (
    <div className="conta-period-bar">
      <span className="conta-period-label">Período</span>
      <select value={year} onChange={e => onYear(Number(e.target.value))}>
        {years.map(y => <option key={y}>{y}</option>)}
      </select>
      <select value={month} onChange={e => onMonth(Number(e.target.value))}>
        {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
      </select>
    </div>
  );
}

// =====================================================
// TAB 1: INGRESOS DEL PERÍODO
// =====================================================
function ContaIngresos({ sales, cfdis, year, month }) {
  const salesPeriod = sales.filter(s => inPeriod(s.fecha, year, month));

  const efectivo   = sumField(salesPeriod.filter(s => s.method === 'efectivo'), 'total');
  const transfer   = sumField(salesPeriod.filter(s => s.method === 'transfer'), 'total');

  const cfdisPeriod  = cfdis.filter(c => inPeriod(c.fecha, year, month) && c.estado === 'pagado');
  const cfdiTotal    = sumField(cfdisPeriod, 'subtotal');
  const cfdiPendiente = sumField(cfdis.filter(c => inPeriod(c.fecha, year, month) && c.estado === 'pendiente'), 'total');

  // Base ISR sin IVA: las ventas POS traen IVA incluido en `total`, los CFDI ya usan subtotal.
  // Las ventas con factura NO se suman aquí: entran por su CFDI (evita doble conteo)
  const basePOS = sumBaseSinIva(salesPeriod.filter(s => s.method === 'efectivo' || s.method === 'transfer'));
  const baseISR = window.round2(basePOS + cfdiTotal);
  const { isr, pct, label } = calcISR(baseISR);

  const byModule = {};
  salesPeriod.forEach(s => {
    byModule[s.module] = (byModule[s.module] || 0) + (s.total || 0);
  });

  return (
    <>
      <div className="kpi-row">
        <KpiCard color="orange" label="Efectivo (sin factura)"
          value={window.fmt(efectivo)}
          sub={salesPeriod.filter(s=>s.method==='efectivo').length + ' ventas'}
          icon={window.IconCash} />
        <KpiCard color="cyan" label="Transferencias"
          value={window.fmt(transfer)}
          sub={salesPeriod.filter(s=>s.method==='transfer').length + ' ventas'}
          icon={window.IconCard} />
        <KpiCard color="magenta" label="Facturado cobrado (CFDI)"
          value={window.fmt(cfdiTotal)}
          sub={cfdisPeriod.length + ' facturas pagadas'}
          icon={window.IconReceipt} />
        <KpiCard color="green" label="Total del período"
          value={window.fmt(baseISR)}
          sub="Base para ISR RESICO"
          icon={window.IconHash} />
      </div>

      <div className="kpi-row cols-3">
        <KpiCard color="black" label="ISR RESICO estimado"
          value={window.fmt(isr)}
          sub={'Tasa ' + pct + ' · ' + label}
          icon={window.IconPercent} />
        <KpiCard color="yellow" label="CFDI pendientes de cobro"
          value={window.fmt(cfdiPendiente)}
          sub="No se incluyen en la base ISR"
          icon={window.IconClock} />
        <KpiCard color="orange" label="Ventas en POS del período"
          value={salesPeriod.length + ' tickets'}
          sub={window.fmt(salesPeriod.reduce((s,v)=>s+(v.total||0),0)) + ' en total'}
          icon={window.IconShoppingCart} />
      </div>

      {Object.keys(byModule).length > 0 && (
        <div className="conta-section">
          <div className="conta-toolbar">
            <div className="conta-section-title">Ingresos por módulo — {MESES[month-1]} {year}</div>
          </div>
          <table className="conta-table">
            <thead>
              <tr><th>Módulo</th><th className="r">Ventas</th><th className="r">Total cobrado</th></tr>
            </thead>
            <tbody>
              {Object.entries(byModule).map(([mod, tot]) => (
                <tr key={mod}>
                  <td><span className={'tag module ' + mod}>{mod}</span></td>
                  <td className="r muted">{salesPeriod.filter(s=>s.module===mod).length}</td>
                  <td className="r fw6 mono">{window.fmt(tot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// =====================================================
// TAB 2: FACTURACIÓN (CFDI)
// =====================================================
function CfdiModal({ item, list, onSave, onClose }) {
  const isNew = !item.id;
  const [d, setD] = React.useState({
    folio:      item.folio      || nextFolio(list),
    fecha:      item.fecha      || window.localISO(),
    rfc:        item.rfc        || '',
    razon:      item.razon      || '',
    concepto:   item.concepto   || '',
    subtotal:   item.subtotal   || '',
    estado:     item.estado     || 'pagado',
    formaPago:  item.formaPago  || 'transferencia',
    metodoPago: item.metodoPago || 'PUE',
  });

  const set = (k, v) => setD(prev => ({ ...prev, [k]: v }));

  const sub = parseFloat(d.subtotal) || 0;
  const iva  = window.round2(sub * 0.16);
  const tot  = window.round2(sub + iva);

  const valid = d.rfc && d.razon && d.concepto && sub > 0;

  const save = () => {
    if (!valid) return;
    onSave({ ...item, ...d, id: item.id || window.uid(), subtotal: sub, iva, total: tot });
  };

  return (
    <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal" style={{width:600}}>
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">{isNew ? 'Nuevo CFDI' : 'Editar CFDI'}</span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18}/></button>
        </div>
        <div className="cfg-modal-body">
          <div className="cfg-form-grid">
            <div className="field">
              <label>Folio</label>
              <input value={d.folio} onChange={e => set('folio', e.target.value)} placeholder="F-001" />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={d.fecha} onChange={e => set('fecha', e.target.value)} />
            </div>
            <div className="field">
              <label>RFC del cliente *</label>
              <input value={d.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} placeholder="XAXX010101000" autoFocus={isNew} />
            </div>
            <div className="field">
              <label>Razón social *</label>
              <input value={d.razon} onChange={e => set('razon', e.target.value)} placeholder="Nombre o empresa" />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Concepto *</label>
              <input value={d.concepto} onChange={e => set('concepto', e.target.value)} placeholder="Descripción del servicio" />
            </div>
            <div className="field">
              <label>Subtotal (sin IVA) *</label>
              <div className="suffix-input">
                <input type="number" min="0" step="0.01" value={d.subtotal}
                  onChange={e => set('subtotal', e.target.value)} placeholder="0.00" />
                <span className="suffix">MXN</span>
              </div>
            </div>
            <div className="field">
              <label>IVA 16% (calculado)</label>
              <input readOnly value={sub > 0 ? window.fmt(iva) : '—'} style={{background:'var(--bg-2)', color:'var(--text-3)'}} />
            </div>
            <div className="field">
              <label>Total (calculado)</label>
              <input readOnly value={sub > 0 ? window.fmt(tot) : '—'} style={{background:'var(--bg-2)', fontWeight:700}} />
            </div>
            <div className="field">
              <label>Estado</label>
              <select value={d.estado} onChange={e => set('estado', e.target.value)}>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>
            <div className="field">
              <label>Forma de pago</label>
              <select value={d.formaPago} onChange={e => set('formaPago', e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>
            <div className="field">
              <label>Método de pago SAT</label>
              <select value={d.metodoPago} onChange={e => set('metodoPago', e.target.value)}>
                <option value="PUE">PUE – Pago en una exhibición</option>
                <option value="PPD">PPD – Pago en parcialidades</option>
              </select>
            </div>
          </div>
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="cfg-btn-save" onClick={save} disabled={!valid}>
            <window.IconCheck size={15}/> Guardar CFDI
          </button>
        </div>
      </div>
    </div>
  );
}

function ContaFacturacion({ cfdis, setCfdis, year, month, onToast }) {
  const [filter, setFilter] = React.useState('todos');
  const [form,   setForm]   = React.useState(null);
  const [delId,  setDelId]  = React.useState(null);

  const periodList = cfdis.filter(c => inPeriod(c.fecha, year, month));
  const shown = filter === 'todos' ? periodList
    : periodList.filter(c => c.estado === filter);

  const save = (item) => {
    const next = item.id && cfdis.find(c => c.id === item.id)
      ? cfdis.map(c => c.id === item.id ? item : c)
      : [...cfdis, item];
    setCfdis(next); window.refreshCfdi(next);
    setForm(null); onToast(item.id && cfdis.find(c=>c.id===item.id) ? 'CFDI actualizado' : 'CFDI registrado');
  };

  const del = (id) => {
    const next = cfdis.filter(c => c.id !== id);
    setCfdis(next); window.refreshCfdi(next);
    setDelId(null); onToast('CFDI eliminado');
  };

  const toggleEstado = (id) => {
    const next = cfdis.map(c => c.id === id ? { ...c, estado: c.estado==='pagado' ? 'pendiente' : 'pagado' } : c);
    setCfdis(next); window.refreshCfdi(next);
  };

  const totPag = sumField(periodList.filter(c=>c.estado==='pagado'), 'total');
  const totPen = sumField(periodList.filter(c=>c.estado==='pendiente'), 'total');

  return (
    <>
      <div className="kpi-row cols-3">
        <KpiCard color="green" label="Facturado y cobrado"
          value={window.fmt(totPag)}
          sub={periodList.filter(c=>c.estado==='pagado').length + ' CFDIs pagados'}
          icon={window.IconCheck} />
        <KpiCard color="yellow" label="Facturado pendiente"
          value={window.fmt(totPen)}
          sub={periodList.filter(c=>c.estado==='pendiente').length + ' CFDIs por cobrar'}
          icon={window.IconClock} />
        <KpiCard color="orange" label="Total facturado en período"
          value={window.fmt(totPag + totPen)}
          sub={periodList.length + ' CFDIs emitidos'}
          icon={window.IconReceipt} />
      </div>

      <div className="conta-section">
        <div className="conta-toolbar">
          <div className="conta-toolbar-left">
            <div>
              <div className="conta-section-title">CFDIs — {MESES[month-1]} {year}</div>
            </div>
            <div className="conta-filter">
              {['todos','pagado','pendiente'].map(f => (
                <button key={f} className={'conta-filter-btn' + (filter===f ? ' active':'')} onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <button className="cfg-btn-add" onClick={() => setForm({ fecha:'', rfc:'', razon:'', concepto:'', subtotal:'', estado:'pagado', formaPago:'transferencia', metodoPago:'PUE' })}>
            <window.IconPlus size={15}/> Nuevo CFDI
          </button>
        </div>

        {shown.length === 0 ? (
          <div style={{padding:'40px', textAlign:'center', color:'var(--text-3)', fontSize:13}}>
            Sin CFDIs en este período
          </div>
        ) : (
          <table className="conta-table">
            <thead>
              <tr>
                <th>Folio</th><th>Fecha</th><th>RFC / Razón social</th><th>Concepto</th>
                <th className="r">Subtotal</th><th className="r">IVA</th><th className="r">Total</th>
                <th>Estado</th><th>F. Pago</th><th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(c => (
                <tr key={c.id}>
                  <td className="fw6 mono">{c.folio}</td>
                  <td className="muted mono">{fDate(c.fecha)}</td>
                  <td>
                    <div className="fw6" style={{fontSize:12}}>{c.razon}</div>
                    <div className="muted">{c.rfc}</div>
                  </td>
                  <td className="muted" style={{maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c.concepto}</td>
                  <td className="r mono">{window.fmt(c.subtotal)}</td>
                  <td className="r mono muted">{window.fmt(c.iva)}</td>
                  <td className="r mono fw6">{window.fmt(c.total)}</td>
                  <td>
                    <button className={'tag ' + c.estado} onClick={() => toggleEstado(c.id)} title="Clic para cambiar estado">
                      {c.estado}
                    </button>
                  </td>
                  <td className="muted">{c.formaPago}</td>
                  <td className="cfg-row-actions">
                    {delId === c.id ? (
                      <>
                        <button className="cfg-act danger" onClick={() => del(c.id)}>¿Eliminar?</button>
                        <button className="cfg-act" onClick={() => setDelId(null)}>No</button>
                      </>
                    ) : (
                      <>
                        <button className="cfg-act" onClick={() => setForm({...c})}><window.IconEdit size={14}/></button>
                        <button className="cfg-act danger-soft" onClick={() => setDelId(c.id)}><window.IconTrash size={14}/></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && <CfdiModal item={form} list={cfdis} onSave={save} onClose={() => setForm(null)} />}
    </>
  );
}

// =====================================================
// TAB 3: IVA MENSUAL
// =====================================================
function GastoModal({ item, onSave, onClose }) {
  const isNew = !item.id;
  const [d, setD] = React.useState({
    fecha:      item.fecha     || window.localISO(),
    proveedor:  item.proveedor || '',
    rfc:        item.rfc       || '',
    concepto:   item.concepto  || '',
    subtotal:   item.subtotal  || '',
  });

  const set = (k, v) => setD(prev => ({ ...prev, [k]: v }));
  const sub = parseFloat(d.subtotal) || 0;
  const iva  = window.round2(sub * 0.16);
  const tot  = window.round2(sub + iva);
  const valid = d.proveedor && d.concepto && sub > 0;

  return (
    <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal">
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">{isNew ? 'Nuevo gasto' : 'Editar gasto'}</span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18}/></button>
        </div>
        <div className="cfg-modal-body">
          <div className="cfg-form-grid">
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={d.fecha} onChange={e => set('fecha', e.target.value)} />
            </div>
            <div className="field">
              <label>RFC del proveedor</label>
              <input value={d.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} placeholder="PRO010101ABC" />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Proveedor *</label>
              <input value={d.proveedor} onChange={e => set('proveedor', e.target.value)}
                placeholder="Nombre o razón social del proveedor" autoFocus={isNew} />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Concepto *</label>
              <input value={d.concepto} onChange={e => set('concepto', e.target.value)}
                placeholder="Descripción del gasto" />
            </div>
            <div className="field">
              <label>Subtotal (sin IVA) *</label>
              <div className="suffix-input">
                <input type="number" min="0" step="0.01" value={d.subtotal}
                  onChange={e => set('subtotal', e.target.value)} placeholder="0.00" />
                <span className="suffix">MXN</span>
              </div>
            </div>
            <div className="field">
              <label>IVA 16% (calculado)</label>
              <input readOnly value={sub > 0 ? window.fmt(iva) : '—'} style={{background:'var(--bg-2)', color:'var(--text-3)'}} />
            </div>
          </div>
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="cfg-btn-save" onClick={() => valid && onSave({ ...item, ...d, id: item.id||window.uid(), subtotal:sub, iva, total:tot })} disabled={!valid}>
            <window.IconCheck size={15}/> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function ContaIVA({ cfdis, gastos, setGastos, year, month, onToast }) {
  const [form,  setForm]  = React.useState(null);
  const [delId, setDelId] = React.useState(null);

  const cfdisPag    = cfdis.filter(c => inPeriod(c.fecha, year, month) && c.estado === 'pagado');
  const ivaTraslado = sumField(cfdisPag, 'iva');

  const gastosPeriod  = gastos.filter(g => inPeriod(g.fecha, year, month));
  const ivaAcreditable = sumField(gastosPeriod, 'iva');

  const ivaPagar = window.round2(Math.max(0, ivaTraslado - ivaAcreditable));
  const ivaFavor = window.round2(Math.max(0, ivaAcreditable - ivaTraslado));

  const saveGasto = (item) => {
    const next = item.id && gastos.find(g => g.id === item.id)
      ? gastos.map(g => g.id === item.id ? item : g)
      : [...gastos, item];
    setGastos(next); window.refreshGastos(next);
    setForm(null); onToast(item.id && gastos.find(g=>g.id===item.id) ? 'Gasto actualizado' : 'Gasto registrado');
  };

  const del = (id) => {
    const next = gastos.filter(g => g.id !== id);
    setGastos(next); window.refreshGastos(next);
    setDelId(null); onToast('Gasto eliminado');
  };

  return (
    <>
      <div className="kpi-row cols-3">
        <KpiCard color="orange" label="IVA trasladado (cobrado)"
          value={window.fmt(ivaTraslado)}
          sub={'En ' + cfdisPag.length + ' CFDIs pagados'}
          icon={window.IconReceipt} />
        <KpiCard color="cyan" label="IVA acreditable (gastos)"
          value={window.fmt(ivaAcreditable)}
          sub={'En ' + gastosPeriod.length + ' gastos con factura'}
          icon={window.IconNote} />
        <KpiCard color={ivaPagar > 0 ? 'magenta' : 'green'}
          label={ivaPagar > 0 ? 'IVA a pagar al SAT' : 'IVA a favor'}
          value={window.fmt(ivaPagar > 0 ? ivaPagar : ivaFavor)}
          sub={ivaPagar > 0 ? 'Trasladado − Acreditable' : 'Saldo a favor del contribuyente'}
          icon={window.IconPercent} />
      </div>

      <div className="conta-section">
        <div className="conta-toolbar">
          <div>
            <div className="conta-section-title">Gastos con factura — {MESES[month-1]} {year}</div>
            <div className="conta-section-sub">Solo facturas que generan IVA acreditable</div>
          </div>
          <button className="cfg-btn-add" onClick={() => setForm({ fecha:'', proveedor:'', rfc:'', concepto:'', subtotal:'' })}>
            <window.IconPlus size={15}/> Agregar gasto
          </button>
        </div>

        {gastosPeriod.length === 0 ? (
          <div style={{padding:'40px', textAlign:'center', color:'var(--text-3)', fontSize:13}}>
            Sin gastos registrados en este período
          </div>
        ) : (
          <table className="conta-table">
            <thead>
              <tr><th>Fecha</th><th>Proveedor</th><th>RFC</th><th>Concepto</th>
                <th className="r">Subtotal</th><th className="r">IVA</th><th className="r">Total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {gastosPeriod.map(g => (
                <tr key={g.id}>
                  <td className="muted mono">{fDate(g.fecha)}</td>
                  <td className="fw6" style={{fontSize:12}}>{g.proveedor}</td>
                  <td className="muted mono" style={{fontSize:11}}>{g.rfc || '—'}</td>
                  <td className="muted" style={{maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{g.concepto}</td>
                  <td className="r mono">{window.fmt(g.subtotal)}</td>
                  <td className="r mono muted">{window.fmt(g.iva)}</td>
                  <td className="r mono fw6">{window.fmt(g.total)}</td>
                  <td className="cfg-row-actions">
                    {delId === g.id ? (
                      <>
                        <button className="cfg-act danger" onClick={() => del(g.id)}>¿Eliminar?</button>
                        <button className="cfg-act" onClick={() => setDelId(null)}>No</button>
                      </>
                    ) : (
                      <>
                        <button className="cfg-act" onClick={() => setForm({...g})}><window.IconEdit size={14}/></button>
                        <button className="cfg-act danger-soft" onClick={() => setDelId(g.id)}><window.IconTrash size={14}/></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && <GastoModal item={form} onSave={saveGasto} onClose={() => setForm(null)} />}
    </>
  );
}

// =====================================================
// TAB 4: CORTE DE CAJA DIARIO
// =====================================================
function ContaCorteCaja({ sales }) {
  const todayISO = window.localISO();
  const [date, setDate] = React.useState(todayISO);

  const daySales = sales.filter(s => s.fecha === date);

  const efectivo   = sumField(daySales.filter(s => s.method === 'efectivo'), 'total');
  const transfer   = sumField(daySales.filter(s => s.method === 'transfer'), 'total');
  const factura    = sumField(daySales.filter(s => s.method === 'factura'),  'total');
  const total      = window.round2(efectivo + transfer + factura);

  return (
    <>
      <div className="conta-section">
        <div className="conta-toolbar">
          <div className="conta-section-title">Corte de Caja</div>
          <div className="corte-date">
            <span style={{fontSize:12, color:'var(--text-3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px'}}>Fecha</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div style={{padding:'20px 22px'}}>
          <div className="kpi-row">
            <KpiCard color="green" label="Efectivo"
              value={window.fmt(efectivo)}
              sub={daySales.filter(s=>s.method==='efectivo').length + ' cobros'}
              icon={window.IconCash} />
            <KpiCard color="cyan" label="Transferencias"
              value={window.fmt(transfer)}
              sub={daySales.filter(s=>s.method==='transfer').length + ' cobros'}
              icon={window.IconCard} />
            <KpiCard color="magenta" label="Con factura"
              value={window.fmt(factura)}
              sub={daySales.filter(s=>s.method==='factura').length + ' cobros'}
              icon={window.IconReceipt} />
            <KpiCard color="black" label="Total del día"
              value={window.fmt(total)}
              sub={daySales.length + ' tickets · ' + date}
              icon={window.IconHash} />
          </div>
        </div>
      </div>

      <div className="conta-section">
        <div className="conta-toolbar">
          <div className="conta-section-title">Detalle de ventas — {fDate(date)}</div>
        </div>
        {daySales.length === 0 ? (
          <div style={{padding:'40px', textAlign:'center', color:'var(--text-3)', fontSize:13}}>
            Sin ventas registradas para esta fecha
          </div>
        ) : (
          <table className="conta-table">
            <thead>
              <tr>
                <th>Ticket</th><th>Hora</th><th>Cajero</th><th>Módulo</th>
                <th>Artículos</th><th>Forma de pago</th><th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {daySales.map((s, i) => (
                <tr key={s.ticket + i}>
                  <td className="fw6 mono" style={{color:'var(--orange)'}}>{s.ticket}</td>
                  <td className="muted mono">{s.time}</td>
                  <td>{s.user}</td>
                  <td><span className={'tag module ' + s.module}>{s.module}</span></td>
                  <td className="muted">{s.items} art.</td>
                  <td>
                    <span className={'tag ' + (s.method === 'transfer' ? 'transfer' : s.method === 'factura' ? 'factura' : 'efectivo')}>
                      {s.method === 'transfer' ? 'transferencia' : s.method}
                    </span>
                  </td>
                  <td className="r fw6 mono">{window.fmt(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// =====================================================
// TAB 5: REPORTE MENSUAL RESICO
// =====================================================
function ContaReporte({ sales, cfdis, gastos, year, month }) {
  const salesPeriod   = sales.filter(s => inPeriod(s.fecha, year, month));
  const cfdisPeriod   = cfdis.filter(c => inPeriod(c.fecha, year, month));
  const cfdisPag      = cfdisPeriod.filter(c => c.estado === 'pagado');
  const gastosPeriod  = gastos.filter(g => inPeriod(g.fecha, year, month));

  // Montos sin IVA: es un reporte fiscal, la base ISR no debe incluir IVA.
  // Las ventas POS con factura entran por su CFDI, no se suman aparte (evita doble conteo)
  const ingEfectivo   = sumBaseSinIva(salesPeriod.filter(s => s.method === 'efectivo'));
  const ingTransfer   = sumBaseSinIva(salesPeriod.filter(s => s.method === 'transfer'));
  const ingCFDI       = sumField(cfdisPag, 'subtotal');

  const baseISR       = window.round2(ingEfectivo + ingTransfer + ingCFDI);
  const { isr, pct, label, rate } = calcISR(baseISR);
  const ivaTraslado   = sumField(cfdisPag, 'iva');
  const ivaAcreditable = sumField(gastosPeriod, 'iva');
  const ivaPagar      = window.round2(Math.max(0, ivaTraslado - ivaAcreditable));

  const mesLabel = MESES[month - 1] + ' ' + year;

  // window.print() salía en blanco: las reglas print del POS ocultan la app.
  // printSgiDoc renderiza el nodo en un iframe aislado.
  const print = () => window.printSgiDoc('.reporte-printable');

  return (
    <div className="reporte-printable">
      <div className="reporte-grid">
        <div className="reporte-main">
          <div className="reporte-header">
            <div>
              <h3>Reporte Mensual RESICO</h3>
              <div className="rh-sub">{mesLabel} · {window.NEGOCIO?.nombre || 'SGI'}</div>
            </div>
            <button className="btn-print" onClick={print}>
              <window.IconPrinter size={15}/> Imprimir
            </button>
          </div>
          <div className="reporte-body">
            <div className="reporte-row">
              <span className="rl">Ingresos efectivo (sin factura)</span>
              <span className="rv">{window.fmt(ingEfectivo)}</span>
            </div>
            <div className="reporte-row">
              <span className="rl">Ingresos transferencia (sin factura)</span>
              <span className="rv">{window.fmt(ingTransfer)}</span>
            </div>
            <div className="reporte-row">
              <span className="rl">Ingresos cobrados con factura (CFDI pagados)</span>
              <span className="rv">{window.fmt(ingCFDI)}</span>
            </div>
            <div className="reporte-row total-row">
              <span className="rl">Total ingresos del período (base sin IVA)</span>
              <span className="rv">{window.fmt(baseISR)}</span>
            </div>
            <div style={{height:16}}/>
            <div className="reporte-row">
              <span className="rl">Tasa RESICO aplicable ({label})</span>
              <span className="rv">{pct}</span>
            </div>
            <div className="reporte-row isr-row">
              <span className="rl">ISR estimado a pagar (ISR = Base × {pct})</span>
              <span className="rv">{window.fmt(isr)}</span>
            </div>
            <div style={{height:16}}/>
            <div className="reporte-row">
              <span className="rl">IVA trasladado en facturas emitidas</span>
              <span className="rv">{window.fmt(ivaTraslado)}</span>
            </div>
            <div className="reporte-row">
              <span className="rl">IVA acreditable (gastos con factura)</span>
              <span className="rv">− {window.fmt(ivaAcreditable)}</span>
            </div>
            <div className="reporte-row iva-row">
              <span className="rl">IVA neto a pagar al SAT</span>
              <span className="rv">{window.fmt(ivaPagar)}</span>
            </div>
            <div style={{height:16}}/>
            <div className="reporte-nota">
              <strong>Nota RESICO:</strong> El ISR se calcula sobre el total de ingresos cobrados en el período,
              incluyendo ventas en efectivo, transferencias y facturas. La tasa aplicada es la correspondiente
              al tramo de ingresos según el Artículo 113-E de la LISR. Verifica con tu contador antes de
              realizar el pago definitivo en el portal del SAT.
            </div>
          </div>
        </div>

        <div>
          <div className="resico-table-wrap">
            <div className="resico-table-title">Tabla de tasas RESICO 2024</div>
            <table className="resico-table">
              <tbody>
                {RESICO_TABLA.filter(r => r.max !== Infinity).map((r, i) => (
                  <tr key={i} className={baseISR <= r.max && (i === 0 || baseISR > RESICO_TABLA[i-1].max) ? 'active-bracket' : ''}>
                    <td>{r.label}</td>
                    <td className="r">{r.pct}</td>
                  </tr>
                ))}
                <tr className={baseISR > 7083333 ? 'active-bracket' : ''}>
                  <td>Más de $7,083,333</td>
                  <td className="r">15.00%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{marginTop:16}}>
            <div className="kpi-card black" style={{marginBottom:12}}>
              <div className="kpi-label"><window.IconPercent size={13}/> Tu tramo actual</div>
              <div className="kpi-value" style={{fontSize:18, color:'var(--orange)'}}>{pct}</div>
              <div className="kpi-sub">{label}</div>
            </div>
            <div className="kpi-card magenta">
              <div className="kpi-label"><window.IconReceipt size={13}/> ISR a pagar</div>
              <div className="kpi-value">{window.fmt(isr)}</div>
              <div className="kpi-sub">Pago mensual RESICO</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MÓDULO RAÍZ
// =====================================================
function ModuleContabilidad({ sales }) {
  const now = new Date();
  const [year,  setYear]  = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [tab,   setTab]   = React.useState('ingresos');
  const [toast, setToast] = React.useState(null);

  const [cfdis,  setCfdis]  = React.useState(() => [...window.CFDI_LIST]);
  const [gastos, setGastos] = React.useState(() => [...window.GASTOS_LIST]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const tabs = [
    { id:'ingresos',   label:'Ingresos del período', Icon: window.IconHash },
    { id:'facturacion',label:'Facturación',           Icon: window.IconReceipt },
    { id:'iva',        label:'IVA mensual',           Icon: window.IconPercent },
    { id:'corte',      label:'Corte de caja',         Icon: window.IconCash },
    { id:'reporte',    label:'Reporte RESICO',        Icon: window.IconPrinter },
  ];

  return (
    <div className="conta-module">
      <div className="module-header">
        <div className="module-title">
          <div className="mt-icon"><window.IconReceipt size={20}/></div>
          <div>
            <h1>Contabilidad RESICO</h1>
            <div className="mt-sub">Ingresos · Facturación · IVA · Reporte mensual</div>
          </div>
        </div>
      </div>

      <PeriodSelector year={year} month={month} onYear={setYear} onMonth={setMonth} />

      <div className="conta-tabs">
        {tabs.map(t => (
          <button key={t.id} className={'conta-tab-btn' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            <t.Icon size={14}/>
            {t.label}
          </button>
        ))}
      </div>

      <div className="conta-body">
        {tab === 'ingresos'    && <ContaIngresos    sales={sales} cfdis={cfdis} year={year} month={month} />}
        {tab === 'facturacion' && <ContaFacturacion cfdis={cfdis} setCfdis={setCfdis} year={year} month={month} onToast={showToast} />}
        {tab === 'iva'         && <ContaIVA         cfdis={cfdis} gastos={gastos} setGastos={setGastos} year={year} month={month} onToast={showToast} />}
        {tab === 'corte'       && <ContaCorteCaja   sales={sales} />}
        {tab === 'reporte'     && <ContaReporte     sales={sales} cfdis={cfdis} gastos={gastos} year={year} month={month} />}
      </div>

      {toast && (
        <div className="toast success">
          <span className="toast-icon"><window.IconCheck size={16} stroke={3}/></span>
          {toast}
        </div>
      )}
    </div>
  );
}

window.ModuleContabilidad = ModuleContabilidad;
