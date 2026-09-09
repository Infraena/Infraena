import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TokenValidateField } from "./TokenValidateField";

describe("TokenValidateField", () => {
  it("validates a token and shows the success message", async () => {
    const validate = vi.fn().mockResolvedValue({ ok: true, message: "Authenticated as tester" });
    render(<TokenValidateField provider="github" validate={validate} />);

    fireEvent.change(screen.getByPlaceholderText(/paste.*token/i), { target: { value: "ghp_test" } });
    fireEvent.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => expect(screen.getByText(/authenticated as tester/i)).toBeDefined());
    expect(validate).toHaveBeenCalledWith("ghp_test");
  });

  it("shows the error message when validation fails", async () => {
    const validate = vi.fn().mockResolvedValue({ ok: false, message: "GitHub rejected the token (401)", detail: "Bad credentials" });
    render(<TokenValidateField provider="github" validate={validate} />);

    fireEvent.change(screen.getByPlaceholderText(/paste.*token/i), { target: { value: "ghp_bad" } });
    fireEvent.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => expect(screen.getByText(/rejected the token/i)).toBeDefined());
  });

  it("does not validate an empty token", () => {
    const validate = vi.fn().mockResolvedValue({ ok: true, message: "ok" });
    render(<TokenValidateField provider="github" validate={validate} />);

    fireEvent.click(screen.getByRole("button", { name: /validate/i }));

    expect(validate).not.toHaveBeenCalled();
  });

  it("hides the token after paste (does not echo it back)", async () => {
    const validate = vi.fn().mockResolvedValue({ ok: true, message: "ok" });
    render(<TokenValidateField provider="terraform" validate={validate} />);

    fireEvent.change(screen.getByPlaceholderText(/paste.*token/i), { target: { value: "tf_secret_123" } });
    fireEvent.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => expect(screen.getByText("ok")).toBeDefined());
    expect(screen.queryByText(/tf_secret_123/i)).toBeNull();
  });

  it("ignores a stale validation result when the token changed mid-flight", async () => {
    let resolveValidation: (r: { ok: boolean; message: string }) => void = () => {};
    const validate = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: boolean; message: string }>((resolve) => {
          resolveValidation = resolve;
        })
    );
    render(<TokenValidateField provider="github" validate={validate} />);

    const input = screen.getByPlaceholderText(/paste.*token/i);
    fireEvent.change(input, { target: { value: "token_a" } });
    fireEvent.click(screen.getByRole("button", { name: /validate/i }));

    fireEvent.change(input, { target: { value: "token_b" } });
    resolveValidation({ ok: true, message: "Validated token_a" });

    await waitFor(() => expect(screen.queryByText(/validated token_a/i)).toBeNull());
    expect(screen.getByRole("button", { name: /validate/i })).toBeEnabled();
  });
});