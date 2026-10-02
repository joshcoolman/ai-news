import { read } from "@/lib/store";
import { recentVideos } from "@/lib/creators/recent";
import { clampDays, DEFAULT_DAYS } from "@/lib/creators/window";
import { CreatorList } from "@/components/creators/CreatorList";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const { creators, settings } = await read();
  const { cards, reach } = await recentVideos(creators);
  return <CreatorList initial={creators} recent={cards} reach={reach} days={clampDays(settings.creatorsWindowDays ?? DEFAULT_DAYS)} />;
}
