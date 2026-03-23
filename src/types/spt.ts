export interface MetroSPT {
  prof_m: number;
  nspt: number;
  golpes_1: number;
  golpes_2: number;
  golpes_3: number;
  descricao: string;
  origem: string;
}

export interface SondagemSPT {
  nome: string;
  cota_boca: number;
  nivel_dagua: number | null;
  metros: MetroSPT[];
  distancia?: number;
}

export interface AreaSelecao {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResultadoExtracao {
  nome: string;
  cota_boca: number;
  nivel_dagua: number | null;
  metros: MetroSPT[];
}
