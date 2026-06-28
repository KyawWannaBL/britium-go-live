import { ReactNode, useEffect, useRef, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Sidebar } from "@/components/Sidebar";

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openSidebar() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSidebarOpen(true);
  }

  function closeSidebarWithDelay() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setSidebarOpen(false);
      closeTimerRef.current = null;
    }, 160);
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar
          isExpanded={sidebarOpen}
          onMouseEnter={openSidebar}
          onMouseLeave={closeSidebarWithDelay}
          onFocusCapture={openSidebar}
        />

        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
            <SidebarTrigger className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden" />
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
              Britium Express Enterprise Platform
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default Layout;