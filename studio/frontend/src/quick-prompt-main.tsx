// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { tauriAutoAuth } from "@/features/auth";
import { bootstrapPersistedCredentials } from "@/features/credentials/bootstrap";
import { StandaloneQuickPrompt } from "@/features/quick-prompt";
import { initializeLocale } from "./i18n";
import { isTauri, setApiBase } from "./lib/api-base";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}
const root = createRoot(rootElement);

if (isTauri) {
  document.documentElement.classList.add("tauri");
}
document.documentElement.classList.add("bg-transparent");
document.body.classList.add("bg-transparent");

async function initQuickPrompt(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");

      // Listen for server port broadcast
      void listen<number>("server-port", (e) => {
        if (e.payload) {
          setApiBase(e.payload);
        }
      });

      // Fetch preflight to resolve backend port immediately
      const preflight = await invoke<{ disposition: string; port: number | null }>(
        "desktop_preflight",
      );
      if (preflight?.port) {
        setApiBase(preflight.port);
      }
      await tauriAutoAuth({ force: true });
      await bootstrapPersistedCredentials();
    } catch (e) {
      console.error("Failed to initialize desktop quick-prompt session:", e);
    }
  }

  const localeInitialization = initializeLocale();
  if (typeof localeInitialization !== "string") {
    await localeInitialization;
  }

  root.render(
    <StrictMode>
      <TooltipProvider>
        <StandaloneQuickPrompt />
        <Toaster />
      </TooltipProvider>
    </StrictMode>,
  );
}

void initQuickPrompt();
