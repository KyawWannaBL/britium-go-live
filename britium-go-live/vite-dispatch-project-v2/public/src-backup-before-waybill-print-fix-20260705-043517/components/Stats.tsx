import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: ReactNode;
  trend?: "up" | "down";
}

export function StatsCard({ title, value, change, icon, trend }: StatsCardProps) {
  const hasChange = typeof change === "number";
  const isPositive = trend === "up" || (hasChange && change > 0);
  const isNegative = trend === "down" || (hasChange && change < 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 35 }}
    >
      <Card className="relative overflow-hidden border-border bg-card p-6 transition-all duration-200 hover:shadow-lg">
        <div className="absolute right-4 top-4 text-muted-foreground/20">
          <div className="text-4xl">{icon}</div>
        </div>

        <div className="relative z-10">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {value}
          </h3>

          {hasChange && (
            <div className="mt-3 flex items-center gap-1.5">
              {isPositive && (
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              )}
              {isNegative && (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <span
                className={cn(
                  "text-sm font-medium",
                  isPositive && "text-green-600 dark:text-green-400",
                  isNegative && "text-destructive"
                )}
              >
                {change > 0 ? "+" : ""}
                {change}%
              </span>
              <span className="text-sm text-muted-foreground">vs last period</span>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

interface MetricGridProps {
  children: ReactNode;
}

export function MetricGrid({ children }: MetricGridProps) {
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}