let initialized = false;
const decoder = new TextDecoder(); let buffer = '';
for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk, { stream: true });
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') console.log(JSON.stringify({ id: msg.id, result: { userAgent: 'fixture' } }));
    else if (msg.method === 'initialized') initialized = true;
    else if (msg.id !== undefined) console.log(JSON.stringify(initialized ? { id: msg.id, result: { ok: true } } : { id: msg.id, error: { message: 'Missing handshake' } }));
  }
}
