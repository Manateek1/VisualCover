import {
  Info,
  Monitor,
  Palette,
  Settings2,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "../../components/BrandMark";
import { WindowChrome } from "../../components/WindowChrome";
import type { CoverLifecycle } from "../../types";

export type MainSection = "control" | "appearance" | "behavior" | "security" | "about";

type NavItem = {
  id: MainSection;
  label: string;
  icon: LucideIcon;
};

const primaryNav: NavItem[] = [
  { id: "control", label: "Control", icon: Monitor },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "behavior", label: "Behavior", icon: Settings2 },
  { id: "security", label: "Security", icon: Shield },
];

type AppShellProps = {
  active: MainSection;
  lifecycle: CoverLifecycle;
  children: React.ReactNode;
  onNavigate: (section: MainSection) => void;
};

export function AppShell({ active, lifecycle, children, onNavigate }: AppShellProps) {
  const aboutOnly = lifecycle !== "uncovered";

  const navButton = ({ id, label, icon: Icon }: NavItem) => (
    <button
      key={id}
      type="button"
      className={`sidebar-nav__item ${active === id ? "sidebar-nav__item--active" : ""}`}
      aria-current={active === id ? "page" : undefined}
      onClick={() => onNavigate(id)}
      disabled={aboutOnly && id !== "about"}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  return (
    <main className="app-window">
      <WindowChrome />
      <aside className="app-sidebar">
        <BrandMark compact />
        <nav className="sidebar-nav" aria-label="Settings">
          <div className="sidebar-nav__primary">
            {primaryNav.map(navButton)}
          </div>
          <div className="sidebar-nav__secondary">
            {navButton({ id: "about", label: "About", icon: Info })}
          </div>
        </nav>
      </aside>
      <section className="app-content">{children}</section>
    </main>
  );
}
