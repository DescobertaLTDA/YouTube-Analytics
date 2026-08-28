// Ícones SVG simples (estilo outline, herdam a cor do texto via
// currentColor) usados no lugar de emojis em todo o site — mantém o visual
// consistente com a paleta preto-e-branco do dashboard.

type IconProps = { size?: number; className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconFilm({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5" />
    </svg>
  );
}

export function IconZap({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function IconDollar({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function IconCalendar({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function IconCart({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

export function IconTrophy({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4" />
    </svg>
  );
}

export function IconRefresh({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function IconTarget({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

export function IconEye({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconUpload({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function IconPin({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function IconFileText({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

export function IconSave({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

export function IconBarChart({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

export function IconTrendingUp({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

export function IconTrendingDown({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function IconSearch({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconClipboard({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z" />
      <rect x="5" y="4" width="14" height="18" rx="2" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

export function IconInbox({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

export function IconMousePointer({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z" />
    </svg>
  );
}

export function IconPause({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

export function IconSpeaker({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...base}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
