"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface KontoRad {
  kode: string;
  navn: string;
  type: string;
}

interface PosteingLinje {
  konto_kode: string;
  belop: string;
}

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function PosteringForm() {
  const searchParams = useSearchParams();
  const [kontoplan, setKontoplan] = useState<KontoRad[]>([]);
  const [dato, setDato] = useState(new Date().toISOString().slice(0, 10));
  const [beskrivelse, setBeskrivelse] = useState("");
  const [linjer, setLinjer] = useState<PosteingLinje[]>([
    { konto_kode: "", belop: "" },
    { konto_kode: "", belop: "" },
  ]);
  const [forhaandsutfylt, setForhaandsutfylt] = useState(false);
  const [bilagFiler, setBilagFiler] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/kontoplan`)
      .then((r) => r.json())
      .then(setKontoplan)
      .catch(() => setError("Kunne ikke laste kontoplan"));
  }, []);

  useEffect(() => {
    if (forhaandsutfylt) return;
    const b = searchParams.get("beskrivelse");
    const linjerParam = searchParams.get("linjer");
    if (b) setBeskrivelse(b);
    if (linjerParam) {
      try {
        const parsed: PosteingLinje[] = JSON.parse(decodeURIComponent(linjerParam));
        if (parsed.length >= 2) {
          setLinjer(parsed);
          setForhaandsutfylt(true);
        }
      } catch {}
    }
  }, [searchParams, forhaandsutfylt]);

  function oppdaterLinje(i: number, felt: keyof PosteingLinje, verdi: string) {
    setLinjer((prev) => prev.map((l, idx) => idx === i ? { ...l, [felt]: verdi } : l));
  }

  function leggTilLinje() {
    setLinjer((prev) => [...prev, { konto_kode: "", belop: "" }]);
  }

  function fjernLinje(i: number) {
    if (linjer.length <= 2) return;
    setLinjer((prev) => prev.filter((_, idx) => idx !== i));
  }

  const sum = linjer.reduce((acc, l) => acc + (parseFloat(l.belop) || 0), 0);
  const balanserer = Math.abs(sum) < 0.01;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const posteringer = linjer
      .filter((l) => l.konto_kode && l.belop !== "")
      .map((l) => ({ konto_kode: l.konto_kode, belop: parseFloat(l.belop) }));

    if (posteringer.length < 2) {
      setError("Minst to posteringslinjer kreves");
      return;
    }
    if (!balanserer) {
      setError(`Posteringene balanserer ikke. Differanse: ${sum.toFixed(2)} kr`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/posteringer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dato, beskrivelse, posteringer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Feil ved bokføring");

      // Last opp bilag hvis valgt
      if (bilagFiler.length > 0 && data.transaksjon_id) {
        for (const fil of bilagFiler) {
          const formData = new FormData();
          formData.append("fil", fil);
          await fetch(`${API}/api/bilag/${data.transaksjon_id}`, { method: "POST", body: formData });
        }
      }

      const antallBilag = bilagFiler.length;
      setSuccess(`Transaksjon #${data.transaksjon_id} bokført${antallBilag > 0 ? ` med ${antallBilag} vedlegg` : ""}`);
      setBeskrivelse("");
      setLinjer([{ konto_kode: "", belop: "" }, { konto_kode: "", belop: "" }]);
      setBilagFiler([]);
      setForhaandsutfylt(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    } finally {
      setLoading(false);
    }
  }

  const kontoLabel = (k: KontoRad) => `${k.kode} — ${k.navn}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Manuell postering</h1>
        <p className="text-gray-600">Bokfør en journalpostering med dobbelt bokholderi</p>
      </div>

      {forhaandsutfylt && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 text-sm">
          <span className="font-semibold">Forhåndsutfylt fra avstemming.</span> Kontroller beløp og kontoer før du bokfører.
        </div>
      )}

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700">{success}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dato</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              value={dato}
              onChange={(e) => setDato(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse / bilagstekst</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              value={beskrivelse}
              onChange={(e) => setBeskrivelse(e.target.value)}
              placeholder="F.eks. Kapitalinnspytt fra styret"
              required
            />
          </div>
        </div>

        {/* Posteringslinjer */}
        <div>
          <div className="grid grid-cols-[1fr_160px_36px] gap-2 mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase">Konto</span>
            <span className="text-xs font-medium text-gray-500 uppercase text-right">Beløp (+ debet / − kredit)</span>
            <span />
          </div>

          {linjer.map((linje, i) => (
            <div key={i} className="grid grid-cols-[1fr_160px_36px] gap-2 mb-2">
              <select
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={linje.konto_kode}
                onChange={(e) => oppdaterLinje(i, "konto_kode", e.target.value)}
              >
                <option value="">Velg konto…</option>
                {kontoplan.map((k) => (
                  <option key={k.kode} value={k.kode}>{kontoLabel(k)}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                className="border border-gray-300 rounded-md px-3 py-2 text-sm text-right"
                placeholder="0.00"
                value={linje.belop}
                onChange={(e) => oppdaterLinje(i, "belop", e.target.value)}
              />
              <button
                type="button"
                onClick={() => fjernLinje(i)}
                disabled={linjer.length <= 2}
                className="text-gray-400 hover:text-red-500 disabled:opacity-20 text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={leggTilLinje}
            className="mt-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Legg til linje
          </button>
        </div>

        {/* Sum-visning */}
        <div className={`flex justify-between items-center px-4 py-3 rounded-md text-sm font-medium ${balanserer ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          <span>Sum posteringer</span>
          <span>{sum.toLocaleString("no-NO", { minimumFractionDigits: 2 })} kr {balanserer ? "✓ Balansert" : "⚠ Ubalanse"}</span>
        </div>

        {/* Bilag */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Vedlegg / bilag (valgfritt)</label>
          <input
            type="file"
            multiple
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-sm file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
            onChange={(e) => setBilagFiler(Array.from(e.target.files || []))}
          />
          {bilagFiler.length > 0 && (
            <ul className="mt-2 space-y-1">
              {bilagFiler.map((f, i) => (
                <li key={i} className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded">
                  <span>📎 {f.name}</span>
                  <button type="button" onClick={() => setBilagFiler((prev) => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500 ml-2">×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-3">
            Positiv verdi = debet, negativ verdi = kredit. Summen må være 0.
          </p>
          <button
            type="submit"
            disabled={loading || !balanserer}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            {loading ? "Bokfører..." : "Bokfør transaksjon"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PosteringPage() {
  return (
    <Suspense fallback={null}>
      <PosteringForm />
    </Suspense>
  );
}
