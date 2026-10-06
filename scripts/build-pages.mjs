// Static build for GitHub Pages: `npm run build:pages`.
// Set NEXT_PUBLIC_BASE_PATH to "/<repo-name>" (the workflow does this) and,
// optionally, NEXT_PUBLIC_FEEDBACK_URL to the Google Apps Script web app URL.
import { execSync } from "node:child_process";
import { copyFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

execSync("next build", {
  stdio: "inherit",
  env: { ...process.env, STATIC_EXPORT: "1", NEXT_PUBLIC_STATIC_EXPORT: "1" },
});

// GitHub Pages runs Jekyll by default, which hides folders starting with "_" (like _next).
writeFileSync("out/.nojekyll", "");
// Screenshots are for the team docs, not the site.
rmSync("out/screenshots", { recursive: true, force: true });

// The exporter writes route prefetch payloads as `<route>/__next.<route>/__PAGE__.txt`,
// but the client asks for `<route>/__next.<route>.__PAGE__.txt`. Write the flat names too,
// so client navigation can prefetch instead of hitting 404s.
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
let copied = 0;
const flatten = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const file of walk(p)) {
        const flat = join(dir, `${name}.${relative(p, file).split(sep).join(".")}`);
        copyFileSync(file, flat);
        copied++;
      }
    } else if (name !== "_next") flatten(p);
  }
};
flatten("out");
console.log(`Static site written to out/ (${copied} prefetch files flattened)`);
