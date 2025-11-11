import { useState } from "react";
import { AuthModal } from "./AuthModal";

export function HomePage() {
  const [isAuthOpen, setAuthOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-48 top-12 h-[26rem] w-[26rem] rounded-full bg-brand/20 blur-3xl sm:h-[30rem] sm:w-[30rem]" />
        <div className="absolute bottom-10 -right-32 h-[22rem] w-[22rem] rounded-full bg-indigo-500/10 blur-3xl sm:h-[28rem] sm:w-[28rem]" />
      </div>

      <header className="relative z-10 border-b border-white/5 bg-slate-950/60 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/80 p-2 shadow-lg shadow-brand/40">
              <img
                src="/ucl-logo.svg"
                alt="UCL logo"
                className="h-full w-full object-contain"
                loading="lazy"
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                UCL
              </p>
              <span className="text-lg font-semibold text-white">
                Unknown CRUD Library
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex">
            <a href="#hero" className="transition hover:text-white">
              Home
            </a>
            <a href="#about" className="transition hover:text-white">
              About
            </a>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="rounded-full border border-brand/70 bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-brand/30 transition hover:-translate-y-0.5 hover:bg-brand-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Login
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="inline-flex items-center justify-center rounded-full border border-brand/70 bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-brand/30 transition hover:-translate-y-0.5 hover:bg-brand-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:hidden"
          >
            Login
          </button>
        </nav>
      </header>

      <main className="relative z-10">
        <section id="hero" className="mx-auto flex min-h-[70vh] max-w-6xl flex-col gap-12 px-6 py-16 md:flex-row md:items-center md:justify-between md:gap-16">
          <div className="max-w-xl space-y-6 text-center md:text-left">
            <p className="text-sm uppercase tracking-[0.4em] text-slate-400">
              Preserve every verse
            </p>
            <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
              A collaborative platform for sacred text stewardship.
            </h1>
            <p className="text-base text-slate-300 sm:text-lg">
              Coordinate editors, reviewers, and SMEs with tools built for the Unknown CRUD
              Library. Capture translations, commentary, and provenance with confidence.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-start">
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="inline-flex w-full items-center justify-center rounded-full border border-brand/70 bg-brand px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-brand/30 transition hover:-translate-y-0.5 hover:bg-brand-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
              >
                Login
              </button>
              <a
                href="#about"
                className="inline-flex w-full items-center justify-center rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-slate-300 transition hover:-translate-y-0.5 hover:border-slate-500 hover:text-white sm:w-auto"
              >
                Learn More
              </a>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div className="relative w-full max-w-md">
              <div className="absolute inset-0 -translate-y-6 transform rounded-3xl bg-brand/20 blur-2xl" />
              <div className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-brand/30">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
                  <h2 className="text-xl font-semibold text-white">Unknown CRUD Library</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Invite experts, manage review cycles, and maintain a single source of truth.
                  </p>
                  <div className="mt-6 grid gap-3 text-sm text-slate-300">
                    <FeatureBullet title="Collaborative reviews" description="Keep editors, reviewers, and SMEs aligned in real time." />
                    <FeatureBullet title="Rich verse editor" description="Track provenance, translations, and commentary without friction." />
                    <FeatureBullet title="Role-based access" description="Ensure the right eyes see the right material at the right time." />
                    <FeatureBullet title="Audit-ready history" description="Complete records of changes and published states." />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="border-t border-white/5 bg-slate-900/40 py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="grid gap-10 lg:grid-cols-[2fr,3fr] lg:items-center">
              <div className="space-y-4 text-center lg:text-left">
                <p className="text-sm uppercase tracking-[0.4em] text-slate-400">
                  About UCL
                </p>
                <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                  Stewardship and scholarship for sacred texts.
                </h2>
              </div>
              <div className="space-y-5 text-sm leading-relaxed text-slate-300 sm:text-base">
                <p>
                  Unknown CRUD Library empowers research programs to safeguard rare translations,
                  maintain commentary archives, and foster collaboration between linguists and
                  subject-matter experts. Our platform centralizes verse workflows so each line is
                  reviewed, annotated, and preserved with context.
                </p>
                <p>
                  Role-aware permissioning keeps sensitive content secure while still enabling rapid
                  iteration. Integrated provenance tracking and export tools ensure every change can
                  be traced, audited, and re-used across projects.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-slate-950/80 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-center text-xs text-slate-500 sm:flex-row sm:text-sm">
          <p>© {new Date().getFullYear()} Unknown CRUD Library. All rights reserved.</p>
          <p>Crafted in partnership with the UCL digital stewardship team.</p>
        </div>
      </footer>

      <AuthModal isOpen={isAuthOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

function FeatureBullet({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-lg shadow-black/10 backdrop-blur">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-400 sm:text-sm">{description}</p>
    </div>
  );
}

