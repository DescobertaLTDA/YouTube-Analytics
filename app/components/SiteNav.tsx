type NavKey = "ganhos" | "videos" | "shorts" | "transcripts" | "mudancas";

const NAV_ITEMS: { key: NavKey; href: string; label: string }[] = [
  { key: "ganhos", href: "/", label: "ganhos" },
  { key: "videos", href: "/videos", label: "vídeos" },
  { key: "shorts", href: "/shorts", label: "shorts" },
  { key: "transcripts", href: "/transcripts", label: "transcripts" },
  { key: "mudancas", href: "/changes", label: "mudanças" },
];

export function SiteNav({ active }: { active: NavKey }) {
  return (
    <div className="nav-links">
      {NAV_ITEMS.map((item) => (
        <a
          key={item.key}
          className={`nav-link ${active === item.key ? "active" : ""}`}
          href={item.href}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}
