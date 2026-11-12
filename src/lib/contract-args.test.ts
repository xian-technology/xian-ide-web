import { describe, expect, it } from "vitest";
import {
  buildMethodKwargs,
  displayValue,
  methodArgInput,
  methodArgsKey,
  parseArg,
  withMethodArgInput,
} from "./contract-args";

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

describe("method argument inputs", () => {
  const transfer = { name: "transfer", arguments: [{ name: "amount", type: "decimal" }, { name: "to", type: "str" }] };

  it("keeps typed arguments scoped to the contract they were entered for", () => {
    const inputs = { [methodArgsKey("con_a", "transfer")]: { amount: "1.5", to: "bob" } };
    expect(buildMethodKwargs(inputs, "con_a", transfer))
      .toEqual({ ok: true, kwargs: { amount: { __fixed__: "1.5" }, to: "bob" } });
    expect(buildMethodKwargs(inputs, "con_b", transfer)).toEqual({ ok: true, kwargs: {} });
  });

  it("reports the first unparsable argument", () => {
    const inputs = { [methodArgsKey("con_a", "transfer")]: { amount: "1,5" } };
    const built = buildMethodKwargs(inputs, "con_a", transfer);
    expect(built.ok).toBe(false);
  });

  it("stores typed text per contract and method without touching other inputs", () => {
    let inputs = withMethodArgInput({}, "con_a", "transfer", "amount", "1");
    inputs = withMethodArgInput(inputs, "con_a", "transfer", "to", "bob");
    inputs = withMethodArgInput(inputs, "con_b", "transfer", "amount", "2");
    inputs = withMethodArgInput(inputs, "con_a", "transfer", "amount", "3");

    expect(methodArgInput(inputs, "con_a", "transfer", "amount")).toBe("3");
    expect(methodArgInput(inputs, "con_a", "transfer", "to")).toBe("bob");
    expect(methodArgInput(inputs, "con_b", "transfer", "amount")).toBe("2");
    expect(methodArgInput(inputs, "con_b", "transfer", "to")).toBe("");
    expect(methodArgInput(inputs, "con_a", "approve", "amount")).toBe("");
  });
});
