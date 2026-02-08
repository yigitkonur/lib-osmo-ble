# False Positive Analysis: Experiment #4

## What Happened

After fixing ByteBuf bugs #1 and #2 (but NOT #3), the node-osmo state machine appeared to work perfectly:

```
State change 0 -> 1   (idle → discovering)
State change 1 -> 2   (→ connecting)
State change 3 -> 4   (→ checkingIfPaired)
State change 4 -> 5   (→ pairing)
State change 5 -> 6   (→ preparingStream)
State change 6 -> 7   (→ preparingStream2)
State change 7 -> 8   (→ settingUpWifi)
State change 8 -> 10  (→ startingStream)
State change 10 -> 11 (→ streaming)
```

271 lines. Zero errors. Zero crashes. It looked like success.

## Why It Was False

### Problem 1: All Messages Decoded to Same Type

ByteBuf bug #3 (`getUint24()` not adding `super.byteOffset`) caused every message's type field to be decoded from the start of the 8KB buffer pool instead of from the actual message data. Result: ALL messages decoded to `type=1794` (0x000702).

### Problem 2: Response Checks Were Disabled

The codebase had response-checking code commented out:
```javascript
// Originally checking transaction ID:
if (response.id !== pairTransactionId) {
    // return;    ← COMMENTED OUT
}
```

Every state handler accepted any message as a valid response, because the `return` that would reject non-matching messages was commented out.

### Problem 3: Telemetry Matched Pairing

With all messages looking the same (type=1794), the pairing handler received a gimbal status message (cmdSet=0x04, cmdId=0x1C) with payload byte `0x48`. Since the response check was disabled, this was treated as "pairing approved."

`0x48` is ASCII 'H' — it was probably a gimbal heading value, not a pairing response.

## Message Type Census (Experiment #4 vs #14)

### Experiment #4 (False Positive)
```
type=1794: 100% of messages (wrong — all decoded to same type)
```

### Experiment #14 (Real Success)
```
cmdSet=0x04 cmdId=0x05: 561  (gimbal)
cmdSet=0x04 cmdId=0x27: 561  (keepalive)
cmdSet=0x02 cmdId=0x80: 561  (camera)
cmdSet=0x07 cmdId=0x45: 1    (pairing response!)
cmdSet=0x07 cmdId=0x46: 17   (pairing approved!)
cmdSet=0x07 cmdId=0x47: 1    (WiFi connected!)
```

## The Lesson

A state machine that advances on any input will always reach its final state. The absence of errors doesn't mean the protocol is working — it means validation is missing.

**How to detect this**:
1. **Count unique message types** — if there's only one, your decoder is broken
2. **Verify command responses exist** — if you send a command and get zero responses with matching cmdSet/cmdId, the device isn't processing it
3. **Check the RTMP server** — the ultimate validation is whether actual video data arrives
4. **Never comment out validation** — use a flag/mode instead so it's explicit
