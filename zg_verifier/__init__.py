"""
0G TEE Verification Package
Provides hardware-level remote attestation and cryptographic verification for 0G Compute.
"""

from .verifier import TEEVerifier
from .client import VerifiableZGClient

__all__ = ["TEEVerifier", "VerifiableZGClient"]
