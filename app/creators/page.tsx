import { read } from "@/lib/store";
import { CreatorList } from "@/components/creators/CreatorList";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const { creators } = await read();
  return <CreatorList initial={creators} />;
}
