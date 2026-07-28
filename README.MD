# Random Quotes on Desktop

A simple GNOME Shell extension that displays rotating quotes on the desktop background.

## Features

- Random or sequential quote rotation
- Multi-monitor support
- Separate styling for light and dark themes
- Configurable position, opacity, shadow, and maximum width
- Multi-line quote editor in preferences
- Top-bar icon:
  - Left-click → cycle to the next quote
  - Right-click → open preferences

## Installation

### From extensions.gnome.org (once published)
1. Visit the extension page on [extensions.gnome.org](https://extensions.gnome.org)
2. Toggle the switch to install

### Manual Installation
```bash
git clone https://github.com/avrain27/random-quotes-desktop.git
mkdir -p ~/.local/share/gnome-shell/extensions/random-quotes-desktop@avrain27
cp -r random-quotes-desktop/* ~/.local/share/gnome-shell/extensions/random-quotes-desktop@avrain27/
glib-compile-schemas ~/.local/share/gnome-shell/extensions/random-quotes-desktop@avrain27/schemas
gnome-extensions enable random-quotes-desktop@avrain27
```

## Usage

1. Quotes appear on the desktop background
2. **Left-click** the top-bar icon to show the next quote
3. **Right-click** the top-bar icon to open settings
4. Add, edit, or remove quotes in the preferences window
5. Choose between Random or Sequential mode
6. Adjust position, colors, opacity, maximum width, and update interval

## Accessing Preferences
Open preferences via:
1. Right-clicking the top-bar icon
2. GNOME Extensions application
3. Command line:
```bash
gnome-extensions prefs random-quotes-desktop@avrain27
```

## Compatibility
- GNOME Shell 48, 49, 50
- Wayland and X11 supported

## Troubleshooting
If the extension is not working:
```bash
# Check logs
journalctl -f -o cat /usr/bin/gnome-shell | grep -i quote

# Reset settings
dconf reset -f /org/gnome/shell/extensions/random-quotes-desktop/

# Restart GNOME Shell (Alt+F2 → 'r' on X11, or log out/in on Wayland)
```

## 💖 Support This Project
Enjoying this extension? Help support its development:
- [PayPal](https://paypal.me/avrain27) (One-time donations)
- **Star the repo** ⭐ (Helps visibility!)

## License
GNU GPL v3
