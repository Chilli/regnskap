"use client";

import { api, Bolig } from "@/lib/api";
import { Fragment, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const tomForm = { navn: "", epost: "", telefon: "", adresse: "", seksjonsnummer: "", sameiebrok: 0, areal: 0 };

export default function BoligerPage() {
  const [boliger, setBoliger] = useState<Bolig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [redigerBolig, setRedigerBolig] = useState<Bolig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState(tomForm);
  const [editForm, setEditForm] = useState(tomForm);

  useEffect(() => {
    async function load() {
      try {
        setBoliger(await api.hentBoliger());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke laste boliger");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const bolig = await api.opprettBolig(form);
      setBoliger(c => [...c, bolig]);
      setForm(tomForm);
      setShowForm(false);
      setSuccess(`${bolig.navn} lagt til`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre bolig");
    }
  }

  function startRediger(bolig: Bolig) {
    setRedigerBolig(bolig);
    setEditForm({ navn: bolig.navn, epost: bolig.epost, telefon: bolig.telefon, adresse: bolig.adresse, seksjonsnummer: bolig.seksjonsnummer, sameiebrok: bolig.sameiebrok, areal: bolig.areal });
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!redigerBolig) return;
    try {
      const res = await fetch(`${API}/api/boliger/${redigerBolig.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const oppdatert: Bolig = await res.json();
      setBoliger(c => c.map(b => b.id === oppdatert.id ? oppdatert : b));
      setRedigerBolig(null);
      setSuccess(`${oppdatert.navn} oppdatert`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke oppdatere bolig");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Sikker på at du vil slette denne boligen?")) return;
    try {
      await api.slettBolig(id);
      setBoliger(c => c.filter(b => b.id !== id));
      setSuccess("Bolig slettet");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke slette bolig");
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent";

  function BoligForm({ values, onChange, onSubmit, submitLabel, onCancel }: {
    values: typeof tomForm;
    onChange: (v: typeof tomForm) => void;
    onSubmit: (e: React.FormEvent) => void;
    submitLabel: string;
    onCancel: () => void;
  }) {
    return (
      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Navn *</label>
          <input className={inputCls} required value={values.navn} onChange={e => onChange({ ...values, navn: e.target.value })} placeholder="Ola Nordmann" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">E-post *</label>
          <input type="email" className={inputCls} required value={values.epost} onChange={e => onChange({ ...values, epost: e.target.value })} placeholder="ola@example.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
          <input type="tel" className={inputCls} value={values.telefon} onChange={e => onChange({ ...values, telefon: e.target.value })} placeholder="99887766" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Adresse</label>
          <input className={inputCls} value={values.adresse} onChange={e => onChange({ ...values, adresse: e.target.value })} placeholder="Mileveien 1" />
        </div>
        <div className="md:col-span-2 flex gap-3 pt-2">
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-md text-sm font-medium">{submitLabel}</button>
          <button type="button" onClick={onCancel} className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm">Avbryt</button>
        </div>
      </form>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Boliger</h1>
          <p className="text-gray-600">{boliger.length} registrerte husstander i vellaget</p>
        </div>
        {!showForm && !redigerBolig && (
          <button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            + Legg til bolig
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700 text-sm">{success}</div>}

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-indigo-100 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Ny bolig</h2>
          <BoligForm values={form} onChange={setForm} onSubmit={handleSubmit} submitLabel="Legg til" onCancel={() => { setShowForm(false); setForm(tomForm); }} />
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Navn</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Adresse</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-post</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telefon</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Handlinger</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Laster...</td></tr>
            ) : boliger.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Ingen boliger ennå.</td></tr>
            ) : boliger.map(bolig => (
              <Fragment key={bolig.id}>
                <tr className={`hover:bg-gray-50 ${redigerBolig?.id === bolig.id ? "bg-indigo-50" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{bolig.navn}</td>
                  <td className="px-4 py-3 text-gray-600">{bolig.adresse || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{bolig.epost}</td>
                  <td className="px-4 py-3 text-gray-500">{bolig.telefon || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => redigerBolig?.id === bolig.id ? setRedigerBolig(null) : startRediger(bolig)}
                        className="text-indigo-600 hover:text-indigo-900 font-medium">
                        {redigerBolig?.id === bolig.id ? "Avbryt" : "Rediger"}
                      </button>
                      <button onClick={() => handleDelete(bolig.id)} className="text-red-500 hover:text-red-700">Slett</button>
                    </div>
                  </td>
                </tr>
                {redigerBolig?.id === bolig.id && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 bg-indigo-50 border-b border-indigo-100">
                      <BoligForm values={editForm} onChange={setEditForm} onSubmit={handleUpdate} submitLabel="Lagre endringer" onCancel={() => setRedigerBolig(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
