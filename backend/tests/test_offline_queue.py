import time
import pytest
from app.core.offline_queue import enqueue, drain, queue_size
from app.core.config import settings

@pytest.mark.asyncio
async def test_offline_queue_basic():
    user_id = "test_user_123"
    msg = {"id": "msg1", "content": "hello"}

    # Ensure queue is clean
    await drain(user_id)
    assert await queue_size(user_id) == 0

    # Enqueue a message
    await enqueue(user_id, msg)
    assert await queue_size(user_id) == 1

    # Drain the message
    messages = await drain(user_id)
    assert len(messages) == 1
    assert messages[0]["id"] == "msg1"
    assert messages[0]["content"] == "hello"

    # Queue should be empty now
    assert await queue_size(user_id) == 0
    assert len(await drain(user_id)) == 0

@pytest.mark.asyncio
async def test_offline_queue_expiration(monkeypatch):
    user_id = "test_user_expired"
    msg = {"id": "msg_expired", "content": "bye"}

    await drain(user_id)
    await enqueue(user_id, msg)

    # Mock settings OFFLINE_QUEUE_TTL to 0 to simulate expired message
    monkeypatch.setattr(settings, "OFFLINE_QUEUE_TTL", 0)

    messages = await drain(user_id)
    assert len(messages) == 0
