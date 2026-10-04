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

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
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
    batteryFont: 'Inter SemiBold',
    batteryIconWidth: 30,
    batteryIconHeight: 15,

    // Fill colors (r, g, b) and the thresholds, in percent, below which
    // the low and critical colors apply.
    batteryColor: [46, 160, 67],
    batteryColorLow: [230, 160, 20],
    batteryColorCritical: [220, 50, 50],
    batteryLow: 20,
    batteryCritical: 10,
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
    },
    it: {
        timeLeft: t => `Autonomia: ${t}`,
        estimating: 'A batteria, stima in corso',
        untilFull: t => `Carica completa tra ${t}`,
        charging: 'In carica',
        full: 'Carica completa',
        paused: 'In rete, carica in pausa',
        battery: 'Batteria',
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
            this._drawing = new St.DrawingArea({
                style: `width: ${CFG.batteryIconWidth}px; height: ${CFG.batteryIconHeight}px;`,
                y_align: Clutter.ActorAlign.CENTER,
            });
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
    }

    // Swap the stock icon for the drawn one while a battery is present.
    // The stock icon keeps its place in the layout, shrunk to nothing:
    // hiding it would hide the whole indicator, whose visibility the
    // shell derives from its icons.
    _sync() {
        const present = this._proxy?.IsPresent;
        if (this._drawing) {
            this._drawing.visible = !!present;
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

    _restoreIcon() {
        this._icon?.set_width(-1);
        if (this._icon)
            this._icon.opacity = 255;
    }

    _paint(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const fg = area.get_theme_node().get_foreground_color();
        const p = this._proxy;
        const pct = Math.max(0, Math.min(100, Math.round(p?.Percentage ?? 0)));
        const plugged = p && [UP_CHARGING, UP_FULLY_CHARGED, UP_PENDING_CHARGE]
            .includes(p.State);

        const line = 1.2 * scale;
        const nubW = 2 * scale;
        const bodyW = w - nubW - line;
        const bodyH = h - line;
        const x0 = line / 2;
        const y0 = line / 2;

        // Outline, in the panel's text color so it follows the theme.
        cr.setSourceRGBA(fg.red / 255, fg.green / 255, fg.blue / 255, fg.alpha / 255);
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

        // Percentage, and a bolt when on mains power. Two-tone, with no
        // outline: white where it sits on the fill, the panel's text
        // color where it sits on the empty part.
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
            layout.set_text(`${pct}`, -1);

            const boltW = plugged ? innerH * 0.5 : 0;
            const gap = plugged ? 1 * scale : 0;
            const room = innerW - 2 * scale - boltW - gap;
            // Digits as tall as about 70% of the inner height.
            let px = innerH * 0.95;
            setSize(px);
            let [ink] = layout.get_pixel_extents();
            px *= innerH * 0.7 / ink.height;
            setSize(px);
            [ink] = layout.get_pixel_extents();
            // "100" next to the bolt does not fit at full size: shrink it.
            if (ink.width > room) {
                setSize(px * room / ink.width);
                [ink] = layout.get_pixel_extents();
            }
            const total = boltW + gap + ink.width;
            const left = x0 + pad + (innerW - total) / 2;
            const textX = left + boltW + gap - ink.x;
            const textY = y0 + pad + (innerH - ink.height) / 2 - ink.y;

            const marks = () => {
                if (plugged) {
                    const top = y0 + pad + innerH * 0.1;
                    const bot = y0 + pad + innerH * 0.9;
                    const mid = (top + bot) / 2;
                    cr.newPath();
                    cr.moveTo(left + boltW * 0.65, top);
                    cr.lineTo(left, mid + innerH * 0.06);
                    cr.lineTo(left + boltW * 0.45, mid + innerH * 0.06);
                    cr.lineTo(left + boltW * 0.35, bot);
                    cr.lineTo(left + boltW, mid - innerH * 0.06);
                    cr.lineTo(left + boltW * 0.55, mid - innerH * 0.06);
                    cr.closePath();
                    cr.fill();
                }
                cr.moveTo(textX, textY);
                PangoCairo.show_layout(cr, layout);
            };

            const split = x0 + pad + fillW;
            cr.save();
            cr.rectangle(split, 0, w - split, h);
            cr.clip();
            cr.setSourceRGBA(fg.red / 255, fg.green / 255, fg.blue / 255, fg.alpha / 255);
            marks();
            cr.restore();

            cr.save();
            cr.rectangle(0, 0, split, h);
            cr.clip();
            cr.setSourceRGBA(1, 1, 1, 1);
            marks();
            cr.restore();
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

// -------------------- Extension --------------------
export default class Glow extends Extension {
    enable() {
        this._glow = new FrameGlow();

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
