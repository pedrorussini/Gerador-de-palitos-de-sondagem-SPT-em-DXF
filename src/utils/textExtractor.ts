import type { AreaSelecao, MetroSPT } from '../types/spt';

const THRESHOLD = 4;

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

const getItems = async (pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number) => {
  const page     = await pdfDoc.getPage(pagina);
  const viewport = page.getViewport({ scale: 1 });
  const coords   = convertCoords(area, zoom, viewport);
  const content  = await page.getTextContent();
  return { items: filtrarTextos(content, coords), viewport, coords };
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
  const profs: { prof: number; y: number }[] = [];
  const vistos = new Set<number>();

  items.forEach((item: any) => {
    const str = item.str.trim();
    const v = parseInt(str);
    if (!isNaN(v) && v >= 1 && v <= 100 && str === String(v)) {
      if (!vistos.has(v)) {
        vistos.add(v);
        profs.push({ prof: v, y: item.transform[5] });
      }
    }
  });

  return profs.sort((a, b) => a.prof - b.prof);
};

export const extrairNSPT = async (
  pdfDoc: any, pagina: number, area: AreaSelecao, zoom: number
): Promise<{ nspt: number; y: number }[]> => {
  const { items } = await getItems(pdfDoc, pagina, area, zoom);
  const sorted = [...items].sort((a: any, b: any) => b.transform[5] - a.transform[5]);
  const nspts: { nspt: number; y: number }[] = [];

  sorted.forEach((item: any) => {
    const str = item.str.trim();
    // Formato parcial 30/13 → pega o numerador como NSPT
    const mFrac = str.match(/^(\d+)\/(\d+)$/);
    if (mFrac) {
      nspts.push({ nspt: parseInt(mFrac[1]), y: item.transform[5] });
      return;
    }
    const v = parseInt(str);
    if (!isNaN(v) && v >= 0 && v <= 200 && str === String(v)) {
      nspts.push({ nspt: v, y: item.transform[5] });
    }
  });
  return nspts;
};

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
      if (texto) blocos.push({ texto, y });
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
    if (texto) blocos.push({ texto, y });
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
  nspts:         { nspt: number; y: number }[],
  descricoes:    { texto: string; y: number }[],
  origens:       { origem: string; y: number }[],
): MetroSPT[] => {
  if (!profundidades.length) return [];

  const alts = profundidades.slice(1).map((p, i) => Math.abs(p.y - profundidades[i].y));
  const altMetro = alts.length ? alts.reduce((a, b) => a + b, 0) / alts.length : 20;

  // Mapear cada profundidade → NSPT, origem, descrição
  const metros: MetroSPT[] = profundidades.map(({ prof, y }) => {

    // NSPT mais próximo
    const nsptItem = nspts.length
      ? nspts.reduce((b, c) => Math.abs(c.y - y) < Math.abs(b.y - y) ? c : b)
      : { nspt: 0, y: Infinity };
    const nspt = Math.abs(nsptItem.y - y) < altMetro * 0.75 ? nsptItem.nspt : 0;

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
