import type { MetadataRoute } from "next";

const BASE_URL = "https://liveport.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date("2026-03-14"),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/docs`,
      lastModified: new Date("2026-03-14"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: new Date("2026-03-14"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/status`,
      lastModified: new Date("2026-03-14"),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date("2026-03-14"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date("2026-03-14"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
