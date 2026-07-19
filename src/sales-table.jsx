// ========== SALES TABLE ==========

function SalesTable({ sales: allSales }) {
  const hoy   = window.localISO();
  const sales = allSales.filter(s => s.fecha === hoy);
  const totalSales = sales.reduce((s, x) => s + x.total, 0);
  const totalItems = sales.reduce((s, x) => s + x.items, 0);

  const moduleNameMap = {
    copiado: 'Copiado',
    granformato: 'Gran Formato',
    bordado: 'Bordado',
    letras: 'Letras 3D',
    neon: 'Neón',
    luces: 'Luces LED',
    materiales: 'Materiales',
    cotizador: 'Cotizador',
  };
  const methodNameMap = {
    efectivo: 'Efectivo',
    transfer: 'Transferencia',
    transferencia: 'Transferencia',
    factura: 'Factura',
  };

  return (
    <div className="sales-table">
      <div className="st-header">
        <h3><span className="pulse-dot"></span>Ventas del día · {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</h3>
        <div className="st-stats">
          <div className="st-stat"><span className="v mono">{sales.length}</span><span className="l">Tickets</span></div>
          <div className="st-stat"><span className="v mono">{totalItems}</span><span className="l">Artículos</span></div>
          <div className="st-stat total"><span className="v mono">{window.fmt(totalSales)}</span><span className="l">Vendido</span></div>
        </div>
      </div>
      <div style={{maxHeight:200, overflowY:'auto'}}>
        <table className="st-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Hora</th>
              <th>Cajera</th>
              <th>Módulo</th>
              <th>Artíc.</th>
              <th>Pago</th>
              <th style={{textAlign:'right'}}>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s, i) => (
              <tr key={s.id || `${s.ticket}-${s.time}-${i}`}>
                <td className="ticket-num">{s.ticket}</td>
                <td className="mono">{s.time}</td>
                <td>{s.user}</td>
                <td>
                  <span className={'tag module ' + s.module}>
                    {moduleNameMap[s.module] || s.module}
                  </span>
                </td>
                <td className="num">{s.items}</td>
                <td>
                  <span className={'tag ' + (s.method === 'transferencia' ? 'transfer' : s.method)}>
                    {methodNameMap[s.method] || s.method}
                  </span>
                </td>
                <td className="num" style={{fontWeight:700}}>{window.fmt(s.total)}</td>
                <td>
                  <button className="ti-action" style={{width:24, height:24}}><window.IconMore size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.SalesTable = SalesTable;
