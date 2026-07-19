// ========== APP ROOT ==========

// ---- Modal de alerta al iniciar (pedidos urgentes/vencidos) ----
function _PedidosAlertModal({ pedidos, onClose, onGoToPedidos }) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  const urgInfo = (p) => {
    if (!p.fechaEntrega) return { cls: 'ped-alert-ok', label: 'Sin fecha' };
    const dias = Math.ceil((new Date(p.fechaEntrega + 'T00:00:00') - hoy) / 86400000);
    if (dias < 0) return { cls: 'ped-alert-venc', label: `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}` };
    if (dias === 0) return { cls: 'ped-alert-urg', label: 'Entrega HOY' };
    if (dias <= 2) return { cls: 'ped-alert-urg', label: `Entrega en ${dias} día${dias !== 1 ? 's' : ''}` };
    return { cls: 'ped-alert-ok', label: `${dias} días` };
  };

  const sorted = [...pedidos].sort((a, b) => {
    const da = a.fechaEntrega ? new Date(a.fechaEntrega).getTime() : Infinity;
    const db = b.fechaEntrega ? new Date(b.fechaEntrega).getTime() : Infinity;
    return da - db;
  });

  return (
    <div className="cfg-overlay">
      <div className="cfg-modal" style={{maxWidth:560}}>
        <div className="cfg-modal-head">
          <span className="cfg-modal-title" style={{color:'var(--orange)'}}>
            Pedidos pendientes de atención
          </span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18} /></button>
        </div>
        <div className="cfg-modal-body">
          <p style={{fontSize:'0.875rem', color:'var(--text-2)', marginBottom:14}}>
            Los siguientes pedidos requieren atención hoy:
          </p>
          <div className="ped-alert-list">
            {sorted.map(p => {
              const ui = urgInfo(p);
              return (
                <div key={p.id} className={'ped-alert-row ' + ui.cls}>
                  <div className="ped-alert-left">
                    <span className="ped-alert-ticket mono">{p.ticketNum}</span>
                    <span className="ped-alert-cliente">{p.cliente || 'Sin nombre'}</span>
                    <span className="ped-alert-estado">{p.estado}</span>
                  </div>
                  <span className={'ped-alert-tag ' + ui.cls}>{ui.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Ignorar por ahora</button>
          <button className="cfg-btn-save" onClick={() => { onClose(); onGoToPedidos(); }}>
            <window.IconNote size={15} /> Ver pedidos
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Modal: registrar pedido tras cobro ----
function _CrearPedidoModal({ ticketNum, modulo, items, total, onSave, onSkip }) {
  const hoy = window.localISO();
  const [form, setForm] = React.useState({
    cliente: '', fechaEntrega: '', tiempoElaboracion: '3', notas: '',
  });
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = () => {
    const pedido = {
      id:                window.uid(),
      ticketNum,
      modulo,
      items,
      total,
      totalCotizado:     total,
      anticipoPct:       50,
      abonos:            [],
      estadoPago:        'sin_anticipo',
      fecha:             hoy,
      estado:            'pendiente',
      cliente:           form.cliente,
      fechaEntrega:      form.fechaEntrega,
      tiempoElaboracion: parseInt(form.tiempoElaboracion) || 0,
      notas:             form.notas,
    };
    onSave(pedido);
  };

  return (
    <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && onSkip()}>
      <div className="cfg-modal" style={{maxWidth:460}}>
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">Registrar pedido · {ticketNum}</span>
          <button className="cfg-modal-x" onClick={onSkip}><window.IconX size={18} /></button>
        </div>
        <div className="cfg-modal-body">
          <p style={{fontSize:'0.85rem', color:'var(--text-2)', marginBottom:16}}>
            ¿Deseas registrar este cobro como un pedido con fecha de entrega y seguimiento?
          </p>
          <div className="cfg-form-grid">
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Nombre del cliente</label>
              <input value={form.cliente} onChange={e => sf('cliente', e.target.value)}
                placeholder="Ej: Juan García" autoFocus />
            </div>
            <div className="field">
              <label>Fecha de entrega</label>
              <input type="date" value={form.fechaEntrega} min={hoy}
                onChange={e => sf('fechaEntrega', e.target.value)} />
            </div>
            <div className="field">
              <label>Días de elaboración</label>
              <input type="number" min="1" value={form.tiempoElaboracion}
                onChange={e => sf('tiempoElaboracion', e.target.value)} />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Notas / especificaciones</label>
              <textarea value={form.notas} onChange={e => sf('notas', e.target.value)}
                placeholder="Materiales, colores, tamaño, acuerdos con el cliente..."
                style={{minHeight:64, resize:'vertical', width:'100%', padding:'8px',
                  border:'1px solid var(--border)', borderRadius:'var(--radius)',
                  fontFamily:'inherit', fontSize:'inherit'}} />
            </div>
          </div>
        </div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onSkip}>No registrar</button>
          <button className="cfg-btn-save" onClick={save}>
            <window.IconCheck size={15} /> Registrar pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- App principal ----
function App() {
  const [activeModule, setActiveModule] = React.useState('copiado');
  const [items,        setItems]        = React.useState([]);
  const [showPayment,  setShowPayment]  = React.useState(false);
  const [paymentData,  setPaymentData]  = React.useState({});
  // Ventas reales persistidas (sgi_ventas) — los datos demo SEED_SALES ya no
  // alimentan reportes ni la tabla de ventas para no contaminar contabilidad
  const [sales,        setSales]        = React.useState(() => window.storageLoad('sgi_ventas', []));
  const [toast,        setToast]        = React.useState(null);
  const [ticketNumber, setTicketNumber] = React.useState(() => '#A-' + window.storageLoad('sgi_ticket_num', 2849));
  const [alertPedidos, setAlertPedidos] = React.useState(null);   // pedidos urgentes al iniciar
  const [crearPedido,  setCrearPedido]  = React.useState(null);   // datos para crear pedido post-cobro
  const [activeUser,   setActiveUser]   = React.useState(() => {
    const savedId = window.storageLoad('sgi_active_user_id', null);
    const users   = window.USUARIOS_RAW || [];
    return (savedId && users.find(u => u.id === savedId && u.activo !== false))
      || users.find(u => u.activo !== false)
      || { id: null, nombre: 'Usuario', initials: 'US', rol: 'cajero' };
  });

  const cobrarRef = React.useRef(null);

  // Un solo timer de toast: un aviso nuevo cancela el cierre programado del
  // anterior para que no se corte antes de tiempo
  const toastTimer = React.useRef(null);
  const showToast = (msg, type = 'success', ms = 2200) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  const handleUserChange = (user) => {
    window.storageSave('sgi_active_user_id', user.id);
    setActiveUser(user);
  };

  const addToTicket = (item) => {
    setItems(prev => [...prev, item]);
    showToast(`${item.name} agregado al ticket`, 'success', 1800);
  };

  const handleCobrar = (total, subtotal, iva, discount) => {
    setPaymentData({ total, subtotal, iva, discount });
    setShowPayment(true);
  };

  const confirmPayment = (data) => {
    const savedItems  = [...items];
    const savedModule = items[0]?.module || 'copiado';
    const savedTicket = ticketNumber;

    const newSale = {
      id:       window.uid(),
      ticket:   savedTicket,
      fecha:    window.localISO(),
      time:     new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
      user:     activeUser.initials,
      module:   savedModule,
      items:    savedItems.length,
      method:   data.method === 'transferencia' ? 'transfer' : data.method,
      subtotal: window.round2(paymentData.subtotal),
      discount: window.round2(paymentData.discount || 0),
      iva:      window.round2(paymentData.iva),
      total:    window.round2(paymentData.total),
    };
    window.saveSale(newSale);

    // CFDI real cuando el cobro es con factura
    if (data.withInvoice && data.rfc) {
      const cfdiList = window.CFDI_LIST || [];
      const maxF = cfdiList.reduce((acc, c) => {
        const n = parseInt((c.folio || '').replace(/\D/g, ''), 10) || 0;
        return n > acc ? n : acc;
      }, 0);
      window.refreshCfdi([{
        id:         window.uid(),
        folio:      'F-' + String(maxF + 1).padStart(3, '0'),
        fecha:      newSale.fecha,
        rfc:        data.rfc.toUpperCase(),
        razon:      data.razonSocial,
        concepto:   savedItems.map(it => `${it.qty}× ${it.name}`).join(', ').slice(0, 200),
        subtotal:   window.round2(newSale.total - newSale.iva),
        iva:        newSale.iva,
        total:      newSale.total,
        estado:     'pagado',
        formaPago:  'efectivo',
        metodoPago: 'PUE',
        usoCfdi:    data.usoCfdi || 'G03',
        email:      data.emailFactura || '',
        ticket:     savedTicket,
      }, ...cfdiList]);
    }

    setSales([newSale, ...sales]);
    setItems([]);
    setShowPayment(false);
    const next = parseInt(savedTicket.replace('#A-', ''), 10) + 1;
    window.storageSave('sgi_ticket_num', next);
    setTicketNumber('#A-' + next);
    showToast(`Cobro completado · ${savedTicket}`, 'success', 2200);

    // Mostrar formulario para registrar como pedido
    setCrearPedido({ ticketNum: savedTicket, modulo: savedModule, items: savedItems, total: paymentData.total });
  };

  const handleSavePedido = (pedido) => {
    window.savePedido(pedido);
    setCrearPedido(null);
    showToast(`Pedido ${pedido.ticketNum} registrado`, 'success', 2500);
  };

  // Alerta de inicio: pedidos vencidos o con ≤2 días
  React.useEffect(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const urgentes = (window.PEDIDOS_LIST || []).filter(p => {
      if (p.estado === 'entregado' || p.estado === 'cancelado') return false;
      if (!p.fechaEntrega) return false;
      const dias = Math.ceil((new Date(p.fechaEntrega + 'T00:00:00') - hoy) / 86400000);
      return dias <= 2;
    });
    if (urgentes.length > 0) setAlertPedidos(urgentes);

    if (window.isBackupOverdue && window.isBackupOverdue()) {
      setTimeout(() => {
        showToast('⚠️ Han pasado más de 2 días sin respaldo. Ve a Configuración → Respaldos.', 'warn', 7000);
      }, urgentes.length > 0 ? 0 : 500);
    }
  }, []);

  // Hotkeys
  React.useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (showPayment || crearPedido || alertPedidos) return;
      const m = window.MODULES.find(m => m.hotkey === e.key);
      if (m) { e.preventDefault(); setActiveModule(m.id); return; }
      if (e.key === 'F12') {
        e.preventDefault();
        if (items.length > 0) cobrarRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items.length, showPayment, crearPedido, alertPedidos]);

  const isFullScreen = ['config', 'contabilidad', 'pedidos', 'cotizador'].includes(activeModule);

  const ModuleComp = {
    copiado:     window.ModuleCopiado,
    granformato: window.ModuleGranFormato,
    bordado:     window.ModuleBordado,
  }[activeModule];

  return (
    <div className="app">
      <window.Header activeModule={activeModule} onModuleChange={setActiveModule} activeUser={activeUser} onUserChange={handleUserChange} />
      <div className="main">
        {isFullScreen ? (
          <div className="left-panel cfg-full">
            <div className="module-area">
              {activeModule === 'config'        && <window.ModuleConfig />}
              {activeModule === 'contabilidad'  && <window.ModuleContabilidad sales={sales} />}
              {activeModule === 'pedidos'       && <window.ModulePedidos />}
              {activeModule === 'cotizador'     && <window.ModuleCotizador />}
            </div>
          </div>
        ) : (
          <>
            <div className="left-panel">
              <div className="module-area">
                <ModuleComp addToTicket={addToTicket} onModuleChange={setActiveModule} />
              </div>
              <window.SalesTable sales={sales} />
            </div>
            <div className="right-panel">
              <window.Ticket
                items={items}
                setItems={setItems}
                onCobrar={handleCobrar}
                cobrarRef={cobrarRef}
                ticketNumber={ticketNumber}
              />
            </div>
          </>
        )}
      </div>

      {showPayment && (
        <window.PaymentModal
          {...paymentData}
          items={items}
          onClose={() => setShowPayment(false)}
          onConfirm={confirmPayment}
        />
      )}

      {/* Alerta de pedidos urgentes al iniciar */}
      {alertPedidos && (
        <_PedidosAlertModal
          pedidos={alertPedidos}
          onClose={() => setAlertPedidos(null)}
          onGoToPedidos={() => setActiveModule('pedidos')}
        />
      )}

      {/* Crear pedido tras cobro */}
      {crearPedido && (
        <_CrearPedidoModal
          ticketNum={crearPedido.ticketNum}
          modulo={crearPedido.modulo}
          items={crearPedido.items}
          total={crearPedido.total}
          onSave={handleSavePedido}
          onSkip={() => setCrearPedido(null)}
        />
      )}

      {toast && (
        <div className={'toast' + (toast.type === 'success' ? ' success' : toast.type === 'warn' ? ' warn' : '')}>
          <span className="toast-icon"><window.IconCheck size={16} stroke={3} /></span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
