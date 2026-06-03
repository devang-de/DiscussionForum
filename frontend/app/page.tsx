"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentProfile, createSession, fetchAgents, fetchSessions, SessionListItem } from "@/lib/api";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function stateLabel(state: string): { label: string; color: string; bg: string } {
  switch (state) {
    case "completed":
      return { label: "Completed", color: "text-emerald-600", bg: "bg-emerald-50" };
    case "in_progress":
      return { label: "In progress", color: "text-amber-600", bg: "bg-amber-50" };
    case "summarizing":
      return { label: "Summarizing", color: "text-indigo-600", bg: "bg-indigo-50" };
    case "scoping":
      return { label: "Scoping", color: "text-sky-600", bg: "bg-sky-50" };
    case "awaiting_approval":
      return { label: "Awaiting approval", color: "text-orange-600", bg: "bg-orange-50" };
    default:
      return { label: state, color: "text-gray-500", bg: "bg-gray-100" };
  }
}

export default function HomePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [topic, setTopic] = useState("");
  const [expectations, setExpectations] = useState("");
  const [maxRounds, setMaxRounds] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAgents().then(setAgents).catch(() => {}),
      fetchSessions().then(setSessions).catch(() => {}),
    ]).catch(() => setError("Could not reach the backend. Is it running on port 8000?"));
  }, []);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { session_id } = await createSession(topic, expectations || undefined, maxRounds);
      router.push(`/discussion/${session_id}`);
    } catch {
      setError("Failed to create discussion. Please ensure the backend is running.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* ── Header ──────────────────────────── */}
      <header className="border-b border-gray-200 bg-white px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-gray-900">Discussion Forum</h1>
              <p className="text-xs text-gray-400">Multi-agent AI discussions</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {agents.length} agents available
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* ── New Discussion Card ──────────────── */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-white rounded-2xl border border-dashed border-gray-300 p-6 text-left hover:border-gray-400 hover:bg-gray-50/50 transition-all duration-200 group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Start a new discussion</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Create a topic and watch AI agents debate spontaneously
                </div>
              </div>
            </div>
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8 animate-fade-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-semibold text-gray-900">New discussion</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleStart} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What should the agents discuss?"
                  className="w-full input-glass px-4 py-2.5 text-sm"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                  Expectations <span className="normal-case tracking-normal text-gray-300 ml-1 font-normal">(optional)</span>
                </label>
                <textarea
                  value={expectations}
                  onChange={(e) => setExpectations(e.target.value)}
                  placeholder="What do you want to get out of this discussion?"
                  rows={2}
                  className="w-full input-glass px-4 py-2.5 text-sm resize-none"
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-600">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || !topic.trim()}
                className="w-full btn-accent rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-20 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Creating&hellip;
                  </span>
                ) : (
                  "Start discussion"
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── Past Discussions ──────────────────── */}
        <div className="mt-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Past discussions
          </h2>

          {sessions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400 font-medium">No discussions yet</p>
              <p className="text-xs text-gray-300 mt-1">Create your first discussion above to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => {
                const st = stateLabel(s.state);
                return (
                  <div
                    key={s.id}
                    onClick={() => router.push(`/discussion/${s.id}`)}
                    className="bg-white rounded-xl border border-gray-200 px-5 py-4 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all duration-200 group"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate group-hover:text-gray-600 transition-colors">
                          {s.topic}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-gray-400">{timeAgo(s.created_at)}</span>
                          <span className="text-gray-200">·</span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${st.color} ${st.bg}`}>
                            {st.label}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
