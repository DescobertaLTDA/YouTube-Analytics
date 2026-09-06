// Renderizado automaticamente pelo Next.js (via Suspense) assim que o
// usuário clica em "Ganhos", ANTES da page.tsx terminar de buscar os dados
// no servidor. Sem esse arquivo, a navegação ficava com a tela travada/
// branca durante toda a busca pesada (varredura de tabela + APIs
// externas) — agora o usuário vê feedback visual imediato.
export default function GanhosLoading() {
  return (
    <main className="page">
      <div className="header-row">
        <div>
          <div className="skeleton-block skeleton-header" />
          <div className="skeleton-block skeleton-subtitle" />
        </div>
      </div>

      <div className="skeleton-stats-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-block skeleton-stat-card" />
        ))}
      </div>

      <div className="skeleton-block skeleton-panel" />
      <div className="skeleton-block skeleton-panel" />
    </main>
  );
}
