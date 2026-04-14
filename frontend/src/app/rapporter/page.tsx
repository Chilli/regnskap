"use client";

import { api, ApenPost, BalanseRad, ResultatRad } from "@/lib/api";
import { useState, useEffect } from "react";

export default function RapporterPage() {
  const [aktivRapport, setAktivRapport] = useState<"balanse" | "reskontro" | "resultat">("balanse");
  const [balanse, setBalanse] = useState<BalanseRad[]>([]);
  const [resultat, setResultat] = useState<ResultatRad[]>([]);
  const [reskontro, setReskontro] = useState<ApenPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tilgjengeligeAr, setTilgjengeligeAr] = useState<number[]>([]);
  const [valgtAr, setValgtAr] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [balanseData, resultatData, reskontroData, arData] = await Promise.all([
          api.hentBalanse(),
          api.hentResultat(valgtAr || undefined),
          api.hentApnePoster(),
          api.hentResultatAr(),
        ]);
        setBalanse(balanseData);
        setResultat(resultatData);
        setReskontro(reskontroData);
        setTilgjengeligeAr(arData);
        if (arData.length > 0 && valgtAr === null) {
          setValgtAr(arData[0]);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke laste rapporter");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [valgtAr]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Rapporter</h1>
        <p className="text-gray-600">Se regnskapsrapporter og analyser</p>
      </div>

      {error && <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Velg rapport</h2>
            </div>
            <nav className="flex flex-col">
              <button
                onClick={() => setAktivRapport("balanse")}
                className={`text-left px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                  aktivRapport === "balanse"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-500"
                    : "text-gray-700 hover:bg-gray-50 border-transparent"
                }`}
              >
                Balanse
              </button>
              <button
                onClick={() => setAktivRapport("reskontro")}
                className={`text-left px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                  aktivRapport === "reskontro"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-500"
                    : "text-gray-700 hover:bg-gray-50 border-transparent"
                }`}
              >
                Reskontro (åpne poster)
              </button>
              <button
                onClick={() => setAktivRapport("resultat")}
                className={`text-left px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                  aktivRapport === "resultat"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-500"
                    : "text-gray-700 hover:bg-gray-50 border-transparent"
                }`}
              >
                Resultat
              </button>
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1">
          {aktivRapport === "balanse" && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Balanse</h2>
                <button className="text-indigo-600 hover:text-indigo-800 font-medium">
                  📥 Eksporter til Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kontokode
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kontonavn
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Saldo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-gray-500">Laster...</td>
                      </tr>
                    ) : balanse.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-gray-500">Ingen data tilgjengelig. Registrer transaksjoner for å se balansen.</td>
                      </tr>
                    ) : (
                      balanse.map((rad) => (
                        <tr key={rad.Kode}>
                          <td className="px-6 py-4 text-sm text-gray-900">{rad.Kode}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{rad.Navn}</td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900">{rad.Saldo.toLocaleString("no-NO")} kr</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aktivRapport === "reskontro" && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Reskontro - Åpne poster</h2>
                <button className="text-indigo-600 hover:text-indigo-800 font-medium">
                  📥 Eksporter til Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Faktura
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bolig
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Forfall
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Beløp
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Betalt
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Restsaldo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Laster...</td>
                      </tr>
                    ) : reskontro.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Ingen åpne poster. Alle fakturaer er betalt! 🎉</td>
                      </tr>
                    ) : (
                      reskontro.map((rad) => (
                        <tr key={rad.id}>
                          <td className="px-6 py-4 text-sm text-gray-900">#{rad.id}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{rad.navn} {rad.seksjonsnummer ? `(s. ${rad.seksjonsnummer})` : ""}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{rad.forfallsdato}</td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900">{rad.total_belop.toLocaleString("no-NO")} kr</td>
                          <td className="px-6 py-4 text-sm text-right text-green-600">{rad.betalt.toLocaleString("no-NO")} kr</td>
                          <td className="px-6 py-4 text-sm text-right font-semibold text-red-600">{rad.restsaldo.toLocaleString("no-NO")} kr</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aktivRapport === "resultat" && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Resultat</h2>
                <div className="flex gap-2">
                  <select
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={valgtAr || ""}
                    onChange={(e) => setValgtAr(Number(e.target.value))}
                  >
                    {tilgjengeligeAr.length === 0 ? (
                      <option>Ingen år med føringer</option>
                    ) : (
                      tilgjengeligeAr.map((ar) => (
                        <option key={ar} value={ar}>
                          {ar}
                        </option>
                      ))
                    )}
                  </select>
                  <button className="text-indigo-600 hover:text-indigo-800 font-medium">
                    📥 Eksporter
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kontokode
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kontonavn
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Beløp
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                        Ingen data tilgjengelig. Registrer inntekter og kostnader for å se resultatet.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
