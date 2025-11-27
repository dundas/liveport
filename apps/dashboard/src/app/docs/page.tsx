"use client";

/**
 * API Documentation Page
 *
 * Renders Swagger UI for interactive API documentation.
 * Uses the CDN version of Swagger UI to avoid bundling issues.
 */

import { useEffect, useRef } from "react";
import Script from "next/script";

// Extend window type for Swagger UI globals
declare global {
  interface Window {
    SwaggerUIBundle?: {
      (config: Record<string, unknown>): void;
      presets: {
        apis: unknown;
      };
    };
    SwaggerUIStandalonePreset?: unknown;
  }
}

export default function DocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Initialize Swagger UI after scripts load
    const initSwagger = () => {
      if (
        initializedRef.current ||
        !containerRef.current ||
        typeof window === "undefined" ||
        !window.SwaggerUIBundle
      ) {
        return;
      }

      initializedRef.current = true;

      window.SwaggerUIBundle({
        url: "/api/docs",
        dom_id: "#swagger-ui",
        presets: [window.SwaggerUIBundle.presets.apis, window.SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
        deepLinking: true,
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
        docExpansion: "list",
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      });
    };

    // Check if already loaded
    if (window.SwaggerUIBundle) {
      initSwagger();
    }

    // Listen for script load
    window.addEventListener("swagger-ui-loaded", initSwagger);
    return () => window.removeEventListener("swagger-ui-loaded", initSwagger);
  }, []);

  return (
    <>
      {/* Swagger UI CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css"
      />

      {/* Swagger UI Scripts */}
      <Script
        src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.dispatchEvent(new Event("swagger-ui-loaded"));
        }}
      />
      <Script
        src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"
        strategy="afterInteractive"
      />

      <div className="min-h-screen bg-white">
        <div id="swagger-ui" ref={containerRef} />
      </div>

      <style jsx global>{`
        .swagger-ui .topbar {
          display: none;
        }
        .swagger-ui .information-container {
          padding: 20px;
        }
        .swagger-ui .scheme-container {
          padding: 20px;
          background: #fafafa;
        }
      `}</style>
    </>
  );
}
