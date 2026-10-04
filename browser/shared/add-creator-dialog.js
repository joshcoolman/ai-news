import { post } from "./api.js";
import { h } from "./dom.js";

/**
 * Add a creator from the header. Paste a URL and the dialog says who it found;
 * Add then saves the creator and grabs their recent videos into the feed.
 * `onClose` gets the result, or nothing when the dialog was cancelled.
 * @param {(result?: { name: string, grabbed?: number }) => void} onClose
 */
export function addCreatorDialog(onClose) {
  /** @type {{ name: string, avatarUrl: string, listed: boolean } | null} */
  let found = null;
  let looking = false;
  let error = "";
  let busy = false;
  /** @type {{ name: string, grabbed?: number } | undefined} */
  let result;
  // Each lookup gets a number; an answer for an older one is dropped.
  let lookup = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  const url = h("input", { class: "field", placeholder: "Paste a YouTube video or channel URL", "aria-label": "YouTube URL", autofocus: true });
  const guidance = h("input", { class: "field", placeholder: "Guidance (optional), e.g. only announcement videos", "aria-label": "Guidance for this creator" });
  const line = h("p", { class: "found", role: "status" });
  const add = h("button", { class: "btn primary", type: "submit" }, "Add");

  function draw() {
    line.replaceChildren(
      ...(looking
        ? ["Looking"]
        : error
          ? [h("span", { class: "error" }, error)]
          : found
            ? [
                found.avatarUrl && h("img", { class: "avatar", src: found.avatarUrl, alt: "", referrerPolicy: "no-referrer" }),
                h("span", {}, found.listed ? `${found.name} is already listed` : `Found ${found.name}`),
              ].filter((x) => !!x)
            : []),
    );
    add.disabled = !found || found.listed || busy;
    add.textContent = busy ? "Adding" : "Add";
  }

  // Look the URL up shortly after typing or pasting stops.
  url.oninput = () => {
    const mine = ++lookup;
    clearTimeout(timer);
    found = null;
    error = "";
    looking = !!url.value.trim();
    draw();
    if (!looking) return;
    timer = setTimeout(async () => {
      try {
        const res = await post("/api/creators/resolve", { url: url.value });
        const data = await res.json();
        if (mine !== lookup) return;
        if (!res.ok) error = data.error ?? "Could not read that URL.";
        else found = { ...data.creator, listed: data.listed };
      } catch {
        if (mine !== lookup) return;
        error = "Could not reach the server.";
      }
      looking = false;
      draw();
    }, 450);
  };

  const dialog = h(
    "dialog",
    {
      class: "prompt add-dialog",
      onclose: () => {
        clearTimeout(timer);
        dialog.remove();
        onClose(result);
      },
      // A click on the backdrop lands on the dialog itself.
      onclick: (/** @type {Event} */ e) => e.target === dialog && dialog.close(),
    },
    h(
      "form",
      {
        onsubmit: async (/** @type {Event} */ e) => {
          e.preventDefault();
          if (!found || found.listed || busy) return;
          busy = true;
          draw();
          try {
            const res = await post("/api/creators", { url: url.value, guidance: guidance.value, grab: true });
            const data = await res.json();
            if (res.ok) {
              result = { name: data.creator.name, grabbed: data.grabbed };
              return dialog.close();
            }
            error = data.error ?? "Could not add that creator.";
          } catch {
            error = "Could not reach the server.";
          }
          busy = false;
          draw();
        },
      },
      h("h2", {}, "Add creator"),
      url,
      line,
      guidance,
      h("div", { class: "prompt-actions" }, h("button", { class: "btn", type: "button", onclick: () => dialog.close() }, "Cancel"), add),
    ),
  );
  draw();
  document.body.append(dialog);
  dialog.showModal();
}
