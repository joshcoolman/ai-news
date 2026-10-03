import { mutate } from "@/lib/store";
import type { Settings } from "@/lib/store/types";
import { clampDays } from "@/lib/creators/window";
import { body, fail, json } from "@/lib/http";

const ON_FAVORITE: Settings["onFavorite"][] = ["ask", "remove", "keep"];

/** Change any of the settings sent; the rest stay as they are. */
export async function PATCH(req: Request) {
  const { onFavorite, creatorsWindowDays, skipMembersOnly } = await body<Settings>(req);
  if (onFavorite !== undefined && !ON_FAVORITE.includes(onFavorite)) return fail("onFavorite must be ask, remove or keep.", 400);
  if (skipMembersOnly !== undefined && typeof skipMembersOnly !== "boolean") return fail("skipMembersOnly must be true or false.", 400);
  if (onFavorite === undefined && creatorsWindowDays === undefined && skipMembersOnly === undefined) return fail("Nothing to change.", 400);
  const settings = await mutate((d) => {
    if (onFavorite !== undefined) d.settings.onFavorite = onFavorite;
    if (creatorsWindowDays !== undefined) d.settings.creatorsWindowDays = clampDays(creatorsWindowDays);
    if (skipMembersOnly !== undefined) d.settings.skipMembersOnly = skipMembersOnly;
    return d.settings;
  });
  return json(settings);
}
