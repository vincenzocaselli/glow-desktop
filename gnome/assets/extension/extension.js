/* ============================================================
 * Glow — GNOME Shell extension
 * Draws a soft colored aura around the currently focused window.
 * Uses 4 thin strip actors (top, bottom, left, right) projecting
 * a box-shadow halo outward only — no actor under the window, so
 * even transparent windows (terminals, etc.) stay untainted.
 *
 * License: GPL-3.0-or-later
 * ============================================================ */

import Clutter from 'gi://Clutter';
import St from 'gi://St';

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

// -------------------- Extension --------------------
export default class Glow extends Extension {
    enable() {
        this._glow = new FrameGlow();

        this._focusHandlerId = global.display.connect(
            'notify::focus-window',
            () => this._onFocusChanged()
        );

        this._currentWindow = null;
        this._positionChangedId = 0;
        this._sizeChangedId = 0;

        this._onFocusChanged();
    }

    disable() {
        this._disconnectWindowSignals();
        if (this._focusHandlerId) {
            global.display.disconnect(this._focusHandlerId);
            this._focusHandlerId = 0;
        }
        this._glow?.destroy();
        this._glow = null;
        this._currentWindow = null;
    }

    _onFocusChanged() {
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

        this._currentWindow = win;
        this._glow.attachTo(windowActor, win);

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

    _disconnectWindowSignals() {
        if (this._currentWindow) {
            if (this._positionChangedId) {
                this._currentWindow.disconnect(this._positionChangedId);
                this._positionChangedId = 0;
            }
            if (this._sizeChangedId) {
                this._currentWindow.disconnect(this._sizeChangedId);
                this._sizeChangedId = 0;
            }
        }
    }
}
