import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="uat-login-screen">
      <form
        className="uat-login-card"
        onSubmit={(e) => {
          e.preventDefault();
          navigate("/go-live-readiness");
        }}
      >
        <h1>Britium Express</h1>
        <p>UAT / Go-Live Login</p>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@britiumventures.com"
            autoFocus
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
        </label>

        <button type="submit">Open UAT Readiness</button>
      </form>
    </main>
  );
}
