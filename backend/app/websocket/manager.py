"""WebSocket connection manager for real-time discussion updates."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Set

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections per session."""

    def __init__(self):
        # session_id -> set of WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        if session_id not in self._connections:
            self._connections[session_id] = set()
        self._connections[session_id].add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if session_id in self._connections:
            self._connections[session_id].discard(websocket)
            if not self._connections[session_id]:
                del self._connections[session_id]

    async def broadcast_to_session(self, session_id: str, data: Dict[str, Any]) -> None:
        """Send data to all connected clients for a session."""
        if session_id not in self._connections:
            return

        message = json.dumps(data, default=str)
        disconnected: List[WebSocket] = []

        for ws in self._connections[session_id]:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(session_id, ws)

    async def send_to_connection(self, websocket: WebSocket, data: Dict[str, Any]) -> None:
        """Send data to a specific connection."""
        try:
            await websocket.send_text(json.dumps(data, default=str))
        except Exception:
            pass

    @property
    def active_sessions(self) -> List[str]:
        return list(self._connections.keys())

    def connection_count(self, session_id: str) -> int:
        return len(self._connections.get(session_id, set()))
