import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { ToastContainer, toast } from 'react-toastify';
import { pdfjs } from 'react-pdf';
import 'react-toastify/dist/ReactToastify.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import PdfViewer from './components/PdfViewer';
import TabelaRevisao from './components/TabelaRevisao';
import {
  extrairNome, extrairCota, extrairNA,
  extrairProfundidades, extrairNSPT,
  extrairDescricao, extrairOrigem, montarMetros,
} from './utils/textExtractor';
import { gerarDxfSondagem, downloadDxf, downloadZip } from './utils/dxfGenerator';
import type { SondagemSPT, AreaSelecao } from './types/spt';

// Fix: configurar worker pdf.js
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// Definição dos campos de seleção
const CAMPOS = [
  { id: 'nome',   label: 'Nome da Sondagem', cor: '#e74c3c', icone: 'bi-tag',           dica: 'Ex: SP-35B-3-001' },
  { id: 'cota',   label: 'Cota da Boca',     cor: '#e67e22', icone: 'bi-arrow-up',       dica: 'Ex: 1.329,00 m' },
  { id: 'na',     label: "Nível d'Água",     cor: '#3498db', icone: 'bi-water',           dica: 'Ex: 4,00 m ou Ausente' },
  { id: 'profs',  label: 'Profundidades',    cor: '#27ae60', icone: 'bi-list-ol',         dica: 'Coluna com 1, 2, 3...' },
  { id: 'nspt',   label: 'NSPT',             cor: '#8e44ad', icone: 'bi-bar-chart',       dica: 'Coluna com os valores de NSPT' },
  { id: 'desc',   label: 'Descrição',        cor: '#16a085', icone: 'bi-card-text',       dica: 'Coluna com descrição do material' },
  { id: 'origem', label: 'Origem',           cor: '#d35400', icone: 'bi-geo',             dica: 'Ex: AT, SRM, SRJ...' },
] as const;

type CampoId = typeof CAMPOS[number]['id'];

type Selecoes = Partial<Record<CampoId, { area: AreaSelecao; pagina: number }>>;

export default function App() {
  const [arquivo, setArquivo]       = useState<File | null>(null);
  const [pdfDoc, setPdfDoc]         = useState<any>(null);
  const [campoAtivo, setCampoAtivo] = useState<CampoId>('nome');
  const [selecoes, setSelecoes]     = useState<Selecoes>({});
  const [sondagens, setSondagens]   = useState<SondagemSPT[]>([]);
  const [extraindo, setExtraindo]   = useState(false);
  const [hachuraMap, setHachuraMap] = useState({});
  const zoom = 1.0;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    onDrop: async (files) => {
      if (!files.length) return;
      const f = files[0];
      setArquivo(f);
      setSelecoes({});
      setCampoAtivo('nome');
      try {
        const buffer = await f.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buffer }).promise;
        setPdfDoc(doc);
        toast.success(`PDF carregado: ${f.name}`);
      } catch (e: any) {
        toast.error(`Erro ao carregar PDF: ${e.message}`);
      }
    },
  });

  const handleAreaSelecionada = (area: AreaSelecao, pagina: number) => {
    const novasSelecoes = { ...selecoes, [campoAtivo]: { area, pagina } };
    setSelecoes(novasSelecoes);

    // Avançar para o próximo campo automaticamente
    const idx = CAMPOS.findIndex(c => c.id === campoAtivo);
    if (idx < CAMPOS.length - 1) {
      setCampoAtivo(CAMPOS[idx + 1].id);
      toast.success(`✓ ${CAMPOS[idx].label} marcado! Selecione: ${CAMPOS[idx + 1].label}`);
    } else {
      toast.success('✓ Todos os campos marcados! Clique em Extrair Dados.');
    }
  };

  const campoInfo = CAMPOS.find(c => c.id === campoAtivo)!;
  const totalMarcados = CAMPOS.filter(c => selecoes[c.id]).length;
  const tudoMarcado = totalMarcados === CAMPOS.length;

  const extrairDados = async () => {
    if (!pdfDoc || !tudoMarcado) return;
    setExtraindo(true);
    try {
      const pag = (id: CampoId) => selecoes[id]!.pagina;
      const area = (id: CampoId) => selecoes[id]!.area;

      const [nome, cota, na, profs, nspts, descs, origs] = await Promise.all([
        extrairNome(pdfDoc,  pag('nome'),   area('nome'),   zoom),
        extrairCota(pdfDoc,  pag('cota'),   area('cota'),   zoom),
        extrairNA(pdfDoc,    pag('na'),     area('na'),     zoom),
        extrairProfundidades(pdfDoc, pag('profs'), area('profs'), zoom),
        extrairNSPT(pdfDoc,  pag('nspt'),   area('nspt'),   zoom),
        extrairDescricao(pdfDoc, pag('desc'), area('desc'), zoom),
        extrairOrigem(pdfDoc, pag('origem'), area('origem'), zoom),
      ]);

      const metros = montarMetros(profs, nspts, descs, origs);

      const nova: SondagemSPT = {
        nome,
        cota_boca:   cota,
        nivel_dagua: na,
        metros,
        distancia:   0,
      };

      setSondagens(s => [...s.filter(x => x.nome !== nova.nome), nova]);
      setHachuraMap(m => ({ ...m, [nova.nome]: true }));
      toast.success(`✅ ${metros.length} metro(s) extraído(s) de ${nome}`);
      setSelecoes({});
      setCampoAtivo('nome');
    } catch (e: any) {
      toast.error(`Erro na extração: ${e.message}`);
    } finally {
      setExtraindo(false);
    }
  };

  // Overlay das áreas já marcadas (apenas da página atual — simplificado)
  const areasOverlay = CAMPOS
    .filter(c => selecoes[c.id])
    .map(c => ({
      area:  selecoes[c.id]!.area,
      cor:   c.cor,
      label: c.label,
    }));

  return (
    <div className="container-fluid py-3">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="mb-3">
        <h4 className="mb-0">🗂️ Gerador de Palitos SPT</h4>
        <small className="text-muted">Upload de PDF → mapeamento de campos → revisão → export DXF</small>
      </div>

      <div className="row g-3">

        {/* ── Coluna esquerda: PDF ── */}
        <div className="col-lg-7">

          {!arquivo && (
            <div {...getRootProps()}
              className="border border-2 rounded p-5 text-center"
              style={{
                cursor: 'pointer',
                borderStyle: 'dashed',
                borderColor: isDragActive ? '#0d6efd' : '#ccc',
                background:  isDragActive ? '#f0f8ff' : '#fafafa',
              }}>
              <input {...getInputProps()} />
              <i className="bi bi-file-earmark-pdf fs-1 text-danger"></i>
              <p className="mt-2 mb-0">Arraste um PDF aqui ou clique para selecionar</p>
            </div>
          )}

          {arquivo && (
            <>
              {/* Instrução do campo ativo */}
              <div className="alert py-2 mb-2"
                style={{ backgroundColor: campoInfo.cor + '22', borderColor: campoInfo.cor, borderWidth: 1, borderStyle: 'solid' }}>
                <i className={`bi ${campoInfo.icone} me-2`}></i>
                <strong>Arraste para marcar: {campoInfo.label}</strong>
                <span className="text-muted ms-2 small">({campoInfo.dica})</span>
              </div>

              <PdfViewer
                arquivo={arquivo}
                onSelecionarArea={handleAreaSelecionada}
                modoSelecao={true}
                corSelecao={campoInfo.cor}
                areasExistentes={areasOverlay}
              />

              <div className="d-flex gap-2 mt-2 flex-wrap">
                <button className="btn btn-outline-secondary btn-sm"
                  onClick={() => { setArquivo(null); setPdfDoc(null); setSelecoes({}); setCampoAtivo('nome'); }}>
                  <i className="bi bi-x-circle me-1"></i>Trocar PDF
                </button>
                <button className="btn btn-outline-warning btn-sm"
                  onClick={() => { setSelecoes({}); setCampoAtivo('nome'); }}>
                  <i className="bi bi-arrow-counterclockwise me-1"></i>Limpar seleções
                </button>
                {tudoMarcado && (
                  <button className="btn btn-primary btn-sm" onClick={extrairDados} disabled={extraindo}>
                    {extraindo
                      ? <span className="spinner-border spinner-border-sm me-1" />
                      : <i className="bi bi-search me-1"></i>}
                    Extrair Dados
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Coluna direita: campos + sondagens ── */}
        <div className="col-lg-5">

          {/* Lista de campos */}
          {arquivo && (
            <div className="card mb-3">
              <div className="card-header py-2">
                <strong>Campos ({totalMarcados}/{CAMPOS.length})</strong>
              </div>
              <div className="list-group list-group-flush">
                {CAMPOS.map(c => {
                  const marcado  = !!selecoes[c.id];
                  const ativo    = campoAtivo === c.id;
                  return (
                    <button key={c.id}
                      className={`list-group-item list-group-item-action d-flex align-items-center gap-2 py-2
                        ${ativo ? 'active' : ''}`}
                      style={ativo ? { backgroundColor: c.cor, borderColor: c.cor } : {}}
                      onClick={() => setCampoAtivo(c.id)}>
                      <i className={`bi ${marcado ? 'bi-check-circle-fill' : 'bi-circle'}`}
                        style={{ color: ativo ? '#fff' : marcado ? c.cor : '#aaa' }}></i>
                      <span>{c.label}</span>
                      {marcado && !ativo && (
                        <span className="ms-auto badge"
                          style={{ backgroundColor: c.cor, fontSize: 10 }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sondagens extraídas */}
          {sondagens.length > 0 && (
            <>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">{sondagens.length} sondagem(ns)</h6>
                <button className="btn btn-success btn-sm"
                  onClick={() => downloadZip(sondagens, hachuraMap)}>
                  <i className="bi bi-file-zip me-1"></i>Baixar ZIP
                </button>
              </div>

              {sondagens.map((s, i) => (
                <div key={i}>
                  <TabelaRevisao
                    sondagem={s}
                    hachura={hachuraMap[s.nome] ?? true}
                    onHachuraChange={v => setHachuraMap(m => ({ ...m, [s.nome]: v }))}
                    onChange={nova => setSondagens(ss => ss.map((x, j) => j === i ? nova : x))}
                  />
                  <div className="d-flex gap-2 mb-3">
                    <button className="btn btn-outline-primary btn-sm"
                      onClick={() => downloadDxf(gerarDxfSondagem(s, hachuraMap[s.nome] ?? true), `${s.nome}.dxf`)}>
                      <i className="bi bi-download me-1"></i>DXF — {s.nome}
                    </button>
                    <button className="btn btn-outline-danger btn-sm"
                      onClick={() => setSondagens(ss => ss.filter((_, j) => j !== i))}>
                      <i className="bi bi-trash me-1"></i>Remover
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {!arquivo && (
            <div className="text-center text-muted mt-5">
              <i className="bi bi-file-earmark-pdf fs-2"></i>
              <p className="mt-2">Carregue um PDF para começar</p>
            </div>
          )}
        </div>
      </div>

      <footer className="text-center text-muted small mt-4 pt-3 border-top">
        Escala 1:100 | Layers: furoSondagem · BR100 · BR60 · BGEOT-VT · Nivel Dagua · BLC
      </footer>
    </div>
  );
}