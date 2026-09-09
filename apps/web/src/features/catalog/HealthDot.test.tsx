import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HealthDot } from "./HealthDot";

const base = {
  healthUrl: "https://example.com/health",
  latencyMs: 12,
  lastHealthCheckAt: new Date().toISOString(),
};

describe("HealthDot", () => {
  it("renders nothing when there is no healthUrl", () => {
    const { container } = render(<HealthDot healthUrl={null} healthStatus="unknown" />);
    expect(container.querySelector('[data-testid="health-dot"]')).toBeNull();
  });

  it("renders a healthy dot with latency in the title", () => {
    render(<HealthDot {...base} healthStatus="healthy" healthDetail="HTTP 200" />);
    const dot = screen.getByTestId("health-dot");
    expect(dot.className).toContain("bg-emerald-500");
    expect(dot.getAttribute("title")).toContain("Healthy");
    expect(dot.getAttribute("title")).toContain("12ms");
    expect(dot.getAttribute("title")).toContain("HTTP 200");
  });

  it("renders an unhealthy dot", () => {
    render(<HealthDot {...base} healthStatus="unhealthy" healthDetail="HTTP 503" />);
    const dot = screen.getByTestId("health-dot");
    expect(dot.className).toContain("bg-red-500");
    expect(dot.getAttribute("title")).toContain("Unhealthy");
  });

  it("renders an unknown dot without details", () => {
    render(<HealthDot healthUrl="https://example.com/health" healthStatus="unknown" />);
    const dot = screen.getByTestId("health-dot");
    expect(dot.className).toContain("bg-muted-foreground/40");
    expect(dot.getAttribute("title")).toContain("Unknown");
  });
});
