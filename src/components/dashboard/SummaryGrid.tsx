import { Activity, Clock, Crosshair, Package, ShieldCheck, Skull, Target, Timer, TrendingUp } from "lucide-react";
import { MetricCard } from "../layout/MetricCard";
import { formatDecimal, formatDuration, formatLootValue, formatNumber, formatPercent } from "../../utils/format";
import type { DashboardStats } from "../../utils/stats";

interface SummaryGridProps {
  stats: DashboardStats;
}

export function SummaryGrid({ stats }: SummaryGridProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      <MetricCard label="전체 레이드" value={formatNumber(stats.totalRaids)} icon={<Activity size={16} />} />
      <MetricCard label="탈출 수" value={formatNumber(stats.extracted)} tone="green" icon={<ShieldCheck size={16} />} />
      <MetricCard label="사망 수" value={formatNumber(stats.deaths)} tone="red" icon={<Skull size={16} />} />
      <MetricCard label="탈출률" value={formatPercent(stats.extractionRate)} tone="green" icon={<TrendingUp size={16} />} />
      <MetricCard label="PMC Kill" value={formatNumber(stats.pmcKills)} tone="amber" icon={<Crosshair size={16} />} />
      <MetricCard label="AI Kill" value={formatNumber(stats.aiKills)} icon={<Target size={16} />} />
      <MetricCard label="K/D" value={formatDecimal(stats.kd, 2)} tone="lime" icon={<Target size={16} />} />
      <MetricCard label="총 피해" value={formatNumber(stats.totalDamage)} tone="lime" icon={<Activity size={16} />} />
      <MetricCard label="평균 피해" value={formatNumber(Math.round(stats.averageDamage))} icon={<Activity size={16} />} />
      <MetricCard label="전체 명중률" value={formatPercent(stats.averageAccuracy)} icon={<Crosshair size={16} />} />
      <MetricCard label="총 플레이시간" value={formatDuration(stats.totalPlayTime)} icon={<Clock size={16} />} />
      <MetricCard label="평균 플레이시간" value={formatDuration(Math.round(stats.averageSurvivalTime))} icon={<Timer size={16} />} />
      <MetricCard label="총 반출 가치" value={formatLootValue(stats.totalLootValue)} tone="lime" icon={<Package size={16} />} />
      <MetricCard label="평균 반출 가치" value={formatLootValue(Math.round(stats.averageLootValue))} icon={<Package size={16} />} />
    </div>
  );
}
