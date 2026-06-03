"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  DiscussionMessage, fetchSession, ServerEvent, SessionData,
  streamDiscussion, streamHumanMessage, streamScoping,
} from "@/lib/api";
import SummaryPanel from "@/app/components/SummaryPanel";

type Phase = "loading" | "scoping" | "awaiting_approval" | "discussing" | "completed";

const AGENT_COLORS: Record<string, string> = {
  ethicist:     "#7c3aed",
  optimist:     "#2563eb",
  skeptic:      "#d97706",
  pragmatist:   "#059669",
  humanist:     "#db2777",
  technologist: "#0891b2",
  economist:    "#ea580c",
  designer:     "#c026d3",
  coordinator:  "#4f46e5",
  human:        "#7c3aed",
};

function ThinkingIndicator({ name, color }: { name: string; color: string }) {
  return (
    <div className="animate-fade-up flex items-start gap-2.5 max-w-[85%]">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
        <span className="text-[10px] font-semibold" style={{ color }}>{name.charAt(0)}</span>
      </div>
      <div className="bubble-agent px-3 py-2.5 overflow-hidden" style={{ borderColor: `${color}20` }}>
        <div className="text-[10px] font-medium mb-2" style={{ color }}>{name}</div>
        <div className="flex items-center gap-1">
          <span className="typing-dot" style={{ background: color, width: 4, height: 4 }} />
          <span className="typing-dot" style={{ background: color, width: 4, height: 4 }} />
          <span className="typing-dot" style={{ background: color, width: 4, height: 4 }} />
        </div>
      </div>
    </div>
  );
}

export default function DiscussionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [statusText, setStatusText] = useState("");
  const [thinkingAgent, setThinkingAgent] = useState<string | null>(null);
  const [speakingAgent, setSpeakingAgent] = useState<string | null>(null);
  const [agentList, setAgentList] = useState<Array<{id:string;name:string;role:string}>>([]);
  const [humanInput, setHumanInput] = useState("");
  const [error, setError] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const cancelRef = useRef<(() => void) | null>(null);
  const speakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelAndReplace = useCallback((c: () => void) => { cancelRef.current?.(); cancelRef.current = c; }, []);
  const setSpeaking = useCallback((name: string | null) => {
    if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current);
    setSpeakingAgent(name);
    if (name) speakTimeoutRef.current = setTimeout(() => setSpeakingAgent(null), 5000);
  }, []);

  useEffect(() => { return () => { cancelRef.current?.(); if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current); }; }, []);

  useEffect(() => {
    if (!id) return;
    fetchSession(id).then((data) => {
      setSession(data); setMessages(data.messages || []);
      if (data.state === "created" || data.state === "scoping") startScoping();
      else if (data.state === "awaiting_approval") setPhase("awaiting_approval");
      else if (data.state === "in_progress") { setPhase("discussing"); startDiscussion(); }
      else if (data.state === "completed") setPhase("completed");
    }).catch(() => setError("Failed to load session"));
  }, [id]);

  const startScoping = () => {
    if (!id) return; setPhase("scoping"); setStatusText("Analyzing topic..."); setError("");
    cancelAndReplace(streamScoping(id, (e: ServerEvent) => {
      switch (e.type) {
        case "status": setStatusText(e.message || ""); break;
        case "scope_defined": break;
        case "agents_selected": setAgentList(e.agents || []); setPhase("awaiting_approval"); break;
        case "error": setError(e.message || ""); break;
      }
    }, (err) => setError(err.message)));
  };

  const startDiscussion = () => {
    if (!id) return; setPhase("discussing"); setStatusText("Starting..."); setError("");
    cancelAndReplace(streamDiscussion(id, (e: ServerEvent) => {
      switch (e.type) {
        case "status": setStatusText(e.message || ""); setThinkingAgent(e.message?.includes("thinking") ? e.message.split(" is")[0] : null); break;
        case "message":
          if (e.message) { const msg = e.message as DiscussionMessage; setMessages((p) => p.find((m) => m.id === msg.id) ? p : [...p, msg]); setThinkingAgent(null); if (msg.sender_type === "agent") setSpeaking(msg.sender_name); }
          break;
        case "summary": if (e.message) setMessages((p) => [...p, e.message as DiscussionMessage]); setPhase("completed"); setShowSummary(true); break;
        case "complete": setPhase("completed"); setShowSummary(true); break;
        case "error": setError(e.message || ""); break;
      }
    }, (err) => setError(err.message)));
  };

  const sendHuman = () => {
    if (!humanInput.trim() || !id) return;
    const c = humanInput; setHumanInput(""); setError("");
    cancelAndReplace(streamHumanMessage(id, c, (e: ServerEvent) => {
      switch (e.type) {
        case "status": setThinkingAgent(e.message?.includes("thinking") ? e.message.split(" is")[0] : null); break;
        case "message":
          if (e.message) { const msg = e.message as DiscussionMessage; setMessages((p) => p.find((m) => m.id === msg.id) ? p : [...p, msg]); setThinkingAgent(null); if (msg.sender_type === "agent") setSpeaking(msg.sender_name); }
          break;
        case "summary": if (e.message) setMessages((p) => [...p, e.message as DiscussionMessage]); setPhase("completed"); setShowSummary(true); break;
        case "complete": setPhase("completed"); setShowSummary(true); break;
      }
    }, (err) => setError(err.message)));
  };

  const agentParticipants = useMemo(() => session?.participants.filter((p) => p.type === "agent") || [], [session?.participants]);

  if (phase === "loading") return (
    <div className="h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <header className="z-20 border-b border-gray-100 bg-white/90 backdrop-blur-xl px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/" className="text-gray-300 hover:text-gray-600 text-lg transition-colors">&larr;</a>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 truncate max-w-[500px]">{session?.topic}</h1>
            <p className="text-[11px] text-gray-400">{statusText}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {error && <span className="text-[11px] text-red-500 truncate max-w-[200px] hidden sm:inline">{error}</span>}
          {phase === "completed" && !showSummary && (
            <button onClick={() => setShowSummary(true)} className="text-xs px-4 py-2 rounded-lg btn-accent">View Summary</button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[200px] shrink-0 border-r border-gray-100 bg-gray-50/50 flex flex-col overflow-y-auto p-4 gap-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">Participants</p>
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: AGENT_COLORS.coordinator }} />
            <span className="text-xs text-gray-500 truncate">Coordinator</span>
          </div>
          {agentParticipants.map((p) => {
            const color = AGENT_COLORS[p.id] || "#6b7280";
            const isThinking = thinkingAgent === p.name;
            const isSpeaking = speakingAgent === p.name;
            return (
              <div key={p.id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${isSpeaking ? "bg-gray-100" : isThinking ? "bg-amber-50" : ""}`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${isSpeaking || isThinking ? "animate-pulse-subtle" : ""}`}
                  style={{ background: isSpeaking ? color : isThinking ? "#d97706" : "#d1d5db" }} />
                <span className={`text-xs truncate ${isSpeaking ? "text-gray-900 font-medium" : isThinking ? "text-amber-700" : "text-gray-400"}`}>{p.name}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: AGENT_COLORS.human }} />
            <span className="text-xs text-gray-500 truncate">You</span>
          </div>
          <div className="mt-auto pt-4 border-t border-gray-100">
            <span className="text-[10px] text-gray-300 uppercase tracking-wider">
              {phase === "scoping" ? "Scoping" : phase === "awaiting_approval" ? "Setup" : phase === "discussing" ? "Live" : phase === "completed" ? "Done" : ""}
            </span>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-[640px] mx-auto space-y-3">
              {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">{error}</div>}
              {agentList.length > 0 && phase === "awaiting_approval" && (
                <div className="bubble-coordinator p-5 space-y-4 text-center">
                  <p className="text-xs text-gray-400">Selected discussants</p>
                  <div className="grid grid-cols-2 gap-2 text-left">
                    {agentList.map((a) => (
                      <div key={a.id} className="bg-gray-50 rounded-lg p-2.5 text-xs">
                        <div className="text-gray-700 font-medium">{a.name}</div>
                        <div className="text-gray-400">{a.role}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={startDiscussion} className="w-full btn-accent rounded-lg py-2.5 text-xs font-medium">Begin Discussion</button>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className="animate-fade-up">
                  {msg.sender_type === "coordinator" ? (
                    <div className="bubble-coordinator p-3 text-center">
                      <div className="prose prose-sm max-w-none text-gray-600 prose-headings:text-gray-800 text-xs">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className={`${msg.sender_type === "human" ? "bubble-human ml-auto" : "bubble-agent"} max-w-[85%] p-3`}>
                      <div className="text-[10px] text-gray-400 mb-1">{msg.sender_name}</div>
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      {msg.reactions.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
                          {(() => {
                            const thumbsUp = msg.reactions.filter((r) => r.emoji === "👍").length;
                            const thumbsDown = msg.reactions.filter((r) => r.emoji === "👎").length;
                            return (<>
                              {thumbsUp > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400"><span>👍</span><span className="tabular-nums">{thumbsUp}</span></span>}
                              {thumbsDown > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400"><span>👎</span><span className="tabular-nums">{thumbsDown}</span></span>}
                            </>);
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {thinkingAgent && (() => {
                const participant = session?.participants.find((pt) => pt.name === thinkingAgent);
                const agentColor = (participant ? AGENT_COLORS[participant.id] : undefined) || "#6b7280";
                return <ThinkingIndicator name={thinkingAgent} color={agentColor} />;
              })()}
            </div>
          </div>

          <div className="border-t border-gray-100 px-8 py-4 bg-white shrink-0">
            <div className="max-w-[640px] mx-auto">
            {phase === "discussing" ? (
              <div className="flex gap-2">
                <input value={humanInput} onChange={(e) => setHumanInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendHuman()}
                  placeholder="Jump into the discussion..." className="flex-1 input-glass px-4 py-2.5 text-sm" />
                <button onClick={sendHuman} disabled={!humanInput.trim()}
                  className="btn-accent rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">Send</button>
              </div>
            ) : null}
            </div>
          </div>
        </div>
      </div>

      {showSummary && session && (
        <SummaryPanel session={session} messages={messages} onBack={() => setShowSummary(false)} onNewDiscussion={() => router.push("/")} />
      )}
    </div>
  );
}
