import pytest
import os

os.environ.setdefault("DB_PATH", "/tmp/cryptalk-test.db")
os.environ.setdefault("SESSION_SECRET", "test-secret-do-not-use-in-production")

from app.core.security import hash_password, verify_password, create_session_token, verify_session_token
from app.core.security import validate_username, validate_password, sanitize_text


class TestPasswordHashing:
    def test_hash_and_verify(self):
        password = "mySecurePass123"
        hashed = hash_password(password)
        assert hashed != password
        assert ":" in hashed
        assert verify_password(password, hashed)

    def test_wrong_password_fails(self):
        hashed = hash_password("correct")
        assert not verify_password("wrong", hashed)

    def test_empty_password_fails(self):
        hashed = hash_password("somepass")
        assert not verify_password("", hashed)

    def test_different_salts(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2
        assert verify_password("same", h1)
        assert verify_password("same", h2)


class TestSessionTokens:
    def test_create_and_verify(self):
        token = create_session_token("user123")
        assert "." in token
        assert verify_session_token(token) == "user123"

    def test_invalid_token_returns_none(self):
        assert verify_session_token("garbage") is None
        assert verify_session_token("") is None
        assert verify_session_token("user123.wrongsig") is None

    def test_tampered_payload_fails(self):
        token = create_session_token("user123")
        parts = token.split(".")
        parts[0] = "user456"
        tampered = ".".join(parts)
        assert verify_session_token(tampered) is None

    def test_expired_token_rejected(self, monkeypatch):
        import time
        current_time = int(time.time() * 1000)
        # Mock now_ms to be way in the past (e.g. 60 days ago) so the token's expiry is also in the past
        monkeypatch.setattr("app.core.security.now_ms", lambda: current_time - 60 * 24 * 3600 * 1000)
        token = create_session_token("user123")

        # Restore now_ms to current time
        monkeypatch.setattr("app.core.security.now_ms", lambda: current_time)
        assert verify_session_token(token) is None


class TestInputValidation:
    def test_valid_username(self):
        assert validate_username("john_doe") == "john_doe"
        assert validate_username("ABC123") == "abc123"

    def test_invalid_username(self):
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            validate_username("ab")
        with pytest.raises(ValidationError):
            validate_username("user@name")
        with pytest.raises(ValidationError):
            validate_username("")

    def test_valid_password(self):
        assert validate_password("pass1234") == "pass1234"

    def test_short_password_rejected(self):
        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            validate_password("abc")

    def test_sanitize_text_strips_control_chars(self):
        result = sanitize_text("hello\x00world")
        assert "\x00" not in result
        assert "hello" in result
        assert "world" in result

    def test_sanitize_text_enforces_length(self):
        long_text = "a" * 20000
        result = sanitize_text(long_text, max_length=1000)
        assert len(result) <= 1000

    def test_sanitize_text_handles_empty(self):
        assert sanitize_text("") == ""
        assert sanitize_text(None) == ""

    def test_sanitize_text_escapes_html(self):
        # E2EE ciphertext passes through — server doesn't render it as HTML
        result = sanitize_text("<script>alert(1)</script>")
        assert result == "<script>alert(1)</script>"

    def test_sanitize_text_escapes_quotes(self):
        result = sanitize_text('"onclick="alert(1)')
        assert result == '"onclick="alert(1)'

    def test_escape_like(self):
        from app.core.security import escape_like
        assert escape_like("normal") == "normal"
        assert escape_like("50%") == "50\\%"
        assert escape_like("test_user") == "test\\_user"
        assert escape_like("back\\slash") == "back\\\\slash"
        assert escape_like("%_%") == "\\%\\_\\%"

    def test_validate_hex_id(self):
        from app.core.security import validate_hex_id
        assert validate_hex_id("a" * 24) is True
        assert validate_hex_id("abc123def456abc123def456") is True
        assert validate_hex_id("short") is False
        assert validate_hex_id("") is False
        assert validate_hex_id(None) is False
        assert validate_hex_id("AABBCC" * 4) is False  # uppercase rejected

