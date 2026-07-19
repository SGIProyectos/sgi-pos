// ========== HEADER ==========

function Header({ activeModule, onModuleChange, activeUser, onUserChange }) {
  const [now,       setNow]       = React.useState(new Date());
  const [showUsers, setShowUsers] = React.useState(false);
  const dropRef = React.useRef(null);

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    if (!showUsers) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowUsers(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUsers]);

  const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const date = now.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });

  const opMods    = window.MODULES.filter(m => !m.admin);
  const adminMods = window.MODULES.filter(m => m.admin);
  const activeUsers = (window.USUARIOS_RAW || []).filter(u => u.activo !== false);

  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">SGI</div>
        <div className="brand-text">
          <div className="b1">SGI</div>
          <div className="b2">Servicios Gráficos</div>
        </div>
      </div>

      <nav className="nav">
        {opMods.map(m => {
          const Ico = m.Icon;
          return (
            <button
              key={m.id}
              className={'nav-btn' + (activeModule === m.id ? ' active' : '')}
              onClick={() => onModuleChange(m.id)}
            >
              <span className="nav-icon"><Ico size={16} /></span>
              <span>{m.short}</span>
            </button>
          );
        })}
      </nav>

      <div className="header-right">
        <div className="header-admin-area">
          {adminMods.map(m => {
            const Ico = m.Icon;
            return (
              <button
                key={m.id}
                className={'header-admin-btn' + (activeModule === m.id ? ' active' : '')}
                onClick={() => onModuleChange(m.id)}
                title={m.name}
              >
                <Ico size={17} />
              </button>
            );
          })}
        </div>
        <div className="header-clock">
          <div className="time mono">{time}</div>
          <div className="date">{date}</div>
        </div>

        <div className="header-user" ref={dropRef}
          style={{ cursor: activeUsers.length > 1 ? 'pointer' : 'default', position: 'relative', userSelect: 'none' }}
          onClick={() => activeUsers.length > 1 && setShowUsers(v => !v)}
          title={activeUsers.length > 1 ? 'Cambiar usuario' : undefined}
        >
          <div className="user-avatar">{activeUser?.initials || 'US'}</div>
          <div className="user-info">
            <div className="u1">{activeUser?.nombre || 'Usuario'}</div>
            <div className="u2">{activeUser?.rol || 'cajero'}</div>
          </div>

          {showUsers && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              background: 'var(--surface-1)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              minWidth: 210, zIndex: 300, padding: '6px 0',
            }}>
              <div style={{ padding: '6px 14px 8px', fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Cambiar cajero
              </div>
              {activeUsers.map(u => (
                <button key={u.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    textAlign: 'left', padding: '8px 14px',
                    background: u.id === activeUser?.id ? 'var(--surface-2)' : 'transparent',
                    border: 'none', cursor: 'pointer', color: 'var(--text-1)',
                    fontSize: '0.875rem', fontFamily: 'inherit',
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    if (u.id === activeUser?.id) { setShowUsers(false); return; }
                    // Si el usuario tiene PIN configurado, pedirlo antes de cambiar
                    if (u.pin) {
                      const p = window.prompt(`PIN de ${u.nombre}:`);
                      if (p === null) return;
                      if (String(p).trim() !== String(u.pin)) {
                        window.alert('PIN incorrecto');
                        return;
                      }
                    }
                    onUserChange(u);
                    setShowUsers(false);
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
                  }}>{u.initials}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{u.rol}</div>
                  </div>
                  {u.id === activeUser?.id && (
                    <window.IconCheck size={14} style={{ marginLeft: 'auto', color: 'var(--orange)' }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="header-caja">
          <span className="caja-dot"></span>
          Caja 02
        </div>
      </div>
    </header>
  );
}

window.Header = Header;
