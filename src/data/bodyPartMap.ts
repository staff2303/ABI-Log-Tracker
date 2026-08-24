export const bodyPartMap: Record<string, string> = {};

export function getBodyPartName(id: number | string | null | undefined): string | null {
  if (id === null || id === undefined) {
    return null;
  }

  return bodyPartMap[String(id)] ?? null;
}
