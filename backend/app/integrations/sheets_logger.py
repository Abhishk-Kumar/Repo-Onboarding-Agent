import os
from datetime import datetime


def log_to_sheets(repo_url: str, summary_snippet: str) -> None:
    """Fire-and-forget log to Google Sheets (no-op if API key is missing)."""
    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    service_account_path = os.getenv("GOOGLE_SERVICE_ACCOUNT_PATH")

    if not sheet_id or not service_account_path:
        return

    try:
        import gspread
        from google.oauth2.service_account import Credentials

        creds = Credentials.from_service_account_file(
            service_account_path,
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        client = gspread.authorize(creds)
        sheet = client.open_by_key(sheet_id).sheet1
        sheet.append_row([
            repo_url,
            datetime.utcnow().isoformat(),
            summary_snippet[:200],
        ])
    except Exception:
        pass
