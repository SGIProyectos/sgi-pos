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
function _CrearPedidoModal({ ticketNum, modulo, items, total, metodo, onSave, onSkip }) {
  const hoy = window.localISO();
  const [form, setForm] = React.useState({
    cliente: '', fechaEntrega: '', tiempoElaboracion: '3', notas: '',
    totalTrabajo: String(window.round2(total)),
  });
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Lo cobrado en caja se registra como primer pago del pedido. Si el trabajo
  // vale más que lo cobrado (se cobró solo un anticipo), queda saldo pendiente.
  const cobrado      = window.round2(total);
  const totalTrabajo = Math.max(window.round2(parseFloat(form.totalTrabajo) || 0), cobrado);
  const saldo        = window.round2(totalTrabajo - cobrado);
  const liquidado    = saldo < 0.01;

  const save = () => {
    const pedido = {
      id:                window.uid(),
      ticketNum,
      modulo,
      items,
      total,
      totalCotizado:     totalTrabajo,
      anticipoPct:       50,
      abonos:            [{
        id:     window.uid(),
        fecha:  hoy,
        monto:  cobrado,
        metodo: metodo || 'efectivo',
        tipo:   liquidado ? 'liquidacion' : 'anticipo',
        nota:   'Cobro en caja · ' + ticketNum,
      }],
      estadoPago:        liquidado ? 'liquidado' : 'con_anticipo',
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
              <label>Precio total del trabajo</label>
              <input type="number" min={cobrado} step="0.01" value={form.totalTrabajo}
                onChange={e => sf('totalTrabajo', e.target.value)} />
              <div style={{fontSize:'0.78rem', marginTop:4,
                color: liquidado ? 'var(--success, #16a34a)' : 'var(--warn, #d97706)'}}>
                {liquidado
                  ? `Cobrado en caja ${window.fmt(cobrado)} — pedido pagado por completo`
                  : `Cobrado en caja ${window.fmt(cobrado)} (anticipo) · saldo pendiente ${window.fmt(saldo)}`}
              </div>
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
    setCrearPedido({ ticketNum: savedTicket, modulo: savedModule, items: savedItems, total: paymentData.total, metodo: data.method });
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
          metodo={crearPedido.metodo}
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

// ===== NUBE (Supabase): login + arranque =====
function _LoginNube({ onListo }) {
  const [email, setEmail] = React.useState('');
  const [pass, setPass]   = React.useState('');
  const [msg, setMsg]     = React.useState('');
  const [busy, setBusy]   = React.useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg('Conectando…');
    try {
      await window.SGISync.login(email.trim(), pass);
      setMsg('Sincronizando datos…');
      const r = await window.SGISync.sync();
      if (r && r.error) { setMsg('Entraste, pero la sincronización falló. Reintenta.'); setBusy(false); return; }
      onListo();
    } catch (err) {
      setMsg(err && err.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos'
        : 'Error: ' + ((err && err.message) || 'sin conexión'));
      setBusy(false);
    }
  };

  const sinNube = () => {
    try { sessionStorage.setItem('sgi_offline', '1'); } catch {}
    onListo();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #f1f5f9)' }}>
      <form onSubmit={entrar} style={{ background: '#fff', borderRadius: 16, padding: '36px 32px', width: 340, boxShadow: '0 8px 30px rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <img src="logosgi.jpg" alt="SGI" style={{ width: 84, alignSelf: 'center', borderRadius: 12 }} />
        <h2 style={{ margin: '4px 0 0', textAlign: 'center', fontSize: 20 }}>SGI Punto de Venta</h2>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: '#64748b' }}>Inicia sesión para sincronizar tus datos</p>
        <input type="email" required autoFocus placeholder="Correo" value={email} onChange={e => setEmail(e.target.value)}
          style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 15 }} />
        <input type="password" required placeholder="Contraseña" value={pass} onChange={e => setPass(e.target.value)}
          style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 15 }} />
        <button type="submit" disabled={busy}
          style={{ padding: '11px 0', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .7 : 1 }}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        {msg && <div style={{ fontSize: 13, textAlign: 'center', color: msg.indexOf('…') >= 0 ? '#64748b' : '#dc2626' }}>{msg}</div>}
        <button type="button" onClick={sinNube}
          style={{ marginTop: 4, background: 'none', border: 'none', color: '#64748b', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>
          Trabajar sin conexión (solo este equipo)
        </button>
      </form>
    </div>
  );
}

function _NubeBadge() {
  const [estado, setEstado] = React.useState(window.SGISync ? window.SGISync.estado : 'off');
  React.useEffect(() => {
    if (!window.SGISync) return;
    return window.SGISync.onEstado(setEstado);
  }, []);
  if (!window.SGISync || !window.SGISync.sesion) return null;
  const info = {
    ok:    { txt: 'Nube al día', bg: '#dcfce7', fg: '#166534' },
    sync:  { txt: 'Sincronizando…', bg: '#dbeafe', fg: '#1d4ed8' },
    error: { txt: 'Sin conexión — se reintentará', bg: '#fee2e2', fg: '#b91c1c' },
    off:   { txt: 'Nube', bg: '#e2e8f0', fg: '#475569' },
  }[estado] || { txt: estado, bg: '#e2e8f0', fg: '#475569' };
  const salir = async () => {
    if (!confirm('¿Cerrar sesión de la nube? Los datos locales se conservan.')) return;
    await window.SGISync.logout();
    try { sessionStorage.removeItem('sgi_offline'); sessionStorage.removeItem('sgi_synced_boot'); } catch {}
    location.reload();
  };
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 9000, display: 'flex', alignItems: 'center', gap: 6, background: info.bg, color: info.fg, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.fg, display: 'inline-block' }} />
      {info.txt}
      <button onClick={salir} title="Cerrar sesión de la nube"
        style={{ marginLeft: 4, background: 'none', border: 'none', color: info.fg, cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>
        salir
      </button>
    </div>
  );
}

function Root() {
  // fase: cargando | login | app
  const [fase, setFase] = React.useState('cargando');

  React.useEffect(() => {
    (async () => {
      let offline = false;
      try { offline = sessionStorage.getItem('sgi_offline') === '1'; } catch {}
      if (!window.SGISync || offline) { setFase('app'); return; }
      try {
        const ses = await window.SGISync.init();
        if (!ses) { setFase('login'); return; }
        // sincroniza en CADA arranque; la bandera solo evita recargar en bucle
        const r = await window.SGISync.sync();
        let yaRecargo = false;
        try { yaRecargo = sessionStorage.getItem('sgi_synced_boot') === '1'; } catch {}
        if (r && r.cambios > 0 && !yaRecargo) {
          try { sessionStorage.setItem('sgi_synced_boot', '1'); } catch {}
          location.reload(); return;
        }
        try { sessionStorage.removeItem('sgi_synced_boot'); } catch {}
      } catch (e) { console.error('SGISync arranque:', e); }
      setFase('app');
    })();
  }, []);

  if (fase === 'cargando') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 15 }}>
        Cargando…
      </div>
    );
  }
  if (fase === 'login') {
    return <_LoginNube onListo={() => { try { sessionStorage.setItem('sgi_synced_boot', '1'); } catch {} location.reload(); }} />;
  }
  return (
    <>
      <App />
      <_NubeBadge />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
