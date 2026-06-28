import time
import pytest
from app.core.offline_queue import enqueue, drain, queue_size
from app.core.config import settings

def test_offline_queue_basic():
    user_id = "test_user_123"
    msg = {"id": "msg1", "content": "hello"}
    
    # Ensure queue is clean
    drain(user_id)
    assert queue_size(user_id) == 0
    
    # Enqueue a message
    enqueue(user_id, msg)
    assert queue_size(user_id) == 1
    
    # Drain the message
    messages = drain(user_id)
    assert len(messages) == 1
    assert messages[0]["id"] == "msg1"
    assert messages[0]["content"] == "hello"
    
    # Queue should be empty now
    assert queue_size(user_id) == 0
    assert len(drain(user_id)) == 0

def test_offline_queue_expiration(monkeypatch):
    user_id = "test_user_expired"
    msg = {"id": "msg_expired", "content": "bye"}
    
    drain(user_id)
    enqueue(user_id, msg)
    
    # Mock settings OFFLINE_QUEUE_TTL to 0 to simulate expired message
    monkeypatch.setattr(settings, "OFFLINE_QUEUE_TTL", 0)
    
    messages = drain(user_id)
    assert len(messages) == 0
