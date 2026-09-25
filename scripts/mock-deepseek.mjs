// Local stand-in for the DeepSeek Anthropic-compatible endpoint: every reply streams thinking, then text.
// Start DSH with DEEPSEEK_BASE_URL=http://127.0.0.1:<port> and any DEEPSEEK_API_KEY.
import http from 'node:http';

const port = Number(process.env.PORT ?? 5399);
const firstEvent = Number(process.env.FIRST_EVENT_MS ?? 1500);
const thinking = Number(process.env.THINKING_MS ?? 6000);
const text = Number(process.env.TEXT_MS ?? 3000);
const PARTS = 6;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let replies = 0;

http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  if (request.method !== 'POST' || !request.url.endsWith('/v1/messages')) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"type":"error","error":{"type":"not_found_error","message":"mock only serves /v1/messages"}}');
    return;
  }
  const { model } = JSON.parse(body);
  const id = `msg_mock_${++replies}`;
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  response.flushHeaders();
  const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  await sleep(firstEvent);
  send('message_start', { message: { id, type: 'message', role: 'assistant', model, content: [],
    stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  send('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
  for (let n = 0; n < PARTS; n++) {
    send('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: `思考片段 ${n}。` } });
    await sleep(thinking / PARTS);
  }
  send('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'mock' } });
  send('content_block_stop', { index: 0 });
  send('content_block_start', { index: 1, content_block: { type: 'text', text: '' } });
  for (let n = 0; n < PARTS; n++) {
    send('content_block_delta', { index: 1, delta: { type: 'text_delta', text: `回复片段 ${n}。` } });
    await sleep(text / PARTS);
  }
  send('content_block_stop', { index: 1 });
  send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } });
  send('message_stop', {});
  response.end();
}).listen(port, '127.0.0.1', () => console.log(`mock DeepSeek endpoint: http://127.0.0.1:${port}`));
