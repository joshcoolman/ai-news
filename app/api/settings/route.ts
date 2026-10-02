import { mutate } from "@/lib/store";
import type { Settings } from "@/lib/store/types";
import { body, fail, json } from "@/lib/http";

const ON_FAVORITE: Settings["onFavorite"][] = ["ask", "remove", "keep"];

export async function PATCH(req: Request) {
  const { onFavorite } = await body<Settings>(req);
  if (!onFavorite || !ON_FAVORITE.includes(onFavorite)) return fail("onFavorite must be ask, remove or keep.", 400);
  const settings = await mutate((d) => {
    d.settings.onFavorite = onFavorite;
    return d.settings;
  });
  return json(settings);
}
