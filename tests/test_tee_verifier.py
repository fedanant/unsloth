# SPDX-License-Identifier: Apache-2.0
import os
import json
import unittest
from zg_verifier.verifier import TEEVerifier

class TestTEEVerifier(unittest.TestCase):
    def setUp(self):
        self.report_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "C:/Users/shima/.gemini/antigravity/brain/39fe3ec1-7e18-469e-ac2c-c7f496711e6c/scratch/attestation_report.json"
        )
        if not os.path.exists(self.report_path):
            self.report_path = r"C:\Users\shima\.gemini\antigravity\brain\39fe3ec1-7e18-469e-ac2c-c7f496711e6c\scratch\attestation_report.json"
        
        with open(self.report_path, "r", encoding="utf-8") as f:
            self.report = json.load(f)

    def test_quote_parsing(self):
        measurements = TEEVerifier.extract_quote_measurements(self.report["quote"])
        self.assertTrue(len(measurements["mrtd"]) == 96)
        self.assertTrue(len(measurements["rtmr0"]) == 96)
        self.assertTrue(len(measurements["rtmr3"]) == 96)
        self.assertEqual(measurements["report_data"], "0x2A94D671f1A5e080f75A8164087Cdd35c8442e69")

    def test_full_report_verification(self):
        result = TEEVerifier.verify_report(self.report, "0x2A94D671f1A5e080f75A8164087Cdd35c8442e69")
        self.assertTrue(result["valid"])
        self.assertTrue(result["compose_hash_valid"])
        self.assertTrue(result["signer_matches"])
        self.assertEqual(result["calculated_compose_hash"], "8779f38c1cc5d1e643fbfc7238bae2c227f7ffa4c72c049802942658acfc5bee")

    def test_tamper_detection(self):
        # Mutate compose code to simulate an attack
        tcb_info = json.loads(self.report["tcb_info"])
        tcb_info["app_compose"] = tcb_info["app_compose"] + " # tampered by hacker"
        
        tampered_report = dict(self.report)
        tampered_report["tcb_info"] = json.dumps(tcb_info)
        
        result = TEEVerifier.verify_report(tampered_report, "0x2A94D671f1A5e080f75A8164087Cdd35c8442e69")
        self.assertFalse(result["valid"])
        self.assertFalse(result["compose_hash_valid"])

if __name__ == "__main__":
    unittest.main()
