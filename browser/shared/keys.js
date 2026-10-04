import { h } from "./dom.js";

/*
  The API keys, when the server has none of its own (/api/config says which).
  They are kept in this browser's local storage and sent as headers with every
  request; the server uses them for that request and never stores them.
  Settings has "Delete keys", which brings the "Add your keys" step back.
*/

const STORE = "ainews-keys";
/** @type {Record<KeyName, { header: string, label: string, hint: string }>} */
const KEYS = {
  anthropic: { header: "x-anthropic-key", label: "Anthropic API key", hint: "console.anthropic.com" },
  youtube: { header: "x-youtube-key", label: "YouTube Data API key", hint: "Google Cloud Console, YouTube Data API v3" },
};

/** @returns {Partial<Record<KeyName, string>>} */
export function savedKeys() {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
}

export function deleteKeys() {
  localStorage.removeItem(STORE);
}

/** The headers that carry the saved keys. */
export function keyHeaders(keys = savedKeys()) {
  /** @type {Record<string, string>} */
  const headers = {};
  for (const name of /** @type {KeyName[]} */ (Object.keys(KEYS))) {
    const value = keys[name];
    if (value) headers[KEYS[name].header] = value;
  }
  return headers;
}

/**
 * The "Add your keys" step: a form for the keys the server lacks, checked
 * against both services before they are saved. Resolves once they are.
 * @param {KeyName[]} needed
 * @returns {Promise<void>}
 */
export function askForKeys(needed) {
  return new Promise((done) => {
    const error = h("p", { class: "error", role: "alert" });
    const inputs = needed.map((name) => h("input", { class: "field", type: "password", autocomplete: "off", required: true, id: `key-${name}` }));
    const submit = h("button", { class: "btn primary", type: "submit" }, "Save keys");
    const form = h(
      "form",
      {
        class: "prompt keys",
        onsubmit: async (/** @type {Event} */ e) => {
          e.preventDefault();
          const entered = Object.fromEntries(needed.map((name, i) => [name, inputs[i].value.trim()]));
          submit.disabled = true;
          submit.textContent = "Checking";
          error.textContent = "";
          try {
            const res = await fetch("/api/keys/check", { method: "POST", headers: keyHeaders(entered) });
            /** @type {Record<KeyName, boolean>} */
            const works = await res.json();
            const bad = needed.filter((name) => !works[name]);
            if (!bad.length) {
              localStorage.setItem(STORE, JSON.stringify(entered));
              form.remove();
              return done();
            }
            error.textContent = `Not accepted: ${bad.map((name) => KEYS[name].label).join(" and ")}.`;
          } catch {
            error.textContent = "Could not reach the server.";
          }
          submit.disabled = false;
          submit.textContent = "Save keys";
        },
      },
      h("h2", {}, "Add your keys"),
      h("p", {}, "This copy of the app has no keys of its own. Yours are saved in this browser only and sent with each request; the server never stores them."),
      needed.flatMap((name, i) => [h("label", { htmlFor: `key-${name}` }, `${KEYS[name].label} (${KEYS[name].hint})`), inputs[i]]),
      error,
      h("div", { class: "prompt-actions" }, submit),
    );
    document.body.append(form);
    inputs[0]?.focus();
  });
}
