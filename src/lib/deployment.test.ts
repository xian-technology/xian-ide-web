import { describe, expect, it, vi } from "vitest";

import { deployContractSource, executeContractCall } from "./deployment";
import type { SimulateCall, WalletSendCall } from "./deployment";

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
      chainId: "xian-local",
      name: "con_counter",
      source: COUNTER_SOURCE,
      sendCall,
    });

    expect(result).toEqual({ txHash: "abc123" });
    expect(sendCall).toHaveBeenCalledOnce();
    const payload = sendCall.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload) return;
    expect(payload.chainId).toBe("xian-local");
    expect(payload.contract).toBe("submission");
    expect(payload.function).toBe("submit_contract");
    expect(payload.chi).toBeUndefined();
    expect(payload.kwargs.name).toBe("con_counter");
    expect(payload.kwargs.code).toBe(COUNTER_SOURCE);
    expect(payload.kwargs.deployment_artifacts).toBeUndefined();
  });

  it("passes constructor arguments only when there are some", async () => {
    const sendCall = vi.fn<WalletSendCall>(async () => ({}));
    const deploy = (constructorArgs?: Record<string, unknown>) =>
      deployContractSource({ chainId: "xian-local", name: "con_counter", source: COUNTER_SOURCE, sendCall, constructorArgs });

    await deploy({ start: 5 });
    await deploy({});
    await deploy();

    expect(sendCall.mock.calls.map(([payload]) => payload.kwargs.constructor_args)).toEqual([
      { start: 5 },
      undefined,
      undefined,
    ]);
  });

  it.each(["", undefined])("refuses to deploy empty source (%j)", async (source) => {
    const sendCall = vi.fn<WalletSendCall>(async () => ({}));
    await expect(deployContractSource({
      chainId: "xian-local",
      name: "con_counter",
      source: source as unknown as string,
      sendCall,
    })).rejects.toThrow("contract source must be a non-empty string");
    expect(sendCall).not.toHaveBeenCalled();
  });
});

describe("contract execution", () => {
  const call = { chainId: "xian-local", sender: "alice", contract: "con_counter", function: "increment", kwargs: { by: 2 } };

  it("supplies exactly the simulated cost", async () => {
    const simulate = vi.fn<SimulateCall>(async () => ({ success: true, chiUsed: 1_000 }));
    const sendCall = vi.fn<WalletSendCall>(async () => ({ txHash: "abc123" }));

    const result = await executeContractCall({ ...call, simulate, sendCall });

    expect(result).toEqual({ txHash: "abc123" });
    expect(simulate).toHaveBeenCalledWith({ sender: "alice", contract: "con_counter", function: "increment", kwargs: { by: 2 } });
    expect(sendCall).toHaveBeenCalledWith({ chainId: "xian-local", contract: "con_counter", function: "increment", kwargs: { by: 2 }, chi: 1_000 });
  });

  it("keeps an explicit chi budget and skips simulation", async () => {
    const simulate = vi.fn<SimulateCall>(async () => ({ success: true, chiUsed: 1_000 }));
    const sendCall = vi.fn<WalletSendCall>(async () => ({}));

    await executeContractCall({ ...call, chi: 7_000, simulate, sendCall });

    expect(simulate).not.toHaveBeenCalled();
    expect(sendCall.mock.calls[0]?.[0].chi).toBe(7_000);
  });

  it("does not reach the wallet when simulation fails", async () => {
    const simulate = vi.fn<SimulateCall>(async () => ({ success: false, chiUsed: 0, error: "AssertionError: nope" }));
    const sendCall = vi.fn<WalletSendCall>(async () => ({}));

    await expect(executeContractCall({ ...call, simulate, sendCall })).rejects.toThrow("Simulation failed: AssertionError: nope");
    expect(sendCall).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])("names a simulation failure without an error text (%j)", async (error) => {
    const simulate = vi.fn<SimulateCall>(async () => ({ success: false, chiUsed: 0, error }));
    const sendCall = vi.fn<WalletSendCall>(async () => ({}));

    await expect(executeContractCall({ ...call, simulate, sendCall })).rejects.toThrow("Simulation failed: Unknown error");
  });
});
