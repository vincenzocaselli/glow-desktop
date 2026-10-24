/* ============================================================
 * Glow — GNOME Shell extension
 * Draws a soft colored aura around the currently focused window.
 * Uses 4 thin strip actors (top, bottom, left, right) projecting
 * a box-shadow halo outward only — no actor under the window, so
 * even transparent windows (terminals, etc.) stay untainted.
 *
 * On laptops it also draws a horizontal battery icon with the
 * charge level and shows the remaining time in a tooltip.
 *
 * License: GPL-3.0-or-later
 * ============================================================ */

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {WindowIcon, WindowSwitcherPopup} from 'resource:///org/gnome/shell/ui/altTab.js';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';
import { loadInterfaceXML } from 'resource:///org/gnome/shell/misc/fileUtils.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// -------------------- configuration --------------------
// Edit these to taste. No need to repackage anything — just
// reload the extension or log out / log in.
const CFG = {
    // Glow color (rgba). Lighter, brighter blue (Dodger Blue).
    color: 'rgba(30, 144, 255, 0.95)',

    // Blur radius — soft halo around the strip.
    blur: 6,

    // Width of the strip itself — this is the crisp solid line you see.
    // Bigger = more defined / less "glow-only" look.
    stripWidth: 2,

    // Corner radius of the glow, in px: the same as windowCornerRadius, so
    // the glow follows the curve of the windows. Maximized windows get
    // straight corners. 0 draws straight corners everywhere, for a desktop
    // with square windows (GLOW_SQUARE_CORNERS=1 at install time).
    cornerRadius: 12,

    // Fade-in / fade-out duration in ms.
    fadeMs: 180,

    // Follow the window while moved/resized.
    followMove: true,

    // How long the focus must hold still before the glow moves, in ms.
    // Below the threshold of perception for an ordinary window switch.
    focusSettleMs: 40,

    // Two focus changes closer together than this belong to a burst:
    // an application is mapping several windows at once, as a browser
    // does when it restores its session. The glow leaves the screen
    // for the duration rather than jumping from window to window.
    burstGapMs: 500,

    // How much calm ends a burst and brings the glow back.
    burstSettleMs: 400,

    // Battery features. They have no effect on machines without a battery.
    // Show the remaining time when the pointer rests on the battery icon.
    batteryTooltip: true,

    // Replace the stock battery icon with a horizontal one in the style
    // of Windows 11: colored fill, percentage inside, bolt when plugged in.
    batteryIcon: true,
    batteryPercentInside: true,
    // Font of the percentage, as a Pango description ("Family Weight").
    // If the family is missing, Pango falls back to the default sans.
    batteryFont: 'Inter Bold',
    // Minimum width: the icon grows to fit the digits at full size.
    batteryIconWidth: 34,
    batteryIconHeight: 17,
    // Height of the digits, as a fraction of the inner height of the
    // battery and of the disk capsule.
    batteryDigitHeight: 0.75,
    // Size of the unit ("%", "GB") relative to the digits.
    batteryUnitScale: 0.75,
    // Charging bolt, drawn inside the battery before the digits: fill
    // (r, g, b) and a thin dark outline, so it reads on the green fill.
    batteryBoltColor: [255, 214, 0],
    batteryBoltOutline: [20, 20, 20],

    // Fill colors (r, g, b) and the thresholds, in percent, below which
    // the low and critical colors apply.
    // Light enough for the dark digits drawn over them: at least 5:1
    // against the panel's text color.
    batteryColor: [0, 255, 0],
    batteryColorLow: [245, 196, 90],
    batteryColorCritical: [240, 128, 128],
    batteryLow: 20,
    batteryCritical: 10,

    // Free disk space, drawn in the style of the battery: a capsule
    // filled in proportion to the space used, with the free gigabytes
    // inside. Hover shows the details; a click opens Disk Usage Analyzer.
    diskSpace: true,
    diskPath: '/',
    // Minimum width: the box grows to fit the digits at full size.
    diskIconWidth: 30,
    diskIconHeight: 17,
    diskCornerRadius: 2,
    diskRefreshSeconds: 60,
    // Used-space fill (r, g, b, alpha), and the colors and thresholds,
    // in percent of free space, below which they apply.
    diskColor: [143, 200, 255, 1],
    diskColorLow: [245, 196, 90, 1],
    diskColorCritical: [240, 128, 128, 1],
    diskLow: 15,
    diskCritical: 7,

    // Color of the Bluetooth indicator in the top bar (r, g, b), or null
    // to keep the panel's text color.
    bluetoothColor: [30, 144, 255],

    // Overview previews for windows created minimized. A browser that
    // restores its session at login creates its windows already
    // minimized and never draws them, so the overview shows them empty.
    // Glow shows each one invisibly for a moment, then minimizes it again.
    warmMinimized: true,
    // Quiet time after the last new window before warming starts.
    warmSettleMs: 5000,
    // Warm a window only after this much keyboard and mouse inactivity.
    warmIdleMs: 3000,
    // How long a window stays shown, invisibly, to draw its content.
    warmShowMs: 800,

    // Rounded corners for every window, in px, cut in the compositor at the
    // window's frame. Frames drawn by the window manager round the top
    // corners only and leave the bottom ones to the application, which
    // draws them square; this rounds all four. 12 is the radius of
    // libadwaita, and theme-tweaks gives GTK 3, GTK 4, and the frames the
    // same, so every window ends up alike. Maximized, tiled, and
    // fullscreen windows stay square. 0 turns it off.
    windowCornerRadius: 12,

    // Ring in the glow color around the window under the pointer, or the
    // one Tab and the arrow keys reached, in the overview: the Shell marks
    // it only with its title and close button. Alt+Tab gets the same ring
    // from stylesheet.css. false turns the overview ring off.
    previewRing: true,

    // The Shell moves the keyboard focus among the previews of the primary
    // monitor only. true lets the arrow keys and Tab reach the previews of
    // every monitor while a preview has the focus.
    previewKeys: true,

    // Size of the window previews in Alt+Tab, in px: the Shell draws them
    // at 128, a postage stamp on a 1080p screen. The list scrolls when the
    // items no longer fit. 0 keeps the Shell's size.
    switcherPreviewSize: 256,

    // A preview is the window texture scaled down in one step, and the
    // GPU samples a few texels per pixel of the result: text turns to
    // grain. With 4 the clone is painted at four times the preview size
    // into an offscreen buffer, then halved twice, each halving an exact
    // average of 2x2 pixels. A power of two; 1 keeps the Shell's single
    // step.
    switcherPreviewSupersample: 4,

    // Lay the Alt+Tab previews in rows, as many columns as fit the screen,
    // so every window stays in sight; the Shell keeps one row and scrolls
    // it. Up and Down move by a row. false keeps the Shell's list.
    switcherRows: true,
};

// -------------------- FrameGlow --------------------
// 4 thin strip actors forming a rectangle around the window, each
// projecting box-shadow *outward only*. No fill under the window.
class FrameGlow {
    constructor() {
        this._strips = {
            top:    this._makeStrip('0 -1px'),
            bottom: this._makeStrip('0  1px'),
            left:   this._makeStrip('-1px 0'),
            right:  this._makeStrip(' 1px 0'),
        };

        for (const dir of Object.keys(this._strips)) {
            const s = this._strips[dir];
            global.window_group.add_child(s);
            global.window_group.set_child_below_sibling(s, null);
        }

        this._visible = false;
    }

    _makeStrip(shadowOffset) {
        return new St.Widget({
            reactive: false,
            can_focus: false,
            track_hover: false,
            visible: false,
            opacity: 0,
            style: `
                background-color: ${CFG.color};
                box-shadow: ${shadowOffset} ${CFG.blur}px 0 ${CFG.color};
            `,
        });
    }

    attachTo(windowActor, metaWindow) {
        if (!windowActor || !metaWindow) {
            this.hide();
            return;
        }
        this._applyGeometry(metaWindow);

        for (const s of Object.values(this._strips)) {
            s.show();
            s.ease({
                opacity: 255,
                duration: CFG.fadeMs,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
        this._visible = true;
    }

    follow(metaWindow) {
        if (!metaWindow || !this._visible) return;
        this._applyGeometry(metaWindow);
    }

    _applyGeometry(metaWindow) {
        // get_frame_rect returns the window's true frame, WITHOUT
        // the invisible margin Mutter uses for shadows.
        const r = metaWindow.get_frame_rect();
        const sw = CFG.stripWidth;

        // TOP strip extended by sw on each side so corners overlap
        // with vertical strips, eliminating seams at the corners.
        this._strips.top.set_position(r.x - sw, r.y - sw);
        this._strips.top.set_size(r.width + 2 * sw, sw);

        this._strips.bottom.set_position(r.x - sw, r.y + r.height);
        this._strips.bottom.set_size(r.width + 2 * sw, sw);

        this._strips.left.set_position(r.x - sw, r.y);
        this._strips.left.set_size(sw, r.height);

        this._strips.right.set_position(r.x + r.width, r.y);
        this._strips.right.set_size(sw, r.height);
    }

    hide() {
        for (const s of Object.values(this._strips)) {
            s.ease({
                opacity: 0,
                duration: CFG.fadeMs,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => s.hide(),
            });
        }
        this._visible = false;
    }

    destroy() {
        for (const s of Object.values(this._strips)) {
            s?.destroy();
        }
        this._strips = {};
    }
}

// -------------------- RoundGlow --------------------
// The same aura with rounded corners: one drawing area around the
// window, painted with cairo. A clip keeps the frame itself clear, so
// transparent windows stay untainted as with the strips.
class RoundGlow {
    constructor() {
        this._area = new St.DrawingArea({
            reactive: false,
            can_focus: false,
            track_hover: false,
            visible: false,
            opacity: 0,
        });
        this._area.connect('repaint', area => this._paint(area));
        global.window_group.add_child(this._area);
        global.window_group.set_child_below_sibling(this._area, null);

        this._radii = [0, 0, 0, 0];
        this._visible = false;
    }

    attachTo(windowActor, metaWindow) {
        if (!windowActor || !metaWindow) {
            this.hide();
            return;
        }
        this._applyGeometry(metaWindow);
        this._area.show();
        this._area.ease({
            opacity: 255,
            duration: CFG.fadeMs,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._visible = true;
    }

    follow(metaWindow) {
        if (!metaWindow || !this._visible) return;
        this._applyGeometry(metaWindow);
    }

    _applyGeometry(metaWindow) {
        const r = metaWindow.get_frame_rect();
        const m = CFG.stripWidth + CFG.blur;
        this._area.set_position(r.x - m, r.y - m);
        this._area.set_size(r.width + 2 * m, r.height + 2 * m);
        this._setRadii(this._radiiFor(metaWindow));
    }

    _setRadii(radii) {
        if (radii.every((v, i) => v === this._radii[i]))
            return;
        this._radii = radii;
        this._area.queue_repaint();
    }

    // Radii for the four corners, clockwise from the top left. GTK
    // squares the corners of a maximized window.
    _radiiFor(metaWindow) {
        const radius = metaWindow.get_maximized() === Meta.MaximizeFlags.BOTH
            ? 0 : CFG.cornerRadius;
        return [radius, radius, radius, radius];
    }

    _paint(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const sw = CFG.stripWidth;
        const m = sw + CFG.blur;
        const limit = Math.min((w - 2 * m) / 2, (h - 2 * m) / 2);
        const radii = this._radii.map(v => Math.min(v, limit));
        const [red, green, blue, alpha] = parseRgba(CFG.color);

        // Everything inside the frame stays transparent.
        cr.setFillRule(Cairo.FillRule.EVEN_ODD);
        cr.rectangle(0, 0, w, h);
        cornerRect(cr, m, m, w - 2 * m, h - 2 * m, radii);
        cr.clip();

        // Halo: rings of growing width and fading alpha, in place of the
        // box-shadow blur of the strips. Each ring reaches sw + i px out.
        for (let i = 1; i <= CFG.blur; i++) {
            cr.setSourceRGBA(red, green, blue, alpha * 0.16 * (1 - (i - 1) / CFG.blur));
            cr.setLineWidth(2 * (sw + i));
            cornerRect(cr, m, m, w - 2 * m, h - 2 * m, radii);
            cr.stroke();
        }

        // The strip itself, solid, just outside the frame.
        cr.setSourceRGBA(red, green, blue, alpha);
        cr.setLineWidth(sw);
        cornerRect(cr, m - sw / 2, m - sw / 2, w - 2 * m + sw, h - 2 * m + sw,
            radii.map(v => v > 0 ? v + sw / 2 : 0));
        cr.stroke();
        cr.$dispose();
    }

    hide() {
        this._area.ease({
            opacity: 0,
            duration: CFG.fadeMs,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._area.hide(),
        });
        this._visible = false;
    }

    destroy() {
        this._area?.destroy();
        this._area = null;
    }
}

// Rectangle path with one radius per corner, clockwise from the top left.
function cornerRect(cr, x, y, w, h, [tl, tr, br, bl]) {
    cr.newSubPath();
    cr.arc(x + w - tr, y + tr, tr, -Math.PI / 2, 0);
    cr.arc(x + w - br, y + h - br, br, 0, Math.PI / 2);
    cr.arc(x + bl, y + h - bl, bl, Math.PI / 2, Math.PI);
    cr.arc(x + tl, y + tl, tl, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

// "rgba(r, g, b, a)" or "rgb(r, g, b)" as cairo components, 0..1.
function parseRgba(text) {
    const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(text);
    if (!m)
        return [30 / 255, 144 / 255, 255 / 255, 0.95];
    return [m[1] / 255, m[2] / 255, m[3] / 255, m[4] === undefined ? 1 : Number(m[4])];
}

// -------------------- Battery --------------------
// A horizontal battery icon in the style of Windows 11, with the
// charge level as a colored fill and the percentage inside, plus a
// tooltip with the remaining time. Reads the battery from UPower
// over D-Bus, as the shell's own indicator does, so it needs no
// extra library.

// UPower device states (org.freedesktop.UPower.Device.State).
const UP_CHARGING = 1;
const UP_DISCHARGING = 2;
const UP_FULLY_CHARGED = 4;
const UP_PENDING_CHARGE = 5;

const UP_BUS = 'org.freedesktop.UPower';
const UP_DISPLAY_DEVICE = '/org/freedesktop/UPower/devices/DisplayDevice';

const STRINGS = {
    en: {
        timeLeft: t => `${t} remaining`,
        estimating: 'On battery, estimating',
        untilFull: t => `Full in ${t}`,
        charging: 'Charging',
        full: 'Fully charged',
        paused: 'Plugged in, not charging',
        battery: 'Battery',
        diskFree: (free, size, path) => `${free} GB free of ${size} GB (${path})`,
    },
    it: {
        timeLeft: t => `Autonomia: ${t}`,
        estimating: 'A batteria, stima in corso',
        untilFull: t => `Carica completa tra ${t}`,
        charging: 'In carica',
        full: 'Carica completa',
        paused: 'In rete, carica in pausa',
        battery: 'Batteria',
        diskFree: (free, size, path) => `${free} GB liberi su ${size} GB (${path})`,
    },
};

function pickStrings() {
    for (const name of GLib.get_language_names()) {
        const lang = name.split(/[_.@]/)[0];
        if (STRINGS[lang])
            return STRINGS[lang];
    }
    return STRINGS.en;
}

function formatDuration(seconds) {
    const minutes = Math.round(seconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

function fillColor(percentage) {
    if (percentage <= CFG.batteryCritical)
        return CFG.batteryColorCritical;
    if (percentage <= CFG.batteryLow)
        return CFG.batteryColorLow;
    return CFG.batteryColor;
}

// Resize a drawing to fit its content at full size, from an idle
// callback: a style change during a repaint would queue a relayout in
// the middle of the paint. `owner` keeps `_width` and `_applyStyle()`.
function fitWidth(owner, px, min) {
    owner._wantWidth = Math.max(min, Math.ceil(px));
    if (owner._wantWidth === owner._width || owner._fitId)
        return;
    owner._fitId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        owner._fitId = 0;
        if (owner._wantWidth !== owner._width) {
            owner._width = owner._wantWidth;
            owner._applyStyle();
        }
        return GLib.SOURCE_REMOVE;
    });
}

// Pango markup for a unit drawn smaller than the digits before it.
function unitMarkup(unit) {
    const size = Math.round(CFG.batteryUnitScale * 100);
    return `<span size="${size}%">${unit}</span>`;
}

// Rounded rectangle path for cairo.
function roundedRect(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

class Battery {
    constructor() {
        this._button = Main.panel.statusArea.quickSettings;
        this._waitId = 0;
        if (!this._button)
            return;

        // At login the shell builds the quick settings indicators
        // asynchronously, after this extension is enabled. Poll until
        // the battery icon exists; on shells that restructured the
        // indicator it never appears and the battery features stay off.
        let tries = 40;
        this._waitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            const icon = this._button._system?._indicator;
            if (icon) {
                this._waitId = 0;
                this._setup(icon);
                return GLib.SOURCE_REMOVE;
            }
            if (--tries > 0)
                return GLib.SOURCE_CONTINUE;
            this._waitId = 0;
            console.warn('Glow: battery icon not found, battery features disabled');
            return GLib.SOURCE_REMOVE;
        });
    }

    _setup(icon) {
        this._icon = icon;
        this._text = pickStrings();

        if (CFG.batteryIcon) {
            this._width = CFG.batteryIconWidth;
            this._drawing = new St.DrawingArea({
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._applyStyle();
            this._drawing.connect('repaint', area => this._paint(area));
            icon.get_parent().insert_child_above(this._drawing, icon);
        }

        if (CFG.batteryTooltip) {
            this._label = new St.Label({ style_class: 'dash-label', visible: false });
            Main.layoutManager.addTopChrome(this._label);
            this._buttonIds = [
                this._button.connect('motion-event', () => this._track()),
                this._button.connect('leave-event', () => this._hide()),
                this._button.connect('button-press-event', () => this._hide()),
            ];
        }

        const DeviceProxy = Gio.DBusProxy.makeProxyWrapper(
            loadInterfaceXML('org.freedesktop.UPower.Device'));
        this._proxy = new DeviceProxy(Gio.DBus.system, UP_BUS, UP_DISPLAY_DEVICE,
            (proxy, error) => {
                if (error || !this._proxy)
                    return;
                this._propsId = this._proxy.connect('g-properties-changed',
                    () => this._sync());
                this._sync();
            });

        if (this._drawing)
            this.onReady?.(this._drawing, this._button);
    }

    // Swap the stock icon for the drawn one while a battery is present.
    // The stock icon keeps its place in the layout, shrunk to nothing:
    // hiding it would hide the whole indicator, whose visibility the
    // shell derives from its icons.
    _sync() {
        const present = this._proxy?.IsPresent;
        if (this._drawing) {
            this._drawing.visible = !!present;
            this._applyStyle();
            if (present) {
                this._icon.set_width(0);
                this._icon.opacity = 0;
            } else {
                this._restoreIcon();
            }
            this._drawing.queue_repaint();
        }
        if (this._label?.visible)
            this._show();
    }

    _isPlugged() {
        const p = this._proxy;
        return !!p && [UP_CHARGING, UP_FULLY_CHARGED, UP_PENDING_CHARGE]
            .includes(p.State);
    }

    _restoreIcon() {
        this._icon?.set_width(-1);
        if (this._icon)
            this._icon.opacity = 255;
    }

    _applyStyle() {
        this._drawing?.set_style(
            `width: ${this._width}px; height: ${CFG.batteryIconHeight}px;`);
    }

    _paint(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const fg = area.get_theme_node().get_foreground_color();
        const p = this._proxy;
        const pct = Math.max(0, Math.min(100, Math.round(p?.Percentage ?? 0)));
        const plugged = this._isPlugged();

        const line = 1.2 * scale;
        const nubW = 2 * scale;
        const bodyW = w - nubW - line;
        const bodyH = h - line;
        const x0 = line / 2;
        const y0 = line / 2;

        cr.setSourceRGBA(fg.red / 255, fg.green / 255, fg.blue / 255, fg.alpha / 255);

        // Outline, in the panel's text color so it follows the theme.
        cr.setLineWidth(line);
        roundedRect(cr, x0, y0, bodyW, bodyH, 3 * scale);
        cr.stroke();

        // Terminal nub on the right.
        roundedRect(cr, x0 + bodyW + line / 2, h * 0.32, nubW, h * 0.36, 1 * scale);
        cr.fill();

        // Fill proportional to the charge.
        const pad = 1.6 * scale;
        const innerW = bodyW - 2 * pad;
        const innerH = bodyH - 2 * pad;
        const fillW = Math.max(innerW * pct / 100, pct > 0 ? 1.5 * scale : 0);
        if (fillW > 0) {
            const [r, g, b] = fillColor(pct);
            cr.setSourceRGBA(r / 255, g / 255, b / 255, 1);
            roundedRect(cr, x0 + pad, y0 + pad, fillW, innerH,
                Math.min(1.8 * scale, fillW / 2));
            cr.fill();
        }

        // Percentage and a smaller "%", in the panel's text color over the
        // fill and over the empty part alike: a color change inside a
        // digit hurts reading.
        if (CFG.batteryPercentInside) {
            // Pango rather than cairo's own text API: that one resolves
            // fonts with a plain fontconfig match, which some font
            // packages (OpenDyslexic .woff files) hijack for every name.
            const layout = PangoCairo.create_layout(cr);
            const desc = Pango.font_description_from_string(CFG.batteryFont);
            const setSize = px => {
                desc.set_absolute_size(px * Pango.SCALE);
                layout.set_font_description(desc);
            };
            layout.set_markup(`${pct} ${unitMarkup('%')}`, -1);

            const boltW = plugged ? innerH * 0.6 : 0;
            // Space between the bolt and the digits, about one blank
            // of the font: the outline of the bolt eats half a pixel.
            const gap = plugged ? 2.5 * scale : 0;
            const room = innerW - 2 * scale - boltW - gap;
            // Digits as tall as a fraction of the inner height.
            let px = innerH * 0.95;
            setSize(px);
            let [ink] = layout.get_pixel_extents();
            px *= innerH * CFG.batteryDigitHeight / ink.height;
            setSize(px);
            [ink] = layout.get_pixel_extents();
            // Ask for the width that fits the text at full size; until
            // the resize lands, shrink the text into the room there is.
            fitWidth(this, (ink.width + boltW + gap + 2 * scale + 2 * pad +
                nubW + line) / scale, CFG.batteryIconWidth);
            if (ink.width > room) {
                setSize(px * room / ink.width);
                [ink] = layout.get_pixel_extents();
            }
            const left = x0 + pad + (innerW - boltW - gap - ink.width) / 2;
            const textX = left + boltW + gap - ink.x;
            const textY = y0 + pad + (innerH - ink.height) / 2 - ink.y;

            cr.setSourceRGBA(fg.red / 255, fg.green / 255, fg.blue / 255, fg.alpha / 255);
            cr.moveTo(textX, textY);
            PangoCairo.show_layout(cr, layout);

            // Charging bolt, left of the digits.
            if (plugged) {
                const top = y0 + pad + innerH * 0.08;
                const bot = y0 + pad + innerH * 0.92;
                const bh = bot - top;
                const mid = (top + bot) / 2;
                cr.newPath();
                cr.moveTo(left + boltW * 0.7, top);
                cr.lineTo(left, mid + bh * 0.07);
                cr.lineTo(left + boltW * 0.45, mid + bh * 0.07);
                cr.lineTo(left + boltW * 0.3, bot);
                cr.lineTo(left + boltW, mid - bh * 0.07);
                cr.lineTo(left + boltW * 0.55, mid - bh * 0.07);
                cr.closePath();
                const [br, bg, bb] = CFG.batteryBoltColor;
                const [or, og, ob] = CFG.batteryBoltOutline;
                cr.setLineJoin(Cairo.LineJoin.ROUND);
                cr.setLineWidth(0.8 * scale);
                cr.setSourceRGBA(br / 255, bg / 255, bb / 255, 1);
                cr.fillPreserve();
                cr.setSourceRGBA(or / 255, og / 255, ob / 255, 1);
                cr.stroke();
            }
        }

        cr.$dispose();
    }

    _describe() {
        const p = this._proxy;
        const s = this._text;
        const pct = `${Math.round(p.Percentage)}%`;
        switch (p.State) {
        case UP_DISCHARGING:
            return p.TimeToEmpty > 0
                ? `${s.timeLeft(formatDuration(p.TimeToEmpty))} (${pct})`
                : `${s.estimating} (${pct})`;
        case UP_CHARGING:
            return p.TimeToFull > 0
                ? `${s.untilFull(formatDuration(p.TimeToFull))} (${pct})`
                : `${s.charging} (${pct})`;
        case UP_FULLY_CHARGED:
            return `${s.full} (${pct})`;
        case UP_PENDING_CHARGE:
            return `${s.paused} (${pct})`;
        default:
            return `${s.battery}: ${pct}`;
        }
    }

    // The visible battery icon: the drawn one, or the stock one.
    get _anchor() {
        return this._drawing?.visible ? this._drawing : this._icon;
    }

    // Show the tooltip only while the pointer is on the battery icon,
    // not on the network or volume icons that share the same button.
    _track() {
        const [px, py] = global.get_pointer();
        const box = this._anchor.get_transformed_extents();
        const inside = px >= box.origin.x && px <= box.origin.x + box.size.width &&
            py >= box.origin.y && py <= box.origin.y + box.size.height;
        if (inside && this._anchor.visible && this._proxy?.IsPresent &&
            !this._button.menu.isOpen)
            this._show();
        else
            this._hide();
    }

    _show() {
        this._label.text = this._describe();
        this._label.show();

        const anchor = this._anchor;
        const box = anchor.get_transformed_extents();
        const monitor = Main.layoutManager.findMonitorForActor(anchor);
        const [, natW] = this._label.get_preferred_width(-1);
        const [, natH] = this._label.get_preferred_height(-1);
        const gap = 6;

        let x = box.origin.x + (box.size.width - natW) / 2;
        x = Math.max(monitor.x, Math.min(x, monitor.x + monitor.width - natW));

        // Panel at the bottom (Zorin, Dash to Panel): tooltip above
        // the icon. Panel at the top: below it.
        const panelAtBottom = box.origin.y > monitor.y + monitor.height / 2;
        const y = panelAtBottom
            ? box.origin.y - natH - gap
            : box.origin.y + box.size.height + gap;

        this._label.set_position(Math.round(x), Math.round(y));
    }

    _hide() {
        this._label?.hide();
    }

    destroy() {
        if (this._waitId) {
            GLib.Source.remove(this._waitId);
            this._waitId = 0;
        }
        if (this._fitId) {
            GLib.Source.remove(this._fitId);
            this._fitId = 0;
        }
        this._buttonIds?.forEach(id => this._button.disconnect(id));
        this._buttonIds = null;
        if (this._propsId)
            this._proxy.disconnect(this._propsId);
        this._proxy = null;
        this._label?.destroy();
        this._label = null;
        this._drawing?.destroy();
        this._drawing = null;
        this._restoreIcon();
        this._icon = null;
    }
}

// -------------------- DiskSpace --------------------
// A compact free-space indicator for the panel, a replacement for the
// wider "33.4 GB" readouts of system monitor extensions.
class DiskSpace {
    constructor() {
        this._text = pickStrings();
        this._free = 0;
        this._size = 0;

        this._button = new PanelMenu.Button(0.0, 'Glow disk space', true);
        this._width = CFG.diskIconWidth;
        this._drawing = new St.DrawingArea({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._applyStyle();
        this._drawing.connect('repaint', area => this._paint(area));
        this._button.add_child(this._drawing);

        this._label = new St.Label({ style_class: 'dash-label', visible: false });
        Main.layoutManager.addTopChrome(this._label);
        this._button.connect('notify::hover', () => {
            if (this._button.hover)
                this._show();
            else
                this._label.hide();
        });
        this._button.connect('button-press-event', () => {
            this._label.hide();
            Gio.DesktopAppInfo.new('org.gnome.baobab.desktop')?.launch([], null);
            return Clutter.EVENT_STOP;
        });

        Main.panel.addToStatusArea('glow-disk-space', this._button, 0, 'right');

        this._update();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW,
            CFG.diskRefreshSeconds, () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            });
    }

    // Move the indicator into the battery's box, left of the battery,
    // so the two read as one component. The panel button goes away:
    // a click then opens the system menu, like the battery.
    attachBefore(sibling, button) {
        const parent = sibling.get_parent();
        if (!parent || !this._button)
            return;
        this._button.remove_child(this._drawing);
        this._host = button;
        this._applyStyle();
        parent.insert_child_below(this._drawing, sibling);
        this._button.destroy();
        this._button = null;

        this._hostIds = [
            button.connect('motion-event', () => this._track()),
            button.connect('leave-event', () => this._label.hide()),
            button.connect('button-press-event', () => this._label.hide()),
        ];
    }

    _applyStyle() {
        const margin = this._host ? ' margin-right: 6px;' : '';
        this._drawing?.set_style(
            `width: ${this._width}px; height: ${CFG.diskIconHeight}px;${margin}`);
    }

    _track() {
        const [px, py] = global.get_pointer();
        const box = this._drawing.get_transformed_extents();
        const inside = px >= box.origin.x && px <= box.origin.x + box.size.width &&
            py >= box.origin.y && py <= box.origin.y + box.size.height;
        if (inside && !this._host?.menu?.isOpen)
            this._show();
        else
            this._label.hide();
    }

    _update() {
        try {
            const info = Gio.File.new_for_path(CFG.diskPath)
                .query_filesystem_info('filesystem::free,filesystem::size', null);
            this._free = info.get_attribute_uint64('filesystem::free');
            this._size = info.get_attribute_uint64('filesystem::size');
        } catch (e) {
            this._free = this._size = 0;
        }
        this._drawing.queue_repaint();
    }

    _paint(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const fg = area.get_theme_node().get_foreground_color();
        const setFg = () => cr.setSourceRGBA(fg.red / 255, fg.green / 255,
            fg.blue / 255, fg.alpha / 255);

        const line = 1.2 * scale;
        const x0 = line / 2;
        const y0 = line / 2;
        const bodyW = w - line;
        const bodyH = h - line;
        const radius = CFG.diskCornerRadius * scale;
        const pad = 1.6 * scale;
        const innerH = bodyH - 2 * pad;

        // Fill proportional to the space used.
        if (this._size > 0) {
            const freePct = 100 * this._free / this._size;
            const [r, g, b, a] = freePct <= CFG.diskCritical ? CFG.diskColorCritical
                : freePct <= CFG.diskLow ? CFG.diskColorLow : CFG.diskColor;
            cr.save();
            roundedRect(cr, x0 + pad, y0 + pad, bodyW - 2 * pad, innerH,
                Math.max(radius - pad / 2, 0.5));
            cr.clip();
            cr.setSourceRGBA(r / 255, g / 255, b / 255, a);
            cr.rectangle(x0 + pad, y0 + pad,
                (bodyW - 2 * pad) * (1 - this._free / this._size), innerH);
            cr.fill();
            cr.restore();
        }

        // Outline: no terminal nub, so it does not read as a second battery.
        setFg();
        cr.setLineWidth(line);
        roundedRect(cr, x0, y0, bodyW, bodyH, radius);
        cr.stroke();

        // Free gigabytes, a space, and a smaller "GB".
        const gb = Math.floor(this._free / 1e9);
        const layout = PangoCairo.create_layout(cr);
        // Same font and digit height as the battery percentage.
        const desc = Pango.font_description_from_string(CFG.batteryFont);
        const setSize = px => {
            desc.set_absolute_size(px * Pango.SCALE);
            layout.set_font_description(desc);
        };
        layout.set_markup(`${gb} ${unitMarkup('GB')}`, -1);
        let px = innerH * 0.95;
        setSize(px);
        let [ink] = layout.get_pixel_extents();
        px *= innerH * CFG.batteryDigitHeight / ink.height;
        setSize(px);
        [ink] = layout.get_pixel_extents();
        // As for the battery: grow to fit, shrink only meanwhile.
        fitWidth(this, (ink.width + 2 * scale + 2 * pad + line) / scale,
            CFG.diskIconWidth);
        const room = bodyW - 2 * pad - 2 * scale;
        if (ink.width > room)
            setSize(px * room / ink.width);
        const [ink2] = layout.get_pixel_extents();
        cr.moveTo(x0 + (bodyW - ink2.width) / 2 - ink2.x,
            y0 + (bodyH - ink2.height) / 2 - ink2.y);
        PangoCairo.show_layout(cr, layout);

        cr.$dispose();
    }

    _show() {
        const gb = n => Math.round(n / 1e9);
        this._label.text = this._text.diskFree(gb(this._free), gb(this._size), CFG.diskPath);
        this._label.show();

        const anchor = this._button ?? this._drawing;
        const box = anchor.get_transformed_extents();
        const monitor = Main.layoutManager.findMonitorForActor(anchor);
        const [, natW] = this._label.get_preferred_width(-1);
        const [, natH] = this._label.get_preferred_height(-1);
        const gap = 6;
        let x = box.origin.x + (box.size.width - natW) / 2;
        x = Math.max(monitor.x, Math.min(x, monitor.x + monitor.width - natW));
        const panelAtBottom = box.origin.y > monitor.y + monitor.height / 2;
        const y = panelAtBottom
            ? box.origin.y - natH - gap
            : box.origin.y + box.size.height + gap;
        this._label.set_position(Math.round(x), Math.round(y));
    }

    destroy() {
        if (this._timerId)
            GLib.Source.remove(this._timerId);
        this._timerId = 0;
        if (this._fitId)
            GLib.Source.remove(this._fitId);
        this._fitId = 0;
        this._hostIds?.forEach(id => this._host.disconnect(id));
        this._hostIds = null;
        this._label?.destroy();
        this._label = null;
        if (this._button)
            this._button.destroy();
        else
            this._drawing?.destroy();
        this._button = null;
        this._drawing = null;
    }
}

// -------------------- RoundedWindows --------------------
// A fragment shader on each window actor that clears the pixels of the
// frame rectangle outside a rounded rectangle, with one pixel of
// anti-aliasing. Shadows and other pixels outside the frame are left
// alone. The frame rectangle and the radius are uniforms, updated when
// the window moves or resizes.
const CornerMask = GObject.registerClass(
class CornerMask extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        const declarations = `
            uniform vec4 bounds;
            uniform float radius;
            uniform vec2 pixel_step;
        `;
        const code = `
            vec2 p = cogl_tex_coord0_in.xy / pixel_step;
            if (radius > 0.0 && p.x >= bounds.x && p.x <= bounds.z &&
                p.y >= bounds.y && p.y <= bounds.w) {
                vec2 center = (bounds.xy + bounds.zw) * 0.5;
                vec2 half_size = (bounds.zw - bounds.xy) * 0.5 - vec2(radius);
                vec2 d = abs(p - center) - half_size;
                float dist = length(max(d, vec2(0.0))) - radius;
                cogl_color_out *= 1.0 - smoothstep(-0.7, 0.7, dist);
            }
        `;
        this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, declarations, code, false);
    }

    _init() {
        super._init();
        this._bounds = this.get_uniform_location('bounds');
        this._radius = this.get_uniform_location('radius');
        this._pixelStep = this.get_uniform_location('pixel_step');
    }

    setParams(bounds, radius, width, height) {
        this.set_uniform_float(this._bounds, 4, bounds);
        this.set_uniform_float(this._radius, 1, [radius]);
        this.set_uniform_float(this._pixelStep, 2, [1 / width, 1 / height]);
        this.queue_repaint();
    }
});

class RoundedWindows {
    constructor() {
        this._windows = new Map();
        this._mapId = global.window_manager.connect('map',
            (wm, actor) => this._attach(actor));
        for (const actor of global.get_window_actors())
            this._attach(actor);
    }

    _wanted(win) {
        const type = win.get_window_type();
        return type === Meta.WindowType.NORMAL ||
            type === Meta.WindowType.DIALOG ||
            type === Meta.WindowType.MODAL_DIALOG;
    }

    _attach(actor) {
        const win = actor.meta_window;
        if (!win || this._windows.has(win) || !this._wanted(win))
            return;
        const effect = new CornerMask();
        try {
            actor.add_effect_with_name('glow-corners', effect);
        } catch (e) {
            console.warn(`Glow: no corner mask for "${win.get_title()}": ${e.message}`);
            return;
        }
        // The frame keeps its place inside the actor while the window
        // moves, so only size changes need a new mask: a move would read
        // the actor's position and the frame at different moments and
        // let the square corners through for a frame.
        const ids = [
            win.connect('size-changed', () => this._update(win)),
            win.connect('unmanaging', () => this._detach(win)),
        ];
        const actorId = actor.connect('notify::size', () => this._update(win));
        this._windows.set(win, {actor, effect, ids, actorId});
        this._update(win);
    }

    _update(win) {
        const entry = this._windows.get(win);
        if (!entry)
            return;
        const {actor, effect} = entry;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        // Frame and buffer rectangles come from the same window state,
        // so their offset is consistent even in the middle of a move.
        const frame = win.get_frame_rect();
        const buffer = win.get_buffer_rect();
        const [aw, ah] = actor.get_size();
        if (aw < 1 || ah < 1)
            return;
        const square = win.get_maximized() !== 0 || win.fullscreen;
        const radius = square ? 0 : CFG.windowCornerRadius;
        const x = frame.x - buffer.x;
        const y = frame.y - buffer.y;
        effect.setParams([
            x * scale, y * scale,
            (x + frame.width) * scale, (y + frame.height) * scale,
        ], radius * scale, aw * scale, ah * scale);
    }

    _detach(win) {
        const entry = this._windows.get(win);
        if (!entry)
            return;
        this._windows.delete(win);
        // The actor may already be gone when a window unmanages.
        try {
            entry.ids.forEach(id => win.disconnect(id));
            entry.actor.disconnect(entry.actorId);
            entry.actor.remove_effect(entry.effect);
        } catch (e) {
            console.debug?.(`Glow: corner mask cleanup: ${e.message}`);
        }
    }

    destroy() {
        for (const win of [...this._windows.keys()])
            this._detach(win);
        if (this._mapId)
            global.window_manager.disconnect(this._mapId);
        this._mapId = 0;
    }
}

// -------------------- PreviewWarmer --------------------
// The overview shows a clone of each window's content. A window that
// was minimized before its application ever drew it has no content,
// so its preview stays empty until the user opens it once. This
// shows such windows one at a time, at zero opacity and without the
// minimize animations, then minimizes them again.
class PreviewWarmer {
    constructor() {
        this._queue = [];
        this._settleId = 0;
        this._stepId = 0;
        this._warming = null;
        this._createdId = global.display.connect('window-created',
            (_display, win) => this._onWindowCreated(win));

        // Windows that already exist when the extension starts.
        global.get_window_actors()
            .map(actor => actor.meta_window)
            .forEach(win => this._enqueue(win));
        this._scheduleSettle();
    }

    _onWindowCreated(win) {
        this._enqueue(win);
        this._scheduleSettle();
    }

    _enqueue(win) {
        if (win && !this._queue.includes(win))
            this._queue.push(win);
    }

    // Start only once windows stop appearing: a session restore maps
    // them in a burst, and minimizes them right after creating them.
    _scheduleSettle() {
        if (this._settleId)
            GLib.Source.remove(this._settleId);
        this._settleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            CFG.warmSettleMs, () => {
                this._settleId = 0;
                this._next();
                return GLib.SOURCE_REMOVE;
            });
    }

    _needsWarming(win) {
        if (!win.minimized || win.skip_taskbar || win.is_override_redirect())
            return false;
        if (win.get_window_type() !== Meta.WindowType.NORMAL)
            return false;
        // Windows on other workspaces are not drawn even when shown.
        const ws = global.workspace_manager.get_active_workspace();
        return win.located_on_workspace(ws) && !!win.get_compositor_private();
    }

    _next() {
        if (this._stepId || this._warming)
            return;

        while (this._queue.length && !this._needsWarming(this._queue[0]))
            this._queue.shift();
        if (!this._queue.length)
            return;

        // Wait for the user to pause: a window shown invisibly could
        // otherwise receive a click meant for what lies beneath it.
        const idle = global.backend.get_core_idle_monitor().get_idletime();
        const wait = idle >= CFG.warmIdleMs ? 0 : CFG.warmIdleMs - idle;
        this._stepId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(wait, 100), () => {
            this._stepId = 0;
            if (global.backend.get_core_idle_monitor().get_idletime() < CFG.warmIdleMs) {
                this._next();
                return GLib.SOURCE_REMOVE;
            }
            this._warm(this._queue.shift());
            return GLib.SOURCE_REMOVE;
        });
    }

    _warm(win) {
        if (!win || !this._needsWarming(win)) {
            this._next();
            return;
        }
        const actor = win.get_compositor_private();
        const focused = global.display.focus_window;

        this._warming = {win, actor, focused};
        actor.opacity = 0;
        Main.wm.skipNextEffect(actor);
        win.unminimize();

        this._stepId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CFG.warmShowMs, () => {
            this._stepId = 0;
            this._finish();
            this._next();
            return GLib.SOURCE_REMOVE;
        });
    }

    _finish() {
        const w = this._warming;
        this._warming = null;
        if (!w)
            return;
        try {
            if (!w.win.minimized) {
                Main.wm.skipNextEffect(w.actor);
                w.win.minimize();
            }
            w.actor.opacity = 255;
            // Showing a window for the first time can hand it the focus.
            if (w.focused && global.display.focus_window !== w.focused)
                w.focused.focus(global.get_current_time());
        } catch (e) {
            // The window closed while it was shown: nothing to restore.
        }
    }

    destroy() {
        global.display.disconnect(this._createdId);
        if (this._settleId)
            GLib.Source.remove(this._settleId);
        if (this._stepId)
            GLib.Source.remove(this._stepId);
        this._settleId = this._stepId = 0;
        this._finish();
        this._queue = [];
    }
}

// -------------------- Extension --------------------
// -------------------- PreviewRing --------------------
// The overview marks the window under the pointer, or the one that Tab
// and the arrow keys reached, only with its title and close button. A
// ring in the glow color around that preview makes the selection as
// visible as in Alt+Tab. The ring is a sibling of the window container,
// bound to its allocation and copying its scale, so it follows the
// slight zoom of the hovered preview.
class PreviewRing {
    constructor() {
        this._rings = new Set();
        const proto = WindowPreview.prototype;
        this._showOverlay = proto.showOverlay;
        this._hideOverlay = proto.hideOverlay;
        const self = this;
        proto.showOverlay = function (animate) {
            self._showOverlay.call(this, animate);
            if (!this._overlayShown)
                return;
            self._ringFor(this)?.ease({
                opacity: 255,
                duration: animate ? CFG.fadeMs : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        };
        proto.hideOverlay = function (animate) {
            const shown = this._overlayShown;
            self._hideOverlay.call(this, animate);
            if (shown) {
                this._glowRing?.ease({
                    opacity: 0,
                    duration: animate ? CFG.fadeMs : 0,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        };
    }

    _ringFor(preview) {
        if (preview._glowRing)
            return preview._glowRing;
        const container = preview.window_container;
        if (!container)
            return null;
        const pad = 4 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const ring = new St.Widget({
            style_class: 'glow-preview-ring',
            opacity: 0,
            reactive: false,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        for (const [coordinate, offset] of [
            [Clutter.BindCoordinate.X, -pad],
            [Clutter.BindCoordinate.Y, -pad],
            [Clutter.BindCoordinate.WIDTH, 2 * pad],
            [Clutter.BindCoordinate.HEIGHT, 2 * pad],
        ])
            ring.add_constraint(new Clutter.BindConstraint({source: container, coordinate, offset}));
        container.connectObject('notify::scale-x',
            () => ring.set_scale(container.scale_x, container.scale_y), ring);
        preview.add_child(ring);
        preview.set_child_above_sibling(ring, container);
        preview._glowRing = ring;
        this._rings.add(ring);
        ring.connect('destroy', () => {
            this._rings.delete(ring);
            preview._glowRing = null;
        });
        return ring;
    }

    destroy() {
        WindowPreview.prototype.showOverlay = this._showOverlay;
        WindowPreview.prototype.hideOverlay = this._hideOverlay;
        for (const ring of [...this._rings])
            ring.destroy();
        this._rings.clear();
    }
}

// -------------------- PreviewNavigator --------------------
// The Shell navigates the overview with the arrow keys and Tab inside the
// WorkspacesView of the primary monitor; the other monitors have views of
// their own that the focus never reaches. While a preview has the focus,
// Glow handles those keys itself over the previews of every monitor, by
// their position on the stage, and leaves every other key alone.
class PreviewNavigator {
    constructor() {
        this._eventId = global.stage.connect('captured-event',
            (stage, event) => this._onEvent(event));
    }

    _onEvent(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        if (!Main.overview.visible || Main.overview.dash?.showAppsButton?.checked)
            return Clutter.EVENT_PROPAGATE;
        const focus = global.stage.key_focus;
        if (!(focus instanceof WindowPreview))
            return Clutter.EVENT_PROPAGATE;
        const state = event.get_state() &
            (Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK |
             Clutter.ModifierType.SUPER_MASK);
        if (state)
            return Clutter.EVENT_PROPAGATE;

        let target = null;
        switch (event.get_key_symbol()) {
        case Clutter.KEY_Left:
        case Clutter.KEY_KP_Left:
            target = this._nearest(focus, -1, 0);
            break;
        case Clutter.KEY_Right:
        case Clutter.KEY_KP_Right:
            target = this._nearest(focus, 1, 0);
            break;
        case Clutter.KEY_Up:
        case Clutter.KEY_KP_Up:
            target = this._nearest(focus, 0, -1);
            break;
        case Clutter.KEY_Down:
        case Clutter.KEY_KP_Down:
            target = this._nearest(focus, 0, 1);
            break;
        case Clutter.KEY_Tab:
            target = this._step(focus, 1);
            break;
        case Clutter.KEY_ISO_Left_Tab:
            target = this._step(focus, -1);
            break;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
        if (target && target !== focus)
            target.grab_key_focus();
        // Handled either way: the Shell's own navigation would jump
        // elsewhere, or do nothing, for the same key.
        return Clutter.EVENT_STOP;
    }

    // Every preview of the active workspace of every monitor, with its
    // center on the stage and the monitor it belongs to.
    _previews() {
        const views = Main.overview._overview?.controls?._workspacesDisplay?._workspacesViews ?? [];
        const found = [];
        views.forEach((view, monitor) => {
            const workspace = view?.getActiveWorkspace?.();
            if (!workspace)
                return;
            const walk = actor => {
                if (actor instanceof WindowPreview) {
                    if (!actor.mapped || !actor.visible)
                        return;
                    const r = actor.get_transformed_extents();
                    found.push({
                        preview: actor, monitor,
                        x: r.origin.x + r.size.width / 2,
                        y: r.origin.y + r.size.height / 2,
                    });
                    return;
                }
                for (const child of actor.get_children())
                    walk(child);
            };
            walk(workspace);
        });
        return found;
    }

    // The closest preview in the direction (dx, dy): distance along the
    // direction, plus the sideways offset counted twice so a neighbor in
    // line wins over a nearer one off to the side.
    _nearest(from, dx, dy) {
        const all = this._previews();
        const here = all.find(p => p.preview === from);
        if (!here)
            return null;
        let best = null;
        let bestScore = Infinity;
        for (const p of all) {
            if (p.preview === from)
                continue;
            const along = (p.x - here.x) * dx + (p.y - here.y) * dy;
            if (along < 1)
                continue;
            const across = Math.abs((p.x - here.x) * dy) + Math.abs((p.y - here.y) * dx);
            const score = along + 2 * across;
            if (score < bestScore) {
                bestScore = score;
                best = p.preview;
            }
        }
        return best;
    }

    // Tab order: monitor by monitor, left to right, then top to bottom.
    _step(from, delta) {
        const all = this._previews().sort((a, b) =>
            a.monitor - b.monitor || a.x - b.x || a.y - b.y);
        const index = all.findIndex(p => p.preview === from);
        if (index < 0 || all.length < 2)
            return null;
        return all[(index + delta + all.length) % all.length].preview;
    }

    destroy() {
        if (this._eventId)
            global.stage.disconnect(this._eventId);
        this._eventId = 0;
    }
}

// -------------------- SwitcherPreviews --------------------
// Alt+Tab shows each window as a clone of WINDOW_PREVIEW_SIZE px, a
// constant of the Shell. The Shell builds the item, then this enlarges
// the clone and its box to CFG.switcherPreviewSize with the same fit
// rule as the Shell's; the icon badge keeps its size.
class SwitcherPreviews {
    constructor() {
        const proto = WindowIcon.prototype;
        this._init = proto._init;
        const init = this._init;
        const size = CFG.switcherPreviewSize;
        const supersample = 2 ** Math.round(Math.log2(Math.max(1, CFG.switcherPreviewSupersample)));
        proto._init = function (...args) {
            init.apply(this, args);
            const clone = this._icon?.get_children().find(c => c instanceof Clutter.Clone);
            if (!clone?.source)
                return;
            const px = size * St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const [w, h] = clone.source.get_size();
            if (w < 1 || h < 1)
                return;
            const scale = Math.min(1, px / w, px / h);
            const width = Math.round(w * scale);
            const height = Math.round(h * scale);
            // Mipmaps of the window texture, when mutter has them off.
            clone.source.get_texture?.()?.set_create_mipmaps?.(true);
            if (supersample > 1 && scale < 1) {
                // The clone paints at supersample times the size into an
                // offscreen buffer; each holder halves what it contains,
                // through a buffer of its own until the last one.
                this._icon.remove_child(clone);
                clone.set_size(width * supersample, height * supersample);
                clone.offscreen_redirect = Clutter.OffscreenRedirect.ALWAYS;
                let actor = clone;
                for (let factor = supersample / 2; factor >= 1; factor /= 2) {
                    const holder = new Clutter.Actor({
                        width: width * factor,
                        height: height * factor,
                    });
                    if (factor > 1)
                        holder.offscreen_redirect = Clutter.OffscreenRedirect.ALWAYS;
                    actor.set_position(0, 0);
                    actor.set_pivot_point(0, 0);
                    actor.set_scale(0.5, 0.5);
                    holder.add_child(actor);
                    actor = holder;
                }
                actor.x_align = Clutter.ActorAlign.CENTER;
                actor.y_align = Clutter.ActorAlign.CENTER;
                actor.x_expand = true;
                actor.y_expand = true;
                this._icon.insert_child_at_index(actor, 0);
            } else {
                clone.set_size(width, height);
            }
            this._icon.set_size(px, px);
        };
    }

    destroy() {
        WindowIcon.prototype._init = this._init;
    }
}

// -------------------- GridWindowSwitcher --------------------
// The Shell's Alt+Tab list keeps its previews in one row and scrolls it
// when they no longer fit, so with many windows most are out of sight.
// This list is the Shell's WindowSwitcher with the items in rows: as
// many columns as fit the width the popup offers, every cell the size of
// the largest item, the title of the selected window below. The row
// scroll view of the base class stays empty and hidden.
const GridWindowSwitcher = GObject.registerClass(
class GridWindowSwitcher extends SwitcherPopup.SwitcherList {
    _init(windows, mode) {
        super._init(true);
        this._scrollView.hide();
        this._leftArrow.hide();
        this._rightArrow.hide();

        this._flow = new Clutter.FlowLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            homogeneous: true,
        });
        this._grid = new St.Widget({
            style_class: 'switcher-list-item-container',
            layout_manager: this._flow,
        });
        this._grid.connect('style-changed', () => {
            const spacing = this._grid.get_theme_node().get_length('spacing');
            this._flow.column_spacing = spacing;
            this._flow.row_spacing = spacing;
        });
        this.add_child(this._grid);

        this._label = new St.Label({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this.windows = windows;
        this.icons = [];
        this.columns = 1;
        this._availableWidth = -1;

        for (const win of windows) {
            const icon = new WindowIcon(win, mode);
            this.addItem(icon, icon.label);
            this.icons.push(icon);
            icon.window.connectObject('unmanaged',
                window => this._removeWindow(window), this);
        }
        this.connect('destroy',
            () => this.icons.forEach(icon => icon.window.disconnectObject(this)));
    }

    addItem(item, label) {
        const box = super.addItem(item, label);
        this._list.remove_child(box);
        this._grid.add_child(box);
        return box;
    }

    // Items are square: the largest side of the largest item.
    _cellSize() {
        let size = 0;
        for (const item of this._items) {
            const [, w] = item.get_preferred_width(-1);
            const [, h] = item.get_preferred_height(-1);
            size = Math.max(size, w, h);
        }
        return size;
    }

    _columnsFor(width) {
        const n = this._items.length;
        if (n === 0 || width < 0)
            return Math.max(1, n);
        const cell = this._cellSize();
        const spacing = this._flow.column_spacing;
        return Math.max(1, Math.min(n,
            Math.floor((width + spacing) / (cell + spacing))));
    }

    // The popup asks the height for the monitor width first, then the
    // width for that height: the column count comes from the first call.
    vfunc_get_preferred_height(forWidth) {
        const themeNode = this.get_theme_node();
        this._availableWidth = forWidth > 0 ? themeNode.adjust_for_width(forWidth) : -1;
        this.columns = this._columnsFor(this._availableWidth);
        const cell = this._cellSize();
        const rows = Math.ceil(this._items.length / this.columns);
        const gridHeight = rows * cell + (rows - 1) * this._flow.row_spacing;
        const bottom = themeNode.get_padding(St.Side.BOTTOM);
        const [labelMin, labelNat] = this._label.get_preferred_height(-1);
        return themeNode.adjust_preferred_height(
            gridHeight + labelMin + bottom, gridHeight + labelNat + bottom);
    }

    vfunc_get_preferred_width(_forHeight) {
        const themeNode = this.get_theme_node();
        const cell = this._cellSize();
        // 1px of slack keeps the flow layout from dropping a column.
        const width = this.columns * cell + (this.columns - 1) * this._flow.column_spacing + 1;
        return themeNode.adjust_preferred_width(width, width);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const themeNode = this.get_theme_node();
        const content = themeNode.get_content_box(box);
        const [, labelHeight] = this._label.get_preferred_height(-1);
        const bottom = themeNode.get_padding(St.Side.BOTTOM);

        const gridBox = new Clutter.ActorBox();
        gridBox.x1 = content.x1;
        gridBox.x2 = content.x2;
        gridBox.y1 = content.y1;
        gridBox.y2 = Math.max(content.y1, content.y2 - labelHeight - bottom);
        this._grid.allocate(gridBox);

        const labelBox = new Clutter.ActorBox();
        labelBox.x1 = content.x1;
        labelBox.x2 = content.x2;
        labelBox.y2 = content.y2;
        labelBox.y1 = labelBox.y2 - labelHeight;
        this._label.allocate(labelBox);
    }

    // The base class also scrolls its row here; nothing scrolls in a grid.
    highlight(index, justOutline) {
        const previous = this._items[this._highlighted];
        if (previous) {
            previous.remove_style_pseudo_class('selected');
            previous.remove_style_pseudo_class('highlighted');
        }
        const item = this._items[index];
        if (item)
            item.add_style_pseudo_class(justOutline ? 'highlighted' : 'selected');
        this._highlighted = index;
        this._label.set_text(index === -1 ? '' : this.icons[index].label.text);
    }

    _removeWindow(window) {
        const index = this.icons.findIndex(icon => icon.window === window);
        if (index === -1)
            return;
        this.icons.splice(index, 1);
        this.removeItem(index);
    }
});

// -------------------- SwitcherRows --------------------
// Puts GridWindowSwitcher in the Shell's Alt+Tab popup in place of its
// row, and gives Up and Down a meaning: one row up or down.
class SwitcherRows {
    constructor() {
        const proto = WindowSwitcherPopup.prototype;
        this._init = proto._init;
        this._keyPressHandler = proto._keyPressHandler;
        const init = this._init;
        const keyPressHandler = this._keyPressHandler;

        proto._init = function (...args) {
            init.apply(this, args);
            const row = this._switcherList;
            const windows = row.windows;
            row.destroy();
            const mode = this._settings.get_enum('app-icon-mode');
            this._switcherList = new GridWindowSwitcher(windows, mode);
            this._items = this._switcherList.icons;
        };

        proto._keyPressHandler = function (keysym, action) {
            const columns = this._switcherList.columns ?? 0;
            if (columns > 0 && (keysym === Clutter.KEY_Up || keysym === Clutter.KEY_Down)) {
                const delta = keysym === Clutter.KEY_Down ? columns : -columns;
                const index = this._selectedIndex + delta;
                if (index >= 0 && index < this._items.length)
                    this._select(index);
                return Clutter.EVENT_STOP;
            }
            return keyPressHandler.call(this, keysym, action);
        };
    }

    destroy() {
        WindowSwitcherPopup.prototype._init = this._init;
        WindowSwitcherPopup.prototype._keyPressHandler = this._keyPressHandler;
    }
}

export default class Glow extends Extension {
    enable() {
        this._glow = CFG.cornerRadius > 0 ? new RoundGlow() : new FrameGlow();

        // The battery features are extras: if the shell layout differs
        // from what they expect, keep the focus glow working regardless.
        if (CFG.batteryIcon || CFG.batteryTooltip) {
            try {
                this._battery = new Battery();
            } catch (e) {
                console.warn(`Glow: battery features disabled: ${e.message}`);
                this._battery = null;
            }
        }

        if (CFG.diskSpace) {
            try {
                this._disk = new DiskSpace();
                if (this._battery) {
                    this._battery.onReady = (drawing, button) =>
                        this._disk?.attachBefore(drawing, button);
                }
            } catch (e) {
                console.warn(`Glow: disk space indicator disabled: ${e.message}`);
                this._disk = null;
            }
        }

        if (CFG.bluetoothColor)
            this._tintBluetooth(0);

        if (CFG.warmMinimized) {
            try {
                this._warmer = new PreviewWarmer();
            } catch (e) {
                console.warn(`Glow: overview preview warming disabled: ${e.message}`);
                this._warmer = null;
            }
        }

        if (CFG.windowCornerRadius > 0) {
            try {
                this._rounded = new RoundedWindows();
            } catch (e) {
                console.warn(`Glow: rounded windows disabled: ${e.message}`);
                this._rounded = null;
            }
        }

        if (CFG.previewRing) {
            try {
                this._ring = new PreviewRing();
            } catch (e) {
                console.warn(`Glow: overview preview ring disabled: ${e.message}`);
                this._ring = null;
            }
        }

        if (CFG.switcherPreviewSize > 0) {
            try {
                this._switcher = new SwitcherPreviews();
            } catch (e) {
                console.warn(`Glow: Alt+Tab preview size disabled: ${e.message}`);
                this._switcher = null;
            }
        }

        if (CFG.switcherRows) {
            try {
                this._switcherRows = new SwitcherRows();
            } catch (e) {
                console.warn(`Glow: Alt+Tab rows disabled: ${e.message}`);
                this._switcherRows = null;
            }
        }

        if (CFG.previewKeys) {
            try {
                this._navigator = new PreviewNavigator();
            } catch (e) {
                console.warn(`Glow: overview key navigation disabled: ${e.message}`);
                this._navigator = null;
            }
        }

        this._focusHandlerId = global.display.connect(
            'notify::focus-window',
            () => this._onFocusChanged()
        );

        this._currentWindow = null;
        this._positionChangedId = 0;
        this._sizeChangedId = 0;
        this._unmanagedId = 0;
        this._settleId = 0;
        this._lastFocusMs = 0;
        this._inBurst = false;

        this._applyFocus();
    }

    disable() {
        this._cancelSettle();
        this._disconnectWindowSignals();
        if (this._focusHandlerId) {
            global.display.disconnect(this._focusHandlerId);
            this._focusHandlerId = 0;
        }
        this._glow?.destroy();
        this._glow = null;
        this._currentWindow = null;
        this._battery?.destroy();
        this._battery = null;
        this._rounded?.destroy();
        this._rounded = null;
        this._warmer?.destroy();
        this._warmer = null;
        this._ring?.destroy();
        this._ring = null;
        this._navigator?.destroy();
        this._navigator = null;
        this._switcher?.destroy();
        this._switcher = null;
        this._switcherRows?.destroy();
        this._switcherRows = null;
        this._disk?.destroy();
        this._disk = null;
        if (this._tintId)
            GLib.Source.remove(this._tintId);
        this._tintId = 0;
        this._bluetoothIcon?.set_style(null);
        this._bluetoothIcon = null;
    }

    // The quick settings build their indicators asynchronously: retry
    // for a few seconds until the Bluetooth one exists.
    _tintBluetooth(attempt) {
        const icon = Main.panel.statusArea.quickSettings?._bluetooth?._indicator;
        if (icon) {
            const [r, g, b] = CFG.bluetoothColor;
            icon.set_style(`color: rgb(${r}, ${g}, ${b});`);
            this._bluetoothIcon = icon;
            return;
        }
        if (attempt < 20) {
            this._tintId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._tintId = 0;
                this._tintBluetooth(attempt + 1);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // Act on the window that holds the focus once it stops moving.
    // Each event cancels the pending one, so a run of focus changes
    // produces a single update at the end.
    _onFocusChanged() {
        const nowMs = GLib.get_monotonic_time() / 1000;
        const gap = nowMs - this._lastFocusMs;
        this._lastFocusMs = nowMs;

        this._cancelSettle();

        // Changes this close together mean windows are being mapped in
        // sequence. Take the glow off screen: following the focus here
        // is what makes it flicker.
        if (gap < CFG.burstGapMs && !this._inBurst) {
            this._inBurst = true;
            this._disconnectWindowSignals();
            this._glow.hide();
        }

        const delay = this._inBurst ? CFG.burstSettleMs : CFG.focusSettleMs;

        this._settleId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                this._settleId = 0;
                this._inBurst = false;
                this._applyFocus();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelSettle() {
        if (this._settleId) {
            GLib.Source.remove(this._settleId);
            this._settleId = 0;
        }
    }

    _applyFocus() {
        const win = global.display.focus_window;
        this._disconnectWindowSignals();

        if (!win || win.is_override_redirect()) {
            this._glow.hide();
            this._currentWindow = null;
            return;
        }

        const windowActor = win.get_compositor_private();
        if (!windowActor) {
            this._glow.hide();
            return;
        }

        // A window still being mapped can report a degenerate frame.
        // The four strips would then overlap and their shadows would
        // add up into a thick blot.
        const rect = win.get_frame_rect();
        if (rect.width < 2 * CFG.stripWidth || rect.height < 2 * CFG.stripWidth) {
            this._glow.hide();
            return;
        }

        this._currentWindow = win;
        this._glow.attachTo(windowActor, win);

        // A closed window is finalized: clear the state here rather
        // than calling disconnect() on it afterwards.
        this._unmanagedId = win.connect(
            'unmanaged',
            () => this._onWindowUnmanaged()
        );

        if (CFG.followMove) {
            this._positionChangedId = win.connect(
                'position-changed',
                () => this._glow.follow(win)
            );
            this._sizeChangedId = win.connect(
                'size-changed',
                () => this._glow.follow(win)
            );
        }
    }

    _onWindowUnmanaged() {
        this._currentWindow = null;
        this._positionChangedId = 0;
        this._sizeChangedId = 0;
        this._unmanagedId = 0;
        this._glow?.hide();
    }

    _disconnectWindowSignals() {
        const win = this._currentWindow;
        this._currentWindow = null;
        if (!win)
            return;

        if (this._positionChangedId) {
            win.disconnect(this._positionChangedId);
            this._positionChangedId = 0;
        }
        if (this._sizeChangedId) {
            win.disconnect(this._sizeChangedId);
            this._sizeChangedId = 0;
        }
        if (this._unmanagedId) {
            win.disconnect(this._unmanagedId);
            this._unmanagedId = 0;
        }
    }
}
