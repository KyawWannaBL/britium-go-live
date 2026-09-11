var _a;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
    },
    define: {
        __APP_VERSION__: JSON.stringify((_a = process.env.npm_package_version) !== null && _a !== void 0 ? _a : "1.0.0"),
    },
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: "dist",
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ["react", "react-dom", "react-router-dom"],
                    supabase: ["@supabase/supabase-js"],
                    query: ["@tanstack/react-query"],
                },
            },
        },
    },
});
