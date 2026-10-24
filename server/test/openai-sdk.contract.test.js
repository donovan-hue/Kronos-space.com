const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { createOpenRouterClient } = require("../src/config/openrouter");

// Exercise the installed SDK, not a mocked client, without provider credentials.
test("OpenAI SDK preserves chat, image and speech wire contracts", async (t) => {
  const requests = [];
  const audio = Buffer.from("fixture-audio");
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: JSON.parse(Buffer.concat(chunks).toString())
    });
    if (req.url === "/v1/audio/speech") {
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      res.end(audio);
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(req.url === "/v1/chat/completions"
      ? { choices: [{ message: { content: "fixture-chat" } }] }
      : { data: [{ b64_json: "fixture-image" }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const client = createOpenRouterClient({
    apiKey: "fixture-not-a-real-key",
    timeout: 2000,
    env: {
      OPENROUTER_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
      CLIENT_URL: "https://example.test"
    }
  });
  const chatBody = { model: "fixture-chat", messages: [{ role: "user", content: "Hello" }] };
  const imageBody = { model: "fixture-image", prompt: "A star", response_format: "b64_json" };
  const speechBody = { model: "tts-1", voice: "alloy", input: "Hello" };
  const chat = await client.chat.completions.create(chatBody);
  const image = await client.images.generate(imageBody);
  const speech = await client.audio.speech.create(speechBody);
  assert.equal(chat.choices[0].message.content, "fixture-chat");
  assert.equal(image.data[0].b64_json, "fixture-image");
  assert.deepEqual(Buffer.from(await speech.arrayBuffer()), audio);
  assert.deepEqual(requests.map(({ url }) => url), [
    "/v1/chat/completions", "/v1/images/generations", "/v1/audio/speech"
  ]);
  assert.deepEqual(requests.map(({ body }) => body), [chatBody, imageBody, speechBody]);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.headers.authorization, "Bearer fixture-not-a-real-key");
    assert.equal(request.headers["http-referer"], "https://example.test");
    assert.equal(request.headers["x-title"], "Kronos Space");
  }
  assert.equal(client.maxRetries, 0);
  assert.equal(client.timeout, 2000);
});
