export const weaponMap: Record<string, string> = {};

export function getWeaponName(id: number | string | null | undefined): string | null {
  if (id === null || id === undefined) {
    return null;
  }

  return weaponMap[String(id)] ?? null;
}
