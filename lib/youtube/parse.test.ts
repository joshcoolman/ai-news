import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "./parse";

describe("parseYouTubeUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=jGD_UR4wMJc", "jGD_UR4wMJc"],
    ["https://youtube.com/watch?v=jGD_UR4wMJc&t=42s&list=PL123", "jGD_UR4wMJc"],
    ["https://m.youtube.com/watch?v=jGD_UR4wMJc", "jGD_UR4wMJc"],
    ["youtube.com/watch?v=jGD_UR4wMJc", "jGD_UR4wMJc"],
    ["https://youtu.be/jGD_UR4wMJc", "jGD_UR4wMJc"],
    ["https://youtu.be/jGD_UR4wMJc?si=abc123", "jGD_UR4wMJc"],
    ["https://www.youtube.com/shorts/0NhtHVPQwt8", "0NhtHVPQwt8"],
    ["https://youtube.com/shorts/0NhtHVPQwt8?feature=share", "0NhtHVPQwt8"],
  ])("reads a video id from %s", (url, id) => {
    expect(parseYouTubeUrl(url)).toMatchObject({ kind: "video", videoId: id });
  });

  it.each([
    ["https://www.youtube.com/@matthew_berman", "@matthew_berman"],
    ["https://youtube.com/@aiexplained-official/videos", "@aiexplained-official"],
    ["  https://www.youtube.com/@Fast.Hours  ", "@Fast.Hours"],
  ])("reads a handle from %s", (url, handle) => {
    expect(parseYouTubeUrl(url)).toEqual({ kind: "handle", handle });
  });

  it("reads a channel id", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/channel/UCawZsQWqfGSbCI5yjkdVkTA/videos")).toEqual({
      kind: "channel",
      channelId: "UCawZsQWqfGSbCI5yjkdVkTA",
    });
  });

  it.each([
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
    expect(parseYouTubeUrl(input)).toBeNull();
  });
});
