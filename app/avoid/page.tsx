import { read } from "@/lib/store";
import { AvoidList } from "@/components/avoid/AvoidList";

export const dynamic = "force-dynamic";

export default async function AvoidPage() {
  const { avoid } = await read();
  return <AvoidList initial={[...avoid].reverse()} />;
}
