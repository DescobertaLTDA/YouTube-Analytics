"use client";

import { useState } from "react";
import { ChannelViewsHistoryChart } from "@/app/components/ChannelViewsHistoryChart";
import { ChannelRealtimeCard } from "@/app/components/ChannelRealtimeCard";
import { totalViewsByChannelInWindow, type TrackedChannelsHistory } from "@/lib/tracked-channels-history";

export function ChannelsHourlySection({ history }: { history: TrackedChannelsHistory }) {
  // `null` = ninguém clicou ainda num avatar — nesse caso o card usa o
  // canal com mais views nas últimas 48h (recalculado a cada render, então
  // acompanha o líder em tempo real até a pessoa fixar uma escolha própria
  // clicando).
  const [clickedChannelId, setClickedChannelId] = useState<string | null>(null);

  const viewsWindow = totalViewsByChannelInWindow(history, 48);
  const leaderChannelId =
    history.channels.length > 0
      ? history.channels.reduce((leader, c) =>
          (viewsWindow.get(c.channelId) || 0) > (viewsWindow.get(leader.channelId) || 0) ? c : leader
        ).channelId
      : null;

  const effectiveSelectedId = clickedChannelId ?? leaderChannelId;

  return (
    <div className="channels-hourly-grid">
      <ChannelViewsHistoryChart
        history={history}
        selectedChannelId={effectiveSelectedId}
        onSelectChannel={setClickedChannelId}
      />
      <ChannelRealtimeCard history={history} selectedChannelId={effectiveSelectedId} />
    </div>
  );
}
