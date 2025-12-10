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
        presets: [
          window.SwaggerUIBundle.presets.apis,
          window.SwaggerUIStandalonePreset
        ],
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

      <div className="w-full max-w-7xl mx-auto px-6 lg:px-12 py-8">
        <div id="swagger-ui" ref={containerRef} />
      </div>

      <style jsx global>{`
        /* Hide default topbar */
        .swagger-ui .topbar {
          display: none;
        }

        /* Apply dark theme and font */
        .swagger-ui {
          background: #050505 !important;
          color: #e0e0e0 !important;
          font-family: 'JetBrains Mono', monospace !important;
        }

        /* Info section */
        .swagger-ui .information-container {
          background: transparent !important;
          padding: 0 !important;
          margin-bottom: 2rem !important;
        }

        .swagger-ui .info {
          background: #1a1a1a !important;
          border: 1px solid #333333 !important;
          padding: 2rem !important;
          margin: 0 !important;
        }

        .swagger-ui .info .title {
          color: #00ff41 !important;
          font-weight: bold !important;
          text-transform: uppercase !important;
        }

        .swagger-ui .info p,
        .swagger-ui .info li {
          color: #888888 !important;
        }

        /* Scheme container */
        .swagger-ui .scheme-container {
          background: #000000 !important;
          border: 1px solid #333333 !important;
          padding: 1rem !important;
          margin-bottom: 2rem !important;
        }

        /* Operation blocks */
        .swagger-ui .opblock {
          background: #1a1a1a !important;
          border: 1px solid #333333 !important;
          margin-bottom: 1rem !important;
        }

        .swagger-ui .opblock-summary {
          background: #000000 !important;
          border-bottom: 1px solid #333333 !important;
        }

        .swagger-ui .opblock-summary:hover {
          background: #1a1a1a !important;
        }

        .swagger-ui .opblock-summary-method {
          background: #00ff41 !important;
          color: #000000 !important;
          font-weight: bold !important;
        }

        .swagger-ui .opblock-summary-path {
          color: #e0e0e0 !important;
        }

        .swagger-ui .opblock-body {
          background: #000000 !important;
        }

        /* Buttons */
        .swagger-ui .btn {
          background: #1a1a1a !important;
          border: 1px solid #333333 !important;
          color: #e0e0e0 !important;
          font-family: 'JetBrains Mono', monospace !important;
        }

        .swagger-ui .btn:hover {
          background: #333333 !important;
        }

        .swagger-ui .btn.execute {
          background: #00ff41 !important;
          color: #000000 !important;
          border: 1px solid #00ff41 !important;
          font-weight: bold !important;
        }

        .swagger-ui .btn.execute:hover {
          background: #00cc33 !important;
        }

        /* Input fields */
        .swagger-ui input,
        .swagger-ui textarea,
        .swagger-ui select {
          background: #000000 !important;
          border: 1px solid #333333 !important;
          color: #e0e0e0 !important;
          font-family: 'JetBrains Mono', monospace !important;
        }

        .swagger-ui input:focus,
        .swagger-ui textarea:focus,
        .swagger-ui select:focus {
          border-color: #00ff41 !important;
          outline: none !important;
        }

        /* Tables */
        .swagger-ui table {
          background: #000000 !important;
          border: 1px solid #333333 !important;
        }

        .swagger-ui table thead tr {
          background: #1a1a1a !important;
          border-bottom: 1px solid #333333 !important;
        }

        .swagger-ui table tbody tr {
          border-bottom: 1px solid #333333 !important;
        }

        .swagger-ui table th,
        .swagger-ui table td {
          color: #e0e0e0 !important;
        }

        /* Code blocks */
        .swagger-ui .highlight-code,
        .swagger-ui .microlight {
          background: #000000 !important;
          border: 1px solid #333333 !important;
          color: #e0e0e0 !important;
          font-family: 'JetBrains Mono', monospace !important;
        }

        /* Response area */
        .swagger-ui .responses-inner {
          background: #000000 !important;
          border: 1px solid #333333 !important;
        }

        .swagger-ui .response-col_status {
          color: #00ff41 !important;
        }

        .swagger-ui .response-col_description {
          color: #888888 !important;
        }

        /* Models */
        .swagger-ui .model-box {
          background: #000000 !important;
          border: 1px solid #333333 !important;
        }

        .swagger-ui .model-title {
          color: #00ff41 !important;
        }

        .swagger-ui .model {
          color: #e0e0e0 !important;
        }

        /* Parameters */
        .swagger-ui .parameters-col_name {
          color: #e0e0e0 !important;
        }

        .swagger-ui .parameters-col_description {
          color: #888888 !important;
        }

        .swagger-ui .parameter__name.required span {
          color: #ff0000 !important;
        }

        /* Try it out */
        .swagger-ui .try-out {
          background: #1a1a1a !important;
          border: 1px solid #333333 !important;
        }

        /* Auth */
        .swagger-ui .auth-wrapper {
          background: #000000 !important;
          border: 1px solid #333333 !important;
        }

        /* Scrollbars */
        .swagger-ui ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .swagger-ui ::-webkit-scrollbar-track {
          background: #000000;
        }

        .swagger-ui ::-webkit-scrollbar-thumb {
          background: #333333;
          border-radius: 0;
        }

        .swagger-ui ::-webkit-scrollbar-thumb:hover {
          background: #00ff41;
        }
      `}</style>
    </>
  );
}
