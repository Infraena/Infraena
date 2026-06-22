import { useEffect, useRef, useState } from "react";
import type { Service } from "@idp/shared-types";
import { api } from "./api";

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
}

export function getToken(): string | null {
  return token;
}

export function useAuth() {
  const [user, setUser] = useState<{
    id: string;
    username: string;
    role: string;
    avatarUrl?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    api
      .get<{ user: { id: string; username: string; role: string; avatarUrl?: string } }>(
        "/auth/me"
      )
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/github`;
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
    setToken(null);
  };

  return { user, loading, login, logout };
}

export function useServices(filters?: {
  team?: string;
  stack?: string;
  status?: string;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters?.team) params.set("team", filters.team);
    if (filters?.stack) params.set("stack", filters.stack);
    if (filters?.status) params.set("status", filters.status);

    api
      .get<Service[]>(`/api/services?${params.toString()}`)
      .then(setServices)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters?.team, filters?.stack, filters?.status]);

  return { services, loading };
}
