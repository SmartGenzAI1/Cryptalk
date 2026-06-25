import pytest
import os

os.environ.setdefault("DB_PATH", "/tmp/cryptalk-test.db")
os.environ.setdefault("SESSION_SECRET", "test-secret")

from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    from sqlalchemy import create_engine
    from app.models import Base
    from app.core.config import settings
    sync_url = f"sqlite:///{settings.DB_PATH}"
    sync_engine = create_engine(sync_url, echo=False)
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()
    return TestClient(app)


@pytest.fixture
def auth_token():
    # register a test user and return its auth cookie
    import requests
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@test.com"
    res = requests.post("http://localhost:8001/api/auth/register", json={"email": email, "password": "testpass123"})
    if res.status_code == 200:
        return res.cookies.get("tc_session"), email
    res = requests.post("http://localhost:8001/api/auth/login", json={"email": email, "password": "testpass123"})
    return res.cookies.get("tc_session"), email


class TestAuth:
    def test_register_missing_email(self, client):
        res = client.post("/api/auth/register", json={"password": "test"})
        assert res.status_code == 422

    def test_register_short_password(self, client):
        res = client.post("/api/auth/register", json={"email": "a@b.com", "password": "ab"})
        assert res.status_code in (400, 422)

    def test_login_invalid(self, client):
        res = client.post("/api/auth/login", json={"email": "nobody@test.com", "password": "wrong"})
        assert res.status_code == 401

    def test_me_without_auth(self, client):
        res = client.get("/api/auth/me")
        assert res.status_code == 200
        assert res.json()["user"] is None

    def test_logout(self, client):
        res = client.post("/api/auth/logout")
        assert res.status_code == 200


class TestChats:
    def test_get_chats_unauthorized(self, client):
        res = client.get("/api/chats")
        assert res.status_code == 401

    def test_create_chat_unauthorized(self, client):
        res = client.post("/api/chats", json={"type": "group", "title": "Test"})
        assert res.status_code == 401


class TestMessages:
    def test_get_messages_unauthorized(self, client):
        res = client.get("/api/some-chat-id/messages")
        assert res.status_code == 401

    def test_send_message_unauthorized(self, client):
        res = client.post("/api/some-chat-id/messages", json={"content": "hello"})
        assert res.status_code == 401


class TestSocial:
    def test_connections_unauthorized(self, client):
        res = client.get("/api/social/connections")
        assert res.status_code == 401

    def test_block_unauthorized(self, client):
        res = client.post("/api/social/block", json={"user_id": "fake"})
        assert res.status_code == 401


class TestE2EE:
    def test_upload_keys_unauthorized(self, client):
        res = client.post("/api/keys/upload", json={
            "identity_public_key": "test",
            "signing_public_key": "test",
            "signed_prekey_public": "test",
            "signed_prekey_signature": "test",
        })
        assert res.status_code == 401

    def test_get_keys_unauthorized(self, client):
        res = client.get("/api/keys/some-user-id")
        assert res.status_code == 401


class TestChatManagement:
    def test_leave_chat_unauthorized(self, client):
        res = client.post("/api/chats/some-id/leave")
        assert res.status_code == 401

    def test_delete_chat_unauthorized(self, client):
        res = client.delete("/api/chats/some-id")
        assert res.status_code == 401

    def test_cross_search_unauthorized(self, client):
        res = client.get("/api/search?q=test")
        assert res.status_code == 401

    def test_report_unauthorized(self, client):
        res = client.post("/api/reports", json={"reason": "spam"})
        assert res.status_code == 401

    def test_delete_account_unauthorized(self, client):
        res = client.delete("/api/account")
        assert res.status_code == 401


class TestHealth:
    def test_root(self, client):
        res = client.get("/")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

    def test_health(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"
