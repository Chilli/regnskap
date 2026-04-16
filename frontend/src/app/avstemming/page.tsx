"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface KontoOversikt {
  kode: string;
  navn: string;
  type: string;
  saldo: number;
  antall_uavstemt: number;
}

interface PosteringRad {
  id: number;
  transaksjon_id: number;
  dato: string;
  beskrivelse: string;
  belop: number;
  avstemt: boolean;
}

interface MatchRad {
  id: number;
  debet_id: number;
  kredit_id: number;
  konto_kode: string;
  matchet_dato: string;
  debet_dato: string;
  debet_beskrivelse: string;
  debet_belop: number;
  kredit_dato: string;
  kredit_beskrivelse: string;
  kredit_belop: number;
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

export default function AvstemmingPage() {
  const [kontoer, setKontoer] = useState<KontoOversikt[]>([]);
  const [valgtKonto, setValgtKonto] = useState<KontoOversikt | null>(null);
  const [debet, setDebet] = useState<PosteringRad[]>([]);
  const [kredit, setKredit] = useState<PosteringRad[]>([]);
  const [historikk, setHistorikk] = useState<MatchRad[]>([]);
  const [valgtDebet, setValgtDebet] = useState<PosteringRad[]>([]);
  const [valgtKredit, setValgtKredit] = useState<PosteringRad[]>([]);
  const [aktivTab, setAktivTab] = useState<"match" | "historikk">("match");
  const [loading, setLoading] = useState(true);
  const [posteringLoading, setPosteringLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [visMatchede, setVisMatchede] = useState(false);
  const [differanseModal, setDifferanseModal] = useState<{
    differanse: number;
    debet: PosteringRad[];
    kredit: PosteringRad[];
    konto: KontoOversikt;
  } | null>(null);
  const router = useRouter();

  const lastKontoer = useCallback(async () => {
    try {
      const data = await apiFetch<KontoOversikt[]>("/api/kontoavstemming");
      setKontoer(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved lasting av kontoer");
    } finally {
      setLoading(false);
    }
  }, []);

  const lastData = useCallback(async (kode: string) => {
    setPosteringLoading(true);
    try {
      const [d, k, h] = await Promise.all([
        apiFetch<PosteringRad[]>(`/api/kontoavstemming/${kode}/poster?side=debet`),
        apiFetch<PosteringRad[]>(`/api/kontoavstemming/${kode}/poster?side=kredit`),
        apiFetch<MatchRad[]>(`/api/kontoavstemming/${kode}/matchhistorikk`),
      ]);
      setDebet(d);
      setKredit(k);
      setHistorikk(h);
      setValgtDebet([]);
      setValgtKredit([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved lasting");
    } finally {
      setPosteringLoading(false);
    }
  }, []);

  useEffect(() => { lastKontoer(); }, [lastKontoer]);

  async function velgKonto(k: KontoOversikt) {
    setValgtKonto(k);
    setSuccess(null);
    setError(null);
    setAktivTab("match");
    await lastData(k.kode);
  }

  async function utforMatch() {
    if (!valgtKonto || valgtDebet.length === 0 || valgtKredit.length === 0) return;
    const par = Math.min(valgtDebet.length, valgtKredit.length);
    try {
      for (let i = 0; i < par; i++) {
        await apiFetch(`/api/kontoavstemming/${valgtKonto.kode}/match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ debet_id: valgtDebet[i].id, kredit_id: valgtKredit[i].id }),
        });
      }
      setSuccess(`Matchet ${par} par.`);
      setError(null);
      await Promise.all([lastData(valgtKonto.kode), lastKontoer()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil ved matching");
    }
  }

  function handleMatch() {
    if (!valgtKonto) return;
    if (differanse !== null && Math.abs(differanse) > 0.01) {
      setDifferanseModal({
        differanse,
        debet: valgtDebet,
        kredit: valgtKredit,
        konto: valgtKonto,
      });
    } else {
      utforMatch();
    }
  }

  function gaTilPosteringMedDifferanse() {
    if (!differanseModal) return;
    const { differanse: diff, debet, kredit, konto } = differanseModal;
    const beskrivelse = `Differansepostering avstemming konto ${konto.kode} — ${konto.navn}`;
    const linjer = [
      { konto_kode: konto.kode, belop: String(-diff) },
      { konto_kode: "", belop: String(diff) },
    ];
    const params = new URLSearchParams({
      beskrivelse,
      linjer: encodeURIComponent(JSON.stringify(linjer)),
    });
    setDifferanseModal(null);
    router.push(`/postering?${params.toString()}`);
  }

  async function reverserMatch(matchId: number) {
    if (!valgtKonto) return;
    try {
      await apiFetch(`/api/kontoavstemming/${valgtKonto.kode}/match/${matchId}`, { method: "DELETE" });
      setSuccess("Match reversert");
      setError(null);
      await Promise.all([lastData(valgtKonto.kode), lastKontoer()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    }
  }

  const fmt = (v: number) => v.toLocaleString("no-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const belopFarge = (v: number) => v >= 0 ? "text-green-700" : "text-red-600";

  const synligDebet = debet.filter((p) => visMatchede || !p.avstemt);
  const synligKredit = kredit.filter((p) => visMatchede || !p.avstemt);
  const par = Math.min(valgtDebet.length, valgtKredit.length);
  const sumDebet = valgtDebet.reduce((s, p) => s + p.belop, 0);
  const sumKredit = valgtKredit.reduce((s, p) => s + p.belop, 0);
  const differanse = valgtDebet.length > 0 && valgtKredit.length > 0 ? sumDebet + sumKredit : null;

  function toggleValg(
    p: PosteringRad,
    valgte: PosteringRad[],
    setValgte: React.Dispatch<React.SetStateAction<PosteringRad[]>>,
    ctrl: boolean
  ) {
    if (p.avstemt) return;
    if (ctrl) {
      setValgte((prev) =>
        prev.find((v) => v.id === p.id) ? prev.filter((v) => v.id !== p.id) : [...prev, p]
      );
    } else {
      setValgte((prev) => (prev.length === 1 && prev[0].id === p.id ? [] : [p]));
    }
  }

  function PosterTabell({ poster, valgte, setValgte, tittel }: {
    poster: PosteringRad[];
    valgte: PosteringRad[];
    setValgte: React.Dispatch<React.SetStateAction<PosteringRad[]>>;
    tittel: string;
  }) {
    const valgteIds = new Set(valgte.map((v) => v.id));
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900 text-sm">{tittel}</h3>
          <div className="flex items-center gap-2">
            {valgte.length > 0 && <span className="text-xs font-semibold text-indigo-600">{valgte.length} valgt</span>}
            <span className="text-xs text-gray-400">{poster.filter(p => !p.avstemt).length} umatchet</span>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[420px]">
          {poster.length === 0 ? (
            <p className="p-6 text-center text-gray-400 text-sm">Ingen poster</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Dato</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Beskrivelse</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">Beløp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {poster.map((p) => (
                  <tr key={p.id}
                    onClick={(e) => toggleValg(p, valgte, setValgte, e.ctrlKey || e.metaKey)}
                    className={`transition-colors ${
                      p.avstemt ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"
                    } ${
                      valgteIds.has(p.id) ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 text-xs">{p.dato}</td>
                    <td className="px-3 py-2.5 text-gray-800 max-w-[160px] truncate" title={p.beskrivelse}>{p.beskrivelse}</td>
                    <td className={`px-3 py-2.5 text-right font-medium whitespace-nowrap ${belopFarge(p.belop)}`}>{fmt(p.belop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontoavstemming</h1>
          <p className="text-gray-600">Match debet mot kredit per konto</p>
        </div>
        <Link href="/bankavstemming" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 px-3 py-1.5 rounded-md">
          → Bankavstemming (CSV)
        </Link>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700">{success}</div>}

      <div className="flex gap-6">
        {/* Venstre: Kontoliste */}
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 text-sm">Kontoer</h2>
            </div>
            {loading ? <p className="p-4 text-sm text-gray-500">Laster...</p> : (
              <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {kontoer.map((k) => (
                  <li key={k.kode}>
                    <button onClick={() => velgKonto(k)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${valgtKonto?.kode === k.kode ? "bg-indigo-50 border-l-4 border-indigo-500" : "border-l-4 border-transparent"}`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="min-w-0">
                          <span className="text-xs font-mono text-gray-400">{k.kode}</span>
                          <p className="text-sm font-medium text-gray-900 truncate">{k.navn}</p>
                        </div>
                        {k.antall_uavstemt > 0 && (
                          <span className="ml-2 shrink-0 bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{k.antall_uavstemt}</span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 font-medium ${belopFarge(k.saldo)}`}>{fmt(k.saldo)} kr</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Høyre: Matching */}
        <div className="flex-1 min-w-0">
          {!valgtKonto ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex items-center justify-center h-64">
              <p className="text-gray-400">Velg en konto til venstre</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="border-b border-gray-200 mb-4 flex items-center justify-between">
                <nav className="flex space-x-6">
                  {(["match", "historikk"] as const).map((tab) => (
                    <button key={tab} onClick={() => setAktivTab(tab)}
                      className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${aktivTab === tab ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                      {tab === "match" ? `Match poster` : `Historikk (${historikk.length})`}
                    </button>
                  ))}
                </nav>
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer mb-2">
                  <input type="checkbox" checked={visMatchede} onChange={(e) => setVisMatchede(e.target.checked)} className="rounded" />
                  Vis matchede
                </label>
              </div>

              {aktivTab === "match" && (
                <>
                  {/* Match-bekreftelsesbanner */}
                  {valgtDebet.length > 0 && valgtKredit.length > 0 && (
                    <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-indigo-900 min-w-0 flex-1">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span><span className="font-semibold">Debet:</span> {valgtDebet.length} post{valgtDebet.length > 1 ? "er" : ""} — sum <span className={`font-bold ${belopFarge(sumDebet)}`}>{fmt(sumDebet)}</span></span>
                          <span className="text-indigo-300">↔</span>
                          <span><span className="font-semibold">Kredit:</span> {valgtKredit.length} post{valgtKredit.length > 1 ? "er" : ""} — sum <span className={`font-bold ${belopFarge(sumKredit)}`}>{fmt(sumKredit)}</span></span>
                        </div>
                        {differanse !== null && Math.abs(differanse) > 0.01 && (
                          <span className="text-orange-600 font-medium text-xs">⚠ Differanse: {fmt(differanse)}</span>
                        )}
                        {valgtDebet.length !== valgtKredit.length && (
                          <span className="ml-2 text-orange-600 font-medium text-xs">⚠ Ulikt antall — matcher de første {par} parene</span>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={handleMatch} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm font-medium">Bekreft {par} match{par > 1 ? "er" : ""}</button>
                        <button onClick={() => { setValgtDebet([]); setValgtKredit([]); }} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium">Avbryt</button>
                      </div>
                    </div>
                  )}

                  {posteringLoading ? <p className="text-center py-12 text-gray-400">Laster...</p> : (
                    <div className="grid grid-cols-2 gap-4">
                      <PosterTabell
                        poster={synligDebet}
                        valgte={valgtDebet}
                        setValgte={setValgtDebet}
                        tittel="Debet (inn på konto)"
                      />
                      <PosterTabell
                        poster={synligKredit}
                        valgte={valgtKredit}
                        setValgte={setValgtKredit}
                        tittel="Kredit (ut fra konto)"
                      />
                    </div>
                  )}
                  <p className="mt-3 text-xs text-gray-400">Klikk for å velge én post. Hold <kbd className="bg-gray-100 border border-gray-300 rounded px-1">Ctrl</kbd> (Mac: <kbd className="bg-gray-100 border border-gray-300 rounded px-1">⌘</kbd>) og klikk for å velge flere — bekreft alle matchene på én gang.</p>
                </>
              )}

              {aktivTab === "historikk" && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Debet dato</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Debet beskrivelse</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debet beløp</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kredit dato</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kredit beskrivelse</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kredit beløp</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Matchet</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {historikk.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Ingen matchinger ennå.</td></tr>
                      ) : historikk.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{m.debet_dato}</td>
                          <td className="px-4 py-3 text-gray-800 max-w-[140px] truncate text-sm" title={m.debet_beskrivelse}>{m.debet_beskrivelse}</td>
                          <td className={`px-4 py-3 text-right font-medium whitespace-nowrap text-sm ${belopFarge(m.debet_belop)}`}>{fmt(m.debet_belop)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{m.kredit_dato}</td>
                          <td className="px-4 py-3 text-gray-800 max-w-[140px] truncate text-sm" title={m.kredit_beskrivelse}>{m.kredit_beskrivelse}</td>
                          <td className={`px-4 py-3 text-right font-medium whitespace-nowrap text-sm ${belopFarge(m.kredit_belop)}`}>{fmt(m.kredit_belop)}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-400">{m.matchet_dato.slice(0, 10)}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => reverserMatch(m.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Reverser</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Differanse-modal */}
      {differanseModal && (() => {
        const { differanse: diff, debet, kredit, konto } = differanseModal;
        const sumD = debet.reduce((s, p) => s + p.belop, 0);
        const sumK = kredit.reduce((s, p) => s + p.belop, 0);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Differanse på {fmt(Math.abs(diff))} kr</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Debet og kredit balanserer ikke. Hva vil du gjøre?</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-5 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Debet ({debet.length} post{debet.length > 1 ? "er" : ""})</span>
                  <span className={`font-semibold ${belopFarge(sumD)}`}>{fmt(sumD)} kr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Kredit ({kredit.length} post{kredit.length > 1 ? "er" : ""})</span>
                  <span className={`font-semibold ${belopFarge(sumK)}`}>{fmt(sumK)} kr</span>
                </div>
                <div className="border-t border-gray-200 pt-1 flex justify-between font-semibold">
                  <span className="text-gray-700">Differanse</span>
                  <span className="text-orange-600">{fmt(Math.abs(diff))} kr</span>
                </div>
                <p className="text-xs text-gray-400 pt-1">
                  Konto: {konto.kode} — {konto.navn}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={gaTilPosteringMedDifferanse}
                  className="w-full flex items-center justify-between bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-lg font-medium text-sm transition-colors"
                >
                  <span>Opprett differansepostering</span>
                  <span className="text-indigo-200 text-xs">→ Åpner Postering med beløp forhåndsutfylt</span>
                </button>
                <button
                  onClick={() => { setDifferanseModal(null); utforMatch(); }}
                  className="w-full bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg font-medium text-sm transition-colors text-left"
                >
                  Match likevel — ignorer differansen
                </button>
                <button
                  onClick={() => setDifferanseModal(null)}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-medium text-sm transition-colors"
                >
                  Avbryt — gå tilbake og endre utvalg
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
