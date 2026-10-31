import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

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
        this._panelButtonClickId = null;
    }

    enable() {
        this._settings = this.getSettings();

        // Dark theme detection
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._themeChangedId = this._interfaceSettings.connect('changed::color-scheme', () => {
            this._updateAllStyles();
        });

        this._updatePanelButton();

        this._createLabelsForAllMonitors();
        this._updateAllQuotes();
        this._startTimer();

        // Settings listeners
        const keys = [
            'font-size', 'text-color', 'dark-font-size', 'dark-text-color',
            'opacity', 'shadow', 'font-family', 'position', 'mode', 'quotes',
            'interval', 'show-panel-button', 'max-width'
        ];

        keys.forEach(key => {
            this._settingsChangedIds.push(
                this._settings.connect(`changed::${key}`, () => {
                    if (['font-size', 'text-color', 'dark-font-size', 'dark-text-color', 'opacity', 'shadow', 'font-family'].includes(key)) {
                        this._updateAllStyles();
                    } else if (key === 'position') {
                        this._updateAllPositions();
                    } else if (key === 'interval') {
                        this._restartTimer();
                    } else if (key === 'show-panel-button') {
                        this._updatePanelButton();
                    } else if (key === 'max-width') {
                        this._updateAllPositions();
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

        this._destroyPanelButton();

        this._destroyAllLabels();
        this._settings = null;
    }

    _updatePanelButton() {
        if (this._settings.get_boolean('show-panel-button')) {
            this._createPanelButton();
        } else {
            this._destroyPanelButton();
        }
    }

    _createPanelButton() {
        if (this._panelButton) return;

        this._panelButton = new PanelMenu.Button(0.0, 'Random Quotes', true);

        const icon = new St.Icon({
            icon_name: 'dialog-information-symbolic',
            style_class: 'system-status-icon',
        });
        this._panelButton.add_child(icon);

        this._panelButtonClickId = this._panelButton.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._updateAllQuotes();
                return Clutter.EVENT_STOP;
            }
            else if (event.get_button() === 3) {
                this.openPreferences();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        Main.panel.addToStatusArea('random-quotes-desktop', this._panelButton);
    }

    _destroyPanelButton() {
        if (!this._panelButton) return;

        if (this._panelButtonClickId) {
            this._panelButton.disconnect(this._panelButtonClickId);
            this._panelButtonClickId = null;
        }
        this._panelButton.destroy();
        this._panelButton = null;
    }

    _createLabelsForAllMonitors() {
        this._destroyAllLabels();

        const padding = 40;

        Main.layoutManager.monitors.forEach((monitor, index) => {
            // Monitor-sized overlay (inset by padding). The label is anchored
            // inside it with AlignConstraints, which work regardless of the
            // layout manager and re-apply automatically on every relayout.
            const overlay = new St.Widget({
                x: monitor.x + padding,
                y: monitor.y + padding,
                width: Math.max(1, monitor.width - padding * 2),
                height: Math.max(1, monitor.height - padding * 2),
            });

            const label = new St.Label({
                text: "Loading quote...",
                style_class: 'random-quotes-label',
                reactive: false,
                opacity: 0,
            });

            label.set_pivot_point(0.5, 0.5);

            label.clutter_text.line_wrap = true;
            label.clutter_text.line_wrap_mode = 2;
            label.clutter_text.ellipsize = 0;

            const xConstraint = new Clutter.AlignConstraint({
                source: overlay,
                align_axis: Clutter.AlignAxis.X_AXIS,
                factor: 0.0,
            });
            const yConstraint = new Clutter.AlignConstraint({
                source: overlay,
                align_axis: Clutter.AlignAxis.Y_AXIS,
                factor: 0.0,
            });
            label.add_constraint(xConstraint);
            label.add_constraint(yConstraint);

            overlay.add_child(label);

            const bgGroup = Main.layoutManager.backgroundGroup || Main.layoutManager._backgroundGroup;
            bgGroup.add_child(overlay);

            const item = { label, overlay, xConstraint, yConstraint, monitorIndex: index };
            this._labels.push(item);
            this._applyPosition(item);
        });
    }

    _destroyAllLabels() {
        this._labels.forEach(item => {
            // Destroying the overlay destroys the label with it
            if (item.overlay) item.overlay.destroy();
        });
        this._labels = [];
    }

    _getQuotes() {
        const quotes = this._settings.get_strv('quotes');

        // Fallback if the user cleared everything
        if (quotes.length === 0) {
            return this._settings.get_default_value('quotes').deep_unpack();
        }
        return quotes;
    }

    _getRandomQuote(quotes) {
        // If there's only 1 (or 0) quotes, we have no choice but to return it
        if (quotes.length <= 1) {
            return quotes[0] || "No quotes available.";
        }

        let newIndex;
        // Keep generating a new index until it's different from the current one
        do {
            newIndex = Math.floor(Math.random() * quotes.length);
        } while (newIndex === this._currentIndex);

        // Update the current index so the next random pick knows what to avoid
        this._currentIndex = newIndex;

        return quotes[this._currentIndex];
    }

    _getNextQuote(quotes) {
        this._currentIndex = (this._currentIndex + 1) % quotes.length;
        return quotes[this._currentIndex];
    }

    _updateAllQuotes() {
        const quotes = this._getQuotes();
        const mode = this._settings.get_string('mode');

        const quote = (mode === 'sequential' ? this._getNextQuote(quotes) : this._getRandomQuote(quotes)) || "No quotes available.";

        this._labels.forEach(item => {
            if (item.label) {
                item.label.set_text(quote);
                this._updateStyle(item.label);
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
            if (item.label) {
                this._applyPosition(item);
                // text-align in _updateStyle depends on 'position' too
                this._updateStyle(item.label);
            }
        });
    }

    _applyPosition(item) {
        if (!item.label || !item.overlay) return;

        const monitor = Main.layoutManager.monitors[item.monitorIndex];
        if (!monitor) return;

        const pos = this._settings.get_string('position');
        const padding = 40;

        // Keep the overlay glued to the monitor (geometry can change on
        // hotplug / resolution change even without a rebuild). It is inset
        // by the padding, which reproduces the original 40px inset on
        // every edge for every position.
        item.overlay.set_position(monitor.x + padding, monitor.y + padding);
        item.overlay.set_size(
            Math.max(1, monitor.width - padding * 2),
            Math.max(1, monitor.height - padding * 2)
        );

        const settingMaxWidth = this._settings.get_int('max-width');
        const monitorMaxWidth = Math.floor(monitor.width * 0.70);
        const maxWidth = Math.min(settingMaxWidth, monitorMaxWidth);

        // Fixed-width box so wrapping and text-align behave consistently.
        item.label.clutter_text.set_width(maxWidth);
        item.label.set_width(maxWidth);

        // AlignConstraint: factor 0 = flush left/top, 1 = flush right/bottom,
        // 0.5 = centered. The constraint tracks the overlay's size, so the
        // anchor is re-applied automatically on relayouts, resizes and
        // quote changes.
        const xFactor = pos.includes('right') ? 1.0 : pos.includes('left') ? 0.0 : 0.5;
        const yFactor = pos.includes('bottom') ? 1.0 : pos.includes('top') ? 0.0 : 0.5;
        item.xConstraint.factor = xFactor;
        item.yConstraint.factor = yFactor;
    }

    _isValidFontFamily(value) {
        // Generic CSS families, or a name made of normal font-name
        // characters (letters, digits, spaces, hyphens, quotes, dots).
        // Anything else is rejected outright.
        const generics = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
        if (generics.includes(value.toLowerCase())) {
            return true;
        }
        return /^[\w '().-]+$/u.test(value);
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
        // Reject invalid values outright (fall back to the system default
        // font) rather than trying to fix them. The prefs window validates
        // input; this is a safety net for values set outside it (e.g. dconf).
        let fontFamily = this._settings.get_string('font-family').trim();
        if (fontFamily && !this._isValidFontFamily(fontFamily)) {
            fontFamily = '';
        }

        label.set_opacity(opacity * 255);

        const pos = this._settings.get_string('position');
        let textAlign = 'left';
        if (pos.includes('right')) {
            textAlign = 'right';
        } else if (pos.includes('center')) {
            textAlign = 'center';
        }

        const fontFamilyCss = fontFamily ? `font-family: ${fontFamily};` : '';

        label.set_style(`
            font-size: ${fontSize}pt;
            color: ${textColor};
            ${fontFamilyCss}
            text-shadow: 0 0 ${shadow}px rgba(0,0,0,0.8);
            text-align: ${textAlign};
        `);
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

