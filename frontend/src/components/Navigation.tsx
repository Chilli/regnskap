"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/", label: "Oversikt", icon: "📊" },
  { href: "/boliger", label: "Boliger", icon: "🏠" },
  { href: "/faktura", label: "Faktura", icon: "💰" },
  { href: "/rapporter", label: "Rapporter", icon: "📑" },
  { href: "/hovedbok", label: "Hovedbok", icon: "📒" },
  { href: "/postering", label: "Postering", icon: "📝" },
  { href: "/avstemming", label: "Avstemming", icon: "🏦" },
  { href: "/kontoplan", label: "Kontoplan", icon: "📋" },
  { href: "/innstillinger", label: "Innstillinger", icon: "⚙️" },
];

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function Navigation() {
  const pathname = usePathname();
  const [modus, setModus] = useState<"demo" | "prod" | null>(null);
  const [visByttModal, setVisByttModal] = useState(false);
  const [bytter, setBytter] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/modus`)
      .then(r => r.json())
      .then(d => setModus(d.modus))
      .catch(() => {});
  }, []);

  async function byttModus(nyModus: "demo" | "prod") {
    setBytter(true);
    try {
      const res = await fetch(`${API}/api/modus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modus: nyModus }),
      });
      const data = await res.json();
      setModus(data.modus);
      setVisByttModal(false);
      window.location.reload();
    } finally {
      setBytter(false);
    }
  }

  const erDemo = modus === "demo";

  return (
    <>
      {/* Demo-banner øverst */}
      {erDemo && (
        <div className="bg-amber-400 text-amber-900 text-center text-xs font-semibold py-1.5 px-4">
          DEMO-MODUS — Du ser fiktive testdata. Ingen endringer påvirker produksjon.{" "}
          <button onClick={() => setVisByttModal(true)} className="underline hover:text-amber-700 font-bold ml-1">
            Bytt til produksjon →
          </button>
        </div>
      )}

      <nav className={`border-b ${erDemo ? "bg-amber-50 border-amber-200" : "bg-gray-100 border-gray-200"}`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="font-bold text-xl text-gray-900">
                🏢 Sameie Regnskap
              </Link>
              <div className="hidden md:flex space-x-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-900 hover:bg-white"
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {modus && (
                <button
                  onClick={() => setVisByttModal(true)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    erDemo
                      ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
                      : "bg-green-100 text-green-800 border-green-300 hover:bg-green-200"
                  }`}
                >
                  {erDemo ? "🧪 Demo" : "✅ Produksjon"}
                </button>
              )}
              <Link href="/faktura" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
                + Ny faktura
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Bytt modus-modal */}
      {visByttModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Bytt databasemodus</h2>
            <p className="text-sm text-gray-500 mb-6">
              Demo og produksjon har helt separate databaser. Du kan bytte fritt frem og tilbake uten å miste data i noen av dem.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                disabled={bytter || modus === "demo"}
                onClick={() => byttModus("demo")}
                className={`rounded-lg border-2 p-4 text-left transition-all ${
                  modus === "demo"
                    ? "border-amber-400 bg-amber-50 cursor-default"
                    : "border-gray-200 hover:border-amber-300 hover:bg-amber-50"
                }`}
              >
                <p className="font-bold text-amber-800 mb-1">🧪 Demo</p>
                <p className="text-xs text-gray-500">Fiktive testdata. Trygt å eksperimentere.</p>
                {modus === "demo" && <p className="text-xs font-semibold text-amber-600 mt-2">← Aktiv nå</p>}
              </button>
              <button
                disabled={bytter || modus === "prod"}
                onClick={() => byttModus("prod")}
                className={`rounded-lg border-2 p-4 text-left transition-all ${
                  modus === "prod"
                    ? "border-green-400 bg-green-50 cursor-default"
                    : "border-gray-200 hover:border-green-300 hover:bg-green-50"
                }`}
              >
                <p className="font-bold text-green-800 mb-1">✅ Produksjon</p>
                <p className="text-xs text-gray-500">Ekte data. Brukes til reell regnskapsføring.</p>
                {modus === "prod" && <p className="text-xs font-semibold text-green-600 mt-2">← Aktiv nå</p>}
              </button>
            </div>
            {bytter && <p className="text-sm text-center text-gray-400 mb-4">Bytter database...</p>}
            <button
              onClick={() => setVisByttModal(false)}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </>
  );
}
