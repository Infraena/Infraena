import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Service } from "@infraena/shared-types";
import { WebhooksPanel, WebhookData } from "./WebhooksPanel";
import { api } from "@/lib/api";

vi.mock("@/lib/websocket", () => ({
  useWebhookEvents: () => null,
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const TOKEN = "a".repeat(64);

const baseData: WebhookData = {
  inbound: {
    id: "wh-1",
    serviceId: "svc-1",
    direction: "inbound",
    kind: "generic",
    url: null,
    token: TOKEN,
    enabled: true,
    events: ["*"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  outbound: [
    {
      id: "out-1",
      serviceId: "svc-1",
      direction: "outbound",
      kind: "slack",
      url: "https://hooks.slack.test/abc",
      token: null,
      enabled: true,
      events: ["service.ready"],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  recentEvents: [
    {
      id: "ev-1",
      webhookId: "wh-1",
      serviceId: "svc-1",
      direction: "inbound",
      event: "deployment.started",
      status: "received",
      error: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const service: Service = {
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
  provisioning: ["github"],
  status: "ready",
  healthUrl: null,
  healthStatus: "unknown",
  healthDetail: null,
  healthLatencyMs: null,
  lastHealthCheckAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("WebhooksPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(baseData);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders the inbound URL and recent events", async () => {
    render(<WebhooksPanel service={service} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(new RegExp(`/api/webhooks/in/${TOKEN}$`))).toBeDefined();
    });
    expect(api.get).toHaveBeenCalledWith("/api/webhooks/auth");
    expect(screen.getByText("Deploy started")).toBeDefined();
    expect(screen.getByText("received")).toBeDefined();
  });

  it("shows a sign-in note when unauthenticated", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Not authenticated"));
    render(<WebhooksPanel service={service} />);
    await waitFor(() => {
      expect(screen.getByText(/Sign in to manage webhooks/)).toBeDefined();
    });
  });

  it("regenerates the token after confirm", async () => {
    render(<WebhooksPanel service={service} />);
    await waitFor(() => expect(screen.getByTitle("Regenerate token")).toBeDefined());

    fireEvent.click(screen.getByTitle("Regenerate token"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/webhooks/auth/inbound/regenerate");
    });
  });

  it("creates an outbound webhook with selected events", async () => {
    render(<WebhooksPanel service={service} />);
    await waitFor(() => expect(screen.getByText("+ Add")).toBeDefined());

    fireEvent.click(screen.getByText("+ Add"));
    fireEvent.change(screen.getByPlaceholderText("https://hooks.slack.com/services/..."), {
      target: { value: "https://hooks.slack.test/new" },
    });
    fireEvent.click(screen.getByText("Deploy finished"));
    fireEvent.click(screen.getByText("Add webhook"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/webhooks/auth/outbound", {
        kind: "slack",
        url: "https://hooks.slack.test/new",
        events: ["deployment.finished"],
      });
    });
  });

  it("sends a test notification", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<WebhooksPanel service={service} />);
    await waitFor(() => expect(screen.getByText("Test")).toBeDefined());

    fireEvent.click(screen.getByText("Test"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/webhooks/auth/outbound/out-1/test");
    });
  });

  it("deletes an outbound webhook after confirm", async () => {
    render(<WebhooksPanel service={service} />);
    await waitFor(() => expect(screen.getByTitle("Delete webhook")).toBeDefined());

    fireEvent.click(screen.getByTitle("Delete webhook"));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/api/webhooks/auth/outbound/out-1");
    });
  });

  it("toggles enabled state", async () => {
    render(<WebhooksPanel service={service} />);
    await waitFor(() => expect(screen.getByText("Enabled")).toBeDefined());

    fireEvent.click(screen.getByText("Enabled"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/api/webhooks/auth/outbound/out-1", {
        enabled: false,
      });
    });
  });
});