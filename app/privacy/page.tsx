export const metadata = {
  title: "Política de Privacidade — YouTube Analytics",
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.6,
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Política de Privacidade</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>
        Última atualização: 30 de agosto de 2026
      </p>

      <p>
        Este aplicativo (&quot;YouTube Analytics&quot;) é uma ferramenta interna de uso
        pessoal para acompanhamento de métricas e receita do canal do YouTube dos
        seus operadores. Ele não é distribuído publicamente nem coleta dados de
        terceiros ou visitantes.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Dados acessados</h2>
      <p>
        O aplicativo se conecta à API do YouTube (YouTube Data API v3 e YouTube
        Analytics API) exclusivamente para ler, em nome do próprio proprietário do
        canal:
      </p>
      <ul>
        <li>Estatísticas públicas de vídeos (visualizações, curtidas, comentários, duração)</li>
        <li>Título, descrição e miniatura dos vídeos</li>
        <li>Relatórios de receita e monetização do canal (yt-analytics-monetary.readonly)</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Uso dos dados</h2>
      <p>
        Os dados obtidos são armazenados em um banco de dados privado (Supabase)
        controlado pelo proprietário do aplicativo e usados unicamente para exibir
        painéis internos de acompanhamento. Nenhum dado é vendido, compartilhado ou
        usado para fins de publicidade.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Compartilhamento</h2>
      <p>
        Não compartilhamos nenhuma informação obtida via APIs do Google com
        terceiros. O acesso ao painel é restrito às pessoas autorizadas pelo
        proprietário do canal.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Revogação de acesso</h2>
      <p>
        Você pode revogar o acesso deste aplicativo à sua Conta do Google a
        qualquer momento em{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Contato</h2>
      <p>
        Dúvidas sobre esta política podem ser enviadas para{" "}
        <a href="mailto:empresarialgerenciador@gmail.com">
          empresarialgerenciador@gmail.com
        </a>
        .
      </p>
    </main>
  );
}
