"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDollar,
  IconFilm,
  IconZap,
  IconVerifiedBadge,
} from "@/app/components/Icons";

// Transcript do roteiro e histórico de mudanças saíram do menu — agora
// vivem dentro do card de cada vídeo (app/video/[id]/page.tsx).
const NAV_ITEMS = [
  { href: "/", label: "Ganhos", icon: <IconDollar size={16} /> },
  { href: "/videos", label: "Vídeos", icon: <IconFilm size={16} /> },
  { href: "/shorts", label: "Shorts", icon: <IconZap size={16} /> },
];

// "/" só fica ativo na home exata; as outras rotas usam prefixo pra cobrir
// eventuais sub-páginas (ex: /video/[id] continua marcando "Vídeos").
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Sidebar({
  channelTitle,
  avatarUrl,
}: {
  channelTitle?: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        {avatarUrl && (
          <img className="sidebar-brand-avatar" src={avatarUrl} alt={channelTitle || "Canal"} />
        )}
        <span className="sidebar-brand-label">Canal</span>
        <span className="sidebar-brand-title icon-label">
          {channelTitle || "Canal Ligado"} <IconVerifiedBadge size={15} />
        </span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-nav-link ${isActive(pathname, item.href) ? "active" : ""}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
