import { defineConfig } from "vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        host: true,
        proxy: {
            "/api-mp": {
                target: "https://api.mercadopago.com",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api-mp/, ""),
            },
        },
    },
    preview: {
        host: true,
        proxy: {
            "/api-mp": {
                target: "https://api.mercadopago.com",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api-mp/, ""),
            },
        },
    },
})
