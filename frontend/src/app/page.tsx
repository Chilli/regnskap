"use client";

import Card from "@/components/Card";
import { api, ApenPost, BalanseRad, Bolig, ReskontroRad } from "@/lib/api";
import { useEffect, useState } from "react";

interface DashboardData {
  reskontro: ReskontroRad[];
  balanse: BalanseRad[];
  apnePoster: ApenPost[];
  boliger: Bolig[];
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [reskontro, balanse, apnePoster, boliger] = await Promise.all([
          api.hentReskontro(),
          api.hentBalanse(),
          api.hentApnePoster(),
          api.hentBoliger(),
        ]);
        setData({ reskontro, balanse, apnePoster, boliger });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke laste dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalUtestaende = data?.reskontro.reduce((sum, r) => sum + r.saldo, 0) || 0;
  const antallApnePoster = data?.apnePoster.length || 0;
  const forfaltBelop = data?.apnePoster
    .filter((post) => new Date(post.forfallsdato) < new Date())
    .reduce((sum, post) => sum + post.restsaldo, 0) || 0;
  const bankinnskudd = data?.balanse.find((rad) => rad.Kode === "1920")?.Saldo || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Oversikt</h1>
        <p className="text-gray-600">Velkommen til Sameie Regnskap</p>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card
          title="Utestående fakturaer"
          value={`${totalUtestaende.toLocaleString("no-NO")} kr`}
          subtitle={`${antallApnePoster} åpne poster`}
        />
        <Card
          title="Forfalt"
          value={`${forfaltBelop.toLocaleString("no-NO")} kr`}
          subtitle={forfaltBelop > 0 ? "Krever oppfølging" : "Ingen forfalt i dag"}
          icon="⚠️"
        />
        <Card
          title="Bankinnskudd"
          value={`${bankinnskudd.toLocaleString("no-NO")} kr`}
          subtitle="Sist oppdatert: i dag"
          icon="🏦"
        />
        <Card
          title="Antall boliger"
          value={data?.boliger.length || 0}
          subtitle="Registrerte i vellaget"
          icon="🏠"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Hurtighandlinger</h2>
          <div className="space-y-3">
            <button className="w-full text-left px-4 py-3 bg-indigo-50 hover:bg-indigo-100 rounded-md text-indigo-700 font-medium transition-colors">
              + Opprett ny faktura
            </button>
            <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-md text-gray-700 font-medium transition-colors">
              Registrer innbetaling
            </button>
            <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-md text-gray-700 font-medium transition-colors">
              Se reskontro
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Siste aktivitet</h2>
          {loading ? (
            <p className="text-gray-500">Laster...</p>
          ) : error ? (
            <p className="text-red-600">Kunne ikke laste aktivitet.</p>
          ) : data && data.apnePoster.length > 0 ? (
            <div className="space-y-3">
              {data.apnePoster.slice(0, 3).map((post) => (
                <div key={post.id} className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <p className="font-medium text-gray-900">Faktura #{post.id}</p>
                    <p className="text-sm text-gray-500">{post.navn} - forfall {post.forfallsdato}</p>
                  </div>
                  <p className="font-semibold text-red-600">{post.restsaldo.toLocaleString("no-NO")} kr</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Ingen aktivitet ennå</p>
          )}
        </div>
      </div>
    </div>
  );
}
