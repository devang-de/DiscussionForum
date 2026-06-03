"""MessageBus — pub/sub for async agent communication."""

from __future__ import annotations

import asyncio
import fnmatch
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from pydantic import BaseModel, Field


class BusMessage(BaseModel):
    """A message traveling on the bus."""
    id: str
    topic: str
    sender: str
    content: Dict[str, Any]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MessageBus:
    """Lightweight pub/sub bus with wildcard subscriptions."""

    def __init__(self, max_history: int = 200) -> None:
        self._messages: Dict[str, List[BusMessage]] = {}
        self._subscribers: Dict[str, List[Callable]] = {}
        self._bridge_callbacks: List[Callable] = []
        self._max_history = max_history

    async def publish(
        self, topic: str, sender: str, content: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> BusMessage:
        msg = BusMessage(
            id=str(uuid.uuid4()),
            topic=topic,
            sender=sender,
            content=content,
            metadata=metadata or {},
        )

        self._messages.setdefault(topic, [])
        self._messages[topic].append(msg)
        if len(self._messages[topic]) > self._max_history:
            self._messages[topic] = self._messages[topic][-self._max_history:]

        for pattern, callbacks in self._subscribers.items():
            if fnmatch.fnmatch(topic, pattern):
                for cb in callbacks:
                    try:
                        if asyncio.iscoroutinefunction(cb):
                            await cb(msg)
                        else:
                            cb(msg)
                    except Exception:
                        pass

        for cb in self._bridge_callbacks:
            try:
                if asyncio.iscoroutinefunction(cb):
                    await cb(msg)
                else:
                    cb(msg)
            except Exception:
                pass

        return msg

    def subscribe(self, pattern: str, callback: Callable) -> Callable:
        self._subscribers.setdefault(pattern, [])
        self._subscribers[pattern].append(callback)

        def unsubscribe():
            try:
                self._subscribers[pattern].remove(callback)
            except ValueError:
                pass
        return unsubscribe

    async def subscribe_with_history(self, pattern: str, callback: Callable, limit: int = 100) -> Callable:
        replay = []
        for topic, msgs in self._messages.items():
            if fnmatch.fnmatch(topic, pattern):
                replay.extend(msgs)
        replay.sort(key=lambda m: m.timestamp)
        for msg in replay[-limit:]:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(msg)
                else:
                    callback(msg)
            except Exception:
                pass
        return self.subscribe(pattern, callback)

    def register_bridge(self, callback: Callable) -> None:
        self._bridge_callbacks.append(callback)

    def get_history(self, pattern: str, limit: int = 100) -> List[BusMessage]:
        results = []
        for topic, msgs in self._messages.items():
            if fnmatch.fnmatch(topic, pattern):
                results.extend(msgs)
        results.sort(key=lambda m: m.timestamp)
        return results[-limit:]
