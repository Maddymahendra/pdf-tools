import type { APIRoute } from "astro";
import { tools } from "../lib/tools";

const urls = [
  "https://deshfiles.com/",
  ...tools
    .filter((tool) => tool.status === "available")
    .map((tool) => `https://deshfiles.com/tools/${tool.slug}/`)
];

export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
};
