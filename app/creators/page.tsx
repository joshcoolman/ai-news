import { read } from "@/lib/store";
import { clampDays, DEFAULT_DAYS } from "@/lib/creators/window";
import { CreatorList } from "@/components/creators/CreatorList";

export const dynamic = "force-dynamic";

/** Renders straight from the store; the videos load in the browser behind placeholders. */
export default async function CreatorsPage() {
  const { creators, settings } = await read();
  return <CreatorList initial={creators} days={clampDays(settings.creatorsWindowDays ?? DEFAULT_DAYS)} />;
}
