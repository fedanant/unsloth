// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  installLocalStorageFake,
  registerStoreStubResolver,
} from "./helpers/kit.ts";

registerStoreStubResolver();
installLocalStorageFake();

const {
  CUSTOM_ANTHROPIC_PROVIDER_TYPE,
  CUSTOM_ANTHROPIC_PROVIDER_DISPLAY_NAME,
  LEGACY_CUSTOM_PROVIDER_TYPE,
  customProviderBaseUrlPlaceholder,
  customProviderDisplayName,
  customProviderModelIdsPlaceholder,
  isCustomProviderType,
  providerTypeSupportsVision,
  supportsProviderPromptCaching,
  supportsProviderPromptCacheTtl,
  supportsRemoteModelCatalog,
  toExternalBackendProviderType,
} = await import("../src/features/chat/external-providers.ts");

const {
  resolveUiProviderTypeFromConfig,
  pruneProviderModelIds,
} = await import("../src/features/chat/sync-external-providers.ts");

const {
  getProviderCapabilities,
  providerSupportsBuiltinWebSearch,
  providerSupportsBuiltinWebFetch,
  providerSupportsFastMode,
  providerSupportsBuiltinCodeExecution,
  getExternalReasoningCapabilities,
} = await import("../src/features/chat/provider-capabilities.ts");

test("custom anthropic provider type identity and metadata", () => {
  assert.equal(CUSTOM_ANTHROPIC_PROVIDER_TYPE, "custom_anthropic");
  assert.equal(isCustomProviderType(CUSTOM_ANTHROPIC_PROVIDER_TYPE), true);
  assert.equal(isCustomProviderType(LEGACY_CUSTOM_PROVIDER_TYPE), true);

  assert.equal(
    customProviderDisplayName(CUSTOM_ANTHROPIC_PROVIDER_TYPE),
    CUSTOM_ANTHROPIC_PROVIDER_DISPLAY_NAME,
  );
  assert.equal(
    customProviderBaseUrlPlaceholder(CUSTOM_ANTHROPIC_PROVIDER_TYPE),
    "https://api.anthropic.com/v1",
  );
  assert.equal(
    customProviderModelIdsPlaceholder(CUSTOM_ANTHROPIC_PROVIDER_TYPE).includes("claude-sonnet-4-5"),
    true,
  );
  assert.equal(
    toExternalBackendProviderType(CUSTOM_ANTHROPIC_PROVIDER_TYPE),
    "custom_anthropic",
  );
});

test("custom anthropic capabilities match native anthropic", () => {
  assert.equal(supportsProviderPromptCaching(CUSTOM_ANTHROPIC_PROVIDER_TYPE), true);
  assert.equal(supportsProviderPromptCacheTtl(CUSTOM_ANTHROPIC_PROVIDER_TYPE), true);
  assert.equal(providerTypeSupportsVision(CUSTOM_ANTHROPIC_PROVIDER_TYPE), true);
  assert.equal(supportsRemoteModelCatalog(CUSTOM_ANTHROPIC_PROVIDER_TYPE), true);

  const caps = getProviderCapabilities(CUSTOM_ANTHROPIC_PROVIDER_TYPE);
  assert.ok(caps);
  assert.equal(caps.temperature, true);
  assert.equal(caps.topP, true);
  assert.equal(caps.topK, true);
  assert.equal(caps.presencePenalty, false);
  assert.equal(caps.repetitionPenalty, false);

  assert.equal(
    providerSupportsBuiltinWebSearch(CUSTOM_ANTHROPIC_PROVIDER_TYPE, "claude-sonnet-4-5"),
    true,
  );
  assert.equal(
    providerSupportsBuiltinWebFetch(CUSTOM_ANTHROPIC_PROVIDER_TYPE),
    true,
  );
  assert.equal(
    providerSupportsFastMode(CUSTOM_ANTHROPIC_PROVIDER_TYPE, "claude-opus-5"),
    true,
  );
  assert.equal(
    providerSupportsBuiltinCodeExecution(CUSTOM_ANTHROPIC_PROVIDER_TYPE, "claude-sonnet-4-5"),
    true,
  );

  const reasoningCaps = getExternalReasoningCapabilities(
    CUSTOM_ANTHROPIC_PROVIDER_TYPE,
    "claude-sonnet-4-5",
  );
  assert.equal(reasoningCaps.supportsReasoning, true);
  assert.equal(reasoningCaps.reasoningStyle, "reasoning_effort");
});

test("sync resolution and model pruning handle custom_anthropic", () => {
  const resolved = resolveUiProviderTypeFromConfig(
    "custom_anthropic",
    "My Anthropic Proxy",
    "https://my-proxy.com/v1",
    [],
    undefined,
  );
  assert.equal(resolved, "custom_anthropic");

  const pruned = pruneProviderModelIds(CUSTOM_ANTHROPIC_PROVIDER_TYPE, [
    "claude-3-5-sonnet-20241022",
    "claude-sonnet-4-5",
    "claude-opus-4-5",
  ]);
  assert.deepEqual(pruned, ["claude-sonnet-4-5", "claude-opus-4-5"]);
});
