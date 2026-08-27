import type { MappingCategory, MappingNamespace } from "./mappingTypes";

type IdLike = string | number | null | undefined;

export interface MappingIdentity {
  id: string;
  namespace: MappingNamespace;
  rawId: string;
}

export function normalizeRawId(value: IdLike, allowZero = false): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const rawId = String(value).trim().replace(/^"|"$/g, "");

  if (!/^-?\d+$/.test(rawId)) {
    return null;
  }

  if (rawId.startsWith("-")) {
    return null;
  }

  if (!allowZero && rawId === "0") {
    return null;
  }

  return rawId;
}

export function createMappingKey(namespace: MappingNamespace, rawId: IdLike, allowZero = false): string | null {
  const normalized = normalizeRawId(rawId, allowZero);
  return normalized ? `${namespace}:${normalized}` : null;
}

export function createMappingIdentity(
  namespace: MappingNamespace,
  rawId: IdLike,
  allowZero = false,
): MappingIdentity | null {
  const normalized = normalizeRawId(rawId, allowZero);

  if (!normalized) {
    return null;
  }

  return {
    id: `${namespace}:${normalized}`,
    namespace,
    rawId: normalized,
  };
}

export function namespaceForCategory(category: MappingCategory): MappingNamespace {
  if (category === "map") {
    return "map";
  }

  if (category === "bodyPart") {
    return "gameplay_tag";
  }

  return "item";
}

export function identityFromMappingInput(input: {
  id?: string | null;
  namespace?: MappingNamespace | null;
  rawId?: string | number | null;
  category?: MappingCategory | null;
}): MappingIdentity | null {
  const namespace = input.namespace ?? (input.category ? namespaceForCategory(input.category) : null);
  const rawId = input.rawId ?? parseRawIdFromCompositeId(input.id ?? null);

  if (!namespace) {
    return null;
  }

  return createMappingIdentity(namespace, rawId, namespace === "gameplay_tag");
}

export function parseRawIdFromCompositeId(id: string | null | undefined): string | null {
  if (!id) {
    return null;
  }

  const separator = id.indexOf(":");
  return separator >= 0 ? id.slice(separator + 1) : id;
}
