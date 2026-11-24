import type { NextConfig } from "next";

// LK_STATIC=1 — статичная копия для обычного хостинга (SpaceWeb): страницы и данные готовятся заранее, сервер не нужен.
const isStatic = process.env.LK_STATIC === "1";

const nextConfig: NextConfig = isStatic ? { output: "export" } : {};

export default nextConfig;
