# Xenoterra Launcher

A small desktop launcher for the Xenoterra game.

## Running it

```sh
cd Launcher/src
python xenoterra_launcher.py
```

Tkinter is part of the standard library, so no dependencies are needed.

## Building a standalone .exe (optional)

```sh
pip install pyinstaller
cd Launcher/src
pyinstaller --onefile --windowed --name "Xenoterra Launcher" xenoterra_launcher.py
```

The resulting executable lands in `dist/`.

## Configuration

All paths and URLs are set near the top of `xenoterra_launcher.py` and can be
overridden with environment variables so the same binary works for every user:

| Variable | Purpose | Default |
| --- | --- | --- |
| `XENOTERRA_INSTALL_DIR` | Where the game is installed | `%LOCALAPPDATA%\Panategwa\Xenoterra` |
| `XENOTERRA_RELEASES_URL` | Base URL serving `manifest.json` and the archives | `https://panategwa.github.io/PanategwaHub/releases` |
| `XENOTERRA_LOCAL_RELEASES` | Folder with local release zips / manifest for offline use | `Launcher\releases` |

## Manifest format

`manifest.json`:

```json
{
  "versions": [
    {
      "version": "0.1.0",
      "archive": "Xenoterra-0.1.0.zip",
      "url": "https://example.com/Xenoterra-0.1.0.zip",
      "notes": "# Release notes for 0.1.0\n\n- ...\n"
    }
  ]
}
```

- `url` is optional; if omitted the launcher builds it from `RELEASES_URL` + `/` + `archive`.
- `notes` is optional; release notes are also read from `release_notes.md` next to the game or in the releases folder.

## Release notes

Drop a `release_notes.md` next to the installed game, or in the releases
folder, or put a `notes` field in the manifest entry. The launcher shows
whichever it finds first.