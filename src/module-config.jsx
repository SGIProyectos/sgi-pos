// ========== MÓDULO CONFIGURACIÓN ==========

// ---- Shared sub-components ----

function CfgToggle({ value, onChange }) {
  return (
    <button type="button" className={'cfg-toggle' + (value ? ' on' : '')} onClick={() => onChange(!value)}>
      <span className="cfg-toggle-knob" />
    </button>
  );
}

function CfgModal({ title, onClose, onSave, saveDisabled, children }) {
  return (
    <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cfg-modal">
        <div className="cfg-modal-head">
          <span className="cfg-modal-title">{title}</span>
          <button className="cfg-modal-x" onClick={onClose}><window.IconX size={18} /></button>
        </div>
        <div className="cfg-modal-body">{children}</div>
        <div className="cfg-modal-foot">
          <button className="cfg-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="cfg-btn-save" onClick={onSave} disabled={saveDisabled}>
            <window.IconCheck size={15} /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function CfgToolbar({ title, sub, onAdd, addLabel, onSave, dirty }) {
  return (
    <div className="cfg-toolbar">
      <div>
        <div className="cfg-section-title">{title}</div>
        {sub && <div className="cfg-section-sub">{sub}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {onSave && (
          <button className="cfg-btn-save" onClick={onSave} disabled={!dirty}
            style={{ opacity: dirty ? 1 : 0.45 }}>
            <window.IconCheck size={14} /> Guardar
          </button>
        )}
        {onAdd && (
          <button className="cfg-btn-add" onClick={onAdd}>
            <window.IconPlus size={15} /> {addLabel || 'Agregar'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Row-level delete confirm ----
function RowActions({ id, delId, setDelId, onEdit, onDel }) {
  if (delId === id) {
    return (
      <td className="cfg-row-actions">
        <button className="cfg-act danger" onClick={() => onDel(id)}>¿Eliminar?</button>
        <button className="cfg-act" onClick={() => setDelId(null)}>No</button>
      </td>
    );
  }
  return (
    <td className="cfg-row-actions">
      <button className="cfg-act" onClick={onEdit} title="Editar"><window.IconEdit size={14} /></button>
      <button className="cfg-act danger-soft" onClick={() => setDelId(id)} title="Eliminar"><window.IconTrash size={14} /></button>
    </td>
  );
}

// ---- Lista editable genérica (tabla inline con guardar) ----
function CfgLista({ title, sub, cols, value, onCommit, newRow, onToast, minRows = 1, sortBy, hint, addLabel }) {
  const _toStr = (list) => list.map(r => {
    const o = { ...r };
    cols.forEach(c => { if (c.type === 'number') o[c.key] = r[c.key] == null ? '' : String(r[c.key]); });
    return o;
  });
  const [rows,  setRows]  = React.useState(() => _toStr(value));
  const [dirty, setDirty] = React.useState(false);

  const up  = (i, k, v) => { setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r)); setDirty(true); };
  const del = (i)       => { setRows(rs => rs.filter((_, j) => j !== i)); setDirty(true); };
  const add = ()        => { setRows(rs => [...rs, { id: window.uid(), ...newRow }]); setDirty(true); };

  const save = () => {
    let parsed = rows
      .filter(r => String(r[cols[0].key] || '').trim() !== '')
      .map(r => {
        const o = { ...r };
        cols.forEach(c => {
          if (c.type === 'number') { const n = parseFloat(r[c.key]); o[c.key] = isNaN(n) ? (c.def || 0) : n; }
          else if (c.type === 'text') o[c.key] = String(r[c.key] || '').trim();
        });
        return o;
      });
    if (parsed.length < minRows) { onToast(`"${title}" requiere al menos ${minRows} registro(s)`); return; }
    if (sortBy) parsed = [...parsed].sort((a, b) => a[sortBy] - b[sortBy]);
    onCommit(parsed);
    setRows(_toStr(parsed)); setDirty(false);
    onToast(`${title}: guardado`);
  };

  return (
    <div className="cfg-sublist">
      <div className="cfg-sublist-head">
        <div className="cfg-sublist-head-l">
          <div className="cfg-section-title">{title}</div>
          {sub && <div className="cfg-section-sub">{sub}</div>}
        </div>
        <button className="cfg-sublist-save" onClick={save} disabled={!dirty}>
          <window.IconCheck size={12} /> Guardar
        </button>
      </div>
      <div className="cfg-subtable-wrap">
        <table className="cfg-table">
          <thead>
            <tr>{cols.map(c => <th key={c.key} className={c.r ? 'r' : ''}>{c.label}</th>)}<th></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                {cols.map(c => (
                  <td key={c.key} className={c.r ? 'r' : ''}>
                    {c.type === 'toggle'
                      ? <CfgToggle value={r[c.key] !== false} onChange={v => up(i, c.key, v)} />
                      : <input type={c.type === 'number' ? 'number' : 'text'}
                          value={r[c.key] ?? ''} step={c.step} min={c.min} placeholder={c.ph || ''}
                          onChange={e => up(i, c.key, e.target.value)} />}
                  </td>
                ))}
                <td className="cfg-row-actions">
                  <button className="cfg-act danger-soft" onClick={() => del(i)} title="Eliminar"><window.IconTrash size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="cfg-act cfg-sublist-add" onClick={add}>
        <window.IconPlus size={13} /> {addLabel || 'Agregar'}
      </button>
      {hint && <div className="cfg-sublist-hint">{hint}</div>}
    </div>
  );
}

// ========== IMPORTADOR POR LOTE ==========
const _IMPORT_SCHEMAS = {
  copiado: [
    { key:'name',      label:'nombre',       type:'text',    sample:'Copia B/N Carta' },
    { key:'price',     label:'precio',       type:'number',  sample:2.50 },
    { key:'unidad',    label:'unidad',       type:'text',    sample:'por hoja' },
    { key:'categoria', label:'categoria',    type:'text',    sample:'copias' },
    { key:'desc',      label:'descripcion',  type:'text',    sample:'Bond 75g carta' },
    { key:'activo',    label:'activo',       type:'boolean', sample:'si' },
  ],
  granformato: [
    { key:'name',   label:'nombre',      type:'text',    sample:'Lona 13oz' },
    { key:'price',  label:'precio_m2',   type:'number',  sample:85 },
    { key:'desc',   label:'descripcion', type:'text',    sample:'Mate exterior' },
    { key:'activo', label:'activo',      type:'boolean', sample:'si' },
  ],
  bordado: [
    { key:'name',   label:'nombre',        type:'text',    sample:'Algodón' },
    { key:'mult',   label:'multiplicador', type:'number',  sample:1.00 },
    { key:'activo', label:'activo',        type:'boolean', sample:'si' },
  ],
};

function _CatImporter({ catalogId, schema, items, commit, onToast }) {
  const [preview, setPreview] = React.useState(null);

  const downloadTemplate = () => {
    const XLSX = window.XLSX;
    if (!XLSX) { onToast('Librería XLSX no disponible'); return; }
    const headers = schema.map(s => s.label);
    const sample  = schema.map(s => s.sample ?? '');
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = schema.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catalogo');
    XLSX.writeFile(wb, `plantilla-${catalogId}.xlsx`);
  };

  const parseBool = v => {
    if (v === '' || v === undefined || v === null) return true;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number')  return v !== 0;
    const s = String(v).toLowerCase().trim();
    return ['si','sí','true','1','yes','x','activo'].includes(s);
  };

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const XLSX = window.XLSX;
    if (!XLSX) { onToast('Librería XLSX no disponible'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb   = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const parsed = rows.map(row => {
          const item = {};
          schema.forEach(s => {
            let val = row[s.label] !== undefined ? row[s.label]
                    : row[s.key]   !== undefined ? row[s.key] : '';
            if      (s.type === 'number')  val = parseFloat(val) || 0;
            else if (s.type === 'boolean') val = parseBool(val);
            else                           val = String(val).trim();
            item[s.key] = val;
          });
          return item;
        }).filter(r => String(r.name || '').trim());
        if (!parsed.length) { onToast('No se encontraron filas válidas'); return; }
        setPreview({ rows: parsed, mode: 'agregar' });
      } catch { onToast('Error al leer el archivo'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const doImport = () => {
    if (!preview) return;
    let next;
    if (preview.mode === 'reemplazar') {
      next = preview.rows.map(r => ({ ...r, id: window.uid() }));
      onToast(`${next.length} registros importados (catálogo reemplazado)`);
    } else {
      const existing = new Set(items.map(i => (i.name || '').toLowerCase()));
      const newItems  = preview.rows
        .filter(r => !existing.has((r.name || '').toLowerCase()))
        .map(r => ({ ...r, id: window.uid() }));
      const skipped = preview.rows.length - newItems.length;
      next = [...items, ...newItems];
      onToast(`${newItems.length} importados${skipped ? `, ${skipped} duplicados omitidos` : ''}`);
    }
    commit(next);
    setPreview(null);
  };

  return (
    <>
      <div className="cat-import-bar">
        <button className="cfg-btn-tpl" onClick={downloadTemplate} title="Descargar plantilla con columnas del catálogo">
          Plantilla .xlsx
        </button>
        <label className="cfg-btn-imp" title="Importar desde archivo Excel (.xlsx) o CSV">
          Importar archivo
          <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={handleFile} />
        </label>
      </div>

      {preview && (
        <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && setPreview(null)}>
          <div className="cfg-modal" style={{maxWidth:700}}>
            <div className="cfg-modal-head">
              <span className="cfg-modal-title">Vista previa — {preview.rows.length} registros detectados</span>
              <button className="cfg-modal-x" onClick={() => setPreview(null)}><window.IconX size={18} /></button>
            </div>
            <div className="cfg-modal-body">
              <div className="cat-import-modes">
                {[['agregar','Agregar nuevos (omitir duplicados)'],['reemplazar','Reemplazar todo el catálogo']].map(([m,lbl]) => (
                  <label key={m} className={'cat-imp-opt' + (preview.mode===m?' on':'')}>
                    <input type="radio" name={'imp-'+catalogId} value={m}
                      checked={preview.mode===m}
                      onChange={() => setPreview(p => ({ ...p, mode: m }))} />
                    {lbl}
                  </label>
                ))}
              </div>
              {preview.mode === 'reemplazar' && (
                <div className="cat-import-warn">
                  Todos los registros actuales serán eliminados y reemplazados. Esta acción no se puede deshacer.
                </div>
              )}
              <div className="cat-import-preview">
                <table className="cfg-table">
                  <thead><tr>{schema.map(s => <th key={s.key}>{s.label}</th>)}</tr></thead>
                  <tbody>
                    {preview.rows.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        {schema.map(s => (
                          <td key={s.key} className={s.type==='number'?'r mono':''}>
                            {s.type==='boolean' ? (row[s.key]?'Sí':'No') : row[s.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 8 && (
                  <div className="cat-import-more">…y {preview.rows.length - 8} registros más</div>
                )}
              </div>
            </div>
            <div className="cfg-modal-foot">
              <button className="cfg-btn-cancel" onClick={() => setPreview(null)}>Cancelar</button>
              <button className="cfg-btn-save" onClick={doImport}>
                <window.IconCheck size={15} /> Importar {preview.rows.length} registros
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ========== COPIADO ==========
const _UNIDADES   = ['por hoja', 'por trabajo', 'por metro', 'por pieza', 'por juego', 'por color'];
const _CATEGORIAS = ['copias', 'escaneo', 'acabados', 'impresion', 'otros'];
const _ICON_KEYS  = ['copy', 'scan', 'shield', 'book', 'printer', 'image', 'blueprint', 'note'];

const _CD_EMPTY = { name:'', desc:'', price:'', unidad:'por hoja', categoria:'copias', iconKey:'copy', activo:true };

function CfgCopiado({ onToast }) {
  const [items, setItems] = React.useState(() => [...window.COPIADO_DIRECT_RAW]);
  const [form,  setForm]  = React.useState(null);
  const [delId, setDelId] = React.useState(null);

  const commit = (next) => { setItems(next); window.refreshCopiadoDirect(next); };
  const sf = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = () => {
    if (!form.name || !form.price) return;
    const item = { ...form, price: parseFloat(form.price) };
    const next = item.id
      ? items.map(i => i.id === item.id ? item : i)
      : [...items, { ...item, id: window.uid() }];
    commit(next);
    setForm(null);
    onToast(item.id ? 'Servicio actualizado' : 'Servicio creado');
  };

  const del = (id) => { commit(items.filter(i => i.id !== id)); setDelId(null); onToast('Servicio eliminado'); };
  const toggle = (id) => commit(items.map(i => i.id === id ? { ...i, activo: !i.activo } : i));

  return (
    <div className="cfg-section">
      <CfgToolbar
        title="Servicios de Copiado"
        sub="Servicios de acceso rápido con precio fijo"
        onAdd={() => setForm({ ..._CD_EMPTY })}
        addLabel="Agregar servicio"
      />
      <_CatImporter catalogId="copiado" schema={_IMPORT_SCHEMAS.copiado}
        items={items} commit={commit} onToast={onToast} />
      <table className="cfg-table">
        <thead>
          <tr>
            <th>Nombre</th><th>Descripción</th><th>Categoría</th>
            <th>Unidad</th><th className="r">Precio</th><th>Activo</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className={item.activo === false ? 'cfg-inactive' : ''}>
              <td className="fw6">{item.name}</td>
              <td className="muted">{item.desc || '—'}</td>
              <td><span className="cfg-badge">{item.categoria}</span></td>
              <td className="muted">{item.unidad}</td>
              <td className="r mono">{window.fmt(item.price)}</td>
              <td><CfgToggle value={item.activo !== false} onChange={() => toggle(item.id)} /></td>
              <RowActions id={item.id} delId={delId} setDelId={setDelId}
                onEdit={() => setForm({ ...item })} onDel={del} />
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <CfgModal title={form.id ? 'Editar servicio' : 'Nuevo servicio'} onClose={() => setForm(null)}
          onSave={save} saveDisabled={!form.name || !form.price}>
          <div className="cfg-form-grid">
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Nombre del servicio *</label>
              <input value={form.name} onChange={e => sf('name', e.target.value)}
                placeholder="Ej: Copia B/N Carta" autoFocus />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Descripción breve</label>
              <input value={form.desc || ''} onChange={e => sf('desc', e.target.value)}
                placeholder="Ej: Bond 75g · carta" />
            </div>
            <div className="field">
              <label>Precio unitario *</label>
              <div className="suffix-input">
                <input type="number" min="0" step="0.5" value={form.price}
                  onChange={e => sf('price', e.target.value)} placeholder="0.00" />
                <span className="suffix">MXN</span>
              </div>
            </div>
            <div className="field">
              <label>Unidad</label>
              <select value={form.unidad} onChange={e => sf('unidad', e.target.value)}>
                {_UNIDADES.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Categoría</label>
              <select value={form.categoria} onChange={e => sf('categoria', e.target.value)}>
                {_CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Ícono</label>
              <select value={form.iconKey} onChange={e => sf('iconKey', e.target.value)}>
                {_ICON_KEYS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <div className="cfg-activo-row">
                <CfgToggle value={form.activo !== false} onChange={v => sf('activo', v)} />
                Servicio activo
              </div>
            </div>
          </div>
        </CfgModal>
      )}
    </div>
  );
}

// ========== COPIADO: OPCIONES DE PANELES ==========
function CfgCopiadoOpciones({ onToast }) {
  const [rev, setRev] = React.useState(0);
  const patch = (key) => (arr) => window.refreshCopiadoOpciones({ ...window.COPIADO_OPC, [key]: arr });

  const [mults, setMults] = React.useState(() => ({
    color: String(window.COPIADO_OPC.colorMult),
    doble: String(window.COPIADO_OPC.dobleCaraMult),
  }));
  const [mDirty, setMDirty] = React.useState(false);
  const upM = (k, v) => { setMults(p => ({ ...p, [k]: v })); setMDirty(true); };
  const saveMults = () => {
    const c = parseFloat(mults.color), d = parseFloat(mults.doble);
    if (isNaN(c) || c <= 0 || isNaN(d) || d <= 0) { onToast('Multiplicadores inválidos'); return; }
    window.refreshCopiadoOpciones({ ...window.COPIADO_OPC, colorMult: c, dobleCaraMult: d });
    setMDirty(false); onToast('Multiplicadores guardados');
  };

  const restore = () => {
    window.refreshCopiadoOpciones(JSON.parse(JSON.stringify(window.COPIADO_OPC_DEFAULTS)));
    setMults({ color: String(window.COPIADO_OPC.colorMult), doble: String(window.COPIADO_OPC.dobleCaraMult) });
    setMDirty(false); setRev(r => r + 1);
    onToast('Opciones de copiado restauradas a los valores por defecto');
  };

  return (
    <>
      <div className="cfg-section">
        <CfgToolbar title="Panel de Impresión"
          sub="Papeles, acabados, urgencias y multiplicadores usados al cotizar una impresión" />
        <div className="cfg-section-body">
        <div className="cfg-mults">
          <div className="field">
            <label>Multiplicador color (vs B/N)</label>
            <div className="suffix-input">
              <input type="number" min="1" step="0.1" value={mults.color} onChange={e => upM('color', e.target.value)} />
              <span className="suffix">×</span>
            </div>
          </div>
          <div className="field">
            <label>Multiplicador 2 caras (vs 1 cara)</label>
            <div className="suffix-input">
              <input type="number" min="1" step="0.1" value={mults.doble} onChange={e => upM('doble', e.target.value)} />
              <span className="suffix">×</span>
            </div>
          </div>
          <button className="cfg-sublist-save" onClick={saveMults} disabled={!mDirty} style={{ padding: '7px 14px', fontSize: 12 }}>
            <window.IconCheck size={13} /> Guardar multiplicadores
          </button>
        </div>
        <div className="cfg-sublists">
          <CfgLista key={'pp' + rev} title="Papeles de impresión" sub="Precio base por hoja B/N 1 cara"
            cols={[
              { key:'name',   label:'Papel',    type:'text',   ph:'Ej: Bond Carta 75g' },
              { key:'price',  label:'$ / hoja', type:'number', r:true, step:0.5, min:0, w:90 },
              { key:'activo', label:'Activo',   type:'toggle' },
            ]}
            value={window.PRINT_PAPER_RAW} onCommit={arr => window.refreshPrintPaper(arr)}
            newRow={{ name:'', price:'', activo:true }} onToast={onToast} addLabel="Agregar papel" />
          <div className="cfg-sublist-col">
            <CfgLista key={'pf' + rev} title="Acabados de impresión" sub="Costo extra por hoja"
              cols={[
                { key:'name',  label:'Acabado', type:'text' },
                { key:'price', label:'Extra $', type:'number', r:true, step:1, min:0, w:90 },
              ]}
              value={window.COPIADO_OPC.printFinish} onCommit={patch('printFinish')}
              newRow={{ name:'', price:'' }} onToast={onToast} addLabel="Agregar acabado" />
            <CfgLista key={'pu' + rev} title="Urgencias de impresión" sub="Multiplicador sobre el precio final"
              cols={[
                { key:'name', label:'Nivel',   type:'text' },
                { key:'time', label:'Tiempo',  type:'text', ph:'Ej: 24 hrs', w:110 },
                { key:'mult', label:'Mult ×',  type:'number', r:true, step:0.05, min:1, w:80, def:1 },
              ]}
              value={window.COPIADO_OPC.printUrgency} onCommit={patch('printUrgency')}
              newRow={{ name:'', time:'', mult:'1' }} onToast={onToast} addLabel="Agregar urgencia" />
          </div>
        </div>
        </div>
      </div>

      <div className="cfg-section">
        <CfgToolbar title="Engargolado y Planos"
          sub="Tipos de arillo, pastas, y tipos/tamaños de plano" />
        <div className="cfg-section-body">
        <div className="cfg-sublists">
          <div className="cfg-sublist-col">
            <CfgLista key={'et' + rev} title="Tipos de engargolado" sub="Precio del arillo por trabajo"
              cols={[
                { key:'name',  label:'Tipo',    type:'text' },
                { key:'price', label:'$',       type:'number', r:true, step:5, min:0, w:90 },
              ]}
              value={window.COPIADO_OPC.engargoTipos} onCommit={patch('engargoTipos')}
              newRow={{ name:'', price:'' }} onToast={onToast} addLabel="Agregar tipo" />
            <CfgLista key={'ep' + rev} title="Pastas de engargolado" sub="Precio por pasta (se cobran 2)"
              cols={[
                { key:'name',  label:'Pasta',   type:'text' },
                { key:'price', label:'$ c/u',   type:'number', r:true, step:1, min:0, w:90 },
              ]}
              value={window.COPIADO_OPC.engargoPastas} onCommit={patch('engargoPastas')}
              newRow={{ name:'', price:'' }} onToast={onToast} addLabel="Agregar pasta" />
          </div>
          <div className="cfg-sublist-col">
            <CfgLista key={'pt' + rev} title="Planos — tipo de impresión" sub="Precio base por plano 60×90"
              cols={[
                { key:'name',  label:'Tipo',    type:'text' },
                { key:'price', label:'$ base',  type:'number', r:true, step:1, min:0, w:90 },
              ]}
              value={window.COPIADO_OPC.planosTipo} onCommit={patch('planosTipo')}
              newRow={{ name:'', price:'' }} onToast={onToast} addLabel="Agregar tipo" />
            <CfgLista key={'pz' + rev} title="Planos — tamaños" sub="Multiplicador sobre el precio base"
              cols={[
                { key:'name', label:'Tamaño',  type:'text', ph:'Ej: 90×120 cm' },
                { key:'mult', label:'Mult ×',  type:'number', r:true, step:0.1, min:0.1, w:80, def:1 },
              ]}
              value={window.COPIADO_OPC.planosTam} onCommit={patch('planosTam')}
              newRow={{ name:'', mult:'1' }} onToast={onToast} addLabel="Agregar tamaño" />
          </div>
        </div>
        </div>
      </div>

      <div className="cfg-section">
        <CfgToolbar title="Material Impreso"
          sub="Tipos de producto, volúmenes con descuento, papeles, acabados y urgencias" />
        <div className="cfg-section-body">
        <CfgLista key={'it' + rev} title="Tipos de producto" sub="Precio unitario base y cantidad mínima"
          cols={[
            { key:'name',      label:'Producto',   type:'text' },
            { key:'size',      label:'Tamaño',     type:'text', w:110 },
            { key:'desc',      label:'Descripción',type:'text' },
            { key:'unitPrice', label:'$ unitario', type:'number', r:true, step:0.5, min:0, w:90 },
            { key:'minQty',    label:'Mín. pzas',  type:'number', r:true, step:5, min:1, w:80, def:1 },
            { key:'activo',    label:'Activo',     type:'toggle' },
          ]}
          value={window.IMPRESO_TIPOS_RAW} onCommit={arr => window.refreshImpresoTipos(arr)}
          newRow={{ name:'', size:'', desc:'', unitPrice:'', minQty:'25', activo:true }}
          onToast={onToast} addLabel="Agregar producto" />
        <div className="cfg-sublists" style={{ marginTop: 24 }}>
          <div className="cfg-sublist-col">
            <CfgLista key={'iv' + rev} title="Volúmenes" sub="Multiplicador de precio según cantidad" sortBy="qty"
              cols={[
                { key:'label',     label:'Etiqueta', type:'text', ph:'Ej: 100 pzas', w:110 },
                { key:'qty',       label:'Cantidad', type:'number', r:true, step:5, min:1, w:80, def:1 },
                { key:'priceMult', label:'Mult ×',   type:'number', r:true, step:0.01, min:0.01, w:80, def:1 },
              ]}
              value={window.COPIADO_OPC.impresoVol} onCommit={patch('impresoVol')}
              newRow={{ label:'', qty:'', priceMult:'1' }} onToast={onToast} addLabel="Agregar volumen" />
            <CfgLista key={'ip' + rev} title="Papeles" sub="Multiplicador sobre el precio unitario"
              cols={[
                { key:'name', label:'Papel',  type:'text' },
                { key:'mult', label:'Mult ×', type:'number', r:true, step:0.05, min:0.05, w:80, def:1 },
              ]}
              value={window.COPIADO_OPC.impresoPapeles} onCommit={patch('impresoPapeles')}
              newRow={{ name:'', mult:'1' }} onToast={onToast} addLabel="Agregar papel" />
          </div>
          <div className="cfg-sublist-col">
            <CfgLista key={'ia' + rev} title="Acabados" sub="Recargo porcentual y/o fijo"
              hint="% recargo en fracción: 0.20 = +20%. El fijo se suma al total."
              cols={[
                { key:'name',    label:'Acabado',  type:'text' },
                { key:'addPct',  label:'% (frac.)',type:'number', r:true, step:0.05, min:0, w:80 },
                { key:'addFlat', label:'Fijo $',   type:'number', r:true, step:10, min:0, w:80 },
              ]}
              value={window.COPIADO_OPC.impresoAcabados} onCommit={patch('impresoAcabados')}
              newRow={{ name:'', addPct:'0', addFlat:'0' }} onToast={onToast} addLabel="Agregar acabado" />
            <CfgLista key={'iu' + rev} title="Urgencias" sub="Multiplicador sobre el total"
              cols={[
                { key:'name', label:'Nivel',  type:'text' },
                { key:'time', label:'Tiempo', type:'text', ph:'Ej: 3–5 días', w:110 },
                { key:'mult', label:'Mult ×', type:'number', r:true, step:0.05, min:1, w:80, def:1 },
              ]}
              value={window.COPIADO_OPC.impresoUrgencia} onCommit={patch('impresoUrgencia')}
              newRow={{ name:'', time:'', mult:'1' }} onToast={onToast} addLabel="Agregar urgencia" />
          </div>
        </div>
        <button className="cfg-restore-link" onClick={restore}>
          Restaurar todas las opciones de copiado a los valores por defecto (no afecta papeles de impresión ni tipos de producto)
        </button>
        </div>
      </div>
    </>
  );
}

// ========== GRAN FORMATO ==========
const _GF_EMPTY = { name:'', desc:'', price:'', activo:true, rollos:[] };

// Margen de sellado y traslape de unión (se capturan en cm, se guardan en m)
function _GfParamsCard({ onToast }) {
  const [margen,   setMargen]   = React.useState(() => String(Math.round((window.GF_PARAMS.margen   || 0) * 1000) / 10));
  const [traslape, setTraslape] = React.useState(() => String(Math.round((window.GF_PARAMS.traslape || 0) * 1000) / 10));
  const save = () => {
    window.refreshGfParams({
      margen:   Math.max(0, parseFloat(margen)   || 0) / 100,
      traslape: Math.max(0, parseFloat(traslape) || 0) / 100,
    });
    onToast('Parámetros de acomodo en rollo guardados');
  };
  return (
    <div className="cfg-section" style={{marginTop:18, maxWidth:560}}>
      <h3 style={{fontSize:'0.95rem', marginBottom:4}}>Acomodo en rollo</h3>
      <p style={{fontSize:'0.8rem', color:'var(--text-3)', marginBottom:12}}>
        El margen de sellado es el espacio que necesita cada pieza por lado para
        dobladillo/bastilla y corte — decide cuántas piezas caben lado a lado en
        el ancho del rollo. El traslape es lo que se encima cada unión cuando una
        lona grande se arma con varias tiras.
      </p>
      <div className="cfg-form-grid" style={{gridTemplateColumns:'1fr 1fr auto', alignItems:'end'}}>
        <div className="field">
          <label>Margen de sellado por lado</label>
          <div className="suffix-input">
            <input type="number" min="0" step="0.5" value={margen}
              onChange={e => setMargen(e.target.value)} />
            <span className="suffix">cm</span>
          </div>
        </div>
        <div className="field">
          <label>Traslape de unión entre tiras</label>
          <div className="suffix-input">
            <input type="number" min="0" step="0.5" value={traslape}
              onChange={e => setTraslape(e.target.value)} />
            <span className="suffix">cm</span>
          </div>
        </div>
        <button className="cfg-btn-save" onClick={save} style={{height:38}}>
          <window.IconCheck size={15} /> Guardar
        </button>
      </div>
    </div>
  );
}

function CfgGranFormato({ onToast }) {
  const [items, setItems] = React.useState(() => [...window.GF_MATERIALS_RAW]);
  const [form,  setForm]  = React.useState(null);
  const [delId, setDelId] = React.useState(null);

  const commit = (next) => { setItems(next); window.refreshGfMaterials(next); };
  const sf = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = () => {
    if (!form.name || !form.price) return;
    const rollos = (form._rollosStr || '')
      .split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v) && v > 0)
      .sort((a, b) => a - b);
    const { _rollosStr, ...rest } = form;
    const item = { ...rest, price: parseFloat(form.price), rollos };
    const next = item.id
      ? items.map(i => i.id === item.id ? item : i)
      : [...items, { ...item, id: window.uid() }];
    commit(next);
    setForm(null);
    onToast(item.id ? 'Material actualizado' : 'Material creado');
  };

  const del = (id) => { commit(items.filter(i => i.id !== id)); setDelId(null); onToast('Material eliminado'); };
  const toggle = (id) => commit(items.map(i => i.id === id ? { ...i, activo: !i.activo } : i));

  return (
    <div className="cfg-section">
      <CfgToolbar
        title="Materiales Gran Formato"
        sub="Sustratos disponibles para impresión, con precio por m²"
        onAdd={() => setForm({ ..._GF_EMPTY })}
        addLabel="Agregar material"
      />
      <_CatImporter catalogId="granformato" schema={_IMPORT_SCHEMAS.granformato}
        items={items} commit={commit} onToast={onToast} />
      <table className="cfg-table">
        <thead>
          <tr><th>Material</th><th>Descripción</th><th>Rollos disponibles</th><th className="r">Precio / m²</th><th>Activo</th><th></th></tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className={item.activo === false ? 'cfg-inactive' : ''}>
              <td className="fw6">{item.name}</td>
              <td className="muted">{item.desc || '—'}</td>
              <td className="mono muted" style={{fontSize:'0.78rem'}}>
                {(item.rollos||[]).length ? item.rollos.map(r=>r+'m').join(' · ') : '—'}
              </td>
              <td className="r mono">{window.fmt(item.price)}</td>
              <td><CfgToggle value={item.activo !== false} onChange={() => toggle(item.id)} /></td>
              <RowActions id={item.id} delId={delId} setDelId={setDelId}
                onEdit={() => setForm({ ...item, _rollosStr: (item.rollos||[]).join(', ') })} onDel={del} />
            </tr>
          ))}
        </tbody>
      </table>

      <_GfParamsCard onToast={onToast} />

      {form && (
        <CfgModal title={form.id ? 'Editar material' : 'Nuevo material'} onClose={() => setForm(null)}
          onSave={save} saveDisabled={!form.name || !form.price}>
          <div className="cfg-form-grid">
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Nombre del material *</label>
              <input value={form.name} onChange={e => sf('name', e.target.value)}
                placeholder="Ej: Lona 13 oz" autoFocus />
            </div>
            <div className="field">
              <label>Precio por m² *</label>
              <div className="suffix-input">
                <input type="number" min="0" step="5" value={form.price}
                  onChange={e => sf('price', e.target.value)} placeholder="0.00" />
                <span className="suffix">MXN</span>
              </div>
            </div>
            <div className="field">
              <label>Descripción</label>
              <input value={form.desc || ''} onChange={e => sf('desc', e.target.value)}
                placeholder="Ej: Mate, Premium..." />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Anchos de rollo disponibles (metros, separados por coma)</label>
              <input value={form._rollosStr || ''} placeholder="Ej: 1.10, 1.60, 2.05, 2.50, 3.20"
                onChange={e => sf('_rollosStr', e.target.value)} />
              <div style={{fontSize:'0.75rem', color:'var(--text-3)', marginTop:4}}>
                El sistema selecciona el rollo más pequeño que cubra el ancho del trabajo.
              </div>
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <div className="cfg-activo-row">
                <CfgToggle value={form.activo !== false} onChange={v => sf('activo', v)} />
                Material activo
              </div>
            </div>
          </div>
        </CfgModal>
      )}
    </div>
  );
}

// ========== GRAN FORMATO: ACABADOS ==========
function CfgGfAcabados({ onToast }) {
  const [rev, setRev] = React.useState(0);
  const restore = () => {
    window.refreshGfFinish(JSON.parse(JSON.stringify(window.GF_FINISH_DEFAULTS)));
    setRev(r => r + 1);
    onToast('Acabados de gran formato restaurados a los valores por defecto');
  };
  return (
    <div className="cfg-section" style={{ maxWidth: 560 }}>
      <div className="cfg-section-body">
        <CfgLista key={rev} title="Acabados Gran Formato" sub="Costo extra fijo por trabajo según acabado (ojillos, bastilla, etc.)"
          cols={[
            { key:'name', label:'Acabado', type:'text' },
            { key:'add',  label:'Extra $', type:'number', r:true, step:5, min:0, w:90 },
          ]}
          value={window.GF_FINISH} onCommit={arr => window.refreshGfFinish(arr)}
          newRow={{ name:'', add:'' }} onToast={onToast} addLabel="Agregar acabado" />
        <button className="cfg-restore-link" onClick={restore}>
          Restaurar acabados por defecto
        </button>
      </div>
    </div>
  );
}

// ========== BORDADO ==========
const _BT_EMPTY = { name:'', mult:'1.00', activo:true };

function CfgBordado({ onToast }) {
  const [items, setItems] = React.useState(() => [...window.BORDADO_TELAS_RAW]);
  const [form,  setForm]  = React.useState(null);
  const [delId, setDelId] = React.useState(null);

  const commit = (next) => { setItems(next); window.refreshBordadoTelas(next); };
  const sf = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = () => {
    if (!form.name || !form.mult) return;
    const item = { ...form, mult: parseFloat(form.mult) };
    const next = item.id
      ? items.map(i => i.id === item.id ? item : i)
      : [...items, { ...item, id: window.uid() }];
    commit(next);
    setForm(null);
    onToast(item.id ? 'Tela actualizada' : 'Tela creada');
  };

  const del = (id) => { commit(items.filter(i => i.id !== id)); setDelId(null); onToast('Tela eliminada'); };
  const toggle = (id) => commit(items.map(i => i.id === id ? { ...i, activo: !i.activo } : i));

  return (
    <div className="cfg-section">
      <CfgToolbar
        title="Telas de Bordado"
        sub="Tipos de tela con su multiplicador de precio base"
        onAdd={() => setForm({ ..._BT_EMPTY })}
        addLabel="Agregar tela"
      />
      <_CatImporter catalogId="bordado" schema={_IMPORT_SCHEMAS.bordado}
        items={items} commit={commit} onToast={onToast} />
      <table className="cfg-table">
        <thead>
          <tr><th>Tela</th><th className="r">Multiplicador</th><th>Activo</th><th></th></tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className={item.activo === false ? 'cfg-inactive' : ''}>
              <td className="fw6">{item.name}</td>
              <td className="r mono">×{Number(item.mult).toFixed(2)}</td>
              <td><CfgToggle value={item.activo !== false} onChange={() => toggle(item.id)} /></td>
              <RowActions id={item.id} delId={delId} setDelId={setDelId}
                onEdit={() => setForm({ ...item, mult: String(item.mult) })} onDel={del} />
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <CfgModal title={form.id ? 'Editar tela' : 'Nueva tela'} onClose={() => setForm(null)}
          onSave={save} saveDisabled={!form.name || !form.mult}>
          <div className="cfg-form-grid">
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Nombre de la tela *</label>
              <input value={form.name} onChange={e => sf('name', e.target.value)}
                placeholder="Ej: Algodón" autoFocus />
            </div>
            <div className="field">
              <label>Multiplicador de precio *</label>
              <div className="suffix-input">
                <input type="number" min="0.1" step="0.05" value={form.mult}
                  onChange={e => sf('mult', e.target.value)} placeholder="1.00" />
                <span className="suffix">×</span>
              </div>
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <div className="cfg-activo-row">
                <CfgToggle value={form.activo !== false} onChange={v => sf('activo', v)} />
                Tela activa
              </div>
            </div>
          </div>
        </CfgModal>
      )}
    </div>
  );
}

// ========== BORDADO: PRECIOS ==========
function CfgBordadoPrecios({ onToast }) {
  const _load = () => {
    const p = window.BORDADO_PRECIOS;
    return {
      minPunt:       String(p.minPunt),
      digitBasico:   String(p.digitBasico),
      digitComplejo: String(p.digitComplejo),
      digitRush:     String(p.digitRush),
      densTrazo: String(p.densTrazo ?? 148.48),
      densArea:  String(p.densArea  ?? 53.58),
      densLinea: String(p.densLinea ?? 50),
      tarifas:    p.tarifas.map(t => ({ hasta: t.hasta == null ? '' : String(t.hasta), precio: String(t.precio) })),
      prendas:    p.prendas.map(x => ({ id: x.id, label: x.label, factor: String(x.factor) })),
      posiciones: p.posiciones.map(x => ({ id: x.id, label: x.label, precio: String(x.precio) })),
    };
  };
  const [f,     setF]     = React.useState(_load);
  const [dirty, setDirty] = React.useState(false);

  const up = (patch) => { setF(prev => ({ ...prev, ...patch })); setDirty(true); };
  const upRow = (list, i, k, v) => up({ [list]: f[list].map((r, j) => j === i ? { ...r, [k]: v } : r) });
  const delRow = (list, i) => up({ [list]: f[list].filter((_, j) => j !== i) });

  const _num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

  const save = () => {
    const tarifas = f.tarifas
      .filter(t => t.precio.trim() !== '')
      .map(t => ({ hasta: t.hasta.trim() === '' ? null : _num(t.hasta), precio: _num(t.precio) }))
      .sort((a, b) => (a.hasta == null) - (b.hasta == null) || a.hasta - b.hasta);
    if (!tarifas.length) { onToast('Agrega al menos una tarifa por millar', 'error'); return; }
    const prendas = f.prendas.filter(x => x.label.trim())
      .map(x => ({ id: x.id, label: x.label.trim(), factor: _num(x.factor, 1) || 1 }));
    const posiciones = f.posiciones.filter(x => x.label.trim())
      .map(x => ({ id: x.id, label: x.label.trim(), precio: _num(x.precio) }));
    if (!prendas.length || !posiciones.length) { onToast('Debe haber al menos una prenda y una posición', 'error'); return; }
    window.refreshBordadoPrecios({
      minPunt:       _num(f.minPunt),
      digitBasico:   _num(f.digitBasico),
      digitComplejo: _num(f.digitComplejo),
      digitRush:     _num(f.digitRush),
      densTrazo: _num(f.densTrazo, 148.48),
      densArea:  _num(f.densArea,  53.58),
      densLinea: _num(f.densLinea, 50),
      tarifas, prendas, posiciones,
    });
    setF(_load()); setDirty(false);
    onToast('Precios de bordado guardados');
  };

  const restore = () => {
    window.refreshBordadoPrecios(JSON.parse(JSON.stringify(window.BORDADO_PRECIOS_DEFAULTS)));
    setF(_load()); setDirty(false);
    onToast('Precios de bordado restaurados a los valores por defecto');
  };

  const sNumIn = { width: 90 };
  const thS = { fontSize: '0.72rem' };

  return (
    <div className="cfg-section">
      <CfgToolbar
        title="Precios de Bordado"
        sub="Digitalización, tarifa por millar de puntadas, factores por prenda y extras por posición"
        onSave={save} dirty={dirty}
      />
      <div className="cfg-section-body">
      <div className="cfg-form-grid" style={{ maxWidth: 640, marginBottom: 20 }}>
        <div className="field">
          <label>Digitalización básica</label>
          <div className="suffix-input">
            <input type="number" min="0" value={f.digitBasico} onChange={e => up({ digitBasico: e.target.value })} />
            <span className="suffix">MXN</span>
          </div>
        </div>
        <div className="field">
          <label>Digitalización compleja (&gt;10K punt.)</label>
          <div className="suffix-input">
            <input type="number" min="0" value={f.digitComplejo} onChange={e => up({ digitComplejo: e.target.value })} />
            <span className="suffix">MXN</span>
          </div>
        </div>
        <div className="field">
          <label>Digitalización rush (urgente)</label>
          <div className="suffix-input">
            <input type="number" min="0" value={f.digitRush} onChange={e => up({ digitRush: e.target.value })} />
            <span className="suffix">MXN</span>
          </div>
        </div>
        <div className="field">
          <label>Mínimo de puntadas a cobrar</label>
          <input type="number" min="0" value={f.minPunt} onChange={e => up({ minPunt: e.target.value })} />
        </div>
      </div>

      <div style={{ marginTop: 8, marginBottom: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, borderLeft: '3px solid var(--orange)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Densidades del estimador (motor v3)</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.45 }}>
          Calibradas contra 22 diseños reales del taller (imagen + .DST de Wilcom); error mediano ~15%.
          Puntadas = trazo×cm + área×cm² + línea×cm. Solo ajústalas si tus conteos de Wilcom
          quedan sistemáticamente arriba o abajo del estimado.
        </div>
      </div>
      <div className="cfg-form-grid" style={{ maxWidth: 640, marginBottom: 20 }}>
        <div className="field">
          <label>Trazo satín/relleno</label>
          <div className="suffix-input">
            <input type="number" min="0" step="0.1" value={f.densTrazo}
              onChange={e => up({ densTrazo: e.target.value })} />
            <span className="suffix">pt/cm</span>
          </div>
        </div>
        <div className="field">
          <label>Área de relleno</label>
          <div className="suffix-input">
            <input type="number" min="0" step="0.1" value={f.densArea}
              onChange={e => up({ densArea: e.target.value })} />
            <span className="suffix">pt/cm²</span>
          </div>
        </div>
        <div className="field">
          <label>Línea fina (&lt;1mm)</label>
          <div className="suffix-input">
            <input type="number" min="0" step="0.1" value={f.densLinea}
              onChange={e => up({ densLinea: e.target.value })} />
            <span className="suffix">pt/cm</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, alignItems: 'start' }}>
        <div>
          <div className="cfg-section-title" style={{ fontSize: '0.85rem', marginBottom: 6 }}>Tarifa por millar</div>
          <div className="cfg-subtable-wrap">
          <table className="cfg-table">
            <thead><tr><th style={thS}>Hasta (puntadas)</th><th style={thS} className="r">$ / millar</th><th></th></tr></thead>
            <tbody>
              {f.tarifas.map((t, i) => (
                <tr key={i}>
                  <td><input type="number" min="0" placeholder="en adelante" value={t.hasta}
                    onChange={e => upRow('tarifas', i, 'hasta', e.target.value)} style={sNumIn} /></td>
                  <td className="r"><input type="number" min="0" step="0.05" value={t.precio}
                    onChange={e => upRow('tarifas', i, 'precio', e.target.value)} style={sNumIn} /></td>
                  <td className="cfg-row-actions">
                    <button className="cfg-act danger-soft" onClick={() => delRow('tarifas', i)} title="Eliminar"><window.IconTrash size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <button className="cfg-act" style={{ marginTop: 6 }}
            onClick={() => up({ tarifas: [...f.tarifas, { hasta: '', precio: '' }] })}>
            <window.IconPlus size={13} /> Agregar rango
          </button>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
            Deja "hasta" vacío en el último rango para "en adelante".
          </div>
        </div>

        <div>
          <div className="cfg-section-title" style={{ fontSize: '0.85rem', marginBottom: 6 }}>Prendas (factor)</div>
          <div className="cfg-subtable-wrap">
          <table className="cfg-table">
            <thead><tr><th style={thS}>Prenda</th><th style={thS} className="r">Factor ×</th><th></th></tr></thead>
            <tbody>
              {f.prendas.map((x, i) => (
                <tr key={x.id}>
                  <td><input value={x.label} onChange={e => upRow('prendas', i, 'label', e.target.value)} /></td>
                  <td className="r"><input type="number" min="0.1" step="0.05" value={x.factor}
                    onChange={e => upRow('prendas', i, 'factor', e.target.value)} style={sNumIn} /></td>
                  <td className="cfg-row-actions">
                    <button className="cfg-act danger-soft" onClick={() => delRow('prendas', i)} title="Eliminar"><window.IconTrash size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <button className="cfg-act" style={{ marginTop: 6 }}
            onClick={() => up({ prendas: [...f.prendas, { id: window.uid(), label: '', factor: '1' }] })}>
            <window.IconPlus size={13} /> Agregar prenda
          </button>
        </div>

        <div>
          <div className="cfg-section-title" style={{ fontSize: '0.85rem', marginBottom: 6 }}>Posiciones (extra $)</div>
          <div className="cfg-subtable-wrap">
          <table className="cfg-table">
            <thead><tr><th style={thS}>Posición</th><th style={thS} className="r">Extra $</th><th></th></tr></thead>
            <tbody>
              {f.posiciones.map((x, i) => (
                <tr key={x.id}>
                  <td><input value={x.label} onChange={e => upRow('posiciones', i, 'label', e.target.value)} /></td>
                  <td className="r"><input type="number" min="0" step="5" value={x.precio}
                    onChange={e => upRow('posiciones', i, 'precio', e.target.value)} style={sNumIn} /></td>
                  <td className="cfg-row-actions">
                    <button className="cfg-act danger-soft" onClick={() => delRow('posiciones', i)} title="Eliminar"><window.IconTrash size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <button className="cfg-act" style={{ marginTop: 6 }}
            onClick={() => up({ posiciones: [...f.posiciones, { id: window.uid(), label: '', precio: '0' }] })}>
            <window.IconPlus size={13} /> Agregar posición
          </button>
        </div>
      </div>

      <button className="cfg-restore-link" onClick={restore}>
        Restaurar todos los precios de bordado a los valores por defecto
      </button>
      </div>
    </div>
  );
}

// ========== USUARIOS ==========
const _US_EMPTY = { nombre:'', initials:'', rol:'cajero', pin:'', activo:true };

function _deriveInitials(nombre) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (nombre.slice(0, 2)).toUpperCase();
}

function CfgUsuarios({ onToast }) {
  const [items, setItems] = React.useState(() => [...window.USUARIOS_RAW]);
  const [form,  setForm]  = React.useState(null);
  const [delId, setDelId] = React.useState(null);

  const commit = (next) => { setItems(next); window.refreshUsuarios(next); };

  const sf = (k, v) => setForm(prev => {
    const next = { ...prev, [k]: v };
    if (k === 'nombre' && !prev.id) next.initials = _deriveInitials(v);
    return next;
  });

  const save = () => {
    if (!form.nombre || !form.pin) return;
    const item = { ...form, initials: form.initials || _deriveInitials(form.nombre) };
    const next = item.id
      ? items.map(i => i.id === item.id ? item : i)
      : [...items, { ...item, id: window.uid() }];
    commit(next);
    setForm(null);
    onToast(item.id ? 'Usuario actualizado' : 'Usuario creado');
  };

  const del = (id) => { commit(items.filter(i => i.id !== id)); setDelId(null); onToast('Usuario eliminado'); };
  const toggle = (id) => commit(items.map(i => i.id === id ? { ...i, activo: !i.activo } : i));

  return (
    <div className="cfg-section">
      <CfgToolbar
        title="Usuarios del Sistema"
        sub="Cajeros y administradores con acceso al POS"
        onAdd={() => setForm({ ..._US_EMPTY })}
        addLabel="Agregar usuario"
      />
      <table className="cfg-table">
        <thead>
          <tr><th>Nombre</th><th>Iniciales</th><th>Rol</th><th>PIN</th><th>Activo</th><th></th></tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className={item.activo === false ? 'cfg-inactive' : ''}>
              <td>
                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                  <div className="cfg-avatar">{item.initials}</div>
                  <span className="fw6">{item.nombre}</span>
                </div>
              </td>
              <td className="mono muted">{item.initials}</td>
              <td><span className={'cfg-badge ' + item.rol}>{item.rol}</span></td>
              <td className="mono muted">{'•'.repeat(item.pin?.length || 0)}</td>
              <td><CfgToggle value={item.activo !== false} onChange={() => toggle(item.id)} /></td>
              <RowActions id={item.id} delId={delId} setDelId={setDelId}
                onEdit={() => setForm({ ...item })} onDel={del} />
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <CfgModal title={form.id ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setForm(null)}
          onSave={save} saveDisabled={!form.nombre || !form.pin}>
          <div className="cfg-form-grid">
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Nombre completo *</label>
              <input value={form.nombre} onChange={e => sf('nombre', e.target.value)}
                placeholder="Ej: Ana Martínez" autoFocus />
            </div>
            <div className="field">
              <label>Iniciales</label>
              <input value={form.initials} maxLength={3}
                onChange={e => sf('initials', e.target.value.toUpperCase().slice(0, 3))}
                placeholder="AM" />
            </div>
            <div className="field">
              <label>Rol</label>
              <select value={form.rol} onChange={e => sf('rol', e.target.value)}>
                <option value="cajero">Cajero</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>PIN de acceso *</label>
              <input type="password" value={form.pin} maxLength={6}
                onChange={e => sf('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••" />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <div className="cfg-activo-row">
                <CfgToggle value={form.activo !== false} onChange={v => sf('activo', v)} />
                Usuario activo
              </div>
            </div>
          </div>
        </CfgModal>
      )}
    </div>
  );
}

// ========== DATOS DEL NEGOCIO ==========
function CfgNegocio({ onToast }) {
  const [data,  setData]  = React.useState({ ...window.NEGOCIO });
  const [dirty, setDirty] = React.useState(false);
  const set = (k, v) => { setData(prev => ({ ...prev, [k]: v })); setDirty(true); };

  const save = () => { window.refreshNegocio(data); setDirty(false); onToast('Datos del negocio guardados'); };

  return (
    <div className="cfg-section">
      <CfgToolbar title="Datos del Negocio" sub="Información que aparece en tickets y documentos"
        onSave={save} dirty={dirty} />
      <div className="cfg-negocio-body">
        <div className="form-card">
          <h3><span className="num">1</span>Información general</h3>
          <div className="form-grid cols-1">
            <div className="field">
              <label>Nombre del negocio</label>
              <input value={data.nombre || ''} onChange={e => set('nombre', e.target.value)}
                placeholder="Servicios Gráficos de Impresión" />
            </div>
          </div>
          <div className="form-grid" style={{marginTop:14}}>
            <div className="field">
              <label>RFC</label>
              <input value={data.rfc || ''} onChange={e => set('rfc', e.target.value.toUpperCase())}
                placeholder="SGI9001011AA" />
            </div>
            <div className="field">
              <label>Teléfono</label>
              <input value={data.telefono || ''} onChange={e => set('telefono', e.target.value)}
                placeholder="55 1234 5678" />
            </div>
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Correo electrónico</label>
              <input type="email" value={data.email || ''} onChange={e => set('email', e.target.value)}
                placeholder="contacto@negocio.com" />
            </div>
          </div>
        </div>

        <div className="form-card" style={{marginTop:16}}>
          <h3><span className="num">2</span>Dirección</h3>
          <div className="form-grid cols-1">
            <div className="field">
              <label>Calle y número</label>
              <input value={data.direccion || ''} onChange={e => set('direccion', e.target.value)}
                placeholder="Calle, No. Ext, No. Int" />
            </div>
          </div>
          <div className="form-grid" style={{marginTop:14}}>
            <div className="field">
              <label>Colonia</label>
              <input value={data.colonia || ''} onChange={e => set('colonia', e.target.value)}
                placeholder="Colonia" />
            </div>
            <div className="field">
              <label>Ciudad</label>
              <input value={data.ciudad || ''} onChange={e => set('ciudad', e.target.value)}
                placeholder="Ciudad de México" />
            </div>
            <div className="field">
              <label>Estado</label>
              <input value={data.estado || ''} onChange={e => set('estado', e.target.value)}
                placeholder="CDMX" />
            </div>
            <div className="field">
              <label>C.P.</label>
              <input value={data.cp || ''} maxLength={5}
                onChange={e => set('cp', e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="01234" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ========== RESPALDOS ==========
const _sleep = ms => new Promise(r => setTimeout(r, ms));

function CfgIA({ onToast }) {
  const [key,     setKey]     = React.useState(() => window.storageLoad('sgi_api_key', ''));
  const [show,    setShow]    = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [status,  setStatus]  = React.useState(null); // 'ok' | 'error: msg'

  function save() {
    window.storageSave('sgi_api_key', key.trim());
    onToast('API Key de Anthropic guardada');
    setStatus(null);
  }

  async function testKey() {
    if (!key.trim()) return;
    setTesting(true); setStatus(null);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-calls': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ok' }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setStatus('ok');
    } catch (e) {
      setStatus('error: ' + e.message);
    }
    setTesting(false);
  }

  const saved = window.storageLoad('sgi_api_key', '');

  return (
    <div className="cfg-section">
      <CfgToolbar
        title="Inteligencia Artificial"
        sub="Claude Haiku analiza descripciones de PDF para pre-llenar nombre, categoría y especificaciones automáticamente"
      />
      <div style={{ padding: '0 20px 20px' }}>
        <div className="form-card">
          <h3><span className="num">1</span>API Key de Anthropic</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 16 }}>
            Cuando el Cotizador Express detecta productos no reconocidos en un PDF de requisición,
            envía las descripciones a <strong>Claude Haiku</strong> y pre-llena automáticamente
            el nombre limpio, la categoría sugerida y las especificaciones técnicas.
            El operador siempre revisa y confirma antes de guardar.
          </p>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>API Key (Anthropic)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={show ? 'text' : 'password'}
                value={key}
                onChange={e => { setKey(e.target.value); setStatus(null); }}
                placeholder="sk-ant-api03-…"
                style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: '0.8rem' }}
              />
              <button className="cfg-btn-cancel" onClick={() => setShow(s => !s)}>
                {show ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="cfg-btn-save" onClick={save} disabled={!key.trim()}>
              <window.IconCheck size={14}/> Guardar key
            </button>
            <button className="cfg-btn-cancel" onClick={testKey} disabled={!key.trim() || testing}>
              {testing ? 'Verificando…' : 'Verificar conexión'}
            </button>
            {status === 'ok' && (
              <span style={{ color: 'var(--green)', fontSize: '0.82rem', fontWeight: 700 }}>✓ Conectado correctamente</span>
            )}
            {status && status !== 'ok' && (
              <span style={{ color: 'var(--magenta)', fontSize: '0.78rem' }}>✗ {status}</span>
            )}
          </div>
          {saved ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--green)', marginTop: 12 }}>
              ✓ Key configurada — el análisis IA está activo en el Cotizador Express.
            </p>
          ) : (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 12, lineHeight: 1.5 }}>
              Sin key configurada el Cotizador funciona normalmente, pero sin sugerencias automáticas.
              Obtén tu key en <strong>console.anthropic.com</strong> → API Keys.
            </p>
          )}
        </div>

        <div className="form-card" style={{ marginTop: 16 }}>
          <h3><span className="num">2</span>Modelo y costos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem', color: 'var(--text-2)' }}>
            {[
              ['Modelo', 'Claude Haiku 4.5'],
              ['Uso', 'Solo al cargar PDFs con productos nuevos'],
              ['Tokens por llamada', '~500 entrada · ~200 salida'],
              ['Costo aprox.', '~$0.001 USD por PDF analizado'],
            ].map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{k}</span>
                <span style={{ fontFamily: k === 'Modelo' || k === 'Costo aprox.' ? 'Geist Mono, monospace' : 'inherit' }}>{v}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CfgRespaldos({ onToast }) {
  const [cfg,     setCfg]     = React.useState({ ...window.BACKUP_CONFIG });
  const [backups, setBackups] = React.useState([...window.BACKUP_META_LIST]);
  const [backing, setBacking] = React.useState(false);
  const [progress, setProgress] = React.useState({ step: '', pct: 0, done: false, results: [] });
  const [showPicker, setShowPicker] = React.useState(false);
  const [dests, setDests]     = React.useState({ local: true, usb: false, cloud: false });
  const [delId, setDelId]     = React.useState(null);

  const hasFileAccessAPI = typeof window.showDirectoryPicker === 'function';

  const lastBkMs  = cfg.lastBackupMs;
  const isOverdue = !lastBkMs || (Date.now() - lastBkMs > 2 * 24 * 60 * 60 * 1000);
  const lastBkStr = lastBkMs
    ? new Date(lastBkMs).toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false })
    : 'Nunca';
  const nextBkStr = cfg.autoEnabled && lastBkMs
    ? new Date(lastBkMs + cfg.intervalHoras * 3600000).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false })
    : cfg.autoEnabled ? 'Próxima apertura' : 'Manual';

  const saveCfg = (next) => { setCfg(next); window.refreshBackupConfig(next); };

  const toggleDestCfg = (k) => saveCfg({
    ...cfg,
    destinations: { ...cfg.destinations, [k]: !cfg.destinations[k] }
  });

  const doBackup = async (selDests) => {
    setShowPicker(false);
    setBacking(true);
    setProgress({ step: 'Recopilando datos...', pct: 5, done: false, results: [] });

    const data = window.collectBackupData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const now  = new Date();
    const ts   = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `sgi-respaldo-${ts}.json`;
    const sizeKB   = (blob.size / 1024).toFixed(1) + ' KB';
    const results  = [];

    await _sleep(400);
    setProgress(p => ({ ...p, pct: 15 }));

    if (selDests.local) {
      setProgress(p => ({ ...p, step: 'Guardando en disco local...', pct: 35 }));
      await _sleep(500);
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        results.push({ dest: 'local', ok: true, label: 'Disco local' });
      } catch {
        results.push({ dest: 'local', ok: false, label: 'Disco local', err: 'Error al descargar' });
      }
    }

    if (selDests.usb) {
      setProgress(p => ({ ...p, step: 'Guardando en USB...', pct: 60 }));
      await _sleep(500);
      if (hasFileAccessAPI) {
        try {
          const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
          const fh  = await dir.getFileHandle(filename, { create: true });
          const w   = await fh.createWritable();
          await w.write(blob); await w.close();
          results.push({ dest: 'usb', ok: true, label: 'USB' });
        } catch (e) {
          const msg = e.name === 'AbortError' ? 'Cancelado por usuario' : 'Error de escritura';
          results.push({ dest: 'usb', ok: false, label: 'USB', err: msg });
        }
      } else {
        results.push({ dest: 'usb', ok: false, label: 'USB', err: 'Requiere Chrome/Edge 86+' });
      }
    }

    if (selDests.cloud) {
      setProgress(p => ({ ...p, step: 'Conectando a nube...', pct: 80 }));
      await _sleep(700);
      results.push({ dest: 'cloud', ok: false, label: 'Google Drive', err: 'Requiere configuración de API' });
    }

    setProgress(p => ({ ...p, step: 'Finalizando...', pct: 95 }));
    await _sleep(300);

    const okDests = results.filter(r => r.ok).map(r => r.dest);
    if (okDests.length > 0) {
      const rec = {
        id: window.uid(),
        fecha: window.localISO(now),
        hora:  now.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12:false }),
        ms:    now.getTime(),
        tamaño: sizeKB,
        destinos: okDests,
        filename,
      };
      const newList = window.saveBackupRecord(rec);
      setBackups(newList);
      saveCfg({ ...cfg, lastBackupMs: now.getTime() });
    }

    setProgress({ step: 'Completado', pct: 100, done: true, results });
  };

  const doRestore = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('¿Estás seguro? Esto reemplazará TODOS los datos actuales con el contenido del respaldo seleccionado.')) {
      e.target.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        window.restoreBackupData(JSON.parse(ev.target.result));
        onToast('Respaldo restaurado — recargando...');
        setTimeout(() => location.reload(), 1500);
      } catch { onToast('Error: archivo de respaldo inválido'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const deleteRecord = (id) => {
    window.deleteBackupRecord(id);
    setBackups([...window.BACKUP_META_LIST]);
    setDelId(null);
    onToast('Registro eliminado');
  };

  const destOptions = [
    { key: 'local', label: 'Disco local', icon: '💾', avail: true },
    { key: 'usb',   label: 'USB',         icon: '🔌', avail: hasFileAccessAPI },
    { key: 'cloud', label: 'Google Drive',icon: '☁️', avail: false },
  ];

  const destStatus = [
    { label: 'Local',   icon: cfg.destinations?.local  ? '✅' : '—', cls: cfg.destinations?.local  ? 'ok' : 'off' },
    { label: 'USB',     icon: !cfg.destinations?.usb ? '—' : hasFileAccessAPI ? '✅' : '⚠️',
      cls: !cfg.destinations?.usb ? 'off' : hasFileAccessAPI ? 'ok' : 'warn' },
    { label: 'Nube',    icon: !cfg.destinations?.cloud ? '—' : '❌', cls: !cfg.destinations?.cloud ? 'off' : 'err' },
  ];

  return (
    <div className="cfg-section">
      <CfgToolbar title="Respaldos y Restauración" sub="Copia de seguridad automática y manual de todos los datos del sistema" />

      {isOverdue && (
        <div className="bk-alert">
          <span>⚠️</span>
          <span>Han pasado más de 2 días sin realizar un respaldo. <strong>Se recomienda respaldar ahora.</strong></span>
        </div>
      )}

      {/* Status cards */}
      <div className="bk-status-row">
        <div className="bk-stat-card">
          <div className="bk-stat-label">Último respaldo</div>
          <div className={'bk-stat-val' + (isOverdue ? ' warn' : '')}>{lastBkStr}</div>
        </div>
        <div className="bk-stat-card">
          <div className="bk-stat-label">Próximo respaldo automático</div>
          <div className="bk-stat-val">{nextBkStr}</div>
        </div>
        <div className="bk-stat-card">
          <div className="bk-stat-label">Respaldos guardados</div>
          <div className="bk-stat-val">{backups.length}</div>
        </div>
      </div>

      {/* Destination status */}
      <div className="bk-dest-row">
        {destStatus.map((d, i) => (
          <div key={i} className={'bk-dest-chip ' + d.cls}><span>{d.icon}</span><span>{d.label}</span></div>
        ))}
      </div>

      {/* Auto-backup settings */}
      <div className="bk-settings-card">
        <div className="bk-settings-title">Respaldo Automático</div>
        <div className="bk-settings-row">
          <div className="bk-settings-item">
            <span>Activar respaldo automático</span>
            <CfgToggle value={cfg.autoEnabled} onChange={v => saveCfg({ ...cfg, autoEnabled: v })} />
          </div>
          {cfg.autoEnabled && (
            <>
              <div className="bk-settings-item">
                <span>Intervalo</span>
                <select className="bk-select" value={cfg.intervalHoras}
                  onChange={e => saveCfg({ ...cfg, intervalHoras: parseInt(e.target.value) })}>
                  <option value={1}>Cada hora</option>
                  <option value={4}>Cada 4 horas</option>
                  <option value={8}>Cada 8 horas</option>
                  <option value={12}>Cada 12 horas</option>
                  <option value={24}>Diario (24 h)</option>
                  <option value={48}>Cada 2 días</option>
                  <option value={168}>Semanal</option>
                </select>
              </div>
              <div className="bk-settings-item">
                <span>Destinos automáticos</span>
                <div className="bk-dest-checks">
                  {destOptions.map(d => (
                    <label key={d.key} className={'bk-dest-label' + (!d.avail ? ' disabled' : '')}>
                      <input type="checkbox" disabled={!d.avail}
                        checked={!!cfg.destinations?.[d.key]}
                        onChange={() => toggleDestCfg(d.key)} />
                      {d.icon} {d.label}
                      {!d.avail && <span className="bk-not-avail">(no disponible)</span>}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="bk-actions">
        <button className="cfg-btn-add" onClick={() => setShowPicker(true)}>
          <window.IconCheck size={15} /> Respaldar Ahora
        </button>
        <label className="cfg-btn-restore">
          <window.IconReceipt size={15} /> Restaurar Respaldo
          <input type="file" accept=".json" style={{display:'none'}} onChange={doRestore} />
        </label>
      </div>

      {/* Backup list */}
      {backups.length > 0 && (
        <div style={{padding:'0 22px 22px'}}>
          <div className="cfg-section-title" style={{marginBottom:10}}>Historial de respaldos</div>
          <table className="cfg-table">
            <thead>
              <tr><th>Fecha</th><th>Hora</th><th>Tamaño</th><th>Destinos</th><th></th></tr>
            </thead>
            <tbody>
              {backups.map(bk => (
                <tr key={bk.id}>
                  <td className="mono fw6">{bk.fecha}</td>
                  <td className="mono muted">{bk.hora}</td>
                  <td className="mono muted">{bk.tamaño}</td>
                  <td>
                    {(bk.destinos || []).map(d => (
                      <span key={d} className="cfg-badge" style={{marginRight:4}}>
                        {d === 'local' ? '💾' : d === 'usb' ? '🔌' : '☁️'} {d}
                      </span>
                    ))}
                  </td>
                  <td className="cfg-row-actions">
                    {delId === bk.id ? (
                      <>
                        <button className="cfg-act danger" onClick={() => deleteRecord(bk.id)}>¿Eliminar?</button>
                        <button className="cfg-act" onClick={() => setDelId(null)}>No</button>
                      </>
                    ) : (
                      <button className="cfg-act danger-soft" onClick={() => setDelId(bk.id)} title="Eliminar registro">
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

      {/* Destination picker modal */}
      {showPicker && (
        <div className="cfg-overlay" onMouseDown={e => e.target === e.currentTarget && setShowPicker(false)}>
          <div className="cfg-modal" style={{maxWidth:380}}>
            <div className="cfg-modal-head">
              <span className="cfg-modal-title">Respaldar Ahora</span>
              <button className="cfg-modal-x" onClick={() => setShowPicker(false)}><window.IconX size={18} /></button>
            </div>
            <div className="cfg-modal-body">
              <p style={{marginBottom:14,fontSize:'0.875rem',color:'var(--text-2)'}}>
                Selecciona dónde guardar el respaldo:
              </p>
              <div className="bk-dest-checks-modal">
                {destOptions.map(d => (
                  <label key={d.key}
                    className={'bk-modal-dest-label' + (!d.avail ? ' disabled' : '') + (dests[d.key] ? ' selected' : '')}>
                    <input type="checkbox" disabled={!d.avail}
                      checked={!!dests[d.key]}
                      onChange={() => setDests(prev => ({ ...prev, [d.key]: !prev[d.key] }))} />
                    <span className="bk-dest-icon">{d.icon}</span>
                    <div>
                      <div style={{fontWeight:600}}>{d.label}</div>
                      {!d.avail && <div style={{fontSize:'0.75rem',color:'var(--text-3)'}}>No disponible en este navegador</div>}
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="cfg-modal-foot">
              <button className="cfg-btn-cancel" onClick={() => setShowPicker(false)}>Cancelar</button>
              <button className="cfg-btn-save"
                disabled={!Object.values(dests).some(Boolean)}
                onClick={() => doBackup(dests)}>
                <window.IconCheck size={15} /> Iniciar respaldo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress / result modal */}
      {backing && (
        <div className="cfg-overlay">
          <div className="cfg-modal" style={{maxWidth:420}}>
            <div className="cfg-modal-head">
              <span className="cfg-modal-title">
                {progress.done ? '✅ Respaldo completado' : 'Creando respaldo...'}
              </span>
            </div>
            <div className="cfg-modal-body">
              {!progress.done ? (
                <>
                  <div style={{fontSize:'0.875rem',color:'var(--text-2)',marginBottom:12}}>{progress.step}</div>
                  <div className="bk-progress-bar">
                    <div className="bk-progress-fill" style={{width: progress.pct + '%'}} />
                  </div>
                  <div style={{textAlign:'right',fontSize:'0.8rem',color:'var(--text-3)',marginTop:6}}>
                    {progress.pct}%
                  </div>
                </>
              ) : (
                <div className="bk-results">
                  {progress.results.map((r, i) => (
                    <div key={i} className={'bk-result-row ' + (r.ok ? 'ok' : 'err')}>
                      <span>{r.ok ? '✅' : '❌'}</span>
                      <span style={{flex:1}}>{r.label}</span>
                      {!r.ok && r.err && <span className="bk-result-err">{r.err}</span>}
                    </div>
                  ))}
                  {progress.results.some(r => r.ok) && (
                    <p style={{marginTop:12,fontSize:'0.8rem',color:'var(--text-3)'}}>
                      El respaldo fue guardado correctamente.
                    </p>
                  )}
                  {!progress.results.some(r => r.ok) && (
                    <p style={{marginTop:12,fontSize:'0.8rem',color:'#b91c1c'}}>
                      No se pudo guardar el respaldo en ningún destino.
                    </p>
                  )}
                </div>
              )}
            </div>
            {progress.done && (
              <div className="cfg-modal-foot">
                <button className="cfg-btn-save" onClick={() => setBacking(false)}>
                  <window.IconCheck size={15} /> Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== MÓDULO RAÍZ ==========
function ModuleConfig() {
  const [tab,   setTab]   = React.useState('copiado');
  const [toast, setToast] = React.useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const tabs = [
    { id: 'copiado',     label: 'Centro de Copiado', Icon: window.IconCopy     },
    { id: 'granformato', label: 'Gran Formato',       Icon: window.IconLayout   },
    { id: 'bordado',     label: 'Bordado',            Icon: window.IconNeedle   },
    { id: 'usuarios',    label: 'Usuarios',           Icon: window.IconUser     },
    { id: 'negocio',     label: 'Negocio',            Icon: window.IconBuilding },
    { id: 'ia',          label: 'IA / API',           Icon: window.IconBolt     },
    { id: 'respaldos',   label: 'Respaldos',          Icon: window.IconReceipt  },
  ];

  return (
    <div className="cfg-module">
      <div className="module-header">
        <div className="module-title">
          <div className="mt-icon"><window.IconSettings size={20} /></div>
          <div>
            <h1>Configuración</h1>
            <div className="mt-sub">Catálogos · Usuarios · Datos del negocio</div>
          </div>
        </div>
      </div>

      <div className="cfg-tabs">
        {tabs.map(t => (
          <button key={t.id} className={'cfg-tab-btn' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            <t.Icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="cfg-body">
        {tab === 'copiado'     && <><CfgCopiado onToast={showToast} /><CfgCopiadoOpciones onToast={showToast} /></>}
        {tab === 'granformato' && <><CfgGranFormato onToast={showToast} /><CfgGfAcabados onToast={showToast} /></>}
        {tab === 'bordado'     && <><CfgBordado onToast={showToast} /><CfgBordadoPrecios onToast={showToast} /></>}
        {tab === 'usuarios'    && <CfgUsuarios     onToast={showToast} />}
        {tab === 'negocio'     && <CfgNegocio      onToast={showToast} />}
        {tab === 'ia'          && <CfgIA           onToast={showToast} />}
        {tab === 'respaldos'   && <CfgRespaldos    onToast={showToast} />}
      </div>

      {toast && (
        <div className="toast success">
          <span className="toast-icon"><window.IconCheck size={16} stroke={3} /></span>
          {toast}
        </div>
      )}
    </div>
  );
}

window.ModuleConfig = ModuleConfig;
