import unittest
from unittest.mock import patch

import daylight


class DownloadValidationTests(unittest.TestCase):
    def test_accepts_https_download_url(self):
        parsed = daylight.validate_download_url("https://downloads.example.com/tools/daylight.zip")
        self.assertEqual(parsed.hostname, "downloads.example.com")

    def test_rejects_http_download_url(self):
        with self.assertRaises(ValueError):
            daylight.validate_download_url("http://example.com/file.zip")

    def test_rejects_embedded_url_credentials(self):
        with self.assertRaises(ValueError):
            daylight.validate_download_url("https://user:secret@example.com/file.zip")

    def test_redirect_cannot_downgrade_to_http(self):
        handler = daylight.HTTPSRedirectHandler()
        request = daylight.urllib.request.Request("https://example.com/file.zip")
        try:
            with self.assertRaises(daylight.urllib.error.HTTPError) as caught:
                handler.redirect_request(request, None, 302, "Found", None, "http://example.com/file.zip")
        finally:
            if hasattr(caught.exception, "close"):
                caught.exception.close()

    def test_filename_uses_decoded_path_basename(self):
        name = daylight.safe_download_name("https://example.com/folder/my%20file.zip?token=unused")
        self.assertEqual(name, "my file.zip")

    def test_empty_path_gets_safe_default_name(self):
        self.assertEqual(daylight.safe_download_name("https://example.com/"), "download")


class DataDirectoryTests(unittest.TestCase):
    def test_windows_uses_roaming_profile(self):
        with patch("daylight.platform.system", return_value="Windows"), patch.dict("os.environ", {"APPDATA": "C:/Users/Test/Roaming"}):
            self.assertEqual(str(daylight.data_directory()), "C:/Users/Test/Roaming/Daylight")

    def test_macos_uses_application_support(self):
        with patch("daylight.platform.system", return_value="Darwin"):
            self.assertEqual(daylight.data_directory(), daylight.Path.home() / "Library" / "Application Support" / "Daylight")

    def test_linux_honors_xdg_data_home(self):
        with patch("daylight.platform.system", return_value="Linux"), patch.dict("os.environ", {"XDG_DATA_HOME": "/tmp/daylight-test"}):
            self.assertEqual(str(daylight.data_directory()), "/tmp/daylight-test/Daylight")


class ShortCommandTests(unittest.TestCase):
    def test_task_command(self):
        self.assertEqual(daylight.parse_task_command("task buy milk"), "buy milk")

    def test_add_task_command(self):
        self.assertEqual(daylight.parse_task_command("add task: call the dentist"), "call the dentist")

    def test_complete_command(self):
        self.assertEqual(daylight.parse_done_command("done 2"), 2)

    def test_non_task_command_is_ignored(self):
        self.assertIsNone(daylight.parse_task_command("plan my day"))


if __name__ == "__main__":
    unittest.main()
