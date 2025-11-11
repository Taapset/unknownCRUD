import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatError } from "../lib/apiClient";

type AuthTab = "login" | "register";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPasswordValid = useMemo(
    () => (tab === "login" ? password.length > 0 : password.length >= 8),
    [password.length, tab],
  );

  if (!isOpen) {
    return null;
  }

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setErrorMessage(null);
  };

  const closeModal = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (tab === "login") {
        await login({ email, password });
      } else {
        if (password.length < 8) {
          setErrorMessage("Password must be at least 8 characters long.");
          setSubmitting(false);
          return;
        }
        await register({ email, password, roles: ["submitter"] });
      }
      closeModal();
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-3 sm:px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="text-base font-semibold text-slate-100 sm:text-lg">
            {tab === "login" ? "Sign In" : "Create Account"}
          </h3>
          <button
            type="button"
            onClick={closeModal}
            className="text-sm text-slate-400 transition hover:text-slate-100"
          >
            ✕
          </button>
        </header>

        <nav className="flex gap-0.5 border-b border-slate-800 px-4 sm:gap-1 sm:px-6">
          <TabButton
            label="Login"
            active={tab === "login"}
            onClick={() => {
              setTab("login");
              setErrorMessage(null);
            }}
          />
          <TabButton
            label="Register"
            active={tab === "register"}
            onClick={() => {
              setTab("register");
              setErrorMessage(null);
            }}
          />
        </nav>

        <form className="px-4 py-4 sm:px-6 sm:py-6" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-200">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
              {tab === "register" && (
                <p className="mt-1 text-xs text-slate-500">
                  Minimum 8 characters for new accounts.
                </p>
              )}
            </div>

            {errorMessage && (
              <div className="rounded-md border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
            <button
              type="button"
              onClick={closeModal}
              className="order-2 rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white sm:order-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !isPasswordValid}
              className="order-1 rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:bg-slate-700 sm:order-2"
            >
              {submitting
                ? "Submitting…"
                : tab === "login"
                ? "Login"
                : "Create Account"}
            </button>
          </div>
        </form>
        <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-900/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-slate-500 sm:text-sm">Need privileged tools?</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                closeModal();
                navigate("/admin");
              }}
              className="rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-brand hover:text-white sm:text-sm"
            >
              Go to Admin Portal
            </button>
            <button
              type="button"
              onClick={() => {
                closeModal();
                navigate("/sme");
              }}
              className="rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-400 hover:text-white sm:text-sm"
            >
              Go to SME Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const base =
    "flex-1 px-3 py-3 text-center text-sm font-medium transition focus:outline-none";
  const state = active
    ? "border-b-2 border-brand text-white"
    : "text-slate-400 hover:text-slate-200";
  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`}>
      {label}
    </button>
  );
}
