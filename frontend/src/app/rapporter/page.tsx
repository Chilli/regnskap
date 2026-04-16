"use client";

import { api, ApenPost, BalanseRad } from "@/lib/api";
import { useState, useEffect } from "react";

interface ResultatLinje { kode: string; navn: string; saldo: number; }
interface ResultatGruppe { linjer: ResultatLinje[]; sum: number; }
interface ResultatOppstilling {
  ar: number | null;
  driftsinntekter: ResultatGruppe;
  driftskostnader: ResultatGruppe;
  driftsresultat: number;
  finansinntekter: ResultatGruppe;
  finanskostnader: ResultatGruppe;
  netto_finans: number;
  arsresultat: number;
}

interface RF1140Oppgave {
  bolig_id: number; navn: string; seksjonsnummer: string; epost: string;
  sameierbrok: number; andel_pst: number;
  inntekter: number; kostnader: number; formue: number; gjeld: number;
}
interface RF1140Data {
  ar: number | null; frist: string; opplysningsplikt: boolean; antall_seksjoner: number;
  sameiets_totaler: { renteinntekter: number; rentekostnader: number; bank_formue: number; langsiktig_gjeld: number; };
  oppgaver: RF1140Oppgave[];
}

interface ArsregnskapLinje { kode: string; navn: string; belop: number; }
interface ArsregnskapGruppe { linjer: ArsregnskapLinje[]; sum: number; }
interface ArsregnskapNote { tittel: string; tekst: string; sameiere?: { navn: string; seksjonsnummer: string; sameierbrok: number; areal: number; }[]; }
interface ArsregnskapData {
  ar: number | null;
  resultatregnskap: { driftsinntekter: ArsregnskapGruppe; driftskostnader: ArsregnskapGruppe; driftsresultat: number; finansinntekter: ArsregnskapGruppe; finanskostnader: ArsregnskapGruppe; arsresultat: number; };
  balanse: { eiendeler: { anleggsmidler: ArsregnskapGruppe; omloepsmidler: ArsregnskapGruppe; sum: number; }; gjeld_og_egenkapital: { egenkapital: ArsregnskapGruppe; langsiktig_gjeld: ArsregnskapGruppe; kortsiktig_gjeld: ArsregnskapGruppe; sum: number; }; };
  noter: ArsregnskapNote[];
}

interface SameiebrøkBolig { id: number; navn: string; seksjonsnummer: string; sameierbrok: number; areal: number; andel_pst: number; }
interface SameiebrøkData { antall: number; total_brok: number; total_areal: number; lik_fordeling: boolean; boliger: SameiebrøkBolig[]; }

interface Nokkeltal {
  driftsinntekter: number; driftskostnader: number; driftsresultat: number; arsresultat: number;
  driftsmargin_pst: number | null; nettoresultatmargin_pst: number | null;
  likviditetsgrad: number | null; egenkapitalandel_pst: number | null; gjeldgrad: number | null;
  omloepsmidler: number; kortsiktig_gjeld: number; egenkapital: number; totale_eiendeler: number;
}
interface Kommentar { kategori: string; nivaa: string; tekst: string; }
interface AnalyseData { ar: number | null; nokkeltal: Nokkeltal; kommentarer: Kommentar[]; }

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function RapporterPage() {
  const [aktivRapport, setAktivRapport] = useState<"balanse" | "reskontro" | "resultat" | "analyse" | "rf1140" | "arsregnskap" | "sameiebrøk">("balanse");
  const [balanse, setBalanse] = useState<BalanseRad[]>([]);
  const [oppstilling, setOppstilling] = useState<ResultatOppstilling | null>(null);
  const [analyse, setAnalyse] = useState<AnalyseData | null>(null);
  const [rf1140, setRf1140] = useState<RF1140Data | null>(null);
  const [arsregnskap, setArsregnskap] = useState<ArsregnskapData | null>(null);
  const [sameiebrøk, setSameiebrøk] = useState<SameiebrøkData | null>(null);
  const [sameiebrøkEdit, setSameiebrøkEdit] = useState<Record<number, { sameierbrok: string; areal: string }>>({});
  const [sameiebrøkSaving, setSameiebrøkSaving] = useState(false);
  const [reskontro, setReskontro] = useState<ApenPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tilgjengeligeAr, setTilgjengeligeAr] = useState<number[]>([]);
  const [valgtAr, setValgtAr] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const arData: number[] = await api.hentResultatAr();
        const aktivAr = valgtAr ?? (arData.length > 0 ? arData[0] : null);
        const [balanseData, oppstillingData, reskontroData, analyseData, rf1140Data, arsregnskapData, sameiebrøkData] = await Promise.all([
          api.hentBalanse(),
          fetch(`${API}/api/resultat/oppstilling${aktivAr ? `?ar=${aktivAr}` : ""}`).then(r => r.json()),
          api.hentApnePoster(),
          fetch(`${API}/api/analyse${aktivAr ? `?ar=${aktivAr}` : ""}`).then(r => r.json()),
          fetch(`${API}/api/rf1140${aktivAr ? `?ar=${aktivAr}` : ""}`).then(r => r.json()),
          fetch(`${API}/api/arsregnskap${aktivAr ? `?ar=${aktivAr}` : ""}`).then(r => r.json()),
          fetch(`${API}/api/sameiebrøk`).then(r => r.json()),
        ]);
        setBalanse(balanseData);
        setOppstilling(oppstillingData);
        setReskontro(reskontroData);
        setAnalyse(analyseData);
        setRf1140(rf1140Data);
        setArsregnskap(arsregnskapData);
        setSameiebrøk(sameiebrøkData);
        setTilgjengeligeAr(arData);
        if (valgtAr === null && aktivAr) setValgtAr(aktivAr);
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
              <button
                onClick={() => setAktivRapport("analyse")}
                className={`text-left px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                  aktivRapport === "analyse"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-500"
                    : "text-gray-700 hover:bg-gray-50 border-transparent"
                }`}
              >
                Analyse ✨
              </button>
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-t border-b border-gray-100">Offentlig rapportering</div>
              <button
                onClick={() => setAktivRapport("sameiebrøk")}
                className={`text-left px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                  aktivRapport === "sameiebrøk"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-500"
                    : "text-gray-700 hover:bg-gray-50 border-transparent"
                }`}
              >
                Sameierbrøk-kalkulator
              </button>
              <button
                onClick={() => setAktivRapport("rf1140")}
                className={`text-left px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                  aktivRapport === "rf1140"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-500"
                    : "text-gray-700 hover:bg-gray-50 border-transparent"
                }`}
              >
                RF-1140 Skatteetaten
              </button>
              <button
                onClick={() => setAktivRapport("arsregnskap")}
                className={`text-left px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                  aktivRapport === "arsregnskap"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-500"
                    : "text-gray-700 hover:bg-gray-50 border-transparent"
                }`}
              >
                Årsregnskap
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
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Resultatregnskap</h2>
                  <p className="text-xs text-gray-500 mt-1">Oppstilling etter Regnskapsloven §6-1 (forenklet)</p>
                </div>
                <select
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  value={valgtAr || ""}
                  onChange={(e) => { setValgtAr(Number(e.target.value)); setLoading(true); }}
                >
                  {tilgjengeligeAr.length === 0
                    ? <option>Ingen år med føringer</option>
                    : tilgjengeligeAr.map((ar) => <option key={ar} value={ar}>{ar}</option>)
                  }
                </select>
              </div>

              {loading ? (
                <p className="text-center py-12 text-gray-400">Laster...</p>
              ) : !oppstilling ? (
                <p className="text-center py-12 text-gray-400">Ingen data.</p>
              ) : (() => {
                const fmt = (v: number) => Math.abs(v).toLocaleString("no-NO", { minimumFractionDigits: 2 });
                function GruppeLinjer({ gruppe, invertert = false }: { gruppe: ResultatGruppe; invertert?: boolean }) {
                  return (
                    <>
                      {gruppe.linjer.map((l) => (
                        <tr key={l.kode} className="hover:bg-gray-50">
                          <td className="pl-10 pr-4 py-2.5 text-sm text-gray-500 font-mono w-24">{l.kode}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-800">{l.navn}</td>
                          <td className="px-6 py-2.5 text-sm text-right text-gray-900">{fmt(invertert ? -l.saldo : l.saldo)}</td>
                          <td className="w-32"></td>
                        </tr>
                      ))}
                    </>
                  );
                }
                function SumRad({ label, verdi, fremhevet = false, resultatlinje = false }: { label: string; verdi: number; fremhevet?: boolean; resultatlinje?: boolean }) {
                  const pos = verdi >= 0;
                  return (
                    <tr className={resultatlinje ? "bg-indigo-50 border-t-2 border-indigo-300" : fremhevet ? "bg-gray-100 border-t border-gray-300" : "bg-gray-50 border-t border-gray-200"}>
                      <td className="pl-4 pr-4 py-3 text-sm font-semibold text-gray-700 w-24"></td>
                      <td className={`px-4 py-3 text-sm font-semibold ${resultatlinje ? "text-indigo-900 font-bold" : "text-gray-800"}`}>{label}</td>
                      <td className="px-6 py-3 text-right"></td>
                      <td className={`px-6 py-3 text-right font-bold text-sm ${resultatlinje ? (pos ? "text-green-700" : "text-red-600") : "text-gray-900"}`}>
                        {fmt(verdi)} kr
                      </td>
                    </tr>
                  );
                }
                return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-300">
                        <th className="pl-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Konto</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Beskrivelse</th>
                        <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase">Beløp</th>
                        <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">Sum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {/* DRIFTSINNTEKTER */}
                      <tr className="bg-gray-100"><td colSpan={4} className="px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wider">Driftsinntekter</td></tr>
                      <GruppeLinjer gruppe={oppstilling.driftsinntekter} invertert={true} />
                      <SumRad label="Sum driftsinntekter" verdi={-oppstilling.driftsinntekter.sum} fremhevet />

                      {/* DRIFTSKOSTNADER */}
                      <tr className="bg-gray-100"><td colSpan={4} className="px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wider">Driftskostnader</td></tr>
                      <GruppeLinjer gruppe={oppstilling.driftskostnader} />
                      <SumRad label="Sum driftskostnader" verdi={oppstilling.driftskostnader.sum} fremhevet />

                      {/* DRIFTSRESULTAT */}
                      <SumRad label="Driftsresultat" verdi={-oppstilling.driftsresultat} fremhevet resultatlinje={false} />

                      {/* FINANSPOSTER */}
                      {(oppstilling.finansinntekter.linjer.length > 0 || oppstilling.finanskostnader.linjer.length > 0) && (
                        <>
                          <tr className="bg-gray-100"><td colSpan={4} className="px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wider">Finansinntekter og -kostnader</td></tr>
                          <GruppeLinjer gruppe={oppstilling.finansinntekter} invertert={true} />
                          <GruppeLinjer gruppe={oppstilling.finanskostnader} />
                          <SumRad label="Netto finansposter" verdi={-oppstilling.netto_finans} fremhevet />
                        </>
                      )}

                      {/* ÅRSRESULTAT */}
                      <SumRad label="Årsresultat" verdi={-oppstilling.arsresultat} resultatlinje />
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}
          {aktivRapport === "analyse" && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-1">
                  <h2 className="text-xl font-bold text-gray-900">Regnskapsanalyse</h2>
                  <select
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={valgtAr || ""}
                    onChange={(e) => { setValgtAr(Number(e.target.value)); setLoading(true); }}
                  >
                    {tilgjengeligeAr.length === 0
                      ? <option>Ingen år</option>
                      : tilgjengeligeAr.map((ar) => <option key={ar} value={ar}>{ar}</option>)
                    }
                  </select>
                </div>
                <p className="text-xs text-gray-400 mb-6">Automatisk beregning av nøkkeltall med kommentarer</p>

                {loading || !analyse ? (
                  <p className="text-center py-12 text-gray-400">Laster...</p>
                ) : (() => {
                  const n = analyse.nokkeltal;
                  const fmt = (v: number) => Math.abs(v).toLocaleString("no-NO", { minimumFractionDigits: 0 });
                  const fmtPst = (v: number | null) => v !== null ? `${v.toFixed(1)} %` : "—";
                  const fmtTall = (v: number | null) => v !== null ? v.toFixed(2) : "—";

                  const NIVAA_STIL: Record<string, string> = {
                    positiv: "border-green-200 bg-green-50",
                    ok: "border-blue-200 bg-blue-50",
                    advarsel: "border-amber-200 bg-amber-50",
                    info: "border-gray-200 bg-gray-50",
                  };
                  const NIVAA_IKON: Record<string, string> = {
                    positiv: "✅", ok: "ℹ️", advarsel: "⚠️", info: "📌",
                  };
                  const NIVAA_TEKST: Record<string, string> = {
                    positiv: "text-green-800", ok: "text-blue-800", advarsel: "text-amber-800", info: "text-gray-700",
                  };

                  function NokkelkortLiten({ label, verdi, enhet = "", farge = "gray" }: { label: string; verdi: string; enhet?: string; farge?: string }) {
                    const fargeKlasse = farge === "green" ? "text-green-700" : farge === "red" ? "text-red-600" : farge === "blue" ? "text-blue-700" : "text-gray-900";
                    return (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
                        <p className={`text-xl font-bold ${fargeKlasse}`}>{verdi}<span className="text-sm font-normal text-gray-400 ml-1">{enhet}</span></p>
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* Nøkkeltall-grid */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                        <NokkelkortLiten label="Driftsinntekter" verdi={fmt(n.driftsinntekter)} enhet="kr" />
                        <NokkelkortLiten label="Driftskostnader" verdi={fmt(n.driftskostnader)} enhet="kr" />
                        <NokkelkortLiten
                          label="Driftsresultat"
                          verdi={fmt(n.driftsresultat)}
                          enhet="kr"
                          farge={n.driftsresultat >= 0 ? "green" : "red"}
                        />
                        <NokkelkortLiten
                          label="Årsresultat"
                          verdi={fmt(n.arsresultat)}
                          enhet="kr"
                          farge={n.arsresultat >= 0 ? "green" : "red"}
                        />
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
                        <NokkelkortLiten
                          label="Driftsmargin"
                          verdi={fmtPst(n.driftsmargin_pst)}
                          farge={n.driftsmargin_pst !== null && n.driftsmargin_pst >= 5 ? "green" : n.driftsmargin_pst !== null && n.driftsmargin_pst < 0 ? "red" : "gray"}
                        />
                        <NokkelkortLiten
                          label="Nettoresultatmargin"
                          verdi={fmtPst(n.nettoresultatmargin_pst)}
                          farge={n.nettoresultatmargin_pst !== null && n.nettoresultatmargin_pst >= 0 ? "green" : "red"}
                        />
                        <NokkelkortLiten
                          label="Likviditetsgrad 1"
                          verdi={fmtTall(n.likviditetsgrad)}
                          farge={n.likviditetsgrad !== null && n.likviditetsgrad >= 1 ? "green" : "red"}
                        />
                        <NokkelkortLiten
                          label="Egenkapitalandel"
                          verdi={fmtPst(n.egenkapitalandel_pst)}
                          farge={n.egenkapitalandel_pst !== null && n.egenkapitalandel_pst >= 15 ? "green" : "red"}
                        />
                        <NokkelkortLiten
                          label="Gjeldsgrad"
                          verdi={fmtTall(n.gjeldgrad)}
                          farge={n.gjeldgrad !== null && n.gjeldgrad <= 2 ? "green" : "red"}
                        />
                      </div>

                      {/* Kommentarer */}
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Kommentarer</h3>
                      <div className="space-y-3">
                        {analyse.kommentarer.map((k, i) => (
                          <div key={i} className={`border rounded-lg px-4 py-3 flex gap-3 items-start ${NIVAA_STIL[k.nivaa] ?? "border-gray-200 bg-gray-50"}`}>
                            <span className="text-lg shrink-0">{NIVAA_IKON[k.nivaa] ?? "📌"}</span>
                            <div>
                              <span className={`text-xs font-bold uppercase tracking-wide ${NIVAA_TEKST[k.nivaa] ?? "text-gray-600"}`}>{k.kategori}</span>
                              <p className={`text-sm mt-0.5 ${NIVAA_TEKST[k.nivaa] ?? "text-gray-700"}`}>{k.tekst}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {/* ---- SAMEIERBRØK-KALKULATOR ---- */}
          {aktivRapport === "sameiebrøk" && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Sameierbrøk-kalkulator</h2>
                <p className="text-sm text-gray-500 mb-6">Fordeling av felleskostnader per bolig. Brukes i RF-1140 og årsregnskap.</p>
                {loading || !sameiebrøk ? <p className="text-center py-12 text-gray-400">Laster...</p> : (() => {
                  const fmt2 = (v: number) => v.toLocaleString("no-NO", { minimumFractionDigits: 2 });
                  const totBrok = sameiebrøk.total_brok;
                  return (
                    <>
                      {sameiebrøk.lik_fordeling && (
                        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 text-sm">
                          Ingen sameierbrøk er satt — systemet bruker <strong>lik fordeling</strong> ({sameiebrøk.antall > 0 ? (100 / sameiebrøk.antall).toFixed(2) : 0} % per bolig). Rediger brøkene nedenfor for å sette egendefinert fordeling.
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seksjon</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Navn</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brøk</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Areal (m²)</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Andel %</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {sameiebrøk.boliger.map((b) => {
                              const edit = sameiebrøkEdit[b.id];
                              return (
                                <tr key={b.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.seksjonsnummer || "—"}</td>
                                  <td className="px-4 py-3 font-medium text-gray-900">{b.navn}</td>
                                  <td className="px-4 py-3 text-right">
                                    {edit ? (
                                      <input type="number" step="0.0001" className="w-24 border border-indigo-300 rounded px-2 py-1 text-sm text-right"
                                        value={edit.sameierbrok}
                                        onChange={(e) => setSameiebrøkEdit(prev => ({ ...prev, [b.id]: { ...prev[b.id], sameierbrok: e.target.value } }))} />
                                    ) : <span>{fmt2(b.sameierbrok)}</span>}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {edit ? (
                                      <input type="number" step="0.1" className="w-24 border border-indigo-300 rounded px-2 py-1 text-sm text-right"
                                        value={edit.areal}
                                        onChange={(e) => setSameiebrøkEdit(prev => ({ ...prev, [b.id]: { ...prev[b.id], areal: e.target.value } }))} />
                                    ) : <span>{b.areal > 0 ? fmt2(b.areal) : "—"}</span>}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-indigo-700">{b.andel_pst.toFixed(2)} %</td>
                                  <td className="px-4 py-3 text-right">
                                    {edit ? (
                                      <div className="flex gap-2 justify-end">
                                        <button disabled={sameiebrøkSaving} onClick={async () => {
                                          setSameiebrøkSaving(true);
                                          await fetch(`${API}/api/boliger/${b.id}/sameiebrøk`, {
                                            method: "PUT", headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ sameierbrok: parseFloat(edit.sameierbrok) || 0, areal: parseFloat(edit.areal) || 0 }),
                                          });
                                          setSameiebrøkEdit(prev => { const n = { ...prev }; delete n[b.id]; return n; });
                                          const upd = await fetch(`${API}/api/sameiebrøk`).then(r => r.json());
                                          setSameiebrøk(upd);
                                          setSameiebrøkSaving(false);
                                        }} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded">Lagre</button>
                                        <button onClick={() => setSameiebrøkEdit(prev => { const n = { ...prev }; delete n[b.id]; return n; })} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded">Avbryt</button>
                                      </div>
                                    ) : (
                                      <button onClick={() => setSameiebrøkEdit(prev => ({ ...prev, [b.id]: { sameierbrok: String(b.sameierbrok), areal: String(b.areal) } }))}
                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Rediger</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                            <tr>
                              <td colSpan={2} className="px-4 py-3 font-semibold text-gray-700">Totalt ({sameiebrøk.antall} boliger)</td>
                              <td className="px-4 py-3 text-right font-semibold">{fmt2(totBrok)}</td>
                              <td className="px-4 py-3 text-right font-semibold">{sameiebrøk.total_areal > 0 ? fmt2(sameiebrøk.total_areal) : "—"}</td>
                              <td className="px-4 py-3 text-right font-semibold text-indigo-700">100,00 %</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ---- RF-1140 SKATTEETATEN ---- */}
          {aktivRapport === "rf1140" && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">RF-1140 — Tredjepartsopplysninger boligsameie</h2>
                    <p className="text-sm text-gray-500">Skattemessige beløp per sameier for innrapportering til Skatteetaten</p>
                  </div>
                  <select className="border border-gray-300 rounded-md px-3 py-2 text-sm" value={valgtAr || ""} onChange={(e) => { setValgtAr(Number(e.target.value)); setLoading(true); }}>
                    {tilgjengeligeAr.map(ar => <option key={ar} value={ar}>{ar}</option>)}
                  </select>
                </div>
                {loading || !rf1140 ? <p className="text-center py-12 text-gray-400">Laster...</p> : (() => {
                  const fmt = (v: number) => v.toLocaleString("no-NO");
                  const t = rf1140.sameiets_totaler;
                  return (
                    <>
                      {/* Status-banner */}
                      <div className={`mt-4 mb-6 rounded-lg border px-4 py-3 flex flex-wrap gap-4 items-center ${rf1140.opplysningsplikt ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
                        <div>
                          <p className={`font-semibold text-sm ${rf1140.opplysningsplikt ? "text-amber-800" : "text-green-800"}`}>
                            {rf1140.opplysningsplikt ? "⚠️ Opplysningsplikt — må rapporteres" : "ℹ️ Frivillig rapportering (under 9 seksjoner)"}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{rf1140.antall_seksjoner} seksjoner · Frist: {rf1140.frist} · Innleveres via Altinn skjema RF-1140</p>
                        </div>
                        <a href="https://www.altinn.no" target="_blank" rel="noopener noreferrer"
                          className="ml-auto text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-md whitespace-nowrap">
                          → Åpne Altinn
                        </a>
                      </div>

                      {/* Sameiets totaler */}
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Sameiets skattemessige totaler</h3>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                        {[
                          { label: "Renteinntekter", verdi: t.renteinntekter, info: "Konto 8050–8099" },
                          { label: "Rentekostnader", verdi: t.rentekostnader, info: "Konto 8100–8199" },
                          { label: "Bankformue", verdi: t.bank_formue, info: "Konto 1900–1999" },
                          { label: "Langsiktig gjeld", verdi: t.langsiktig_gjeld, info: "Konto 2200–2399" },
                        ].map(({ label, verdi, info }) => (
                          <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <p className="text-xs text-gray-400 mb-0.5">{info}</p>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
                            <p className="text-lg font-bold text-gray-900">{fmt(verdi)} kr</p>
                          </div>
                        ))}
                      </div>

                      {/* Per-sameier-tabell */}
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Oppgaver per sameier</h3>
                      <p className="text-xs text-gray-400 mb-3">Husleie og driftsutgifter rapporteres <strong>ikke</strong> til Skatteetaten. Kun renteinntekter, rentekostnader, formue og gjeld.</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seksjon</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Navn</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Andel</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Inntekter</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kostnader</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Formue</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gjeld</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {rf1140.oppgaver.map((o) => (
                              <tr key={o.bolig_id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{o.seksjonsnummer || "—"}</td>
                                <td className="px-4 py-3 font-medium text-gray-900">{o.navn}</td>
                                <td className="px-4 py-3 text-right text-gray-600">{o.andel_pst.toFixed(2)} %</td>
                                <td className="px-4 py-3 text-right">{fmt(o.inntekter)} kr</td>
                                <td className="px-4 py-3 text-right">{fmt(o.kostnader)} kr</td>
                                <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(o.formue)} kr</td>
                                <td className="px-4 py-3 text-right text-red-600">{fmt(o.gjeld)} kr</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-4 text-xs text-gray-400">Tallene overføres manuelt til RF-1140 i Altinn, eller sendes som XML-vedlegg via RF-1301. Kontroller mot regnskap før innsending.</p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ---- ÅRSREGNSKAP ---- */}
          {aktivRapport === "arsregnskap" && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Årsregnskap</h2>
                    <p className="text-sm text-gray-500">Resultatregnskap, balanse og noter — ref. Eierseksjonsloven §64</p>
                  </div>
                  <select className="border border-gray-300 rounded-md px-3 py-2 text-sm" value={valgtAr || ""} onChange={(e) => { setValgtAr(Number(e.target.value)); setLoading(true); }}>
                    {tilgjengeligeAr.map(ar => <option key={ar} value={ar}>{ar}</option>)}
                  </select>
                </div>
                {loading || !arsregnskap ? <p className="text-center py-12 text-gray-400">Laster...</p> : (() => {
                  const fmt = (v: number) => v.toLocaleString("no-NO", { minimumFractionDigits: 2 });
                  const r = arsregnskap.resultatregnskap;
                  const b = arsregnskap.balanse;

                  function RegnskapSeksjon({ tittel, linjer, sum, invertSign = false }: { tittel: string; linjer: ArsregnskapLinje[]; sum: number; invertSign?: boolean }) {
                    return (
                      <div className="mb-2">
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{tittel}</span>
                        </div>
                        {linjer.map((l) => (
                          <div key={l.kode} className="flex justify-between items-center py-1.5 pl-4 text-sm text-gray-700">
                            <span><span className="font-mono text-xs text-gray-400 mr-2">{l.kode}</span>{l.navn}</span>
                            <span className="font-medium">{fmt(invertSign ? -l.belop : l.belop)} kr</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center py-2 pl-4 border-t border-gray-200 font-semibold text-sm">
                          <span>Sum {tittel.toLowerCase()}</span>
                          <span>{fmt(sum)} kr</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-8">
                      {/* Resultatregnskap */}
                      <section>
                        <h3 className="text-base font-bold text-gray-900 border-b-2 border-gray-900 pb-1 mb-4">Resultatregnskap {arsregnskap.ar}</h3>
                        <RegnskapSeksjon tittel="Driftsinntekter" linjer={r.driftsinntekter.linjer} sum={r.driftsinntekter.sum} invertSign />
                        <RegnskapSeksjon tittel="Driftskostnader" linjer={r.driftskostnader.linjer} sum={r.driftskostnader.sum} />
                        <div className={`flex justify-between items-center py-2 px-4 rounded font-bold text-sm mb-4 ${r.driftsresultat >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
                          <span>Driftsresultat</span><span>{fmt(r.driftsresultat)} kr</span>
                        </div>
                        {r.finansinntekter.linjer.length > 0 && <RegnskapSeksjon tittel="Finansinntekter" linjer={r.finansinntekter.linjer} sum={r.finansinntekter.sum} invertSign />}
                        {r.finanskostnader.linjer.length > 0 && <RegnskapSeksjon tittel="Finanskostnader" linjer={r.finanskostnader.linjer} sum={r.finanskostnader.sum} />}
                        <div className={`flex justify-between items-center py-3 px-4 rounded font-bold ${r.arsresultat >= 0 ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>
                          <span>ÅRSRESULTAT</span><span>{fmt(r.arsresultat)} kr</span>
                        </div>
                      </section>

                      {/* Balanse */}
                      <section>
                        <h3 className="text-base font-bold text-gray-900 border-b-2 border-gray-900 pb-1 mb-4">Balanse per 31. desember {arsregnskap.ar}</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div>
                            <p className="font-semibold text-gray-700 mb-2 text-sm">EIENDELER</p>
                            <RegnskapSeksjon tittel="Anleggsmidler" linjer={b.eiendeler.anleggsmidler.linjer} sum={b.eiendeler.anleggsmidler.sum} />
                            <RegnskapSeksjon tittel="Omløpsmidler" linjer={b.eiendeler.omloepsmidler.linjer} sum={b.eiendeler.omloepsmidler.sum} />
                            <div className="flex justify-between items-center py-2 px-4 bg-gray-100 rounded font-bold text-sm mt-2">
                              <span>SUM EIENDELER</span><span>{fmt(b.eiendeler.sum)} kr</span>
                            </div>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-700 mb-2 text-sm">GJELD OG EGENKAPITAL</p>
                            <RegnskapSeksjon tittel="Egenkapital" linjer={b.gjeld_og_egenkapital.egenkapital.linjer} sum={b.gjeld_og_egenkapital.egenkapital.sum} />
                            <RegnskapSeksjon tittel="Langsiktig gjeld" linjer={b.gjeld_og_egenkapital.langsiktig_gjeld.linjer} sum={b.gjeld_og_egenkapital.langsiktig_gjeld.sum} />
                            <RegnskapSeksjon tittel="Kortsiktig gjeld" linjer={b.gjeld_og_egenkapital.kortsiktig_gjeld.linjer} sum={b.gjeld_og_egenkapital.kortsiktig_gjeld.sum} />
                            <div className="flex justify-between items-center py-2 px-4 bg-gray-100 rounded font-bold text-sm mt-2">
                              <span>SUM GJELD OG EK</span><span>{fmt(b.gjeld_og_egenkapital.sum)} kr</span>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Noter */}
                      <section>
                        <h3 className="text-base font-bold text-gray-900 border-b-2 border-gray-900 pb-1 mb-4">Noter til årsregnskapet</h3>
                        <div className="space-y-4">
                          {arsregnskap.noter.map((n, i) => (
                            <div key={i} className="border border-gray-200 rounded-lg p-4">
                              <p className="font-semibold text-sm text-gray-900 mb-2">{n.tittel}</p>
                              <p className="text-sm text-gray-600">{n.tekst}</p>
                              {n.sameiere && (
                                <table className="mt-3 w-full text-xs">
                                  <thead><tr className="border-b border-gray-100">
                                    <th className="text-left py-1 text-gray-500">Seksjon</th>
                                    <th className="text-left py-1 text-gray-500">Navn</th>
                                    <th className="text-right py-1 text-gray-500">Brøk</th>
                                    <th className="text-right py-1 text-gray-500">Areal</th>
                                  </tr></thead>
                                  <tbody>{n.sameiere.map((s, j) => (
                                    <tr key={j} className="border-b border-gray-50">
                                      <td className="py-1 font-mono text-gray-400">{s.seksjonsnummer || "—"}</td>
                                      <td className="py-1">{s.navn}</td>
                                      <td className="py-1 text-right">{s.sameierbrok.toFixed(4)}</td>
                                      <td className="py-1 text-right">{s.areal > 0 ? `${s.areal} m²` : "—"}</td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>

                      <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
                        Årsregnskapet skal godkjennes på årsmøtet og sendes Regnskapsregisteret (Brønnøysund) senest 31. juli. Frivillig revisjon anbefales.
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
