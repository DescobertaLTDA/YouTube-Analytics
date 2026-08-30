import type { Metadata } from "next";
import "./globals.css";
import { AiChatWidget } from "@/app/components/AiChatWidget";
import { Sidebar } from "@/app/components/Sidebar";
import { getChannelInfo } from "@/lib/youtube-channel";

export const metadata: Metadata = {
  title: "YouTube Analytics — Pedras e Minerais",
  description:
    "Ganhos por criador, views por dia, e histórico de trocas de título, thumbnail e retenção do canal.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const channelInfo = await getChannelInfo().catch(() => null);

  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-shell">
          <Sidebar channelTitle={channelInfo?.title} avatarUrl={channelInfo?.avatarUrl} />
          <div className="app-main">{children}</div>
        </div>
        <AiChatWidget />
      </body>
    </html>
  );
}
