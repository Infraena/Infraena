import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Service } from "@infraena/shared-types";
import { HealthCard } from "./HealthCard";
import { api } from "@/lib/api";

vi.mock("@/lib/websocket", () => ({
  useHealthUpdates: () => null,
}));

vi.mock("@/lib/api", () => ({
  api: { patch: vi.fn(), post: vi.fn() },
}));

const baseService: Service = {
  id: "svc-1",
  name: "auth",
  slug: "auth",
  description: null,
  category: "backend",
  languages: ["nodejs"],
  teamId: "team-1",
  ownerId: "user-1",
  repoUrl: null,
  repoProvider: null,
  provisioning: ["github", "terraform", "vault"],
  status: "ready",
  healthUrl: null,
  healthStatus: "unknown",
  healthDetail: null,
  healthLatencyMs: null,
  lastHealthCheckAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("HealthCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the not-configured state when there is no URL", () => {
    render(<HealthCard service={baseService} />);
    expect(screen.getByText("Set a URL to enable automatic health checks.")).toBeDefined();
    expect(screen.getByPlaceholderText("https://your-service.example.com/health")).toBeDefined();
  });

  it("shows healthy state with latency", () => {
    render(
      <HealthCard
        service={{
          ...baseService,
          healthUrl: "https://example.com",
          healthStatus: "healthy",
          healthLatencyMs: 12,
          healthDetail: "HTTP 200",
          lastHealthCheckAt: "2026-01-01T00:00:00.000Z",
        }}
      />
    );
    expect(screen.getByText("Healthy")).toBeDefined();
    expect(screen.getByText(/12ms/)).toBeDefined();
    expect(screen.getByText("HTTP 200")).toBeDefined();
  });

  it("saves a new URL via PATCH", async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { ...baseService, healthUrl: "https://example.com/health" },
    });
    const onServiceChange = vi.fn();
    render(<HealthCard service={baseService} onServiceChange={onServiceChange} />);

    fireEvent.change(screen.getByPlaceholderText("https://your-service.example.com/health"), {
      target: { value: "https://example.com/health" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/api/services/auth", {
        healthUrl: "https://example.com/health",
      });
    });
    expect(onServiceChange).toHaveBeenCalledWith(
      expect.objectContaining({ healthUrl: "https://example.com/health" })
    );
  });

  it("clears the URL when the input is emptied", async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { ...baseService, healthUrl: null },
    });
    render(
      <HealthCard
        service={{ ...baseService, healthUrl: "https://example.com" }}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("https://your-service.example.com/health"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/api/services/auth", { healthUrl: null });
    });
  });

  it("runs a check now and reports the outcome", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        status: "healthy",
        latencyMs: 8,
        detail: "HTTP 200",
        checkedAt: "2026-01-01T00:00:01.000Z",
      },
    });
    const onServiceChange = vi.fn();
    render(
      <HealthCard
        service={{ ...baseService, healthUrl: "https://example.com" }}
        onServiceChange={onServiceChange}
      />
    );

    fireEvent.click(screen.getByText("Check now"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/services/auth/health/check");
    });
    expect(onServiceChange).toHaveBeenCalledWith(
      expect.objectContaining({ healthStatus: "healthy", healthLatencyMs: 8 })
    );
  });
});
