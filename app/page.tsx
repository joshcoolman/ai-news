import { read } from "@/lib/store";
import { buildFeed } from "@/lib/feed/cards";
import { refreshRunning } from "@/lib/refresh/run";
import { Feed } from "@/components/feed/Feed";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; none?: string }> }) {
  const { q, none } = await searchParams;
  const data = await read();
  return (
    <Feed
      initial={{ ...buildFeed(data), refresh: { running: refreshRunning() } }}
      creators={data.creators.map((c) => ({ id: c.channelId, name: c.name }))}
      settings={data.settings}
      query={q}
      nothingNew={!!q && !!none}
    />
  );
}
