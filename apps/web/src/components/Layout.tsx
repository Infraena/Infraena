import { ReactNode, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Layers, Plus, Github, Moon, Sun, Search, Command } from "lucide-react";
import { Toaster, toast } from "sonner";

interface LayoutProps {
  children: ReactNode;
  user: { username: string; avatarUrl?: string } | null;
  onLogin: () => void;
  onLogout: () => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setDark(!dark)}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

export function Layout({ children, user, onLogin, onLogout, currentPath, onNavigate }: LayoutProps) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isActive = (path: string) => currentPath === path;

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="bottom-right" richColors />

      {cmdOpen && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setCmdOpen(false)}>
          <div
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-md bg-card border rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                autoFocus
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="Search services..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                esc
              </kbd>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              <ServiceSearchResults
                query={cmdQuery}
                onSelect={(slug) => {
                  onNavigate(`/services/${slug}`);
                  setCmdOpen(false);
                  setCmdQuery("");
                }}
              />
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <button
            onClick={() => onNavigate("/")}
            className="flex items-center gap-2 font-semibold mr-8"
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary">
              <Layers className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm tracking-tight">Infraena</span>
          </button>

          <nav className="flex items-center gap-1 text-sm">
            <button onClick={() => onNavigate("/")} className={`px-3 py-1.5 rounded-md transition-colors ${
              isActive("/") || currentPath.startsWith("/services/")
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}>Catalog</button>
            <button onClick={() => onNavigate("/teams")} className={`px-3 py-1.5 rounded-md transition-colors ${
              isActive("/teams") ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}>Teams</button>
            <button onClick={() => onNavigate("/new")} className={`px-3 py-1.5 rounded-md transition-colors ${
              isActive("/new") ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}>
              <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />New</span>
            </button>
          </nav>

          <div className="flex-1" />

          <button
            onClick={() => setCmdOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-secondary/50 rounded-md border hover:bg-secondary transition-colors mr-3"
          >
            <Search className="w-3 h-3" />
            Search
            <kbd className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>

          <ThemeToggle />

          <div className="flex items-center gap-3 ml-2">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{user.username}</span>
                <Avatar className="h-7 w-7">
                  {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
                  <AvatarFallback className="text-xs">{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <Separator orientation="vertical" className="h-5" />
                <button onClick={onLogout} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Sign out</button>
              </div>
            ) : (
              <Button size="sm" onClick={onLogin} variant="outline" className="gap-2">
                <Github className="w-4 h-4" />Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container py-8 animate-fade-in">{children}</main>
    </div>
  );
}

function ServiceSearchResults({ query, onSelect }: { query: string; onSelect: (slug: string) => void }) {
  const [results, setResults] = useState<{ id: string; slug: string; name: string; stack: string }[]>([]);

  useEffect(() => {
    if (!query || query.length < 1) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/services?limit=20`, { credentials: "include" });
        const data = await res.json();
        const services = data.data ?? data;
        setResults(
          (Array.isArray(services) ? services : []).filter((s: { name: string }) =>
            s.name.toLowerCase().includes(query.toLowerCase())
          )
        );
      } catch { setResults([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  if (results.length === 0 && query) {
    return <p className="text-sm text-muted-foreground text-center py-4">No services found</p>;
  }

  return (
    <>
      {results.slice(0, 8).map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.slug)}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-secondary transition-colors text-left"
        >
          <span className="font-medium">{s.name}</span>
          <span className="text-xs text-muted-foreground capitalize">{s.stack}</span>
        </button>
      ))}
    </>
  );
}
