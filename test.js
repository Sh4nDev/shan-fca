"use strict";

/**
 * shan-fca regression tests.
 *
 * Everything is required with plain relative paths (./utils.js, ./src/...), so
 * this file runs from any clone of the repository - Windows, Linux, GitHub
 * Actions - and it is never published to npm (see the "files" whitelist in
 * package.json).
 *
 * What it protects:
 *   1. decodeClientPayload  - emoji (4-byte UTF-8) payloads, base64 / JSON
 *                             payloads, and "return null instead of throwing".
 *   2. formatDeltaMessage   - the bot must always receive the FULL command body.
 *   3. sendMessage          - never a contentless payload (the one Messenger
 *                             renders as "This message isn't available on this
 *                             app version."), valid reply ids only.
 *   4. listenMqtt           - one malformed delta must not swallow the rest of
 *                             the /t_ms batch (that lost the user's command).
 *
 * Run with: npm test
 */

const { EventEmitter } = require("events");

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log("PASS  " + name); }
    else { fail++; console.log("FAIL  " + name + (extra !== undefined ? "  -> " + extra : "")); }
}

const utils = require("./utils.js");

/* ---------- 1. decodeClientPayload ---------- */
const payloadJson = JSON.stringify({ deltas: [{ reaction: "\uD83D\uDE00", body: "(help \uD83D\uDE00" }] });
const payloadBytes = Array.from(Buffer.from(payloadJson, "utf8"));

let decoded = null;
try { decoded = utils.decodeClientPayload(payloadBytes); } catch (e) { decoded = "threw: " + e.message; }
check("decodeClientPayload decodes 4-byte UTF-8 (emoji) payload",
    decoded && decoded.deltas && decoded.deltas[0].body === "(help \uD83D\uDE00", JSON.stringify(decoded));

check("decodeClientPayload accepts a base64 string payload",
    (utils.decodeClientPayload(Buffer.from(payloadJson, "utf8").toString("base64")) || {}).deltas !== undefined);

check("decodeClientPayload accepts an already decoded JSON string",
    (utils.decodeClientPayload(payloadJson) || {}).deltas[0].body === "(help \uD83D\uDE00");

check("decodeClientPayload returns null instead of throwing",
    utils.decodeClientPayload([1, 2, 3, 4, 5, 6]) === null);

/* ---------- 2. formatDeltaMessage ---------- */
const withMeta = utils.formatDeltaMessage({
    delta: {
        body: "(help",
        messageMetadata: { threadKey: { otherUserFbId: "12345" }, actorFbId: "67890", messageId: "m1", timestamp: 1 },
        data: { prng: JSON.stringify([{ i: "999", o: 0, l: 5 }]) }
    }
});
check("formatDeltaMessage keeps the full command body", withMeta.body === "(help", JSON.stringify(withMeta.body));
check("formatDeltaMessage extracts mentions", withMeta.mentions["999"] === "(help", JSON.stringify(withMeta.mentions));
check("formatDeltaMessage maps the DM thread/sender", withMeta.threadID === "12345" && withMeta.senderID === "67890",
    withMeta.threadID + "/" + withMeta.senderID);

let noMeta = null;
try { noMeta = utils.formatDeltaMessage({ delta: { body: "(help" } }); } catch (e) { noMeta = "threw: " + e.message; }
check("formatDeltaMessage does not throw when messageMetadata/threadKey is missing",
    noMeta && noMeta.body === "(help" && noMeta.threadID === "", JSON.stringify(noMeta));

let oddBody = null;
try {
    oddBody = utils.formatDeltaMessage({
        delta: {
            body: ["(he", "lp"],
            messageMetadata: { threadKey: { otherUserFbId: "1" }, actorFbId: 2, messageId: "m" },
            data: { prng: "{ this is not json" }
        }
    });
} catch (e) { oddBody = "threw: " + e.message; }
check("formatDeltaMessage survives a non-string body and a broken prng blob",
    oddBody && oddBody.body === "(help", JSON.stringify(oddBody));

const textOnly = utils.formatDeltaMessage({
    delta: { text: "(help", messageMetadata: { threadKey: { otherUserFbId: "1" }, actorFbId: 2, messageId: "m" } }
});
check("formatDeltaMessage falls back to delta.text", textOnly.body === "(help", JSON.stringify(textOnly));

/* ---------- 3. sendMessage MQTT payload ---------- */
class FakeMqtt extends EventEmitter {
    constructor() { super(); this.sent = []; }
    end() { }
    subscribe() { }
    publish(topic, payload, opts, cb) {
        const parsed = JSON.parse(payload);
        this.sent.push(parsed);
        if (typeof cb === "function") cb(null, {});
        setTimeout(() => {
            this.emit("message", "/ls_resp", Buffer.from(JSON.stringify({
                request_id: parsed.request_id,
                payload: JSON.stringify({ step: [5, ["replaceOptimsiticMessage", null, "mid.sent1"]] })
            })));
        }, 5);
        return true;
    }
}

const ctx = { mqttClient: null, userID: "1", globalOptions: {}, config: {} };
const api = {
    sendTypingIndicator: () => Promise.resolve(),
    OldMessage: () => { throw new Error("legacy HTTP fallback must not be used here"); }
};
const sendMessage = require("./src/sendMessage.js")({}, api, ctx);
// the /ls_req payload is double-stringified (content.payload is a JSON string and
// each task payload inside it is a JSON string too)
const taskOf = (client) => JSON.parse(JSON.parse(client.sent[0].payload).tasks[0].payload);

/* ---------- 4. /t_ms batch protection (listenMqtt) ---------- */
// Stub the mqtt package BEFORE loading listenMqtt so no real connection is made;
// the stub is injected through Module._load, so it works in every environment.
const Module = require("module");
const origLoad = Module._load;
const fakeClient = new FakeMqtt();
Module._load = function (request) {
    if (request === "mqtt") {
        return { MqttClient: function () { return fakeClient; }, connect: function () { return fakeClient; } };
    }
    return origLoad.apply(this, arguments);
};

const listenCtx = {
    userID: "1", i_userID: "1", region: "PRN", lastSeqId: "1", syncToken: null,
    firstListen: true,
    globalOptions: { selfListen: false, listenEvents: true, autoMarkRead: false, autoMarkDelivery: false, emitReady: false, autoReconnect: false },
    jar: { getCookies: () => [], setCookie: () => { } },
    config: {}, threadTypes: {}
};
const listenFactory = require("./src/listenMqtt.js");
const listen = listenFactory(
    { post: () => Promise.resolve([]), get: () => Promise.resolve({ body: "" }), postFormData: () => Promise.resolve({}) },
    api, listenCtx
);

// the batch: a malformed ClientPayload reply delta FIRST, the user's real message
// SECOND - before the fix the first one threw out of the delta loop and the
// user's command was lost (and the whole bot process could crash).
const brokenClientPayload = {
    class: "ClientPayload",
    payload: Array.from(Buffer.from(JSON.stringify({
        deltas: [{ deltaMessageReply: { message: { body: "no messageMetadata here" } } }]
    }), "utf8"))
};
const validMessageDelta = {
    class: "NewMessage",
    body: "(help",
    messageMetadata: {
        threadKey: { otherUserFbId: "555000111" },
        actorFbId: "777000222",
        messageId: "mid.valid1",
        timestamp: Date.now()
    }
};

(async () => {
    const delivered = [];

    ctx.mqttClient = new FakeMqtt();
    await sendMessage("", "12345", function () { });
    const emptyTask = taskOf(ctx.mqttClient);
    check("an empty message is sent with a renderable body (never text: null)",
        emptyTask.text === "\u200b", JSON.stringify(emptyTask));

    ctx.mqttClient = new FakeMqtt();
    await sendMessage("(help", "12345", function () { }, "not a real id");
    const textTask = taskOf(ctx.mqttClient);
    check("a text message keeps its full body", textTask.text === "(help", JSON.stringify(textTask.text));
    check("an invalid reply id is not attached", !textTask.reply_metadata);

    ctx.mqttClient = new FakeMqtt();
    await sendMessage({ body: "ok", replyToMessage: "mid.$abc123" }, "12345", function () { });
    const replyTask = taskOf(ctx.mqttClient);
    check("a valid reply id is attached",
        !!replyTask.reply_metadata && replyTask.reply_metadata.reply_source_id === "mid.$abc123",
        JSON.stringify(replyTask.reply_metadata));

    ctx.mqttClient = new FakeMqtt();
    await sendMessage({ emoji: String.fromCodePoint(0x1F600) }, "12345", function () { });
    const emojiTask = taskOf(ctx.mqttClient);
    check("a plain emoji message does not carry hot_emoji_size",
        emojiTask.text === String.fromCodePoint(0x1F600) && emojiTask.hot_emoji_size === undefined,
        JSON.stringify(emojiTask));

    listen(function (err, ev) {
        if (err) return;
        delivered.push(ev);
    });
    fakeClient.emit("connect");
    fakeClient.emit("message", "/t_ms", Buffer.from(JSON.stringify({
        firstDeltaSeqId: "2",
        syncToken: "t",
        deltas: [brokenClientPayload, validMessageDelta]
    })));

    setTimeout(() => {
        const userMsg = delivered.filter((e) => e && e.type === "message" && e.body === "(help");
        check("a broken delta does not swallow the rest of the /t_ms batch", userMsg.length === 1,
            JSON.stringify(delivered.map((d) => d && (d.type + ":" + d.body))));
        check("the user's command body arrives intact", userMsg.length === 1 && userMsg[0].body === "(help");
        check("sender / thread ids are mapped",
            userMsg.length === 1 && userMsg[0].senderID === "777000222" && userMsg[0].threadID === "555000111",
            userMsg.length ? JSON.stringify({ s: userMsg[0].senderID, t: userMsg[0].threadID }) : "no message");

        console.log("\n" + pass + " passed, " + fail + " failed");
        process.exit(fail ? 1 : 0);
    }, 150);
})().catch((e) => { console.log("UNEXPECTED ERROR: " + (e && e.stack ? e.stack : e)); process.exit(2); });
