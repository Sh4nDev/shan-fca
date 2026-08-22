"use strict";

const utils = require("../utils");
const log = require("npmlog");

function createProfileUrl(url, username, id) {
  if (url) return url;
  return "https://www.facebook.com/" + (username || utils.formatID(id.toString()));
}

function formatParticipants(participants) {
  return participants.edges.map((p) => {
    p = p.node.messaging_actor;
    switch (p["__typename"]) {
      case "User":
        return {
          accountType: p["__typename"],
          userID: utils.formatID(p.id.toString()), 
          name: p.name,
          shortName: p.short_name,
          gender: p.gender,
          url: p.url, 
          profilePicture: p.big_image_src.uri,
          username: (p.username || null),
          isViewerFriend: p.is_viewer_friend, 
          isMessengerUser: p.is_messenger_user, 
          isVerified: p.is_verified, 
          isMessageBlockedByViewer: p.is_message_blocked_by_viewer, 
          isViewerCoworker: p.is_viewer_coworker, 
          isEmployee: p.is_employee 
        };
      case "Page":
        return {
          accountType: p["__typename"],
          userID: utils.formatID(p.id.toString()), 
          name: p.name,
          url: p.url,
          profilePicture: p.big_image_src.uri,
          username: (p.username || null),
          acceptsMessengerUserFeedback: p.accepts_messenger_user_feedback, 
          isMessengerUser: p.is_messenger_user, 
          isVerified: p.is_verified, 
          isMessengerPlatformBot: p.is_messenger_platform_bot, 
          isMessageBlockedByViewer: p.is_message_blocked_by_viewer, 
        };
      case "ReducedMessagingActor":
      case "UnavailableMessagingActor":
        return {
          accountType: p["__typename"],
          userID: utils.formatID(p.id.toString()),
          name: p.name,
          url: createProfileUrl(p.url, p.username, p.id), 
          profilePicture: p.big_image_src.uri, 
          username: (p.username || null), 
          isMessageBlockedByViewer: p.is_message_blocked_by_viewer, 
        };
      default:
        log.warn("getThreadList", "Found participant with unsupported typename. Please open an issue at https://github.com/Schmavery/facebook-chat-api/issues\n" + JSON.stringify(p, null, 2));
        return {
          accountType: p["__typename"],
          userID: utils.formatID(p.id.toString()),
          name: p.name || `[unknown ${p["__typename"]}]`, 
        };
    }
  });
}

function formatColor(color) {
  if (color && color.match(/^(?:[0-9a-fA-F]{8})$/g)) return color.slice(2);
  return color;
}

function getThreadName(t) {
  if (t.name || t.thread_key.thread_fbid) return t.name;

  for (let po of t.all_participants.edges) {
    let p = po.node;
    if (p.messaging_actor.id === t.thread_key.other_user_id) return p.messaging_actor.name;
  }
}

function mapNicknames(customizationInfo) {
  return (customizationInfo && customizationInfo.participant_customizations) ? customizationInfo.participant_customizations.map(u => {
    return {
      "userID": u.participant_id,
      "nickname": u.nickname
    };
  }) : [];
}

function formatThreadList(data) {
  return data.map(t => {
    let lastMessageNode = (t.last_message && t.last_message.nodes && t.last_message.nodes.length > 0) ? t.last_message.nodes[0] : null;
    return {
      threadID: t.thread_key ? utils.formatID(t.thread_key.thread_fbid || t.thread_key.other_user_id) : null, 
      name: getThreadName(t),
      unreadCount: t.unread_count,
      messageCount: t.messages_count,
      imageSrc: t.image ? t.image.uri : null,
      emoji: t.customization_info ? t.customization_info.emoji : null,
      color: formatColor(t.customization_info ? t.customization_info.outgoing_bubble_color : null),
      nicknames: mapNicknames(t.customization_info),
      muteUntil: t.mute_until,
      participants: formatParticipants(t.all_participants),
      adminIDs: t.thread_admins.map(a => a.id),
      folder: t.folder,
      isGroup: t.thread_type === "GROUP",
      // rtc_call_data: t.rtc_call_data,
      // isPinProtected: t.is_pin_protected,
      customizationEnabled: t.customization_enabled, 
      participantAddMode: t.participant_add_mode_as_string, 
      montageThread: t.montage_thread ? Buffer.from(t.montage_thread.id, "base64").toString() : null, 
      reactionsMuteMode: t.reactions_mute_mode,
      mentionsMuteMode: t.mentions_mute_mode,
      isArchived: t.has_viewer_archived,
      isSubscribed: t.is_viewer_subscribed,
      timestamp: t.updated_time_precise,
      snippet: lastMessageNode ? lastMessageNode.snippet : null,
      snippetAttachments: lastMessageNode ? lastMessageNode.extensible_attachment : null,
      snippetSender: lastMessageNode ? utils.formatID((lastMessageNode.message_sender.messaging_actor.id || "").toString()) : null,
      lastMessageTimestamp: lastMessageNode ? lastMessageNode.timestamp_precise : null, 
      lastReadTimestamp: (t.last_read_receipt && t.last_read_receipt.nodes.length > 0)
        ? (t.last_read_receipt.nodes[0] ? t.last_read_receipt.nodes[0].timestamp_precise : null)
        : null, 
      cannotReplyReason: t.cannot_reply_reason, 
      approvalMode: Boolean(t.approval_mode),
      participantIDs: formatParticipants(t.all_participants).map(participant => participant.userID),
      threadType: t.thread_type === "GROUP" ? 2 : 1 
    };
  });
}

module.exports = function (defaultFuncs, api, ctx) {
  return function getThreadList(limit, timestamp, tags, callback) {
    if (!callback && (utils.getType(tags) === "Function" || utils.getType(tags) === "AsyncFunction")) {
      callback = tags;
      tags = [""];
    }
    if (utils.getType(limit) !== "Number" || !Number.isInteger(limit) || limit <= 0) throw { error: "getThreadList: limit must be a positive integer" };

    if (utils.getType(timestamp) !== "Null" && (utils.getType(timestamp) !== "Number" || !Number.isInteger(timestamp))) throw { error: "getThreadList: timestamp must be an integer or null" };

    if (utils.getType(tags) === "String") tags = [tags];
    if (utils.getType(tags) !== "Array") throw { error: "getThreadList: tags must be an array" };

    var resolveFunc = function () { };
    var rejectFunc = function () { };
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction") {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    const form = {
      "av": ctx.globalOptions.pageID,
      "queries": JSON.stringify({
        "o0": {
          "doc_id": "3336396659757871",
          "query_params": {
            "limit": limit + (timestamp ? 1 : 0),
            "before": timestamp,
            "tags": tags,
            "includeDeliveryReceipts": true,
            "includeSeqID": false
          }
        }
      }),
      "batch_name": "MessengerGraphQLThreadlistFetcher"
    };

    defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then((resData) => {
        if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;

        if (resData[resData.length - 1].successful_results === 0) throw { error: "getThreadList: there was no successful_results", res: resData };

        if (timestamp) resData[0].o0.data.viewer.message_threads.nodes.shift();

        callback(null, formatThreadList(resData[0].o0.data.viewer.message_threads.nodes));
      })
      .catch((err) => {
        log.error("getThreadList", err);
        return callback(err);
      });

    return returnPromise;
  };
};
