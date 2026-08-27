const ignoredBlueprintNames = new Set(["BP_IconScaleBoxPaddingComponent"]);

const ignoredBlueprintFragments = ["IconScaleBoxPaddingComponent"];

export function isIgnoredMappingBlueprint(value: string | null | undefined): boolean {
  const normalized = value?.trim();

  if (!normalized) {
    return false;
  }

  return ignoredBlueprintNames.has(normalized) || ignoredBlueprintFragments.some((fragment) => normalized.includes(fragment));
}

