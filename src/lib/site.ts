/**
 * Build-time site settings.
 *
 * - NEXT_PUBLIC_BASE_PATH: set when the site is served from a sub-path, e.g.
 *   "/hoomanely-standup" on GitHub Pages. Links get it automatically; images and
 *   other files in /public need asset().
 * - NEXT_PUBLIC_STATIC_EXPORT: "1" for the static (GitHub Pages) build, where
 *   there is no server: the AI assistant uses its offline helpers.
 * - NEXT_PUBLIC_FEEDBACK_URL: the Google Apps Script web app that adds feedback
 *   to a Google Sheet (see docs/feedback-sheet.md).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
export const FEEDBACK_URL = process.env.NEXT_PUBLIC_FEEDBACK_URL ?? "";

/** Prefixes a /public path with the base path. Leaves data: and full URLs alone. */
export function asset(path: string): string {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
}
