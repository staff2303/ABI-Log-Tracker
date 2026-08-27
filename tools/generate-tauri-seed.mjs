/* global console */
import fs from "node:fs";

const sources = [
  ["weapon", "src/data/generated/weaponMap.ts"],
  ["ammo", "src/data/generated/ammoMap.ts"],
  ["equipment", "src/data/generated/equipmentMap.ts"],
  ["attachment", "src/data/generated/attachmentMap.ts"],
  ["throwable", "src/data/generated/throwableMap.ts"],
  ["medical", "src/data/generated/consumableMap.ts"],
  ["loot", "src/data/generated/otherItemMap.ts"],
  ["map", "src/data/generated/mapMap.ts"],
  ["bodyPart", "src/data/bodyPartMap.ts"],
];

const rows = [];

for (const [category, file] of sources) {
  const text = fs.readFileSync(file, "utf8");

  for (const match of text.matchAll(/"([^"]+)"\s*:\s*"([^"]*)"/g)) {
    rows.push({
      id: match[1],
      category,
      name: match[2],
    });
  }
}

rows.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }) || left.category.localeCompare(right.category));

function rustString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

let output = "// Auto-generated from src/data/generated mapping files. Runtime mapping source of truth is SQLite.\n";
output += "pub struct BuiltinMapping { pub id: &'static str, pub category: &'static str, pub name: &'static str }\n\n";
output += "pub const BUILTIN_MAPPINGS: &[BuiltinMapping] = &[\n";

for (const row of rows) {
  output += `  BuiltinMapping { id: "${rustString(row.id)}", category: "${rustString(row.category)}", name: "${rustString(row.name)}" },\n`;
}

output += "];\n";

fs.mkdirSync("src-tauri/src/db", { recursive: true });
fs.writeFileSync("src-tauri/src/db/seed.rs", output);
console.log(`Generated ${rows.length} built-in mappings.`);
