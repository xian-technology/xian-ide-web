import { afterEach, describe, expect, it, vi } from "vitest";

import { XianClient } from "@xian-tech/client";

import { getContractMethods, requireChainId } from "./xian-client";

describe("contract explorer call targets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes only exported methods, using the node's compiled contract", async () => {
    const exported = { name: "lookup", arguments: [{ name: "account", type: "str" }] };
    vi.spyOn(XianClient.prototype, "getContractMethods").mockResolvedValue([
      { name: "seed", arguments: [] },
      exported,
      { name: "helper", arguments: [] },
    ]);
    vi.spyOn(XianClient.prototype, "getContractIr").mockResolvedValue(JSON.stringify({
      functions: [
        { name: "seed", visibility: "construct" },
        { name: "lookup", visibility: "export" },
        { name: "helper", visibility: "private" },
      ],
    }));

    await expect(getContractMethods("con_example")).resolves.toEqual([exported]);
  });

  it("lists no call targets when the contract has no compiled IR", async () => {
    vi.spyOn(XianClient.prototype, "getContractMethods").mockResolvedValue([
      { name: "helper", arguments: [] },
    ]);
    vi.spyOn(XianClient.prototype, "getContractIr").mockResolvedValue(null);

    await expect(getContractMethods("con_example")).resolves.toEqual([]);
  });
});

describe("signing chain id", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the network the selected node reports", async () => {
    vi.spyOn(XianClient.prototype, "getStatus").mockResolvedValue({
      result: { node_info: { network: "xian-local-1" } }
    } as Awaited<ReturnType<XianClient["getStatus"]>>);
    await expect(requireChainId()).resolves.toBe("xian-local-1");
  });

  it.each([
    ["no node info", { result: {} }],
    ["a non-string network", { result: { node_info: { network: 7 } } }],
    ["no result", { result: null }],
  ])("refuses to pin a chain when the node reports %s", async (_label, status) => {
    vi.spyOn(XianClient.prototype, "getStatus").mockResolvedValue(
      status as Awaited<ReturnType<XianClient["getStatus"]>>,
    );
    await expect(requireChainId()).rejects.toThrow("did not report a chain id");
  });
});
