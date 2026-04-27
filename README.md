# acid-control

Phone web UI → Node bridge → virtual MIDI → Ableton (or any DAW that reads
CoreMIDI).

A minimal phone-as-controller stack for live sessions: faders, pads, an
octave-aware piano keyboard, track launchers, and an optional embedded
[muikku.app](https://muikku.app) visualizer panel. No app store install, no
Bluetooth pairing — open a URL on your phone, it controls your DAW.

## Hardware / OS

- macOS (the bridge uses Apple CoreMIDI to expose a virtual port)
- Phone and laptop on the same Wi-Fi
- Node 18+

## One-time setup

```bash
git clone https://github.com/ThinkOffApp/acid-control
cd acid-control
npm install
```

## Run

```bash
node bridge.js
```

The bridge prints the LAN URLs that phones on the same Wi-Fi can reach, e.g.

```
[http] reachable from phones on same Wi-Fi at:
         http://192.168.0.232:8080/
```

Open that URL on your phone — the control surface (faders, track launchers,
pads, octave-aware keyboard, optional visualizer) loads.

## Wire it up in Ableton

1. Settings → Link/Tempo/MIDI.
2. Find the `acid-control` input row (it appears once the bridge is running).
3. Turn on **Track** and **Remote**.
4. In the session, hit `Cmd+M` (MIDI Map mode), tap a fader on the phone, then
   click any Ableton parameter. Repeat for each control. `Cmd+M` again to exit.

Notes from the keyboard / pads / track launchers send regular MIDI notes, so
you can route them by arming a track with `acid-control` as MIDI From — no
MIDI Learn needed for those, the keyboard is just a normal MIDI keyboard from
Ableton's POV.

If you have an existing project with controls already MIDI-Learned to the
older `touch-control` port name, run with `MIDI_PORT_NAME=touch-control node
bridge.js` to keep those mappings working until you re-MIDI-Learn against the
new name.

## What the UI sends (per control)

| Control          | MIDI message                          |
|------------------|---------------------------------------|
| Faders (6)       | CC 1–6 on channel 1                   |
| Pads (8)         | Note 36–43 on channel 1               |
| Track launchers  | Note 36–45 on channel 2               |
| Keyboard (12)    | Note 60–72 on channel 1, octave-shift |
| OCT− / OCT+      | UI-only, shifts pads + keyboard ±12   |
| VIZ              | UI-only, embeds muikku.app            |

All notes/CCs are remappable via Ableton MIDI Learn.

## JSON message schema (UI ↔ bridge)

The phone UI talks to the bridge over WebSocket. Each message is a single
JSON object on its own frame:

```jsonc
// continuous controller — fader / knob / XY axis
{"type": "cc",   "channel": 1, "cc":  10, "value": 0..127}

// note on / off — pad, track-launcher, or keyboard key (value=0 ⇒ note off)
{"type": "note", "channel": 1, "note": 60, "value": 0..127}

// pitch bend — XY axis, modwheel-as-bender etc.
{"type": "pb",   "channel": 1, "value": -8192..8191}

// optional heartbeat (bridge replies {"type":"pong","t":<ms>})
{"type": "ping"}
```

The bridge clamps and sanity-checks every field, drops malformed messages
silently, and never crashes on bad input.

## Files

- `bridge.js` — Node WebSocket-to-MIDI bridge + static-file server
- `package.json` — dependencies (`ws`, `easymidi`)
- `public/index.html` — the phone UI (faders, track launchers, pads, octave
  switcher, on-screen keyboard, optional visualizer panel)
- `public/` — the bridge serves files from this directory at `/`.

## Privacy / scope

- The bridge binds `0.0.0.0:8080` so phones on your Wi-Fi can reach it. Set
  `HOST=127.0.0.1 node bridge.js` to lock it to local-only.
- No authentication. The point is "anyone on my Wi-Fi can play my synth";
  if you need stricter, put it behind a Tailscale magic-DNS host or run the
  bridge on `127.0.0.1` only and tunnel from the phone via SSH.

## Status

MVP. Faders + pads + track launchers + octave-aware keyboard + visualizer
work today. Layouts are hard-coded in `public/index.html` for now. Custom
layout editor + bidirectional feedback (DAW → fader-catches-up) and
sing-to-MIDI capture are explicit follow-ups.
