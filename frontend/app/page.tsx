"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentProfile, createSession, fetchAgents } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [topic, setTopic] = useState("");
  const [expectations, setExpectations] = useState("");
  const [maxRounds, setMaxRounds] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch(() => setError("Could not reach the backend. Is it running on port 8000?"));
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
      <header className="border-b border-gray-200 bg-white px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Discussion Forum</h1>
            <p className="text-sm text-gray-400 mt-0.5">Multi-agent group discussions with AI and humans</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-8 py-10 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-8">Start a new discussion</h2>
            <form onSubmit={handleStart} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2.5 uppercase tracking-wider">Topic</label>
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder="What should the agents discuss?" className="w-full input-glass px-4 py-3 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2.5 uppercase tracking-wider">
                  Expectations <span className="normal-case tracking-normal text-gray-300 ml-1 font-normal">(optional)</span>
                </label>
                <textarea value={expectations} onChange={(e) => setExpectations(e.target.value)}
                  placeholder="What do you want to get out of this discussion?" rows={3}
                  className="w-full input-glass px-4 py-3 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Max rounds per agent</label>
                <div className="flex gap-1.5">
                  {[2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setMaxRounds(n)}
                      className={`w-10 h-10 rounded-xl text-xs font-medium transition-all duration-200 ${
                        maxRounds === n ? "bg-gray-900 text-white border border-gray-900"
                        : "border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
                      }`}>{n}</button>
                  ))}
                </div>
              </div>
              {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">{error}</div>}
              <button type="submit" disabled={loading || !topic.trim()}
                className="w-full btn-accent rounded-xl px-6 py-3 text-sm font-medium disabled:opacity-20 disabled:cursor-not-allowed">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Creating&hellip;
                  </span>
                ) : "Start discussion"}
              </button>
            </form>
          </div>
        </div>

        <div>
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
              Available agents <span className="normal-case ml-1.5 text-gray-300 font-normal">({agents.length})</span>
            </h2>
            <p className="text-xs text-gray-400 mb-5 leading-relaxed">The coordinator will select the most relevant agents for your topic.</p>
            <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              {agents.map((agent) => (
                <div key={agent.id} className="rounded-xl p-3 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all duration-200">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-gray-400">{agent.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-700 truncate">{agent.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{agent.role}</div>
                    </div>
                  </div>
                </div>
              ))}
              {agents.length === 0 && <div className="text-center py-8 text-gray-300 text-xs">No agents loaded</div>}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
