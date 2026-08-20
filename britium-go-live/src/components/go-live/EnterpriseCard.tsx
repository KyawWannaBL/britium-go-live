import React from "react";
import { cn } from "@/lib/utils";

export default function EnterpriseCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        `
        rounded-3xl
        border
        border-[#1a3a5c]
        bg-[#0b2236]
        text-[#eef8ff]
        shadow-lg
        p-5
        `,
        className,
      )}
    >
      {children}
    </div>
  );
}
