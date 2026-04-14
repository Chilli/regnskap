"use client";

import { api, ApenPost, Bolig, Faktura } from "@/lib/api";
import { useEffect, useState } from "react";

export default function FakturaPage() {
  const [fakturaer, setFakturaer] = useState<Faktura[]>([]);
  const [apnePoster, setApnePoster] = useState<ApenPost[]>([]);
  const [boliger, setBoliger] = useState<Bolig[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"alle" | "apne">("alle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fakturaForm, setFakturaForm] = useState({ bolig_id: 0, beskrivelse: "Felleskostnader", belop: 5000, inntektskonto: "3000", mva_sats: 0 });
  const [betalingForm, setBetalingForm] = useState({ bolig_id: 0, faktura_id: 0, belop: 0, dato: new Date().toISOString().slice(0, 10), beskrivelse: "Innbetaling faktura" });
  const [bilagFil, setBilagFil] = useState<File | null>(null);
  const [sisteTransaksjonId, setSisteTransaksjonId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [fakturaData, apneData, boligData] = await Promise.all([
          api.hentFakturaer(),
          api.hentApnePoster(),
          api.hentBoliger(),
        ]);
        setFakturaer(fakturaData);
        setApnePoster(apneData);
        setBoliger(boligData);
        if (boligData.length > 0) {
          setFakturaForm((current) => ({ ...current, bolig_id: current.bolig_id || boligData[0].id }));
          setBetalingForm((current) => ({ ...current, bolig_id: current.bolig_id || boligData[0].id }));
        }
        if (apneData.length > 0) {
          setBetalingForm((current) => ({ ...current, faktura_id: current.faktura_id || apneData[0].id, belop: current.belop || apneData[0].restsaldo }));
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunne ikke laste fakturadata");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function refreshData() {
    const [fakturaData, apneData] = await Promise.all([api.hentFakturaer(), api.hentApnePoster()]);
    setFakturaer(fakturaData);
    setApnePoster(apneData);
  }

  async function handleCreateInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await api.opprettFaktura({
        bolig_id: fakturaForm.bolig_id,
        linjer: [{ beskrivelse: fakturaForm.beskrivelse, belop: fakturaForm.belop, inntektskonto: fakturaForm.inntektskonto, mva_sats: fakturaForm.mva_sats }],
      });
      await refreshData();
      setSuccess(`Faktura #${result.id} opprettet`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke opprette faktura");
    }
  }

  async function handleRegisterPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await api.registrerInnbetaling({
        bolig_id: betalingForm.bolig_id,
        faktura_id: betalingForm.faktura_id || null,
        belop: betalingForm.belop,
        dato: betalingForm.dato,
        beskrivelse: betalingForm.beskrivelse,
      });
      setSisteTransaksjonId((result as any).transaksjon_id);
      
      if (bilagFil && (result as any).transaksjon_id) {
        await api.lastOppBilag((result as any).transaksjon_id, bilagFil);
        setBilagFil(null);
      }
      
      await refreshData();
      setSuccess("Innbetaling registrert" + (bilagFil ? " med bilag" : ""));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke registrere innbetaling");
    }
  }

  async function handleCredit(id: number) {
    try {
      await api.krediterFaktura(id);
      await refreshData();
      setSuccess(`Faktura #${id} kreditert`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke kredittere faktura");
    }
  }

  async function handleSend(id: number) {
    try {
      const result = await api.sendFaktura(id);
      setSuccess(result.message);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke sende faktura");
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      OPEN: "bg-yellow-100 text-yellow-800",
      PAID: "bg-green-100 text-green-800",
      CREDITED: "bg-gray-100 text-gray-800",
    };
    const labels: Record<string, string> = {
      OPEN: "Åpen",
      PAID: "Betalt",
      CREDITED: "Kreditert",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100"}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faktura</h1>
          <p className="text-gray-600">Oversikt over fakturaer og innbetalinger</p>
        </div>
      </div>

      {error && <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {success && <div className="mb-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <form onSubmit={handleCreateInvoice} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Ny faktura</h2>
          <select className="w-full border border-gray-300 rounded-md px-3 py-2" value={fakturaForm.bolig_id} onChange={(e) => setFakturaForm((current) => ({ ...current, bolig_id: Number(e.target.value) }))}>
            {boliger.map((bolig) => <option key={bolig.id} value={bolig.id}>{bolig.navn} {bolig.seksjonsnummer ? `(seksjon ${bolig.seksjonsnummer})` : ""}</option>)}
          </select>
          <input className="w-full border border-gray-300 rounded-md px-3 py-2" value={fakturaForm.beskrivelse} onChange={(e) => setFakturaForm((current) => ({ ...current, beskrivelse: e.target.value }))} placeholder="Beskrivelse" />
          <input type="number" className="w-full border border-gray-300 rounded-md px-3 py-2" value={fakturaForm.belop} onChange={(e) => setFakturaForm((current) => ({ ...current, belop: Number(e.target.value) }))} placeholder="Beløp" />
          <div className="grid grid-cols-2 gap-4">
            <select className="w-full border border-gray-300 rounded-md px-3 py-2" value={fakturaForm.inntektskonto} onChange={(e) => setFakturaForm((current) => ({ ...current, inntektskonto: e.target.value }))}>
              <option value="3000">3000 - Felleskost</option>
              <option value="3600">3600 - Leie</option>
            </select>
            <select className="w-full border border-gray-300 rounded-md px-3 py-2" value={fakturaForm.mva_sats} onChange={(e) => setFakturaForm((current) => ({ ...current, mva_sats: Number(e.target.value) }))}>
              <option value={0}>0% MVA</option>
              <option value={25}>25% MVA</option>
              <option value={15}>15% MVA</option>
            </select>
          </div>
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-medium transition-colors">Opprett faktura</button>
        </form>

        <form onSubmit={handleRegisterPayment} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Registrer innbetaling</h2>
          <select className="w-full border border-gray-300 rounded-md px-3 py-2" value={betalingForm.bolig_id} onChange={(e) => setBetalingForm((current) => ({ ...current, bolig_id: Number(e.target.value) }))}>
            {boliger.map((bolig) => <option key={bolig.id} value={bolig.id}>{bolig.navn}</option>)}
          </select>
          <select className="w-full border border-gray-300 rounded-md px-3 py-2" value={betalingForm.faktura_id} onChange={(e) => {
            const fakturaId = Number(e.target.value);
            const valgt = apnePoster.find((post) => post.id === fakturaId);
            setBetalingForm((current) => ({ ...current, faktura_id: fakturaId, belop: valgt?.restsaldo || current.belop }));
          }}>
            <option value={0}>Uten fakturakobling</option>
            {apnePoster.map((post) => <option key={post.id} value={post.id}>Faktura #{post.id} - {post.navn} - rest {post.restsaldo.toLocaleString("no-NO")} kr</option>)}
          </select>
          <div className="grid grid-cols-2 gap-4">
            <input type="date" className="w-full border border-gray-300 rounded-md px-3 py-2" value={betalingForm.dato} onChange={(e) => setBetalingForm((current) => ({ ...current, dato: e.target.value }))} />
            <input type="number" className="w-full border border-gray-300 rounded-md px-3 py-2" value={betalingForm.belop} onChange={(e) => setBetalingForm((current) => ({ ...current, belop: Number(e.target.value) }))} placeholder="Beløp" />
          </div>
          <input className="w-full border border-gray-300 rounded-md px-3 py-2" value={betalingForm.beskrivelse} onChange={(e) => setBetalingForm((current) => ({ ...current, beskrivelse: e.target.value }))} placeholder="Beskrivelse" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bilag (valgfritt)</label>
            <input
              type="file"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              onChange={(e) => setBilagFil(e.target.files?.[0] || null)}
            />
          </div>
          <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-md font-medium transition-colors">Registrer innbetaling</button>
        </form>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab("alle")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "alle"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Alle fakturaer
          </button>
          <button
            onClick={() => setActiveTab("apne")}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "apne"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Åpne poster
          </button>
        </nav>
      </div>

      {activeTab === "alle" ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Faktura #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bolig
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dato
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
                  Rest
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Handlinger
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    Laster...
                  </td>
                </tr>
              ) : fakturaer.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    Ingen fakturaer registrert ennå.
                  </td>
                </tr>
              ) : (
                fakturaer.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{f.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {f.kunde_navn}
                      {f.seksjonsnummer && (
                        <span className="text-gray-500 ml-1">(s. {f.seksjonsnummer})</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {f.dato}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {f.forfallsdato}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {f.total_belop.toLocaleString("no-NO")} kr
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                      {f.betalt > 0 ? `${f.betalt.toLocaleString("no-NO")} kr` : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      {f.restsaldo > 0.01 ? `${f.restsaldo.toLocaleString("no-NO")} kr` : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(f.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center gap-3">
                        <a className="text-indigo-600 hover:text-indigo-900" href={api.fakturaPdfUrl(f.id)} target="_blank" rel="noreferrer">PDF</a>
                        <button className="text-gray-700 hover:text-black" onClick={() => handleSend(f.id)}>Send</button>
                        {f.status !== "CREDITED" && <button className="text-red-600 hover:text-red-900" onClick={() => handleCredit(f.id)}>Krediter</button>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Faktura #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bolig
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Forfall
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Betalt
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Restsaldo
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Handling
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {apnePoster.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Ingen åpne poster. Alle fakturaer er betalt! 🎉
                  </td>
                </tr>
              ) : (
                apnePoster.map((post) => (
                  <tr key={post.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{post.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {post.navn}
                      {post.seksjonsnummer && (
                        <span className="text-gray-500 ml-1">(s. {post.seksjonsnummer})</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {post.forfallsdato}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {post.total_belop.toLocaleString("no-NO")} kr
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                      {post.betalt > 0 ? `${post.betalt.toLocaleString("no-NO")} kr` : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600 text-right">
                      {post.restsaldo.toLocaleString("no-NO")} kr
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button className="text-indigo-600 hover:text-indigo-900 font-medium" onClick={() => {
                        setBetalingForm((current) => ({
                          ...current,
                          faktura_id: post.id,
                          belop: post.restsaldo,
                        }));
                        setActiveTab("alle");
                      }}>
                        Registrer betaling
                      </button>
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
