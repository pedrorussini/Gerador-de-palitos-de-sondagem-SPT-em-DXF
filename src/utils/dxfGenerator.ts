import type { SondagemSPT, MetroSPT } from '../types/spt';
import {
  DxfWriter, Colors, Units, point3d, point2d,
  HatchBoundaryPaths, HatchPolylineBoundary, HatchPredefinedPatterns,
  pattern, vertex,
} from '@tarikjabiri/dxf';

const PAL_XE   = 4.15;
const PAL_XD   = 4.25;
const PAL_XC   = 4.20;
const NSPT_X   = 4.40;
const DESC_X   = 4.00;
const CAB_X    = 4.40;
const NA_X     = 6.60;
const PROF_X   = 4.80;
const BALIZA_X = 4.60;
const HORIZ_X  = 1.77;
const Y_TOPO   = 17.116;

const H_CAB  = 0.185;
const H_NSPT = 0.200;
const H_DESC = 0.085;
const H_NA   = 0.200;
const H_PROF = 0.200;

const yCoord = (prof: number) => Y_TOPO - prof;

const agruparHorizontes = (metros: MetroSPT[]) => {
  if (!metros.length) return [];
  const grupos: { pi: number; pf: number; desc: string; orig: string }[] = [];
  let descAtual = metros[0].descricao || '';
  let origAtual = metros[0].origem || '';
  let ini = Math.max(0, metros[0].prof_m - 1.0);

  for (let i = 1; i < metros.length; i++) {
    const m = metros[i];
    if (m.descricao && m.descricao !== descAtual) {
      grupos.push({ pi: ini, pf: m.prof_m - 1.0, desc: descAtual, orig: origAtual });
      ini = m.prof_m - 1.0;
      descAtual = m.descricao;
    }
    if (m.origem) origAtual = m.origem;
  }
  grupos.push({ pi: ini, pf: metros[metros.length - 1].prof_m, desc: descAtual, orig: origAtual });
  return grupos.filter(g => g.desc);
};

export const gerarDxfSondagem = (sondagem: SondagemSPT, incluirHachura = true): string => {
  const dxf = new DxfWriter();
  dxf.setUnits(Units.Meters);

  const solidPat = pattern({ name: HatchPredefinedPatterns.SOLID });

  const lyPal  = dxf.addLayer('furoSondagem', Colors.White,  'Continuous');
  const lyNspt = dxf.addLayer('BR100',        Colors.Yellow, 'Continuous');
  const lyDesc = dxf.addLayer('BR60',         Colors.Cyan,   'Continuous');
  dxf.addLayer('Nivel Dagua',  Colors.Blue,   'Continuous');
  const lyHach = dxf.addLayer('BGEOT-VT',     Colors.Green,  'Continuous');
  dxf.addLayer('BLC',          Colors.Red,    'Continuous');

  const arial = dxf.tables.addStyle('ARIAL');
  arial.fontFileName = 'arial.ttf';
  arial.widthFactor = 1.0;
  arial.fixedTextHeight = 0;

  const metros  = sondagem.metros;
  if (!metros.length) return dxf.stringify();

  const profMax = metros[metros.length - 1].prof_m;
  const ox      = sondagem.distancia ?? 0;
  const X       = (v: number) => v + ox;
  const yTopo   = yCoord(0);
  const yFundo  = yCoord(profMax);

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  const cabTxt = [
    sondagem.nome,
    `ALT: ${sondagem.cota_boca.toFixed(3).replace('.', ',')}`,
    `DIST: ${(sondagem.distancia ?? 0).toFixed(3).replace('.', ',')}`,
  ].join('\\P');

  const cabMt = dxf.addMText(point3d(X(CAB_X), yTopo + 0.6, 0), H_CAB, cabTxt, {
    attachmentPoint: 4, width: 5.0, layerName: lyNspt.name,
  });
  cabMt.textStyle = arial.name;

  // Linha vertical acima do palito
  dxf.addLine(
    point3d(X(PAL_XC), yTopo,       0),
    point3d(X(PAL_XC), yTopo + 0.8, 0),
    { layerName: lyNspt.name }
  );

  // ── Borda do palito ─────────────────────────────────────────────────────
  dxf.addLWPolyline([
    { point: point2d(X(PAL_XE), yTopo)  },
    { point: point2d(X(PAL_XD), yTopo)  },
    { point: point2d(X(PAL_XD), yFundo) },
    { point: point2d(X(PAL_XE), yFundo) },
  ], { closed: true, layerName: lyPal.name });

  // ── NSPT por metro ──────────────────────────────────────────────────────
  metros.forEach(m => {
    const ym = yCoord(m.prof_m);        // base do metro
    const yc = yCoord(m.prof_m - 0.5); // centro do metro

    // Linha de separação entre metros: x=4.4 → x=4.2 (na base)
    dxf.addLine(
      point3d(X(NSPT_X), ym, 0),
      point3d(X(PAL_XE), ym, 0),
      { layerName: lyNspt.name }
    );

    // Texto NSPT no centro do metro
    const nsptMt = dxf.addMText(
      point3d(X(NSPT_X), yc, 0),
      H_NSPT, String(m.nspt),
      { attachmentPoint: 1, width: 3.0, layerName: lyNspt.name }
    );
    nsptMt.textStyle = arial.name;
  });

  // ── Horizontes (descrições) ─────────────────────────────────────────────
  agruparHorizontes(metros).forEach(h => {
    const yi = yCoord(h.pi);
    const yf = yCoord(h.pf);
    const ym = (yi + yf) / 2;

    // Linha de separação de horizonte
    dxf.addLine(
      point3d(X(PAL_XE), yi, 0),
      point3d(X(HORIZ_X), yi, 0),
      { layerName: lyPal.name }
    );

    const piS = h.pi.toFixed(2).replace('.', ',');
    const pfS = h.pf.toFixed(2).replace('.', ',');
    const txt = h.orig
      ? `${h.orig} - ${h.desc}.: ${piS}-${pfS}`
      : `${h.desc}.: ${piS}-${pfS}`;

    const descMt = dxf.addMText(
      point3d(X(DESC_X), ym, 0),
      H_DESC, txt,
      { attachmentPoint: 3, width: 4.0, layerName: lyDesc.name }
    );
    descMt.textStyle = arial.name;
  });

  // ── Hachura SOLID metros ímpares + linhas baliza ─────────────────────────
  if (incluirHachura) {
    for (let m = 1; m <= Math.floor(profMax); m++) {
      const yt = yCoord(m - 1);
      const yb = yCoord(m);

      if (m % 2 === 1) {
        const poly = new HatchPolylineBoundary();
        poly.add(vertex(X(PAL_XE), yb));
        poly.add(vertex(X(PAL_XD), yb));
        poly.add(vertex(X(PAL_XD), yt));
        poly.add(vertex(X(PAL_XE), yt));
        poly.add(vertex(X(PAL_XE), yb));
        const boundary = new HatchBoundaryPaths();
        boundary.addPolylineBoundary(poly);
        dxf.addHatch(boundary, solidPat, { layerName: lyHach.name });
      }

      // Linha baliza BGEOT-VT
      dxf.addLine(
        point3d(X(BALIZA_X), yb, 0),
        point3d(X(PAL_XD),   yb, 0),
        { layerName: lyHach.name }
      );
    }
  }

  // ── Nível d'água ────────────────────────────────────────────────────────
  if (sondagem.nivel_dagua != null && sondagem.nivel_dagua > 0) {
    const yna = yCoord(sondagem.nivel_dagua);

    const polyNA = new HatchPolylineBoundary();
    polyNA.add(vertex(X(NA_X),        yna));
    polyNA.add(vertex(X(NA_X) - 0.15, yna + 0.25));
    polyNA.add(vertex(X(NA_X) + 0.15, yna + 0.25));
    polyNA.add(vertex(X(NA_X),        yna));
    const boundNA = new HatchBoundaryPaths();
    boundNA.addPolylineBoundary(polyNA);
    dxf.addHatch(boundNA, solidPat, { layerName: 'Nivel Dagua' });

    const naMt = dxf.addMText(
      point3d(X(NA_X), yna, 0),
      H_NA, `NA:${sondagem.nivel_dagua.toFixed(2).replace('.', ',')}`,
      { attachmentPoint: 8, width: 2.0, layerName: lyNspt.name }
    );
    naMt.textStyle = arial.name;
  }

  // ── Símbolo impenetrável ────────────────────────────────────────────────
  dxf.addLine(
    point3d(X(PAL_XE) - 0.1, yFundo,       0),
    point3d(X(PAL_XD) + 0.1, yFundo,       0),
    { layerName: 'BLC' }
  );
  dxf.addLine(
    point3d(X(PAL_XE) - 0.1, yFundo - 0.1, 0),
    point3d(X(PAL_XD) + 0.1, yFundo - 0.1, 0),
    { layerName: 'BLC' }
  );

  // ── Profundidade final ──────────────────────────────────────────────────
  const profMt = dxf.addMText(
    point3d(X(PROF_X), yFundo - 0.5, 0),
    H_PROF, `Prof.=${profMax.toFixed(2).replace('.', ',')}m`,
    { attachmentPoint: 5, width: 1.0, layerName: lyNspt.name }
  );
  profMt.textStyle = arial.name;

  return dxf.stringify();
};

export const downloadDxf = (conteudo: string, nomeArquivo: string) => {
  const blob = new Blob([conteudo], { type: 'application/dxf' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
};

export const downloadZip = async (sondagens: SondagemSPT[], hachuraMap: Record<string, boolean>) => {
  const JSZip = (await import('jszip')).default;
  const zip   = new JSZip();
  sondagens.forEach(s => {
    if (!s.metros.length) return;
    zip.file(`${s.nome}.dxf`, gerarDxfSondagem(s, hachuraMap[s.nome] ?? true));
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'palitos_sondagem.zip';
  link.click();
  URL.revokeObjectURL(url);
};
