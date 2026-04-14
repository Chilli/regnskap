"use client";

import { api, Bolig } from "@/lib/api";
import { useEffect, useState } from "react";

export default function BoligerPage() {
  const [boliger, setBoliger] = useState<Bolig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    navn: "",
    epost: "",
    telefon: "",
    adresse: "",
    seksjonsnummer: "",
    sameiebrok: 0,
    areal: 0,
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await api.hentBoliger();
        setBoliger(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke laste boliger");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const bolig = await api.opprettBolig(form);
      setBoliger((current) => [...current, bolig]);
      setForm({ navn: "", epost: "", telefon: "", adresse: "", seksjonsnummer: "", sameiebrok: 0, areal: 0 });
      setShowForm(false);
      setSuccess(`Bolig ${bolig.navn} lagret`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre bolig");
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.slettBolig(id);
      setBoliger((current) => current.filter((bolig) => bolig.id !== id));
      setSuccess(`Bolig ${id} slettet`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke slette bolig");
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Boliger og seksjoner</h1>
          <p className="text-gray-600">Administrer sameiets boliger</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          + Registrer ny bolig
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Registrer ny bolig</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Navn på bolig/eier *
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Ola Nordmann"
                value={form.navn}
                onChange={(e) => setForm((current) => ({ ...current, navn: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-post *
              </label>
              <input
                type="email"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="ola@example.com"
                value={form.epost}
                onChange={(e) => setForm((current) => ({ ...current, epost: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seksjonsnummer
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="101"
                value={form.seksjonsnummer}
                onChange={(e) => setForm((current) => ({ ...current, seksjonsnummer: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefon
              </label>
              <input
                type="tel"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="99887766"
                value={form.telefon}
                onChange={(e) => setForm((current) => ({ ...current, telefon: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sameiebrøk (promille)
              </label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="50"
                value={form.sameiebrok}
                onChange={(e) => setForm((current) => ({ ...current, sameiebrok: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Areal (kvm)
              </label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="75"
                value={form.areal}
                onChange={(e) => setForm((current) => ({ ...current, areal: Number(e.target.value) }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Storgata 1, 0101 Oslo"
                value={form.adresse}
                onChange={(e) => setForm((current) => ({ ...current, adresse: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                Lagre bolig
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Seksjon
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Navn
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Kontakt
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sameiebrøk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Areal
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Handlinger
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  Laster...
                </td>
              </tr>
            ) : boliger.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Ingen boliger registrert ennå. Klikk "Registrer ny bolig" for å komme i gang.
                </td>
              </tr>
            ) : (
              boliger.map((bolig) => (
                <tr key={bolig.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {bolig.seksjonsnummer || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bolig.navn}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {bolig.epost}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bolig.sameiebrok > 0 ? `${bolig.sameiebrok} ‰` : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bolig.areal > 0 ? `${bolig.areal} kvm` : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-red-600 hover:text-red-900" onClick={() => handleDelete(bolig.id)}>
                      Slett
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
