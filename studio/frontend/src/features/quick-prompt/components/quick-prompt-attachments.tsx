// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { FileTextIcon, ImageIcon, PaperclipIcon, XIcon } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import {
  type QuickPromptAttachment,
  useQuickPromptStore,
} from "../stores/quick-prompt-store";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function QuickPromptAttachments() {
  const attachedFiles = useQuickPromptStore((s) => s.attachedFiles);
  const removeAttachment = useQuickPromptStore((s) => s.removeAttachment);

  if (attachedFiles.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-t border-border/40 bg-muted/20">
      {attachedFiles.map((file) => (
        <div
          key={file.id}
          className="group flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-2 py-1 text-xs shadow-xs transition-colors hover:border-border"
        >
          {file.isImage ? (
            <ImageIcon className="size-3.5 text-blue-500 shrink-0" />
          ) : (
            <FileTextIcon className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="max-w-[140px] truncate font-medium">{file.name}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatFileSize(file.size)}
          </span>
          <button
            type="button"
            onClick={() => removeAttachment(file.id)}
            className="ml-0.5 rounded-sm p-0.5 text-muted-foreground/60 opacity-60 transition-all hover:bg-muted hover:text-foreground hover:opacity-100"
            aria-label={`Remove ${file.name}`}
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function QuickPromptAttachButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAttachment = useQuickPromptStore((s) => s.addAttachment);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) {
        await addAttachment(file);
      }
    }
    // Reset file input value
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => fileInputRef.current?.click()}
        className="size-8 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Attach file (images, documents, code)"
        aria-label="Attach file"
      >
        <PaperclipIcon className="size-4" />
      </Button>
    </>
  );
}
