import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    host: "0.0.0.0",
    // Required for Render preview server URLs.
    allowedHosts: [".onrender.com", "localhost", "127.0.0.1"],
  },
});
