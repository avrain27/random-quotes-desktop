import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import PangoCairo from 'gi://PangoCairo';
import Gdk from 'gi://Gdk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class RandomQuotesPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(650, 750);

        // Adw.PreferencesWindow shows the pages as tabs automatically
        // once there is more than one.
        window.add(this._buildQuotesPage(settings));
        window.add(this._buildAppearancePage(settings));
        window.add(this._buildBehaviorPage(settings));
    }

    // ------------------------------------------------------------------
    // Tab 1: everything visual
    // ------------------------------------------------------------------
    _buildAppearancePage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'preferences-desktop-appearance',
        });

        // A color is valid if GTK can parse it: hex (#fff, #ffffff),
        // rgb()/rgba(), or a CSS color name ("white").
        const isValidColor = value => {
            const v = value.trim();
            return v !== '' && new Gdk.RGBA().parse(v);
        };

        // Invalid input is rejected outright: the entry shows an error style,
        // but the setting keeps its last valid value.
        const validateColorEntry = (entry, key) => {
            const value = entry.get_text().trim();
            if (isValidColor(value)) {
                entry.remove_css_class('error');
                entry.set_tooltip_text(null);
                settings.set_string(key, value);
            } else {
                entry.add_css_class('error');
                entry.set_tooltip_text('Not a valid color. Use a CSS name ("white") or hex ("#ffffff").');
            }
        };

        const makeColorRow = (key, title) => {
            const row = new Adw.EntryRow({ title });
            row.set_text(settings.get_string(key));
            row.connect('changed', () => validateColorEntry(row, key));
            return row;
        };

        const makeSizeRow = (key) => {
            const row = new Adw.SpinRow({
                title: 'Font size (pt)',
                adjustment: new Gtk.Adjustment({
                    lower: 8, upper: 72, step_increment: 1,
                    value: settings.get_int(key),
                }),
            });
            settings.bind(key, row.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };

        const lightGroup = new Adw.PreferencesGroup({
            title: 'Light Theme',
            description: 'Applied when GNOME is in Light Mode',
        });
        lightGroup.add(makeSizeRow('font-size'));
        lightGroup.add(makeColorRow('text-color', 'Text color (Hex or Name)'));
        page.add(lightGroup);

        const darkGroup = new Adw.PreferencesGroup({
            title: 'Dark Theme',
            description: 'Applied when GNOME is in Dark Mode',
        });
        darkGroup.add(makeSizeRow('dark-font-size'));
        darkGroup.add(makeColorRow('dark-text-color', 'Text color (Hex or Name)'));
        page.add(darkGroup);

        const appearanceGroup = new Adw.PreferencesGroup({ title: 'Appearance' });

        const opacityRow = new Adw.SpinRow({
            title: 'Opacity',
            adjustment: new Gtk.Adjustment({
                lower: 0.1, upper: 1.0, step_increment: 0.05,
                value: settings.get_double('opacity'),
            }),
            digits: 2,
        });
        appearanceGroup.add(opacityRow);
        settings.bind('opacity', opacityRow.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);

        const shadowRow = new Adw.SpinRow({
            title: 'Shadow strength',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 12, step_increment: 0.5,
                value: settings.get_double('shadow'),
            }),
            digits: 1,
        });
        appearanceGroup.add(shadowRow);
        settings.bind('shadow', shadowRow.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);

        // --- Font family ---
        // Enumerate the fonts actually installed on this system via Pango.
        const pangoFamilies = PangoCairo.FontMap.get_default()
            .list_families()
            .map(f => f.get_name());

        const GENERIC_FAMILIES = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
        const isKnownFamily = name => {
            const n = name.trim().toLowerCase();
            return GENERIC_FAMILIES.includes(n) ||
                   pangoFamilies.some(f => f.toLowerCase() === n);
        };

        const FONT_TOOLTIP = 'Leave empty to use the system default. e.g. "DejaVu Serif", monospace';

        const fontFamilyRow = new Adw.EntryRow({
            title: 'Font family',
            tooltip_text: FONT_TOOLTIP,
        });
        fontFamilyRow.set_text(settings.get_string('font-family'));

        const validateFontFamily = () => {
            const value = fontFamilyRow.get_text().trim();
            if (!value || isKnownFamily(value)) {
                fontFamilyRow.remove_css_class('error');
                fontFamilyRow.set_tooltip_text(FONT_TOOLTIP);
                settings.set_string('font-family', value);
            } else {
                fontFamilyRow.add_css_class('error');
                fontFamilyRow.set_tooltip_text('Unknown font family. Pick one from the list below or check the spelling.');
            }
        };
        fontFamilyRow.connect('changed', validateFontFamily);
        appearanceGroup.add(fontFamilyRow);

        // Dropdown of installed fonts; selecting one writes it into the entry.
        const sortedFamilies = [...pangoFamilies].sort((a, b) => a.localeCompare(b));
        const fontModel = new Gtk.StringList({ strings: sortedFamilies });
        const fontComboRow = new Adw.ComboRow({
            title: 'Installed fonts',
            subtitle: 'Pick an installed font, or type a custom name above.',
            model: fontModel,
        });
        const currentFont = settings.get_string('font-family').trim().toLowerCase();
        const currentIdx = sortedFamilies.findIndex(f => f.toLowerCase() === currentFont);
        if (currentIdx >= 0) {
            fontComboRow.set_selected(currentIdx);
        }
        fontComboRow.connect('notify::selected', () => {
            const name = fontModel.get_string(fontComboRow.get_selected());
            if (name) {
                fontFamilyRow.set_text(name);
            }
        });
        appearanceGroup.add(fontComboRow);

        validateFontFamily();

        page.add(appearanceGroup);
        return page;
    }

    // ------------------------------------------------------------------
    // Tab 2: layout + behavior
    // ------------------------------------------------------------------
    _buildBehaviorPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Behavior',
            icon_name: 'preferences-system',
        });

        const layoutGroup = new Adw.PreferencesGroup({
            title: 'Layout',
            description: 'Control the dimensions and boundaries of the quotes.',
        });
        page.add(layoutGroup);

        const maxWidthRow = new Adw.SpinRow({
            title: 'Maximum Width (px)',
            subtitle: 'Limits how wide the quote text box can be before wrapping.',
            adjustment: new Gtk.Adjustment({
                lower: 100, upper: 3000, step_increment: 10,
                value: settings.get_int('max-width'),
            }),
        });
        layoutGroup.add(maxWidthRow);
        settings.bind('max-width', maxWidthRow.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);

        const behaviorGroup = new Adw.PreferencesGroup({ title: 'Behavior' });
        page.add(behaviorGroup);

        const showPanelRow = new Adw.SwitchRow({
            title: 'Show panel button',
            subtitle: 'Display icon in the top panel. Left-click for a new quote, right-click for settings.',
            active: settings.get_boolean('show-panel-button'),
        });
        behaviorGroup.add(showPanelRow);
        settings.bind('show-panel-button', showPanelRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const modeRow = new Adw.ComboRow({
            title: 'Quote mode',
            model: new Gtk.StringList({ strings: ['Random', 'Sequential'] }),
        });
        modeRow.set_selected(settings.get_string('mode') === 'sequential' ? 1 : 0);
        modeRow.connect('notify::selected', () => {
            settings.set_string('mode', modeRow.selected === 1 ? 'sequential' : 'random');
        });
        behaviorGroup.add(modeRow);

        const intervalRow = new Adw.SpinRow({
            title: 'Update interval (seconds)',
            adjustment: new Gtk.Adjustment({
                lower: 10, upper: 3600, step_increment: 10,
                value: settings.get_int('interval'),
            }),
        });
        behaviorGroup.add(intervalRow);
        settings.bind('interval', intervalRow.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);

        const positionRow = new Adw.ComboRow({
            title: 'Position',
            model: new Gtk.StringList({
                strings: ['Bottom Right', 'Bottom Center', 'Bottom Left',
                          'Top Right', 'Top Center', 'Top Left',
                          'Center Right', 'Center', 'Center Left'],
            }),
        });
        const posMap = ['bottom-right', 'bottom-center', 'bottom-left',
                        'top-right', 'top-center', 'top-left',
                        'center-right', 'center', 'center-left'];
        let initialPos = posMap.indexOf(settings.get_string('position'));
        if (initialPos === -1) initialPos = 0;
        positionRow.set_selected(initialPos);
        positionRow.connect('notify::selected', () => {
            settings.set_string('position', posMap[positionRow.selected]);
        });
        behaviorGroup.add(positionRow);

        return page;
    }

    // ------------------------------------------------------------------
    // Tab 3: the quote list, on its own page
    // ------------------------------------------------------------------
    _buildQuotesPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Quotes',
            icon_name: 'format-justify-left',
        });

        const quotesGroup = new Adw.PreferencesGroup({
            title: 'Quotes',
            description: 'Each box is one quote. You can write multi-line quotes.',
        });
        page.add(quotesGroup);

        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        quotesGroup.add(listBox);

        // Save helper
        const saveQuotes = () => {
            const quotes = [];
            let child = listBox.get_first_child();
            while (child) {
                if (child._textView) {
                    const buffer = child._textView.get_buffer();
                    const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), true).trim();
                    if (text) quotes.push(text);
                }
                child = child.get_next_sibling();
            }
            settings.set_strv('quotes', quotes);
        };

        // Create one multi-line quote row
        const createQuoteRow = (text = '') => {
            const row = new Gtk.ListBoxRow({ activatable: false, selectable: false });

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 8,
                margin_end: 8,
            });

            const textView = new Gtk.TextView({
                wrap_mode: Gtk.WrapMode.WORD,
                hexpand: true,
                vexpand: false,
            });
            const buffer = textView.get_buffer();
            buffer.set_text(text, -1);
            buffer.connect('changed', saveQuotes);

            const scrolled = new Gtk.ScrolledWindow({
                child: textView,
                min_content_height: 70,
                max_content_height: 140,
                vexpand: false,
                hexpand: true,
            });

            const removeBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.START,
                css_classes: ['flat', 'circular'],
            });
            removeBtn.connect('clicked', () => {
                listBox.remove(row);
                saveQuotes();
            });

            row._textView = textView;

            box.append(scrolled);
            box.append(removeBtn);
            row.set_child(box);
            listBox.append(row);
        };

        // Load existing quotes
        const existing = settings.get_strv('quotes');
        existing.forEach(q => createQuoteRow(q));

        // If somehow empty, just show one empty row
        if (existing.length === 0) {
            createQuoteRow('');
        }

        // Add Quote button, centered under the list
        const addButton = new Gtk.Button({
            label: 'Add Quote',
            icon_name: 'list-add-symbolic',
            css_classes: ['suggested-action', 'pill'],
            halign: Gtk.Align.CENTER,
            margin_top: 12,
        });
        addButton.connect('clicked', () => {
            createQuoteRow('');
            const last = listBox.get_last_child();
            if (last && last._textView) {
                last._textView.grab_focus();
            }
        });
        quotesGroup.add(addButton);

        return page;
    }
}

