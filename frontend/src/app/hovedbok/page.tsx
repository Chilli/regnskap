"use client";

import { useEffect, useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type Rad = {
  transaksjon_id: number;
  bilagsnr: string;
  dato: string;
  beskrivelse: string;
  faktura_ref: number | null;
  postering_id: number;
  konto_kode: string;
  konto_navn: string;
  konto_type: string;
  belop: number;
  kunde_navn: string | null;
};

type Konto = { kode: string; navn: string; type: string };

const ar_options = [2023, 2024, 2025, 2026].filter(a => a <= new Date().getFullYear() + 1);

export default function HovedbokPage() {
  const [rader, setRader] = useState<Rad[]>([]);
  const [kontoer, setKontoer] = useState<Konto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sok, setSok] = useState("");
  const [konto, setKonto] = useState("");
  const [ar, setAr] = useState(new Date().getFullYear());
  const [fraDato, setFraDato] = useState("");
  const [tilDato, setTilDato] = useState("");
  const [bilagsnr, setBilagsnr] = useState("");

  useEffect(() => {
    fetch(`${API}/api/kontoplan`)
      .then(r => r.json())
      .then(setKontoer)
      .catch(() => {});
  }, []);

  const hent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sok) params.set("sok", sok);
      if (konto) params.set("konto", konto);
      if (ar && !fraDato && !tilDato) params.set("ar", String(ar));
      if (fraDato) params.set("fra_dato", fraDato);
      if (tilDato) params.set("til_dato", tilDato);
      if (bilagsnr) params.set("bilagsnr", bilagsnr);
      const res = await fetch(`${API}/api/hovedbok?${params}`);
      if (!res.ok) throw new Error(await res.text());
      setRader(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feil");
    } finally {
      setLoading(false);
    }
  }, [sok, konto, ar, fraDato, tilDato, bilagsnr]);

  useEffect(() => { hent(); }, [hent]);

  // Grupper på bilagsnr for visning
  const grupper = rader.reduce<Record<string, Rad[]>>((acc, r) => {
    const key = r.bilagsnr || String(r.transaksjon_id);
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const totalDebet = rader.filter(r => r.belop > 0).reduce((s, r) => s + r.belop, 0);
  const totalKredit = rader.filter(r => r.belop < 0).reduce((s, r) => s + r.belop, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hovedbok</h1>
        <p className="text-gray-600">Alle posteringsbilag med bilagsnummer</p>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Fritekst</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Navn, konto, beskrivelse..."
              value={sok}
              onChange={e => setSok(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Konto</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={konto}
              onChange={e => setKonto(e.target.value)}
            >
              <option value="">Alle kontoer</option>
              {kontoer.map(k => (
                <option key={k.kode} value={k.kode}>{k.kode} – {k.navn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bilagsnr</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="2025-001"
              value={bilagsnr}
              onChange={e => setBilagsnr(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">År</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={ar}
              onChange={e => { setAr(Number(e.target.value)); setFraDato(""); setTilDato(""); }}
              disabled={!!(fraDato || tilDato)}
            >
              {ar_options.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fra dato</label>
            <input type="date" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={fraDato} onChange={e => setFraDato(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Til dato</label>
            <input type="date" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={tilDato} onChange={e => setTilDato(e.target.value)} />
          </div>
        </div>
        {(fraDato || tilDato) && (
          <button onClick={() => { setFraDato(""); setTilDato(""); }} className="mt-2 text-xs text-indigo-600 hover:underline">
            Nullstill datofilter
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}

      {/* Tabell */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Bilagsnr</th>
              <th className="px-4 py-3 text-left">Dato</th>
              <th className="px-4 py-3 text-left">Beskrivelse</th>
              <th className="px-4 py-3 text-left">Konto</th>
              <th className="px-4 py-3 text-left">Motpart</th>
              <th className="px-4 py-3 text-right">Debet</th>
              <th className="px-4 py-3 text-right">Kredit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Laster...</td></tr>
            ) : rader.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Ingen posteringer funnet.</td></tr>
            ) : Object.entries(grupper).map(([bilag, linjer]) => (
              linjer.map((r, i) => (
                <tr key={r.postering_id} className={i === 0 ? "border-t-2 border-gray-200" : ""}>
                  <td className="px-4 py-2 font-mono text-indigo-700 font-medium whitespace-nowrap">
                    {i === 0 ? (
                      <span className="bg-indigo-50 px-2 py-0.5 rounded text-xs">{r.bilagsnr || bilag}</span>
                    ) : ""}
                  </td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{i === 0 ? r.dato : ""}</td>
                  <td className="px-4 py-2 text-gray-700 max-w-xs truncate">
                    {i === 0 ? (
                      <span>
                        {r.beskrivelse}
                        {r.faktura_ref && (
                          <span className="ml-2 text-xs text-gray-400">Fak.#{r.faktura_ref}</span>
                        )}
                      </span>
                    ) : ""}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="font-mono text-gray-700">{r.konto_kode}</span>
                    <span className="ml-1 text-gray-400 text-xs">{r.konto_navn}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{r.kunde_navn || ""}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {r.belop > 0 ? <span className="text-gray-900">{r.belop.toLocaleString("no-NO", { minimumFractionDigits: 2 })}</span> : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {r.belop < 0 ? <span className="text-gray-900">{Math.abs(r.belop).toLocaleString("no-NO", { minimumFractionDigits: 2 })}</span> : ""}
                  </td>
                </tr>
              ))
            ))}
          </tbody>
          {rader.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-300 text-xs font-semibold">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-gray-500">{rader.length} posteringer · {Object.keys(grupper).length} bilag</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">{totalDebet.toLocaleString("no-NO", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900">{Math.abs(totalKredit).toLocaleString("no-NO", { minimumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
