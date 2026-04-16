"use client";

import { api, Bolig, Faktura } from "@/lib/api";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type Avtale = {
  id: number;
  kunde_id: number;
  kunde_navn: string;
  seksjonsnummer: string;
  frekvens: number;
  neste_forfall: string;
  belop: number;
  beskrivelse: string;
  inntektskonto: string;
  mva_sats: number;
  aktiv: boolean;
};

const FREKVENS_LABEL: Record<number, string> = { 1: "Månedlig", 2: "Annenhver måned", 3: "Kvartal", 6: "Halvårlig", 12: "Årlig" };
const FREKVENS_VALG = [
  { verdi: 1, label: "Månedlig" },
  { verdi: 2, label: "Annenhver måned" },
  { verdi: 3, label: "Kvartal (hver 3. mnd)" },
  { verdi: 6, label: "Halvårlig (hver 6. mnd)" },
  { verdi: 12, label: "Årlig" },
];

export default function FakturaPage() {
  const [fane, setFane] = useState<"fakturaer" | "avtaler">("fakturaer");
  const [fakturaer, setFakturaer] = useState<Faktura[]>([]);
  const [boliger, setBoliger] = useState<Bolig[]>([]);
  const [avtaler, setAvtaler] = useState<Avtale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fakturaForm, setFakturaForm] = useState({ bolig_id: 0, beskrivelse: "Felleskostnader", belop: 5000, inntektskonto: "3600", mva_sats: 0 });
  const [avtaleForm, setAvtaleForm] = useState({ bolig_id: 0, alle_boliger: true, beskrivelse: "Felleskostnader", belop: 500, frekvens: 1, start_dato: new Date().toISOString().slice(0, 10), inntektskonto: "3600", mva_sats: 0 });
  const [kjorDato, setKjorDato] = useState(new Date().toISOString().slice(0, 10));
  const [kjorer, setKjorer] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [fakturaData, boligData, avtaleData] = await Promise.all([
          api.hentFakturaer(),
          api.hentBoliger(),
          fetch(`${API}/api/avtaler`).then(r => r.json()),
        ]);
        setFakturaer(fakturaData);
        setBoliger(boligData);
        setAvtaler(avtaleData);
        if (boligData.length > 0) {
          setFakturaForm(c => ({ ...c, bolig_id: c.bolig_id || boligData[0].id }));
          setAvtaleForm(c => ({ ...c, bolig_id: c.bolig_id || boligData[0].id }));
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

  async function refreshFakturaer() {
    setFakturaer(await api.hentFakturaer());
  }

  async function refreshAvtaler() {
    setAvtaler(await fetch(`${API}/api/avtaler`).then(r => r.json()));
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await api.opprettFaktura({
        bolig_id: fakturaForm.bolig_id,
        linjer: [{ beskrivelse: fakturaForm.beskrivelse, belop: fakturaForm.belop, inntektskonto: fakturaForm.inntektskonto, mva_sats: fakturaForm.mva_sats }],
      });
      await refreshFakturaer();
      setSuccess(`Faktura #${result.id} opprettet`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke opprette faktura");
    }
  }

  async function handleOpprettAvtale(e: React.FormEvent) {
    e.preventDefault();
    try {
      const boliger_ids = avtaleForm.alle_boliger ? boliger.map(b => b.id) : [avtaleForm.bolig_id];
      await Promise.all(boliger_ids.map(id =>
        fetch(`${API}/api/avtaler`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...avtaleForm, bolig_id: id }),
        })
      ));
      await refreshAvtaler();
      setSuccess(`${boliger_ids.length === 1 ? "Avtale" : `${boliger_ids.length} avtaler`} opprettet`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke opprette avtale");
    }
  }

  async function handleSlettAvtale(id: number) {
    await fetch(`${API}/api/avtaler/${id}`, { method: "DELETE" });
    await refreshAvtaler();
    setSuccess("Avtale slettet");
  }

  async function handleKjorMassefakturering() {
    setKjorer(true);
    try {
      const res = await fetch(`${API}/api/avtaler/kjor`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dato: kjorDato }),
      });
      const data = await res.json();
      await Promise.all([refreshFakturaer(), refreshAvtaler()]);
      setSuccess(data.message);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil under massefakturering");
    } finally {
      setKjorer(false);
    }
  }

  async function handleCredit(id: number) {
    try {
      await api.krediterFaktura(id);
      await refreshFakturaer();
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

  const statusBadge = (status: string) => {
    const s: Record<string, string> = { OPEN: "bg-yellow-100 text-yellow-800", PAID: "bg-green-100 text-green-800", CREDITED: "bg-gray-100 text-gray-800" };
    const l: Record<string, string> = { OPEN: "Åpen", PAID: "Betalt", CREDITED: "Kreditert" };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${s[status] || "bg-gray-100"}`}>{l[status] || status}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faktura</h1>
          <p className="text-gray-600">Enkeltfakturaer og faste betalingsavtaler</p>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700 text-sm">{success}</div>}

      {/* Faner */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([["fakturaer", "Fakturaer"], ["avtaler", "Faste avtaler"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFane(id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${fane === id ? "bg-white border border-b-white border-gray-200 text-indigo-600 -mb-px" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
            {id === "avtaler" && avtaler.length > 0 && (
              <span className="ml-2 bg-indigo-100 text-indigo-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{avtaler.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ---- FAKTURAER-FANE ---- */}
      {fane === "fakturaer" && (
        <div className="space-y-6">
          <div className="max-w-lg">
            <form onSubmit={handleCreateInvoice} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Ny enkeltfaktura</h2>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={fakturaForm.bolig_id} onChange={e => setFakturaForm(c => ({ ...c, bolig_id: Number(e.target.value) }))}>
                {boliger.map(b => <option key={b.id} value={b.id}>{b.navn}{b.seksjonsnummer ? ` (${b.seksjonsnummer})` : ""}</option>)}
              </select>
              <input className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={fakturaForm.beskrivelse} onChange={e => setFakturaForm(c => ({ ...c, beskrivelse: e.target.value }))} placeholder="Beskrivelse" />
              <input type="number" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={fakturaForm.belop} onChange={e => setFakturaForm(c => ({ ...c, belop: Number(e.target.value) }))} placeholder="Beløp (kr)" />
              <div className="grid grid-cols-2 gap-3">
                <select className="border border-gray-300 rounded-md px-3 py-2 text-sm" value={fakturaForm.inntektskonto} onChange={e => setFakturaForm(c => ({ ...c, inntektskonto: e.target.value }))}>
                  <option value="3600">3600 - Felleskost</option>
                  <option value="3900">3900 - Annen inntekt</option>
                </select>
                <select className="border border-gray-300 rounded-md px-3 py-2 text-sm" value={fakturaForm.mva_sats} onChange={e => setFakturaForm(c => ({ ...c, mva_sats: Number(e.target.value) }))}>
                  <option value={0}>0% MVA</option>
                  <option value={25}>25% MVA</option>
                </select>
              </div>
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium">Opprett faktura</button>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["#", "Bolig", "Dato", "Forfall", "Beløp", "Betalt", "Rest", "Status", ""].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${["Beløp","Betalt","Rest"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Laster...</td></tr>
                ) : fakturaer.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Ingen fakturaer ennå.</td></tr>
                ) : fakturaer.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">#{f.id}</td>
                    <td className="px-4 py-3 text-gray-900">{f.kunde_navn}{f.seksjonsnummer && <span className="text-gray-400 ml-1 text-xs">({f.seksjonsnummer})</span>}</td>
                    <td className="px-4 py-3 text-gray-500">{f.dato}</td>
                    <td className="px-4 py-3 text-gray-500">{f.forfallsdato}</td>
                    <td className="px-4 py-3 text-right">{f.total_belop.toLocaleString("no-NO")} kr</td>
                    <td className="px-4 py-3 text-right text-green-600">{f.betalt > 0 ? `${f.betalt.toLocaleString("no-NO")} kr` : "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{f.restsaldo > 0.01 ? `${f.restsaldo.toLocaleString("no-NO")} kr` : "—"}</td>
                    <td className="px-4 py-3">{statusBadge(f.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 justify-end">
                        <a className="text-indigo-600 hover:text-indigo-900 text-xs" href={api.fakturaPdfUrl(f.id)} target="_blank" rel="noreferrer">PDF</a>
                        <button className="text-gray-600 hover:text-black text-xs" onClick={() => handleSend(f.id)}>Send</button>
                        {f.status !== "CREDITED" && <button className="text-red-600 hover:text-red-900 text-xs" onClick={() => handleCredit(f.id)}>Krediter</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- FASTE AVTALER-FANE ---- */}
      {fane === "avtaler" && (
        <div className="space-y-6">

          {/* Ny avtale-skjema */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Ny fast faktureringsavtale</h2>
            <p className="text-sm text-gray-500 mb-5">Sett opp gjentakende fakturering — fungerer som en kalenderregel for betaling.</p>
            <form onSubmit={handleOpprettAvtale} className="space-y-4">

              {/* Hvem */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Hvem skal faktureres?</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center gap-2 border-2 rounded-lg px-4 py-3 cursor-pointer transition-colors ${avtaleForm.alle_boliger ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="scope" checked={avtaleForm.alle_boliger} onChange={() => setAvtaleForm(c => ({ ...c, alle_boliger: true }))} className="text-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Alle boliger</p>
                      <p className="text-xs text-gray-500">{boliger.length} boliger faktureres likt</p>
                    </div>
                  </label>
                  <label className={`flex-1 flex items-center gap-2 border-2 rounded-lg px-4 py-3 cursor-pointer transition-colors ${!avtaleForm.alle_boliger ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="scope" checked={!avtaleForm.alle_boliger} onChange={() => setAvtaleForm(c => ({ ...c, alle_boliger: false }))} className="text-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Én bolig</p>
                      <p className="text-xs text-gray-500">Velg én spesifikk</p>
                    </div>
                  </label>
                </div>
                {!avtaleForm.alle_boliger && (
                  <select className="mt-3 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={avtaleForm.bolig_id} onChange={e => setAvtaleForm(c => ({ ...c, bolig_id: Number(e.target.value) }))}>
                    {boliger.map(b => <option key={b.id} value={b.id}>{b.navn}{b.seksjonsnummer ? ` (${b.seksjonsnummer})` : ""}</option>)}
                  </select>
                )}
              </div>

              {/* Frekvens */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Hvor ofte?</label>
                <div className="flex flex-wrap gap-2">
                  {FREKVENS_VALG.map(f => (
                    <button key={f.verdi} type="button"
                      onClick={() => setAvtaleForm(c => ({ ...c, frekvens: f.verdi }))}
                      className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${avtaleForm.frekvens === f.verdi ? "border-indigo-500 bg-indigo-500 text-white" : "border-gray-200 text-gray-600 hover:border-indigo-300"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Beløp, beskrivelse, startdato */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Beløp per bolig (kr)</label>
                  <input type="number" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={avtaleForm.belop} onChange={e => setAvtaleForm(c => ({ ...c, belop: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Beskrivelse på faktura</label>
                  <input className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={avtaleForm.beskrivelse} onChange={e => setAvtaleForm(c => ({ ...c, beskrivelse: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Første faktura (dato)</label>
                  <input type="date" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={avtaleForm.start_dato} onChange={e => setAvtaleForm(c => ({ ...c, start_dato: e.target.value }))} />
                </div>
              </div>

              {/* Oppsummering */}
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 text-sm text-indigo-800">
                <strong>Oppsummering:</strong> {avtaleForm.alle_boliger ? `Alle ${boliger.length} boliger` : "1 bolig"} faktureres{" "}
                <strong>{FREKVENS_LABEL[avtaleForm.frekvens]?.toLowerCase()}</strong> med{" "}
                <strong>{avtaleForm.belop.toLocaleString("no-NO")} kr</strong> fra{" "}
                <strong>{avtaleForm.start_dato}</strong>
                {avtaleForm.alle_boliger && boliger.length > 0 && (
                  <span className="ml-1">· Total per runde: <strong>{(avtaleForm.belop * boliger.length).toLocaleString("no-NO")} kr</strong></span>
                )}
              </div>

              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-md text-sm font-medium">
                Opprett avtale{avtaleForm.alle_boliger && boliger.length > 1 ? ` for alle ${boliger.length} boliger` : ""}
              </button>
            </form>
          </div>

          {/* Kjør massefakturering */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Kjør fakturering</h2>
            <p className="text-sm text-gray-500 mb-4">
              Genererer fakturaer for alle avtaler som forfaller på eller før valgt dato. Kjør typisk på 1. hver måned.
            </p>
            <div className="flex items-center gap-3">
              <input type="date" className="border border-gray-300 rounded-md px-3 py-2 text-sm" value={kjorDato} onChange={e => setKjorDato(e.target.value)} />
              <button onClick={handleKjorMassefakturering} disabled={kjorer}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium">
                {kjorer ? "Kjører..." : "Generer fakturaer nå"}
              </button>
            </div>
          </div>

          {/* Aktive avtaler */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Aktive avtaler ({avtaler.length})</h2>
            </div>
            {avtaler.length === 0 ? (
              <p className="px-6 py-8 text-center text-gray-400 text-sm">Ingen aktive avtaler. Opprett en ovenfor.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bolig</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beskrivelse</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frekvens</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Beløp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Neste faktura</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {avtaler.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.kunde_navn}{a.seksjonsnummer && <span className="text-gray-400 text-xs ml-1">({a.seksjonsnummer})</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{a.beskrivelse}</td>
                      <td className="px-4 py-3">
                        <span className="bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-1 rounded-full">{FREKVENS_LABEL[a.frekvens] || `${a.frekvens} mnd`}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{a.belop.toLocaleString("no-NO")} kr</td>
                      <td className="px-4 py-3 text-gray-600">{a.neste_forfall}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleSlettAvtale(a.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Slett</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
