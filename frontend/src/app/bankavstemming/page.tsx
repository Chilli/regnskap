"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface BankpostRad {
  id: number;
  dato: string;
  tekst: string;
  belop: number;
  import_dato: string;
  periode: string;
  matchet: boolean;
}

interface HovedbokPostRad {
  id: number;
  dato: string;
  beskrivelse: string;
  belop: number;
  transaksjon_id: number;
  matchet: boolean;
}

interface MatchingRad {
  id: number;
  bankpost_id: number;
  postering_id: number;
  matchet_dato: string;
  bank_dato: string;
  bank_tekst: string;
  bank_belop: number;
  hb_dato: string;
  hb_beskrivelse: string;
  hb_belop: number;
}

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export default function BankavstemmingPage() {
  const [aktivTab, setAktivTab] = useState<"match" | "historikk">("match");
  const [perioder, setPerioder] = useState<string[]>([]);
  const [valgtPeriode, setValgtPeriode] = useState<string>("");
  const [bankposter, setBankposter] = useState<BankpostRad[]>([]);
  const [hovedbok, setHovedbokPoster] = useState<HovedbokPostRad[]>([]);
  const [historikk, setHistorikk] = useState<MatchingRad[]>([]);
  const [valgtBank, setValgtBank] = useState<BankpostRad | null>(null);
  const [valgtHb, setValgtHb] = useState<HovedbokPostRad | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const lastData = useCallback(async (periode: string) => {
    setLoading(true);
    setError(null);
    try {
      const p = periode ? `?periode=${periode}` : "";
      const [bp, hb, hist] = await Promise.all([
        apiFetch<BankpostRad[]>(`/api/bank/poster${p}`),
        apiFetch<HovedbokPostRad[]>(`/api/bank/hovedbok${p}`),
        apiFetch<MatchingRad[]>(`/api/bank/historikk${p}`),
      ]);
      setBankposter(bp);
      setHovedbokPoster(hb);
      setHistorikk(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved lasting");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    apiFetch<string[]>("/api/bank/perioder").then((p) => {
      setPerioder(p);
      if (p.length > 0) {
        setValgtPeriode(p[0]);
        lastData(p[0]);
      } else {
        lastData("");
      }
    }).catch(() => lastData(""));
  }, [lastData]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0];
    if (!fil) return;
    setImportLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("fil", fil);
      const res = await fetch(`${API}/api/bank/importer`, { method: "POST", body: formData });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Importfeil"); }
      const data = await res.json();
      setSuccess(`Importerte ${data.importert} nye bankposter`);
      // Refresh periods and data
      const p = await apiFetch<string[]>("/api/bank/perioder");
      setPerioder(p);
      const periode = p.length > 0 ? p[0] : "";
      setValgtPeriode(periode);
      await lastData(periode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Importfeil");
    } finally {
      setImportLoading(false);
      e.target.value = "";
    }
  }

  async function handleMatch() {
    if (!valgtBank || !valgtHb) return;
    try {
      await apiFetch("/api/bank/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankpost_id: valgtBank.id, postering_id: valgtHb.id }),
      });
      setSuccess(`Matchet: ${valgtBank.tekst} ↔ ${valgtHb.beskrivelse}`);
      setValgtBank(null);
      setValgtHb(null);
      setError(null);
      await lastData(valgtPeriode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved matching");
    }
  }

  async function handleReverser(matchingId: number) {
    try {
      await apiFetch(`/api/bank/match/${matchingId}`, { method: "DELETE" });
      setSuccess("Matching reversert");
      setError(null);
      await lastData(valgtPeriode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke reversere");
    }
  }

  const umatchedBank = bankposter.filter((b) => !b.matchet);
  const umatchedHb = hovedbok.filter((h) => !h.matchet);

  const formatBelop = (v: number) =>
    v.toLocaleString("no-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const belopFarge = (v: number) => v >= 0 ? "text-green-700" : "text-red-600";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bankavstemming</h1>
          <p className="text-gray-600">Match bankposter mot hovedbok (konto 1920)</p>
        </div>
        <div className="flex items-center gap-3">
          {perioder.length > 0 && (
            <select
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={valgtPeriode}
              onChange={(e) => { setValgtPeriode(e.target.value); lastData(e.target.value); }}
            >
              <option value="">Alle perioder</option>
              {perioder.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <label className={`cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors ${importLoading ? "opacity-50" : ""}`}>
            {importLoading ? "Importerer..." : "Last opp CSV (DNB)"}
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importLoading} />
          </label>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700">{success}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {(["match", "historikk"] as const).map((tab) => (
            <button key={tab} onClick={() => setAktivTab(tab)}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${aktivTab === tab ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab === "match" ? "Match poster" : `Historikk (${historikk.length})`}
            </button>
          ))}
        </nav>
      </div>

      {aktivTab === "match" && (
        <>
          {/* Match-knapp */}
          {valgtBank && valgtHb && (
            <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-indigo-900">
                <span className="font-semibold">Bank:</span> {valgtBank.dato} — {valgtBank.tekst} — <span className={`font-bold ${belopFarge(valgtBank.belop)}`}>{formatBelop(valgtBank.belop)} kr</span>
                <span className="mx-3 text-indigo-400">↔</span>
                <span className="font-semibold">Hovedbok:</span> {valgtHb.dato} — {valgtHb.beskrivelse} — <span className={`font-bold ${belopFarge(valgtHb.belop)}`}>{formatBelop(valgtHb.belop)} kr</span>
                {Math.abs(valgtBank.belop - valgtHb.belop) > 0.01 && (
                  <span className="ml-3 text-orange-600 font-medium">⚠ Differanse: {formatBelop(valgtBank.belop - valgtHb.belop)} kr</span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleMatch} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium">Bekreft match</button>
                <button onClick={() => { setValgtBank(null); setValgtHb(null); }} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium">Avbryt</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bankposter */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <h2 className="font-semibold text-gray-900">Bankposter fra CSV</h2>
                <span className="text-xs text-gray-500">{umatchedBank.length} umatchet / {bankposter.length} totalt</span>
              </div>
              <div className="overflow-y-auto max-h-[500px]">
                {loading ? <p className="p-4 text-gray-500 text-sm">Laster...</p> : bankposter.length === 0 ? (
                  <p className="p-6 text-center text-gray-400 text-sm">Ingen bankposter. Last opp en CSV-fil fra DNB.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Dato</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Tekst</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">Beløp</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bankposter.map((b) => (
                        <tr key={b.id}
                          onClick={() => !b.matchet && setValgtBank(valgtBank?.id === b.id ? null : b)}
                          className={`transition-colors ${b.matchet ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"} ${valgtBank?.id === b.id ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400" : ""}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{b.dato}</td>
                          <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate" title={b.tekst}>{b.tekst}</td>
                          <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${belopFarge(b.belop)}`}>{formatBelop(b.belop)}</td>
                          <td className="px-3 py-2 text-right">
                            {b.matchet ? <span className="text-xs text-green-600 font-medium">✓</span> : valgtBank?.id === b.id ? <span className="text-xs text-indigo-600">Valgt</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Hovedbokposter */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <h2 className="font-semibold text-gray-900">Åpne poster i hovedbok (1920)</h2>
                <span className="text-xs text-gray-500">{umatchedHb.length} umatchet / {hovedbok.length} totalt</span>
              </div>
              <div className="overflow-y-auto max-h-[500px]">
                {loading ? <p className="p-4 text-gray-500 text-sm">Laster...</p> : hovedbok.length === 0 ? (
                  <p className="p-6 text-center text-gray-400 text-sm">Ingen posteringer på konto 1920 for valgt periode.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Dato</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Beskrivelse</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">Beløp</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {hovedbok.map((h) => (
                        <tr key={h.id}
                          onClick={() => !h.matchet && setValgtHb(valgtHb?.id === h.id ? null : h)}
                          className={`transition-colors ${h.matchet ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"} ${valgtHb?.id === h.id ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400" : ""}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{h.dato}</td>
                          <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate" title={h.beskrivelse}>{h.beskrivelse}</td>
                          <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${belopFarge(h.belop)}`}>{formatBelop(h.belop)}</td>
                          <td className="px-3 py-2 text-right">
                            {h.matchet ? <span className="text-xs text-green-600 font-medium">✓</span> : valgtHb?.id === h.id ? <span className="text-xs text-indigo-600">Valgt</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Klikk én post i hvert vindu, så bekrefter du matchingen med knappen som dukker opp.
          </div>
        </>
      )}

      {aktivTab === "historikk" && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank dato</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank tekst</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Bank beløp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HB dato</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HB beskrivelse</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">HB beløp</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Matchet</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {historikk.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Ingen matchinger ennå.</td></tr>
              ) : (
                historikk.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.bank_dato}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-[160px] truncate" title={m.bank_tekst}>{m.bank_tekst}</td>
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${belopFarge(m.bank_belop)}`}>{formatBelop(m.bank_belop)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.hb_dato}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-[160px] truncate" title={m.hb_beskrivelse}>{m.hb_beskrivelse}</td>
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${belopFarge(m.hb_belop)}`}>{formatBelop(m.hb_belop)}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">{m.matchet_dato.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleReverser(m.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Reverser</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
