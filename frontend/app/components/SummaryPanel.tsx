"use client";

import ReactMarkdown from "react-markdown";
import type { DiscussionMessage, SessionData } from "@/lib/api";

interface Props {
  session: SessionData;
  messages: DiscussionMessage[];
  onBack: () => void;
  onNewDiscussion: () => void;
}

export default function SummaryPanel({ session, messages, onBack, onNewDiscussion }: Props) {
  const summaryMsg = messages.find((m) => m.sender_type === "coordinator" && m.is_final);
  const agentMessages = messages.filter((m) => m.sender_type === "agent");
  const participants = session.participants.filter((p) => p.type === "agent");

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm animate-fade-up">
      <div className="bg-white rounded-3xl w-full max-w-[720px] max-h-[85vh] flex flex-col shadow-xl overflow-hidden border border-gray-200">
        <div className="px-8 pt-8 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Discussion Complete</p>
            <span className="text-[11px] text-gray-500 font-mono">{messages.length} messages &middot; {participants.length} agents</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 leading-snug pr-12">{session.topic}</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {summaryMsg ? (
            <div className="prose prose-sm max-w-none text-gray-800
              prose-headings:text-gray-900 prose-headings:font-semibold
              prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2
              prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-2
              prose-p:text-gray-700 prose-p:leading-relaxed
              prose-strong:text-gray-800 prose-strong:font-semibold
              prose-li:text-gray-700 prose-li:marker:text-gray-400
              prose-hr:border-gray-100">
              <ReactMarkdown>{summaryMsg.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic text-center py-8">No summary available for this discussion.</p>
          )}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-100">
            <div className="text-center">
              <div className="text-2xl font-semibold text-gray-800 tabular-nums">{participants.length}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Agents</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-gray-800 tabular-nums">{agentMessages.length}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Responses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-gray-800 tabular-nums">{messages.length}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Messages</div>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Participants</p>
            <div className="grid grid-cols-2 gap-1.5">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2 border border-gray-100">
                  <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-medium text-gray-500">{p.name.charAt(0)}</span>
                  </div>
                  <span className="text-xs text-gray-700 truncate">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-8 pb-8 pt-4 border-t border-gray-100 flex gap-3">
          <button onClick={onBack} className="flex-1 btn-ghost rounded-xl py-2.5 text-sm font-medium">Back to discussion</button>
          <button onClick={onNewDiscussion} className="flex-1 btn-accent rounded-xl py-2.5 text-sm font-medium">New discussion</button>
        </div>
      </div>
    </div>
  );
}
