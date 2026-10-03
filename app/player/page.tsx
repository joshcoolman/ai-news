import type { Metadata } from "next";
import { playerVideo } from "@/lib/player/video";
import { PlayerBar } from "@/components/player/PlayerBar";
import { PlayerFrame } from "@/components/player/PlayerFrame";

type Params = { searchParams: Promise<{ v?: string; t?: string }> };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const { t } = await searchParams;
  return { title: t || "Player" };
}

/** The player window's page: YouTube's embedded player, the History column beside it and the bar under it. Thumbnails load into it (see openInPlayer in Card.tsx). */
export default async function Player({ searchParams }: Params) {
  const { v, t } = await searchParams;
  if (!v || !VIDEO_ID.test(v)) return <p className="empty player-empty">Nothing playing. Pick a video from Home.</p>;
  const video = await playerVideo(v, t);
  return (
    <div className="player-page">
      <PlayerBar key={v} video={video}>
        <PlayerFrame videoId={v} title={video.title || "Player"} />
      </PlayerBar>
    </div>
  );
}
