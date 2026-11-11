import { describe, expect, it } from "vitest";
import { parseArg, displayValue } from "./contract-args";

describe("V2 call arguments", () => {
  it("preserves decimals and wide integers for wallet requests and simulations", () => {
    const decimal = "9007199254740993.000000000000000000000000000001";
    const big = "9007199254740993";
    expect(parseArg(decimal, "decimal", "price")).toEqual({ ok: true, value: { __fixed__: decimal } });
    expect(parseArg(big, "int", "shares")).toEqual({ ok: true, value: { __big_int__: big } });
    expect(parseArg(`{"pair":[${big},${decimal},1.0000000000000001]}`, "dict", "data"))
      .toEqual({ ok: true, value: { pair: [{ __big_int__: big }, { __fixed__: decimal }, { __fixed__: "1.0000000000000001" }] } });
    expect(displayValue({ balance: BigInt(big) })).toContain(big);
  });

  it("reports malformed and out-of-range numbers before submission", () => {
    for (const [value, type] of [["1e-31", "decimal"], ["1.2", "int"], ["1e-31", "Any"], ["{", "dict"], ["123", "list"], ["1.25", "dict"], [(2n ** 512n).toString(), "int"]]) {
      expect(parseArg(value, type, "amount").ok).toBe(false);
    }
    expect(parseArg("ordinary text", "Any", "text")).toEqual({ ok: true, value: "ordinary text" });
  });
});
