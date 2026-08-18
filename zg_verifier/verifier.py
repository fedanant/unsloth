# SPDX-License-Identifier: Apache-2.0
# Copyright 2026-present Unsloth AI & 0G Compute Verification

import json
import hashlib
import base64
from typing import Dict, Any, Optional, Tuple


class TEEVerifier:
    """
    Hardware-level Remote Attestation & Signature Verifier for Intel TDX & 0G Compute.
    """

    @staticmethod
    def extract_quote_measurements(quote_hex: str) -> Dict[str, str]:
        """
        Parses binary Intel TDX Quote V4 bytes and extracts hardware registers directly.
        """
        quote_bytes = bytes.fromhex(quote_hex)
        if len(quote_bytes) < 632:
            raise ValueError(f"Invalid TDX Quote size: {len(quote_bytes)} bytes (expected >= 632)")

        mrtd = quote_bytes[184:232].hex()
        rtmr0 = quote_bytes[376:424].hex()
        rtmr1 = quote_bytes[424:472].hex()
        rtmr2 = quote_bytes[472:520].hex()
        rtmr3 = quote_bytes[520:568].hex()
        
        # Report data contains the TEE Ethereum address or public key hash
        raw_report_data = quote_bytes[568:632].decode("latin1", errors="ignore").replace("\x00", "").strip()

        return {
            "mrtd": mrtd,
            "rtmr0": rtmr0,
            "rtmr1": rtmr1,
            "rtmr2": rtmr2,
            "rtmr3": rtmr3,
            "report_data": raw_report_data,
        }

    @staticmethod
    def replay_event_log(event_log: list) -> Dict[int, str]:
        """
        Replays SHA-384 extend operations from event_log to compute expected RTMR0-3 registers:
        RTMR[i] = SHA384(RTMR[i] || EventDigest)
        """
        rtmr = {0: bytes(48), 1: bytes(48), 2: bytes(48), 3: bytes(48)}

        for entry in event_log:
            imr = entry.get("imr")
            digest_hex = entry.get("digest")
            if digest_hex and imr in rtmr:
                event_digest = bytes.fromhex(digest_hex)
                rtmr[imr] = hashlib.sha384(rtmr[imr] + event_digest).digest()

        return {i: rtmr[i].hex() for i in range(4)}

    @staticmethod
    def verify_compose_hash(tcb_info: Dict[str, Any], event_log: list) -> Tuple[bool, str, str]:
        """
        Calculates SHA-256 of app_compose configuration and checks against event_log compose-hash event.
        """
        app_compose_raw = tcb_info.get("app_compose", "")
        if not app_compose_raw:
            return False, "", "Missing app_compose in tcb_info"

        calculated_hash = hashlib.sha256(app_compose_raw.encode("utf-8")).hexdigest()

        # Find compose-hash event in event_log
        event_hash = ""
        for entry in event_log:
            if entry.get("event") == "compose-hash":
                event_hash = entry.get("event_payload", "")
                break

        if not event_hash:
            event_hash = tcb_info.get("compose_hash", "")

        is_valid = calculated_hash.lower() == event_hash.lower()
        return is_valid, calculated_hash, event_hash

    @staticmethod
    def verify_report(report_json: Dict[str, Any], expected_signer_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Full verification of an attestation_report.json dictionary.
        """
        quote_hex = report_json.get("quote", "")
        if not quote_hex:
            return {"valid": False, "error": "Missing quote in report"}

        # 1. Binary quote parsing
        measurements = TEEVerifier.extract_quote_measurements(quote_hex)

        # 2. TCB info parsing
        tcb_raw = report_json.get("tcb_info", "{}")
        tcb_info = json.loads(tcb_raw) if isinstance(tcb_raw, str) else tcb_raw

        # 3. Event log replay
        event_log = tcb_info.get("event_log") or json.loads(report_json.get("event_log", "[]"))
        replayed_rtmrs = TEEVerifier.replay_event_log(event_log)

        rtmr_matches = {
            f"rtmr{i}": (replayed_rtmrs[i] == measurements[f"rtmr{i}"])
            for i in range(4)
        }

        # 4. Compose Hash check
        compose_valid, calc_hash, exp_hash = TEEVerifier.verify_compose_hash(tcb_info, event_log)

        # 5. Signer address check
        extracted_signer = measurements["report_data"]
        signer_matches = True
        if expected_signer_address:
            signer_matches = extracted_signer.lower() == expected_signer_address.lower()

        all_valid = all(rtmr_matches.values()) and compose_valid and signer_matches

        return {
            "valid": all_valid,
            "signer_address": extracted_signer,
            "signer_matches": signer_matches,
            "compose_hash_valid": compose_valid,
            "calculated_compose_hash": calc_hash,
            "expected_compose_hash": exp_hash,
            "measurements": measurements,
            "rtmr_verification": rtmr_matches,
        }
