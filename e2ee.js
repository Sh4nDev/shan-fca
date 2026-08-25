"use strict";

var log    = require("npmlog");
var path   = require("path");
var urlMod = require("url");
var http   = require("http");
var crypto = require("crypto");
var stream = require("stream");

function isE2EEChatJid(value) {
  return typeof value === "string" && value.indexOf("@") !== -1;
}

var _mediaCache  = new Map();
var _mediaServer = null;
var _mediaPort   = null;

function _cleanExpired() {
  var now = Date.now();
  _mediaCache.forEach(function (entry, id) {
    if (entry.expiry < now) _mediaCache.delete(id);
  });
}

function _startMediaServer() {
  if (_mediaServer && _mediaPort) return Promise.resolve(_mediaPort);
  return new Promise(function (resolve, reject) {
    var s = http.createServer(function (req, res) {
      var id    = req.url.replace(/^\/e2ee\//, "").split("?")[0];
      var entry = _mediaCache.get(id);
      if (!entry) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, {
        "Content-Type"  : entry.mimeType || "application/octet-stream",
        "Content-Length": entry.buffer.length,
        "Cache-Control" : "no-cache"
      });
      res.end(entry.buffer);
    });
    s.listen(0, "127.0.0.1", function () {
      _mediaPort   = s.address().port;
      _mediaServer = s;
      resolve(_mediaPort);
    });
    s.on("error", reject);
  });
}

async function storeMedia(buffer, mimeType) {
  var port = await _startMediaServer();
  _cleanExpired();
  var id = crypto.randomBytes(10).toString("hex");
  _mediaCache.set(id, {
    buffer  : buffer,
    mimeType: mimeType || "application/octet-stream",
    expiry  : Date.now() + 10 * 60 * 1000
  });
  return "http://127.0.0.1:" + port + "/e2ee/" + id;
}

var _dynamicImport = null;
function _getDynamicImport() {
  if (!_dynamicImport)
    _dynamicImport = new Function("specifier", "return import(specifier);");
  return _dynamicImport;
}

var _E2EE_LIB_URL = urlMod.pathToFileURL(
  path.join(__dirname, "shan", "index.mjs")
).href;

// Polyfill File / Blob for Node < 20 before the ESM bundle initialises
(function _polyfillFileGlobal() {
  try {
    if (typeof globalThis.File === "undefined") {
      var b = require("buffer");
      if (b && typeof b.File === "function") {
        globalThis.File = b.File;
      } else {
        // Minimal File polyfill for older Node versions
        globalThis.File = class File {
          constructor(bits, name, options = {}) {
            this.name = name || "";
            this.lastModified = options.lastModified || Date.now();
            this.type = options.type || "";
            this.size = 0;
            if (Array.isArray(bits)) {
              bits.forEach(bit => {
                if (typeof bit === "string") this.size += bit.length;
                else if (bit && bit.size) this.size += bit.size;
                else if (bit && bit.length) this.size += bit.length;
              });
            }
          }
        };
      }
    }
    if (typeof globalThis.Blob === "undefined") {
      var b2 = require("buffer");
      if (b2 && typeof b2.Blob === "function") {
        globalThis.Blob = b2.Blob;
      } else {
        // Minimal Blob polyfill for older Node versions
        globalThis.Blob = class Blob {
          constructor(bits, options = {}) {
            this.type = options.type || "";
            this.size = 0;
            if (Array.isArray(bits)) {
              bits.forEach(bit => {
                if (typeof bit === "string") this.size += bit.length;
                else if (bit && bit.size) this.size += bit.size;
                else if (bit && bit.length) this.size += bit.length;
              });
            }
          }
        };
      }
    }
  } catch (_) {}
})();

function _isPromiseLike(v) { return v && typeof v.then === "function"; }

function _callUserCallback(cb, err, msg) {
  if (typeof cb !== "function") return;
  try {
    var r = cb(err, msg);
    if (_isPromiseLike(r)) r.catch(function (e) { log.error("e2ee", e); });
  } catch (e) { log.error("e2ee", e); }
}

function _parseMentions(arr, text) {
  var out = {};
  if (!Array.isArray(arr) || !text) return out;
  arr.forEach(function (m) {
    if (!m || m.userId == null) return;
    var o = Number(m.offset || 0), l = Number(m.length || 0);
    out[String(m.userId)] = text.substring(o, o + l);
  });
  return out;
}

function _normalizeAttType(t) {
  if (!t) return t;
  t = String(t).toLowerCase();
  if (t === "image")               return "photo";
  if (t === "document")            return "file";
  if (t === "voice" || t === "ptt") return "audio";
  return t;
}

function _normalizeAtt(a) {
  if (!a || typeof a !== "object") return a;
  return {
    type: _normalizeAttType(a.type),
    ID: a.stickerId != null ? String(a.stickerId) : undefined,
    url: a.url, filename: a.fileName, mimeType: a.mimeType,
    fileSize: a.fileSize != null ? String(a.fileSize) : undefined,
    width: a.width, height: a.height, duration: a.duration,
    previewUrl: a.previewUrl, description: a.description, source: a.sourceText,
    mediaKey: a.mediaKey, mediaSha256: a.mediaSha256, mediaEncSha256: a.mediaEncSha256,
    directPath: a.directPath, latitude: a.latitude, longitude: a.longitude, isE2EE: true
  };
}

function _numericId(jid) {
  if (!jid) return "";
  var s = String(jid);
  var m = s.match(/^(\d+)/);
  return m ? m[1] : s;
}

// Extract numeric thread ID from E2EE JID for consistency with non-E2EE
function _extractThreadID(jid) {
  if (!jid) return "";
  var s = String(jid);
  // Handle E2EE JIDs like "1234567890@group.facebook.com" or "1234567890@facebook.com"
  var m = s.match(/^(\d+)/);
  if (m) return m[1];
  // If no numeric prefix, return the original
  return s;
}

function _mapMsg(ev) {
  var text = ev && ev.text ? String(ev.text) : "";
  var sid  = ev && ev.senderId != null ? _numericId(String(ev.senderId)) : "";
  var tid  = ev && ev.chatJid  ? _extractThreadID(ev.chatJid)
           : (ev && ev.threadId != null ? String(ev.threadId) : "");
  var messageReply = null;
  if (ev && ev.replyTo) {
    var _rtId = ev.replyTo.messageId != null ? ev.replyTo.messageId
              : ev.replyTo.id != null ? ev.replyTo.id : undefined;
    var _rtSender = (ev.replyTo.senderId != null &&
                     typeof ev.replyTo.senderId !== 'object')
                  ? _numericId(String(ev.replyTo.senderId)) : "";
    messageReply = {
      messageID: _rtId != null ? String(_rtId) : undefined,
      senderID:  _rtSender,
      body:      ev.replyTo.text != null ? String(ev.replyTo.text) : "",
      isE2EE:    true
    };
  }
  return {
    // Use same type format as non-E2EE for compatibility
    type: "message", 
    senderID: sid, 
    body: text, 
    threadID: tid,
    messageID: ev.id != null ? String(ev.id) : ev.id,
    messageReply: messageReply,
    attachments: Array.isArray(ev.attachments) ? ev.attachments.map(_normalizeAtt) : [],
    mentions: _parseMentions(ev.mentions, text),
    timestamp: ev.timestampMs != null ? Number(ev.timestampMs) : Date.now(),
    isGroup: /@group\.facebook\.com$/i.test(ev.chatJid || ""),
    isE2EE: true,
    e2ee: { chatJid: ev.chatJid, senderJid: ev.senderJid, replyTo: ev.replyTo || null, rawMentions: ev.mentions || [] },
    args: text.trim() ? text.trim().split(/\s+/) : []
  };
}

function _mapEdit(ev) {
  var text = ev && ev.text ? String(ev.text) : "";
  return {
    // Use same type format as non-E2EE
    type: "message_edit", 
    senderID: ev && ev.senderId != null ? _numericId(String(ev.senderId)) : "",
    body: text, 
    threadID: ev && ev.chatJid ? _extractThreadID(ev.chatJid) : "",
    messageID: ev ? ev.messageId : undefined,
    timestamp: ev && ev.timestampMs != null ? Number(ev.timestampMs) : Date.now(),
    isGroup: /@group\.facebook\.com$/i.test(ev && ev.chatJid ? ev.chatJid : ""),
    isE2EE: true,
    e2ee: { chatJid: ev ? ev.chatJid : undefined, senderJid: ev ? ev.senderJid : undefined },
    args: text.trim() ? text.trim().split(/\s+/) : []
  };
}

function _mapReaction(ev) {
  return {
    // Use same type format as non-E2EE
    type: "message_reaction",
    threadID: ev && ev.chatJid ? _extractThreadID(ev.chatJid) : "",
    messageID: ev ? ev.messageId : undefined, 
    reaction: ev ? ev.reaction : undefined,
    senderID: ev && ev.senderId != null ? _numericId(String(ev.senderId)) : undefined,
    userID:   ev && ev.senderId != null ? _numericId(String(ev.senderId)) : undefined,
    isE2EE: true,
    e2ee: { chatJid: ev ? ev.chatJid : undefined, senderJid: ev ? ev.senderJid : undefined }
  };
}

function _mapReceipt(ev) {
  return {
    // Keep same format but mark as E2EE
    type: "receipt", 
    isE2EE: true,
    e2ee: {
      receiptType: ev ? ev.type : undefined, 
      chatJid: ev ? ev.chat : undefined,
      senderJid: ev ? ev.sender : undefined, 
      messageIds: ev ? ev.messageIds : []
    }
  };
}

function _cookiesFromJar(ctx) {
  var out = {};
  var jar = [];
  try { jar = ctx.jar.getCookies("https://www.facebook.com"); } catch (_) {}
  jar.forEach(function (c) { if (c && c.key) out[c.key] = c.value; });
  if (!out.c_user && out.i_user) out.c_user = out.i_user;
  return out;
}

function _normalizeMediaInput(input) {
  if (Buffer.isBuffer(input)) return input;
  if (Array.isArray(input))   return Buffer.from(input);
  if (input && input.type === "Buffer" && Array.isArray(input.data)) return Buffer.from(input.data);
  if (typeof input === "string") return Buffer.from(input, "base64");
  throw new Error("𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐄2𝐄𝐄 𝐦𝐞𝐝𝐢𝐚 𝐝𝐚𝐭𝐚 𝐦𝐮𝐬𝐭 𝐛𝐞 𝐁𝐮𝐟𝐟𝐞𝐫, 𝐛𝐲𝐭𝐞 𝐚𝐫𝐫𝐚𝐲, 𝐁𝐮𝐟𝐟𝐞𝐫-𝐉𝐒𝐎𝐍, 𝐨𝐫 𝐛𝐚𝐬𝐞64 𝐬𝐭𝐫𝐢𝐧𝐠");
}

function createBridge(ctx) {
  if (ctx._e2eeBridge) return ctx._e2eeBridge;

  var state = {
    client: null, connected: false, connectingPromise: null,
    listenerAttached: false, lastGlobalCallback: null,
    lastReadyPayload: null, fullyReady: false
  };

  function _ensureEnabled() {
    // Auto-detect: always allow E2EE unless explicitly disabled
    if (ctx.globalOptions && ctx.globalOptions.enableE2EE === false)
      throw new Error("𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐄2𝐄𝐄 𝐢𝐬 𝐝𝐢𝐬𝐚𝐛𝐥𝐞𝐝. 𝐬𝐞𝐭 𝐞𝐧𝐚𝐛𝐥𝐞𝐄2𝐄𝐄:𝐭𝐫𝐮𝐞 𝐢𝐧 𝐜𝐨𝐧𝐟𝐢𝐠.");
  }

  async function _loadClient() {
    var mod;
    try { mod = await _getDynamicImport()(_E2EE_LIB_URL); }
    catch (err) {
      throw new Error("𝐂𝐚𝐧𝐧𝐨𝐭 𝐥𝐨𝐚𝐝 𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐄2𝐄𝐄 𝐛𝐮𝐧𝐝𝐥𝐞 (" + _E2EE_LIB_URL + "): " +
        (err && err.message ? err.message : String(err)));
    }
    var ClientClass = mod.Client || (mod.default && mod.default.Client);
    if (!ClientClass || typeof ClientClass !== "function")
      throw new Error("𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐄2𝐄𝐄 𝐛𝐮𝐧𝐝𝐥𝐞 𝐥𝐨𝐚𝐝𝐞𝐝 𝐛𝐮𝐭 𝐜𝐥𝐢𝐞𝐧𝐭 𝐞𝐱𝐩𝐨𝐫𝐭 𝐧𝐨𝐭 𝐟𝐨𝐮𝐧𝐝.");
    return ClientClass;
  }

  function _attachEvents(initCb) {
    if (!state.client || state.listenerAttached) return;
    state.listenerAttached = true;
    if (typeof initCb === "function") state.lastGlobalCallback = initCb;

    state.client.on("ready",     function (p) {
      state.lastReadyPayload = p;
      _callUserCallback(state.lastGlobalCallback, null, { type: "e2ee_ready", isE2EE: true, data: p || null });
    });
    state.client.on("fullyReady", function () {
      state.fullyReady = true;
      _callUserCallback(state.lastGlobalCallback, null, { type: "e2ee_fully_ready", isE2EE: true });
    });
    state.client.on("e2eeConnected", function () {
      state.connected = true;
      _callUserCallback(state.lastGlobalCallback, null, { type: "e2ee_connected", isE2EE: true });
    });
    state.client.on("deviceDataChanged", function (p) {
      if (p && p.deviceData) ctx._e2eeDeviceData = p.deviceData;
      _callUserCallback(state.lastGlobalCallback, null,
        { type: "e2ee_device_data_changed", isE2EE: true, deviceData: p ? p.deviceData : undefined });
    });
    state.client.on("e2eeMessage", function (ev) {
      var mapped = _mapMsg(ev);
      global._e2eeMessageMap   = global._e2eeMessageMap   || new Map();
      global._e2eeSenderJidMap = global._e2eeSenderJidMap || new Map();
      // Store both E2EE JID and numeric ID mapping
      if (mapped.messageID && mapped.threadID) {
        global._e2eeMessageMap.set(String(mapped.messageID), String(mapped.threadID));
        // Also store full JID for internal use
        if (ev.chatJid) global._e2eeMessageMap.set(String(mapped.messageID) + "_jid", String(ev.chatJid));
      }
      if (mapped.messageID && ev.senderJid)
        global._e2eeSenderJidMap.set(String(mapped.messageID), String(ev.senderJid));
      if (ev.replyTo && ev.chatJid) {
        var _rtReg = ev.replyTo.messageId || ev.replyTo.id;
        if (_rtReg) {
          global._e2eeMessageMap.set(String(_rtReg), _extractThreadID(ev.chatJid));
          global._e2eeMessageMap.set(String(_rtReg) + "_jid", String(ev.chatJid));
        }
      }
      _callUserCallback(state.lastGlobalCallback, null, mapped);
    });
    state.client.on("e2eeMessageEdit", function (ev) { _callUserCallback(state.lastGlobalCallback, null, _mapEdit(ev)); });
    state.client.on("e2eeReaction",    function (ev) { _callUserCallback(state.lastGlobalCallback, null, _mapReaction(ev)); });
    state.client.on("e2eeReceipt",     function (ev) { _callUserCallback(state.lastGlobalCallback, null, _mapReceipt(ev)); });
    state.client.on("error", function (err) {
      var msg = err && err.message ? err.message : String(err || "");
      if (/close 1006|unexpected EOF|ECONNRESET|ETIMEDOUT|read loop/i.test(msg)) {
        log.warn("e2ee", "𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐭𝐫𝐚𝐧𝐬𝐢𝐞𝐧𝐭 𝐧𝐞𝐭𝐰𝐨𝐨𝐫𝐤 𝐞𝐫𝐫𝐨𝐫 — 𝐰𝐞𝐥𝐥𝐥 𝐫𝐞𝐜𝐨𝐧𝐧𝐞𝐜𝐭:", msg); return;
      }
      _callUserCallback(state.lastGlobalCallback, err || new Error("𝐔𝐧𝐤𝐧𝐨𝐰𝐧 𝐄2𝐄𝐄 𝐞𝐫𝐫𝐨𝐞"));
    });
    state.client.on("disconnected", function (info) {
      state.connected = false; state.fullyReady = false;
      log.warn("e2ee", "𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐄2𝐄𝐄 𝐝𝐢𝐬𝐜𝐨𝐧𝐧𝐞𝐜𝐭𝐞𝐝 — 𝐫𝐞𝐜𝐨𝐧𝐧𝐞𝐜𝐭𝐢𝐝𝐢𝐧𝐠 𝐢𝐧 5𝐬..");
      setTimeout(function () {
        if (!state.connectingPromise) {
          var cb = (ctx && ctx._globalCallback) || state.lastGlobalCallback;
          connect(cb).catch(function (e) { log.error("e2ee", "𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐫𝐞𝐜𝐨𝐧𝐧𝐞𝐜𝐭 𝐟𝐚𝐢𝐥𝒆𝐝:", e && e.message ? e.message : e); });
        }
      }, 5000);
      _callUserCallback(state.lastGlobalCallback, null, { type: "e2ee_disconnected", isE2EE: true, data: info || null });
    });
  }

  async function connect(globalCallback) {
    _ensureEnabled();
    if (typeof globalCallback === "function") state.lastGlobalCallback = globalCallback;
    if (state.connected && state.client) return state.client;
    if (state.connectingPromise) return state.connectingPromise;

    state.connectingPromise = (async function () {
      var ClientClass = await _loadClient();
      if (!state.client) {
        var cookies = _cookiesFromJar(ctx);
        if (!cookies.c_user || !cookies.xs)
          throw new Error("𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐜𝐚𝐧𝐧𝐨𝐭 𝐬𝐭𝐚𝐫𝐭 𝐄2𝐄𝐄: c_user/xs cookies missing");

        var opts = {
          enableE2EE: true,
          e2eeMemoryOnly: ctx.globalOptions.e2eeMemoryOnly !== false,
          autoReconnect: true, logLevel: "none"
        };
        if (ctx.globalOptions.e2eeDevicePath) opts.devicePath = ctx.globalOptions.e2eeDevicePath;
        if (ctx.globalOptions.e2eeDeviceData) opts.deviceData = ctx.globalOptions.e2eeDeviceData;
        if (!opts.deviceData && global._pendingE2eeDeviceData) {
          opts.deviceData = global._pendingE2eeDeviceData;
          delete global._pendingE2eeDeviceData;
        }

        state.client = new ClientClass(cookies, opts);
        _attachEvents(globalCallback);
      }
      await state.client.connect();
      state.connected = true; state.fullyReady = false;
      return state.client;
    })();

    try   { return await state.connectingPromise; }
    finally { state.connectingPromise = null; }
  }

  async function disconnect() {
    if (!state.client) { state.connected = false; return; }
    try { await state.client.disconnect(); }
    finally {
      state.connected = false; state.connectingPromise = null;
      state.listenerAttached = false; state.client = null;
    }
  }

  async function _ensureClient() {
    _ensureEnabled();
    if (state.connected && state.client) return state.client;
    return connect();
  }

  var bridge = {
    connect, disconnect,
    isConnected : function () { return !!(state.client && state.connected); },
    isFullyReady: function () {
      if (!state.client || !state.connected) return false;
      if (typeof state.client.isFullyReady === "function") {
        try { return !!state.client.isFullyReady(); } catch (_) {}
      }
      return !!state.fullyReady;
    },
    getState     : function () { return state; },
    getDeviceData: async function () { return (await _ensureClient()).getDeviceData(); },
    sendMessage  : async function (jid, text, opts) {
      return (await _ensureClient()).sendE2EEMessage(jid, text, opts || {});
    },
    sendReaction : async function (jid, msgId, senderJid, emoji) {
      return (await _ensureClient()).sendE2EEReaction(jid, msgId, senderJid, emoji);
    },
    sendTyping   : async function (jid, isTyping) {
      return (await _ensureClient()).sendE2EETyping(jid, isTyping !== false);
    },
    unsendMessage: async function (jid, msgId) {
      return (await _ensureClient()).unsendE2EEMessage(jid, msgId);
    },
    editMessage  : async function (jid, msgId, text) {
      return (await _ensureClient()).editE2EEMessage(jid, msgId, text);
    },
    downloadMedia: async function (opts) {
      var client = await _ensureClient();
      var size   = opts.fileSize != null ? Number(opts.fileSize) : undefined;
      var res = await client.downloadE2EEMedia({
        directPath: opts.directPath, mediaKey: opts.mediaKey,
        mediaSha256: opts.mediaSha256, mediaEncSha256: opts.mediaEncSha256,
        mediaType: opts.mediaType, mimeType: opts.mimeType, fileSize: size
      });
      return { data: res.data, mimeType: res.mimeType, fileSize: Number(res.fileSize) };
    },
    sendMedia: async function (jid, mediaType, data, opts) {
      var client = await _ensureClient();
      var buf    = _normalizeMediaInput(data);
      var o      = opts || {};
      var ntype  = String(mediaType || "").toLowerCase();
      switch (ntype) {
        case "image":
          return client.sendE2EEImage(jid, buf, o.mimeType || "image/jpeg",
            { caption: o.caption || "", width: o.width, height: o.height,
              replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        case "video":
          return client.sendE2EEVideo(jid, buf, o.mimeType || "video/mp4",
            { caption: o.caption || "", duration: o.duration, width: o.width, height: o.height,
              replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        case "audio": case "voice": {
          var mime    = o.mimeType || "audio/ogg; codecs=opus";
          var isVoice = ntype === "voice" || !!o.ptt;
          return client.sendE2EEAudio(jid, buf, mime,
            { ptt: isVoice, duration: o.duration != null ? Number(o.duration) : undefined,
              replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        }
        case "file": case "document":
          return client.sendE2EEDocument(jid, buf, o.filename || "file.bin",
            o.mimeType || "application/octet-stream",
            { replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        case "sticker":
          return client.sendE2EESticker(jid, buf, o.mimeType || "image/webp",
            { replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        default: throw new Error("𝐔𝐧𝐬𝐮𝐩𝐩𝐨𝐫𝐭𝐞𝐝 𝐄2𝐄𝐄 𝐦𝐞𝐝𝐢𝐚𝐓𝐲𝐩𝐞: " + ntype);
      }
    }
  };

  ctx._e2eeBridge = bridge;
  return bridge;
}

global._e2eeMessageMap   = global._e2eeMessageMap   || new Map();
global._e2eeSenderJidMap = global._e2eeSenderJidMap || new Map();

function _regMsg(msgID, jid) {
  if (msgID && jid) {
    global._e2eeMessageMap.set(String(msgID), _extractThreadID(jid));
    global._e2eeMessageMap.set(String(msgID) + "_jid", String(jid));
  }
}

var _EXT_MIME = {
  jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", gif:"image/gif",
  webp:"image/webp", bmp:"image/bmp",
  mp4:"video/mp4", mov:"video/quicktime", avi:"video/x-msvideo",
  mkv:"video/x-matroska", webm:"video/webm",
  mp3:"audio/mpeg", ogg:"audio/ogg; codecs=opus", oga:"audio/ogg; codecs=opus",
  opus:"audio/ogg; codecs=opus", wav:"audio/wav", m4a:"audio/mp4",
  aac:"audio/aac", flac:"audio/flac",
  pdf:"application/pdf", txt:"text/plain", json:"application/json"
};

function _ext(att) {
  var p = (att && att.path) ? String(att.path) : (att && att.filename ? String(att.filename) : "");
  return p.split(".").pop().toLowerCase();
}
function _mediaType(att) {
  var e = _ext(att);
  if (["jpg","jpeg","png","gif","webp","bmp"].includes(e))        return "image";
  if (["mp4","mov","avi","mkv","webm"].includes(e))               return "video";
  if (["mp3","ogg","oga","opus","wav","m4a","aac","flac"].includes(e)) return "audio";
  return "document";
}
function _mimeType(att, mt) {
  if (att && att.mimeType)    return String(att.mimeType);
  if (att && att.contentType) return String(att.contentType);
  var e = _ext(att);
  if (_EXT_MIME[e]) return _EXT_MIME[e];
  if (mt === "image") return "image/jpeg";
  if (mt === "video") return "video/mp4";
  if (mt === "audio") return "audio/ogg; codecs=opus";
  return "application/octet-stream";
}
function _filename(att) {
  if (att && att.filename) return String(att.filename);
  if (att && att.path) { var p = String(att.path).split(/[\\/]/); return p[p.length-1] || "file.bin"; }
  return "file.bin";
}
function _streamToBuffer(r) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    r.on("data",  function (c) { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
    r.on("end",   function ()  { resolve(Buffer.concat(chunks)); });
    r.on("error", reject);
  });
}

function patchApiForE2EE(api, ctx) {
  if (typeof api.downloadE2EEMedia !== "function") {
    api.downloadE2EEMedia = function (options) {
      return createBridge(ctx).downloadMedia(options);
    };
  }

  if (typeof api.resolveE2EEAttachment !== "function") {
    api.resolveE2EEAttachment = async function (att) {
      if (!att || !att.isE2EE) return att;
      if (att.url && /^https?:\/\//.test(att.url)) return att;
      if (!att.directPath || !att.mediaKey || !att.mediaSha256 || !att.mimeType) return att;
      try {
        var rawType = att.type === "photo" ? "image" : (att.type || "image");
        var res = await api.downloadE2EEMedia({
          directPath: att.directPath, mediaKey: att.mediaKey,
          mediaSha256: att.mediaSha256, mediaEncSha256: att.mediaEncSha256 || undefined,
          mediaType: rawType, mimeType: att.mimeType, fileSize: Number(att.fileSize)
        });
        var localUrl = await storeMedia(res.data, res.mimeType || att.mimeType || "image/jpeg");
        return Object.assign({}, att, { url: localUrl });
      } catch (e) {
        log.error("E2EE", "resolveE2EEAttachment failed:", e && e.message ? e.message : String(e));
        return att;
      }
    };
  }

  if (typeof api.sendTypingE2EE !== "function") {
    api.sendTypingE2EE = function (chatJid, isTyping) {
      if (!isE2EEChatJid(chatJid)) return Promise.resolve();
      return createBridge(ctx).sendTyping(chatJid, isTyping !== false).catch(function () {});
    };
  }
  
  // Add auto-detection helper for E2EE vs non-E2EE
  if (typeof api.isE2EEChat !== "function") {
    api.isE2EEChat = function(threadID) {
      if (!threadID) return false;
      // Check if we have E2EE mapping for this thread
      return global._e2eeMessageMap && (
        global._e2eeMessageMap.has(String(threadID)) ||
        global._e2eeMessageMap.has(String(threadID) + "_jid")
      );
    };
  }
}

module.exports = {
  isE2EEChatJid  : isE2EEChatJid,
  storeMedia     : storeMedia,
  createBridge   : createBridge,
  patchApiForE2EE: patchApiForE2EE,
  _extractThreadID: _extractThreadID
};
