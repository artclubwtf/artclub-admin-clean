module.exports = [
"[turbopack-node]/transforms/postcss.ts { CONFIG => \"[project]/apps/artclub-admin-clean/apps/admin/postcss.config.mjs [postcss] (ecmascript)\" } [postcss] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "chunks/a3d9b_9c8c5c2a._.js",
  "chunks/[root-of-the-server]__958e2af7._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[turbopack-node]/transforms/postcss.ts { CONFIG => \"[project]/apps/artclub-admin-clean/apps/admin/postcss.config.mjs [postcss] (ecmascript)\" } [postcss] (ecmascript)");
    });
});
}),
];