"use client";

import { useEffect } from "react";

// Registers the service worker. No-ops on insecure origins (the browser only
// allows SW over HTTPS or localhost — a LAN http:// dev URL won't register).
export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
