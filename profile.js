// ProCheckout stores its JSON-encoded player list as the root Data object in an Apple property list.
export function readPlayers(bytes) {
  const decode = new TextDecoder();
  let json;
  if (decode.decode(bytes.slice(0, 8)) === "bplist00") {
    const trailer = bytes.length - 32;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const integer = (offset, size) => {
      let value = 0;
      for (let i = 0; i < size; i++) value = value * 256 + view.getUint8(offset + i);
      if (!Number.isSafeInteger(value)) throw Error("Ongeldig spelersprofiel.");
      return value;
    };
    const offsetSize = bytes[trailer + 6];
    const root = integer(trailer + 16, 8);
    let pos = integer(integer(trailer + 24, 8) + root * offsetSize, offsetSize);
    const tag = bytes[pos++];
    if ((tag >> 4) !== 4) throw Error("Onbekend profieltype.");
    let length = tag & 15;
    if (length === 15) {
      const sizeTag = bytes[pos++];
      if ((sizeTag >> 4) !== 1) throw Error("Ongeldige profiellengte.");
      const size = 2 ** (sizeTag & 15);
      length = integer(pos, size);
      pos += size;
    }
    json = decode.decode(bytes.slice(pos, pos + length));
  } else {
    const data = decode.decode(bytes).match(/<data>([\s\S]*?)<\/data>/);
    if (!data) throw Error("Onbekend spelersprofiel.");
    json = decode.decode(Uint8Array.from(atob(data[1]), c => c.charCodeAt(0)));
  }
  const players = JSON.parse(json);
  if (!Array.isArray(players)) throw Error("Ongeldige spelerslijst.");
  return players;
}
export function writePlayers(players) {
  const bytes = new TextEncoder().encode(JSON.stringify(players));
  const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
  return new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><data>' + encoded + '</data></plist>');
}
