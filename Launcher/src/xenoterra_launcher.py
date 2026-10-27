"""
Xenoterra Launcher
==================

A small, self-contained desktop launcher for the Xenoterra game.

Features:
  - Detects the installed version of the game
  - Downloads / installs the game from a release archive
  - Updates to the latest version when one is available
  - Launches the game
  - Deletes the local install
  - Shows release notes (local or fetched)

Configuration is done through the constants near the top of this file and via
the XENOTERRA_* environment variables. The launcher keeps all of its state in
the install directory so it can be moved or deleted without leaving anything
behind in the registry.

Run with:   python xenoterra_launcher.py
Build exe:  pyinstaller --onefile --windowed xenoterra_launcher.py
"""

import os
import sys
import json
import shutil
import subprocess
import threading
import urllib.request
import urllib.error
from pathlib import Path

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
APP_NAME = "Xenoterra"
GAME_EXE = "XenoterraEngine.exe"
VERSION_FILE = "version.txt"
RELEASE_NOTES_FILE = "release_notes.md"

# Where the game is installed. Defaults to a folder next to this launcher so the
# whole thing is portable; override with XENOTERRA_INSTALL_DIR.
INSTALL_DIR = Path(os.environ.get(
    "XENOTERRA_INSTALL_DIR",
    Path(__file__).resolve().parent.parent / "Game"
))

# Where release archives are published. Override with XENOTERRA_RELEASES_URL.
# Expected to serve a JSON manifest at <url>/manifest.json and archives at
# <url>/<version>.zip. See fetch_manifest() for the exact shape.
RELEASES_URL = os.environ.get(
    "XENOTERRA_RELEASES_URL",
    "https://panategwa.github.io/PanategwaHub/releases"
)

# Local fallback used when the network is unavailable: a folder containing
# versioned zips. Override with XENOTERRA_LOCAL_RELEASES.
LOCAL_RELEASES = Path(os.environ.get(
    "XENOTERRA_LOCAL_RELEASES",
    Path(__file__).resolve().parent.parent / "releases"
))

# --------------------------------------------------------------------------- #
# Palette -- dark, matches the Panategwa Hub look
# --------------------------------------------------------------------------- #
BG = "#0b1220"
BG_RAISED = "#121a2b"
BG_CARD = "#162033"
FG = "#e8ecf4"
FG_MUTED = "#9aa6bf"
ACCENT = "#4f8cff"
ACCENT_HOVER = "#6aa0ff"
DANGER = "#e05a5a"
DANGER_HOVER = "#f07070"
SUCCESS = "#4caf7a"
BORDER = "#2a3550"

FONT = ("Segoe UI", 10)
FONT_BOLD = ("Segoe UI", 10, "bold")
FONT_TITLE = ("Segoe UI", 20, "bold")
FONT_SMALL = ("Segoe UI", 9)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def log(widget, message, level="info"):
    """Append a line to the status log."""
    colours = {"info": FG_MUTED, "ok": SUCCESS, "warn": "#e0a040", "err": DANGER}
    widget.configure(state="normal")
    widget.insert("end", message + "\n", level)
    widget.tag_config(level, foreground=colours.get(level, FG))
    widget.see("end")
    widget.configure(state="disabled")


def installed_version():
    vfile = INSTALL_DIR / VERSION_FILE
    if not vfile.exists():
        return None
    try:
        return vfile.read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


def is_installed():
    return (INSTALL_DIR / GAME_EXE).is_file()


def fetch_manifest():
    """Return (manifest_dict, source) or (None, error)."""
    url = RELEASES_URL.rstrip("/") + "/manifest.json"
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read().decode("utf-8"))
        return data, "online"
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        pass

    # Offline fallback: a local manifest.json next to the release zips.
    local = LOCAL_RELEASES / "manifest.json"
    if local.is_file():
        try:
            return json.loads(local.read_text(encoding="utf-8-sig")), "offline"
        except (ValueError, OSError):
            pass
    return None, "no manifest found"


def latest_version(manifest):
    if not manifest:
        return None
    versions = manifest.get("versions", [])
    if not versions:
        return None
    # Versions are expected to be semver-ish; sort by the tuple of ints.
    def key(v):
        parts = []
        for chunk in str(v.get("version", "0")).split("."):
            try:
                parts.append(int(chunk))
            except ValueError:
                parts.append(0)
        return parts
    return max(versions, key=key)


def download_and_install(version_entry, progress_cb, done_cb):
    """Download an archive and extract it into INSTALL_DIR. Runs in a thread."""
    try:
        INSTALL_DIR.mkdir(parents=True, exist_ok=True)
        archive_name = version_entry.get("archive", version_entry["version"] + ".zip")
        url = version_entry.get("url") or (RELEASES_URL.rstrip("/") + "/" + archive_name)
        archive_path = INSTALL_DIR / archive_name

        # Try the network first, then the local releases folder.
        try:
            with urllib.request.urlopen(url, timeout=30) as r, open(archive_path, "wb") as out:
                total = int(r.headers.get("Content-Length", 0))
                done = 0
                while True:
                    chunk = r.read(65536)
                    if not chunk:
                        break
                    out.write(chunk)
                    done += len(chunk)
                    if total:
                        progress_cb(done / total)
        except (urllib.error.URLError, TimeoutError, OSError):
            local_zip = LOCAL_RELEASES / archive_name
            if not local_zip.is_file():
                raise RuntimeError("could not download " + archive_name + " and no local copy exists")
            shutil.copyfile(local_zip, archive_path)
            progress_cb(1.0)

        # Extract, overwriting anything already there.
        import zipfile
        with zipfile.ZipFile(archive_path) as z:
            for member in z.namelist():
                # Prevent path traversal attacks
                member_path = (INSTALL_DIR / member).resolve()
                if not str(member_path).startswith(str(INSTALL_DIR.resolve())):
                    raise RuntimeError(f"Invalid path in archive: {member}")
            z.extractall(INSTALL_DIR)
        archive_path.unlink(missing_ok=True)

        # Stamp the version.
        (INSTALL_DIR / VERSION_FILE).write_text(version_entry["version"], encoding="utf-8")

        # Drop a copy of the release notes if the archive shipped them.
        done_cb(None, version_entry["version"])
    except Exception as e:  # noqa: BLE001 -- launcher must never crash on a bad download
        done_cb(str(e), None)


# --------------------------------------------------------------------------- #
# UI
# --------------------------------------------------------------------------- #
class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME + " Launcher")
        self.geometry("760x560")
        self.minsize(640, 480)
        self.configure(bg=BG)
        self.resizable(True, True)

        self._manifest = None
        self._manifest_source = None
        self._busy = False

        self._build()
        self._refresh_status()
        self.after(200, self._load_manifest)

    # ---------- layout ----------
    def _build(self):
        # Header
        header = tk.Frame(self, bg=BG_RAISED, height=96)
        header.pack(fill="x")
        header.pack_propagate(False)

        title = tk.Label(header, text=APP_NAME, font=FONT_TITLE, fg=FG, bg=BG_RAISED)
        title.pack(anchor="w", padx=24, pady=(18, 0))
        sub = tk.Label(header, text="Game launcher", font=FONT_SMALL, fg=FG_MUTED, bg=BG_RAISED)
        sub.pack(anchor="w", padx=24)

        # Body
        body = tk.Frame(self, bg=BG, padx=24, pady=18)
        body.pack(fill="both", expand=True)

        # Status card
        card = tk.Frame(body, bg=BG_CARD, bd=0, highlightthickness=1,
                        highlightbackground=BORDER)
        card.pack(fill="x")

        self.status_label = tk.Label(card, text="Checking installation…", font=FONT_BOLD,
                                    fg=FG, bg=BG_CARD)
        self.status_label.pack(anchor="w", padx=16, pady=(14, 2))

        self.version_label = tk.Label(card, text="", font=FONT, fg=FG_MUTED, bg=BG_CARD)
        self.version_label.pack(anchor="w", padx=16)

        self.path_label = tk.Label(card, text="", font=FONT_SMALL, fg=FG_MUTED, bg=BG_CARD)
        self.path_label.pack(anchor="w", padx=16, pady=(0, 14))

        # Progress bar
        self.progress = ttk.Progressbar(body, mode="determinate", maximum=100)
        self.progress.pack(fill="x", pady=(14, 4))
        self.progress_label = tk.Label(body, text="", font=FONT_SMALL, fg=FG_MUTED, bg=BG)
        self.progress_label.pack(anchor="w")

        # Button grid
        btns = tk.Frame(body, bg=BG)
        btns.pack(fill="x", pady=(16, 12))

        def make_btn(parent, text, command, colour=ACCENT, hover=ACCENT_HOVER, width=16):
            b = tk.Button(parent, text=text, command=command, font=FONT_BOLD,
                          fg="white", bg=colour, activebackground=hover,
                          activeforeground="white", bd=0, relief="flat",
                          cursor="hand2", width=width, pady=9)
            b.bind("<Enter>", lambda e, btn=b, c=hover: btn.config(bg=c))
            b.bind("<Leave>", lambda e, btn=b, c=colour: btn.config(bg=c))
            return b

        row = tk.Frame(btns, bg=BG)
        row.pack(fill="x")
        self.play_btn = make_btn(row, "Play", self.launch_game, SUCCESS, "#5fc98a")
        self.play_btn.pack(side="left", padx=(0, 8))
        self.download_btn = make_btn(row, "Download", self.download_game)
        self.download_btn.pack(side="left", padx=(0, 8))
        self.update_btn = make_btn(row, "Update", self.update_game)
        self.update_btn.pack(side="left", padx=(0, 8))
        self.delete_btn = make_btn(row, "Delete", self.delete_game, DANGER, DANGER_HOVER)
        self.delete_btn.pack(side="left", padx=(0, 8))

        row2 = tk.Frame(btns, bg=BG)
        row2.pack(fill="x", pady=(8, 0))
        self.version_btn = make_btn(row2, "Check version", self.check_version, BG_RAISED, BG_CARD, 16)
        self.version_btn.pack(side="left", padx=(0, 8))
        self.notes_btn = make_btn(row2, "Release notes", self.view_release_notes, BG_RAISED, BG_CARD, 16)
        self.notes_btn.pack(side="left", padx=(0, 8))
        self.refresh_btn = make_btn(row2, "Refresh", self._load_manifest, BG_RAISED, BG_CARD, 16)
        self.refresh_btn.pack(side="left", padx=(0, 8))

        # Log
        log_frame = tk.Frame(body, bg=BG)
        log_frame.pack(fill="both", expand=True, pady=(12, 0))
        tk.Label(log_frame, text="Activity", font=FONT_BOLD, fg=FG, bg=BG).pack(anchor="w")
        self.log = scrolledtext.ScrolledText(log_frame, height=10, font=FONT_SMALL,
                                            bg=BG_RAISED, fg=FG_MUTED, bd=0,
                                            relief="flat", state="disabled",
                                            insertbackground=FG)
        self.log.pack(fill="both", expand=True, pady=(4, 0))
        for level in ("info", "ok", "warn", "err"):
            self.log.tag_config(level, foreground={
                "info": FG_MUTED, "ok": SUCCESS, "warn": "#e0a040", "err": DANGER
            }[level])

        # Footer
        footer = tk.Frame(self, bg=BG_RAISED, height=26)
        footer.pack(fill="x", side="bottom")
        footer.pack_propagate(False)
        self.footer_label = tk.Label(footer, text="", font=FONT_SMALL, fg=FG_MUTED, bg=BG_RAISED)
        self.footer_label.pack(anchor="w", padx=24, pady=4)

    # ---------- status ----------
    def _refresh_status(self):
        if is_installed():
            v = installed_version() or "unknown"
            self.status_label.config(text="Installed", fg=SUCCESS)
            self.version_label.config(text="Version: " + v)
            self.play_btn.config(state="normal")
            self.delete_btn.config(state="normal")
            self.download_btn.config(state="disabled")
        else:
            self.status_label.config(text="Not installed", fg=DANGER)
            self.version_label.config(text="Version: -")
            self.play_btn.config(state="disabled")
            self.delete_btn.config(state="disabled")
            self.download_btn.config(state="normal")
        self.path_label.config(text="Install path: " + INSTALL_DIR)
        self._update_footer()

    def _update_footer(self):
        src = self._manifest_source or "—"
        latest = "—"
        if self._manifest:
            entry = latest_version(self._manifest)
            if entry:
                latest = entry.get("version", "?")
        self.footer_label.config(text="Source: " + src + "   |   Latest: " + latest)

    def _set_busy(self, busy, message=None):
        self._busy = busy
        state = "disabled" if busy else "normal"
        for b in (self.play_btn, self.download_btn, self.update_btn,
                  self.delete_btn, self.version_btn, self.notes_btn, self.refresh_btn):
            b.config(state=state)
        if message:
            self.progress_label.config(text=message)

    # ---------- manifest ----------
    def _load_manifest(self):
        self._set_busy(True, "Loading release manifest…")
        threading.Thread(target=self._load_manifest_worker, daemon=True).start()

    def _load_manifest_worker(self):
        manifest, source = fetch_manifest()
        self.after(0, lambda: self._on_manifest_loaded(manifest, source))

    def _on_manifest_loaded(self, manifest, source):
        self._manifest = manifest
        self._manifest_source = source
        self._set_busy(False, "")
        if manifest is None:
            log(self.log, "No release manifest found (offline and no local copy).", "warn")
        else:
            entry = latest_version(manifest)
            log(self.log, "Manifest loaded from " + source + ". Latest: " +
                (entry.get("version") if entry else "?"), "ok")
        self._update_footer()
        self._refresh_status()

    # ---------- actions ----------
    def launch_game(self):
        exe = INSTALL_DIR / GAME_EXE
        if not exe.is_file():
            messagebox.showerror(APP_NAME, "The game is not installed.")
            return
        try:
            subprocess.Popen([str(exe)], cwd=str(INSTALL_DIR))
            log(self.log, "Launched " + GAME_EXE, "ok")
        except OSError as e:
            log(self.log, "Could not launch game: " + str(e), "err")

    def download_game(self):
        if self._busy:
            return
        entry = latest_version(self._manifest) if self._manifest else None
        if entry is None:
            messagebox.showinfo(APP_NAME, "No release is available to download.")
            return
        if not messagebox.askyesno(APP_NAME, "Download and install " +
                                  entry.get("version", "?") + "?"):
            return
        self._run_install(entry, "Downloading…")

    def update_game(self):
        if self._busy:
            return
        if not is_installed():
            messagebox.showinfo(APP_NAME, "Nothing installed yet. Use Download first.")
            return
        entry = latest_version(self._manifest) if self._manifest else None
        if entry is None:
            messagebox.showinfo(APP_NAME, "No release manifest available.")
            return
        current = installed_version()
        if current == entry.get("version"):
            messagebox.showinfo(APP_NAME, "Already on the latest version (" + current + ").")
            return
        if not messagebox.askyesno(APP_NAME, "Update from " + (current or "?") + " to " +
                                  entry.get("version", "?") + "?"):
            return
        self._run_install(entry, "Updating…")

    def _run_install(self, entry, label):
        self._set_busy(True, label)
        self.progress["value"] = 0
        log(self.log, label + " " + entry.get("version", "?"), "info")

        def progress(p):
            self.after(0, lambda: self._on_progress(p))

        def done(err, version):
            self.after(0, lambda: self._on_install_done(err, version))

        threading.Thread(target=download_and_install,
                         args=(entry, progress, done), daemon=True).start()

    def _on_progress(self, p):
        self.progress["value"] = p * 100
        self.progress_label.config(text="%.0f%%" % (p * 100))

    def _on_install_done(self, err, version):
        self.progress["value"] = 100 if err is None else 0
        if err:
            log(self.log, "Install failed: " + err, "err")
            self.progress_label.config(text="Failed")
        else:
            log(self.log, "Installed version " + version, "ok")
            self.progress_label.config(text="Done")
        self._set_busy(False, "")
        self._refresh_status()

    def delete_game(self):
        if not is_installed():
            messagebox.showinfo(APP_NAME, "Nothing to delete.")
            return
        if not messagebox.askyesno(APP_NAME, "Delete the game and all of its data?"):
            return
        try:
            shutil.rmtree(INSTALL_DIR)
            log(self.log, "Game deleted.", "ok")
        except OSError as e:
            log(self.log, "Could not delete: " + str(e), "err")
        self._refresh_status()

    def check_version(self):
        current = installed_version() if is_installed() else None
        entry = latest_version(self._manifest) if self._manifest else None
        latest = entry.get("version") if entry else None
        msg = "Installed: " + (current or "not installed") + "\nLatest:    " + (latest or "unknown")
        if current and latest and current != latest:
            msg += "\n\nAn update is available."
        messagebox.showinfo(APP_NAME + " — Version", msg)
        log(self.log, "Version check: " + (current or "-") + " / " + (latest or "-"), "info")

    def view_release_notes(self):
        # Prefer a local copy shipped with the install, then the manifest entry,
        # then a plain text file in the releases folder.
        text = None
        if is_installed():
            local = INSTALL_DIR / RELEASE_NOTES_FILE
            if local.is_file():
                text = local.read_text(encoding="utf-8-sig", errors="replace")
        if text is None and self._manifest:
            entry = latest_version(self._manifest)
            if entry and "notes" in entry:
                text = entry["notes"]
        if text is None:
            candidate = LOCAL_RELEASES / RELEASE_NOTES_FILE
            if candidate.is_file():
                text = candidate.read_text(encoding="utf-8-sig", errors="replace")
        if text is None:
            text = ("No release notes are available yet.\n\n"
                    "Drop a " + RELEASE_NOTES_FILE + " next to the game or add a "
                    "\"notes\" field to the manifest entry and they will show up here.")

        win = tk.Toplevel(self)
        win.title(APP_NAME + " — Release notes")
        win.geometry("620x460")
        win.configure(bg=BG)
        txt = scrolledtext.ScrolledText(win, font=FONT, bg=BG_RAISED, fg=FG,
                                       bd=0, relief="flat", wrap="word")
        txt.pack(fill="both", expand=True, padx=16, pady=16)
        txt.insert("1.0", text)
        txt.configure(state="disabled")


if __name__ == "__main__":
    app = Launcher()
    app.mainloop()
