"""LLM client — wraps OpenAI API calls for coordinator and agents."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

import httpx

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")


class LLMClient:
    """Async client for OpenAI-compatible API."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ):
        self.api_key = api_key or OPENAI_API_KEY
        self.base_url = (base_url or OPENAI_BASE_URL).rstrip("/")
        self.model = model or DEFAULT_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Send a chat completion request and return the text response."""
        if not self.is_configured:
            return self._simulate_response(messages)

        # Build payload — newer models use max_completion_tokens
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        # Use max_completion_tokens for newer models, max_tokens for older
        if self.model.startswith("gpt-5") or self.model.startswith("o1") or self.model.startswith("o3"):
            payload["max_completion_tokens"] = max_tokens
        else:
            payload["max_tokens"] = max_tokens

        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code >= 400:
                body = resp.text[:500]
                raise RuntimeError(f"LLM API error {resp.status_code}: {body}")
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def chat_json(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> Dict[str, Any]:
        """Chat and parse the response as JSON.

        Tries JSON mode first; falls back to prompting for JSON
        if the model doesn't support response_format.
        """
        try:
            text = await self.chat(
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            return self._parse_json_response(text)
        except RuntimeError as e:
            err_msg = str(e)
            # If it's a 400, retry without response_format
            if "400" in err_msg or "response_format" in err_msg.lower():
                fallback_messages = list(messages)
                fallback_messages[-1] = {
                    **fallback_messages[-1],
                    "content": fallback_messages[-1]["content"]
                    + "\n\nIMPORTANT: Respond with valid JSON only. No other text.",
                }
                text = await self.chat(
                    fallback_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                return self._parse_json_response(text)
            raise

    def _parse_json_response(self, text: str) -> Dict[str, Any]:
        """Parse a JSON response, with fallbacks for markdown-wrapped JSON."""
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        # Try to extract JSON from markdown code blocks
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        try:
            return json.loads(cleaned.strip())
        except json.JSONDecodeError:
            raise RuntimeError(
                f"LLM returned non-JSON response: {text[:300]}"
            )

    def _simulate_response(self, messages: List[Dict[str, Any]]) -> str:
        """Return a simulated response when no API key is configured (for dev/testing)."""
        last_msg = messages[-1]["content"] if messages else ""
        last_msg_lower = last_msg.lower()[:200]

        if "scope" in last_msg_lower or "define" in last_msg_lower:
            return json.dumps({
                "scope": "This discussion will explore the core dimensions, trade-offs, and implications of the topic from multiple perspectives including technical, ethical, social, and practical angles.",
                "summary": "Multi-perspective analysis of the topic",
                "key_questions": [
                    "What are the fundamental assumptions?",
                    "What are the key trade-offs?",
                    "What does the evidence say?",
                    "What are the practical implications?",
                ],
            })
        elif "select" in last_msg_lower or "agents" in last_msg_lower:
            return json.dumps({
                "selected_agents": ["ethicist", "optimist", "skeptic", "pragmatist"],
                "reasoning": "These agents provide a balanced range of perspectives.",
            })
        elif "summar" in last_msg_lower:
            return json.dumps({
                "summary": "## Discussion Summary\n\nThe group explored the topic from multiple angles: "
                           "\n\n**Key Agreements:** The consensus was that more research is needed."
                           "\n\n**Key Disagreements:** The main friction was around timeline vs. safety."
                           "\n\n**Conclusion:** A balanced approach is warranted.",
                "key_points": [],
                "consensus": "More research is needed",
                "disagreements": "Timeline vs safety trade-offs",
                "conclusion": "A balanced approach is warranted.",
            })
        else:
            return "This is an interesting point. Let me share my perspective: " \
                   "I think we need to consider multiple dimensions here. " \
                   "There are important trade-offs to consider, and I believe " \
                   "the evidence suggests a nuanced approach is best."
