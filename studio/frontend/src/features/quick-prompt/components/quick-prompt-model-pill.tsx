// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeviceInventorySources } from "@/features/hub/inventory";
import { useChatRuntimeStore } from "@/features/chat/stores/chat-runtime-store";
import { useExternalProvidersStore } from "@/features/chat/stores/external-providers-store";
import {
  buildExternalModelId,
  isExternalModelId,
  parseExternalModelId,
} from "@/features/chat/external-providers";
import { externalModelLabel } from "@/features/chat/lib/external-model-label";
import { useQuickPromptStore } from "../stores/quick-prompt-store";
import {
  SparklesIcon,
  ChevronDownIcon,
  SearchIcon,
  CloudIcon,
  HardDriveIcon,
  CheckIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

interface ModelItem {
  id: string;
  name: string;
  category: "external" | "local" | "gguf";
  providerName?: string;
}

export function QuickPromptModelPill() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedModel = useQuickPromptStore((s) => s.selectedModel);
  const setSelectedModel = useQuickPromptStore((s) => s.setSelectedModel);
  const runtimeModel = useChatRuntimeStore((s) => s.params.checkpoint);

  const externalProviders = useExternalProvidersStore((s) => s.providers);
  const connectionsEnabled = useExternalProvidersStore((s) => s.connectionsEnabled);

  const { localModels, cachedGguf } = useDeviceInventorySources([
    "localModels",
    "cachedGguf",
  ]);

  const rawModel: string = selectedModel || runtimeModel || "Select model";
  const activeModel = rawModel;

  // Clean short display name for the pill trigger
  const displayName = useMemo(() => {
    if (!rawModel || rawModel === "Select model") return "Select model";
    if (isExternalModelId(rawModel)) {
      const parsed = parseExternalModelId(rawModel);
      if (parsed) {
        const provider = externalProviders.find((p) => p.id === parsed.providerId);
        const modelName = parsed.modelId.split("/").pop() || parsed.modelId;
        return provider ? `${provider.name}: ${modelName}` : modelName;
      }
      return externalModelLabel(rawModel) || rawModel;
    }
    const str: string = rawModel;
    const parts = str.split("/");
    const last = parts[parts.length - 1] || str;
    return last.replace(/-gguf$/i, "").replace(/\.gguf$/i, "");
  }, [rawModel, externalProviders]);

  // Aggregate all available models (External + Local + GGUF)
  const allModels = useMemo<ModelItem[]>(() => {
    const list: ModelItem[] = [];

    // 1. External Models
    if (connectionsEnabled && Array.isArray(externalProviders)) {
      for (const provider of externalProviders) {
        if (provider.models && Array.isArray(provider.models)) {
          for (const m of provider.models) {
            const externalId = buildExternalModelId(provider.id, m);
            list.push({
              id: externalId,
              name: m,
              category: "external",
              providerName: provider.name,
            });
          }
        }
      }
    }

    // 2. Local Models
    if (localModels?.rows) {
      for (const m of localModels.rows) {
        const id = m.path || m.display_name;
        if (!list.some((item) => item.id === id)) {
          list.push({
            id,
            name: m.display_name,
            category: "local",
          });
        }
      }
    }

    // 3. Cached GGUF Models
    if (cachedGguf?.rows) {
      for (const m of cachedGguf.rows) {
        if (!list.some((item) => item.id === m.repo_id)) {
          list.push({
            id: m.repo_id,
            name: m.repo_id.split("/").pop() || m.repo_id,
            category: "gguf",
          });
        }
      }
    }

    return list;
  }, [externalProviders, connectionsEnabled, localModels, cachedGguf]);

  // Filter by search query
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allModels;
    return allModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.providerName && m.providerName.toLowerCase().includes(q)) ||
        m.id.toLowerCase().includes(q),
    );
  }, [allModels, search]);

  const externalGroup = filteredModels.filter((m) => m.category === "external");
  const localGroup = filteredModels.filter((m) => m.category === "local" || m.category === "gguf");

  const handleSelectModel = (id: string) => {
    setSelectedModel(id);
    useChatRuntimeStore.getState().setCheckpoint(id, null);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="h-7 max-w-[260px] gap-1.5 rounded-full border-border/60 bg-muted/40 px-2.5 py-0 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
      >
        {isExternalModelId(activeModel) ? (
          <CloudIcon className="size-3 text-primary shrink-0" />
        ) : (
          <SparklesIcon className="size-3 text-primary shrink-0" />
        )}
        <span className="truncate">{displayName}</span>
        <ChevronDownIcon className="size-3 opacity-60 shrink-0" />
      </Button>

      {open && (
        <>
          {/* Backdrop to close on click outside */}
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setOpen(false)}
          />

          {/* Clean dropdown container anchored directly beneath the pill */}
          <div className="absolute left-0 top-full z-50 mt-1.5 w-80 rounded-xl border border-border/80 bg-background/98 p-0 shadow-2xl backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 duration-100">
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
              <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models or providers..."
                className="h-7 border-none bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
                autoFocus
              />
            </div>

            <ScrollArea className="max-h-72 p-1.5">
              {externalGroup.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <CloudIcon className="size-3" />
                    <span>External Models</span>
                  </div>
                  {externalGroup.map((model) => {
                    const isSelected = activeModel === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelectModel(model.id)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
                          isSelected ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                        }`}
                      >
                        <div className="flex flex-col truncate pr-2">
                          <span className="truncate">{model.name}</span>
                          {model.providerName && (
                            <span className="text-[10px] text-muted-foreground">
                              {model.providerName}
                            </span>
                          )}
                        </div>
                        {isSelected && <CheckIcon className="size-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {localGroup.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <HardDriveIcon className="size-3" />
                    <span>Local & GGUF Models</span>
                  </div>
                  {localGroup.map((model) => {
                    const isSelected = activeModel === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelectModel(model.id)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
                          isSelected ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                        }`}
                      >
                        <span className="truncate">{model.name}</span>
                        {isSelected && <CheckIcon className="size-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredModels.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {search ? "No matching models found" : "No models configured"}
                </div>
              )}
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}
