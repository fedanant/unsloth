// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/markdown/markdown-preview";
import { toast } from "@/lib/toast";
import { BotIcon, CheckIcon, CopyIcon, FileTextIcon, ImageIcon, UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type QuickPromptMessage,
  useQuickPromptStore,
} from "../stores/quick-prompt-store";

function MessageCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy text");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={handleCopy}
      className="size-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
    </Button>
  );
}

export function QuickPromptConversation() {
  const messages = useQuickPromptStore((s) => s.messages);
  const isGenerating = useQuickPromptStore((s) => s.isGenerating);
  const generationError = useQuickPromptStore((s) => s.generationError);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message content
  useEffect(() => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  if (messages.length === 0) return null;

  return (
    <div
      ref={scrollViewportRef}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-4 max-h-[380px] scroll-smooth"
    >
      {messages.map((msg: QuickPromptMessage, index: number) => {
        const isUser = msg.role === "user";
        const isLastAssistant =
          !isUser && index === messages.length - 1 && isGenerating;

        return (
          <div
            key={msg.id}
            className={`group flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
          >
            {!isUser && (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                <BotIcon className="size-4" />
              </div>
            )}

            <div
              className={`relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                isUser
                  ? "bg-primary text-primary-foreground rounded-br-xs"
                  : "bg-muted/40 border border-border/50 rounded-bl-xs text-foreground"
              }`}
            >
              {/* Attachments preview on user message */}
              {isUser && msg.attachments && msg.attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {msg.attachments.map((att, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 rounded bg-black/20 px-1.5 py-0.5 text-[11px] text-primary-foreground/90 font-medium"
                    >
                      {att.isImage ? (
                        <ImageIcon className="size-3" />
                      ) : (
                        <FileTextIcon className="size-3" />
                      )}
                      <span className="truncate max-w-[120px]">{att.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Message Content */}
              {isUser ? (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              ) : (
                <div className="relative break-words leading-relaxed text-sm">
                  {msg.content ? (
                    <MarkdownPreview markdown={msg.content} />
                  ) : isLastAssistant ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs py-1">
                      <span className="size-1.5 animate-ping rounded-full bg-primary" />
                      Thinking…
                    </div>
                  ) : null}

                  {/* Streaming cursor */}
                  {isLastAssistant && msg.content && (
                    <span className="inline-block size-1.5 ml-1 animate-pulse rounded-full bg-primary align-middle" />
                  )}

                  {!isLastAssistant && msg.content && (
                    <div className="absolute top-0 right-0 -mt-2 -mr-2">
                      <MessageCopyButton content={msg.content} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {isUser && (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground border border-border/40">
                <UserIcon className="size-4" />
              </div>
            )}
          </div>
        );
      })}

      {generationError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <span className="font-semibold">Error:</span> {generationError}
        </div>
      )}
    </div>
  );
}
