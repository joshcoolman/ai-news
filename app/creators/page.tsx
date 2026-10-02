import { read } from "@/lib/store";
import { Creators } from "@/components/Creators";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const { creators } = await read();
  return <Creators initial={creators} />;
}
