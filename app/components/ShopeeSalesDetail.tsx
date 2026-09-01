"use client";

import { useState } from "react";
import type { ShopeeSaleDetail } from "@/lib/shopee";
import { formatCurrency, formatDateShort as formatDate } from "@/lib/format-br";

export function ShopeeSalesDetail({ sales }: { sales: ShopeeSaleDetail[] }) {
  const [open, setOpen] = useState(false);

  // Quando não há vendas, ainda reserva a mesma altura que o botão "ver X
  // compra(s)" ocuparia (em vez de sumir com o espaço) — assim o card de
  // Shopee fica com a mesma altura em todo criador, e o botão de Auditoria
  // logo abaixo se mantém alinhado entre os 3 cards, tenha venda ou não.
  if (sales.length === 0) {
    return (
      <div className="shopee-sales-detail shopee-sales-toggle shopee-sales-toggle-spacer" aria-hidden="true">
        ver compra(s) ▼
      </div>
    );
  }

  return (
    <div className="shopee-sales-detail">
      <button
        type="button"
        className="shopee-sales-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "ocultar compras ▲" : `ver ${sales.length} compra(s) ▼`}
      </button>

      {open && (
        <div className="shopee-sales-list">
          {sales.map((sale) => (
            <div className="shopee-sale-row" key={sale.conversionId}>
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
      )}
    </div>
  );
}
