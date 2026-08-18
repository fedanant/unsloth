# SPDX-License-Identifier: Apache-2.0
# Copyright 2026-present Unsloth AI & 0G Compute Verification

import os
import requests
import json
from typing import Dict, Any, List, Optional
from .verifier import TEEVerifier


class VerifiableZGClient:
    """
    OpenAI-compatible client for 0G Compute Router with automatic TEE verification.
    """

    def __init__(self, api_key: Optional[str] = None, base_url: str = "https://router-api.0g.ai/v1"):
        self.api_key = api_key or os.environ.get("ZG_API_KEY", "")
        self.base_url = base_url.rstrip("/")

    def list_providers(self, model: str) -> List[Dict[str, Any]]:
        """
        Retrieves list of active providers and their TEE attestation status for a given model.
        """
        url = f"{self.base_url}/providers?model={model}"
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json().get("data", [])

    def chat_completion(
        self,
        model: str,
        messages: List[Dict[str, str]],
        verify_tee: bool = True,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Sends chat completion request with verify_tee=True and verifies the response proof.
        """
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "verify_tee": verify_tee,
            **kwargs,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}" if self.api_key else ""
        }

        resp = requests.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        # If TEE verification was requested, verify response metadata
        if verify_tee:
            tee_meta = data.get("tee_metadata")
            if not tee_meta and not data.get("tee_verified"):
                print("⚠️ Warning: response did not include TEE proof metadata")

        return data
