# Message ID Endianness Analysis

## The Bug

The DUML message format has a 2-byte Message ID field at offset 6-7. node-osmo encoded it as Little Endian:

```javascript
// Original (WRONG)
Buffer.from([this.id & 0xff, (this.id >> 8) & 0xff])  // LE: 0x8092 → [0x92, 0x80]

// Fixed (CORRECT)  
Buffer.from([(this.id >> 8) & 0xff, this.id & 0xff])   // BE: 0x8092 → [0x80, 0x92]
```

## Evidence

### Wireshark Dissector

The xaionaro Wireshark dissector reads the message ID as Big Endian:

```c
proto_tree_add_item(st, hf_dji_mimo_ble_message_id, tvb, offset, 2, ENC_BIG_ENDIAN);
```

### Wireshark Capture Samples

From actual DJI Mimo traffic, message IDs in samples:
- `0x0400` — wire bytes `04 00` (BE reading)
- `0x72AA` — wire bytes `72 AA`
- `0xFCAB` — wire bytes `FC AB`
- `0x5520` — wire bytes `55 20`
- `0xB0BB` — wire bytes `B0 BB`
- `0xFFAB` — wire bytes `FF AB`

None of these have the 0x80 pattern in the MSB that our `0x8092` has when written in BE as `80 92`, but message IDs are just sequence counters — the specific value shouldn't matter.

### Parser Symmetry

Both encode and decode must use the same byte order:

```javascript
// Encode (message.ts line 55)
Buffer.from([(this.id >> 8) & 0xff, this.id & 0xff])

// Decode (message.ts line 97)
reader.readUint16(false)  // false = Big Endian in ByteBuf
```

## Why It Matters

While the message ID is technically just a sequence counter (the device echoes it back in responses), using the wrong byte order means:
1. Our message doesn't match any known-good traffic pattern
2. The device might have validation logic that rejects unfamiliar byte patterns
3. Response matching breaks if the echo comes back in the expected byte order

In practice, fixing this alone didn't resolve the issue (the fff5 bug was the real blocker), but it's still a correctness fix that ensures our messages match the protocol spec exactly.
