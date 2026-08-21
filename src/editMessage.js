"use_strict";

const generateOfflineThreadingId = require('../utils');

function canBeCalled(func) {
    try {
        Reflect.apply(func, null, []);
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = function (defaultFuncs, api, ctx) {
    return function editMessage(text, messageID, callback) {
        if (ctx.globalOptions && ctx.globalOptions.enableE2EE) {
            var _e2eeMod = require('../e2ee');
            var _jid = global._e2eeMessageMap && global._e2eeMessageMap.get(String(messageID));
            if (_jid && _e2eeMod.isE2EEChatJid(_jid)) {
                var _p = _e2eeMod.createBridge(ctx).editMessage(_jid, messageID, text)
                    .then(function (r) { if (typeof callback === "function") callback(null, r); return r; })
                    .catch(function (e) { if (typeof callback === "function") callback(e); throw e; });
                return _p;
            }
        }

        if (!ctx.mqttClient) {
            throw new Error('Not connected to MQTT');
        }

        ctx.wsReqNumber += 1;
        ctx.wsTaskNumber += 1;

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
                epoch_id: parseInt(generateOfflineThreadingId),
                tasks: [query],
                version_id: '6903494529735864'
            },
            request_id: ctx.wsReqNumber,
            type: 3
        };

        context.payload = JSON.stringify(context.payload);

        ctx.mqttClient.publish('/ls_req', JSON.stringify(context), {
            qos: 1, retain: false
        });
    };
};
