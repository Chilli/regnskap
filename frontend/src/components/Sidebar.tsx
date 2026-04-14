"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  title: string;
  items: {
    href: string;
    label: string;
    badge?: number;
  }[];
}

export default function Sidebar({ title, items }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)]">
      <div className="p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          {title}
        </h2>
        <nav className="space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                pathname === item.href
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
