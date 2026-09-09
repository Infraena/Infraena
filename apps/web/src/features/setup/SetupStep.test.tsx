import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SetupStep } from "./SetupStep";
import type { CheckResult } from "./setupGuide";

const check = (overrides: Partial<CheckResult>): CheckResult => ({
  ok: false,
  message: "Not configured — set GITHUB_TOKEN",
  required: true,
  envVars: ["GITHUB_TOKEN"],
  ...overrides,
});

describe("SetupStep", () => {
  it("renders the check title and message", () => {
    render(<SetupStep label="GitHub API" check={check({})} />);
    expect(screen.getByText("GitHub API")).toBeDefined();
    expect(screen.getByText(/Not configured/)).toBeDefined();
  });

  it("is collapsed by default and expands to show steps and env snippet", () => {
    render(<SetupStep label="GitHub API" check={check({})} guideProvider="github-pat" />);
    expect(screen.queryByText(/create a classic pat/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /fix this/i }));
    expect(screen.getByText(/create a classic pat/i)).toBeDefined();
    expect(screen.getByText(/GITHUB_TOKEN=<your-value>/i)).toBeDefined();
  });

  it("renders a token validation field for token providers when expanded", () => {
    render(<SetupStep label="GitHub API" check={check({})} guideProvider="github-pat" validate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /fix this/i }));
    expect(screen.getByPlaceholderText(/paste.*token/i)).toBeDefined();
  });

  it("does not render token validation for non-token providers", () => {
    render(<SetupStep label="GitHub OAuth" check={check({ envVars: ["GITHUB_CLIENT_ID"] })} guideProvider="github-oauth" />);
    fireEvent.click(screen.getByRole("button", { name: /fix this/i }));
    expect(screen.queryByPlaceholderText(/paste.*token/i)).toBeNull();
  });
});