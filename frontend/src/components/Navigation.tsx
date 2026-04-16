"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Oversikt", icon: "📊" },
  { href: "/boliger", label: "Boliger", icon: "🏠" },
  { href: "/faktura", label: "Faktura", icon: "💰" },
  { href: "/rapporter", label: "Rapporter", icon: "📑" },
  { href: "/postering", label: "Postering", icon: "📝" },
  { href: "/avstemming", label: "Avstemming", icon: "🏦" },
  { href: "/kontoplan", label: "Kontoplan", icon: "📋" },
  { href: "/innstillinger", label: "Innstillinger", icon: "⚙️" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-100 border-b border-gray-200">
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
          <div className="flex items-center gap-4">
            <Link href="/faktura" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
              + Ny faktura
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
