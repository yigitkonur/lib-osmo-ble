# BLE Characteristic Mapping: fff3 vs fff4 vs fff5

## The Critical Discovery

The DJI Osmo Pocket 3 exposes three characteristics under service `fff0`:

| UUID | Properties | Actual Purpose |
|------|-----------|----------------|
| **fff3** | read, write, notify, indicate | Unknown — NOT for DUML commands |
| **fff4** | read, write, notify, indicate | Pairing trigger + receives ALL notifications |
| **fff5** | read, **writeWithoutResponse**, notify, indicate | **DUML command writes** |

### What Was Wrong

The node-osmo library (and djictl) named these:
- fff3 = "Sender" (implying: where you SEND messages)
- fff4 = "PairingRequestor"  
- fff5 = "Receiver" (implying: where you RECEIVE messages)

These names are **misleading**. The actual DJI Mimo app:
- **Writes DUML commands to fff5** using `Write Command (0x52)` = write-without-response
- **Receives notifications on fff4** via `Handle Value Notification (0x1b)` on handle `0x002d`

### Evidence from Wireshark

From xaionaro's Wireshark capture of the DJI Mimo app:

```
Frame XXX: Write Command
    Opcode: Write Command (0x52)           ← writeWithoutResponse
    Handle: 0x0030
        [UUID: 0xfff5]                     ← fff5!
    Value: 551104920208ffab40028e00011c003bc8

Frame XXX: Handle Value Notification
    Opcode: Handle Value Notification (0x1b)
    Handle: 0x002d                         ← maps to fff4 (or device-specific)
    Value: 554904930102...
```

### Why fff3 "Works" But Doesn't

fff3 has the `write` property (write-with-response). You CAN write to it — the BLE stack confirms the write. But the DJI firmware apparently doesn't process DUML messages received on fff3.

This is the worst kind of bug: the write succeeds at the BLE level, no errors appear, but the device simply ignores the data.

### Characteristic Properties Verification Script

```javascript
import noble from '@stoprocent/noble';
noble.on('stateChange', s => { if (s === 'poweredOn') noble.startScanningAsync([], false); });
noble.on('discover', async p => {
  if (!p.advertisement?.localName?.includes('Osmo')) return;
  noble.stopScanning();
  await p.connectAsync();
  const services = await new Promise(r => p.discoverServices([], (e,s) => r(s)));
  for (const svc of services) {
    const chars = await new Promise(r => svc.discoverCharacteristics([], (e,c) => r(c)));
    for (const c of chars)
      console.log(c.uuid, JSON.stringify(c.properties));
  }
  await p.disconnectAsync();
  process.exit(0);
});
```

Output on Osmo Pocket 3:
```
fff3 ["read","write","notify","indicate"]
fff4 ["read","write","notify","indicate"]
fff5 ["read","writeWithoutResponse","notify","indicate"]
```

### Data Flow Summary

```
App → Device (commands):
  App writes DUML message to fff5 (writeWithoutResponse)
  
App → Device (pairing):
  App writes [0x01, 0x00] to fff4 (write with response)

Device → App (all data):
  Device sends notifications on fff4
  (fff5 notifications: none observed on Osmo Pocket 3)
```

### Implications for Other DJI Devices

Other DJI cameras (Osmo Mobile, Action, etc.) may have different characteristic mappings. Always verify by:
1. Checking characteristic properties with the script above
2. Looking for `writeWithoutResponse` — that's likely the command channel
3. Testing with a known-good DUML message and verifying a response arrives
