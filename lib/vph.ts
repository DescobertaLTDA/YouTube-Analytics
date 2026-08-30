// Views por hora (VPH) e selo colorido de "quão viral" um vídeo está.
//
// A ideia: em vez de mostrar só o VPH cru (que naturalmente é bem maior em
// Shorts do que em vídeo longo), comparamos cada vídeo com a MÉDIA de VPH
// dos vídeos do mesmo formato dentro da mesma lista — assim um Short só é
// considerado "viral" se estiver bem acima da média de outros Shorts, e o
// mesmo vale pra vídeo longo.

import { formatNumber } from "@/lib/format-br";

export type VphFormat = "short" | "long";

export type VphVideoLike = {
  viewCount: number | null | undefined;
  publishedAt: string | null | undefined;
  isShort: boolean;
};

/** VPH = views totais / horas desde a publicação. */
export function computeVph(
  viewCount: number | null | undefined,
  publishedAt: string | null | undefined,
  now: number = Date.now()
): number | null {
  if (viewCount == null || !publishedAt) return null;
  const publishedMs = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedMs)) return null;
  // nunca menos que 1 minuto, pra não estourar o VPH de um vídeo
  // publicado há poucos segundos.
  const hours = Math.max((now - publishedMs) / (1000 * 60 * 60), 1 / 60);
  return viewCount / hours;
}

/** Média de VPH de Shorts e de vídeos longos dentro de uma mesma lista. */
export function averageVphByFormat(videos: VphVideoLike[]): Record<VphFormat, number | null> {
  const now = Date.now();
  const byFormat: Record<VphFormat, number[]> = { short: [], long: [] };

  for (const v of videos) {
    const vph = computeVph(v.viewCount, v.publishedAt, now);
    if (vph == null) continue;
    byFormat[v.isShort ? "short" : "long"].push(vph);
  }

  const average = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return { short: average(byFormat.short), long: average(byFormat.long) };
}

export type VphTier = {
  className: string;
  emoji: string;
};

/** Faixas de "quantas vezes acima da média do formato" -> cor do selo. */
export function vphTier(multiplier: number | null): VphTier {
  if (multiplier == null) return { className: "vph-badge-normal", emoji: "" };
  if (multiplier >= 20) return { className: "vph-badge-explosive", emoji: "🔥" };
  if (multiplier >= 5) return { className: "vph-badge-hot", emoji: "🔥" };
  if (multiplier >= 2) return { className: "vph-badge-warm", emoji: "↑" };
  return { className: "vph-badge-normal", emoji: "" };
}

export function formatVph(vph: number | null) {
  return formatNumber(vph);
}

export function formatMultiplier(multiplier: number | null) {
  if (multiplier == null) return "—";
  if (multiplier >= 100) return ">100x";
  return `${multiplier.toFixed(1)}x`;
}
