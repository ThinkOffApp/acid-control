# touchosc-mvp

Phone web UI → Node bridge → virtual MIDI → Ableton (or any DAW that reads CoreMIDI).

A minimal TouchOSC-style controller for the laptop you're already running. No
app store install, no Bluetooth pairing — open a URL on your phone, it controls
your DAW. Designed for live keyboard / fader / pad control during a session,
not for anything fancy.

## Hardware / OS

- macOS (the bridge uses Apple CoreMIDI to expose a virtual port)
- Phone and laptop on the same Wi-Fi
- Node 18+

## One-time setup

```bash
git clone https://github.com/ThinkOffApp/touchosc-mvp
cd touchosc-mvp
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

Open that URL on your phone — the control surface (faders, pads, on-screen
keyboard) loads. Plays nice with both the placeholder UI in `index.html` and
any drop-in replacement that speaks the JSON schema below.

## Wire it up in Ableton

1. Settings → Link/Tempo/MIDI.
2. Find the `touch-control` input row (it appears once the bridge is running).
3. Turn on **Track** and **Remote**.
4. In the session, hit `Cmd+M` (MIDI Map mode), tap a fader on the phone, then
   click any Ableton parameter. Repeat for each control. `Cmd+M` again to exit.

The keyboard area sends regular MIDI notes (60–72 = C4–C5), so you can route
them by arming a track with `touch-control` as MIDI From — no MIDI Learn
needed, the keyboard is just a normal MIDI keyboard from Ableton's POV.

## JSON message schema (UI ↔ bridge)

The phone UI talks to the bridge over WebSocket. Each message is a single
JSON object on its own frame:

```jsonc
// continuous controller — fader / knob / XY axis
{"type": "cc",   "channel": 1, "cc":  10, "value": 0..127}

// note on / off — pad or keyboard key (value=0 ⇒ note off)
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
- `index.html` — the phone UI (faders, pads, transport buttons, on-screen
  keyboard). Replaceable; anything that speaks the schema above is fine.
- `public/` — the bridge serves files from this directory at `/`.

## Privacy / scope

- The bridge binds `0.0.0.0:8080` so phones on your Wi-Fi can reach it. Set
  `HOST=127.0.0.1 node bridge.js` to lock it to local-only.
- No authentication. The point is "anyone on my Wi-Fi can play my synth";
  if you need stricter, put it behind a Tailscale magic-DNS host or run the
  bridge on `127.0.0.1` only and tunnel from the phone via SSH.

## Status

MVP. Eight faders + eight pads + a one-octave keyboard work today. Layouts are
hard-coded in `index.html` for now. Custom layout editor + bidirectional
feedback (DAW → fader-catches-up) are explicit follow-ups.
