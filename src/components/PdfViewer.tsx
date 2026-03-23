import { useState, useRef, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { AreaSelecao } from '../types/spt';

interface Props {
  arquivo: File;
  onSelecionarArea: (area: AreaSelecao, pagina: number) => void;
  modoSelecao: boolean;
  corSelecao: string;
  areasExistentes: { area: AreaSelecao; cor: string; label: string }[];
}

export default function PdfViewer({ arquivo, onSelecionarArea, modoSelecao, corSelecao, areasExistentes }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [iniciou, setIniciou] = useState(false);
  const [inicio, setInicio] = useState({ x: 0, y: 0 });
  const [selecaoAtual, setSelecaoAtual] = useState<AreaSelecao | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  const getCoords = useCallback((e: React.MouseEvent) => {
    if (!pdfRef.current) return { x: 0, y: 0 };
    const rect = pdfRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  }, [zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!modoSelecao) return;
    const coords = getCoords(e);
    setInicio(coords);
    setIniciou(true);
    setSelecaoAtual(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!modoSelecao || !iniciou) return;
    const coords = getCoords(e);
    setSelecaoAtual({
      x: Math.min(inicio.x, coords.x),
      y: Math.min(inicio.y, coords.y),
      width: Math.abs(coords.x - inicio.x),
      height: Math.abs(coords.y - inicio.y),
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!modoSelecao || !iniciou) return;
    const coords = getCoords(e);
    const area: AreaSelecao = {
      x: Math.min(inicio.x, coords.x),
      y: Math.min(inicio.y, coords.y),
      width: Math.abs(coords.x - inicio.x),
      height: Math.abs(coords.y - inicio.y),
    };
    setIniciou(false);
    setSelecaoAtual(null);
    if (area.width > 10 && area.height > 10) {
      onSelecionarArea(area, pagina);
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2">
        <button className="btn btn-sm btn-outline-secondary"
          onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1}>‹</button>
        <span className="small">Página {pagina} de {numPages}</span>
        <button className="btn btn-sm btn-outline-secondary"
          onClick={() => setPagina(p => Math.min(numPages, p + 1))} disabled={pagina >= numPages}>›</button>
        <button className="btn btn-sm btn-outline-secondary ms-2"
          onClick={() => setZoom(z => Math.min(3, z + 0.25))}>+</button>
        <span className="small">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-sm btn-outline-secondary"
          onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
      </div>

      <div style={{ overflow: 'auto', border: '2px solid #333', maxHeight: '70vh', position: 'relative' }}>
        <div
          ref={pdfRef}
          style={{
            position: 'relative',
            display: 'inline-block',
            cursor: modoSelecao ? 'crosshair' : 'default',
            userSelect: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Document file={arquivo} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
            <Page pageNumber={pagina} scale={zoom} renderTextLayer={false} renderAnnotationLayer={false} />
          </Document>

          {areasExistentes.map((a, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: a.area.x * zoom,
              top: a.area.y * zoom,
              width: a.area.width * zoom,
              height: a.area.height * zoom,
              border: `2px solid ${a.cor}`,
              backgroundColor: `${a.cor}22`,
              pointerEvents: 'none',
              zIndex: 10,
            }}>
              <span style={{ background: a.cor, color: '#fff', fontSize: 10, padding: '1px 4px' }}>{a.label}</span>
            </div>
          ))}

          {selecaoAtual && (
            <div style={{
              position: 'absolute',
              left: selecaoAtual.x * zoom,
              top: selecaoAtual.y * zoom,
              width: selecaoAtual.width * zoom,
              height: selecaoAtual.height * zoom,
              border: `2px solid ${corSelecao}`,
              backgroundColor: `${corSelecao}22`,
              pointerEvents: 'none',
              zIndex: 20,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
