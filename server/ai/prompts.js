import { promises as fs } from "node:fs";
import path from "node:path";

/*
  Every prompt the app sends lives in prompts/<name>.md. Files are read at call
  time, so an edit takes effect on the next call without a restart. `{{name}}`
  is replaced with vars[name]; a paragraph whose variables are all empty is
  dropped, which is how optional blocks (the other lanes)
  disappear when there is nothing to say.
*/

const DIR = path.join(process.cwd(), "prompts");

/**
 * @param {string} name
 * @param {Record<string, string | number>} [vars]
 */
export async function prompt(name, vars = {}) {
  return render(await fs.readFile(path.join(DIR, `${name}.md`), "utf8"), vars, name);
}

/**
 * @param {string} text
 * @param {Record<string, string | number>} vars
 */
export function render(text, vars, name = "prompt") {
  const used = (/** @type {string} */ s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const missing = used(text).find((v) => !(v in vars));
  if (missing) throw new Error(`${name}: no value for {{${missing}}}`);
  return text
    .split(/\n{2,}/)
    .filter((para) => {
      const names = used(para);
      return !names.length || names.some((v) => String(vars[v]) !== "");
    })
    .map((para) => para.replace(/\{\{(\w+)\}\}/g, (_, v) => String(vars[v])).trimEnd())
    .join("\n\n")
    .trim();
}
