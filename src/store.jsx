// ========== SHARED STORE / CATALOG / HELPERS ==========

const fmt    = (n) => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const uid    = () => Math.random().toString(36).slice(2, 9);
// Fecha local ISO (YYYY-MM-DD). No usar toISOString().slice(0,10): es UTC y
// en México (UTC-6/-7) después de las ~6pm devuelve la fecha del día siguiente
const localISO = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ===== PERSISTENCIA =====
function storageLoad(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function storageSave(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (window.SGISync) window.SGISync.queuePush(key);
    return true;
  }
  catch (e) { console.error(`storageSave falló para "${key}":`, e); return false; }
}

// Mapa de íconos (las funciones no se pueden serializar a localStorage)
const _ICONS = {
  copy:      () => window.IconCopy,
  scan:      () => window.IconScan,
  shield:    () => window.IconShield,
  book:      () => window.IconBook,
  printer:   () => window.IconPrinter,
  image:     () => window.IconImage,
  blueprint: () => window.IconBlueprint,
  note:      () => window.IconNote,
  layout:    () => window.IconLayout,
  needle:    () => window.IconNeedle,
  zap:       () => window.IconZap,
};
function _addIcons(items) {
  return items.map(s => ({ ...s, Icon: (_ICONS[s.iconKey] || _ICONS.copy)() }));
}

// ===== MÓDULOS =====
const MODULES = [
  { id: 'copiado',        name: 'Centro de Copiado', short: 'Copiado',      Icon: window.IconCopy,     hotkey: 'F1' },
  { id: 'granformato',    name: 'Gran Formato',       short: 'Gran Formato', Icon: window.IconLayout,   hotkey: 'F2' },
  { id: 'bordado',        name: 'Bordado',            short: 'Bordado',      Icon: window.IconNeedle,   hotkey: 'F3' },
  { id: 'anuncios-neon', name: 'Anuncios Neón',      short: 'Neón',         Icon: window.IconBolt,     hotkey: 'F4' },
  { id: 'letras',        name: 'Letras y Anuncios', short: 'Letras',       Icon: window.IconType,     hotkey: 'F5' },
  { id: 'pedidos',       name: 'Pedidos',            short: 'Pedidos',      Icon: window.IconNote,     hotkey: null, admin: true },
  { id: 'cotizador',    name: 'Cotizador Express',   short: 'Cotizador',    Icon: window.IconFileText, hotkey: null, admin: true },
  { id: 'contabilidad',  name: 'Contabilidad',       short: 'Conta',        Icon: window.IconReceipt,  hotkey: null, admin: true },
  { id: 'config',        name: 'Configuración',      short: 'Config',       Icon: window.IconSettings, hotkey: null, admin: true },
];

// ===== CENTRO DE COPIADO =====

const _CD_DEFAULTS = [
  { id:'copia-bn-c',  name:'Copia B/N Carta',    desc:'Bond 75g · carta',        price:1.00,  iconKey:'copy',   unidad:'por hoja',    categoria:'copias',   activo:true },
  { id:'copia-bn-o',  name:'Copia B/N Oficio',   desc:'Bond 75g · oficio',       price:1.20,  iconKey:'copy',   unidad:'por hoja',    categoria:'copias',   activo:true },
  { id:'copia-col-c', name:'Copia Color Carta',   desc:'Bond 75g · carta',        price:5.00,  iconKey:'copy',   unidad:'por hoja',    categoria:'copias',   activo:true },
  { id:'copia-col-o', name:'Copia Color Oficio',  desc:'Bond 75g · oficio',       price:6.00,  iconKey:'copy',   unidad:'por hoja',    categoria:'copias',   activo:true },
  { id:'escaneo',     name:'Escaneo',             desc:'PDF / JPG · por hoja',    price:4.00,  iconKey:'scan',   unidad:'por hoja',    categoria:'escaneo',  activo:true },
  { id:'enmicado-c',  name:'Enmicado Carta',      desc:'Mica calibre 7',          price:20.00, iconKey:'shield', unidad:'por hoja',    categoria:'acabados', activo:true },
  { id:'enmicado-o',  name:'Enmicado Oficio',     desc:'Mica calibre 7',          price:28.00, iconKey:'shield', unidad:'por hoja',    categoria:'acabados', activo:true },
  { id:'engargo-r',   name:'Engargo. Rápido',     desc:'Arillo plástico + pasta', price:45.00, iconKey:'book',   unidad:'por trabajo', categoria:'acabados', activo:true },
];
let COPIADO_DIRECT_RAW = storageLoad('sgi_copiado_direct', _CD_DEFAULTS);
let COPIADO_DIRECT     = _addIcons(COPIADO_DIRECT_RAW.filter(s => s.activo !== false));

const COPIADO_OPTIONS = [
  { id:'impresion',   name:'Impresión',        desc:'Papel · color · acabado · urgencia', Icon: window.IconPrinter },
  { id:'impreso',     name:'Material Impreso', desc:'Tarjetas · trípticos · dípticos…',   Icon: window.IconImage },
  { id:'engargolado', name:'Engargolado',      desc:'Tipo de arillo y pasta',              Icon: window.IconBook },
  { id:'planos',      name:'Planos',           desc:'Arquitectónico · B/N o color',        Icon: window.IconBlueprint },
];

// Papeles de impresión
const _PP_DEFAULTS = [
  { id:'carta-bond',   name:'Bond Carta 75g',    price:1.50,  activo:true },
  { id:'oficio-bond',  name:'Bond Oficio 75g',   price:2.00,  activo:true },
  { id:'carta-90',     name:'Bond Carta 90g',    price:2.20,  activo:true },
  { id:'couche-carta', name:'Couché 150g Carta', price:5.50,  activo:true },
  { id:'opalina',      name:'Opalina 200g',      price:5.00,  activo:true },
  { id:'tabloide',     name:'Tabloide 90g',      price:5.50,  activo:true },
  { id:'fotografico',  name:'Fotográfico Carta', price:12.00, activo:true },
  { id:'adhesivo',     name:'Vinil adhesivo',    price:8.00,  activo:true },
];
let PRINT_PAPER_RAW = storageLoad('sgi_print_paper', _PP_DEFAULTS);
let PRINT_PAPER     = PRINT_PAPER_RAW.filter(p => p.activo !== false);

const PRINT_COLOR = [
  { id:'bn',    name:'Blanco / Negro' },
  { id:'color', name:'Color' },
];
const PRINT_FACES = [
  { id:'1', name:'1 cara' },
  { id:'2', name:'2 caras' },
];

// Opciones de Copiado — todo editable en Configuración → Centro de Copiado
const _CO_DEFAULTS = {
  colorMult:     4,    // multiplicador impresión a color vs B/N
  dobleCaraMult: 1.6,  // multiplicador 2 caras vs 1 cara
  printFinish: [
    { id:'ninguno',   name:'Sin acabado',  price:0 },
    { id:'grapa',     name:'Engrapado',    price:2 },
    { id:'perforado', name:'Perforado',    price:3 },
    { id:'corte',     name:'Corte fino',   price:5 },
  ],
  printUrgency: [
    { id:'normal',  name:'Normal',  time:'24 hrs',  mult:1.00 },
    { id:'rapido',  name:'Rápido',  time:'4 hrs',   mult:1.25 },
    { id:'express', name:'Express', time:'1–2 hrs', mult:1.50 },
  ],
  engargoTipos: [
    { id:'arillo-p', name:'Arillo plástico', price:25 },
    { id:'arillo-m', name:'Arillo metálico', price:45 },
    { id:'wire',     name:'Wire-O',          price:60 },
    { id:'hotmelt',  name:'Hot melt',        price:75 },
  ],
  engargoPastas: [
    { id:'transp', name:'Transparente', price:8 },
    { id:'negra',  name:'Negra rígida', price:12 },
    { id:'color',  name:'Color rígida', price:14 },
  ],
  planosTipo: [
    { id:'bn',    name:'B/N',   price:18 },
    { id:'color', name:'Color', price:38 },
  ],
  planosTam: [
    { id:'60x90',  name:'60×90 cm',  mult:1 },
    { id:'90x120', name:'90×120 cm', mult:1.6 },
    { id:'90x150', name:'90×150 cm', mult:2 },
  ],
  impresoVol: [
    { id:'v5',    qty:5,    priceMult:1.10, label:'5 pzas' },
    { id:'v10',   qty:10,   priceMult:1.00, label:'10 pzas' },
    { id:'v25',   qty:25,   priceMult:0.95, label:'25 pzas' },
    { id:'v50',   qty:50,   priceMult:0.90, label:'50 pzas' },
    { id:'v100',  qty:100,  priceMult:0.82, label:'100 pzas' },
    { id:'v250',  qty:250,  priceMult:0.72, label:'250 pzas' },
    { id:'v500',  qty:500,  priceMult:0.60, label:'500 pzas' },
    { id:'v1000', qty:1000, priceMult:0.48, label:'1,000 pzas' },
  ],
  impresoPapeles: [
    { id:'couche-150', name:'Couché 150g',  mult:1.00 },
    { id:'couche-250', name:'Couché 250g',  mult:1.45 },
    { id:'opalina',    name:'Opalina 200g', mult:1.30 },
    { id:'bond-90',    name:'Bond 90g',     mult:0.55 },
    { id:'kraft',      name:'Kraff',        mult:0.75 },
  ],
  impresoAcabados: [
    { id:'ninguno',    name:'Sin acabado',      addPct:0,    addFlat:0 },
    { id:'barniz-1',   name:'Barniz UV 1 cara', addPct:0.20, addFlat:0 },
    { id:'barniz-2',   name:'Barniz UV 2 caras',addPct:0.35, addFlat:0 },
    { id:'lam-mate',   name:'Laminado mate',    addPct:0.30, addFlat:0 },
    { id:'lam-brillo', name:'Laminado brillo',  addPct:0.25, addFlat:0 },
    { id:'troquelado', name:'Troquelado',       addPct:0,    addFlat:150 },
  ],
  impresoUrgencia: [
    { id:'normal',  name:'Normal',  time:'3–5 días', mult:1.00 },
    { id:'rapido',  name:'Rápido',  time:'1–2 días', mult:1.30 },
    { id:'express', name:'Express', time:'24 hrs',   mult:1.60 },
  ],
};
let COPIADO_OPC = { ..._CO_DEFAULTS, ...storageLoad('sgi_copiado_opciones', {}) };

// Aliases derivados (los módulos leen estos nombres)
let PRINT_FINISH   = COPIADO_OPC.printFinish;
let PRINT_URGENCY  = COPIADO_OPC.printUrgency;
let ENGARGO_TYPES  = COPIADO_OPC.engargoTipos;
let ENGARGO_PASTAS = COPIADO_OPC.engargoPastas;
let PLANOS_TIPO    = COPIADO_OPC.planosTipo;
let PLANOS_TAM     = COPIADO_OPC.planosTam;

// Material impreso
const _IT_DEFAULTS = [
  { id:'tarjeta',  name:'Tarjeta de presentación', size:'9×5 cm',     unitPrice:4.50, minQty:25,  desc:'90×55 mm estándar', activo:true },
  { id:'volante',  name:'Volante / Flyer',          size:'Carta',      unitPrice:3.00, minQty:25,  desc:'21.5×28 cm',        activo:true },
  { id:'folleto',  name:'Folleto ½ carta',          size:'½ carta',    unitPrice:2.00, minQty:50,  desc:'21.5×14 cm',        activo:true },
  { id:'diptico',  name:'Díptico',                  size:'Carta dob.', unitPrice:5.00, minQty:50,  desc:'Doblez central',    activo:true },
  { id:'triptico', name:'Tríptico',                 size:'Carta dob.', unitPrice:5.80, minQty:50,  desc:'Doblado en 3',      activo:true },
  { id:'poster-c', name:'Póster Carta',             size:'Carta',      unitPrice:3.00, minQty:10,  desc:'21.5×28 cm',        activo:true },
  { id:'poster-t', name:'Póster Tabloide',          size:'Tabloide',   unitPrice:8.00, minQty:5,   desc:'28×43 cm',          activo:true },
  { id:'hoja-mb',  name:'Hoja membretada',          size:'Carta',      unitPrice:3.80, minQty:50,  desc:'Con membrete',      activo:true },
];
let IMPRESO_TIPOS_RAW = storageLoad('sgi_impreso_tipos', _IT_DEFAULTS);
let IMPRESO_TIPOS     = IMPRESO_TIPOS_RAW.filter(t => t.activo !== false);

// Volúmenes/papeles/acabados/urgencias de material impreso viven en COPIADO_OPC (sgi_copiado_opciones)
let IMPRESO_VOL      = COPIADO_OPC.impresoVol;
let IMPRESO_PAPELES  = COPIADO_OPC.impresoPapeles;
let IMPRESO_ACABADOS = COPIADO_OPC.impresoAcabados;
let IMPRESO_URGENCIA = COPIADO_OPC.impresoUrgencia;

// ===== GRAN FORMATO =====
const _GF_DEFAULTS = [
  { id:'lona-13',  name:'Lona 13 oz',     price:90,  desc:'Mate',       activo:true, rollos:[1.10,1.60,2.05,2.50,3.20] },
  { id:'lona-15',  name:'Lona 15 oz',     price:120, desc:'Premium',    activo:true, rollos:[1.10,1.60,2.05,2.50,3.20] },
  { id:'vinil-c',  name:'Vinil corte',    price:180, desc:'Adhesivo',   activo:true, rollos:[0.60,1.60] },
  { id:'vinil-i',  name:'Vinil impreso',  price:220, desc:'Brillante',  activo:true, rollos:[0.60,1.60] },
  { id:'banner',   name:'Banner econ.',   price:70,  desc:'Interior',   activo:true, rollos:[1.60,2.05] },
  { id:'microp',   name:'Microperforado', price:250, desc:'Vidrios',    activo:true, rollos:[1.27] },
  { id:'canvas',   name:'Canvas',         price:320, desc:'Textil',     activo:true, rollos:[1.60] },
  { id:'one-way',  name:'One way',        price:280, desc:'Visión',     activo:true, rollos:[1.27] },
];
// Mapa de rollos por id para inyectar en registros existentes que no los tengan
const _GF_ROLLO_MAP = {
  'lona-13':[1.10,1.60,2.05,2.50,3.20], 'lona-15':[1.10,1.60,2.05,2.50,3.20],
  'vinil-c':[0.60,1.60], 'vinil-i':[0.60,1.60],
  'banner':[1.60,2.05], 'microp':[1.27], 'canvas':[1.60], 'one-way':[1.27],
};
let GF_MATERIALS_RAW = storageLoad('sgi_gf_materials', _GF_DEFAULTS)
  .map(m => ({ ...m, rollos: m.rollos || _GF_ROLLO_MAP[m.id] || [] }));
let GF_MATERIALS     = GF_MATERIALS_RAW.filter(m => m.activo !== false);

const _GFF_DEFAULTS = [
  { id:'simple',   name:'Simple',        add:0 },
  { id:'ojillos',  name:'Ojillos',       add:30 },
  { id:'bastilla', name:'Bastilla',      add:50 },
  { id:'tubular',  name:'Bolsa tubular', add:80 },
];
let GF_FINISH = storageLoad('sgi_gf_finish', _GFF_DEFAULTS);

// Parámetros de acomodo en rollo (en metros): margen de sellado/dobladillo por
// lado de cada pieza, y traslape de unión cuando el trabajo se parte en tiras
const _GFP_DEFAULTS = { margen: 0.025, traslape: 0.05 };
let GF_PARAMS = { ..._GFP_DEFAULTS, ...storageLoad('sgi_gf_params', {}) };

// ===== BORDADO =====
const _BT_DEFAULTS = [
  { id:'algodon',   name:'Algodón',      mult:1.00, activo:true },
  { id:'poly',      name:'Poliéster',    mult:1.10, activo:true },
  { id:'mezclilla', name:'Mezclilla',    mult:1.30, activo:true },
  { id:'pique',     name:'Piqué',        mult:1.15, activo:true },
  { id:'lycra',     name:'Lycra',        mult:1.25, activo:true },
  { id:'felpa',     name:'Felpa/toalla', mult:1.40, activo:true },
];
let BORDADO_TELAS_RAW = storageLoad('sgi_bordado_telas', _BT_DEFAULTS);
let BORDADO_TELAS     = BORDADO_TELAS_RAW.filter(t => t.activo !== false);

// Precios de bordado: digitalización, tarifas por millar, prendas y posiciones
const _BP_DEFAULTS = {
  minPunt:       500,   // mínimo de puntadas a cobrar
  digitBasico:   150,   // digitalización diseño simple
  digitComplejo: 300,   // digitalización diseño complejo (>10K punt)
  digitRush:     450,   // digitalización urgente
  // ── Densidades del motor v3, calibración 2026-07-18 contra 11 pares imagen+DST
  // generados con el auto-digitize de Wilcom (incluye underlay/contornos/amarres).
  // puntadas = densTrazo·cm de trazo + densArea·cm² de área + densLinea·cm de línea fina
  densTrazo: 148.48,  // pt/cm de trazo satín/relleno (largo del recorrido)
  densArea:  53.58,   // pt/cm² de área (tatami una capa; el resto lo absorbe el trazo)
  densLinea: 50,      // pt/cm de línea fina (<1mm: letra pequeña, contornos)
  tarifas: [            // precio por millar de puntadas; hasta:null = en adelante
    { hasta:5000,  precio:1.20 },
    { hasta:15000, precio:1.80 },
    { hasta:null,  precio:2.50 },
  ],
  prendas: [
    { id:'polo',      label:'Polo',      factor:1.0 },
    { id:'gorra',     label:'Gorra',     factor:1.3 },
    { id:'chamarra',  label:'Chamarra',  factor:1.4 },
    { id:'camisa',    label:'Camisa',    factor:1.1 },
    { id:'playera',   label:'Playera',   factor:1.0 },
    { id:'toalla',    label:'Toalla',    factor:1.6 },
    { id:'mezclilla', label:'Mezclilla', factor:1.5 },
  ],
  posiciones: [
    { id:'pecho_izq',        label:'Pecho izquierdo',  precio:0  },
    { id:'pecho_der',        label:'Pecho derecho',    precio:15 },
    { id:'espalda_completa', label:'Espalda completa', precio:35 },
    { id:'espalda_alta',     label:'Espalda alta',     precio:20 },
    { id:'manga_izq',        label:'Manga izquierda',  precio:25 },
    { id:'manga_der',        label:'Manga derecha',    precio:25 },
    { id:'gorra_frente',     label:'Gorra frente',     precio:0  },
    { id:'gorra_lateral',    label:'Gorra lateral',    precio:30 },
  ],
};
let BORDADO_PRECIOS = { ..._BP_DEFAULTS, ...storageLoad('sgi_bordado_precios', {}) };
// migración 2026-07-18: recalibración contra el auto-digitize de Wilcom.
// Solo pisa valores guardados si siguen siendo los defaults viejos (no personalizados).
if (BORDADO_PRECIOS.densTrazo === 50.71 && BORDADO_PRECIOS.densArea === 94.75 && BORDADO_PRECIOS.densLinea === 64.38) {
  BORDADO_PRECIOS.densTrazo = _BP_DEFAULTS.densTrazo;
  BORDADO_PRECIOS.densArea  = _BP_DEFAULTS.densArea;
  BORDADO_PRECIOS.densLinea = _BP_DEFAULTS.densLinea;
}

// ===== ANUNCIOS NEÓN =====
// Cotizador de letreros/rotulación en neón LED por metros lineales.
//
// Modelo (todo en MXN, todo desde catálogo — la función pura NO tiene números):
//   insumos      = neónFlex + cable + silicón + soldadura + fuentes + accesorios
//   costoDirecto = insumos + manoObra
//   subtotal     = costoDirecto · (1 + merma)
//   precio       = subtotal · (1 + margen) · urgenciaMult
//   precioIva    = precio · 1.16

// Perfiles del neón (mini/estándar/premium × colores comunes).
// precioM = precio del neón por metro; wattsM = consumo por metro (para dimensionar fuente)
// alturaMinCm = altura mínima de letra/forma que se puede trazar con esa manguera
//   (basado en el radio mínimo de curvatura: mini 6mm ≈ 5cm, std 12mm ≈ 10cm, premium 16mm ≈ 15cm).
//   Debajo de eso, los dobleces se ven como manchas y no se forma la letra.
const _NEON_PERFILES_DEFAULTS = [
  { id:'mini-blanco',   nombre:'Neón Mini 6mm',      color:'Blanco cálido', precioM:180, wattsM:8,  alturaMinCm:5,  activo:true },
  { id:'mini-azul',     nombre:'Neón Mini 6mm',      color:'Azul',          precioM:200, wattsM:8,  alturaMinCm:5,  activo:true },
  { id:'mini-rojo',     nombre:'Neón Mini 6mm',      color:'Rojo',          precioM:200, wattsM:8,  alturaMinCm:5,  activo:true },
  { id:'mini-verde',    nombre:'Neón Mini 6mm',      color:'Verde',         precioM:200, wattsM:8,  alturaMinCm:5,  activo:true },
  { id:'std-blanco',    nombre:'Neón Estándar 12mm', color:'Blanco cálido', precioM:240, wattsM:12, alturaMinCm:10, activo:true },
  { id:'std-blancof',   nombre:'Neón Estándar 12mm', color:'Blanco frío',   precioM:240, wattsM:12, alturaMinCm:10, activo:true },
  { id:'std-azul',      nombre:'Neón Estándar 12mm', color:'Azul',          precioM:260, wattsM:12, alturaMinCm:10, activo:true },
  { id:'std-rojo',      nombre:'Neón Estándar 12mm', color:'Rojo',          precioM:260, wattsM:12, alturaMinCm:10, activo:true },
  { id:'std-rosa',      nombre:'Neón Estándar 12mm', color:'Rosa',          precioM:280, wattsM:12, alturaMinCm:10, activo:true },
  { id:'std-amarillo',  nombre:'Neón Estándar 12mm', color:'Amarillo',      precioM:260, wattsM:12, alturaMinCm:10, activo:true },
  { id:'std-verde',     nombre:'Neón Estándar 12mm', color:'Verde',         precioM:260, wattsM:12, alturaMinCm:10, activo:true },
  { id:'std-rgb',       nombre:'Neón Estándar 12mm', color:'RGB',           precioM:420, wattsM:14, alturaMinCm:10, activo:true },
  { id:'prem-blanco',   nombre:'Neón Premium 16mm',  color:'Blanco cálido', precioM:340, wattsM:16, alturaMinCm:15, activo:true },
  { id:'prem-rgb',      nombre:'Neón Premium 16mm',  color:'RGB direccionable', precioM:580, wattsM:18, alturaMinCm:15, activo:true },
];
let NEON_PERFILES_RAW = storageLoad('sgi_neon_perfiles', _NEON_PERFILES_DEFAULTS);
let NEON_PERFILES     = NEON_PERFILES_RAW.filter(p => p.activo !== false);

// Parámetros generales editables (todos MXN salvo indicadores):
//   silMlPorM  ml de silicón consumidos por metro de trazo
//   silPrecio  MXN por ml de silicón
//   cableM     MXN por metro de cable acoplado al neón
//   costoUnion MXN por unión/soldadura
//   fuenteW    watts de la fuente estándar (para dimensionar)
//   fuentePrecio MXN por fuente
//   fuenteFactor factor de seguridad (0.8 = usar 80% de la capacidad de la fuente)
//   accesM     MXN por metro para conectores/tornillería/tapas prorrateados
//   mPorMin    metros instalados por minuto (velocidad de mano de obra)
//   tarifaHora MXN por hora del técnico
//   merma      fracción sobre insumos (0.05 = 5%)
//   margen     fracción sobre costo directo (0.35 = 35%)
//   urgencias  lista de niveles con multiplicador final
const _NEON_PARAMS_DEFAULTS = {
  cableM:        18,      // MXN por metro de cable
  accesM:        35,      // MXN por metro de accesorios (grapas, tornillos, conectores)
  consumiblesPct: 0.08,   // 8% sobre materiales: cianoacrilato + soldadura + varios
  fuenteFactor:  0.80,    // factor de seguridad (usar 80% de capacidad de la fuente)
  mPorMin:       0.6,     // metros de neón que se instalan por minuto
  tarifaHora:    180,     // MXN/h de mano de obra
  merma:         0.05,    // 5% sobre insumos
  margen:        0.35,    // 35% sobre costo directo
  desperdicioUmbralCm: 30, // Tiras sobrantes ≤ este ancho se cobran (asume no reutilizables).
                           // Tiras > este ancho se asumen reutilizables y no se cobran.
  // Catálogo de fuentes de poder / adaptadores / pilas. watts=0 para portátil.
  fuentes: [
    { id:'f60',   nombre:'Fuente 60W',                watts:60,  precio:280,  tipo:'fuente',    activo:true },
    { id:'f100',  nombre:'Fuente 100W estándar',      watts:100, precio:380,  tipo:'fuente',    activo:true },
    { id:'f150',  nombre:'Fuente 150W',               watts:150, precio:520,  tipo:'fuente',    activo:true },
    { id:'f200',  nombre:'Fuente 200W',               watts:200, precio:680,  tipo:'fuente',    activo:true },
    { id:'f300',  nombre:'Fuente 300W',               watts:300, precio:980,  tipo:'fuente',    activo:true },
    { id:'ad12',  nombre:'Adaptador 12V 5A (60W)',    watts:60,  precio:150,  tipo:'adaptador', activo:true },
    { id:'ad24',  nombre:'Adaptador 24V 3A (72W)',    watts:72,  precio:220,  tipo:'adaptador', activo:true },
    { id:'p9v',   nombre:'Pila 9V (portátil)',        watts:9,   precio:80,   tipo:'pila',      activo:true },
    { id:'plit',  nombre:'Batería Li-ion recargable', watts:40,  precio:450,  tipo:'pila',      activo:true },
  ],
  // Catálogo de consumibles (referencia de inventario y precios).
  // El costo se calcula con consumiblesPct, esto es para tener registro de qué se usa.
  consumibles: [
    { id:'ca-loctite', nombre:'Cianoacrilato Loctite 401', precio:120, unidad:'pza',   activo:true },
    { id:'ca-3m',      nombre:'Cianoacrilato 3M',           precio:95,  unidad:'pza',   activo:true },
    { id:'ca-kola',    nombre:'Kola Loka (genérico)',       precio:35,  unidad:'pza',   activo:true },
    { id:'sold-est',   nombre:'Soldadura estaño 60/40 1mm', precio:180, unidad:'rollo', activo:true },
    { id:'flux',       nombre:'Flux para soldadura',        precio:80,  unidad:'pza',   activo:true },
    { id:'termo',      nombre:'Termofit 3mm surtido',       precio:120, unidad:'juego', activo:true },
  ],
  // Bases donde se monta el neón.
  //   tipoPrecio='lamina' → se compra por lámina completa (acrílico, PVC, trovicel, alucobond).
  //                        precioLamina, laminaW, laminaH definen el precio y el tamaño de la lámina.
  //                        El sistema calcula el costo del pedazo usado y opcionalmente el desperdicio.
  //   tipoPrecio='pieza'  → se compra ya cortado a medida (MDF). precioM2 se cobra directo por área.
  bases: [
    { id:'acr-3-tr',    nombre:'Acrílico transparente 3mm', tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:2450, activo:true },
    { id:'acr-6-tr',    nombre:'Acrílico transparente 6mm', tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:4030, activo:true },
    { id:'acr-3-neg',   nombre:'Acrílico negro 3mm',        tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:2590, activo:true },
    { id:'acr-6-neg',   nombre:'Acrílico negro 6mm',        tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:4180, activo:true },
    { id:'mdf-6-crudo', nombre:'MDF 6mm crudo',             tipoPrecio:'pieza',  precioM2:280,  activo:true },
    { id:'mdf-6-pint',  nombre:'MDF 6mm pintado',           tipoPrecio:'pieza',  precioM2:520,  activo:true },
    { id:'mdf-9-pint',  nombre:'MDF 9mm pintado',           tipoPrecio:'pieza',  precioM2:680,  activo:true },
    { id:'pvc-3',       nombre:'PVC espumado 3mm',          tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:1090, activo:true },
    { id:'pvc-6',       nombre:'PVC espumado 6mm',          tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:1790, activo:true },
    { id:'trov-3',      nombre:'Trovicel 3mm',              tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:980,  activo:true },
    { id:'aluco-3',     nombre:'Alucobond 3mm',             tipoPrecio:'lamina', laminaW:120, laminaH:240, precioLamina:3600, activo:true },
    { id:'sin-base',    nombre:'Sin base (solo neón)',      tipoPrecio:'pieza',  precioM2:0,    activo:true },
  ],
  // Formas de la base. factorArea = fracción del rectángulo aprovechada
  //   (rect = 1.0; silueta calada aprovecha menos por los recortes internos y perímetro complejo).
  // corteM = MXN por metro de corte extra en el contorno (láser/CNC) — solo aplica a silueta.
  formas: [
    { id:'rect',       nombre:'Rectangular',       factorArea:1.00, corteM:0  },
    { id:'silueta',    nombre:'Silueta / calada',  factorArea:0.85, corteM:35 },
    { id:'redondeada', nombre:'Rectangular c/ esquinas', factorArea:0.98, corteM:12 },
  ],
  soportePrecio: 180,   // costo de kit de separadores/soportes por anuncio
  urgencias: [
    { id:'normal',  nombre:'Normal',  dias:'7–10 días', mult:1.00 },
    { id:'rapido',  nombre:'Rápido',  dias:'4–5 días',  mult:1.20 },
    { id:'express', nombre:'Express', dias:'48–72 hrs', mult:1.45 },
  ],
};
let NEON_PARAMS = (() => {
  const raw = storageLoad('sgi_neon_params', {});
  const clean = { ..._NEON_PARAMS_DEFAULTS };
  for (const k of Object.keys(_NEON_PARAMS_DEFAULTS)) {
    if (raw && raw[k] !== undefined) clean[k] = raw[k];
  }
  return clean;
})();

// ── FUNCIÓN PURA DE CÁLCULO ──────────────────────────────────────────────────
// Entradas:
//   Lm            longitud lineal de neón (metros)
//   uniones       # de uniones/soldaduras
//   perfil        { precioM, wattsM } del catálogo
//   dimensiones   { anchoCm, altoCm } del anuncio (para calcular área de base)
//   base          { material, forma, incluirSoporte } — material y forma vienen del catálogo
//   params        parámetros generales del catálogo
//   urgenciaMult  multiplicador final (1.0 normal, 1.2 rápido, etc.)
// Devuelve el desglose completo. Sin lecturas de window, sin fetch, sin new Date.
function calcularNeon({ Lm, uniones, perfil, fuente, dimensiones, base, params, urgenciaMult, manoObraOverride }) {
  const L   = Math.max(0, Number(Lm) || 0);
  const un  = Math.max(0, Math.floor(Number(uniones) || 0));
  const P   = perfil || { precioM: 0, wattsM: 0 };
  const p   = params || _NEON_PARAMS_DEFAULTS;
  const urg = Math.max(0.01, Number(urgenciaMult) || 1);
  const dim = dimensiones || { anchoCm: 0, altoCm: 0 };
  const bMat = base?.material || { nombre:'Sin base', precioM2: 0 };
  const bFor = base?.forma    || { nombre:'Rectangular', factorArea: 1, corteM: 0 };
  // Fuente elegida (fallback a la primera del catálogo si no viene)
  const F = fuente || (p.fuentes || []).find(f => f.activo !== false) || { nombre:'Fuente', watts:100, precio:380 };

  // Cuántas fuentes se necesitan según capacidad efectiva (watts × factor de seguridad)
  const capFuente  = (F.watts || 0) * p.fuenteFactor;
  const wattsTotal = L * P.wattsM;
  const numFuentes = capFuente > 0 ? Math.max(L > 0 ? 1 : 0, Math.ceil(wattsTotal / capFuente)) : 0;

  // Base: dos modelos según cómo se compra el material.
  //   pieza  → precio por m² directo (MDF: ya lo compras cortado a medida)
  //   lamina → precio por lámina completa; se calcula MXN/cm² y se cobra el área usada
  //            (opcionalmente + tira de desperdicio si base.cobrarDesperdicio)
  const anchoCm = Number(dim.anchoCm) || 0;
  const altoCm  = Number(dim.altoCm)  || 0;
  const anchoM  = anchoCm / 100;
  const altoM   = altoCm  / 100;
  const areaRectM2 = round2(anchoM * altoM * 100) / 100;                       // rectángulo contenedor
  const areaM2     = round2(areaRectM2 * (bFor.factorArea || 1) * 100) / 100;  // área útil (con factor de forma)
  const perimM     = round2(2 * (anchoM + altoM) * 100) / 100;

  let importeBase = 0;
  let importeBaseAuto = 0; // sugerencia calculada (para UI cuando hay override)
  let importeDesperdicio = 0;
  let desperdicioM2 = 0;
  let desperdicioTiraCm = 0;
  const tipo = bMat.tipoPrecio || (bMat.precioLamina ? 'lamina' : 'pieza');

  if (tipo === 'lamina') {
    const lW = Number(bMat.laminaW) || 120;
    const lH = Number(bMat.laminaH) || 240;
    const laminaCm2   = lW * lH;
    const precioLam   = Number(bMat.precioLamina) || 0;
    const precioCm2   = laminaCm2 > 0 ? precioLam / laminaCm2 : 0;
    const areaCm2Util = areaM2 * 10000;
    importeBase = round2(areaCm2Util * precioCm2);

    if (base?.cobrarDesperdicio && anchoCm > 0 && altoCm > 0 && precioCm2 > 0) {
      // Elige la mejor orientación: la que deja tira lateral más chica y >=0.
      const gaps = [];
      if (anchoCm <= lW && altoCm <= lH) gaps.push(lW - anchoCm);
      if (altoCm  <= lW && anchoCm <= lH) gaps.push(lW - altoCm);
      if (gaps.length) {
        desperdicioTiraCm = Math.min(...gaps);
        // Solo se cobra si la tira es angosta (≤ umbral). Tiras anchas se asumen reutilizables.
        const umbral = Number(p.desperdicioUmbralCm) || 30;
        if (desperdicioTiraCm > 0 && desperdicioTiraCm <= umbral) {
          const wasteCm2 = desperdicioTiraCm * lH;
          desperdicioM2      = round2(wasteCm2 / 10000 * 100) / 100;
          importeDesperdicio = round2(wasteCm2 * precioCm2);
        }
        // Si tira > umbral, desperdicioTiraCm se conserva para mostrar en UI
        // pero desperdicioM2 e importeDesperdicio quedan en 0.
      }
    }
  } else {
    // Pieza — se compra ya cortada. Si viene override manual, se usa ese costo.
    // Si no, se estima como area × precioM2 (referencia; el proveedor real puede variar).
    importeBaseAuto = round2(areaM2 * (bMat.precioM2 || 0));
    const overridePieza = Number(base?.piezaCostoOverride);
    importeBase = overridePieza > 0 ? round2(overridePieza) : importeBaseAuto;
  }

  const importeCorte  = round2(perimM * (bFor.corteM || 0));
  const importeCorteExtra = round2(Math.max(0, Number(base?.corteExtra) || 0));
  const importeSoport = base?.incluirSoporte ? (p.soportePrecio || 0) : 0;

  // Insumos: partidas por metro/unidad + base + corte
  const insumos = [
    { concepto:'Neón LED',              cantidad:L,       unidad:'m',      unit:P.precioM,      importe:round2(L * P.precioM) },
    { concepto:'Cable',                  cantidad:L,       unidad:'m',      unit:p.cableM,       importe:round2(L * p.cableM) },
    { concepto:'Accesorios',             cantidad:L,       unidad:'m',      unit:p.accesM,       importe:round2(L * p.accesM) },
    { concepto:F.nombre,                 cantidad:numFuentes, unidad:'pza', unit:F.precio,       importe:round2(numFuentes * (F.precio||0)) },
  ];
  if (importeBase > 0) {
    const unitBase = tipo === 'lamina' && bMat.precioLamina
      ? round2((bMat.precioLamina / ((bMat.laminaW||120) * (bMat.laminaH||240))) * 10000) // MXN/m² efectivo
      : (bMat.precioM2 || 0);
    insumos.push({ concepto:`Base · ${bMat.nombre} (${bFor.nombre})`, cantidad:areaM2, unidad:'m²', unit:unitBase, importe:importeBase });
  }
  if (importeDesperdicio > 0) {
    insumos.push({
      concepto:`Desperdicio de lámina (tira ${desperdicioTiraCm.toFixed(0)} cm)`,
      cantidad:desperdicioM2, unidad:'m²',
      unit:round2(importeDesperdicio / (desperdicioM2 || 1)),
      importe:importeDesperdicio,
    });
  }
  if (importeCorte > 0) {
    insumos.push({ concepto:`Corte especial (${bFor.nombre})`, cantidad:perimM, unidad:'m', unit:bFor.corteM, importe:importeCorte });
  }
  if (importeCorteExtra > 0) {
    insumos.push({ concepto:'Corte láser adicional (manual)', cantidad:1, unidad:'lote', unit:importeCorteExtra, importe:importeCorteExtra });
  }
  if (importeSoport > 0) {
    insumos.push({ concepto:'Kit de separadores / soportes', cantidad:1, unidad:'kit', unit:p.soportePrecio, importe:importeSoport });
  }
  // Consumibles = % sobre materiales (cianoacrilato, soldadura, varios menores)
  const pct = Math.max(0, Number(p.consumiblesPct) || 0);
  const baseParaPct   = insumos.reduce((s, x) => s + x.importe, 0);
  const importeConsum = round2(baseParaPct * pct);
  if (importeConsum > 0) {
    insumos.push({
      concepto:`Consumibles (cianoacrilato + soldadura) · ${Math.round(pct*100)}%`,
      cantidad:1, unidad:'lote', unit:importeConsum, importe:importeConsum,
    });
  }
  const totalInsumos = round2(insumos.reduce((s, x) => s + x.importe, 0));

  // Mano de obra: default = Lm × velocidad × tarifa; override manual desde el módulo si viene.
  const horas       = p.mPorMin > 0 ? L / p.mPorMin / 60 : 0;
  const manoObraAuto = round2(horas * p.tarifaHora);
  const manoObra    = (manoObraOverride !== undefined && manoObraOverride !== null && manoObraOverride !== '')
    ? round2(Math.max(0, Number(manoObraOverride) || 0))
    : manoObraAuto;

  const costoDirecto = round2(totalInsumos + manoObra);
  const subtotal     = round2(costoDirecto * (1 + p.merma));
  const precio       = round2(subtotal * (1 + p.margen) * urg);
  const iva          = round2(precio * 0.16);
  const precioIva    = round2(precio + iva);

  return {
    Lm: L, uniones: un, wattsTotal: round2(wattsTotal), numFuentes,
    fuenteNombre: F.nombre, fuenteWatts: F.watts || 0, fuenteTipo: F.tipo || 'fuente',
    anchoCm: dim.anchoCm || 0, altoCm: dim.altoCm || 0, areaM2, perimM,
    baseMat: bMat.nombre, baseTipo: tipo, baseForma: bFor.nombre,
    importeBase, importeBaseAuto,
    desperdicioM2, desperdicioTiraCm, importeDesperdicio,
    insumos, totalInsumos,
    horas: round2(horas * 100) / 100, manoObra, manoObraAuto,
    costoDirecto, merma: p.merma, margen: p.margen, urgenciaMult: urg,
    subtotal, precio, iva, precioIva,
  };
}

// Persistencia de cotizaciones de neón
let NEON_COTIZ_LIST = storageLoad('sgi_neon_cotiz', []);

function refreshNeonPerfiles(raw) {
  storageSave('sgi_neon_perfiles', raw);
  window.NEON_PERFILES_RAW = raw;
  window.NEON_PERFILES = raw.filter(p => p.activo !== false);
}
function refreshNeonParams(data) {
  // Empezar de los defaults y sobreponer solo las llaves conocidas,
  // así se limpian valores obsoletos (silMlPorM, silPrecio, costoUnion)
  const clean = { ..._NEON_PARAMS_DEFAULTS };
  for (const k of Object.keys(_NEON_PARAMS_DEFAULTS)) {
    if (data && data[k] !== undefined) clean[k] = data[k];
  }
  storageSave('sgi_neon_params', clean);
  window.NEON_PARAMS = clean;
}
function saveNeonCotiz(cot) {
  const raw = storageLoad('sgi_neon_cotiz', []);
  const idx = raw.findIndex(c => c.id === cot.id);
  const next = idx >= 0 ? raw.map(c => c.id === cot.id ? cot : c) : [cot, ...raw];
  storageSave('sgi_neon_cotiz', next);
  window.NEON_COTIZ_LIST = next;
  return cot;
}
function deleteNeonCotiz(id) {
  const next = storageLoad('sgi_neon_cotiz', []).filter(c => c.id !== id);
  storageSave('sgi_neon_cotiz', next);
  window.NEON_COTIZ_LIST = next;
}
function nextNeonFolio() {
  const yr  = new Date().getFullYear();
  const key = `sgi_neon_folio_${yr}`;
  const n   = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
  localStorage.setItem(key, String(n));
  if (window.SGISync) window.SGISync.queuePush(key);
  return `NEON-${yr}-${String(n).padStart(4, '0')}`;
}

// ===== USUARIOS =====
const _US_DEFAULTS = [
  { id:'u1', nombre:'Ana Martínez',  initials:'AM', rol:'cajero', pin:'1234', activo:true },
  { id:'u2', nombre:'Carlos Ruiz',   initials:'CR', rol:'cajero', pin:'5678', activo:true },
];
let USUARIOS_RAW = storageLoad('sgi_usuarios', _US_DEFAULTS);
let USUARIOS     = USUARIOS_RAW;

// ===== NEGOCIO =====
const _NEG_DEFAULTS = {
  nombre:    'Servicios Gráficos de Impresión',
  direccion: 'Ramos Millán No. 27',
  colonia:   'Kennedy',
  ciudad:    'Hgo. del Parral',
  estado:    'Chih.',
  cp:        '',
  rfc:       'MACM720128MW6',
  telefono:  '6271058353',
  email:     '',
};
let NEGOCIO = storageLoad('sgi_negocio', _NEG_DEFAULTS);

// ===== FUNCIONES DE ACTUALIZACIÓN EN CALIENTE =====
// Llamadas desde Config para actualizar window vars sin recargar la página
function refreshCopiadoDirect(raw) {
  storageSave('sgi_copiado_direct', raw);
  window.COPIADO_DIRECT_RAW = raw;
  window.COPIADO_DIRECT = _addIcons(raw.filter(s => s.activo !== false));
}
function refreshPrintPaper(raw) {
  storageSave('sgi_print_paper', raw);
  window.PRINT_PAPER_RAW = raw;
  window.PRINT_PAPER = raw.filter(p => p.activo !== false);
}
function refreshImpresoTipos(raw) {
  storageSave('sgi_impreso_tipos', raw);
  window.IMPRESO_TIPOS_RAW = raw;
  window.IMPRESO_TIPOS = raw.filter(t => t.activo !== false);
}
function refreshCopiadoOpciones(data) {
  storageSave('sgi_copiado_opciones', data);
  window.COPIADO_OPC     = data;
  window.PRINT_FINISH    = data.printFinish;
  window.PRINT_URGENCY   = data.printUrgency;
  window.ENGARGO_TYPES   = data.engargoTipos;
  window.ENGARGO_PASTAS  = data.engargoPastas;
  window.PLANOS_TIPO     = data.planosTipo;
  window.PLANOS_TAM      = data.planosTam;
  window.IMPRESO_VOL     = data.impresoVol;
  window.IMPRESO_PAPELES = data.impresoPapeles;
  window.IMPRESO_ACABADOS = data.impresoAcabados;
  window.IMPRESO_URGENCIA = data.impresoUrgencia;
}
function refreshGfMaterials(raw) {
  storageSave('sgi_gf_materials', raw);
  window.GF_MATERIALS_RAW = raw;
  window.GF_MATERIALS = raw.filter(m => m.activo !== false);
}
function refreshGfFinish(raw) {
  storageSave('sgi_gf_finish', raw);
  window.GF_FINISH = raw;
}
function refreshGfParams(p) {
  const clean = { ..._GFP_DEFAULTS, ...p };
  storageSave('sgi_gf_params', clean);
  window.GF_PARAMS = clean;
}
function refreshBordadoTelas(raw) {
  storageSave('sgi_bordado_telas', raw);
  window.BORDADO_TELAS_RAW = raw;
  window.BORDADO_TELAS = raw.filter(t => t.activo !== false);
}
function refreshBordadoPrecios(data) {
  storageSave('sgi_bordado_precios', data);
  window.BORDADO_PRECIOS = data;
}
function refreshUsuarios(raw) {
  storageSave('sgi_usuarios', raw);
  window.USUARIOS_RAW = raw;
  window.USUARIOS = raw;
}
function refreshNegocio(data) {
  storageSave('sgi_negocio', data);
  window.NEGOCIO = data;
}
// ===== CONTABILIDAD =====
const _TODAY = localISO();
const _YDAY  = localISO(new Date(Date.now() - 86400000));

const _CF_DEFAULTS = [
  { id:'cf1', fecha:'2026-05-02', folio:'F-001', rfc:'XAXX010101000',  razon:'Público en General',         concepto:'Servicios de impresión digital',          subtotal:1724.14, iva:275.86,  total:2000.00, estado:'pagado',   formaPago:'efectivo',      metodoPago:'PUE' },
  { id:'cf2', fecha:'2026-05-03', folio:'F-002', rfc:'EMPR800101ABC',  razon:'Empresa Constructora ABC SA', concepto:'Gran Formato – lonas y banners para obra',subtotal:5172.41, iva:827.59,  total:6000.00, estado:'pagado',   formaPago:'transferencia', metodoPago:'PUE' },
  { id:'cf3', fecha:'2026-05-05', folio:'F-003', rfc:'GOME900201XYZ',  razon:'Gómez Distribuciones SA',    concepto:'Bordado en 50 uniformes corporativos',    subtotal:1551.72, iva:248.28,  total:1800.00, estado:'pendiente',formaPago:'transferencia', metodoPago:'PPD' },
  { id:'cf4', fecha:'2026-05-06', folio:'F-004', rfc:'MANU010103DEF',  razon:'Manufacturas del Norte SA',  concepto:'Letras 3D y señalética de local',         subtotal:4137.93, iva:662.07,  total:4800.00, estado:'pagado',   formaPago:'transferencia', metodoPago:'PUE' },
];
let CFDI_LIST = storageLoad('sgi_cfdi', _CF_DEFAULTS);

const _GA_DEFAULTS = [
  { id:'ga1', fecha:'2026-05-01', proveedor:'Papeles del Norte SA de CV',    rfc:'PNO010101ABC', concepto:'Resmas de papel bond, couché y fotográfico',         subtotal:3448.28, iva:551.72,  total:4000.00 },
  { id:'ga2', fecha:'2026-05-04', proveedor:'Tintas y Suministros México SA', rfc:'TIS020202XYZ', concepto:'Tóner y cartuchos de tinta para plotters y copiadoras',subtotal:2155.17, iva:344.83, total:2500.00 },
  { id:'ga3', fecha:'2026-05-05', proveedor:'Arrendamiento Local 14 SA',      rfc:'ALO030303GHI', concepto:'Renta mensual del local comercial – mayo 2026',       subtotal:8620.69, iva:1379.31, total:10000.00 },
];
let GASTOS_LIST = storageLoad('sgi_gastos', _GA_DEFAULTS);

let VENTAS_ALL = storageLoad('sgi_ventas', []);

function saveSale(sale) {
  // Releer localStorage (no la caché en memoria) para no perder ventas de otra pestaña
  const next = [sale, ...storageLoad('sgi_ventas', [])];
  const ok = storageSave('sgi_ventas', next);
  window.VENTAS_ALL = next;
  if (!ok) alert('⚠ ADVERTENCIA: la venta NO se pudo guardar en el equipo (almacenamiento lleno o bloqueado). Anótala manualmente y respalda tus datos.');
  return ok;
}
function refreshCfdi(list) { storageSave('sgi_cfdi', list); window.CFDI_LIST = list; }
function refreshGastos(list) { storageSave('sgi_gastos', list); window.GASTOS_LIST = list; }

// ===== RESPALDOS =====
const _BK_CFG_DEFAULTS = {
  autoEnabled:   true,
  intervalHoras: 24,
  destinations:  { local: true, usb: false, cloud: false },
  lastBackupMs:  null,
};
let BACKUP_CONFIG    = storageLoad('sgi_backup_cfg',  _BK_CFG_DEFAULTS);
let BACKUP_META_LIST = storageLoad('sgi_backup_meta', []);

// ===== PEDIDOS (SEGUIMIENTO DE ÓRDENES) =====
let PEDIDOS_LIST = storageLoad('sgi_pedidos', []);

function savePedido(pedido) {
  const raw = storageLoad('sgi_pedidos', []);
  const idx = raw.findIndex(p => p.id === pedido.id);
  const next = idx >= 0 ? raw.map(p => p.id === pedido.id ? pedido : p) : [pedido, ...raw];
  storageSave('sgi_pedidos', next);
  window.PEDIDOS_LIST = next;
  return next;
}
function deletePedido(id) {
  const next = storageLoad('sgi_pedidos', []).filter(p => p.id !== id);
  storageSave('sgi_pedidos', next);
  window.PEDIDOS_LIST = next;
  return next;
}
function nextCotiNum() {
  const year = new Date().getFullYear();
  const key  = `sgi_coti_num_${year}`;
  const n    = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
  localStorage.setItem(key, String(n));
  if (window.SGISync) window.SGISync.queuePush(key);
  return `COT-${year}-${String(n).padStart(3, '0')}`;
}

const _BK_ALL_KEYS = [
  'sgi_copiado_direct','sgi_print_paper','sgi_impreso_tipos','sgi_copiado_opciones',
  'sgi_gf_materials','sgi_gf_finish','sgi_gf_params','sgi_bordado_telas','sgi_bordado_precios',
  'sgi_usuarios','sgi_negocio','sgi_cfdi','sgi_gastos','sgi_ventas',
  'sgi_pedidos','sgi_backup_cfg','sgi_backup_meta',
  'sgi_coti_catalog','sgi_cotizaciones','sgi_api_key',
  'sgi_tickets_pausados',
  'sgi_neon_perfiles','sgi_neon_params','sgi_neon_cotiz',
];

function refreshBackupConfig(cfg) {
  storageSave('sgi_backup_cfg', cfg);
  window.BACKUP_CONFIG = cfg;
}
function saveBackupRecord(rec) {
  const next = [rec, ...(window.BACKUP_META_LIST || []).slice(0, 29)];
  storageSave('sgi_backup_meta', next);
  window.BACKUP_META_LIST = next;
  return next;
}
function deleteBackupRecord(id) {
  const next = (window.BACKUP_META_LIST || []).filter(r => r.id !== id);
  storageSave('sgi_backup_meta', next);
  window.BACKUP_META_LIST = next;
}
function collectBackupData() {
  const data = { version: '1.0', exportedAt: new Date().toISOString(), keys: {} };
  _BK_ALL_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) data.keys[k] = v;
  });
  return data;
}
function restoreBackupData(data) {
  if (!data || !data.keys) throw new Error('Formato de respaldo inválido');
  Object.entries(data.keys).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch {} });
}
function isBackupOverdue() {
  const cfg = window.BACKUP_CONFIG || {};
  if (!cfg.lastBackupMs) return true;
  return Date.now() - cfg.lastBackupMs > 2 * 24 * 60 * 60 * 1000;
}

// ===== COTIZADOR EXPRESS =====

const COTI_CATS = [
  { id:'tarjetas',    label:'Tarjetas' },
  { id:'volantes',    label:'Volantes' },
  { id:'tripticos',   label:'Trípticos' },
  { id:'posters',     label:'Pósters' },
  { id:'folders',     label:'Folders' },
  { id:'imanes',      label:'Imanes' },
  { id:'membretadas', label:'Membretadas' },
  { id:'formatos',    label:'Formatos/Bloques' },
  { id:'granformato', label:'Gran Formato' },
  { id:'acabados',    label:'Acabados' },
];

// precios de millar: precio = total del lote (no por pieza)
// precios de bloque/m²/pza: precio = por unidad en ese tier
const _CC_DEFAULTS = [
  // ── TARJETAS ─────────────────────────────────────────────────────────────
  { id:'tc-bz-f',  cat:'tarjetas', nombre:'Tarjeta Barniz UV Frente',      specs:'Sulf 12pts · 9×5cm · 4x0/4x1',          unidad:'millar', tiered:false, precios:[{qty:1000,precio:180}] },
  { id:'tc-bz-2',  cat:'tarjetas', nombre:'Tarjeta Barniz UV 2 lados',     specs:'Sulf 12pts · 9×5cm · 4x4',              unidad:'millar', tiered:false, precios:[{qty:1000,precio:310}] },
  { id:'tc-lm-2',  cat:'tarjetas', nombre:'Tarjeta Laminado Mate 2 lados', specs:'Sulf 12pts · 9×5cm · 4x4/4x0/4x1',     unidad:'millar', tiered:false, precios:[{qty:1000,precio:310}] },
  { id:'tc-hs',    cat:'tarjetas', nombre:'Tarjeta Hotstamping',           specs:'Sulf 12pts · Lam Mate · 1 color foil',  unidad:'millar', tiered:false, precios:[{qty:1000,precio:1400}] },
  // ── VOLANTES ─────────────────────────────────────────────────────────────
  { id:'vol-qto-4x0', cat:'volantes', nombre:'Volante ¼ Carta 4×0',       specs:'Couché 130grs · solo frente',            unidad:'millar', tiered:true,
    precios:[{qty:1000,precio:310},{qty:2000,precio:500},{qty:5000,precio:1300},{qty:10000,precio:2100}] },
  { id:'vol-qto-4x1', cat:'volantes', nombre:'Volante ¼ Carta 4×1',       specs:'Couché 130grs · frente col / dorso B/N', unidad:'millar', tiered:true,
    precios:[{qty:1000,precio:350},{qty:2000,precio:570},{qty:5000,precio:1500},{qty:10000,precio:2300}] },
  { id:'vol-qto-4x4', cat:'volantes', nombre:'Volante ¼ Carta 4×4',       specs:'Couché 130grs · full color 2 lados',    unidad:'millar', tiered:true,
    precios:[{qty:1000,precio:760},{qty:2000,precio:850},{qty:5000,precio:2500},{qty:10000,precio:2800}] },
  { id:'vol-med-4x0', cat:'volantes', nombre:'Volante ½ Carta 4×0',       specs:'Couché 130grs · solo frente',            unidad:'millar', tiered:true,
    precios:[{qty:1000,precio:500},{qty:2000,precio:1000},{qty:5000,precio:2100},{qty:10000,precio:4000}] },
  { id:'vol-med-4x1', cat:'volantes', nombre:'Volante ½ Carta 4×1',       specs:'Couché 130grs · frente col / dorso B/N', unidad:'millar', tiered:true,
    precios:[{qty:1000,precio:570},{qty:2000,precio:1140},{qty:5000,precio:2300},{qty:10000,precio:4300}] },
  { id:'vol-med-4x4', cat:'volantes', nombre:'Volante ½ Carta 4×4',       specs:'Couché 130grs · full color 2 lados',    unidad:'millar', tiered:true,
    precios:[{qty:1000,precio:850},{qty:2000,precio:1700},{qty:5000,precio:2800},{qty:10000,precio:5400}] },
  // ── TRÍPTICOS / DÍPTICOS ─────────────────────────────────────────────────
  { id:'trip-c', cat:'tripticos', nombre:'Tríptico / Díptico 1/3 Carta',  specs:'Couché 130grs brillante · 4x4 · 21.5×9.33cm', unidad:'millar', tiered:true,
    precios:[{qty:1000,precio:1750},{qty:2000,precio:3400},{qty:5000,precio:6200}] },
  // ── PÓSTERS ──────────────────────────────────────────────────────────────
  { id:'post-dc', cat:'posters', nombre:'Póster Doble Carta',              specs:'Couché 130grs brillante · 4x0 · 28×43cm',     unidad:'millar', tiered:false, precios:[{qty:1000,precio:2100}] },
  { id:'post-cc', cat:'posters', nombre:'Póster Cuatro Cartas',            specs:'Couché 130grs brillante · 4x0 · 56×43cm',     unidad:'millar', tiered:false, precios:[{qty:1000,precio:3950}] },
  // ── FOLDERS ──────────────────────────────────────────────────────────────
  { id:'fold-ec', cat:'folders', nombre:'Folder Económico 2 solapas',      specs:'Sulf 12pts · 22×29cm · barniz UV frente',      unidad:'millar', tiered:false, precios:[{qty:1000,precio:5700}] },
  // ── IMANES ───────────────────────────────────────────────────────────────
  { id:'iman-std', cat:'imanes', nombre:'Imán Impreso 9×5 cm',             specs:'Calibre 15pts · 4x0 · adhesivo sobre imán',    unidad:'millar', tiered:false, precios:[{qty:1000,precio:2100}] },
  // ── HOJAS MEMBRETADAS ────────────────────────────────────────────────────
  { id:'memb-bond', cat:'membretadas', nombre:'Hoja Membretada Bond 90 grs',     specs:'Bond 90grs · Carta · 4x0',   unidad:'millar', tiered:true, precios:[{qty:1000,precio:1750},{qty:2000,precio:2300}] },
  { id:'memb-opal', cat:'membretadas', nombre:'Hoja Membretada Opalina 125 grs', specs:'Opalina 125grs · Carta · 4x0', unidad:'millar', tiered:true, precios:[{qty:1000,precio:2100},{qty:2000,precio:3100}] },
  // ── FORMATOS / BLOQUES (uso principal: minería y seguridad) ──────────────
  // precio = por unidad (bloque) en ese rango de cantidad
  { id:'blk-bn-100',  cat:'formatos', nombre:'Bloque Formatos B/N — 100 hojas',  specs:'Bond 75grs · carta u oficio · pegado en block + tapa', unidad:'bloque', tiered:true,  precios:[{qty:1,precio:95},{qty:5,precio:85},{qty:10,precio:78}] },
  { id:'blk-col-100', cat:'formatos', nombre:'Bloque Formatos Color — 100 hojas', specs:'Bond 75grs · carta u oficio · pegado en block + tapa', unidad:'bloque', tiered:true,  precios:[{qty:1,precio:200},{qty:5,precio:185},{qty:10,precio:170}] },
  { id:'blk-bn-200',  cat:'formatos', nombre:'Bloque Formatos B/N — 200 hojas',  specs:'Bond 75grs · carta u oficio · pegado en block + tapa', unidad:'bloque', tiered:true,  precios:[{qty:1,precio:175},{qty:5,precio:160},{qty:10,precio:145}] },
  { id:'blk-col-200', cat:'formatos', nombre:'Bloque Formatos Color — 200 hojas', specs:'Bond 75grs · carta u oficio · pegado en block + tapa', unidad:'bloque', tiered:true,  precios:[{qty:1,precio:385},{qty:5,precio:355},{qty:10,precio:320}] },
  { id:'blk-bn-300',  cat:'formatos', nombre:'Bloque Formatos B/N — 300 hojas',  specs:'Bond 75grs · carta u oficio · pegado en block + tapa', unidad:'bloque', tiered:true,  precios:[{qty:1,precio:250},{qty:5,precio:230},{qty:10,precio:215}] },
  { id:'blk-col-300', cat:'formatos', nombre:'Bloque Formatos Color — 300 hojas', specs:'Bond 75grs · carta u oficio · pegado en block + tapa', unidad:'bloque', tiered:true,  precios:[{qty:1,precio:570},{qty:5,precio:540},{qty:10,precio:500}] },
  // ── GRAN FORMATO ─────────────────────────────────────────────────────────
  { id:'gf-lona-13', cat:'granformato', nombre:'Lona 13 onzas',           specs:'Incluye dobladillo y 4 ojillos/m²',  unidad:'m²',   tiered:false, precios:[{qty:1,precio:90}] },
  { id:'gf-lona-ch', cat:'granformato', nombre:'Lona pequeña ≤ 0.5 m²',  specs:'Precio unitario sin mínimo',         unidad:'pieza',tiered:false, precios:[{qty:1,precio:60}] },
  { id:'gf-vinil',   cat:'granformato', nombre:'Vinil Gran Formato',      specs:'Mínimo 5 m²',                        unidad:'m²',   tiered:false, precios:[{qty:1,precio:180}] },
  // ── ACABADOS ─────────────────────────────────────────────────────────────
  { id:'ac-desp', cat:'acabados', nombre:'Despunte (esquinas redondas)', specs:'Por esquina / por millar', unidad:'esquina/millar', tiered:false, precios:[{qty:1,precio:40}] },
  { id:'ac-perf', cat:'acabados', nombre:'Perforación 5 mm',             specs:'Por millar',               unidad:'millar',         tiered:false, precios:[{qty:1,precio:150}] },
];

let COTI_CATALOG = storageLoad('sgi_coti_catalog', _CC_DEFAULTS);
let COTIZ_LIST   = storageLoad('sgi_cotizaciones', []);

function refreshCotiCatalog(raw) {
  storageSave('sgi_coti_catalog', raw);
  window.COTI_CATALOG = raw;
}
function saveCotizacion(cot) {
  const raw = storageLoad('sgi_cotizaciones', []);
  const idx = raw.findIndex(c => c.id === cot.id);
  const next = idx >= 0 ? raw.map(c => c.id === cot.id ? cot : c) : [cot, ...raw];
  storageSave('sgi_cotizaciones', next);
  window.COTIZ_LIST = next;
  return cot;
}
function deleteCotizacion(id) {
  const next = storageLoad('sgi_cotizaciones', []).filter(c => c.id !== id);
  storageSave('sgi_cotizaciones', next);
  window.COTIZ_LIST = next;
}
function nextCotizNum() {
  const yr  = new Date().getFullYear();
  const key = `sgi_cotiz_num_${yr}`;
  const n   = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
  localStorage.setItem(key, String(n));
  if (window.SGISync) window.SGISync.queuePush(key);
  return `COT-${yr}-${String(n).padStart(4, '0')}`;
}

// Imprime el elemento indicado usando un iframe oculto (no necesita permiso de popups).
// Extrae el CSS vivo del CSSOM en lugar de cargar styles.css como archivo externo,
// para evitar que las reglas @media print de la app oculten el contenido del iframe.
function printSgiDoc(querySelector) {
  const el = document.querySelector(querySelector || '.coti-doc');
  if (!el) return;

  // Extraer CSS del CSSOM actual, saltando TODAS las reglas @media print
  let css = '';
  try {
    for (let si = 0; si < document.styleSheets.length; si++) {
      try {
        const rules = document.styleSheets[si].cssRules || document.styleSheets[si].rules || [];
        for (let ri = 0; ri < rules.length; ri++) {
          const rule = rules[ri];
          const media = (rule.conditionText) || (rule.media && rule.media.mediaText) || '';
          if (media.indexOf('print') !== -1) continue; // saltar @media print por completo
          css += rule.cssText + '\n';
        }
      } catch(e) {} // saltar hojas de otro origen (Google Fonts, etc.)
    }
  } catch(e) {}

  const old = document.getElementById('_sgi_pf');
  if (old) old.remove();

  const fontsUrl = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&family=Archivo+Black&display=swap';

  const frame = document.createElement('iframe');
  frame.id = '_sgi_pf';
  frame.style.cssText = 'position:fixed;right:-9999px;top:0;width:860px;height:1200px;border:0;visibility:hidden';
  document.body.appendChild(frame);

  const iDoc = frame.contentDocument || frame.contentWindow.document;
  iDoc.open();
  iDoc.write('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="' + fontsUrl + '" rel="stylesheet">' +
    '<style>' + css +
    'body{margin:0;padding:0;background:#fff}' +
    '.cq-print-doc{display:block!important}' +
    '@page{size:letter portrait;margin:0}' +
    '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
    '</style>' +
    '</head><body>' + (function(){ const c=el.cloneNode(true); c.style.display=''; return c.outerHTML; }()) + '</body></html>');
  iDoc.close();

  setTimeout(function() {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch(e) {}
    setTimeout(function() { if (frame.parentNode) frame.parentNode.removeChild(frame); }, 4000);
  }, 1500);
}

// Ventas del día (seed) — incluye fecha para contabilidad
const SEED_SALES = [
  { ticket:'#A-2841', fecha:_TODAY, time:'09:14', user:'Ana M.',    module:'copiado',     items:3,  method:'efectivo', total:64.50,   subtotal:55.60,   iva:8.90 },
  { ticket:'#A-2842', fecha:_TODAY, time:'09:32', user:'Ana M.',    module:'granformato', items:1,  method:'transfer', total:1280.00, subtotal:1103.45, iva:176.55 },
  { ticket:'#A-2843', fecha:_TODAY, time:'10:05', user:'Carlos R.', module:'bordado',     items:12, method:'factura',  total:2160.00, subtotal:1862.07, iva:297.93 },
  { ticket:'#A-2844', fecha:_TODAY, time:'10:21', user:'Ana M.',    module:'copiado',     items:5,  method:'efectivo', total:142.00,  subtotal:122.41,  iva:19.59 },
  { ticket:'#A-2845', fecha:_TODAY, time:'10:48', user:'Ana M.',    module:'materiales',  items:1,  method:'transfer', total:4850.00, subtotal:4181.03, iva:668.97 },
  { ticket:'#A-2846', fecha:_TODAY, time:'11:12', user:'Carlos R.', module:'granformato', items:1,  method:'factura',  total:6420.00, subtotal:5534.48, iva:885.52 },
  { ticket:'#A-2847', fecha:_TODAY, time:'11:38', user:'Ana M.',    module:'copiado',     items:2,  method:'efectivo', total:35.00,   subtotal:30.17,   iva:4.83  },
  { ticket:'#A-2848', fecha:_TODAY, time:'12:04', user:'Ana M.',    module:'granformato', items:2,  method:'transfer', total:980.00,  subtotal:844.83,  iva:135.17 },
];

Object.assign(window, {
  fmt, round2, uid, localISO, storageLoad, storageSave,
  MODULES,
  COPIADO_DIRECT_RAW, COPIADO_DIRECT, COPIADO_OPTIONS,
  PRINT_PAPER_RAW, PRINT_PAPER, PRINT_COLOR, PRINT_FACES, PRINT_FINISH, PRINT_URGENCY,
  ENGARGO_TYPES, ENGARGO_PASTAS, PLANOS_TIPO, PLANOS_TAM,
  IMPRESO_TIPOS_RAW, IMPRESO_TIPOS, IMPRESO_VOL, IMPRESO_PAPELES, IMPRESO_ACABADOS, IMPRESO_URGENCIA,
  COPIADO_OPC, COPIADO_OPC_DEFAULTS: _CO_DEFAULTS,
  GF_MATERIALS_RAW, GF_MATERIALS, GF_FINISH, GF_FINISH_DEFAULTS: _GFF_DEFAULTS,
  GF_PARAMS, GF_PARAMS_DEFAULTS: _GFP_DEFAULTS, refreshGfParams,
  BORDADO_TELAS_RAW, BORDADO_TELAS,
  BORDADO_PRECIOS, BORDADO_PRECIOS_DEFAULTS: _BP_DEFAULTS,
  USUARIOS_RAW, USUARIOS,
  NEGOCIO,
  refreshCopiadoDirect, refreshPrintPaper, refreshImpresoTipos, refreshCopiadoOpciones,
  refreshGfMaterials, refreshGfFinish, refreshBordadoTelas, refreshBordadoPrecios,
  refreshUsuarios, refreshNegocio,
  CFDI_LIST, GASTOS_LIST,
  VENTAS_ALL, saveSale, refreshCfdi, refreshGastos,
  PEDIDOS_LIST, savePedido, deletePedido, nextCotiNum,
  COTI_CATS, COTI_CATALOG, COTIZ_LIST,
  refreshCotiCatalog, saveCotizacion, deleteCotizacion, nextCotizNum,
  BACKUP_CONFIG, BACKUP_META_LIST,
  refreshBackupConfig, saveBackupRecord, deleteBackupRecord,
  collectBackupData, restoreBackupData, isBackupOverdue, printSgiDoc,
  NEON_PERFILES_RAW, NEON_PERFILES, NEON_PERFILES_DEFAULTS: _NEON_PERFILES_DEFAULTS,
  NEON_PARAMS, NEON_PARAMS_DEFAULTS: _NEON_PARAMS_DEFAULTS,
  NEON_COTIZ_LIST, calcularNeon,
  refreshNeonPerfiles, refreshNeonParams, saveNeonCotiz, deleteNeonCotiz, nextNeonFolio,
  SEED_SALES,
});
