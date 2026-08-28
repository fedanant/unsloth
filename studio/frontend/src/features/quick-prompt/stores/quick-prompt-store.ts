// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { create } from "zustand";
import {
  saveChatMessage,
  saveChatThread,
  streamChatCompletions,
} from "@/features/chat/api/chat-api";
import { encryptProviderApiKey } from "@/features/chat/api/providers-api";
import {
  getExternalProviderApiKey,
  isExternalModelId,
  loadExternalProviders,
  parseExternalModelId,
} from "@/features/chat/external-providers";
import { useChatRuntimeStore } from "@/features/chat/stores/chat-runtime-store";
import type {
  OpenAIChatMessage,
  OpenAIChatCompletionsRequest,
} from "@/features/chat/types/api";
import { fileToBase64 } from "@/lib/audio-utils";

export interface QuickPromptAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  textContent?: string;
  isImage: boolean;
  base64?: string;
}

export interface QuickPromptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ name: string; isImage?: boolean }>;
  timestamp: number;
}

interface QuickPromptState {
  isOpen: boolean;
  wasOpenedFromGlobal: boolean;
  mode: "compact" | "expanded";
  promptText: string;
  attachedFiles: QuickPromptAttachment[];
  selectedModel: string | null;
  messages: QuickPromptMessage[];
  isGenerating: boolean;
  generationError: string | null;
  activeThreadId: string | null;
  abortController: AbortController | null;

  // Actions
  open: (options?: { threadId?: string; model?: string; fromGlobalShortcut?: boolean }) => void;
  close: () => void;
  toggle: (options?: { fromGlobalShortcut?: boolean }) => void;
  setPromptText: (text: string) => void;
  setSelectedModel: (model: string | null) => void;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  resetToCompact: () => void;
  stopGeneration: () => void;
  sendMessage: (textOverride?: string) => Promise<void>;
}

function isTextFile(file: File): boolean {
  return (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/javascript" ||
    file.type === "application/typescript" ||
    /\.(txt|md|py|js|ts|tsx|jsx|json|yaml|yml|rs|c|cpp|h|hpp|sh|ps1|bat|css|html|xml|toml|sql|csv)$/i.test(
      file.name,
    )
  );
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export const useQuickPromptStore = create<QuickPromptState>((set, get) => ({
  isOpen: false,
  wasOpenedFromGlobal: false,
  mode: "compact",
  promptText: "",
  attachedFiles: [],
  selectedModel: null,
  messages: [],
  isGenerating: false,
  generationError: null,
  activeThreadId: null,
  abortController: null,

  open: (options) => {
    const currentModel =
      options?.model ??
      get().selectedModel ??
      useChatRuntimeStore.getState().params.checkpoint ??
      null;

    const existingMessages = get().messages;
    // If there are already messages in the conversation, stay/switch to expanded
    const mode =
      existingMessages.length > 0 || options?.threadId ? "expanded" : get().mode;

    set({
      isOpen: true,
      wasOpenedFromGlobal: options?.fromGlobalShortcut ?? false,
      selectedModel: currentModel,
      mode,
      ...(options?.threadId ? { activeThreadId: options.threadId } : {}),
    });
  },

  close: () => {
    set({ isOpen: false, wasOpenedFromGlobal: false });
  },

  toggle: (options) => {
    const { isOpen } = get();
    if (isOpen) {
      get().close();
    } else {
      get().open(options);
    }
  },

  setPromptText: (text) => set({ promptText: text }),

  setSelectedModel: (model) => set({ selectedModel: model }),

  addAttachment: async (file: File) => {
    const isImg = isImageFile(file);
    const isTxt = isTextFile(file);
    let base64: string | undefined;
    let textContent: string | undefined;

    try {
      if (isImg) {
        base64 = await fileToBase64(file);
      } else if (isTxt) {
        textContent = await file.text();
      }
    } catch {
      // Fall back if file read fails
    }

    const attachment: QuickPromptAttachment = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      isImage: isImg,
      base64,
      textContent,
    };

    set((state) => ({
      attachedFiles: [...state.attachedFiles, attachment],
    }));
  },

  removeAttachment: (id) =>
    set((state) => ({
      attachedFiles: state.attachedFiles.filter((f) => f.id !== id),
    })),

  clearAttachments: () => set({ attachedFiles: [] }),

  resetToCompact: () => {
    get().stopGeneration();
    set({
      mode: "compact",
      promptText: "",
      attachedFiles: [],
      messages: [],
      generationError: null,
      activeThreadId: null,
    });
  },

  stopGeneration: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set({ isGenerating: false, abortController: null });
  },

  sendMessage: async (textOverride?: string) => {
    const state = get();
    const rawText = textOverride ?? state.promptText;
    const text = rawText.trim();

    if (!text && state.attachedFiles.length === 0) return;
    if (state.isGenerating) return;

    const threadId = state.activeThreadId ?? crypto.randomUUID();
    const activeModel =
      state.selectedModel ??
      useChatRuntimeStore.getState().params.checkpoint ??
      "default";

    // Prepare contextual text with file contents if present
    let fullPrompt = text;
    for (const file of state.attachedFiles) {
      if (file.textContent) {
        fullPrompt += `\n\n--- Attached File: ${file.name} ---\n${file.textContent}\n--- End of ${file.name} ---`;
      }
    }

    const userMessage: QuickPromptMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || `[Attached: ${state.attachedFiles.map((f) => f.name).join(", ")}]`,
      attachments: state.attachedFiles.map((f) => ({
        name: f.name,
        isImage: f.isImage,
      })),
      timestamp: Date.now(),
    };

    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: QuickPromptMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    const newMessages = [...state.messages, userMessage, assistantMessage];
    const imageAttachment = state.attachedFiles.find((f) => f.isImage && f.base64);

    const abortController = new AbortController();

    set({
      mode: "expanded",
      messages: newMessages,
      promptText: "",
      attachedFiles: [],
      isGenerating: true,
      generationError: null,
      activeThreadId: threadId,
      abortController,
    });

    // Build OAI chat messages payload
    const oaiMessages: OpenAIChatMessage[] = newMessages
      .filter((m) => m.id !== assistantMessageId)
      .map((m) => ({
        role: m.role,
        content: m.role === "user" && m.id === userMessage.id ? fullPrompt : m.content,
      }));

    try {
      // Save thread metadata to backend
      const title = text.slice(0, 40) || "Quick Chat";
      await saveChatThread({
        id: threadId,
        title,
        modelType: "base",
        modelId: activeModel,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }).catch(() => null);

      await saveChatMessage({
        id: userMessage.id,
        threadId: threadId,
        role: "user",
        content: [{ type: "text", text: userMessage.content }],
        createdAt: userMessage.timestamp,
      }).catch(() => null);

      // Build request payload for either External Provider or Local Engine
      let requestPayload: OpenAIChatCompletionsRequest;

      if (isExternalModelId(activeModel)) {
        const externalSelection = parseExternalModelId(activeModel);
        const provider = externalSelection
          ? loadExternalProviders().find((p) => p.id === externalSelection.providerId)
          : null;

        if (!provider || !externalSelection) {
          throw new Error("Selected external model connection not found.");
        }

        const externalApiKey = !provider.hasApiKey
          ? getExternalProviderApiKey(provider.id).trim()
          : "";

        const encryptedKey = externalApiKey
          ? await encryptProviderApiKey(externalApiKey).catch(() => undefined)
          : undefined;

        requestPayload = {
          model: externalSelection.modelId,
          messages: oaiMessages,
          stream: true,
          max_tokens: 4096,
          provider_id: provider.id,
          provider_type: provider.providerType,
          external_model: externalSelection.modelId,
          provider_base_url: provider.baseUrl || null,
          ...(encryptedKey ? { encrypted_api_key: encryptedKey } : {}),
          image_base64: imageAttachment?.base64,
        };
      } else {
        requestPayload = {
          model: activeModel,
          messages: oaiMessages,
          stream: true,
          max_tokens: 4096,
          image_base64: imageAttachment?.base64,
        };
      }

      let streamContent = "";
      const stream = streamChatCompletions(
        requestPayload,
        abortController.signal,
      );

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          streamContent += delta;
          set((s) => ({
            messages: s.messages.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: streamContent }
                : msg,
            ),
          }));
        }
      }

      // Save final assistant message to backend
      await saveChatMessage({
        id: assistantMessageId,
        threadId: threadId,
        role: "assistant",
        content: [{ type: "text", text: streamContent }],
        createdAt: Date.now(),
      }).catch(() => null);

      set({ isGenerating: false, abortController: null });
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        set({ isGenerating: false, abortController: null });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to generate response";
      set({
        isGenerating: false,
        generationError: message,
        abortController: null,
      });
    }
  },
}));
