"use client";

import { api, EpostInnstillinger } from "@/lib/api";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type Aarsavslutning = { avslutninger: { beskrivelse: string; tidspunkt: string }[]; lasedato: string | null };

export default function InnstillingerPage() {
  const [data, setData] = useState<EpostInnstillinger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    navn: "Mitt Sameie", adresse: "", orgnr: "", bankkonto: "",
    epost_avsender: "jcmadsen@gmail.com", epost_passord: "",
  });
  const [aarsavslutning, setAarsavslutning] = useState<Aarsavslutning | null>(null);
  const [valgtAr, setValgtAr] = useState(new Date().getFullYear() - 1);
  const [kjorer, setKjorer] = useState(false);
  const [bekreft, setBekreft] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [settings, aa] = await Promise.all([
          api.hentEpostinnstillinger(),
          fetch(`${API}/api/aarsavslutning`).then(r => r.json()),
        ]);
        setData(settings);
        setAarsavslutning(aa);
        setForm(c => ({ ...c, navn: settings.navn, adresse: settings.adresse, orgnr: settings.orgnr, bankkonto: settings.bankkonto, epost_avsender: settings.epost_avsender }));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke laste innstillinger");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const saved = await api.lagreEpostinnstillinger(form);
      setData(saved);
      setForm(c => ({ ...c, epost_passord: "" }));
      setSuccess("Innstillinger lagret");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre innstillinger");
    }
  }

  async function handleAarsavslutning() {
    setKjorer(true);
    setBekreft(false);
    try {
      const res = await fetch(`${API}/api/aarsavslutning`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ar: valgtAr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Feil");
      const aa = await fetch(`${API}/api/aarsavslutning`).then(r => r.json());
      setAarsavslutning(aa);
      setSuccess(data.message + (data.arsresultat != null ? ` Årsresultat: ${data.arsresultat.toLocaleString("no-NO")} kr.` : ""));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil under årsavslutning");
    } finally {
      setKjorer(false);
    }
  }

  const erLast = (ar: number) => aarsavslutning?.lasedato && aarsavslutning.lasedato >= `${ar}-12-31`;
  const arOptions = [2023, 2024, 2025, 2026].filter(a => a <= new Date().getFullYear());

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Innstillinger</h1>
        <p className="text-gray-600">Selskapsinformasjon, epostutsending og periodestyring</p>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}
      {success && <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700 text-sm">{success}</div>}

      {/* Selskapsinfo + epost */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Fakturaavsender</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Selskapsnavn" value={form.navn} onChange={e => setForm(c => ({ ...c, navn: e.target.value }))} />
            <input className="border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Org.nr" value={form.orgnr} onChange={e => setForm(c => ({ ...c, orgnr: e.target.value }))} />
            <input className="border border-gray-300 rounded-md px-3 py-2 text-sm md:col-span-2" placeholder="Adresse" value={form.adresse} onChange={e => setForm(c => ({ ...c, adresse: e.target.value }))} />
            <input className="border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Bankkonto" value={form.bankkonto} onChange={e => setForm(c => ({ ...c, bankkonto: e.target.value }))} />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Gmail-utsending</h2>
          <div className="space-y-3">
            <input className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Gmail-adresse" value={form.epost_avsender} onChange={e => setForm(c => ({ ...c, epost_avsender: e.target.value }))} />
            <input type="password" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Gmail App Password" value={form.epost_passord} onChange={e => setForm(c => ({ ...c, epost_passord: e.target.value }))} />
            <p className="text-xs text-gray-500">Status: {loading ? "Laster..." : data?.app_passord_satt ? "✅ App-passord lagret" : "⚠️ App-passord mangler"}</p>
          </div>
        </div>
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-md text-sm font-medium">Lagre innstillinger</button>
      </form>

      {/* Årsavslutning */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Årsavslutning</h2>
        <p className="text-sm text-gray-500 mb-5">
          Overfører årsresultatet til egenkapital og låser perioden for videre redigering.
          Balansekontoene videreføres automatisk som inngående balanse neste år.
        </p>

        {aarsavslutning?.lasedato && (
          <div className="mb-4 rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            🔒 Låst t.o.m <strong>{aarsavslutning.lasedato}</strong>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Velg år</label>
            <div className="flex gap-2">
              {arOptions.map(a => (
                <button key={a} type="button"
                  onClick={() => { setValgtAr(a); setBekreft(false); }}
                  className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                    erLast(a) ? "border-gray-200 bg-gray-100 text-gray-400 cursor-default" :
                    valgtAr === a ? "border-indigo-500 bg-indigo-500 text-white" :
                    "border-gray-200 text-gray-600 hover:border-indigo-300"
                  }`}
                  disabled={!!erLast(a)}>
                  {a}{erLast(a) ? " 🔒" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!erLast(valgtAr) && !bekreft && (
          <button onClick={() => setBekreft(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-md text-sm font-medium">
            Gjennomfør årsavslutning {valgtAr}
          </button>
        )}

        {bekreft && (
          <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-900 mb-1">⚠️ Er du sikker?</p>
            <p className="text-sm text-orange-800 mb-4">
              Årsresultatet for <strong>{valgtAr}</strong> overføres til egenkapital og perioden låses permanent.
              Dette kan ikke angres.
            </p>
            <div className="flex gap-3">
              <button onClick={handleAarsavslutning} disabled={kjorer}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium">
                {kjorer ? "Kjører..." : `Ja, lås ${valgtAr}`}
              </button>
              <button onClick={() => setBekreft(false)} className="text-gray-600 hover:text-gray-900 text-sm px-4 py-2">Avbryt</button>
            </div>
          </div>
        )}

        {aarsavslutning?.avslutninger && aarsavslutning.avslutninger.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Historikk</h3>
            <div className="space-y-1">
              {aarsavslutning.avslutninger.map((a, i) => (
                <div key={i} className="text-xs text-gray-500 flex gap-4">
                  <span className="text-gray-400">{a.tidspunkt?.slice(0, 10)}</span>
                  <span>{a.beskrivelse}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
