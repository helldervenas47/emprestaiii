import { useState } from "react";
import { Home, Search, Plus, Heart, User } from "lucide-react";

interface TabItem {
  id: string;
  label: string;
  icon: typeof Home;
}

const TABS: TabItem[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "buscar", label: "Buscar", icon: Search },
  { id: "adicionar", label: "Adicionar", icon: Plus },
  { id: "favoritos", label: "Favoritos", icon: Heart },
  { id: "perfil", label: "Perfil", icon: User },
];

export function BottomTabBar() {
  const [active, setActive] = useState<string>("inicio");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80">
      <div className="mx-auto flex max-w-md items-center justify-between px-6 py-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          const isCenter = tab.id === "adicionar";

          if (isCenter) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                aria-label={tab.label}
                className="relative -mt-6 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_8px_24px_rgba(99,102,241,0.45)] transition-transform duration-200 ease-out active:scale-95"
              >
                <Icon className="h-6 w-6 text-white" strokeWidth={2.25} />
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-label={tab.label}
              className="flex flex-col items-center justify-center gap-1 px-3 py-2 transition-transform duration-200 ease-out active:scale-95"
            >
              <Icon
                className={
                  isActive
                    ? "h-5 w-5 text-indigo-400 drop-shadow-[0_0_6px_rgba(129,140,248,0.55)] transition-colors duration-200"
                    : "h-5 w-5 text-zinc-500 transition-colors duration-200"
                }
                strokeWidth={isActive ? 2.25 : 2}
              />
              <span
                className={
                  isActive
                    ? "text-[11px] font-medium text-indigo-400"
                    : "text-[11px] font-medium text-zinc-500"
                }
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomTabBar;