"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html>
      <body>
        <div style={{
          minHeight: "100vh",
          backgroundColor: "#f9fafb",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}>
          <div style={{
            maxWidth: "28rem",
            width: "100%",
            backgroundColor: "white",
            borderRadius: "0.5rem",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            padding: "2rem",
            textAlign: "center",
          }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <svg
                style={{ margin: "0 auto", height: "4rem", width: "4rem", color: "#ef4444" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1 style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              color: "#111827",
              marginBottom: "0.5rem",
            }}>
              Application Error
            </h1>

            <p style={{
              color: "#6b7280",
              marginBottom: "1.5rem",
            }}>
              A critical error occurred. Please try refreshing the page.
            </p>

            {error.digest && (
              <p style={{
                fontSize: "0.875rem",
                color: "#9ca3af",
                marginBottom: "1rem",
                fontFamily: "monospace",
              }}>
                Error ID: {error.digest}
              </p>
            )}

            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "0.5rem 1rem",
                backgroundColor: "#4f46e5",
                color: "white",
                borderRadius: "0.375rem",
                border: "none",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
