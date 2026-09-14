import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("xlsx")) return "vendor-xlsx";
          if (id.includes("pdfkit") || id.includes("qrcode") || id.includes("jsbarcode") || id.includes("react-barcode") || id.includes("react-qr-code")) {
            return "vendor-print";
          }
          if (id.includes("mapbox-gl")) return "vendor-maps";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@supabase")) return "vendor-supabase";
          return undefined;
        },
      },
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});