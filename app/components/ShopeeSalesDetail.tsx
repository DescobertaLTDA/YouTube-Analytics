"use client";

import { useState } from "react";
import type { ShopeeSaleDetail } from "@/lib/shopee";
import { formatCurrency, formatDateShort as formatDate } from "@/lib/format-br";

export function ShopeeSalesDetail({ sales }: { sales: ShopeeSaleDetail[] }) {
  const [open, setOpen] = useState(false);

  if (sales.length === 0) return null;

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
