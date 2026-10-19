/*
  Which half of the one window has the keyboard (#74). A page without it wears
  `away` on its root, and its green marks (the highlight, the picked creator,
  the playing row) go dark; they come back as they were with the keyboard.
  Leaving the browser darkens both, as an inactive window's selection does.
*/
export function markAway() {
  const set = () => document.documentElement.classList.toggle("away", !document.hasFocus());
  window.addEventListener("focus", set);
  window.addEventListener("blur", set);
  set();
}
