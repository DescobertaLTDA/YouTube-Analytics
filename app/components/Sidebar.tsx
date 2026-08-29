"use client";

import { usePathname } from "next/navigation";
import {
  IconDollar,
  IconFilm,
  IconZap,
  IconFileText,
  IconBarChart,
} from "@/app/components/Icons";

const NAV_ITEMS = [
  { href: "/", label: "Ganhos", icon: <IconDollar size={16} /> },
  { href: "/videos", label: "Vídeos", icon: <IconFilm size={16} /> },
  { href: "/shorts", label: "Shorts", icon: <IconZap size={16} /> },
  { href: "/transcripts", label: "Transcripts", icon: <IconFileText size={16} /> },
  { href: "/changes", label: "Mudanças", icon: <IconBarChart size={16} /> },
];

// "/" só fica ativo na home exata; as outras rotas usam prefixo pra cobrir
// eventuais sub-páginas (ex: /video/[id] continua marcando "Vídeos").
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-title">Canal Ligado</span>
        <span className="sidebar-brand-sub">Pedras e Minerais</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`sidebar-nav-link ${isActive(pathname, item.href) ? "active" : ""}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}
