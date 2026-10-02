import { read } from "@/lib/store";
import { favoriteCards } from "@/lib/feed/cards";
import { json } from "@/lib/http";

export async function GET() {
  return json(favoriteCards(await read()));
}
