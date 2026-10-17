import { h } from "./dom.js";

/*
  The YouTube key, when the server has none of its own (/api/config says
  which). It is kept in this browser's local storage and sent as a header with
  every request; the server uses it for that request and never stores it.
  Settings has "Delete key", which brings the "Add your key" step back.
*/

const STORE = "ainews-keys";
/** @type {Record<KeyName, { header: string, label: string, hint: string }>} */
const KEYS = {
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
 * The "Add your key" step: a form for the keys the server lacks, checked
 * against YouTube before they are saved. Resolves once they are.
 * @param {KeyName[]} needed
 * @returns {Promise<void>}
 */
export function askForKeys(needed) {
  return new Promise((done) => {
    const error = h("p", { class: "error", role: "alert" });
    const inputs = needed.map((name) => h("input", { class: "field", type: "password", autocomplete: "off", required: true, id: `key-${name}` }));
    const submit = h("button", { class: "btn primary", type: "submit" }, "Save key");
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
          submit.textContent = "Save key";
        },
      },
      h("h2", {}, "Add your key"),
      h("p", {}, "This copy of the app has no key of its own. Yours is saved in this browser only and sent with each request; the server never stores it."),
      needed.flatMap((name, i) => [h("label", { htmlFor: `key-${name}` }, `${KEYS[name].label} (${KEYS[name].hint})`), inputs[i]]),
      error,
      h("div", { class: "prompt-actions" }, submit),
    );
    document.body.append(form);
    inputs[0]?.focus();
  });
}
