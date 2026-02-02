(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["chunks/[root-of-the-server]__94f3a753._.js",
"[externals]/node:buffer [external] (node:buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:buffer", () => require("node:buffer"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[project]/apps/artclub-admin-clean/middleware.ts [middleware-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "middleware",
    ()=>middleware
]);
(()=>{
    const e = new Error("Cannot find module 'next-auth/jwt'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
})();
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$api$2f$server$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/artclub-admin-clean/node_modules/.pnpm/next@16.0.10_@babel+core@7.29.0_react-dom@19.2.1_react@19.2.1__react@19.2.1/node_modules/next/dist/esm/api/server.js [middleware-edge] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/artclub-admin-clean/node_modules/.pnpm/next@16.0.10_@babel+core@7.29.0_react-dom@19.2.1_react@19.2.1__react@19.2.1/node_modules/next/dist/esm/server/web/exports/index.js [middleware-edge] (ecmascript)");
;
;
function redirectToLogin(req) {
    const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
    return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(loginUrl);
}
async function middleware(req) {
    const { pathname } = req.nextUrl;
    const isApiPath = pathname.startsWith("/api");
    const isAdminPath = pathname.startsWith("/admin");
    const isArtistPath = pathname.startsWith("/artist");
    if (isApiPath) {
        const allowedApi = pathname.startsWith("/api/auth") || pathname === "/api/setup" || pathname.startsWith("/api/setup/") || pathname === "/api/account/change-password" || pathname.startsWith("/api/account/change-password/") || pathname.startsWith("/api/applications") || pathname === "/api/shopify/files/upload" || pathname === "/api/shopify/files/resolve" || pathname === "/api/shopify/resolve-media" || pathname.startsWith("/api/artist-onboarding");
        if (allowedApi) return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
        try {
            const token = await getToken({
                req,
                secret: process.env.NEXTAUTH_SECRET
            });
            if (!token) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: "Unauthorized"
                }, {
                    status: 401
                });
            }
            if (pathname.startsWith("/api/uploads")) {
                if (token.role === "team" || token.role === "artist") {
                    return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
                }
                return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: "Forbidden"
                }, {
                    status: 403
                });
            }
            const isArtistApi = pathname === "/api/artist" || pathname.startsWith("/api/artist/");
            if (isArtistApi) {
                if (token.role !== "artist" || !token.artistId) {
                    return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        error: "Forbidden"
                    }, {
                        status: 403
                    });
                }
                return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
            }
            if (token.role !== "team") {
                return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: "Forbidden"
                }, {
                    status: 403
                });
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
        } catch (err) {
            console.error("Middleware auth error (api)", err);
            return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Unauthorized"
            }, {
                status: 401
            });
        }
    }
    if (!isAdminPath && !isArtistPath) return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
    try {
        const token = await getToken({
            req,
            secret: process.env.NEXTAUTH_SECRET
        });
        if (!token) return redirectToLogin(req);
        if (isAdminPath) {
            if (token.role !== "team") {
                const fallback = token.role === "artist" ? "/artist" : "/login";
                return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL(fallback, req.url));
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
        }
        if (isArtistPath) {
            if (token.role !== "artist") {
                const fallback = token.role === "team" ? "/admin" : "/login";
                return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL(fallback, req.url));
            }
            const pendingRegistrationId = token.pendingRegistrationId;
            if (!token.artistId && pendingRegistrationId) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL(`/apply/${pendingRegistrationId}/dashboard`, req.url));
            }
            if (token.mustChangePassword && !pathname.startsWith("/artist/change-password")) {
                const changeUrl = new URL("/artist/change-password", req.url);
                changeUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
                return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(changeUrl);
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
        }
    } catch (err) {
        console.error("Middleware auth error", err);
        return redirectToLogin(req);
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$artclub$2d$admin$2d$clean$2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$babel$2b$core$40$7$2e$29$2e$0_react$2d$dom$40$19$2e$2$2e$1_react$40$19$2e$2$2e$1_$5f$react$40$19$2e$2$2e$1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
}
const config = {
    matcher: [
        "/admin/:path*",
        "/artist/:path*",
        "/api/:path*"
    ]
};
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__94f3a753._.js.map