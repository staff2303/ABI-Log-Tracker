export const armorMap: Record<string, string> = {};

export function getArmorName(id: number | string | null | undefined): string | null {
  if (id === null || id === undefined) {
    return null;
  }

  return armorMap[String(id)] ?? null;
}
