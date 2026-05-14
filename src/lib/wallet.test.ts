import { afterEach, describe, expect, it, vi } from "vitest";

import { sendCall } from "./wallet";

type MockWindow = Window & {
  xian?: {
    provider?: {
      request: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
};

function installProvider() {
  const provider = {
    request: vi.fn(async () => ({ accepted: true })),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  (globalThis as { window?: MockWindow }).window = {
    xian: { provider },
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
      contract: "submission",
      function: "submit_contract",
      kwargs: { name: "con_counter", deployment_artifacts: {} },
    });

    expect(provider.request).toHaveBeenCalledWith({
      method: "xian_sendCall",
      params: [
        {
          intent: {
            contract: "submission",
            function: "submit_contract",
            kwargs: { name: "con_counter", deployment_artifacts: {} },
          },
        },
      ],
    });
  });

  it("passes explicit chi when the caller supplies one", async () => {
    const provider = installProvider();

    await sendCall({
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
            contract: "currency",
            function: "transfer",
            kwargs: { amount: 1, to: "bob" },
            chiSupplied: 50_000,
          },
        },
      ],
    });
  });
});
