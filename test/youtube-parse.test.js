import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { each } from "./each.js";
import { ageText, isoDurationSeconds, parseYouTubeUrl } from "../server/youtube-parse.js";

describe("parseYouTubeUrl", () => {
  each([
    ["https://www.youtube.com/watch?v=jGD_UR4wMJc", "jGD_UR4wMJc"],
    ["https://youtube.com/watch?v=jGD_UR4wMJc&t=42s&list=PL123", "jGD_UR4wMJc"],
    ["https://m.youtube.com/watch?v=jGD_UR4wMJc", "jGD_UR4wMJc"],
    ["youtube.com/watch?v=jGD_UR4wMJc", "jGD_UR4wMJc"],
    ["https://youtu.be/jGD_UR4wMJc", "jGD_UR4wMJc"],
    ["https://youtu.be/jGD_UR4wMJc?si=abc123", "jGD_UR4wMJc"],
    ["https://www.youtube.com/shorts/0NhtHVPQwt8", "0NhtHVPQwt8"],
    ["https://youtube.com/shorts/0NhtHVPQwt8?feature=share", "0NhtHVPQwt8"],
  ])("reads a video id from %s", (url, id) => {
    assert.partialDeepStrictEqual(parseYouTubeUrl(url), { kind: "video", videoId: id });
  });

  each([
    ["https://www.youtube.com/@matthew_berman", "@matthew_berman"],
    ["https://youtube.com/@aiexplained-official/videos", "@aiexplained-official"],
    [" https://www.youtube.com/@Fast.Hours ", "@Fast.Hours"],
  ])("reads a handle from %s", (url, handle) => {
    assert.deepStrictEqual(parseYouTubeUrl(url), { kind: "handle", handle });
  });

  it("reads a channel id", () => {
    assert.deepStrictEqual(parseYouTubeUrl("https://www.youtube.com/channel/UCawZsQWqfGSbCI5yjkdVkTA/videos"), {
      kind: "channel",
      channelId: "UCawZsQWqfGSbCI5yjkdVkTA",
    });
  });

  each([
    "",
    "not a url",
    "https://example.com/watch?v=jGD_UR4wMJc",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=short",
    "https://youtu.be/",
    "https://www.youtube.com/channel/notachannel",
    "https://www.youtube.com/results?search_query=ai",
    "https://www.youtube.com/playlist?list=PL123",
    "https://notyoutube.com/@someone",
  ])("rejects %j", (input) => {
    assert.strictEqual(parseYouTubeUrl(input), null);
  });
});

describe("isoDurationSeconds", () => {
  each([
    ["PT10M1S", 601],
    ["PT56M43S", 3403],
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["P1DT1H", 90_000],
  ])("reads %s", (iso, seconds) => {
    assert.strictEqual(isoDurationSeconds(iso), seconds);
  });

  each([["P0D"], ["PT0S"], [""], [undefined], ["10:01"]])("has no length for %s", (iso) => {
    assert.strictEqual(isoDurationSeconds(iso), undefined);
  });
});

describe("ageText", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  each([
    ["2026-10-04T11:59:00Z", "1 minute ago"],
    ["2026-10-04T03:00:00Z", "9 hours ago"],
    ["2026-10-01T12:00:00Z", "3 days ago"],
    ["2026-08-01T12:00:00Z", "2 months ago"],
    ["2024-10-01T12:00:00Z", "2 years ago"],
  ])("%s reads %s", (at, text) => {
    assert.strictEqual(ageText(at, now), text);
  });
});
