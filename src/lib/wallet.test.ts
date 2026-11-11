import { afterEach, describe, expect, it, vi } from "vitest";

import { sendCall } from "./wallet";

type MockWindow = Window & {
  xian?: {
    providers?: Array<{
      metadata: Record<string, unknown>;
      provider: {
        request: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        removeListener: ReturnType<typeof vi.fn>;
      };
    }>;
  };
  xianProviders?: Array<{
    metadata: Record<string, unknown>;
    provider: {
      request: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  }>;
};

function installProvider(outcome: Record<string, unknown> = {
  submitted: true, accepted: true, finalized: true, receipt: { success: true }
}) {
  const provider = {
    request: vi.fn(async () => outcome),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  const record = {
    metadata: { id: "test-wallet", name: "Test Wallet" },
    provider,
  };
  (globalThis as { window?: MockWindow }).window = {
    xian: { providers: [record] },
    xianProviders: [record],
  } as MockWindow;
  return provider;
}

describe("wallet sendCall bridge", () => {
  afterEach(() => {
    delete (globalThis as { window?: Window }).window;
  });

  it("omits chiSupplied so the wallet/client can estimate deployment chi", async () => {
    const provider = installProvider();

    await sendCall({
      chainId: "xian-local",
      contract: "submission",
      function: "submit_contract",
      kwargs: { name: "con_counter", code: "counter = Variable()\n" },
    });

    expect(provider.request).toHaveBeenCalledWith({
      method: "xian_sendCall",
      params: [
        {
          intent: {
            chainId: "xian-local",
            contract: "submission",
            function: "submit_contract",
            kwargs: { name: "con_counter", code: "counter = Variable()\n" },
          },
          mode: "checktx",
          waitForTx: true,
        },
      ],
    });
  });

  it("passes explicit chi when the caller supplies one", async () => {
    const provider = installProvider();

    await sendCall({
      chainId: "xian-local",
      contract: "currency",
      function: "transfer",
      kwargs: { amount: 1, to: "bob" },
      chi: 50_000,
    });

    expect(provider.request).toHaveBeenCalledWith({
      method: "xian_sendCall",
      params: [
        {
          intent: {
            chainId: "xian-local",
            contract: "currency",
            function: "transfer",
            kwargs: { amount: 1, to: "bob" },
            chiSupplied: 50_000,
          },
          mode: "checktx",
          waitForTx: true,
        },
      ],
    });
  });

  it.each([
    ["fails on-chain", { submitted: true, accepted: true, finalized: true,
      receipt: { success: false, message: "AssertionError: Insufficient funds" } },
      "Insufficient funds"],
    ["is rejected by CheckTx", { submitted: true, accepted: false, finalized: false,
      message: "Invalid nonce" }, "Invalid nonce"],
  ])("rejects a call that %s", async (_label, outcome, message) => {
    installProvider(outcome);
    await expect(sendCall({
      chainId: "xian-local",
      contract: "currency",
      function: "transfer",
      kwargs: { amount: 1, to: "bob" },
    })).rejects.toThrow(message);
  });
});
