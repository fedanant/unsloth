// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { useChatRuntimeStore } from "@/features/chat/stores/chat-runtime-store";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon, PlusIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useEffect, useState } from "react";
import { useQuickPromptStore } from "../stores/quick-prompt-store";
import { QuickPromptAttachments } from "./quick-prompt-attachments";
import { QuickPromptComposer } from "./quick-prompt-composer";
import { QuickPromptConversation } from "./quick-prompt-conversation";
import { QuickPromptModelPill } from "./quick-prompt-model-pill";

export function QuickPromptModal() {
  const isOpen = useQuickPromptStore((s) => s.isOpen);
  const close = useQuickPromptStore((s) => s.close);
  const mode = useQuickPromptStore((s) => s.mode);
  const resetToCompact = useQuickPromptStore((s) => s.resetToCompact);
  const activeThreadId = useQuickPromptStore((s) => s.activeThreadId);
  const addAttachment = useQuickPromptStore((s) => s.addAttachment);

  const navigate = useNavigate();
  const [isDragOver, setIsDragOver] = useState(false);

  // NOTE: Global shortcut (Ctrl+Shift+Space) is now handled entirely by the
  // standalone "quick-prompt" Tauri window. This in-app modal is only opened
  // via the overlay button inside chat threads.

  const handleClose = () => {
    close();
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleOpenInFullChat = () => {
    useQuickPromptStore.setState({ wasOpenedFromGlobal: false });
    close();
    if (activeThreadId) {
      useChatRuntimeStore.getState().setActiveThreadId(activeThreadId);
      void navigate({
        to: "/chat",
        search: { thread: activeThreadId },
      });
    } else {
      void navigate({ to: "/chat" });
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
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] sm:pt-[15vh] px-4 pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
          />

          {/* Floating Card */}
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ type: "spring", damping: 28, stiffness: 350 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => void handleDrop(e)}
            className={`relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-2xl backdrop-blur-xl transition-all ${
              mode === "expanded"
                ? "max-w-2xl min-h-[380px] max-h-[78vh]"
                : "max-w-xl"
            } ${
              isDragOver ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
            }`}
          >
            {/* Header Toolbar */}
            <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5 bg-muted/20">
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

              <div className="flex items-center gap-1">
                {mode === "expanded" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenInFullChat}
                    className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    title="Open in full chat view"
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
      )}
    </AnimatePresence>
  );
}
