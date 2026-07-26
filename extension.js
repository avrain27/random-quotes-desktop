import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const SCHEMA_ID = 'org.gnome.shell.extensions.random-quotes-desktop';

export default class RandomQuotesExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._labels = [];
        this._timeoutId = null;
        this._settings = null;
        this._settingsChangedIds = [];
        this._interfaceSettings = null;
        this._themeChangedId = null;
        this._monitorsChangedId = null;
        this._currentIndex = 0;
        this._panelButton = null;
    }

    enable() {
        this._settings = this.getSettings(SCHEMA_ID);

        // Dark theme detection
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._themeChangedId = this._interfaceSettings.connect('changed::color-scheme', () => {
            this._updateAllStyles();
        });

        // ===== Panel Button =====
        this._panelButton = new PanelMenu.Button(0.0, 'Random Quotes', true);

        const icon = new St.Icon({
            icon_name: 'dialog-information-symbolic',
            style_class: 'system-status-icon',
        });
        this._panelButton.add_child(icon);

        // Open preferences on left click
        this._panelButton.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this.openPreferences();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        Main.panel.addToStatusArea('random-quotes-desktop', this._panelButton);
        // ========================

        this._createLabelsForAllMonitors();
        this._updateAllQuotes();
        this._startTimer();

        // Settings listeners
        const keys = [
            'font-size', 'text-color', 'dark-font-size', 'dark-text-color',
            'opacity', 'shadow', 'position', 'mode', 'quotes', 'interval'
        ];

        keys.forEach(key => {
            this._settingsChangedIds.push(
                this._settings.connect(`changed::${key}`, () => {
                    if (['font-size', 'text-color', 'dark-font-size', 'dark-text-color', 'opacity', 'shadow'].includes(key)) {
                        this._updateAllStyles();
                    } else if (key === 'position') {
                        this._updateAllPositions();
                    } else if (key === 'interval') {
                        this._restartTimer();
                    } else {
                        this._updateAllQuotes();
                    }
                })
            );
        });

        // Monitor hotplug support
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._createLabelsForAllMonitors();
            this._updateAllStyles();
            this._updateAllPositions();
            this._updateAllQuotes();
        });
    }

    disable() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        this._settingsChangedIds.forEach(id => this._settings.disconnect(id));
        this._settingsChangedIds = [];

        if (this._themeChangedId && this._interfaceSettings) {
            this._interfaceSettings.disconnect(this._themeChangedId);
            this._themeChangedId = null;
        }
        this._interfaceSettings = null;

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        if (this._panelButton) {
            this._panelButton.destroy();
            this._panelButton = null;
        }

        this._destroyAllLabels();
        this._settings = null;
    }

    _createLabelsForAllMonitors() {
        this._destroyAllLabels();

        Main.layoutManager.monitors.forEach((monitor, index) => {
            const label = new St.Label({
                text: "Loading quote...",
                style_class: 'random-quotes-label',
                reactive: false,
                opacity: 0,
            });

            label.clutter_text.line_wrap = true;
            label.clutter_text.line_wrap_mode = 2;
            label.clutter_text.ellipsize = 0;

            const bgGroup = Main.layoutManager.backgroundGroup || Main.layoutManager._backgroundGroup;
            bgGroup.add_child(label);

            this._labels.push({ label, monitorIndex: index });
        });
    }

    _destroyAllLabels() {
        this._labels.forEach(item => {
            if (item.label) item.label.destroy();
        });
        this._labels = [];
    }

    _getQuotes() {
        const str = this._settings.get_string('quotes') || '';
        const quotes = str.trim().split('\n').filter(q => q.trim() !== '');

        // Fallback if the user cleared everything
        if (quotes.length === 0) {
            return [
                "Stay curious.",
                "Simplicity is the ultimate sophistication.",
                "It always seems impossible until it's done.",
                "The best time to plant a tree was 20 years ago. The second best time is now.",
                "Be yourself; everyone else is already taken.",
                "In the middle of difficulty lies opportunity."
            ];
        }
        return quotes;
    }

    _getRandomQuote(quotes) {
        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    _getNextQuote(quotes) {
        this._currentIndex = (this._currentIndex + 1) % quotes.length;
        return quotes[this._currentIndex];
    }

    _updateAllQuotes() {
        const quotes = this._getQuotes();
        const mode = this._settings.get_string('mode');
        const quote = mode === 'sequential'
            ? this._getNextQuote(quotes)
            : this._getRandomQuote(quotes);

        this._labels.forEach(item => {
            if (item.label) {
                item.label.ease({
                    opacity: 0,
                    duration: 300,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        item.label.set_text(quote);
                        item.label.clutter_text.line_wrap = true;
                        item.label.clutter_text.line_wrap_mode = 2;
                        item.label.clutter_text.ellipsize = 0;

                        this._updateStyle(item.label);
                        this._setPosition(item.label, item.monitorIndex);

                        item.label.ease({
                            opacity: this._settings.get_double('opacity') * 255,
                            duration: 300,
                            mode: Clutter.AnimationMode.EASE_IN_QUAD
                        });
                    }
                });
            }
        });
    }

    _updateAllStyles() {
        this._labels.forEach(item => {
            if (item.label) this._updateStyle(item.label);
        });
    }

    _updateAllPositions() {
        this._labels.forEach(item => {
            if (item.label) this._setPosition(item.label, item.monitorIndex);
        });
    }

    _updateStyle(label) {
        if (!label) return;

        let isDark = false;
        try {
            const colorScheme = this._interfaceSettings.get_string('color-scheme');
            isDark = (colorScheme === 'prefer-dark');
        } catch (e) {
            console.log('Theme detection failed, using light style');
        }

        const fontSize = isDark ? this._settings.get_int('dark-font-size') : this._settings.get_int('font-size');
        const textColor = isDark ? this._settings.get_string('dark-text-color') : this._settings.get_string('text-color');
        const opacity = this._settings.get_double('opacity');
        const shadow = this._settings.get_double('shadow');

        label.set_opacity(opacity * 255);

        label.set_style(`
            font-size: ${fontSize}pt;
            color: ${textColor};
            text-shadow: 0 0 ${shadow}px rgba(0,0,0,0.8);
            padding: 40px;
        `);
    }

    _setPosition(label, monitorIndex) {
        if (!label) return;

        const monitor = Main.layoutManager.monitors[monitorIndex];
        if (!monitor) return;

        const pos = this._settings.get_string('position');
        const padding = 40;

        label.clutter_text.line_wrap = true;
        label.clutter_text.line_wrap_mode = 2;
        label.clutter_text.ellipsize = 0;

        const maxWidth = Math.floor(monitor.width * 0.70);
        label.clutter_text.set_width(maxWidth);

        let [minW, natW] = label.get_preferred_width(-1);
        let [minH, natH] = label.get_preferred_height(natW);

        let x = monitor.x;
        let y = monitor.y;

        if (pos.includes('left')) {
            x += padding;
        } else if (pos.includes('right')) {
            x += monitor.width - natW - padding;
        } else {
            x += (monitor.width - natW) / 2;
        }

        if (pos.includes('top')) {
            y += padding;
        } else if (pos.includes('bottom')) {
            y += monitor.height - natH - padding;
        } else {
            y += (monitor.height - natH) / 2;
        }

        label.set_position(x, y);
    }

    _startTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
        }
        const interval = this._settings.get_int('interval');
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._updateAllQuotes();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _restartTimer() {
        this._startTimer();
    }
}
