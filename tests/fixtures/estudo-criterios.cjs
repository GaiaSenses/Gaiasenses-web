/**
 * Oráculo: módulo CommonJS do estudo de critérios de decisão (criterioAtual, criterioA..D, rng…).
 * Fonte: /home/nyck/cti/my-docs/gaiasenses-criterio-decisao.html, linhas 422–928
 * (sem a tag <script> da linha 422). Extraído em 2026-11-26.
 * NÃO EDITAR: oráculo. Qualquer ajuste deve vir de uma nova extração da fonte.
 */
/* Critérios de decisão do GaiaSenses — estudo comparativo.
 * Módulo puro: roda no navegador (window.Criterios) e no Node (module.exports).
 *
 * Entrada canônica ("clima"), sempre em unidades físicas corretas:
 *   temperature °C, humidity %, clouds %, rain mm/h, windSpeed m/s, windDeg °,
 *   lightningCount (contagem ≤100 km), fireCount (≤100 km), closeFires (<50 km),
 *   snowfall cm/h, isDay bool, lat, lon.
 *   null em qualquer campo = "a fonte não respondeu" (nunca é zero).
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ util
  function lerp(points, x) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i][0]) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return points[points.length - 1][1];
  }
  // Contagens (raios, focos) crescem em ordens de grandeza: interpola em log10(1+n).
  function lerpLog(points, n) {
    const pts = points.map(([x, y]) => [Math.log10(1 + x), y]);
    return lerp(pts, Math.log10(1 + Math.max(0, n)));
  }
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  // ------------------------------------------------- CRITÉRIO 0 — ATUAL
  // Listas copiadas de app/[locale]/map3/use-composition-queue.ts:88-129 (main @ 6872ed5).
  const POOLS_ATUAL = {
    atmosphere: ["windLines", "cloudBubble", "weatherTree", "stormEye", "pump"],
    fulmen: ["lightningTrees", "lightningBolts", "attractor", "zigzag", "stormEye"],
    pyro: ["bonfire", "burningTrees"],
    hydros: ["lluvia", "zigzag", "curves", "digitalOrganism", "rectangles", "nightRain",
      "colorFlower", "mudflatScatter", "generativeStrings", "riverLines", "paintBrush"],
    entropy: ["chaosTree", "airports"],
  };
  const CAT_LABEL = {
    atmosphere: "atmosphere (vento e nuvens)", fulmen: "fulmen (raios)", pyro: "pyro (fogo e calor)",
    hydros: "hydros (chuva, umidade, temperatura)", entropy: "entropy (lugar / abstrato)",
  };

  /** Como page.tsx:102-110 monta o `clima`: indisponível vira 0. Vento em m/s desde o
   *  PR #243 (#241); `ventoKmh: true` reproduz o site de antes, que recebia km/h. */
  function entradaDoSite(c, opts) {
    const ventoKmh = !!(opts && opts.ventoKmh);
    const z = (v) => (isNum(v) ? v : 0);
    return {
      windSpeed: isNum(c.windSpeed) ? (ventoKmh ? c.windSpeed * 3.6 : c.windSpeed) : 0,
      humidity: z(c.humidity),
      clouds: z(c.clouds),
      temperature: z(c.temperature),
      lightnings: z(c.lightningCount),
      fireSpots: z(c.fireCount),
      rain: z(c.rain),
    };
  }

  /** Porte literal de getCompositionDecisionTrace (sem o sorteio). */
  function traceAtual(clima) {
    const scores = { atmosphere: 0, fulmen: 0, pyro: 0, hydros: 0, entropy: 25 };
    const regras = {
      fulmen: () => { if (clima.lightnings > 0) scores.fulmen += 90; },
      pyro: () => {
        if (clima.fireSpots > 0) scores.pyro += 100;
        if (clima.temperature > 35) scores.pyro += 40;
      },
      atmosphere: () => {
        scores.atmosphere += clima.windSpeed * 4;
        if (clima.clouds > 50) scores.atmosphere += 30;
      },
      hydros: () => {
        scores.hydros += clima.rain * 5;
        scores.hydros += clima.humidity * 0.5;
        scores.hydros += clima.temperature * 0.3;
      },
    };
    const ruleDeltas = {};
    const apply = (name, fn) => {
      const before = { ...scores };
      fn();
      ruleDeltas[name] = {
        atmosphere: scores.atmosphere - before.atmosphere, fulmen: scores.fulmen - before.fulmen,
        pyro: scores.pyro - before.pyro, hydros: scores.hydros - before.hydros, entropy: scores.entropy - before.entropy,
      };
    };
    apply("fulmen", regras.fulmen);
    apply("pyro", regras.pyro);
    apply("atmosphere", regras.atmosphere);
    apply("hydros", regras.hydros);
    const categoria = Object.keys(scores).reduce((a, b) => (scores[a] > scores[b] ? a : b));
    return { scores, ruleDeltas, categoria };
  }

  function poolResult(categoria, pools) {
    const pool = pools[categoria];
    const probs = {};
    for (const id of pool) probs[id] = (probs[id] || 0) + 1 / pool.length;
    return { pool, probs };
  }

  function criterioAtual(c, opts) {
    const entrada = entradaDoSite(c, opts);
    const t = traceAtual(entrada);
    const { pool, probs } = poolResult(t.categoria, POOLS_ATUAL);
    return {
      id: "atual", entrada, scores: t.scores, ruleDeltas: t.ruleDeltas, vencedor: t.categoria,
      vencedorLabel: CAT_LABEL[t.categoria], pool, probs, deterministico: false,
    };
  }

  // --------------------------------- CRITÉRIO A — RECALIBRAÇÃO DO PARECER
  // my-docs/gaiasenses-parecer-pr101.md / issue #106: fulmen 120, umidade só >80,
  // temperatura fora de hydros, vento em m/s. Mesmas listas e mesmo sorteio.
  function criterioA(c) {
    const z = (v) => (isNum(v) ? v : 0);
    const e = {
      windSpeed: z(c.windSpeed), humidity: z(c.humidity), clouds: z(c.clouds), temperature: z(c.temperature),
      lightnings: z(c.lightningCount), fireSpots: z(c.fireCount), rain: z(c.rain),
    };
    const scores = { atmosphere: 0, fulmen: 0, pyro: 0, hydros: 0, entropy: 25 };
    if (e.lightnings > 0) scores.fulmen += 120;
    if (e.fireSpots > 0) scores.pyro += 100;
    if (e.temperature > 35) scores.pyro += 40;
    scores.atmosphere += e.windSpeed * 4;
    if (e.clouds > 50) scores.atmosphere += 30;
    scores.hydros += e.rain * 5;
    if (e.humidity > 80) scores.hydros += e.humidity * 0.5;
    const categoria = Object.keys(scores).reduce((a, b) => (scores[a] > scores[b] ? a : b));
    const { pool, probs } = poolResult(categoria, POOLS_ATUAL);
    return { id: "A", entrada: e, scores, vencedor: categoria, vencedorLabel: CAT_LABEL[categoria], pool, probs, deterministico: false };
  }

  // ---------------------------------------------- TAXONOMIA (B, C, D)
  /** Família de dado de cada atributo do vocabulário. lat/lon não são clima. */
  const ATTR_FAMILY = {
    lightningCount: "raios", fireCount: "fogo", closeFires: "fogo", rain: "chuva", snowfall: "neve",
    windSpeed: "vento", windDeg: "vento", temperature: "temperatura", humidity: "umidade", clouds: "nuvens",
    lat: null, lon: null,
  };
  /** Ordem = prioridade no empate (o mais raro e mais "evento" primeiro). */
  const TYPES = [
    { id: "raios", label: "Raios", fam: "raios" },
    { id: "fogo", label: "Fogo", fam: "fogo" },
    { id: "chuva", label: "Chuva", fam: "chuva" },
    { id: "neve", label: "Neve", fam: "neve" },
    { id: "vento", label: "Vento", fam: "vento" },
    { id: "calor", label: "Calor", fam: "temperatura" },
    { id: "frio", label: "Frio", fam: "temperatura" },
    { id: "seco", label: "Seco", fam: "umidade" },
    { id: "umido", label: "Úmido", fam: "umidade" },
    { id: "nuvens", label: "Nuvens", fam: "nuvens" },
  ];
  const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));
  const CALMARIA = { id: "calmaria", label: "Calmaria" };

  function familiasDaObra(obra) {
    const fams = new Set();
    for (const a of obra.attributes) if (ATTR_FAMILY[a]) fams.add(ATTR_FAMILY[a]);
    return [...fams];
  }
  /** Tipos de uma obra: derivados SÓ das entradas declaradas. */
  function tiposDaObra(obra) {
    const fams = familiasDaObra(obra);
    const ts = TYPES.filter((t) => fams.includes(t.fam)).map((t) => t.id);
    return ts.length ? ts : ["calmaria"];
  }

  // ------------------------------------------------------- SALIÊNCIA
  const LIMIARES = {
    piso: 0.25,
    chuva: [[0, 0], [0.1, 0.45], [2.5, 0.65], [7.6, 0.85], [20, 1]], // mm/h — classes WMO
    raios: [[0, 0], [1, 0.8], [10, 0.92], [50, 1]], // contagem ≤100 km (log)
    fogoLonge: [[0, 0], [1, 0.3], [10, 0.5], [50, 0.65]], // focos ≤100 km (log)
    fogoPerto: [[0, 0], [1, 0.6], [5, 0.8], [20, 1]], // focos <50 km (log)
    calor: [[26, 0], [28, 0.3], [32, 0.6], [38, 1]], // °C
    frio: [[-5, 1], [5, 0.6], [12, 0.3], [14, 0]], // °C
    vento: [[3.4, 0], [5.5, 0.4], [10.8, 0.65], [17.2, 0.85], [24.5, 1]], // m/s — Beaufort 2/4/6/8/10
    nuvens: [[60, 0], [80, 0.15], [100, 0.3]], // % — sinal fraco: nuvem é comum
    seco: [[5, 1], [15, 0.8], [30, 0.4], [35, 0]], // % UR
    umido: [[80, 0], [85, 0.25], [100, 0.4]], // % UR — abaixo de qualquer chuva
    neve: [[0, 0], [0.1, 0.6], [1, 0.85], [3, 1]], // cm/h
    anomalia: [[0.5, 0], [1, 0.35], [2, 0.75], [3, 1]], // |z| contra o normal do lugar
    nuvensAnomaliaTeto: 0.6,
  };
  const PESOS_PADRAO = Object.fromEntries(TYPES.map((t) => [t.id, 1]));

  /**
   * Saliência 0..1 de cada tipo. null = sem dado.
   * modo "abs": escalas meteorológicas fixas. modo "rel": temperatura, umidade,
   * nuvens e vento contra o normal do lugar (z-score); chuva/raio/fogo/neve
   * continuam absolutos, porque são eventos.
   */
  function saliencias(c, o) {
    o = o || {};
    const L = o.limiares || LIMIARES;
    const P = o.pesos || PESOS_PADRAO;
    const N = o.modo === "rel" ? o.normal : null;
    const S = {};
    const fonte = {};
    S.raios = isNum(c.lightningCount) ? lerpLog(L.raios, c.lightningCount) : null;
    S.fogo = isNum(c.fireCount)
      ? Math.max(lerpLog(L.fogoLonge, c.fireCount), lerpLog(L.fogoPerto, isNum(c.closeFires) ? c.closeFires : 0))
      : null;
    S.chuva = isNum(c.rain) ? lerp(L.chuva, c.rain) : null;
    S.neve = isNum(c.snowfall) ? lerp(L.neve, c.snowfall) : null;
    const z = (v, k) => {
      if (!N || !N[k] || !isNum(v)) return null;
      return (v - N[k].mu) / Math.max(N[k].sd, k === "temperature" ? 0.8 : k === "windSpeed" ? 0.5 : 3);
    };
    const zt = z(c.temperature, "temperature"), zh = z(c.humidity, "humidity"),
      zc = z(c.clouds, "clouds"), zw = z(c.windSpeed, "windSpeed");
    if (!isNum(c.temperature)) { S.calor = S.frio = null; }
    else if (zt !== null) { S.calor = lerp(L.anomalia, zt); S.frio = lerp(L.anomalia, -zt); fonte.temperatura = "rel"; }
    else { S.calor = lerp(L.calor, c.temperature); S.frio = lerp(L.frio, c.temperature); }
    if (!isNum(c.humidity)) { S.seco = S.umido = null; }
    else if (zh !== null) { S.seco = lerp(L.anomalia, -zh); S.umido = lerp(L.anomalia, zh); fonte.umidade = "rel"; }
    else { S.seco = lerp(L.seco, c.humidity); S.umido = lerp(L.umido, c.humidity); }
    if (!isNum(c.windSpeed)) S.vento = null;
    else if (zw !== null) { S.vento = lerp(L.anomalia, zw); fonte.vento = "rel"; }
    else S.vento = lerp(L.vento, c.windSpeed);
    if (!isNum(c.clouds)) S.nuvens = null;
    else if (zc !== null) { S.nuvens = Math.min(L.nuvensAnomaliaTeto, lerp(L.anomalia, zc)); fonte.nuvens = "rel"; }
    else S.nuvens = lerp(L.nuvens, c.clouds);
    for (const t of TYPES) if (S[t.id] !== null) S[t.id] = S[t.id] * (isNum(P[t.id]) ? P[t.id] : 1);
    return { S, z: { temperatura: zt, umidade: zh, nuvens: zc, vento: zw }, fonte };
  }

  // ----------------------------------------------------- descrições
  const BEAUFORT = [[0.3, 0, "calmaria"], [1.6, 1, "aragem"], [3.4, 2, "brisa leve"], [5.5, 3, "brisa fraca"],
    [8.0, 4, "brisa moderada"], [10.8, 5, "brisa forte"], [13.9, 6, "vento fresco"], [17.2, 7, "vento forte"],
    [20.8, 8, "ventania"], [24.5, 9, "ventania forte"], [28.5, 10, "tempestade"], [32.7, 11, "tempestade violenta"],
    [Infinity, 12, "furacão"]];
  function beaufort(ms) { for (const [lim, n, nome] of BEAUFORT) if (ms < lim) return { n, nome }; return { n: 12, nome: "furacão" }; }
  const fmt = (v, d = 1) => (isNum(v) ? v.toFixed(d).replace(".", ",") : "—");
  function descreveTipo(tipo, c, sal) {
    const zt = sal && sal.z;
    switch (tipo) {
      case "raios": return `${c.lightningCount} raio${c.lightningCount === 1 ? "" : "s"} a até 100 km`;
      case "fogo": return `${c.fireCount} foco${c.fireCount === 1 ? "" : "s"} a até 100 km, ${c.closeFires || 0} a menos de 50 km`;
      case "chuva": {
        const cl = c.rain < 2.5 ? "fraca" : c.rain < 7.6 ? "moderada" : "forte";
        return `${fmt(c.rain)} mm/h, chuva ${cl} (WMO)`;
      }
      case "neve": return `${fmt(c.snowfall)} cm/h de neve`;
      case "vento": {
        const b = beaufort(c.windSpeed);
        const rel = zt && zt.vento !== null && sal.fonte.vento ? `, ${fmt(zt.vento)} desvios acima do normal` : "";
        return `${fmt(c.windSpeed)} m/s (${fmt(c.windSpeed * 3.6, 0)} km/h), Beaufort ${b.n}, ${b.nome}${rel}`;
      }
      case "calor": case "frio": {
        const rel = zt && sal.fonte.temperatura ? `, ${fmt(Math.abs(zt.temperatura))} desvios ${zt.temperatura >= 0 ? "acima" : "abaixo"} do normal do lugar` : "";
        return `${fmt(c.temperature)} °C${rel}`;
      }
      case "seco": case "umido": {
        const rel = zt && sal.fonte.umidade ? `, ${fmt(Math.abs(zt.umidade))} desvios ${zt.umidade >= 0 ? "acima" : "abaixo"} do normal` : "";
        return `umidade ${fmt(c.humidity, 0)}%${rel}`;
      }
      case "nuvens": return `${fmt(c.clouds, 0)}% de céu coberto`;
      default: return "";
    }
  }

  // --------------------------------- CRITÉRIO B / D — DOMINANTE + RODÍZIO
  function obrasPorTipo(catalogo) {
    const m = { calmaria: [] };
    for (const t of TYPES) m[t.id] = [];
    for (const obra of catalogo) for (const t of tiposDaObra(obra)) m[t].push(obra.id);
    return m;
  }

  function rankingTipos(S, porTipo) {
    return TYPES.filter((t) => S[t.id] !== null)
      .map((t, i) => ({ id: t.id, label: t.label, s: S[t.id], obras: porTipo[t.id].length, prio: TYPES.indexOf(t) }))
      .sort((a, b) => b.s - a.s || a.prio - b.prio);
  }

  /**
   * memoria: { [obraId]: tick da última vez que tocou }. Obras nunca tocadas
   * vêm primeiro. Desempate: quantas OUTRAS entradas da obra também estão
   * salientes (aderência), depois a ordem do catálogo.
   */
  function dominanteRodizio(c, catalogo, memoria, o, id) {
    o = o || {};
    const L = o.limiares || LIMIARES;
    const sal = saliencias(c, o);
    const S = sal.S;
    const porTipo = obrasPorTipo(catalogo);
    const ranking = rankingTipos(S, porTipo);
    const comObra = ranking.filter((r) => r.obras > 0);
    const semDado = TYPES.every((t) => S[t.id] === null);
    let vencedor = comObra.length && comObra[0].s >= L.piso ? comObra[0].id : "calmaria";
    const pulados = ranking.filter((r) => r.obras === 0 && r.s >= L.piso && (vencedor === "calmaria" || r.s > S[vencedor]));
    const ordem = catalogo.map((ob) => ob.id);
    const byId = Object.fromEntries(catalogo.map((ob) => [ob.id, ob]));
    const ticks = memoria ? Object.values(memoria).filter(isNum) : [];
    const ultimoTick = ticks.length ? Math.max(...ticks) : null;
    const candidatosDe = (tipo) => {
      const cand = porTipo[tipo].map((oid) => {
        const outros = tiposDaObra(byId[oid]).filter((t) => t !== tipo && t !== "calmaria" && S[t] !== null && S[t] >= L.piso);
        const last = memoria && isNum(memoria[oid]) ? memoria[oid] : -Infinity;
        return { id: oid, bonus: outros.length, outros, last };
      });
      cand.sort((a, b) => a.last - b.last || b.bonus - a.bonus || ordem.indexOf(a.id) - ordem.indexOf(b.id));
      return cand;
    };
    let cand = candidatosDe(vencedor);
    // Sem repetição imediata: um tipo com uma obra só não toca a mesma obra duas vezes seguidas
    // se houver outro fenômeno acima do piso (ou, na falta dele, uma obra da Calmaria).
    let repetiu = null;
    if (o.semRepetir !== false && vencedor !== "calmaria" && cand.length === 1 && ultimoTick !== null && cand[0].last === ultimoTick) {
      const prox = comObra.find((r) => r.id !== vencedor && r.s >= L.piso);
      repetiu = { tipo: vencedor, obra: cand[0].id };
      vencedor = prox ? prox.id : "calmaria";
      cand = candidatosDe(vencedor);
    }
    const escolha = cand.length ? cand[0].id : null;
    let motivo;
    if (vencedor === "calmaria") {
      motivo = semDado
        ? "O clima não respondeu. Sem dado não há fenômeno, então toca uma obra que não depende de dado meteorológico."
        : `Nenhum fenômeno passa do piso (${fmt(L.piso, 2)}). O tempo está calmo, então toca uma obra sem entrada meteorológica.`;
    } else {
      motivo = `${TYPE_BY_ID[vencedor].label} é o fenômeno mais saliente (${fmt(S[vencedor], 2)}: ${descreveTipo(vencedor, c, sal)}).`;
    }
    if (repetiu) {
      const rl = TYPE_BY_ID[repetiu.tipo].label;
      motivo = `${rl} é o fenômeno mais saliente (${fmt(S[repetiu.tipo], 2)}), mas a única obra desse tipo, ${byId[repetiu.obra].label}, acabou de tocar. Para não repetir, a vez passa ${vencedor === "calmaria" ? "à Calmaria" : `para ${TYPE_BY_ID[vencedor].label} (${fmt(S[vencedor], 2)}: ${descreveTipo(vencedor, c, sal)})`}.`;
    }
    if (pulados.length) motivo += ` ${pulados.map((p) => p.label).join(", ")} estava mais alto, mas nenhuma obra recebe esse dado ainda.`;
    if (escolha) {
      const ce = cand[0];
      motivo += cand.length > 1
        ? ` Entre ${cand.length} obras desse tipo, ${byId[escolha].label} ${ce.last === -Infinity ? "ainda não tocou" : "é a que tocou há mais tempo"}${ce.bonus ? ` e também recebe ${ce.outros.map((t) => TYPE_BY_ID[t].label.toLowerCase()).join(" e ")}` : ""}.`
        : ` ${byId[escolha].label} é a única obra desse tipo.`;
    }
    return {
      id, S, sal, ranking, vencedor, vencedorLabel: vencedor === "calmaria" ? CALMARIA.label : TYPE_BY_ID[vencedor].label,
      candidatas: cand, escolha, probs: escolha ? { [escolha]: 1 } : {}, motivo, deterministico: true, semDado,
    };
  }
  const criterioB = (c, cat, mem, o) => dominanteRodizio(c, cat, mem, { ...o, modo: "abs" }, "B");
  const criterioD = (c, cat, mem, o) => dominanteRodizio(c, cat, mem, { ...o, modo: "rel" }, "D");

  // ------------------------------------- CRITÉRIO C — ADERÊNCIA POR OBRA
  function aderencia(obra, S, L) {
    const fams = familiasDaObra(obra);
    if (!fams.length) return { a: L.piso, porFam: {} };
    const porFam = {};
    for (const f of fams) {
      const vals = TYPES.filter((t) => t.fam === f && S[t.id] !== null).map((t) => S[t.id]);
      if (vals.length) porFam[f] = Math.max(...vals);
    }
    const vs = Object.values(porFam);
    if (!vs.length) return { a: L.piso, porFam, semDado: true };
    const mx = Math.max(...vs), mean = vs.reduce((x, y) => x + y, 0) / vs.length;
    return { a: 0.7 * mx + 0.3 * mean, porFam };
  }
  function criterioC(c, catalogo, o) {
    o = o || {};
    const L = o.limiares || LIMIARES;
    const sal = saliencias(c, { ...o, modo: "abs" });
    const S = sal.S;
    const lista = catalogo.map((ob) => ({ id: ob.id, label: ob.label, ...aderencia(ob, S, L) }));
    const amax = Math.max(...lista.map((x) => x.a));
    const cand = lista.filter((x) => x.a >= amax * 0.5 && x.a > 0);
    const w = cand.map((x) => Math.pow(x.a, 3));
    const tot = w.reduce((x, y) => x + y, 0) || 1;
    const probs = {};
    cand.forEach((x, i) => { probs[x.id] = w[i] / tot; });
    cand.sort((a, b) => probs[b.id] - probs[a.id]);
    const top = cand[0];
    const famLabel = { raios: "raios", fogo: "fogo", chuva: "chuva", neve: "neve", vento: "vento", temperatura: "temperatura", umidade: "umidade", nuvens: "nuvens" };
    const topFams = top ? Object.entries(top.porFam).sort((a, b) => b[1] - a[1]) : [];
    const motivo = !top ? "Nenhuma obra." :
      (topFams.length && top.a > L.piso
        ? `${top.label} tem a maior aderência (${fmt(top.a, 2)}): ${topFams.filter(([, v]) => v > 0).map(([f, v]) => `${famLabel[f]} ${fmt(v, 2)}`).join(", ") || "dados fracos"}. ${cand.length} obras entram no sorteio, com chance proporcional à aderência ao cubo.`
        : `Nenhuma obra se destaca acima do piso. ${cand.length} obras entram no sorteio, e as sem entrada meteorológica ficam no piso (${fmt(L.piso, 2)}).`);
    const vencedor = top ? tipoMaisSaliente(catalogo.find((ob) => ob.id === top.id), S, L) : "calmaria";
    return {
      id: "C", S, sal, lista, candidatas: cand, probs, escolha: top ? top.id : null, motivo, deterministico: false,
      vencedor, vencedorLabel: vencedor === "calmaria" ? CALMARIA.label : TYPE_BY_ID[vencedor].label,
    };
  }
  /** O tipo pelo qual uma obra está tocando: o mais saliente entre os dela. */
  function tipoMaisSaliente(obra, S, L) {
    let best = "calmaria", bs = -1;
    for (const t of tiposDaObra(obra)) {
      if (t === "calmaria" || S[t] === null) continue;
      if (S[t] > bs) { bs = S[t]; best = t; }
    }
    return bs >= L.piso ? best : "calmaria";
  }

  /** Sorteio com semente (mulberry32) para resultados reproduzíveis. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sortear(probs, r) {
    let x = r(), acc = 0, last = null;
    for (const [id, p] of Object.entries(probs)) { acc += p; last = id; if (x < acc) return id; }
    return last;
  }

  // ------------------------------------------------------- COBERTURA
  /** Número pseudoaleatório fixo por (cidade, amostra, sal): a hipótese de fogo não muda entre execuções. */
  function hash01(a, b, salt) {
    let x = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263) + Math.imul(salt + 7, 2246822519)) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  const HIPOTESES = { pFogoSeco: 0.6, pFogoResto: 0.25, capeMin: 500, chuvaMinRaio: 0.5 };

  /** Uma amostra do ano de 2025 vira um `clima` canônico + o normal do lugar. */
  function amostraClima(city, ci, i, normals, h) {
    h = h || HIPOTESES;
    const v = (k, div) => (city[k][i] === null || city[k][i] === undefined ? null : city[k][i] / div);
    const p = v("p", 10), hum = v("h", 1), cape = v("cape", 1);
    const raio = cape !== null && p !== null && cape >= h.capeMin && p >= h.chuvaMinRaio ? Math.round(3 + cape / 150) : 0;
    const seco = hum !== null && hum < 50 && (p === null || p === 0);
    const temFogo = hash01(ci, i, 1) < (seco ? h.pFogoSeco : h.pFogoResto);
    const fogo = temFogo ? 1 + Math.floor(hash01(ci, i, 2) * 25) : 0;
    const perto = fogo && hash01(ci, i, 3) < 0.35 ? 1 + Math.floor(hash01(ci, i, 4) * Math.min(fogo, 8)) : 0;
    const clima = {
      temperature: v("t", 10), humidity: hum, clouds: v("c", 1), rain: p, windSpeed: v("w", 10), windDeg: v("d", 1),
      snowfall: v("s", 100), isDay: city.day[i] === 1, lightningCount: raio, fireCount: fogo, closeFires: perto,
      lat: city.lat, lon: city.lon,
    };
    const n = normals && normals[city.city] && normals[city.city][String(city.mo[i])];
    const normal = n ? n[String(city.hr[i])] || null : null;
    return { clima, normal: normal ? toNormal(normal) : null };
  }
  function toNormal(n) {
    const o = {};
    for (const k of ["temperature", "humidity", "clouds", "windSpeed"]) if (n[k]) o[k] = { mu: n[k][0], sd: n[k][1] };
    return o;
  }

  /**
   * % de vezes que cada obra é escolhida em cada critério, sobre todas as
   * amostras. Critérios com sorteio entram pela probabilidade esperada; os com
   * rodízio pela sequência simulada (memória por cidade, como uma instalação
   * parada num lugar).
   */
  function cobertura(cov, catalogo, normals, o) {
    o = o || {};
    const h = { ...HIPOTESES, ...(o.hipoteses || {}) };
    const crit = ["atual", "A", "B", "C", "D"];
    const conta = Object.fromEntries(crit.concat("antes").map((k) => [k, {}]));
    const venc = Object.fromEntries(crit.concat("antes").map((k) => [k, {}]));
    const add = (m, k, x) => { m[k] = (m[k] || 0) + x; };
    let total = 0, comRaio = 0, mudou = 0;
    const byId = Object.fromEntries(catalogo.map((ob) => [ob.id, ob]));
    cov.forEach((city, ci) => {
      if (o.regiao && o.regiao !== "todos" && city.region !== o.regiao) return;
      const memB = {}, memD = {};
      for (let i = 0; i < city.t.length; i++) {
        if (city.t[i] === null) continue;
        const { clima, normal } = amostraClima(city, ci, i, normals, h);
        total++;
        if (clima.lightningCount > 0) comRaio++;
        const r0 = criterioAtual(clima);
        for (const [id, p] of Object.entries(r0.probs)) add(conta.atual, id, p);
        add(venc.atual, r0.vencedor, 1);
        // O mesmo critério com o vento em km/h, como o site recebia antes do PR #243.
        const rAntes = criterioAtual(clima, { ventoKmh: true });
        for (const [id, p] of Object.entries(rAntes.probs)) add(conta.antes, id, p);
        add(venc.antes, rAntes.vencedor, 1);
        if (rAntes.vencedor !== r0.vencedor) mudou++;
        const rA = criterioA(clima);
        for (const [id, p] of Object.entries(rA.probs)) add(conta.A, id, p);
        add(venc.A, rA.vencedor, 1);
        const rB = criterioB(clima, catalogo, memB, o);
        add(conta.B, rB.escolha, 1); add(venc.B, rB.vencedor, 1); memB[rB.escolha] = i;
        const rC = criterioC(clima, catalogo, o);
        for (const [id, p] of Object.entries(rC.probs)) {
          add(conta.C, id, p);
          add(venc.C, tipoMaisSaliente(byId[id], rC.S, o.limiares || LIMIARES), p);
        }
        const rD = criterioD(clima, catalogo, memD, { ...o, normal });
        add(conta.D, rD.escolha, 1); add(venc.D, rD.vencedor, 1); memD[rD.escolha] = i;
      }
    });
    const pct = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (100 * v) / Math.max(total, 1)]));
    const todos = crit.concat("antes");
    return { total, comRaio: (100 * comRaio) / Math.max(total, 1), mudou: (100 * mudou) / Math.max(total, 1), conta: Object.fromEntries(todos.map((k) => [k, pct(conta[k])])), venc: Object.fromEntries(todos.map((k) => [k, pct(venc[k])])) };
  }

  const api = {
    hash01, HIPOTESES, amostraClima, toNormal, cobertura, tipoMaisSaliente,
    POOLS_ATUAL, CAT_LABEL, TYPES, TYPE_BY_ID, CALMARIA, ATTR_FAMILY, LIMIARES, PESOS_PADRAO, BEAUFORT,
    lerp, lerpLog, entradaDoSite, traceAtual, criterioAtual, criterioA, criterioB, criterioC, criterioD,
    saliencias, tiposDaObra, familiasDaObra, obrasPorTipo, aderencia, descreveTipo, beaufort, rng, sortear, fmt,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Criterios = api;
})(typeof window !== "undefined" ? window : globalThis);
