import type { LootDetail } from "../../types/raid";
import { formatLootValue, formatNumber } from "../../utils/format";
import { SectionPanel } from "../layout/SectionPanel";
import { InfoGrid } from "./InfoGrid";

interface LootPanelProps {
  loot: LootDetail;
}

export function LootPanel({ loot }: LootPanelProps) {
  return (
    <SectionPanel title="파밍" eyebrow="Loot">
      <InfoGrid
        columns="two"
        items={[
          { label: "반출 가치", value: formatLootValue(loot.extractedValue), tone: "lime" },
          { label: "발견 아이템", value: formatNumber(loot.itemsFound) },
          { label: "발견 무기", value: formatNumber(loot.weaponsFound) },
          { label: "발견 부착물", value: formatNumber(loot.attachmentsFound) },
          { label: "발견 장비", value: formatNumber(loot.gearFound) },
          { label: "컨테이너", value: formatNumber(loot.containers) },
          { label: "프리미엄 컨테이너", value: formatNumber(loot.premiumContainers), tone: "amber" },
          { label: "Looting XP", value: formatNumber(loot.xpFromLooting) },
          { label: "Unlocking XP", value: formatNumber(loot.xpFromUnlocking) },
          { label: "Extraction XP", value: formatNumber(loot.extractionXp), tone: "green" },
        ]}
      />
    </SectionPanel>
  );
}
