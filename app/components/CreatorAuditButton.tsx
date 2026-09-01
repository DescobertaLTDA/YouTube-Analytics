"use client";

import { useEffect, useState } from "react";
import type { CreatorStats, GanhosVideoRow } from "@/lib/data";
import type { ShopeeSaleDetail } from "@/lib/shopee";
import { IconClipboard, IconFilm, IconZap, IconCart, IconDollar } from "@/app/components/Icons";
import { formatNumber, formatCurrency, formatDateShort as formatDate } from "@/lib/format-br";

// Botão "Auditoria" do card de cada criador. Mostra, em detalhe, de onde
// vieram e quando vieram os ganhos que compõem os cards acima (vídeos do
// YouTube, vendas Shopee, vendas Cakto) — pra criador tirar dúvida ou
// conferir o próprio ganho sem precisar perguntar pro Lucas.
export function CreatorAuditButton({
  stats,
  videos,
  isManualRevenue,
}: {
  stats: CreatorStats;
  // Vídeos do criador no período de 28 dias (já com título, data de
  // publicação, views e receita por vídeo) — mesmo dado que alimenta o
  // Histórico de Vídeos, só que filtrado pra esse criador.
  videos: GanhosVideoRow[];
  isManualRevenue: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const sortedVideos = [...videos].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  const sortedShopeeSales = [...(stats.shopeeSales || [])].sort(
    (a, b) => new Date(b.purchaseTime).getTime() - new Date(a.purchaseTime).getTime()
  );

  return (
    <>
      <button
        type="button"
        className="btn-auditoria icon-label"
        onClick={() => setOpen(true)}
      >
        <IconClipboard /> Auditoria
      </button>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>Auditoria de {stats.label}</h2>
                <p className="drawer-subtitle">
                  De onde vieram e quando vieram os ganhos dos últimos 28 dias
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="drawer-body">
              {isManualRevenue && (
                <p className="audit-note">
                  A receita total do período foi digitada manualmente (valor real do YouTube
                  Studio). A receita de cada vídeo abaixo é uma estimativa proporcional à
                  participação dele nas views — não o valor exato pago pelo YouTube por vídeo.
                </p>
              )}

              <div className="audit-section">
                <h3 className="audit-section-title icon-label">
                  <IconFilm /> Ganhos do YouTube ({videos.length} vídeo(s))
                </h3>

                {sortedVideos.length === 0 && (
                  <div className="no-changes">Nenhum vídeo com receita nesse período.</div>
                )}

                {sortedVideos.map((v) => (
                  <div className="drawer-video-row" key={v.youtubeVideoId}>
                    {v.thumbnailUrl && (
                      <img className="drawer-video-thumb" src={v.thumbnailUrl} alt={v.title ?? ""} />
                    )}
                    <div className="drawer-video-info">
                      <a
                        href={`https://youtube.com/watch?v=${v.youtubeVideoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="drawer-video-title"
                      >
                        {v.title ?? "sem título"}
                      </a>
                      <div className="drawer-video-meta">
                        <span className="text-muted-small icon-label">
                          {v.isShort ? <IconZap size={12} /> : <IconFilm size={12} />}
                          {v.isShort ? "Short" : "Vídeo longo"}
                        </span>
                        <span className="text-muted-small">publicado {formatDate(v.publishedAt)}</span>
                      </div>
                    </div>

                    <div className="drawer-video-stats">
                      <div className="drawer-video-stat">
                        <span className="drawer-video-stat-value amber">{formatNumber(v.viewCount)}</span>
                        <span className="drawer-video-stat-label">views</span>
                      </div>
                      <div className="drawer-video-stat">
                        <span className="drawer-video-stat-value malachite">
                          {formatCurrency(v.revenue)}
                        </span>
                        <span className="drawer-video-stat-label">receita</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="audit-section">
                <h3 className="audit-section-title icon-label">
                  <IconCart /> Vendas Shopee ({stats.shopeeOrders ?? 0} pedido(s))
                </h3>

                {sortedShopeeSales.length === 0 && (
                  <div className="no-changes">Nenhuma venda Shopee paga nesse período.</div>
                )}

                {sortedShopeeSales.map((sale: ShopeeSaleDetail) => (
                  <div className="audit-shopee-row" key={sale.conversionId}>
                    <div className="shopee-sale-products">
                      {sale.products.length > 0
                        ? sale.products.map((p, i) => (
                            <div key={i} className="shopee-sale-product">
                              {p.itemName}{" "}
                              <span className="text-muted-small">
                                · {p.shopName} {p.qty > 1 ? `· ${p.qty}x` : ""}
                              </span>
                            </div>
                          ))
                        : <div className="shopee-sale-product text-muted-small">produto não informado</div>}
                    </div>
                    <div className="shopee-sale-meta">
                      <span className="text-muted-small">
                        clique {formatDate(sale.clickTime)} · compra {formatDate(sale.purchaseTime)}
                        {sale.daysSinceClick > 0 ? ` (+${sale.daysSinceClick}d)` : ""}
                      </span>
                      <span className="shopee-sale-commission">{formatCurrency(sale.commission)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="audit-section">
                <h3 className="audit-section-title icon-label">
                  <IconDollar /> Vendas Cakto ({stats.caktoOrders ?? 0} pedido(s))
                </h3>

                {stats.caktoOrders != null && stats.caktoOrders > 0 ? (
                  <div className="audit-cakto-summary">
                    <span>
                      {stats.caktoOrders} pedido(s) pago(s) nos últimos 28 dias, somando{" "}
                      <strong>{formatCurrency(stats.caktoAmount ?? 0)}</strong>.
                    </span>
                    <p className="audit-note">
                      A API da Cakto não retorna produto/data por pedido individual — só o total
                      agregado do período mostrado aqui.
                    </p>
                  </div>
                ) : (
                  <div className="no-changes">Nenhuma venda Cakto paga nesse período.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
