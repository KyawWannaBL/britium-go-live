import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import "./MustChangePasswordClient.css";

export default function MustChangePasswordClient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const nextPath = useMemo(() => {
    return searchParams.get("next") || "/create-delivery";
  }, [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      if (!password || password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const response = await fetch("/api/auth/complete-password-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || "Failed to complete password change.");
        return;
      }

      setInfo("Password changed successfully.");
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mcp-page">
      <div className="mcp-card">
        <div className="mcp-header">
          <div className="mcp-badge">Britium Express Delivery</div>
          <h1 className="mcp-title">Change Your Password</h1>
          <p className="mcp-subtitle">
            You must set a new password before continuing to the operations console.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mcp-form">
          <label className="mcp-label">
            <span>New Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="mcp-input"
              autoComplete="new-password"
              required
            />
          </label>

          <label className="mcp-label">
            <span>Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="mcp-input"
              autoComplete="new-password"
              required
            />
          </label>

          {error ? <div className="mcp-error">{error}</div> : null}
          {info ? <div className="mcp-info">{info}</div> : null}

          <button type="submit" className="mcp-primaryButton" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
