import { describe, expect, it, vi } from "vitest";

import { compileContractArtifacts } from "./compiler";
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
  it("compiles source and submits deployment artifacts through the wallet provider", async () => {
    const sendCall = vi.fn<WalletSendCall>(async () => ({ txHash: "abc123" }));

    const result = await deployContractSource({
      name: "con_counter",
      source: COUNTER_SOURCE,
      compile: compileContractArtifacts,
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
    expect(payload.kwargs.deployment_artifacts).toMatchObject({
      format: "xian_contract_artifact_v1",
      module_name: "con_counter",
      vm_profile: "xian_vm_v1",
    });
    expect(
      (payload.kwargs.deployment_artifacts as Record<string, unknown>)
        .runtime_code
    ).toBeUndefined();
  });
});
