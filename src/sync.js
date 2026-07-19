// ========== SINCRONIZACIÓN CON SUPABASE ==========
// localStorage sigue siendo la fuente inmediata (la app nunca se bloquea por
// falta de red). Con sesión iniciada: cada cambio se sube (debounce) y al
// arrancar se baja lo de la nube. Las listas con id se fusionan para no pisar
// ventas hechas en otro dispositivo; los contadores toman el máximo.
(function () {
  'use strict';

  const URL = 'https://kupkkkpfltrgmqiaokaq.supabase.co';
  const KEY = 'sb_publishable_6hP8IDlFQ3yDqSvyeTHiEw_zpwyk1wE';

  // Claves que viajan a la nube. Quedan fuera: sgi_api_key (secreto por equipo),
  // respaldos y usuario activo (estado del dispositivo).
  const SYNC_KEYS = [
    'sgi_copiado_direct', 'sgi_print_paper', 'sgi_impreso_tipos', 'sgi_copiado_opciones',
    'sgi_gf_materials', 'sgi_gf_finish', 'sgi_gf_params', 'sgi_bordado_telas', 'sgi_bordado_precios',
    'sgi_usuarios', 'sgi_negocio', 'sgi_cfdi', 'sgi_gastos', 'sgi_ventas',
    'sgi_pedidos', 'sgi_coti_catalog', 'sgi_cotizaciones', 'sgi_tickets_pausados',
  ];
  const PREFIJOS_CONTADOR = ['sgi_ticket_num', 'sgi_coti_num_', 'sgi_cotiz_num_'];
  const MERGE_ID = ['sgi_ventas', 'sgi_pedidos', 'sgi_cotizaciones', 'sgi_gastos', 'sgi_cfdi'];

  const esContador = (k) => PREFIJOS_CONTADOR.some(p => k === p || k.indexOf(p) === 0);
  const esSync     = (k) => SYNC_KEYS.indexOf(k) >= 0 || esContador(k);

  if (!window.supabase || !window.supabase.createClient) { window.SGISync = null; return; }
  const cli = window.supabase.createClient(URL, KEY);

  let pendientes;
  try { pendientes = new Set(JSON.parse(localStorage.getItem('sgi_sync_pending') || '[]')); }
  catch { pendientes = new Set(); }
  const guardaPend = () => { try { localStorage.setItem('sgi_sync_pending', JSON.stringify([...pendientes])); } catch {} };

  let sesion = null;
  let estado = 'off';   // off | sync | ok | error
  let timer  = null;
  const oyentes = new Set();
  const avisa = () => oyentes.forEach(f => { try { f(estado); } catch {} });
  const pon = (e) => { estado = e; avisa(); };

  const lee = (k) => {
    try { const v = localStorage.getItem(k); return v === null ? undefined : JSON.parse(v); }
    catch { return undefined; }
  };
  const escribe = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  async function pushPendientes() {
    if (!sesion || pendientes.size === 0) return true;
    const claves = [...pendientes].filter(esSync);
    if (!claves.length) { pendientes.clear(); guardaPend(); return true; }
    pon('sync');
    // subir de una en una: una clave enorme o corrupta no debe frenar al resto
    let okTodas = true;
    for (const k of claves) {
      const v = lee(k);
      const fila = { key: k, value: v === undefined ? null : v, updated_at: new Date().toISOString() };
      const { error } = await cli.from('sgi_kv').upsert(fila);
      if (error) { console.error('SGISync push', k, ':', error.message); okTodas = false; continue; }
      pendientes.delete(k);
    }
    guardaPend();
    pon(okTodas ? 'ok' : 'error');
    return okTodas;
  }

  // Fusión por id: conserva la versión local de los ids en conflicto (traen
  // cambios hechos sin conexión) y agrega lo remoto que no exista localmente.
  function mergeListas(loc, rem) {
    const l = Array.isArray(loc) ? loc : [];
    const r = Array.isArray(rem) ? rem : [];
    const rIds = new Set(r.map(x => x && x.id));
    const soloLocal = l.filter(x => x && !rIds.has(x.id));
    const resto = r.map(x => {
      const lv = l.find(y => y && x && y.id === x.id);
      return lv || x;
    });
    return [...soloLocal, ...resto];
  }

  async function pullTodo() {
    if (!sesion) return { cambios: 0 };
    pon('sync');
    const { data, error } = await cli.from('sgi_kv').select('key,value');
    if (error) { console.error('SGISync pull:', error.message); pon('error'); return { cambios: 0, error }; }

    const remoto = new Map();
    data.forEach(f => { if (esSync(f.key)) remoto.set(f.key, f.value); });

    // claves locales que la nube no tiene → subirlas (primer arranque)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (esSync(k) && !remoto.has(k)) pendientes.add(k);
    }

    let cambios = 0;
    remoto.forEach((rv, k) => {
      const lv = lee(k);
      if (pendientes.has(k)) {
        // hay cambios locales sin subir: fusionar en vez de pisar
        if (MERGE_ID.indexOf(k) >= 0) {
          const m = mergeListas(lv, rv);
          if (JSON.stringify(m) !== JSON.stringify(lv)) { escribe(k, m); cambios++; }
        } else if (esContador(k)) {
          const mx = Math.max(Number(lv) || 0, Number(rv) || 0);
          if (mx !== (Number(lv) || 0)) { escribe(k, mx); cambios++; }
        }
        // resto: gana lo local (sigue pendiente y se sube abajo)
      } else if (JSON.stringify(lv) !== JSON.stringify(rv)) {
        escribe(k, rv);
        cambios++;
      }
    });

    guardaPend();
    const okPush = await pushPendientes();
    pon(okPush ? 'ok' : 'error');
    return { cambios };
  }

  window.SGISync = {
    get sesion() { return sesion; },
    get estado() { return estado; },
    get pendientes() { return pendientes.size; },
    onEstado(f) { oyentes.add(f); return () => oyentes.delete(f); },
    queuePush(k) {
      if (!esSync(k)) return;
      pendientes.add(k); guardaPend();
      if (sesion) { clearTimeout(timer); timer = setTimeout(pushPendientes, 1500); }
    },
    async init() {
      const { data } = await cli.auth.getSession();
      sesion = (data && data.session) || null;
      cli.auth.onAuthStateChange((_e, s) => { sesion = s; });
      if (sesion) pon('ok');
      return sesion;
    },
    async login(email, pass) {
      const { data, error } = await cli.auth.signInWithPassword({ email: email, password: pass });
      if (error) throw error;
      sesion = data.session;
      pon('ok');
      return sesion;
    },
    async logout() { try { await cli.auth.signOut(); } catch {} sesion = null; pon('off'); },
    sync: pullTodo,
    pushAhora: pushPendientes,
  };

  // red de seguridad: reintenta subir pendientes periódicamente y al volver a la pestaña
  setInterval(pushPendientes, 60000);
  window.addEventListener('focus', pushPendientes);
})();
