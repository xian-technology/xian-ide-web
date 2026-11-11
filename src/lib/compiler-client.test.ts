import { describe, expect, it } from "vitest";

import {
  compileContractArtifactsInBrowser,
  diagnoseContractInBrowser,
  getCompilerVersionInBrowser,
} from "./compiler-client";

const VALID_SOURCE = `
counter = Variable()

@construct
def seed():
    counter.set(0)

@export
def increment():
    counter.set(counter.get() + 1)
    return counter.get()
`;

describe("browser compiler client", () => {
  it("builds deployment artifacts through the shared WASM compiler", async () => {
    const artifacts = await compileContractArtifactsInBrowser(
      "con_counter",
      VALID_SOURCE,
      { lint: true }
    );

    expect(artifacts).toMatchObject({
      format: "xian_contract_artifact_v1",
      module_name: "con_counter",
      vm_profile: "xian_vm_v2",
    });
    expect(artifacts.source).toContain("def increment");
    expect(artifacts.vm_ir_json).toContain("increment");
  });

  it("returns structured diagnostics without a service dependency", async () => {
    const diagnostics = await diagnoseContractInBrowser(
      "con_bad",
      "value = 1\n\n@export\ndef set_value():\n    global value\n    value = 2\n",
      { lint: true }
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "xian.syntax.unsupported_statement.global",
        }),
      ])
    );
  });

  it("uses V2 numeric diagnostics without compiler options", async () => {
    const exact = "@export\ndef quote(amount: decimal):\n    return quantize(amount, 2, 'floor')";
    await expect(diagnoseContractInBrowser("con_quote", exact)).resolves.toEqual([]);
    await expect(
      diagnoseContractInBrowser("con_quote", exact.replace("amount: decimal", "amount: float"))
    ).resolves.toContainEqual(expect.objectContaining({ severity: "error", code: "xian.lint.E014" }));
  });

  it("exposes compiler metadata through the same browser surface", async () => {
    await expect(getCompilerVersionInBrowser()).resolves.toMatchObject({
      artifact_format: "xian_contract_artifact_v1",
      vm_profile: "xian_vm_v2",
      supported_vm_profiles: expect.arrayContaining(["xian_vm_v1", "xian_vm_v2"]),
    });
  });
});
