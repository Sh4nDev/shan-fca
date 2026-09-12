"use strict";

const generateOfflineThreadingId = require('../utils');

// Simple helper to check if MQTT is actually connected
function isMqttReady(ctx) {
    return !!(ctx && ctx.mqttClient && ctx.mqttClient.connected !== false);
}

// Wait up to `timeout` ms for MQTT to become ready
function waitForMqtt(ctx, timeout = 10000, interval = 250) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            if (isMqttReady(ctx)) return resolve();
            if (Date.now() - start >= timeout) {
                return reject(new Error('Not connected to MQTT (timeout)'));
            }
            setTimeout(tick, interval);
        };
        tick();
    });
}

module.exports = function (defaultFuncs, api, ctx) {
    return function editMessage(text, messageID, callback) {
        // Wrap in a promise so both callbacks and async/await work
        const promise = (async () => {
            // ---------- E2EE path ----------
            if (ctx.globalOptions && ctx.globalOptions.enableE2EE) {
                try {
                    const e2eeMod = require('../e2ee');
                    const jid = global._e2eeMessageMap
                        && global._e2eeMessageMap.get(String(messageID));

                    if (jid && e2eeMod.isE2EEChatJid(jid)) {
                        const bridge = e2eeMod.createBridge(ctx);
                        return await bridge.editMessage(jid, messageID, text);
                    }
                } catch (e) {
                    // fall through to MQTT if E2EE path fails
                    if (typeof callback === "function") {
                        // don't call callback yet — let MQTT path try
                    }
                }
            }

            // ---------- MQTT path ----------
            if (!isMqttReady(ctx)) {
                // Try to wait a bit for the connection to come back
                try {
                    await waitForMqtt(ctx, 10000);
                } catch (e) {
                    throw new Error('Not connected to MQTT');
                }
            }

            ctx.wsReqNumber = (ctx.wsReqNumber || 0) + 1;
            ctx.wsTaskNumber = (ctx.wsTaskNumber || 0) + 1;

            const queryPayload = {
                message_id: messageID,
                text: text
            };

            const query = {
                failure_count: null,
                label: '742',
                payload: JSON.stringify(queryPayload),
                queue_name: 'edit_message',
                task_id: ctx.wsTaskNumber
            };

            const context = {
                app_id: '2220391788200892',
                payload: {
                    data_trace_id: null,
                    epoch_id: parseInt(generateOfflineThreadingId()),
                    tasks: [query],
                    version_id: '6903494529735864'
                },
                request_id: ctx.wsReqNumber,
                type: 3
            };

            context.payload = JSON.stringify(context.payload);

            return new Promise((resolve, reject) => {
                try {
                    ctx.mqttClient.publish(
                        '/ls_req',
                        JSON.stringify(context),
                        { qos: 1, retain: false },
                        (err) => {
                            if (err) return reject(err);
                            resolve({ success: true, messageID });
                        }
                    );
                } catch (e) {
                    reject(e);
                }
            });
        })();

        // Hook up callback if provided
        if (typeof callback === "function") {
            promise.then(
                (res) => callback(null, res),
                (err) => callback(err)
            );
        }

        return promise;
    };
};
