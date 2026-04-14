"use client";

import { api, EpostInnstillinger } from "@/lib/api";
import { useEffect, useState } from "react";

export default function InnstillingerPage() {
  const [data, setData] = useState<EpostInnstillinger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    navn: "Mitt Sameie",
    adresse: "",
    orgnr: "",
    bankkonto: "",
    epost_avsender: "jcmadsen@gmail.com",
    epost_passord: "",
  });

  useEffect(() => {
    async function load() {
      try {
        const settings = await api.hentEpostinnstillinger();
        setData(settings);
        setForm((current) => ({
          ...current,
          navn: settings.navn,
          adresse: settings.adresse,
          orgnr: settings.orgnr,
          bankkonto: settings.bankkonto,
          epost_avsender: settings.epost_avsender,
        }));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke laste innstillinger");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const saved = await api.lagreEpostinnstillinger(form);
      setData(saved);
      setForm((current) => ({ ...current, epost_passord: "" }));
      setSuccess("Innstillinger lagret");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre innstillinger");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Innstillinger</h1>
        <p className="text-gray-600">Selskapsinformasjon og epostutsending</p>
      </div>

      {error && <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {success && <div className="mb-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Fakturaavsender</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="border border-gray-300 rounded-md px-3 py-2" placeholder="Selskapsnavn" value={form.navn} onChange={(e) => setForm((current) => ({ ...current, navn: e.target.value }))} />
            <input className="border border-gray-300 rounded-md px-3 py-2" placeholder="Org.nr" value={form.orgnr} onChange={(e) => setForm((current) => ({ ...current, orgnr: e.target.value }))} />
            <input className="border border-gray-300 rounded-md px-3 py-2 md:col-span-2" placeholder="Adresse" value={form.adresse} onChange={(e) => setForm((current) => ({ ...current, adresse: e.target.value }))} />
            <input className="border border-gray-300 rounded-md px-3 py-2" placeholder="Bankkonto" value={form.bankkonto} onChange={(e) => setForm((current) => ({ ...current, bankkonto: e.target.value }))} />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Gmail-utsending</h2>
          <div className="space-y-4">
            <input className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Gmail-adresse" value={form.epost_avsender} onChange={(e) => setForm((current) => ({ ...current, epost_avsender: e.target.value }))} />
            <input type="password" className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Gmail App Password" value={form.epost_passord} onChange={(e) => setForm((current) => ({ ...current, epost_passord: e.target.value }))} />
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
              Bruk Gmail App Password, ikke vanlig passord. Nåværende standard avsender er <strong>jcmadsen@gmail.com</strong>.
            </div>
            <div className="text-sm text-gray-600">
              Status: {loading ? "Laster..." : data?.app_passord_satt ? "App-passord er lagret" : "App-passord mangler"}
            </div>
          </div>
        </div>

        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md font-medium transition-colors">
          Lagre innstillinger
        </button>
      </form>
    </div>
  );
}
