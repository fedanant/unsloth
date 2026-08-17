// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

const forge = {
  pki: {
    publicKeyFromPem: () => ({
      encrypt: (data: string) => data,
    }),
  },
  util: {
    encode64: (data: string) => Buffer.from(data).toString("base64"),
    decode64: (data: string) => Buffer.from(data, "base64").toString("utf-8"),
  },
};

export default forge;
