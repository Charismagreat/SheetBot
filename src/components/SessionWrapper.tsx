"use client";

import React, { useState, useEffect } from "react";
import { SessionProvider } from "next-auth/react";

function getInitialBasePath() {
  if (typeof window !== "undefined") {
    const match = window.location.pathname.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
    if (match) {
      return `${match[1]}/api/auth`;
    }
  }
  return "/api/auth";
}

export default function SessionWrapper({ children }: { children: React.ReactNode }) {
  const [basePath, setBasePath] = useState(getInitialBasePath);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const match = window.location.pathname.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
      if (match) {
        const detected = `${match[1]}/api/auth`;
        if (basePath !== detected) {
          setBasePath(detected);
        }
      }
    }
  }, [basePath]);

  return <SessionProvider basePath={basePath}>{children}</SessionProvider>;
}
