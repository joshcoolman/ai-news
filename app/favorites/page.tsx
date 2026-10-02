import { read } from "@/lib/store";
import { favoriteCards } from "@/lib/feed/cards";
import { FavoriteList } from "@/components/favorites/FavoriteList";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  return <FavoriteList initial={favoriteCards(await read())} />;
}
