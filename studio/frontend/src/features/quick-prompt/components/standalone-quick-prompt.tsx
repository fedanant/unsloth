// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { ExternalLinkIcon, PlusIcon, XIcon } from "lucide-react";
import { motion } from "motion/react";
import { type DragEvent, type MouseEvent, useEffect, useState } from "react";
import { useQuickPromptStore } from "../stores/quick-prompt-store";
import { QuickPromptAttachments } from "./quick-prompt-attachments";
import { QuickPromptComposer } from "./quick-prompt-composer";
import { QuickPromptConversation } from "./quick-prompt-conversation";
import { QuickPromptModelPill } from "./quick-prompt-model-pill";

export function StandaloneQuickPrompt() {
  const mode = useQuickPromptStore((s) => s.mode);
  const resetToCompact = useQuickPromptStore((s) => s.resetToCompact);
  const activeThreadId = useQuickPromptStore((s) => s.activeThreadId);
  const addAttachment = useQuickPromptStore((s) => s.addAttachment);
  const open = useQuickPromptStore((s) => s.open);

  const [isDragOver, setIsDragOver] = useState(false);

  // Auto-open on mount & listen to focus events
  useEffect(() => {
    open();

    let unlisten: (() => void) | undefined;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/event").then(({ listen }) => {
        listen("focus-prompt", () => {
          open();
        }).then((fn) => {
          unlisten = fn;
        });
      }).catch(() => null);
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [open]);

  const handleClose = () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke("hide_quick_prompt_window").catch(() => null);
      }).catch(() => null);
    }
  };

  const handleOpenInFullChat = () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke("open_chat_in_main_window", { threadId: activeThreadId ?? null }).catch(() => null);
      }).catch(() => null);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Universal window dragging on primary mouse button press anywhere except controls
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("a") ||
      target.closest("[role='button']") ||
      target.closest("[data-radix-popper-content-wrapper]") ||
      target.closest(".no-drag") ||
      target.closest(".cm-editor") ||
      target.closest("pre") ||
      target.closest("code")
    ) {
      return;
    }

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging().catch(() => null);
      }).catch(() => null);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (file) {
          await addAttachment(file);
        }
      }
    }
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="fixed inset-0 flex flex-col items-center justify-start p-3 bg-transparent select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Floating Card */}
      <motion.div
        layout
        data-tauri-drag-region
        onMouseDown={handleMouseDown}
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 350 }}
        className={`relative flex w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-2xl backdrop-blur-2xl transition-all ${
          mode === "expanded"
            ? "max-w-2xl min-h-[380px] max-h-[88vh]"
            : "max-w-xl"
        } ${
          isDragOver ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
        }`}
      >
        {/* Header Toolbar */}
        <div
          data-tauri-drag-region
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5 bg-muted/20 cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-2">
            <QuickPromptModelPill />
            {mode === "expanded" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetToCompact}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Start new conversation"
              >
                <PlusIcon className="size-3.5" />
                <span>New</span>
              </Button>
            )}
          </div>

          {/* Central draggable drag handle space */}
          <div
            data-tauri-drag-region
            onMouseDown={handleMouseDown}
            className="flex-1 h-7 min-w-[32px] cursor-grab active:cursor-grabbing"
          />

          <div className="flex items-center gap-1">
            {mode === "expanded" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOpenInFullChat}
                className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80"
                title="Open in full chat window"
              >
                <span>Open in Chat</span>
                <ExternalLinkIcon className="size-3.5" />
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleClose}
              className="size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Close (Esc)"
              aria-label="Close Quick Prompt"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Conversation view when expanded */}
        {mode === "expanded" && <QuickPromptConversation />}

        {/* File Attachments */}
        <QuickPromptAttachments />

        {/* Input Composer */}
        <QuickPromptComposer />

        {/* Drag Overlay hint */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-xs">
            <div className="text-center">
              <p className="text-sm font-semibold text-primary">
                Drop files here to attach
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Images and text files will be added to the prompt
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
