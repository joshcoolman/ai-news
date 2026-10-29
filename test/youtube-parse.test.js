import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { each } from "./each.js";
import { isoDurationSeconds, parseXUrl, parseYouTubeUrl } from "../server/youtube-parse.js";

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


/** An About page's data as YouTube embeds it, with these links. */
const about = (/** @type {[string, string][]} */ links) =>
  `var ytInitialData = {"aboutChannelViewModel":{"links":[${links
    .map(([title, link]) => `{"channelExternalLinkViewModel":{"title":{"content":${JSON.stringify(title)}},"link":{"content":${JSON.stringify(link)},"commandRuns":[]}}}`)
    .join(",")}]}};`;

describe("parseXUrl", () => {
  each([
    ["x.com/matthewberman", "https://x.com/matthewberman"],
    ["twitter.com/rileybrown", "https://x.com/rileybrown"],
    ["https://www.twitter.com/neuralnine/", "https://x.com/neuralnine"],
    ["mobile.twitter.com/@Some_One?lang=en", "https://x.com/Some_One"],
    ["x.com/someone/status/123", "https://x.com/someone"],
  ])("reads %s", (link, url) => {
    assert.strictEqual(parseXUrl(about([["X", link]])), url);
  });

  it("takes the first X link after other links", () => {
    const html = about([["Site", "forwardfuture.com"], ["My Twitter", "x.com/matthewberman"], ["Company", "x.com/ForwardFuture"]]);
    assert.strictEqual(parseXUrl(html), "https://x.com/matthewberman");
  });

  each([
    [[["Site", "anthropic.com"], ["Instagram", "instagram.com/x.com"]]],
    [[["Share", "x.com/intent/tweet?text=hi"]]],
    [[["Lookalike", "notx.com/someone"]]],
    [[]],
  ])("finds none in %j", (links) => {
    assert.strictEqual(parseXUrl(about(links)), undefined);
  });

  it("ignores an X link that is only in the page's text", () => {
    assert.strictEqual(parseXUrl('<p>follow me at https://x.com/someone</p>'), undefined);
  });
});
