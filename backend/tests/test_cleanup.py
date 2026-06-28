import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.core.cleanup import cleanup_expired_files, start_cleanup_loop, stop_cleanup_loop
from app.core.config import settings

@pytest.mark.anyio
async def test_cleanup_not_available():
    with patch("app.core.storage.StorageService.is_available", return_value=False):
        deleted = await cleanup_expired_files()
        assert deleted == 0

@pytest.mark.anyio
async def test_cleanup_files():
    mock_items = [
        {"name": "file1.png", "created_at": "2020-01-01T00:00:00Z"},  # Expired
        {"name": "file2.png", "created_at": "2030-01-01T00:00:00Z"},  # Future/Not expired
    ]
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json = lambda: mock_items
    
    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    
    with patch("app.core.storage.StorageService.is_available", return_value=True), \
         patch("app.core.storage.StorageService._ensure_token", AsyncMock(return_value="token")), \
         patch("app.core.storage.StorageService._get_client", return_value=mock_client), \
         patch("app.core.storage.StorageService._headers", return_value={}), \
         patch("app.core.storage.StorageService.delete_file", AsyncMock(return_value=True)) as mock_delete:
         
        deleted = await cleanup_expired_files()
        assert deleted == 1
        mock_delete.assert_called_once_with("files/file1.png")
