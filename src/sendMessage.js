"use strict";

const utils = require('../utils');
const log = require('npmlog');

const allowedProperties = {
    attachment: true,
    url: true,
    sticker: true,
    emoji: true,
    emojiSize: true,
    body: true,
    mentions: true,
    location: true,
    replyToMessage: true,
    forwardAttachmentIds: true,
};

const EMOJI_SIZES = { small: 1, medium: 2, large: 3 };

function toEmojiSize(size) {
    if (typeof size === "number" && !isNaN(size)) return Math.min(3, Math.max(1, size));
    if (typeof size === "string" && size in EMOJI_SIZES) return EMOJI_SIZES[size];
    return 1;
}

function hasLinks(text) {
    return /(https?:\/\/|www\.|t\.me\/|fb\.me\/|youtu\.be\/|facebook\.com\/|youtube\.com\/)/i.test(text);
}

function buildMentionData(msg, baseBody) {
    if (!Array.isArray(msg.mentions) || !msg.mentions.length) return null;
    var ids = [], offsets = [], lengths = [], types = [];
    var cursor = 0;
    for (var i = 0; i < msg.mentions.length; i++) {
        var mention = msg.mentions[i];
        var rawTag = String(mention.tag || "");
        var displayName = rawTag.replace(/^@+/, "");
        var start = Number.isInteger(mention.fromIndex) ? mention.fromIndex : cursor;
        var index = baseBody.indexOf(rawTag, start);
        var adjustment = 0;
        if (index === -1) {
            index = baseBody.indexOf(displayName, start);
        } else {
            adjustment = rawTag.length - displayName.length;
        }
        if (index < 0) { index = 0; adjustment = 0; }
        var offset = index + adjustment;
        ids.push(String(mention.id || 0));
        offsets.push(offset);
        lengths.push(displayName.length);
        types.push("p");
        cursor = offset + displayName.length;
    }
    return {
        mention_ids: ids.join(","),
        mention_offsets: offsets.join(","),
        mention_lengths: lengths.join(","),
        mention_types: types.join(",")
    };
}

function extractIdsFromPayload(payload) {
    var messageID = null, threadID = null;
    function walk(node) {
        if (!Array.isArray(node)) return;
        if (node[0] === 5 && (node[1] === "replaceOptimsiticMessage" || node[1] === "replaceOptimisticMessage")) {
            messageID = String(node[3]);
        }
        if (node[0] === 5 && node[1] === "writeCTAIdToThreadsTable") {
            var candidate = node[2];
            if (Array.isArray(candidate) && candidate[0] === 19) threadID = String(candidate[1]);
        }
        for (var i = 0; i < node.length; i++) walk(node[i]);
    }
    try { walk(payload && payload.step); } catch (_) { }
    return { threadID: threadID, messageID: messageID };
}

function publishLsRequestWithAck(mqttClient, content, requestId, timeout) {
    timeout = timeout || 15000;
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            mqttClient.removeListener('message', onMessage);
            reject(new Error('MQTT sendMessage timed out'));
        }, timeout);

        function onMessage(topic, message) {
            if (topic !== '/ls_resp') return;
            try {
                var data = JSON.parse(message.toString());
                if (String(data.request_id) === String(requestId)) {
                    clearTimeout(timer);
                    mqttClient.removeListener('message', onMessage);
                    var extracted = extractIdsFromPayload(
                        data.payload ? JSON.parse(data.payload) : {}
                    );
                    resolve({
                        threadID: extracted.threadID,
                        messageID: extracted.messageID
                    });
                }
            } catch (_) { }
        }

        mqttClient.on('message', onMessage);
        mqttClient.publish('/ls_req', JSON.stringify(content), { qos: 1 }, function (err) {
            if (err) {
                clearTimeout(timer);
                mqttClient.removeListener('message', onMessage);
                reject(err);
            }
        });
    });
}

module.exports = function (defaultFuncs, api, ctx) {
    var uploadAttachmentFn = require('./uploadAttachment')(defaultFuncs, api, ctx);

    async function uploadAttachments(attachments) {
        if (!Array.isArray(attachments)) attachments = [attachments];
        return await uploadAttachmentFn(attachments);
    }

    async function sendViaMqtt(msg, threadID, replyToMessage) {
        var mqttClient = ctx.mqttClient || global.mqttClient;
        if (!mqttClient) throw new Error('MQTT client not available');

        var baseBody = msg.body != null ? String(msg.body) : "";
        var requestId = Math.floor(100 + Math.random() * 900);
        var epoch = (BigInt(Date.now()) << 22n).toString();

        var payload0 = {
            thread_id: String(threadID),
            otid: utils.generateOfflineThreadingID(),
            source: 2097153,
            send_type: 1,
            sync_group: 1,
            mark_thread_read: 1,
            text: baseBody === "" ? null : baseBody,
            initiating_source: 0,
            skip_url_preview_gen: 0,
            text_has_links: hasLinks(baseBody) ? 1 : 0,
            multitab_env: 0,
            metadata_dataclass: JSON.stringify({ media_accessibility_metadata: { alt_text: null } })
        };

        var mentionData = buildMentionData(msg, baseBody);
        if (mentionData) payload0.mention_data = mentionData;

        if (msg.sticker) {
            payload0.send_type = 2;
            payload0.sticker_id = msg.sticker;
        }

        if (msg.emoji) {
            payload0.send_type = 1;
            payload0.text = msg.emoji;
            payload0.hot_emoji_size = toEmojiSize(msg.emojiSize);
        }

        if (msg.location && msg.location.latitude != null && msg.location.longitude != null) {
            payload0.send_type = 1;
            payload0.location_data = {
                coordinates: { latitude: msg.location.latitude, longitude: msg.location.longitude },
                is_current_location: Boolean(msg.location.current),
                is_live_location: Boolean(msg.location.live)
            };
        }

        var effectiveReplyTo = replyToMessage || msg.replyToMessage;
        if (effectiveReplyTo) {
            payload0.reply_metadata = {
                reply_source_id: effectiveReplyTo,
                reply_source_type: 1,
                reply_type: 0
            };
        }

        if (msg.attachment) {
            payload0.send_type = 3;
            if (payload0.text === "") payload0.text = null;
            payload0.attachment_fbids = [];

            var list = Array.isArray(msg.attachment) ? msg.attachment : [msg.attachment];
            var preuploaded = [];
            var toUpload = [];

            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                if (Array.isArray(item) && item.length >= 2 && typeof item[0] === "string") {
                    preuploaded.push(String(item[1]));
                } else if (utils.isReadableStream(item)) {
                    toUpload.push(item);
                }
            }

            if (preuploaded.length) {
                payload0.attachment_fbids = payload0.attachment_fbids.concat(preuploaded);
            }

            if (Array.isArray(msg.forwardAttachmentIds) && msg.forwardAttachmentIds.length) {
                payload0.attachment_fbids = payload0.attachment_fbids.concat(msg.forwardAttachmentIds.map(String));
            }

            if (toUpload.length) {
                var uploaded = await uploadAttachments(toUpload);
                for (var f = 0; f < uploaded.length; f++) {
                    var key = Object.keys(uploaded[f])[0];
                    payload0.attachment_fbids.push(String(uploaded[f][key]));
                }
            }
        }

        var content = {
            app_id: "2220391788200892",
            payload: {
                tasks: [
                    {
                        label: "46",
                        payload: payload0,
                        queue_name: String(threadID),
                        task_id: 400,
                        failure_count: null
                    },
                    {
                        label: "21",
                        payload: {
                            thread_id: String(threadID),
                            last_read_watermark_ts: Date.now(),
                            sync_group: 1
                        },
                        queue_name: String(threadID),
                        task_id: 401,
                        failure_count: null
                    }
                ],
                epoch_id: epoch,
                version_id: "24804310205905615",
                data_trace_id: "#" + Buffer.from(String(Math.random())).toString("base64").replace(/=+$/, "")
            },
            request_id: requestId,
            type: 3
        };

        content.payload.tasks = content.payload.tasks.map(function (task) {
            return Object.assign({}, task, { payload: JSON.stringify(task.payload) });
        });
        content.payload = JSON.stringify(content.payload);

        return await publishLsRequestWithAck(mqttClient, content, requestId);
    }

    return async function sendMessage(msg, threadID, callback, replyToMessage, isSingleUser) {
        if (typeof callback === "string") {
            isSingleUser = replyToMessage;
            replyToMessage = callback;
            callback = function () { };
        } else if (typeof callback !== "function") {
            callback = function () { };
        }

        var _e2eeMod = require('../e2ee');
        if (_e2eeMod.isE2EEChatJid(String(threadID))) {
            var _bridge = _e2eeMod.createBridge(ctx);
            var _form   = typeof msg === "string" ? { body: msg } : (msg || {});
            var _text   = String(_form.body || _form.text || "");
            var _atts   = !_form.attachment ? []
                : (Array.isArray(_form.attachment) ? _form.attachment : [_form.attachment]);
            var _sendOpts = {};
            if (replyToMessage) {
                _sendOpts.replyToId = String(replyToMessage);
                var _rjid = global._e2eeSenderJidMap && global._e2eeSenderJidMap.get(String(replyToMessage));
                if (_rjid) _sendOpts.replyToSenderJid = _rjid;
            }

            var _e2eePromise = (async function () {
                var _last;
                for (var _i = 0; _i < _atts.length; _i++) {
                    var _att = _atts[_i]; if (!_att) continue;
                    try {
                        var _buf;
                        if (Buffer.isBuffer(_att)) {
                            _buf = _att;
                        } else if (_att && typeof _att.read === "function") {
                            _buf = await new Promise(function (res, rej) {
                                var chunks = [];
                                _att.on("data", function (c) { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
                                _att.on("end",  function ()  { res(Buffer.concat(chunks)); });
                                _att.on("error", rej);
                            });
                        } else if (_att && _att.type === "Buffer" && Array.isArray(_att.data)) {
                            _buf = Buffer.from(_att.data);
                        } else { continue; }

                        var _mt = (_att.mediaType ? String(_att.mediaType).toLowerCase() : null)
                            || (function () {
                                var p = String(_att.path || _att.filename || "").split(".").pop().toLowerCase();
                                if (["jpg","jpeg","png","gif","webp","bmp"].includes(p)) return "image";
                                if (["mp4","mov","avi","mkv","webm"].includes(p))        return "video";
                                if (["mp3","ogg","oga","opus","wav","m4a","aac","flac"].includes(p)) return "audio";
                                return "document";
                            })();
                        var _mOpts = Object.assign({}, _sendOpts);
                        if (_i === 0 && _text) _mOpts.caption = _text;
                        if (!_mOpts.mimeType && _att.mimeType) _mOpts.mimeType = _att.mimeType;
                        if ((_mt === "file" || _mt === "document") && !_mOpts.filename)
                            _mOpts.filename = (_att.filename || _att.path || "file.bin").split(/[\\/]/).pop();
                        if (_att.duration != null) _mOpts.duration = Number(_att.duration);
                        if (_att.width    != null) _mOpts.width    = Number(_att.width);
                        if (_att.height   != null) _mOpts.height   = Number(_att.height);
                        if (_att.ptt  || _att.voice) _mOpts.ptt = true;

                        var _mRes = await _bridge.sendMedia(threadID, _mt, _buf, _mOpts);
                        _last = { threadID: threadID, messageID: _mRes && _mRes.messageId ? String(_mRes.messageId) : undefined, isE2EE: true };
                        if (_last.messageID) {
                            global._e2eeMessageMap = global._e2eeMessageMap || new Map();
                            global._e2eeMessageMap.set(_last.messageID, String(threadID));
                            global._e2eeBotSentMsgIds = global._e2eeBotSentMsgIds || new Set();
                            global._e2eeBotSentMsgIds.add(_last.messageID);
                        }
                    } catch (_me) { log.error("E2EE", "sendMedia att#" + _i + " failed:", _me && _me.message ? _me.message : _me); }
                }
                if (!_last || _atts.length === 0) {
                    var _tRes = await _bridge.sendMessage(threadID, _text || "\u200b", _sendOpts);
                    _last = { threadID: threadID, messageID: _tRes && _tRes.messageId ? String(_tRes.messageId) : undefined, isE2EE: true };
                    if (_last.messageID) {
                        global._e2eeMessageMap = global._e2eeMessageMap || new Map();
                        global._e2eeMessageMap.set(_last.messageID, String(threadID));
                        global._e2eeBotSentMsgIds = global._e2eeBotSentMsgIds || new Set();
                        global._e2eeBotSentMsgIds.add(_last.messageID);
                    }
                }
                return _last;
            })();

            if (typeof api.downloadE2EEMedia !== "function") {
                api.downloadE2EEMedia = function (options) { return _bridge.downloadMedia(options); };
            }

            _e2eePromise.then(function (r) { callback(null, r); }).catch(function (e) { callback(e); });
            return _e2eePromise;
        }

        var msgType = utils.getType(msg);
        var threadIDType = utils.getType(threadID);

        if (msgType !== "String" && msgType !== "Object") throw new Error("Message should be of type string or object and not " + msgType + ".");
        if (threadIDType !== "Array" && threadIDType !== "Number" && threadIDType !== "String") throw new Error("ThreadID should be of type number, string, or array and not " + threadIDType + ".");
        if (replyToMessage && utils.getType(replyToMessage) !== "String") throw new Error("replyToMessage should be of type string.");

        if (msgType === "String") msg = { body: msg };

        var disallowedProperties = Object.keys(msg).filter(function (prop) { return !allowedProperties[prop]; });
        if (disallowedProperties.length > 0) throw new Error("Disallowed props: `" + disallowedProperties.join(", ") + "`");

        var configSource = (global.GoatBot && global.GoatBot.config) ? global.GoatBot.config : (ctx.config || {});
        var enableTypingIndicator = typeof configSource.enableTypingIndicator !== 'undefined' ? configSource.enableTypingIndicator : (ctx.config && ctx.config.enableTypingIndicator);
        var typingDuration = Number(configSource.typingDuration || (ctx.config && ctx.config.typingDuration) || 4000);

        var _isE2EEThread = require('../e2ee').isE2EEChatJid(String(threadID));
        if (_isE2EEThread) {
            typingDuration = Number(configSource.e2eeTypingDuration || (ctx.config && ctx.config.e2eeTypingDuration) || 3000);
        }

        if (enableTypingIndicator) {
            await api.sendTypingIndicator(true, threadID, function () { }).catch(function () { });
            await utils.delay(typingDuration);
        }

        try {
            var result = await sendViaMqtt(msg, threadID, replyToMessage);
            if (enableTypingIndicator) {
                api.sendTypingIndicator(false, threadID, function () { }).catch(function () { });
            }
            if (typeof callback === "function") callback(null, result);
            return result;
        } catch (mqttErr) {
            log.warn("sendMessage", "MQTT send failed, falling back to HTTP: " + (mqttErr && mqttErr.message));
            if (enableTypingIndicator) {
                api.sendTypingIndicator(false, threadID, function () { }).catch(function () { });
            }
            return api.OldMessage(msg, threadID, callback, replyToMessage, isSingleUser);
        }
    };
};
