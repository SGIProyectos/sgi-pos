// Motor v3 de análisis de bordado: pipeline imagen -> regiones -> geometría por régimen.
// Puro JS sin dependencias: funciona en Node y en navegador (ImageData-compatible).
//
// Entrada: img {width, height, data:RGBA}, opts {anchoCm, altoCm}
// Salida: geometría por régimen (satin cm lineales, relleno cm2, línea cm) + regiones
// Las puntadas se calculan aparte con densidades calibradas (ver calibrar/validar).

(function (global) {
  'use strict';

  const MAX_DIM = 700;

  function downscale(img, maxDim) {
    const { width: w, height: h, data } = img;
    const f = Math.max(w, h) / maxDim;
    if (f <= 1) return img;
    const nw = Math.round(w / f), nh = Math.round(h / f);
    const out = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * f), y1 = Math.min(h, Math.ceil((y + 1) * f));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * f), x1 = Math.min(w, Math.ceil((x + 1) * f));
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
        }
        const o = (y * nw + x) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
      }
    }
    return { width: nw, height: nh, data: out };
  }

  function colorDist(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt(dr * dr * 2 + dg * dg * 4 + db * db * 3) / 3;
  }

  // Fondo: alpha si existe; si no, color dominante del borde.
  // Devuelve { esFondo, colorFondo } — colorFondo=null si el fondo era alpha.
  function mascaraFondo(img) {
    const { width: w, height: h, data } = img;
    const n = w * h;
    let transparentes = 0, muestraBorde = [];
    const paso = Math.max(1, Math.floor((2 * (w + h)) / 400));
    let k = 0;
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) {
      if ((k++ % paso) === 0) muestraBorde.push((y * w + x) * 4);
    }
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) {
      if ((k++ % paso) === 0) muestraBorde.push((y * w + x) * 4);
    }
    for (const i of muestraBorde) if (data[i + 3] < 128) transparentes++;

    const esFondo = new Uint8Array(n);
    if (transparentes > muestraBorde.length * 0.3) {
      for (let p = 0; p < n; p++) if (data[p * 4 + 3] < 128) esFondo[p] = 1;
      return { esFondo, colorFondo: null };
    }
    // mediana del color de borde
    const rs = [], gs = [], bs = [];
    for (const i of muestraBorde) { rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); }
    const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const br = med(rs), bg = med(gs), bb = med(bs);
    // Fondo = solo lo CONECTADO al borde con color de fondo (flood fill).
    // El mismo color encerrado dentro del diseño (blanco dentro de un anillo,
    // interior de un logo) es contenido: el auto-digitize lo borda con hilo.
    const esBg = (p) => {
      const i = p * 4;
      return data[i + 3] < 128 || colorDist(data[i], data[i + 1], data[i + 2], br, bg, bb) < 28;
    };
    const cola = new Int32Array(n);
    let qt = 0;
    const semilla = (p) => { if (!esFondo[p] && esBg(p)) { esFondo[p] = 1; cola[qt++] = p; } };
    for (let x = 0; x < w; x++) { semilla(x); semilla((h - 1) * w + x); }
    for (let y = 1; y < h - 1; y++) { semilla(y * w); semilla(y * w + w - 1); }
    let qh = 0;
    while (qh < qt) {
      const p = cola[qh++];
      const x = p % w, y = (p / w) | 0;
      if (x > 0) semilla(p - 1);
      if (x < w - 1) semilla(p + 1);
      if (y > 0) semilla(p - w);
      if (y < h - 1) semilla(p + w);
    }
    return { esFondo, colorFondo: [br, bg, bb] };
  }

  // Cuantización: clusters greedy sobre muestra, luego asignación total
  function cuantizar(img, esFondo, umbral) {
    const { width: w, height: h, data } = img;
    const n = w * h;
    const clusters = []; // [r,g,b,count]
    const pasoM = Math.max(1, Math.floor(n / 40000));
    for (let p = 0; p < n; p += pasoM) {
      if (esFondo[p]) continue;
      const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      let mejor = -1, mejorD = umbral;
      for (let c = 0; c < clusters.length; c++) {
        const d = colorDist(r, g, b, clusters[c][0], clusters[c][1], clusters[c][2]);
        if (d < mejorD) { mejorD = d; mejor = c; }
      }
      if (mejor >= 0) {
        const c = clusters[mejor], m = c[3];
        c[0] = (c[0] * m + r) / (m + 1); c[1] = (c[1] * m + g) / (m + 1); c[2] = (c[2] * m + b) / (m + 1); c[3] = m + 1;
      } else if (clusters.length < 40) clusters.push([r, g, b, 1]);
    }
    clusters.sort((a, b) => b[3] - a[3]);
    // fusionar clusters cercanos
    for (let i = 0; i < clusters.length; i++) for (let j = clusters.length - 1; j > i; j--) {
      if (colorDist(clusters[i][0], clusters[i][1], clusters[i][2], clusters[j][0], clusters[j][1], clusters[j][2]) < umbral * 0.8) {
        const a = clusters[i], b = clusters[j], m = a[3] + b[3];
        a[0] = (a[0] * a[3] + b[0] * b[3]) / m; a[1] = (a[1] * a[3] + b[1] * b[3]) / m; a[2] = (a[2] * a[3] + b[2] * b[3]) / m; a[3] = m;
        clusters.splice(j, 1);
      }
    }
    const etiqueta = new Int16Array(n).fill(-1);
    for (let p = 0; p < n; p++) {
      if (esFondo[p]) continue;
      const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      let mejor = 0, mejorD = Infinity;
      for (let c = 0; c < clusters.length; c++) {
        const d = colorDist(r, g, b, clusters[c][0], clusters[c][1], clusters[c][2]);
        if (d < mejorD) { mejorD = d; mejor = c; }
      }
      etiqueta[p] = mejor;
    }
    return { etiqueta, clusters };
  }

  // Componentes conexos 4-conn sobre misma etiqueta de color
  function componentes(etiqueta, w, h) {
    const n = w * h;
    const region = new Int32Array(n).fill(-1);
    const stack = new Int32Array(n);
    let numRegiones = 0;
    const colorDeRegion = [];
    for (let p0 = 0; p0 < n; p0++) {
      if (etiqueta[p0] < 0 || region[p0] >= 0) continue;
      const col = etiqueta[p0];
      let top = 0; stack[top++] = p0; region[p0] = numRegiones;
      while (top > 0) {
        const p = stack[--top];
        const x = p % w, y = (p / w) | 0;
        if (x > 0 && region[p - 1] < 0 && etiqueta[p - 1] === col) { region[p - 1] = numRegiones; stack[top++] = p - 1; }
        if (x < w - 1 && region[p + 1] < 0 && etiqueta[p + 1] === col) { region[p + 1] = numRegiones; stack[top++] = p + 1; }
        if (y > 0 && region[p - w] < 0 && etiqueta[p - w] === col) { region[p - w] = numRegiones; stack[top++] = p - w; }
        if (y < h - 1 && region[p + w] < 0 && etiqueta[p + w] === col) { region[p + w] = numRegiones; stack[top++] = p + w; }
      }
      colorDeRegion.push(col);
      numRegiones++;
    }
    return { region, numRegiones, colorDeRegion };
  }

  // Chamfer 3-4: distancia al borde de la región (cambio de región o fondo)
  function distanciaBorde(region, w, h) {
    const n = w * h;
    const INF = 1 << 28;
    const d = new Int32Array(n);
    for (let p = 0; p < n; p++) {
      if (region[p] < 0) { d[p] = 0; continue; }
      const x = p % w, y = (p / w) | 0;
      const r = region[p];
      const borde = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ||
        region[p - 1] !== r || region[p + 1] !== r || region[p - w] !== r || region[p + w] !== r;
      d[p] = borde ? 3 : INF;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (d[p] <= 3) continue;
      let m = d[p];
      if (x > 0 && d[p - 1] + 3 < m) m = d[p - 1] + 3;
      if (y > 0 && d[p - w] + 3 < m) m = d[p - w] + 3;
      if (x > 0 && y > 0 && d[p - w - 1] + 4 < m) m = d[p - w - 1] + 4;
      if (x < w - 1 && y > 0 && d[p - w + 1] + 4 < m) m = d[p - w + 1] + 4;
      d[p] = m;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      if (d[p] <= 3) continue;
      let m = d[p];
      if (x < w - 1 && d[p + 1] + 3 < m) m = d[p + 1] + 3;
      if (y < h - 1 && d[p + w] + 3 < m) m = d[p + w] + 3;
      if (x < w - 1 && y < h - 1 && d[p + w + 1] + 4 < m) m = d[p + w + 1] + 4;
      if (x > 0 && y < h - 1 && d[p + w - 1] + 4 < m) m = d[p + w - 1] + 4;
      d[p] = m;
    }
    return d; // unidades: 3 = 1px
  }

  function analizarImagen(imgOriginal, opts) {
    const img = downscale(imgOriginal, MAX_DIM);
    const { width: w, height: h } = img;

    const { esFondo, colorFondo } = mascaraFondo(img);
    // escala física: los cm del bordado corresponden al CONTENIDO (bbox), no al lienzo
    let bx0 = w, bx1 = -1, by0 = h, by1 = -1;
    for (let p = 0; p < w * h; p++) {
      if (esFondo[p]) continue;
      const x = p % w, y = (p / w) | 0;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    const bw = bx1 >= bx0 ? bx1 - bx0 + 1 : w;
    const bh = by1 >= by0 ? by1 - by0 + 1 : h;
    const mmPorPx = Math.max(opts.anchoCm * 10 / bw, opts.altoCm * 10 / bh);
    const { etiqueta, clusters } = cuantizar(img, esFondo, 32);
    const cc = componentes(etiqueta, w, h);
    const dist = distanciaBorde(cc.region, w, h);

    // stats por región
    const nR = cc.numRegiones;
    const area = new Float64Array(nR), sumD = new Float64Array(nR), maxD = new Float64Array(nR), perim = new Float64Array(nR);
    for (let p = 0; p < w * h; p++) {
      const r = cc.region[p];
      if (r < 0) continue;
      area[r]++;
      const dp = dist[p] / 3;
      sumD[r] += dp;
      if (dp > maxD[r]) maxD[r] = dp;
      if (dist[p] <= 3) perim[r]++;
    }

    // fusionar halos (regiones ultradelgadas, ancho <= ~1.5px) con vecino dominante
    const remap = new Int32Array(nR).fill(-1);
    const esHalo = new Uint8Array(nR);
    for (let r = 0; r < nR; r++) {
      const anchoPx = 2 * maxD[r];
      if (anchoPx <= 1.6 && area[r] < (w * h) * 0.05) esHalo[r] = 1;
    }
    for (let p = 0; p < w * h; p++) {
      const r = cc.region[p];
      if (r < 0 || !esHalo[r] || remap[r] >= 0) continue;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && cc.region[q] >= 0 && !esHalo[cc.region[q]]) { remap[r] = cc.region[q]; break; }
      }
    }
    for (let r = 0; r < nR; r++) {
      if (esHalo[r] && remap[r] >= 0) {
        area[remap[r]] += area[r]; sumD[remap[r]] += sumD[r];
        area[r] = 0;
      }
    }
    if (opts.conMapa) {
      for (let p = 0; p < w * h; p++) {
        const r = cc.region[p];
        if (r >= 0 && esHalo[r] && remap[r] >= 0) cc.region[p] = remap[r];
      }
    }

    // clasificación y acumulación de geometría física
    // Modelo continuo por región: puntadas ≈ a·largo + b·área
    // (angosto: domina largo = zigzag satin; ancho: domina área = tatami)
    const pxAmm2 = mmPorPx * mmPorPx;
    const UMBRAL_LINEA_MM = opts.umbralLineaMm || 1.0; // debajo: línea corrida/detalle
    let largoCm = 0, areaCm2 = 0, lineaCm = 0, perimCm = 0;
    const regiones = [];
    const areaMinPx = Math.max(4, 0.5 / pxAmm2); // ignora regiones < 0.5mm2 (ruido)

    for (let r = 0; r < nR; r++) {
      if (area[r] < areaMinPx) continue;
      const areaMm2 = area[r] * pxAmm2;
      const perimMm = perim[r] * mmPorPx;
      // ancho local: 4*promedio(dist) es exacto para franjas; acotado por 2*maxD
      let anchoMm = Math.min(4 * (sumD[r] / area[r]), 2 * maxD[r] + 1) * mmPorPx;
      if (anchoMm <= 0) anchoMm = mmPorPx;
      const largoMm = areaMm2 / anchoMm;
      // Región color-fondo encerrada dentro del diseño (blanco interior): el
      // auto-digitize la deja como tela (los DSTs de calibración lo confirman),
      // así que NO suma a los totales; queda expuesta con interior=1 para que
      // la UI la active cuando se bordará (p.ej. prenda oscura).
      const cl = clusters[cc.colorDeRegion[r]];
      const interior = !!(colorFondo && cl &&
        colorDist(cl[0], cl[1], cl[2], colorFondo[0], colorFondo[1], colorFondo[2]) < 28);
      let tipo;
      if (anchoMm < UMBRAL_LINEA_MM) { tipo = 'linea'; if (!interior) lineaCm += largoMm / 10; }
      else {
        tipo = anchoMm >= 6 ? 'relleno' : 'satin';
        if (!interior) {
          largoCm += largoMm / 10; areaCm2 += areaMm2 / 100;
          // perímetro solo de regiones con cuerpo: modela underlay de borde y
          // contornos del auto-digitize (las regiones línea ya son puro borde)
          perimCm += perimMm / 10;
        }
      }
      regiones.push({ id: r, tipo, interior: interior ? 1 : 0, area_mm2: +areaMm2.toFixed(1), ancho_mm: +anchoMm.toFixed(2), largo_mm: +largoMm.toFixed(1), perim_mm: +perimMm.toFixed(1), color: cc.colorDeRegion[r] });
    }

    const out = {
      largo_cm: +largoCm.toFixed(1),
      area_cm2: +areaCm2.toFixed(2),
      linea_cm: +lineaCm.toFixed(1),
      perim_cm: +perimCm.toFixed(1),
      n_regiones: regiones.filter(r => !r.interior).length,
      // bbox del contenido en px: la proporción real del bordado (sin márgenes)
      bboxPx: { w: bw, h: bh },
      colores: clusters.length,
      clusters: clusters.map(c => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]),
      regiones: regiones.sort((a, b) => b.area_mm2 - a.area_mm2),
      dimsPx: { w, h }, mmPorPx: +mmPorPx.toFixed(3),
    };
    if (opts.conMapa) out.mapa = cc.region; // Int32Array w*h: id de región por píxel (-1 = fondo)
    return out;
  }

  // puntadas = densidades calibradas x geometría
  function calcularPuntadas(geo, dens) {
    let p =
      dens.por_cm_largo * geo.largo_cm +
      dens.por_cm2_area * geo.area_cm2 +
      dens.linea_por_cm * geo.linea_cm;
    if (dens.por_cm_perim) p += dens.por_cm_perim * (geo.perim_cm || 0);
    if (dens.por_region) p += dens.por_region * (geo.n_regiones || 0);
    return Math.round(p);
  }

  const api = { analizarImagen, calcularPuntadas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.MotorBordadoV3 = api;
})(typeof window !== 'undefined' ? window : globalThis);
