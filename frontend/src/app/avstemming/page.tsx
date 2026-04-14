"use client";

import { useState, useEffect } from "react";
import { api, BankTransaksjonRad, ReskontroAvstemming } from "@/lib/api";

export default function AvstemmingPage() {
  const [aktivTab, setAktivTab] = useState<"bank" | "reskontro">("bank");
  const [bank, setBank] = useState<BankTransaksjonRad[]>([]);
  const [reskontro, setReskontro] = useState<ReskontroAvstemming | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [bankData, reskontroData] = await Promise.all([
          api.hentBankavstemming(),
          api.hentReskontroavstemming(),
        ]);
        setBank(bankData);
        setReskontro(reskontroData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke laste avstemming");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Avstemming</h1>
        <p className="text-gray-700">Bankavstemming og reskontroavstemming</p>
      </div>

      {error && <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setAktivTab("bank")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              aktivTab === "bank"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Bankavstemming
          </button>
          <button
            onClick={() => setAktivTab("reskontro")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              aktivTab === "reskontro"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Reskontroavstemming
          </button>
        </nav>
      </div>

      {aktivTab === "bank" && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-800">Ubekreftede banktransaksjoner</h2>
            <p className="text-sm text-gray-700">
              Konto 1920 - Bankinnskudd
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Dato
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Beskrivelse
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Beløp
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Avstemt
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-700">Laster...</td>
                  </tr>
                ) : bank.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-700">Ingen ubekreftede transaksjoner. Alt er avstemt! 🎉</td>
                  </tr>
                ) : (
                  bank.map((rad) => (
                    <tr key={rad.id}>
                      <td className="px-6 py-4 text-sm text-gray-600">{rad.dato}</td>
                      <td className="px-6 py-4 text-sm text-gray-800">{rad.beskrivelse}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-800">{rad.belop.toLocaleString("no-NO")} kr</td>
                      <td className="px-6 py-4 text-sm text-center text-amber-600">Åpen</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 p-4 bg-green-50 rounded-lg">
            <p className="text-green-800 font-medium">
              {bank.length === 0 ? "✅ Alt er avstemt! Ingen åpne poster på bankkonto." : `⚠️ ${bank.length} banktransaksjoner gjenstår å avstemme.`}
            </p>
          </div>
        </div>
      )}

      {aktivTab === "reskontro" && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-800">Reskontroavstemming</h2>
            <p className="text-sm text-gray-700">
              Konto 1500 - Kundefordringer
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700 font-medium">Hovedbok (konto 1500)</p>
              <p className="text-2xl font-bold text-gray-800">{(reskontro?.hovedbok_saldo || 0).toLocaleString("no-NO")} kr</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700 font-medium">Sum åpne poster</p>
              <p className="text-2xl font-bold text-gray-800">{(reskontro?.apne_poster_sum || 0).toLocaleString("no-NO")} kr</p>
            </div>
          </div>

          <div className={`p-4 rounded-lg ${(reskontro?.differanse || 0) === 0 ? "bg-green-50" : "bg-yellow-50"}`}>
            <p className={(reskontro?.differanse || 0) === 0 ? "text-green-900 font-semibold" : "text-yellow-900 font-semibold"}>
              {(reskontro?.differanse || 0) === 0 ? `✅ Reskontro stemmer! Differanse: ${(reskontro?.differanse || 0).toLocaleString("no-NO")} kr` : `⚠️ Reskontro avviker. Differanse: ${(reskontro?.differanse || 0).toLocaleString("no-NO")} kr`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
