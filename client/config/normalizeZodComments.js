/**
 * Zod 4.6.x mentions Rollup's purity marker inside two explanatory comments.
 * Rollup treats those mentions as misplaced compiler annotations. Correct only
 * the prose before parsing; real /* @__PURE__ *\/ annotations remain intact.
 * This does not filter warnings or change executable dependency code. Once
 * upstream removes these phrases the transform simply returns null.
 */
export function normalizeZodCommentProse(code) {
  return code
    .replace('Wrapped in a `@__PURE__` IIFE', 'Wrapped in a pure IIFE')
    .replace('esbuild will not drop a `@__PURE__` call', 'esbuild will not drop a pure call');
}

export default function normalizeZodComments() {
  return {
    name: 'normalize-zod-comment-prose',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/node_modules\/zod\/v4\/core\/(util|regexes)\.js$/.test(id.replaceAll('\\', '/'))) return null;
      const normalized = normalizeZodCommentProse(code);
      return normalized === code ? null : { code: normalized, map: null };
    },
  };
}
