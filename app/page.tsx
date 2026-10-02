import { read } from "@/lib/store";
import { buildFeed } from "@/lib/view";
import { refreshRunning } from "@/lib/refresh";
import { Feed } from "@/components/Feed";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await read();
  return (
    <Feed
      initial={{ ...buildFeed(data), refresh: { running: refreshRunning() } }}
      creators={data.creators.map((c) => ({ id: c.channelId, name: c.name }))}
    />
  );
}
