"use client";

import { useState, useEffect, useCallback } from "react";

interface Konto {
  kode: string;
  navn: string;
  type: string;
}

const TYPER = ["Eiendel", "Gjeld", "Egenkapital", "Inntekt", "Kostnad"];
const TYPE_FARGE: Record<string, string> = {
  Eiendel: "bg-blue-100 text-blue-700",
  Gjeld: "bg-red-100 text-red-700",
  Egenkapital: "bg-purple-100 text-purple-700",
  Inntekt: "bg-green-100 text-green-700",
  Kostnad: "bg-orange-100 text-orange-700",
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const GRUPPE_NAVN: Record<string, string> = {
  "1": "1000–1999  Eiendeler",
  "2": "2000–2999  Egenkapital og gjeld",
  "3": "3000–3999  Salgsinntekter",
  "4": "4000–4999  Varekostnader",
  "5": "5000–5999  Lønn og personal",
  "6": "6000–6999  Driftskostnader",
  "7": "7000–7999  Salg, reklame og andre kostnader",
  "8": "8000–8999  Finans og skatt",
};

export default function KontoplanPage() {
  const [kontoer, setKontoer] = useState<Konto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [soek, setSoek] = useState("");
  const [filterType, setFilterType] = useState<string>("alle");
  const [redigerer, setRedigerer] = useState<Konto | null>(null);
  const [redigerForm, setRedigerForm] = useState({ navn: "", type: "" });
  const [nyForm, setNyForm] = useState({ kode: "", navn: "", type: "Kostnad" });
  const [visNy, setVisNy] = useState(false);
  const [importerer, setImporterer] = useState(false);

  const lastKontoer = useCallback(async () => {
    try {
      const data = await apiFetch<Konto[]>("/api/kontoplan");
      setKontoer(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { lastKontoer(); }, [lastKontoer]);

  async function handleImporter() {
    setImporterer(true);
    try {
      const res = await apiFetch<{ message: string }>("/api/kontoplan/importer-standard", { method: "POST" });
      setSuccess(res.message);
      await lastKontoer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    } finally {
      setImporterer(false);
    }
  }

  async function handleOpprett(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/kontoplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nyForm),
      });
      setSuccess(`Konto ${nyForm.kode} opprettet`);
      setNyForm({ kode: "", navn: "", type: "Kostnad" });
      setVisNy(false);
      await lastKontoer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    }
  }

  async function handleLagre(kode: string) {
    try {
      await apiFetch(`/api/kontoplan/${kode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(redigerForm),
      });
      setSuccess(`Konto ${kode} oppdatert`);
      setRedigerer(null);
      await lastKontoer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    }
  }

  async function handleSlett(kode: string, navn: string) {
    if (!confirm(`Slette konto ${kode} — ${navn}?`)) return;
    try {
      await apiFetch(`/api/kontoplan/${kode}`, { method: "DELETE" });
      setSuccess(`Konto ${kode} slettet`);
      await lastKontoer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    }
  }

  const filtrerte = kontoer.filter((k) => {
    const matchSoek = soek === "" || k.kode.includes(soek) || k.navn.toLowerCase().includes(soek.toLowerCase());
    const matchType = filterType === "alle" || k.type === filterType;
    return matchSoek && matchType;
  });

  // Grupper etter første siffer
  const gruppert: Record<string, Konto[]> = {};
  for (const k of filtrerte) {
    const g = k.kode[0];
    if (!gruppert[g]) gruppert[g] = [];
    gruppert[g].push(k);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontoplan</h1>
          <p className="text-gray-500 text-sm mt-1">NS 4102 — {kontoer.length} kontoer</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImporter}
            disabled={importerer}
            className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {importerer ? "Importerer..." : "Importer standard NS 4102"}
          </button>
          <button
            onClick={() => { setVisNy(true); setError(null); setSuccess(null); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md text-sm font-medium"
          >
            + Ny konto
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700 text-sm">{success}</div>}

      {/* Ny konto-skjema */}
      {visNy && (
        <form onSubmit={handleOpprett} className="mb-6 bg-white rounded-lg shadow-sm border border-indigo-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Ny konto</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kontokode</label>
              <input
                required pattern="[0-9]{4}"
                placeholder="F.eks. 6310"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                value={nyForm.kode}
                onChange={(e) => setNyForm((c) => ({ ...c, kode: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Navn</label>
              <input
                required
                placeholder="Kontonavn"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={nyForm.navn}
                onChange={(e) => setNyForm((c) => ({ ...c, navn: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={nyForm.type}
                onChange={(e) => setNyForm((c) => ({ ...c, type: e.target.value }))}
              >
                {TYPER.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium">Opprett</button>
            <button type="button" onClick={() => setVisNy(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm">Avbryt</button>
          </div>
        </form>
      )}

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <input
          placeholder="Søk på kode eller navn..."
          className="border border-gray-300 rounded-md px-3 py-2 text-sm flex-1 max-w-xs"
          value={soek}
          onChange={(e) => setSoek(e.target.value)}
        />
        <select
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="alle">Alle typer</option>
          {TYPER.map((t) => <option key={t}>{t}</option>)}
        </select>
        <span className="text-sm text-gray-400 self-center">{filtrerte.length} kontoer</span>
      </div>

      {/* Kontotabell gruppert */}
      {loading ? (
        <p className="text-center py-12 text-gray-400">Laster...</p>
      ) : (
        <div className="space-y-4">
          {Object.keys(gruppert).sort().map((g) => (
            <div key={g} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{GRUPPE_NAVN[g] ?? `${g}000-serien`}</h3>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {gruppert[g].map((k) => (
                    <tr key={k.kode} className="hover:bg-gray-50 group">
                      {redigerer?.kode === k.kode ? (
                        <>
                          <td className="px-4 py-2 font-mono text-gray-500 w-20">{k.kode}</td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full border border-indigo-300 rounded px-2 py-1 text-sm"
                              value={redigerForm.navn}
                              onChange={(e) => setRedigerForm((c) => ({ ...c, navn: e.target.value }))}
                              autoFocus
                            />
                          </td>
                          <td className="px-2 py-2 w-36">
                            <select
                              className="w-full border border-indigo-300 rounded px-2 py-1 text-sm"
                              value={redigerForm.type}
                              onChange={(e) => setRedigerForm((c) => ({ ...c, type: e.target.value }))}
                            >
                              {TYPER.map((t) => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-right w-32">
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => handleLagre(k.kode)} className="text-xs text-green-600 hover:text-green-800 font-medium">Lagre</button>
                              <button onClick={() => setRedigerer(null)} className="text-xs text-gray-400 hover:text-gray-600">Avbryt</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 font-mono text-gray-400 w-20">{k.kode}</td>
                          <td className="px-2 py-2.5 text-gray-900">{k.navn}</td>
                          <td className="px-2 py-2.5 w-36">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_FARGE[k.type] ?? "bg-gray-100 text-gray-600"}`}>{k.type}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right w-32 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex gap-3 justify-end">
                              <button
                                onClick={() => { setRedigerer(k); setRedigerForm({ navn: k.navn, type: k.type }); setError(null); setSuccess(null); }}
                                className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                              >
                                Rediger
                              </button>
                              <button
                                onClick={() => handleSlett(k.kode, k.navn)}
                                className="text-xs text-red-400 hover:text-red-600"
                              >
                                Slett
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
