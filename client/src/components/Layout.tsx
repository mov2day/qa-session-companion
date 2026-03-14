import { Link, useLocation } from "wouter";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, FlaskConical, ClipboardList, TestTubes, FileText, Home, BarChart3, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

const NAV_ITEMS = [
  { href: "/", label: "Sessions", icon: Home },
  { href: "/manager", label: "Dashboard", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top nav bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <FlaskConical className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-semibold text-sm tracking-tight hidden sm:block" data-testid="app-title">
                  QA Companion
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-1 ml-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === "/"
                  ? location === item.href
                  : location.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      className="gap-1.5 text-xs"
                      data-testid={`nav-${item.label.toLowerCase()}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Session stage breadcrumb */}
            {location.startsWith("/session/") && <SessionBreadcrumb location={location} />}

            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              data-testid="theme-toggle"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 px-4 text-center">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}

function SessionBreadcrumb({ location }: { location: string }) {
  const parts = location.split("/");
  const sessionId = parts[2];
  const stage = parts[3] || "plan";

  const stages = [
    { key: "plan", label: "Plan", icon: ClipboardList },
    { key: "test", label: "Test", icon: TestTubes },
    { key: "report", label: "Report", icon: FileText },
  ];

  return (
    <div className="hidden md:flex items-center gap-1 text-xs" data-testid="session-breadcrumb">
      {stages.map((s, i) => {
        const Icon = s.icon;
        const isActive = stage === s.key;
        const isPast = stages.findIndex((st) => st.key === stage) > i;
        return (
          <div key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground mx-1">/</span>}
            <Link href={`/session/${sessionId}/${s.key}`}>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary font-medium"
                    : isPast
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
                }`}
              >
                <Icon className="w-3 h-3" />
                {s.label}
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
