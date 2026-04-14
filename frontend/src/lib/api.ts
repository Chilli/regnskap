export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export interface Bolig {
  id: number;
  navn: string;
  epost: string;
  telefon: string;
  adresse: string;
  seksjonsnummer: string;
  sameiebrok: number;
  areal: number;
}

export interface Faktura {
  id: number;
  dato: string;
  forfallsdato: string;
  total_belop: number;
  status: string;
  kunde_navn: string;
  seksjonsnummer: string;
  betalt: number;
  restsaldo: number;
}

export interface ApenPost {
  id: number;
  dato: string;
  forfallsdato: string;
  total_belop: number;
  status: string;
  navn: string;
  seksjonsnummer: string;
  betalt: number;
  restsaldo: number;
}

export interface ReskontroRad {
  id: number;
  navn: string;
  seksjonsnummer: string;
  saldo: number;
}

export interface BalanseRad {
  Kode: string;
  Navn: string;
  Saldo: number;
}

export interface ResultatRad {
  Kode: string;
  Navn: string;
  Type: string;
  Saldo: number;
}

export interface BankTransaksjonRad {
  id: number;
  dato: string;
  beskrivelse: string;
  belop: number;
  avstemt?: number;
}

export interface ReskontroAvstemming {
  hovedbok_saldo: number;
  apne_poster_sum: number;
  differanse: number;
}

export interface EpostInnstillinger {
  navn: string;
  adresse: string;
  orgnr: string;
  bankkonto: string;
  epost_avsender: string;
  app_passord_satt: boolean;
}

export interface Bilag {
  id: number;
  filnavn: string;
  original_filnavn: string;
  opplastet_dato: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      detail = data.detail || data.message || detail;
    } catch {
      // ignore json parse errors
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  hentBoliger: () => request<Bolig[]>("/api/boliger"),
  opprettBolig: (payload: Omit<Bolig, "id">) =>
    request<Bolig>("/api/boliger", { method: "POST", body: JSON.stringify(payload) }),
  slettBolig: (id: number) => request<{ message: string }>(`/api/boliger/${id}`, { method: "DELETE" }),

  hentFakturaer: () => request<Faktura[]>("/api/fakturaer"),
  opprettFaktura: (payload: { bolig_id: number; linjer: { beskrivelse: string; belop: number; inntektskonto: string; mva_sats: number }[] }) =>
    request<{ id: number; message: string }>("/api/fakturaer", { method: "POST", body: JSON.stringify(payload) }),
  krediterFaktura: (id: number) => request<{ message: string }>(`/api/fakturaer/${id}/krediter`, { method: "POST" }),
  slettFaktura: (id: number) => request<{ message: string }>(`/api/fakturaer/${id}`, { method: "DELETE" }),
  sendFaktura: (id: number) => request<{ message: string }>(`/api/fakturaer/${id}/send`, { method: "POST" }),
  fakturaPdfUrl: (id: number) => `${API_BASE_URL}/api/fakturaer/${id}/pdf`,

  hentApnePoster: (boligId?: number) => request<ApenPost[]>(`/api/apne-poster${boligId ? `?bolig_id=${boligId}` : ""}`),
  registrerInnbetaling: (payload: { bolig_id: number; belop: number; dato: string; beskrivelse: string; faktura_id?: number | null }) =>
    request<{ message: string }>("/api/innbetalinger", { method: "POST", body: JSON.stringify(payload) }),

  hentReskontro: () => request<ReskontroRad[]>("/api/reskontro"),
  hentBalanse: () => request<BalanseRad[]>("/api/balanse"),
  hentResultat: (ar?: number) => request<ResultatRad[]>(ar ? `/api/resultat?ar=${ar}` : "/api/resultat"),
  hentBankavstemming: () => request<BankTransaksjonRad[]>("/api/avstemming/bank"),
  hentReskontroavstemming: () => request<ReskontroAvstemming>("/api/avstemming/reskontro"),

  hentEpostinnstillinger: () => request<EpostInnstillinger>("/api/innstillinger/epost"),
  lagreEpostinnstillinger: (payload: { navn: string; adresse: string; orgnr: string; bankkonto: string; epost_avsender: string; epost_passord: string }) =>
    request<EpostInnstillinger>("/api/innstillinger/epost", { method: "POST", body: JSON.stringify(payload) }),

  lastOppBilag: async (transaksjonId: number, fil: File) => {
    const formData = new FormData();
    formData.append("fil", fil);
    const response = await fetch(`${API_BASE_URL}/api/bilag/${transaksjonId}`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || data.message || `HTTP ${response.status}`);
    }
    return response.json();
  },
  hentBilagForTransaksjon: (transaksjonId: number) => request<Bilag[]>(`/api/bilag/transaksjon/${transaksjonId}`),
  bilagUrl: (bilagId: number) => `${API_BASE_URL}/api/bilag/${bilagId}`,
  hentResultatAr: () => request<number[]>("/api/resultat/ar"),
};
