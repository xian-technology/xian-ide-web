import { describe, expect, it, vi } from "vitest";

import { deployContractSource } from "./deployment";
import type { WalletSendCall } from "./deployment";

const COUNTER_SOURCE = `
counter = Variable()


@construct
def seed():
    counter.set(0)


@export
def get():
    return counter.get()
`;

describe("contract deployment", () => {
  it("submits source through the wallet provider", async () => {
    const sendCall = vi.fn<WalletSendCall>(async () => ({ txHash: "abc123" }));

    const result = await deployContractSource({
      name: "con_counter",
      source: COUNTER_SOURCE,
      sendCall,
    });

    expect(result).toEqual({ txHash: "abc123" });
    expect(sendCall).toHaveBeenCalledOnce();
    const payload = sendCall.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload) return;
    expect(payload.contract).toBe("submission");
    expect(payload.function).toBe("submit_contract");
    expect(payload.chi).toBeUndefined();
    expect(payload.kwargs.name).toBe("con_counter");
    expect(payload.kwargs.code).toBe(COUNTER_SOURCE);
    expect(payload.kwargs.deployment_artifacts).toBeUndefined();
  });
});
