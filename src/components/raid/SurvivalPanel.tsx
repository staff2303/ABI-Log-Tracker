import type { SurvivalDetail } from "../../types/raid";
import { formatDistance, formatNumber } from "../../utils/format";
import { SectionPanel } from "../layout/SectionPanel";
import { InfoGrid } from "./InfoGrid";

interface SurvivalPanelProps {
  survival: SurvivalDetail;
}

export function SurvivalPanel({ survival }: SurvivalPanelProps) {
  return (
    <SectionPanel title="생존" eyebrow="Survival">
      <InfoGrid
        columns="two"
        items={[
          { label: "HP 손실", value: formatNumber(survival.hpLoss), tone: (survival.hpLoss ?? 0) > 350 ? "red" : "default" },
          { label: "치료량", value: formatNumber(survival.healingDone), tone: "green" },
          { label: "골절", value: formatNumber(survival.fractures), tone: (survival.fractures ?? 0) > 0 ? "amber" : "default" },
          { label: "디버프", value: formatNumber(survival.debuffs), tone: (survival.debuffs ?? 0) > 0 ? "amber" : "default" },
          { label: "음식/음료", value: formatNumber(survival.foodDrinksConsumed) },
          { label: "이동거리", value: formatDistance(survival.distanceMeters) },
          { label: "낙하", value: formatNumber(survival.falls), tone: (survival.falls ?? 0) > 0 ? "amber" : "default" },
          { label: "팀원 구조", value: formatNumber(survival.teammatesRescued), tone: (survival.teammatesRescued ?? 0) > 0 ? "green" : "default" },
          { label: "구조받음", value: formatNumber(survival.timesRescued), tone: (survival.timesRescued ?? 0) > 0 ? "green" : "default" },
          { label: "지원", value: formatNumber(survival.supportActions), tone: (survival.supportActions ?? 0) > 0 ? "lime" : "default" },
        ]}
      />
    </SectionPanel>
  );
}
