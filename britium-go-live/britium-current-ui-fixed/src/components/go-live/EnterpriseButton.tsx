import React from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "success";

export default function EnterpriseButton({
  children,
  variant="primary",
  className="",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
}) {

const styles={
 primary:
 "bg-[#f6b84b] text-[#061524] hover:bg-[#ffc861]",

 secondary:
 "bg-[#123456] text-white border border-[#254b73] hover:bg-[#1a3a5c]",

 danger:
 "bg-red-600 text-white hover:bg-red-700",

 success:
 "bg-emerald-600 text-white hover:bg-emerald-700",
};

return (
<button
 {...props}
 className={cn(
 `
 px-5
 py-3
 rounded-xl
 font-black
 transition
 flex
 items-center
 justify-center
 gap-2
 disabled:opacity-50
 `,
 styles[variant],
 className
 )}
>
{children}
</button>
);

}
