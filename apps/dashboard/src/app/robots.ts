import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/docs", "/pricing", "/status", "/terms", "/privacy"],
        disallow: ["/dashboard/", "/api/", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"],
      },
    ],
    sitemap: "https://liveport.dev/sitemap.xml",
  };
}
