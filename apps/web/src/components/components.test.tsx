import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";
import { StackBadge } from "./StackBadge";
import { LogTerminal } from "./LogTerminal";

describe("StatusBadge", () => {
  it("renders provisioning status", () => {
    render(<StatusBadge status="provisioning" />);
    expect(screen.getByText("Provisioning")).toBeDefined();
  });

  it("renders ready status", () => {
    render(<StatusBadge status="ready" />);
    expect(screen.getByText("Ready")).toBeDefined();
  });

  it("renders failed status", () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText("Failed")).toBeDefined();
  });
});

describe("StackBadge", () => {
  it("renders backend category with nodejs language", () => {
    render(<StackBadge category="backend" languages={["nodejs"]} />);
    expect(screen.getByText("Node.js")).toBeDefined();
  });

  it("renders frontend category with react", () => {
    render(<StackBadge category="frontend" languages={["react"]} />);
    expect(screen.getByText("React")).toBeDefined();
  });

  it("renders database category without languages", () => {
    render(<StackBadge category="database" languages={[]} />);
    const elements = screen.getAllByText(/Database/i);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });
});

describe("LogTerminal", () => {
  it("renders empty state", () => {
    render(<LogTerminal logs={[]} />);
    expect(screen.getByText("Waiting for logs...")).toBeDefined();
  });

  it("renders log lines", () => {
    render(<LogTerminal logs={["[2024-01-01] Starting...", "[2024-01-01] Done."]} />);
    expect(screen.getByText(/Starting/)).toBeDefined();
    expect(screen.getByText(/Done/)).toBeDefined();
  });
});
