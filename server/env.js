/*
  Imported first by server.js, so `.env.local` is read before any other module
  looks at the environment. Variables already set win over the file.
*/
try {
  process.loadEnvFile(".env.local");
} catch {
  // No file: keys come from the real environment, or from the browser.
}
