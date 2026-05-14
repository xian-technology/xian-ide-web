declare module "@xian-tech/compiler" {
  export function compileContractArtifactJson(
    moduleName: string,
    source: string,
    optionsJson?: string | null
  ): string;

  export function diagnoseContractJson(
    moduleName: string,
    source: string,
    optionsJson?: string | null
  ): string;

  export function compilerVersionJson(): string;
}
