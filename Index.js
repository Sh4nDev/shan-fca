"use strict";

const { ShAnImgur, ShAnImgkit } = require('shan-server');
var utils = require("./utils");
var cheerio = require("cheerio");
var log = require("npmlog");
const fs = require('fs');
const path = require('path');
const request = require('request');
log.maxRecordSize = 100;
var checkVerified = null;
const Boolean_Option = ['online', 'selfListen', 'listenEvents', 'forceLogin', 'autoMarkDelivery', 'autoMarkRead', 'listenTyping', 'autoReconnect', 'emitReady'];
global.ditconmemay = false;

function setOptions(globalOptions, options) {
    Object.keys(options).map(function (key) {
        switch (Boolean_Option.includes(key)) {
            case true: {
                globalOptions[key] = Boolean(options[key]);
                break;
            }
            case false: {
                switch (key) {
                    case 'pauseLog': {
                        if (options.pauseLog) log.pause();
                        else log.resume();
                        break;
                    }
                    case 'logLevel': {
                        log.level = options.logLevel;
                        globalOptions.logLevel = options.logLevel;
                        break;
                    }
                    case 'logRecordSize': {
                        log.maxRecordSize = options.logRecordSize;
                        globalOptions.logRecordSize = options.logRecordSize;
                        break;
                    }
                    case 'pageID': {
                        globalOptions.pageID = options.pageID.toString();
                        break;
                    }
                    case 'userAgent': {
                        globalOptions.userAgent = (options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
                        break;
                    }
                    case 'proxy': {
                        if (typeof options.proxy != "string") {
                            delete globalOptions.proxy;
                            utils.setProxy();
                        } else {
                            globalOptions.proxy = options.proxy;
                            utils.setProxy(globalOptions.proxy);
                        }
                        break;
                    }
                    default: {
                        log.warn("setOptions", " 𝐔𝐧𝐫𝐞𝐜𝐨𝐠𝐧𝐢𝐳𝐞𝐝 𝐨𝐩𝐭𝐢𝐨𝐧 𝐠𝐢𝐯𝐞𝐧 𝐭𝐨 𝐬𝐞𝐭𝐎𝐩𝐭𝐢𝐨𝐧𝐬: " + key);
                        break;
                    }
                }
                break;
            }
        }
    });
}

function buildAPI(globalOptions, html, jar) {
    let fb_dtsg = null;
    let irisSeqID = null;
    function extractFromHTML() {
        try {
            const $ = cheerio.load(html);
            $('script').each((i, script) => {
                if (!fb_dtsg) {
                    const scriptText = $(script).html() || '';
                    const patterns = [
                        /\["DTSGInitialData",\[\],{"token":"([^"]+)"}]/,
                        /\["DTSGInitData",\[\],{"token":"([^"]+)"/,
                        /"token":"([^"]+)"/,
                        /{\\"token\\":\\"([^\\]+)\\"/,
                        /,\{"token":"([^"]+)"\},\d+\]/,
                        /"async_get_token":"([^"]+)"/,
                        /"dtsg":\{"token":"([^"]+)"/,
                        /DTSGInitialData[^>]+>([^<]+)/
                    ];
                    for (const pattern of patterns) {
                        const match = scriptText.match(pattern);
                        if (match && match[1]) {
                            try {
                                const possibleJson = match[1].replace(/\\"/g, '"');
                                const parsed = JSON.parse(possibleJson);
                                fb_dtsg = parsed.token || parsed;
                            } catch {
                                fb_dtsg = match[1];
                            }
                            if (fb_dtsg) break;
                        }
                    }
                }
            });
            if (!fb_dtsg) {
                const dtsgInput = $('input[name="fb_dtsg"]').val();
                if (dtsgInput) fb_dtsg = dtsgInput;
            }
            const seqMatches = html.match(/irisSeqID":"([^"]+)"/);
            if (seqMatches && seqMatches[1]) {
                irisSeqID = seqMatches[1];
            }
            try {
                const jsonMatches = html.match(/\{"dtsg":({[^}]+})/);
                if (jsonMatches && jsonMatches[1]) {
                    const dtsgData = JSON.parse(jsonMatches[1]);
                    if (dtsgData.token) fb_dtsg = dtsgData.token;
                }
            } catch { }
            if (fb_dtsg) {
                console.log("𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐟𝐨𝐮𝐧𝐝 𝐟𝐛_𝐝𝐭𝐬𝐠!");
            }
        } catch (e) {
            console.log("𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐞𝐫𝐫𝐨𝐫 𝐟𝐢𝐧𝐝𝐢𝐧𝐠 𝐟𝐛_𝐝𝐭𝐬𝐠:", e);
        }
    }
    extractFromHTML();
    var userID;
    var cookies = jar.getCookies("https://www.facebook.com");
    var userCookie = cookies.find(cookie => cookie.cookieString().startsWith("c_user="));
    var tiktikCookie = cookies.find(cookie => cookie.cookieString().startsWith("i_user="));
    if (!userCookie && !tiktikCookie) {
        return log.error("𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐞𝐫𝐫𝐨𝐫! 𝐲𝐨𝐮𝐫 𝐜𝐨𝐨𝐤𝐢𝐞𝐬𝐭𝐬𝐭𝐞 𝐢𝐬 𝐧𝐨𝐭 𝐯𝐚𝐥𝐢𝐝! 𝐞𝐫𝐫𝐨𝐫!");
    }
    if (html.includes("/checkpoint/block/?next")) {
        return log.error('error', "𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐲𝐨𝐮𝐫 𝐚𝐩𝐩𝐬𝐭𝐬𝐭𝐞 𝐢𝐬 𝐝𝐞𝐚𝐭 𝐫𝐞𝐜𝐡𝐚𝐧𝐠𝐞 𝐢𝐭!", 'error');
    }
    userID = (tiktikCookie || userCookie).cookieString().split("=")[1];
    try { clearInterval(checkVerified); } catch (_) { }
    const clientID = (Math.random() * 2147483648 | 0).toString(16);
    let mqttEndpoint = `wss://edge-chat.facebook.com/chat?region=pnb`;
    let region = "PNB";

    try {
        const endpointMatch = html.match(/"endpoint":"([^"]+)"/);
        if (endpointMatch && endpointMatch.input && endpointMatch.input.includes("601051028565049")) {
          console.log(`𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐥𝐨𝐠𝐢𝐧 𝐞𝐫𝐫𝐨𝐫.`);
          ditconmemay = true;
        }
        if (endpointMatch) {
            let ep = endpointMatch[1].replace(/\\\//g, '/');
            try {
                const epUrl = new URL(ep);
                epUrl.searchParams.delete('sid');
                epUrl.searchParams.delete('cid');
                region = epUrl.searchParams.get('region')?.toUpperCase() || "PNB";
                mqttEndpoint = epUrl.toString();
            } catch (_) {
                mqttEndpoint = ep.replace(/[?&]sid=[^&]*/g, '').replace(/[?&]cid=[^&]*/g, '');
                region = (mqttEndpoint.match(/region=([^&]+)/) || [])[1]?.toUpperCase() || "PNB";
            }
        }
    } catch (e) {
        console.log('𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐮𝐬𝐢𝐧𝐠 𝐝𝐞𝐟𝐚𝐮𝐥𝐭 𝐌𝐐𝐓𝐓 𝐞𝐧𝐝𝐩𝐨𝐢𝐧𝐭..');
    }
    log.info('𝐋𝐨𝐠𝐠𝐢𝐧𝐠 𝐢𝐧 𝐰𝐢𝐭𝐡 𝐬𝐡𝐚𝐧-𝐟𝐜𝐚...');
    log.info('𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫 ♡︎ 𝗦𝗵𝗔𝗻 ♡︎...');
    
    var ctx = {
        userID: userID,
        jar: jar,
        clientID: clientID,
        globalOptions: globalOptions,
        loggedIn: true,
        access_token: 'NONE',
        clientMutationId: 0,
        mqttClient: undefined,
        lastSeqId: irisSeqID,
        syncToken: undefined,
        mqttEndpoint: mqttEndpoint,
        region: region,
        firstListen: true,
        fb_dtsg: fb_dtsg,
        req_ID: 0,
        callback_Task: {},
        wsReqNumber: 0,
        wsTaskNumber: 0,
        reqCallbacks: {},
        threadTypes: {}
    };
    let config = { enableTypingIndicator: false, typingDuration: 4000 };
    try {
        const rootConfigPath = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(rootConfigPath)) {
            const rootConfig = JSON.parse(fs.readFileSync(rootConfigPath, 'utf8'));
            if (rootConfig && typeof rootConfig === 'object') {
                if (typeof rootConfig.enableTypingIndicator !== 'undefined') config.enableTypingIndicator = rootConfig.enableTypingIndicator;
                if (typeof rootConfig.typingDuration !== 'undefined') config.typingDuration = rootConfig.typingDuration;
            }
        }

        const fcaConfigPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(fcaConfigPath)) {
            const fcaConfig = JSON.parse(fs.readFileSync(fcaConfigPath, 'utf8'));
            if (fcaConfig && typeof fcaConfig === 'object') {
                if (typeof fcaConfig.enableTypingIndicator !== 'undefined') config.enableTypingIndicator = fcaConfig.enableTypingIndicator;
                if (typeof fcaConfig.typingDuration !== 'undefined') config.typingDuration = fcaConfig.typingDuration;
            }
        }

        if (global.GoatBot && global.GoatBot.config) {
            if (typeof global.GoatBot.config.enableTypingIndicator !== 'undefined') config.enableTypingIndicator = global.GoatBot.config.enableTypingIndicator;
            if (typeof global.GoatBot.config.typingDuration !== 'undefined') config.typingDuration = global.GoatBot.config.typingDuration;
        }
    } catch (e) {
        console.log('𝐄𝐫𝐫𝐨𝐫 𝐥𝐨𝐚𝐝𝐢𝐧𝐠 𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐜𝐨𝐧𝐟𝐢𝐠.𝐣𝐬𝐨𝐧:', e);
    }

    const refreshFcaConfig = () => {
        try {
            const updatedConfig = { enableTypingIndicator: false, typingDuration: 4000 };

            if (fs.existsSync(path.join(process.cwd(), 'config.json'))) {
                const rootConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
                if (rootConfig && typeof rootConfig === 'object') {
                    if (typeof rootConfig.enableTypingIndicator !== 'undefined') updatedConfig.enableTypingIndicator = rootConfig.enableTypingIndicator;
                    if (typeof rootConfig.typingDuration !== 'undefined') updatedConfig.typingDuration = rootConfig.typingDuration;
                }
            }

            if (fs.existsSync(path.join(__dirname, 'config.json'))) {
                const fcaConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
                if (fcaConfig && typeof fcaConfig === 'object') {
                    if (typeof fcaConfig.enableTypingIndicator !== 'undefined') updatedConfig.enableTypingIndicator = fcaConfig.enableTypingIndicator;
                    if (typeof fcaConfig.typingDuration !== 'undefined') updatedConfig.typingDuration = fcaConfig.typingDuration;
                }
            }

            if (global.GoatBot && global.GoatBot.config) {
                if (typeof global.GoatBot.config.enableTypingIndicator !== 'undefined') updatedConfig.enableTypingIndicator = global.GoatBot.config.enableTypingIndicator;
                if (typeof global.GoatBot.config.typingDuration !== 'undefined') updatedConfig.typingDuration = global.GoatBot.config.typingDuration;
            }

            ctx.config = updatedConfig;
            config = updatedConfig;
            if (global.GoatBot) global.GoatBot.config = global.GoatBot.config || {};
            if (global.GoatBot && typeof global.GoatBot.config.enableTypingIndicator !== 'undefined') {
                global.GoatBot.config.enableTypingIndicator = updatedConfig.enableTypingIndicator;
            }
            if (global.GoatBot && typeof global.GoatBot.config.typingDuration !== 'undefined') {
                global.GoatBot.config.typingDuration = updatedConfig.typingDuration;
            }
        } catch (e) {
            console.log('𝐅𝐚𝐢𝐥𝐞𝐝 𝐭𝐨 𝐫𝐞𝐟𝐫𝐞𝐬𝐡 𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐜𝐨𝐧𝐟𝐢𝐠:', e);
        }
    };

    refreshFcaConfig();

    ctx.refreshFcaConfig = refreshFcaConfig;
    if (global.GoatBot) {
        global.GoatBot.refreshFcaConfig = refreshFcaConfig;
    }

    try {
        const _e2eeRootPath = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(_e2eeRootPath)) {
            const _rootCfg = JSON.parse(fs.readFileSync(_e2eeRootPath, 'utf8'));
            const _e2eeCfg = (_rootCfg && _rootCfg.e2ee) ? _rootCfg.e2ee : {};
            if (_e2eeCfg.enable === true) globalOptions.enableE2EE = true;
            var _saveType = _e2eeCfg.saveType || (typeof _e2eeCfg.memoryOnly !== 'undefined' ? (_e2eeCfg.memoryOnly ? 'memory' : 'path') : 'memory');
            globalOptions.e2eeMemoryOnly = (_saveType !== 'path');
            if (_saveType === 'path' && _e2eeCfg.devicePath) globalOptions.e2eeDevicePath = _e2eeCfg.devicePath;
            if (_e2eeCfg.deviceData) globalOptions.e2eeDeviceData = _e2eeCfg.deviceData;
        }
    } catch (_) {}

    ctx.config = config;
    var api = {
        setOptions: setOptions.bind(null, globalOptions),
        getAppState: () => utils.getAppState(jar),
        postFormData: (url, body) => utils.makeDefaults(html, userID, ctx).postFormData(url, ctx.jar, body)
    };
    var defaultFuncs = utils.makeDefaults(html, userID, ctx);
    api.postFormData = function (url, body) {
        return defaultFuncs.postFormData(url, ctx.jar, body);
    };
        
async function uploadImageToImgbb(image, expiration = 600) {
    if (typeof image !== 'string' || !image.startsWith('https')) {
        throw new Error('𝐒𝐡𝐀𝐧𝐈𝐦𝐠𝐮𝐫 𝐫𝐞𝐪𝐮𝐢𝐫𝐞𝐝 𝐚 𝐩𝐮𝐛𝐥𝐢𝐜 𝐢𝐦𝐚𝐠𝐞 𝐔𝐑𝐋');
    }

    const result = ShAnImgur(image, '♡︎ 𝗦𝗵𝗔𝗻 ♡︎');

    if (result.status !== 'success') {
        throw new Error('𝐒𝐡𝐀𝐧𝐈𝐦𝐠𝐮𝐫 𝐮𝐩𝐥𝐨𝐚𝐝 𝐟𝐚𝐢𝐥𝐞𝐝');
    }
    return {
        success: true,
        data: {
            url: result.ShAn,       
            author: result.dev,
        }
    };
}

    async function _uploadToImageKit(image) {
        
    if (typeof image !== 'string' || !image.startsWith('http')) {
        throw new Error('𝐒𝐡𝐀𝐧𝐈𝐦𝐠𝐤𝐢𝐭 𝐫𝐞𝐪𝐮𝐢𝐫𝐞 𝐚 𝐩𝐮𝐛𝐥𝐢𝐜 𝐢𝐦𝐚𝐠𝐞 𝐔𝐑𝐋');
    }

    const result = ShAnImgkit(image, '♡︎ 𝗦𝗵𝗔𝗻 ♡︎');

    if (result.status !== 'success') {
        throw new Error('𝐒𝐡𝐀𝐧𝐈𝐦𝐠𝐤𝐢𝐭 𝐮𝐩𝐥𝐨𝐚𝐝 𝐟𝐚𝐢𝐥𝐞𝐝');
    }
    return result.ShAn
    }

    async function _imgUpload(imageUrl) {
        try {
            return await uploadImageToImgbb(imageUrl);
        } catch (_) { }
        try {
            return await _uploadToImageKit(imageUrl);
        } catch (_) { }
        return null;
    }

    api.uploadImageToImgbb = uploadImageToImgbb;
    ctx.uploadImageToImgbb = uploadImageToImgbb;
    Object.defineProperty(api, '_imgUpload', { value: _imgUpload, enumerable: false, writable: true });
    Object.defineProperty(ctx, '_imgUpload', { value: _imgUpload, enumerable: false, writable: true });

    api.getFreshDtsg = async function () {
        try {
            const res = await defaultFuncs.get('https://www.facebook.com/', jar, null, globalOptions);
            const $ = cheerio.load(res.body);
            let newDtsg;
            const patterns = [
                /\["DTSGInitialData",\[\],{"token":"([^"]+)"}]/,
                /\["DTSGInitData",\[\],{"token":"([^"]+)"/,
                /"token":"([^"]+)"/,
                /name="fb_dtsg" value="([^"]+)"/
            ];

            $('script').each((i, script) => {
                if (!newDtsg) {
                    const scriptText = $(script).html() || '';
                    for (const pattern of patterns) {
                        const match = scriptText.match(pattern);
                        if (match && match[1]) {
                            newDtsg = match[1];
                            break;
                        }
                    }
                }
            });

            if (!newDtsg) {
                newDtsg = $('input[name="fb_dtsg"]').val();
            }

            return newDtsg;
        } catch (e) {
            console.log("𝐄𝐫𝐫𝐨𝐫 𝐠𝐞𝐭𝐭𝐢𝐧𝐠 𝐟𝐫𝐞𝐬𝐡 𝐝𝐭𝐬𝐠:", e);
            return null;
        }
    };
    
    require('fs').readdirSync(__dirname + '/src/').filter(v => v.endsWith('.js')).forEach(v => { api[v.replace('.js', '')] = require(`./src/${v}`)(utils.makeDefaults(html, userID, ctx), api, ctx); });
    
    const originalSendMessage = api.sendMessage;
    
    api.sendMessage = async function(msg, threadID, callback, replyToMessage, isSingleUser) {
        try {
            return await originalSendMessage(msg, threadID, callback, replyToMessage, isSingleUser);
        } catch (error) {
            console.log('𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐬𝐞𝐧𝐝𝐌𝐞𝐬𝐬𝐚𝐠𝐞 𝐟𝐚𝐢𝐥𝐞𝐝, 𝐮𝐬𝐢𝐧𝐠 𝐎𝐥𝐝𝐌𝐞𝐬𝐬𝐚𝐠𝐞 𝐟𝐚𝐥𝐥𝐛𝐚𝐜𝐤:', error.message);
            return api.OldMessage(msg, threadID, callback, replyToMessage, isSingleUser);
        }
    };
    
    api.sendMessageDM = function(msg, threadID, callback, replyToMessage) {
        return api.OldMessage(msg, threadID, callback, replyToMessage, true);
    };
    
    api.listen = api.listenMqtt;

    if (globalOptions.enableE2EE) {
        try {
            var _e2ee = require('./e2ee');
            _e2ee.patchApiForE2EE(api, ctx);

            api.connectE2EE = function (callback) {
                var bridge = _e2ee.createBridge(ctx);
                api._e2eeBridge = bridge;
                return bridge.connect(callback);
            };

            api.getE2EEBridge = function () {
                return ctx._e2eeBridge || null;
            };

            api.getE2EEDeviceData = function (callback) {
                var resolve, reject;
                var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
                if (ctx._e2eeDeviceData) {
                    if (typeof callback === 'function') callback(null, ctx._e2eeDeviceData);
                    resolve(ctx._e2eeDeviceData);
                    return promise;
                }
                _e2ee.createBridge(ctx).getDeviceData()
                    .then(function (d) {
                        ctx._e2eeDeviceData = d;
                        if (typeof callback === 'function') callback(null, d);
                        resolve(d);
                    })
                    .catch(function (e) {
                        if (typeof callback === 'function') callback(e);
                        reject(e);
                    });
                return promise;
            };
        } catch (_patchErr) {
            log.warn('E2EE', '𝐅𝐚𝐢𝐥𝐞𝐝 𝐭𝐨 𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐢𝐧𝐢𝐭𝐢𝐚𝐥𝐢𝐬𝐞 𝐄2𝐄𝐄:', _patchErr && _patchErr.message ? _patchErr.message : _patchErr);
        }
    }

    return {
        ctx,
        defaultFuncs,
        api
    };
}

function makeLogin(jar, email, password, loginOptions, callback, prCallback) {
    return async function (res) {
        try {
            const html = res.body;
            const $ = cheerio.load(html);
            let arr = [];
            $("#login_form input").each((i, v) => arr.push({ val: $(v).val(), name: $(v).attr("name") }));
            arr = arr.filter(v => v.val && v.val.length);
            let form = utils.arrToForm(arr);
            form.lsd = utils.getFrom(html, "[\"LSD\",[],{\"token\":\"", "\"}");
            form.lgndim = Buffer.from(JSON.stringify({ w: 1440, h: 900, aw: 1440, ah: 834, c: 24 })).toString('base64');
            form.email = email;
            form.pass = password;
            form.default_persistent = '0';
            form.lgnrnd = utils.getFrom(html, "name=\"lgnrnd\" value=\"", "\"");
            form.locale = 'en_US';
            form.timezone = '240';
            form.lgnjs = Math.floor(Date.now() / 1000);
            const willBeCookies = html.split("\"_js_");
            willBeCookies.slice(1).forEach(val => {
                const cookieData = JSON.parse("[\"" + utils.getFrom(val, "", "]") + "]");
                jar.setCookie(utils.formatCookie(cookieData, "facebook"), "https://www.facebook.com");
            });
            log.info("Logging in...");
            const loginRes = await utils.post(
                "https://www.facebook.com/login/device-based/regular/login/?login_attempt=1&lwv=110",
                jar,
                form,
                loginOptions
            );
            await utils.saveCookies(jar)(loginRes);
            const headers = loginRes.headers;
            if (!headers.location) throw new Error("Wrong username/password.");
            if (headers.location.includes('https://www.facebook.com/checkpoint/')) {
                log.info("login", "You have login approvals turned on.");
                const checkpointRes = await utils.get(headers.location, jar, null, loginOptions);
                await utils.saveCookies(jar)(checkpointRes);
                const checkpointHtml = checkpointRes.body;
                const $ = cheerio.load(checkpointHtml);
                let checkpointForm = [];
                $("form input").each((i, v) => checkpointForm.push({ val: $(v).val(), name: $(v).attr("name") }));
                checkpointForm = checkpointForm.filter(v => v.val && v.val.length);
                const form = utils.arrToForm(checkpointForm);
                if (checkpointHtml.includes("checkpoint/?next")) {
                    return new Promise((resolve, reject) => {
                        const submit2FA = async (code) => {
                            try {
                                form.approvals_code = code;
                                form['submit[Continue]'] = $("#checkpointSubmitButton").html();
                                const approvalRes = await utils.post(
                                    "https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php",
                                    jar,
                                    form,
                                    loginOptions
                                );
                                await utils.saveCookies(jar)(approvalRes);
                                const approvalError = $("#approvals_code").parent().attr("data-xui-error");
                                if (approvalError) throw new Error("Invalid 2FA code.");
                                form.name_action_selected = 'dont_save';
                                const finalRes = await utils.post(
                                    "https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php",
                                    jar,
                                    form,
                                    loginOptions
                                );
                                await utils.saveCookies(jar)(finalRes);
                                const appState = utils.getAppState(jar);
                                resolve(await loginHelper(appState, email, password, loginOptions, callback));
                            } catch (error) {
                                reject(error);
                            }
                        };
                        throw {
                            error: 'login-approval',
                            continue: submit2FA
                        };
                    });
                }
                if (!loginOptions.forceLogin) throw new Error("Couldn't login. Facebook might have blocked this account.");
                form['submit[This was me]'] = checkpointHtml.includes("Suspicious Login Attempt") ? "This was me" : "This Is Okay";
                await utils.post("https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php", jar, form, loginOptions);
                form.name_action_selected = 'save_device';
                const reviewRes = await utils.post("https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php", jar, form, loginOptions);
                const appState = utils.getAppState(jar);
                return await loginHelper(appState, email, password, loginOptions, callback);
            }
            await utils.get('https://www.facebook.com/', jar, null, loginOptions);
            return await utils.saveCookies(jar);
        } catch (error) {
            callback(error);
        }
    };
}


function loginHelper(appState, email, password, globalOptions, callback, prCallback) {
    let mainPromise = null;
    const jar = utils.getJar();
    if (appState) {
        try {
            appState = JSON.parse(appState);
        } catch (e) {
            try {
                appState = appState;
            } catch (e) {
                return callback(new Error("𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐟𝐚𝐢𝐥𝐞𝐝 𝐭𝐨 𝐩𝐚𝐫𝐬𝐞 𝐚𝐩𝐩𝐒𝐭𝐚𝐭𝐞..."));
            }
        }

        try {
            appState.forEach(c => {
                const cookieName = c.key || c.name;
                if (!cookieName || !c.value) return;
                const domain = c.domain || '.facebook.com';
                const expires = c.expirationDate
                    ? new Date(c.expirationDate * 1000).toUTCString()
                    : (c.expires || '');
                const str = `${cookieName}=${c.value}; expires=${expires}; domain=${domain}; path=${c.path || '/'};`;
                const url = 'http://' + domain.replace(/^\./, 'www.');
                try { jar.setCookie(str, url); } catch (_) { }
            });

            mainPromise = utils.get('https://www.facebook.com/', jar, null, globalOptions, { noRef: true })
                .then(utils.saveCookies(jar));
        } catch (e) {
            return callback(new Error('𝐬𝐡𝐚𝐧-𝐟𝐜𝐚 𝐟𝐚𝐢𝐥𝐞𝐝 𝐭𝐨 𝐥𝐨𝐚𝐝 𝐚𝐩𝐩𝐒𝐭𝐚𝐭𝐞: ' + e.message));
        }
    } else {
        mainPromise = utils
            .get("https://www.facebook.com/", null, null, globalOptions, { noRef: true })
            .then(utils.saveCookies(jar))
            .then(makeLogin(jar, email, password, globalOptions, callback, prCallback))
            .then(() => utils.get('https://www.facebook.com/', jar, null, globalOptions).then(utils.saveCookies(jar)));
    }

    function handleRedirect(res) {
        const reg = /<meta http-equiv="refresh" content="0;url=([^"]+)[^>]+>/;
        const redirect = reg.exec(res.body);
        if (redirect && redirect[1]) {
            return utils.get(redirect[1], jar, null, globalOptions).then(utils.saveCookies(jar));
        }
        return res;
    }

    let ctx, api;
    mainPromise = mainPromise
        .then(handleRedirect)
        .then(res => {
            const mobileAgentRegex = /MPageLoadClientMetrics/gs;
            if (!mobileAgentRegex.test(res.body)) {
                globalOptions.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
                return utils.get('https://www.facebook.com/', jar, null, globalOptions, { noRef: true }).then(utils.saveCookies(jar));
            }
            return res;
        })
        .then(handleRedirect)
        .then(res => {
            const html = res.body;
            const Obj = buildAPI(globalOptions, html, jar);
            ctx = Obj.ctx;
            api = Obj.api;
            return res;
        });

    if (globalOptions.pageID) {
        mainPromise = mainPromise
            .then(() => utils.get(`https://www.facebook.com/${globalOptions.pageID}/messages/?section=messages&subsection=inbox`, jar, null, globalOptions))
            .then(resData => {
                let url = utils.getFrom(resData.body, 'window.location.replace("https:\\/\\/www.facebook.com\\', '");').split('\\').join('');
                url = url.substring(0, url.length - 1);
                return utils.get('https://www.facebook.com' + url, jar, null, globalOptions);
            });
    }

    mainPromise
        .then(async () => {
            log.info('𝐋𝐨𝐠𝐢𝐧 𝐬𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥...');
            log.info('𝐋𝐨𝐠𝐢𝐧 𝐰𝐢𝐭𝐡 𝐬𝐡𝐚𝐧-𝐟𝐜𝐚...');
            log.info('𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐚𝐫 ♡︎ 𝗦𝗵𝗔𝗻 ♡︎');
            callback(null, api);
        })
        .catch(e => {
            callback(e);
        });
}


function login(loginData, options, callback) {

    if (utils.getType(options) === 'Function' || utils.getType(options) === 'AsyncFunction') {
        callback = options;
        options = {};
    }

    var globalOptions = {
        selfListen: false,
        listenEvents: true,
        listenTyping: false,
        updatePresence: false,
        forceLogin: false,
        autoMarkDelivery: false,
        autoMarkRead: false,
        autoReconnect: true,
        logRecordSize: 100,
        online: false,
        emitReady: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    };

    var prCallback = null;
    if (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction") {
        var rejectFunc = null;
        var resolveFunc = null;
        var returnPromise = new Promise(function (resolve, reject) {
            resolveFunc = resolve;
            rejectFunc = reject;
        });
        prCallback = function (error, api) {
            if (error) return rejectFunc(error);
            return resolveFunc(api);
        };
        callback = prCallback;
    }

    if (loginData.email && loginData.password) {
        setOptions(globalOptions, {
            logLevel: "silent",
            forceLogin: true,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        });
        loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback, prCallback);
    } else if (loginData.appState) {
        setOptions(globalOptions, options);
        return loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback, prCallback);
    }
    return returnPromise;
}


module.exports = login;
