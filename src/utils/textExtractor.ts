import type { AreaSelecao, MetroSPT } from '../types/spt';

const THRESHOLD = 15;

const convertCoords = (area: AreaSelecao, zoom: number, viewport: any) => ({
  x:      area.x / zoom,
  y:      viewport.height - area.y / zoom - area.height / zoom,
  width:  area.width  / zoom,
  height: area.height / zoom,
});

const filtrarTextos = (textContent: any, coords: ReturnType<typeof convertCoords>) =>
  textContent.items.filter((item: any) => {
    const x = item.transform[4];
    const y = item.transform[5];
    return (
      x >= coords.x - THRESHOLD &&
      x <= coords.x + coords.width  + THRESHOLD &&
      y >= coords.y - THRESHOLD &&
      y <= coords.y + coords.height + THRESHOLD
    );
  });

export const getItems = async (pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number) => {
  const page     = await pdfDoc.getPage(pagina);
  const viewport = page.getViewport({ scale: 1 });
  const coords   = convertCoords(area, zoom, viewport);
  const content  = await page.getTextContent();
  const allItems = filtrarTextos(content, coords);
  console.log('[getItems] viewport:', viewport.width.toFixed(0), 'x', viewport.height.toFixed(0));
  console.log('[getItems] area:', JSON.stringify({x: area.x.toFixed(1), y: area.y.toFixed(1), w: area.width.toFixed(1), h: area.height.toFixed(1)}));
  console.log('[getItems] coords convertidos:', JSON.stringify({x: coords.x.toFixed(1), y: coords.y.toFixed(1), w: coords.width.toFixed(1), h: coords.height.toFixed(1)}));
  console.log('[getItems] itens encontrados:', allItems.length, allItems.map((i: any) => i.str));
  return { items: allItems, viewport, coords };
};

const parseNumero = (str: string): number | null => {
  // Remove separadores de milhar (ponto antes de vírgula ou antes de 3 dígitos)
  // Ex: "1.329,00" → 1329.00 | "3,224" → 3.224 | "10,45" → 10.45
  let s = str.trim();
  // Se tem ponto E vírgula: ponto é milhar, vírgula é decimal
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Só vírgula: vírgula é decimal
    s = s.replace(',', '.');
  }
  const v = parseFloat(s.replace(/[^\d.]/g, ''));
  return isNaN(v) ? null : v;
};

// ── Extratores individuais ────────────────────────────────────────────────

export const extrairNome = async (
  pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number
): Promise<string> => {
  const { items } = await getItems(pdfDoc, pagina, area, zoom);
  const texto = items.map((i: any) => i.str.trim()).join(' ');
  const m = texto.match(/\b(S[PM]-[0-9A-Z]+-[0-9]+-[0-9]+[A-Z0-9]*)\b/);
  return m ? m[1] : texto.trim() || `Sondagem-${pagina}`;
};

export const extrairCota = async (
  pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number
): Promise<number> => {
  const { items } = await getItems(pdfDoc, pagina, area, zoom);
  // Ordenar por x decrescente para pegar o valor numérico (que fica depois do rótulo)
  const sorted = [...items].sort((a: any, b: any) => b.transform[4] - a.transform[4]);
  for (const item of sorted) {
    const v = parseNumero(item.str);
    if (v !== null && v > 0) return v;
  }
  // Tentar concatenar todos os textos e extrair número
  const texto = items.map((i: any) => i.str.trim()).join(' ');
  const m = texto.match(/(\d[\d.,]+)/);
  if (m) { const v = parseNumero(m[1]); if (v !== null) return v; }
  return 0;
};

export const extrairNA = async (
  pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number
): Promise<number | null> => {
  const { items } = await getItems(pdfDoc, pagina, area, zoom);
  const texto = items.map((i: any) => i.str.trim()).join(' ');
  if (/ausente|seco|n\.?\s*o\.?/i.test(texto)) return null;
  const m = texto.match(/(\d+[.,]\d+)/);
  return m ? parseNumero(m[1]) : null;
};

export const extrairProfundidades = async (
  pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number
): Promise<{ prof: number; y: number }[]> => {
  const { items } = await getItems(pdfDoc, pagina, area, zoom);
  const mapa = new Map<number, number>(); // valor → y

  items.forEach((item: any) => {
    const raw = item.str.trim();
    // Aceitar apenas inteiros puros (sem decimais, sem ponto, sem vírgula)
    if (!/^\d{1,3}$/.test(raw)) return;
    const v = parseInt(raw);
    if (v >= 1 && v <= 100 && !mapa.has(v)) mapa.set(v, item.transform[5]);
  });

  // Encontrar a sequência consecutiva mais longa (profundidades reais vs. escala de cotas)
  const vals = [...mapa.keys()].sort((a, b) => a - b);
  let melhorSeq: number[] = [];
  let seqAtual: number[] = [];
  for (const v of vals) {
    if (seqAtual.length === 0 || v === seqAtual[seqAtual.length - 1] + 1) {
      seqAtual.push(v);
    } else {
      if (seqAtual.length > melhorSeq.length) melhorSeq = seqAtual;
      seqAtual = [v];
    }
  }
  if (seqAtual.length > melhorSeq.length) melhorSeq = seqAtual;

  return melhorSeq.map(v => ({ prof: v, y: mapa.get(v)! }));
};

export const extrairNSPT = async (
  pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number
): Promise<{ nspt: number; y: number; isFrac: boolean }[]> => {
  const { items, coords } = await getItems(pdfDoc, pagina, area, zoom);
  const sorted = [...items].sort((a: any, b: any) => b.transform[5] - a.transform[5]);
  const nspts: { nspt: number; y: number; isFrac: boolean }[] = [];
  // Centro horizontal da area selecionada (em coords PDF)
  const xCentro = coords.x + coords.width / 2;

  sorted.forEach((item: any) => {
    const str = item.str.trim();
    const ix = item.transform[4];
    const iy = item.transform[5];
    // Ignorar valores nas bordas da selecao (provavelmente escala de cotas)
    if (Math.abs(ix - xCentro) > coords.width * 0.55) return;
    // Formato fracao 30/13 → pega numerador como NSPT
    const mFrac = str.match(/^(\d+)\/(\d+)$/);
    if (mFrac) {
      nspts.push({ nspt: parseInt(mFrac[1]), y: iy, isFrac: true });
      return;
    }
    // Ignorar traco (impenetravel)
    if (str === '–' || str === '-' || str === '—') return;
    const v = parseInt(str);
    if (!isNaN(v) && v >= 0 && v <= 60 && str === String(v)) {
      nspts.push({ nspt: v, y: iy, isFrac: false });
    }
  });
  return nspts;
};

const DESC_BLACKLIST = new Set([
  'CLASSIFICAÇÃO DO MATERIAL', 'CLASSIFICAÇÃO', 'MATERIAL', 'DESCRIÇÃO',
  'DESCRIÇÃO DO MATERIAL', 'CLASSIFICAÇÃO DE MATERIAL', 'CAMADA',
]);

export const extrairDescricao = async (
  pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number
): Promise<{ texto: string; y: number }[]> => {
  const { items } = await getItems(pdfDoc, pagina, area, zoom);
  if (!items.length) return [];

  const sorted = [...items].sort((a: any, b: any) => b.transform[5] - a.transform[5]);
  const altLinha = sorted[0]?.height || 8;

  // Agrupar em linhas (mesmo y ± 60% da altura)
  const linhas: any[][] = [];
  sorted.forEach((item: any) => {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(item.transform[5] - ultima[0].transform[5]) < altLinha * 0.6) {
      ultima.push(item);
    } else {
      linhas.push([item]);
    }
  });

  // Agrupar linhas em blocos — quebra quando gap > 2x a altura da linha
  const blocos: { texto: string; y: number }[] = [];
  if (!linhas.length) return blocos;

  let blocoAtual: any[][] = [linhas[0]];

  for (let i = 1; i < linhas.length; i++) {
    const yAtual    = linhas[i][0].transform[5];
    const yAnterior = blocoAtual[blocoAtual.length - 1][0].transform[5];
    const gap       = Math.abs(yAtual - yAnterior);

    if (gap < altLinha * 2.5) {
      blocoAtual.push(linhas[i]);
    } else {
      const texto = blocoAtual
        .map(l => l.sort((a: any, b: any) => a.transform[4] - b.transform[4])
          .map((w: any) => w.str).join(' '))
        .join(' ').trim().toUpperCase();
      const y = blocoAtual[0][0].transform[5];
      if (texto && !DESC_BLACKLIST.has(texto)) blocos.push({ texto, y });
      blocoAtual = [linhas[i]];
    }
  }

  // Último bloco
  if (blocoAtual.length) {
    const texto = blocoAtual
      .map(l => l.sort((a: any, b: any) => a.transform[4] - b.transform[4])
        .map((w: any) => w.str).join(' '))
      .join(' ').trim().toUpperCase();
    const y = blocoAtual[0][0].transform[5];
    if (texto && !DESC_BLACKLIST.has(texto)) blocos.push({ texto, y });
  }

  return blocos;
};

export const extrairOrigem = async (
  pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number
): Promise<{ origem: string; y: number }[]> => {
  const ORIGENS = new Set(['SS','SRM','SRJ','SR','AT','AL','DFL','SAR','RC','SP','SDL']);
  const { items } = await getItems(pdfDoc, pagina, area, zoom);
  return items
    .filter((item: any) => ORIGENS.has(item.str.trim().toUpperCase()))
    .map((item: any) => ({
      origem: item.str.trim().toUpperCase(),
      y: item.transform[5],
    }));
};

// ── Montar MetroSPT ───────────────────────────────────────────────────────

export const montarMetros = (
  profundidades: { prof: number; y: number }[],
  nspts:         { nspt: number; y: number; isFrac?: boolean }[],
  descricoes:    { texto: string; y: number }[],
  origens:       { origem: string; y: number }[],
): MetroSPT[] => {
  if (!profundidades.length) return [];

  const alts = profundidades.slice(1).map((p, i) => Math.abs(p.y - profundidades[i].y));
  const altMetro = alts.length ? alts.reduce((a, b) => a + b, 0) / alts.length : 20;

  // Mapear cada profundidade → NSPT, origem, descrição
  const metros: MetroSPT[] = profundidades.map(({ prof, y }) => {

    // NSPT: dentre candidatos próximos, preferir fração (2ª+3ª golpes) sobre inteiro
    const candidatos = nspts.filter(c => Math.abs(c.y - y) < altMetro * 0.75);
    let nspt = 0;
    if (candidatos.length) {
      const fracoes = candidatos.filter(c => c.isFrac);
      const pool    = fracoes.length ? fracoes : candidatos;
      const best    = pool.reduce((b, c) => Math.abs(c.y - y) < Math.abs(b.y - y) ? c : b);
      nspt = best.nspt;
    }

    // Origem mais próxima
    const origItem = origens.length
      ? origens.reduce((b, c) => Math.abs(c.y - y) < Math.abs(b.y - y) ? c : b)
      : { origem: '', y: Infinity };
    const origem = Math.abs(origItem.y - y) < altMetro * 0.75 ? origItem.origem : '';

    // Descrição: usar o bloco cujo y é mais próximo do centro do intervalo
    const yPrev   = profundidades.find(p => p.prof === prof - 1)?.y ?? y + altMetro;
    const yCentro = (y + yPrev) / 2;
    const descItem = descricoes.length
      ? descricoes.reduce((b, c) => Math.abs(c.y - yCentro) < Math.abs(b.y - yCentro) ? c : b)
      : { texto: '', y: Infinity };
    const descricao = Math.abs(descItem.y - yCentro) < altMetro * 2.5 ? descItem.texto : '';

    return { prof_m: prof, nspt, golpes_1: 0, golpes_2: 0, golpes_3: 0, descricao, origem };
  });

  // Preencher vazios com último valor válido
  let ultDesc = '';
  let ultOrig = '';
  metros.forEach(m => {
    if (m.descricao) ultDesc = m.descricao; else m.descricao = ultDesc;
    if (m.origem)    ultOrig = m.origem;    else m.origem    = ultOrig;
  });

  return metros;
};
