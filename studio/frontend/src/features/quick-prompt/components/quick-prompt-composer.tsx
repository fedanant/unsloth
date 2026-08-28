// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { useQuickPromptStore } from "../stores/quick-prompt-store";
import { QuickPromptAttachButton } from "./quick-prompt-attachments";
import { QuickPromptVoiceButton } from "./quick-prompt-voice";

export function QuickPromptComposer() {
  const promptText = useQuickPromptStore((s) => s.promptText);
  const setPromptText = useQuickPromptStore((s) => s.setPromptText);
  const sendMessage = useQuickPromptStore((s) => s.sendMessage);
  const isGenerating = useQuickPromptStore((s) => s.isGenerating);
  const stopGeneration = useQuickPromptStore((s) => s.stopGeneration);
  const mode = useQuickPromptStore((s) => s.mode);
  const attachedFiles = useQuickPromptStore((s) => s.attachedFiles);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on open
  useEffect(() => {
    textareaRef.current?.focus();
  }, [mode]);

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [promptText]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isGenerating) return;
      void sendMessage();
    }
  };

  const hasContent = promptText.trim().length > 0 || attachedFiles.length > 0;

  return (
    <div className="flex flex-col gap-2 p-3 bg-background/50">
      <div className="relative flex items-center">
        <textarea
          ref={textareaRef}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            mode === "expanded"
              ? "Ask a follow-up..."
              : "Type a prompt or speak…"
          }
          className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none max-h-40 leading-relaxed font-sans"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1">
          <QuickPromptAttachButton />
          <QuickPromptVoiceButton />
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/50 select-none">
            <span>↵ Send</span>
            <span>·</span>
            <span>⇧↵ Newline</span>
          </div>

          {isGenerating ? (
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              onClick={stopGeneration}
              className="size-8 rounded-lg shadow-xs"
              title="Stop generating"
              aria-label="Stop generating"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="icon-sm"
              disabled={!hasContent}
              onClick={() => void sendMessage()}
              className="size-8 rounded-lg shadow-xs transition-transform active:scale-95 disabled:opacity-30"
              title="Send (Enter)"
              aria-label="Send prompt"
            >
              <ArrowUpIcon className="size-4 stroke-[2.5]" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
