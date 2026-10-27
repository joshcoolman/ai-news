/*
  The pure half of transcripts: reading YouTube's timed-text XML into
  fragments, and laying fragments out as paragraphs. No I/O, so it is tested
  directly (rule 3).
*/

/** A paragraph breaks at a sentence end once it has run this long... */
const PARAGRAPH_SECONDS = 40;
/** ...or at a silence this long, whatever was being said. */
const PAUSE_SECONDS = 2;
/** A punctuated transcript whose sentence runs past this breaks anyway. */
const WALL_SECONDS = 90;

/** @param {string} s */
function decode(s) {
  // YouTube encodes twice ("&amp;#39;"), so the entity names go first and the numbers last.
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The fragments in a timed-text track, as YouTube's iOS client is handed it:
 * `<text start="1.72" dur="4">a few words</text>` per line of caption. Sound
 * cues alone ("[Music]") are dropped; a caption that is one is not a word said.
 * @param {string} xml
 * @returns {Fragment[]}
 */
export function parseTimedText(xml) {
  /** @type {Fragment[]} */
  const out = [];
  for (const m of xml.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([^<]*)<\/text>/g)) {
    const text = decode(m[3]);
    if (!text || /^\[[^\]]*\]$/.test(text)) continue;
    out.push({ start: Number(m[1]), dur: Number(m[2] ?? 0), text });
  }
  return out;
}

/**
 * Fragments as paragraphs that can be read. A chapter starts a paragraph and
 * heads it, waiting for the sentence to end when it arrives mid-sentence. Within one, a paragraph ends at a pause of PAUSE_SECONDS, or once
 * it has run PARAGRAPH_SECONDS: at the next sentence end when the track is
 * punctuated (a creator's own captions), at the next fragment when it is not
 * (YouTube's never are). A sentence that runs WALL_SECONDS breaks regardless.
 * @param {Fragment[]} fragments
 * @param {Chapter[]} [chapters]
 * @returns {Paragraph[]}
 */
export function paragraphs(fragments, chapters = []) {
  const punctuated = fragments.filter((f) => /[.!?]["')\]]?$/.test(f.text)).length * 20 >= fragments.length;
  /** @type {Paragraph[]} */
  const out = [];
  /** @type {string[]} */
  let words = [];
  let start = 0;
  let end = 0;
  let chapter = 0;
  /** @type {string | undefined} */
  let title;

  const flush = () => {
    if (words.length) out.push({ start, ...(title && { title }), text: words.join(" ") });
    words = [];
    title = undefined;
  };

  /** A chapter reached mid-sentence: its heading waits for the sentence to end, when the track has sentences. */
  let pending;
  for (const f of fragments) {
    while (chapters[chapter] && f.start >= chapters[chapter].start) {
      pending = chapters[chapter].title;
      chapter += 1;
    }
    if (words.length) {
      const ran = f.start - start;
      const sentenceEnded = /[.!?]["')\]]?$/.test(words[words.length - 1]);
      const paused = f.start - end > PAUSE_SECONDS;
      const long = ran >= PARAGRAPH_SECONDS && (sentenceEnded || !punctuated || ran >= WALL_SECONDS);
      // Entering a chapter closes what came before, at the sentence end when there is one to wait for.
      const entering = pending !== undefined && (sentenceEnded || !punctuated || paused || ran >= WALL_SECONDS);
      if (paused || long || entering) flush();
    }
    if (!words.length) {
      start = f.start;
      if (pending !== undefined) [title, pending] = [pending, undefined];
    }
    words.push(f.text);
    end = f.start + f.dur;
  }
  flush();
  return out;
}
