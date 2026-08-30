"use client";

import { useState } from "react";
import type { ShopeeSaleDetail } from "@/lib/shopee";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

// `new Date("2026-08-28")` sozinho é interpretado como UTC e pode "voltar"
// um dia em fusos negativos (ex: Brasil) — completar com T00:00:00 força a
// leitura como horário local, igual server e client, evitando mismatch de
// hidratação do React.
function toLocalDate(iso: string): Date {
  return new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
}

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(toLocalDate(iso));
}

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
