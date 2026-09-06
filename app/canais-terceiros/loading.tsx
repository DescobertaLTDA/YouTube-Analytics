// Mesma ideia do app/loading.tsx: feedback visual instantâneo ao clicar em
// "Canais", em vez de tela travada até a página terminar de renderizar.
export default function CanaisLoading() {
  return (
    <main className="page">
      <div className="header-row">
        <div>
          <div className="skeleton-block skeleton-header" />
          <div className="skeleton-block skeleton-subtitle" />
        </div>
      </div>

      <div className="skeleton-block skeleton-panel" style={{ height: 60, marginBottom: 24 }} />
      <div className="skeleton-block skeleton-panel" />
    </main>
  );
}
