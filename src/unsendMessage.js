"use strict";

const utils = require("../utils");

module.exports = function (defaultFuncs, api, ctx) {
  return function unsendMessage(messageID, callback) {
    let resolveFunc = function () {};
    let rejectFunc = function () {};
    const returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, friendList) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc(friendList);
      };
    }

  var _e2eeMod = require('../e2ee');
  var _jid = global._e2eeMessageMap && global._e2eeMessageMap.get(String(messageID));
  if (!_jid && global._e2eePendingUnsendJid) {
    var _pjid = global._e2eePendingUnsendJid[String(messageID)];
    if (_pjid) {
      _jid = _pjid;
      delete global._e2eePendingUnsendJid[String(messageID)];
    }
  }
  if (_jid && _e2eeMod.isE2EEChatJid(_jid)) {
    _e2eeMod.createBridge(ctx).unsendMessage(_jid, messageID)
      .then(function (r) { callback(null, r); resolveFunc(r); })
      .catch(function (e) { callback(e); rejectFunc(e); });
    return returnPromise;
  }
    
    const form = {
      message_id: messageID,
    };

    defaultFuncs
      .post("https://www.facebook.com/messaging/unsend_message/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (resData.error) {
          throw resData;
        }

        return callback();
      })
      .catch(function (err) {
        console.error("unsendMessage", err);
        return callback(err);
      });

    return returnPromise;
  };
};
