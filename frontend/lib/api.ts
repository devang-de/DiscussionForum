/** API client for the Discussion Forum backend. */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  expertise: string[];
  personality: string;
  stance: string;
  avatar_emoji: string;
  avatar_color: string;
}

export interface SessionParticipant {
  id: string;
  name: string;
  type: string;
  avatar_url: string;
  turns_used: number;
  max_turns: number;
}

export interface DiscussionMessage {
  id: string;
  session_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  sender_avatar: string;
  content: string;
  reply_to_id: string | null;
  reply_to_sender: string | null;
  msg_type: string;
  reactions: Reaction[];
  is_final: boolean;
  created_at: string;
}

export interface Reaction {
  id: string;
  message_id: string;
  sender_id: string;
  sender_name: string;
  emoji: string;
}

export interface SessionData {
  id: string;
  topic: string;
  scope: string | null;
  state: string;
  participants: SessionParticipant[];
  turn_state: any;
  messages: DiscussionMessage[];
  summary: string | null;
  created_at: string;
}

export interface CreateSessionResponse {
  session_id: string;
  topic: string;
  state: string;
  participants: SessionParticipant[];
}

export interface ServerEvent {
  type: string;
  message?: any;
  scope?: string;
  key_questions?: string[];
  perspectives_needed?: string[];
  agents?: AgentProfile[];
  reasoning?: string;
  session_id?: string;
}

// ─── API calls ────────────────────────────────────────────

export async function fetchAgents(): Promise<AgentProfile[]> {
  const res = await fetch(`${API_URL}/api/agents`);
  const data = await res.json();
  return data.agents;
}

export async function createSession(
  topic: string,
  expectations?: string,
  maxRounds?: number
): Promise<CreateSessionResponse> {
  const res = await fetch(`${API_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      expectations: expectations || null,
      max_rounds: maxRounds || 3,
    }),
  });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionData> {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}`);
  if (!res.ok) throw new Error("Session not found");
  return res.json();
}

/** Start scoping — returns an SSE stream. */
export function streamScoping(
  sessionId: string,
  onEvent: (event: ServerEvent) => void,
  onError: (err: Error) => void
): () => void {
  let cancelled = false;

  (async () => {
    try {
      const res = await fetch(`${API_URL}/api/sessions/${sessionId}/scope`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to start scoping");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ") && !cancelled) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent(data);
            } catch {}
          }
        }
      }
    } catch (err) {
      if (!cancelled) onError(err as Error);
    }
  })();

  return () => {
    cancelled = true;
  };
}

/** Start the discussion — returns an SSE stream. */
export function streamDiscussion(
  sessionId: string,
  onEvent: (event: ServerEvent) => void,
  onError: (err: Error) => void
): () => void {
  let cancelled = false;

  (async () => {
    try {
      const res = await fetch(`${API_URL}/api/sessions/${sessionId}/start`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to start discussion");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ") && !cancelled) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent(data);
            } catch {}
          }
        }
      }
    } catch (err) {
      if (!cancelled) onError(err as Error);
    }
  })();

  return () => {
    cancelled = true;
  };
}

/** Send human message and continue discussion. */
export function streamHumanMessage(
  sessionId: string,
  content: string,
  onEvent: (event: ServerEvent) => void,
  onError: (err: Error) => void
): () => void {
  let cancelled = false;

  (async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/sessions/${sessionId}/message?content=${encodeURIComponent(content)}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to send message");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ") && !cancelled) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent(data);
            } catch {}
          }
        }
      }
    } catch (err) {
      if (!cancelled) onError(err as Error);
    }
  })();

  return () => {
    cancelled = true;
  };
}


