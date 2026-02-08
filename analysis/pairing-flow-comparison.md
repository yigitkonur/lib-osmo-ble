# Pairing Flow Comparison: node-osmo vs djictl vs DJI Mimo

## DJI Mimo (Ground Truth — Wireshark Capture)

From xaionaro's Wireshark capture:

```
1. [BLE] Subscribe to notifications on handle 0x002d (fff4)
2. [BLE] Device sends status messages (0x000280 = camera status)
3. [BLE] App sends set_pairing_pin (0x400745) via Write Command on handle 0x0030 (fff5)
4. [BLE] Device responds with pairing_status (0xC00745):
   - payload=0x0001: already paired → skip PIN approval
   - payload=0x0002: pairing required → show PIN on screen
5. [BLE] Device sends pairing_pin_approved (0x400746): payload=0x01
6. [BLE] App sends pairing_stage1 (0xC00746): payload=0x00  ← acknowledges approval
7. [BLE] Pairing complete
```

Key observations from Wireshark:
- **Write Command (0x52)** = writeWithoutResponse to **fff5** (handle 0x0030)
- **Notifications** arrive on **fff4** (handle 0x002d)
- Message ID is **Big Endian** in wire format

## djictl (Go Reference Implementation)

```go
// pair.go (reconstructed flow):
1. Connect → discover services → set MTU to 517
2. Subscribe to Receiver characteristic (fff5)
3. Wait for BatteryStatus message (device ready signal)
4. Write [0x01, 0x00] to PairingRequestor (fff4)
5. SendMessage(SetPairingPIN) via Sender (fff3)  // ← WRONG char but may work on their device
   - Target: 0x0702 (App → WiFi)
   - Type: 0x450740
   - Payload: PackString(identifier) + PackString(PIN)
6. Parse response: payload[1] == 0x01 → already paired
7. If not paired: wait for PairingPINApproved (0x460740)
8. Send approval acknowledgment (0xC00746)
```

Key differences from Mimo:
- djictl writes DUML messages to fff3 ("Sender") — this MAY work on Osmo Mobile but does NOT work on Osmo Pocket 3
- djictl waits for BatteryStatus before pairing (node-osmo waits for any DUML message)
- djictl sets MTU to 517 (node-osmo doesn't)

## node-osmo (Fixed Version)

```javascript
1. Scan → connect → discover services
2. Find characteristics fff3, fff4, fff5
3. Subscribe to fff5 notifications (data channel)
4. Subscribe to fff4 notifications (pairing + telemetry)
5. Wait for first DUML message on fff4 (device ready)
6. Write [0x01, 0x00] to fff4 (trigger pairing mode)
7. Wait 200ms
8. Write SetPairingPIN DUML to fff5 (writeWithoutResponse)  // ← KEY FIX
   - Target: 0x0702
   - Type: 0x450740
   - Payload: PackString("001749319286102") + PackString(PIN)
9. Receive pairing_status (0xC00745):
   - payload[1] == 0x01: already paired → proceed
   - payload[1] == 0x02: pairing required → wait
10. Receive pairing_pin_approved (0x400746): payload=0x01
11. Proceed to streaming setup
```

## Comparison Table

| Aspect | DJI Mimo | djictl | node-osmo (fixed) |
|--------|----------|--------|-------------------|
| Write DUML to | fff5 ✅ | fff3 ⚠️ | fff5 ✅ |
| Write method | writeWithoutResponse | write (with response) | writeWithoutResponse ✅ |
| Receive on | fff4 | fff5 | fff4 ✅ |
| Msg ID endianness | Big Endian | Big Endian | Big Endian ✅ |
| Wait for ready | camera status | BatteryStatus | any DUML message |
| MTU negotiation | unknown | 517 | none |
| Pairing trigger | unknown | [0x01,0x00] → fff4 | [0x01,0x00] → fff4 ✅ |

## Open Questions

1. **MTU**: Does setting MTU to 517 improve reliability? We didn't need it for success.
2. **Stage1 acknowledgment**: DJI Mimo sends 0xC00746 after approval. Our code doesn't. Is it needed?
3. **BatteryStatus wait**: djictl waits specifically for BatteryStatus. We accept any message. Does this matter?
4. **fff3 on other devices**: Does fff3 work for DUML writes on Osmo Mobile but not Pocket 3?
