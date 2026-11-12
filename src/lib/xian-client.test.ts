import { afterEach, describe, expect, it, vi } from "vitest";

import { XianClient } from "@xian-tech/client";

import { requireChainId } from "./xian-client";

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
