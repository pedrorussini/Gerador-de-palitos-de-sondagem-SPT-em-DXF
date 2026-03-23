import { useState } from 'react';
import type { SondagemSPT, MetroSPT } from '../types/spt';

interface Props {
  sondagem: SondagemSPT;
  onChange: (sondagem: SondagemSPT) => void;
}

export default function TabelaRevisao({ sondagem, onChange }: Props) {
  const [hachura, setHachura] = useState(true);

  const update = (campo: keyof SondagemSPT, valor: any) => {
    onChange({ ...sondagem, [campo]: valor });
  };

  const updateMetro = (idx: number, campo: keyof MetroSPT, valor: any) => {
    const novos = sondagem.metros.map((m, i) =>
      i === idx ? { ...m, [campo]: valor } : m
    );
    onChange({ ...sondagem, metros: novos });
  };

  const addMetro = () => {
    const ultimo = sondagem.metros[sondagem.metros.length - 1];
    const novo: MetroSPT = {
      prof_m: ultimo ? ultimo.prof_m + 1 : 1,
      nspt: 0, golpes_1: 0, golpes_2: 0, golpes_3: 0,
      descricao: '', origem: '',
    };
    onChange({ ...sondagem, metros: [...sondagem.metros, novo] });
  };

  const removeMetro = (idx: number) => {
    onChange({ ...sondagem, metros: sondagem.metros.filter((_, i) => i !== idx) });
  };

  const pct = sondagem.metros.length
    ? Math.round(sondagem.metros.filter(m => m.descricao).length / sondagem.metros.length * 100)
    : 0;

  return (
    <div className="card mb-3">
      <div className="card-header d-flex justify-content-between align-items-center">
        <span>
          <strong>{sondagem.nome}</strong>
          <span className={`badge ms-2 ${pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger'}`}>
            {pct}% com descrição
          </span>
        </span>
        <div className="form-check form-switch mb-0">
          <input className="form-check-input" type="checkbox" checked={hachura}
            onChange={e => setHachura(e.target.checked)} id={`hach-${sondagem.nome}`} />
          <label className="form-check-label small" htmlFor={`hach-${sondagem.nome}`}>Hachura</label>
        </div>
      </div>

      <div className="card-body">
        <div className="row g-2 mb-3">
          <div className="col-md-3">
            <label className="form-label small">Nome</label>
            <input className="form-control form-control-sm" value={sondagem.nome}
              onChange={e => update('nome', e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label small">Cota (m)</label>
            <input className="form-control form-control-sm" type="number" step="0.001"
              value={sondagem.cota_boca}
              onChange={e => update('cota_boca', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="col-md-3">
            <label className="form-label small">NA (m)</label>
            <input className="form-control form-control-sm" type="number" step="0.1"
              value={sondagem.nivel_dagua ?? ''}
              onChange={e => update('nivel_dagua', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="Ausente" />
          </div>
          <div className="col-md-3">
            <label className="form-label small">Dist. (m)</label>
            <input className="form-control form-control-sm" type="number" step="0.001"
              value={sondagem.distancia ?? 0}
              onChange={e => update('distancia', parseFloat(e.target.value) || 0)} />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table table-sm table-bordered small mb-2">
            <thead className="table-dark">
              <tr>
                <th>Prof. (m)</th><th>NSPT</th><th>g1</th><th>g2</th><th>g3</th>
                <th>Origem</th><th style={{ minWidth: 250 }}>Descrição</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sondagem.metros.map((m, i) => (
                <tr key={i} className={!m.descricao ? 'table-warning' : ''}>
                  <td>
                    <input className="form-control form-control-sm" type="number" step="0.01"
                      value={m.prof_m} style={{ width: 70 }}
                      onChange={e => updateMetro(i, 'prof_m', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td>
                    <input className="form-control form-control-sm" type="number"
                      value={m.nspt} style={{ width: 60 }}
                      onChange={e => updateMetro(i, 'nspt', parseInt(e.target.value) || 0)} />
                  </td>
                  {(['golpes_1', 'golpes_2', 'golpes_3'] as const).map(g => (
                    <td key={g}>
                      <input className="form-control form-control-sm" type="number"
                        value={m[g]} style={{ width: 55 }}
                        onChange={e => updateMetro(i, g, parseInt(e.target.value) || 0)} />
                    </td>
                  ))}
                  <td>
                    <input className="form-control form-control-sm" value={m.origem} style={{ width: 70 }}
                      onChange={e => updateMetro(i, 'origem', e.target.value.toUpperCase())} />
                  </td>
                  <td>
                    <input className="form-control form-control-sm" value={m.descricao}
                      onChange={e => updateMetro(i, 'descricao', e.target.value.toUpperCase())} />
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => removeMetro(i)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-sm btn-outline-secondary" onClick={addMetro}>+ Adicionar metro</button>
      </div>
    </div>
  );
}
