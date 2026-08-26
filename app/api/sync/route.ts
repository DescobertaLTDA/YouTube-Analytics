/**
 * Analisa o impacto da mudança nas views com mais detalhes
 */
export function analyzeViewImpactDetailed(
  changes: { field: string; oldValue: string | null; newValue: string }[],
  previousViews: number | null,
  currentViews: number,
  daysSinceLastSnapshot: number,
  previousSnapshots: { view_count: number; captured_at: string }[] = []
): { 
  field: string; 
  viewsBefore: number; 
  viewsAfter: number; 
  growth: number; 
  growthPerDay: number;
  trend: string;
  impact: string;
  recommendation: string;
}[] {
  if (!previousViews) return [];

  const viewGrowth = currentViews - previousViews;
  const growthPerDay = daysSinceLastSnapshot > 0 ? viewGrowth / daysSinceLastSnapshot : viewGrowth;

  // Calcula média de crescimento antes da mudança (últimos 7 dias)
  let previousAverageGrowth = 0;
  if (previousSnapshots.length >= 2) {
    const sorted = previousSnapshots.sort((a, b) => 
      new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );
    const recent = sorted.slice(-7); // últimos 7 snapshots
    
    if (recent.length >= 2) {
      const oldestViews = recent[0].view_count;
      const newestViews = recent[recent.length - 1].view_count;
      const days = (new Date(recent[recent.length - 1].captured_at).getTime() - 
                    new Date(recent[0].captured_at).getTime()) / (1000 * 60 * 60 * 24);
      previousAverageGrowth = days > 0 ? (newestViews - oldestViews) / days : 0;
    }
  }

  return changes.map((change) => {
    let trend = "mantido";
    let impact = "neutro ➡️";
    let recommendation = "Manter estratégia atual";

    // Compara crescimento atual com a média anterior
    const growthDifference = growthPerDay - previousAverageGrowth;
    
    if (growthPerDay > previousAverageGrowth * 1.2) {
      trend = "melhorou 🚀";
      impact = "positivo 📈";
      recommendation = `A mudança no ${change.field} trouxe um aumento de views! Considere replicar essa estratégia.`;
    } else if (growthPerDay < previousAverageGrowth * 0.8) {
      trend = "piorou 📉";
      impact = "negativo 📉";
      recommendation = `A mudança no ${change.field} pode ter afetado negativamente as views. Considere reverter ou testar uma nova abordagem.`;
    } else {
      recommendation = `A mudança no ${change.field} não teve impacto significativo nas views.`;
    }

    // Recomendações específicas por campo
    if (change.field === "thumbnail_url" && trend === "melhorou 🚀") {
      recommendation = "🖼️ A nova thumbnail está performando bem! Continue testando variações que destacam cores e faces.";
    } else if (change.field === "thumbnail_url" && trend === "piorou 📉") {
      recommendation = "🖼️ A nova thumbnail pode estar confundindo os espectadores. Tente algo mais simples ou com mais contraste.";
    } else if (change.field === "title" && trend === "melhorou 🚀") {
      recommendation = "📝 O novo título está atraindo mais cliques! Use palavras-chave e gatilhos de curiosidade.";
    } else if (change.field === "title" && trend === "piorou 📉") {
      recommendation = "📝 O título pode estar muito longo ou não ter um gancho forte. Tente algo mais direto.";
    }

    return {
      field: change.field,
      viewsBefore: previousViews,
      viewsAfter: currentViews,
      growth: viewGrowth,
      growthPerDay: growthPerDay,
      trend: trend,
      impact: impact,
      recommendation: recommendation,
    };
  });
}
