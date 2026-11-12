import { encodeRuntime, fixed, parseContractJson } from "@xian-tech/client";
import { DEFAULT_VM_PROFILE } from "./profile";

type ArgParseResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

function exactInteger(text: string): bigint {
  if (!/^[+-]?[0-9]+$/.test(text)) throw new Error("expected a decimal integer");
  return BigInt(text);
}

function argumentValue(text: string, type: string): unknown {
  switch (type) {
    case "int": return exactInteger(text);
    case "decimal": return fixed(text);
    case "bool": {
      if (text.toLowerCase() === "true") return true;
      if (text.toLowerCase() === "false") return false;
      throw new Error("expected true or false");
    }
    case "list":
    case "dict":
    case "any":
    case "json": {
      let value: unknown;
      try {
        value = parseContractJson(text);
      } catch (error) {
        if (type === "any" && error instanceof SyntaxError) return text;
        throw error;
      }
      if (type === "list" && !Array.isArray(value)) throw new Error("expected a JSON array");
      if (type === "dict" && !text.startsWith("{")) {
        throw new Error("expected a JSON object");
      }
      return value;
    }
    default: return text;
  }
}

export function parseArg(value: string, annotation: string, argName: string): ArgParseResult {
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  const type = annotation.toLowerCase().split("[", 1)[0];
  if (type === "str" || !type) return { ok: true, value };
  try {
    const parsed = argumentValue(text, type);
    // Wallet requests use JSON-compatible wrappers. Use the same shapes for
    // simulation so the estimated call and signed call have identical inputs.
    return { ok: true, value: JSON.parse(encodeRuntime(parsed, DEFAULT_VM_PROFILE)) };
  } catch (error) {
    return { ok: false, message: `${argName}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function displayValue(value: unknown, indent?: number): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, indent);
}

/** Typed argument inputs, keyed by `methodArgsKey(contract, method)` then argument name. */
export type MethodArgInputs = Record<string, Record<string, string>>;

export type KwargsBuildResult =
  | { ok: true; kwargs: Record<string, unknown> }
  | { ok: false; message: string };

export function methodArgsKey(contract: string, method: string): string {
  return `${contract}.${method}`;
}

/** The text typed for one argument of `contract.method`, or "" when none. */
export function methodArgInput(
  inputs: MethodArgInputs,
  contract: string,
  method: string,
  arg: string,
): string {
  return inputs[methodArgsKey(contract, method)]?.[arg] ?? "";
}

/** `inputs` with one argument of `contract.method` set; other methods keep theirs. */
export function withMethodArgInput(
  inputs: MethodArgInputs,
  contract: string,
  method: string,
  arg: string,
  value: string,
): MethodArgInputs {
  const key = methodArgsKey(contract, method);
  return { ...inputs, [key]: { ...inputs[key], [arg]: value } };
}

export function buildMethodKwargs(
  inputs: MethodArgInputs,
  contract: string,
  method: { name: string; arguments: Array<{ name: string; type: string }> },
): KwargsBuildResult {
  const args = inputs[methodArgsKey(contract, method.name)] ?? {};
  const kwargs: Record<string, unknown> = {};
  for (const argument of method.arguments) {
    const raw = args[argument.name];
    if (raw === undefined || raw === "") continue;
    const parsed = parseArg(raw, argument.type, `${method.name}.${argument.name}`);
    if (!parsed.ok) return parsed;
    kwargs[argument.name] = parsed.value;
  }
  return { ok: true, kwargs };
}
