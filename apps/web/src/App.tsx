import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { CatalogPage } from "@/features/catalog/CatalogPage";
import { CreateServicePage } from "@/features/create/CreateServicePage";
import { ServiceDetailPage } from "@/features/service/ServiceDetailPage";
import { TeamsPage } from "@/features/teams/TeamsPage";
import { useAuth } from "@/lib/hooks";

type Page =
  | { name: "catalog" }
  | { name: "create" }
  | { name: "teams" }
  | { name: "service"; slug: string };

function getPageFromPath(): Page {
  const path = window.location.pathname;
  if (path === "/new") return { name: "create" };
  if (path === "/teams") return { name: "teams" };
  const match = path.match(/^\/services\/(.+)/);
  if (match) return { name: "service", slug: match[1] };
  return { name: "catalog" };
}

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const [page, setPage] = useState<Page>(getPageFromPath);

  useEffect(() => {
    history.scrollRestoration = "manual";
  }, []);

  useEffect(() => {
    const handler = () => setPage(getPageFromPath());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  function navigate(url: string) {
    window.history.pushState({}, "", url);
    setPage(getPageFromPath());
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <Layout
      user={user ? { username: user.username, avatarUrl: user.avatarUrl } : null}
      onLogin={login}
      onLogout={logout}
      currentPath={window.location.pathname}
      onNavigate={navigate}
    >
      {page.name === "catalog"  && <CatalogPage onNavigate={navigate} />}
      {page.name === "create"   && <CreateServicePage onNavigate={navigate} />}
      {page.name === "teams"    && <TeamsPage onNavigate={navigate} />}
      {page.name === "service"  && <ServiceDetailPage slug={page.slug} onNavigate={navigate} />}
    </Layout>
  );
}
