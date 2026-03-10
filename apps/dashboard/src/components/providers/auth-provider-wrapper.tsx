"use client";

import { AuthProvider, useAuth } from "@/lib/auth-client";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";

function PostHogIdentify() {
  const { user } = useAuth();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    if (user) {
      posthog.identify(user.id);
      prevUserId.current = user.id;
    } else if (prevUserId.current) {
      // User logged out — reset PostHog and re-register persistent properties
      posthog.reset();
      posthog.register({ site: "liveport" });
      prevUserId.current = null;
    }
  }, [user?.id]);

  return null;
}

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PostHogIdentify />
      {children}
    </>
  );
}

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider baseUrl="/api/auth">
      <AuthProviderInner>{children}</AuthProviderInner>
    </AuthProvider>
  );
}
