# 🔥 ShAn-FCA - Facebook Chat API

[![GitHub](https://img.shields.io/badge/GitHub-Sh4nDev%2Fshan--fca-blue?logo=github)](https://github.com/Sh4nDev/shan-fca)
[![Language](https://img.shields.io/badge/Language-JavaScript-yellow?logo=javascript)](https://www.javascript.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen)]()

> 🤖 **An advanced, unofficial Facebook Messenger API library for Node.js** - Build powerful bots with ease.

---

## 📋 Table of Contents

- [Last Updated](#-last-updated)
- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Authentication](#-authentication)
- [API Reference](#-api-reference)
- [Event Handling](#-event-handling)
- [Configuration](#-configuration)
- [Advanced Usage](#-advanced-usage)
- [Examples](#-examples)
- [Troubleshooting](#-troubleshooting)
- [Security](#-security)
- [License](#-license)

---

## Last Updated

```
Coming soon
```

## 🚀 Features

### Core Features
- ✅ **Email/Password Authentication** - Traditional login with credentials
- ✅ **AppState Authentication** - Session persistence without storing passwords
- ✅ **Message Management** - Send, edit, delete, and react to messages
- ✅ **Real-time Events** - Listen to messages, typing indicators, read receipts, and more
- ✅ **Media Handling** - Support for images, videos, files, stickers, and voice messages
- ✅ **Group Management** - Create, rename, and manage group chats
- ✅ **User Information** - Fetch detailed user profiles and thread information
- ✅ **Chat Themes** - Change chat colors and styles
- ✅ **AI Theme Generation** - Generate custom themes using AI prompts

### Advanced Features
- 🔐 **End-to-End Encryption (E2EE)** - Secure messaging for encrypted chats
- 🌐 **Proxy Support** - Route traffic through proxy servers
- 🔄 **Auto-Reconnection** - Automatic reconnection with exponential backoff
- 📊 **Presence Detection** - Track user online/offline status
- ⚡ **High Performance** - Native bindings for critical operations
- 🎯 **Event Streaming** - Real-time message streaming via MQTT
- 💾 **Session Management** - Persistent sessions across restarts
- 🛡️ **Error Recovery** - Robust error handling and recovery mechanisms

---

## 📦 Installation

### Prerequisites
- **Node.js** >= 12.0.0
- **npm** >= 6.0.0 or **yarn** >= 1.22.0
- **Python** 3.x (for native builds)

### Install via npm
```bash
npm install shan-fca
```

### Install via yarn
```bash
yarn add shan-fca
```
---

## 🔌 Quick Start

### Simplest Example

```javascript
const login = require('shan-fca');

login(
  {
    email: 'your.email@gmail.com',
    password: 'your-password'
  },
  (err, api) => {
    if (err) return console.error('❌ Login failed:', err);
    
    console.log('✅ Successfully logged in!');
    
    // Send a test message
    api.sendMessage('Hello from ShAn-FCA! 🤖', threadID, (err) => {
      if (err) console.error(err);
      else console.log('✅ Message sent!');
    });
  }
);
```

### Using Promise

```javascript
const login = require('shan-fca');

(async () => {
  try {
    const api = await login({
      email: 'your.email@gmail.com',
      password: 'your-password'
    });
    
    console.log('✅ Logged in!');
    
    // Use promises
    await api.sendMessage('Hello!', threadID);
    console.log('✅ Message sent!');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
```

---

## 🔐 Authentication

### Method 1: Email & Password

```javascript
const login = require('shan-fca');

login({
  email: 'your.email@gmail.com',
  password: 'your-password'
}, (err, api) => {
  // ...
});
```

⚠️ **Security Note**: Storing passwords in code is dangerous. Use environment variables:

```javascript
login({
  email: process.env.FB_EMAIL,
  password: process.env.FB_PASSWORD
}, (err, api) => {
  // ...
});
```

### Method 2: AppState (Recommended for Production)

Save your AppState after first login:

```javascript
const login = require('shan-fca');
const fs = require('fs');

// First time - save appState
login({
  email: process.env.FB_EMAIL,
  password: process.env.FB_PASSWORD
}, (err, api) => {
  if (err) return console.error(err);
  
  // Save for next time
  api.getAppState((err, appState) => {
    fs.writeFileSync('appState.json', JSON.stringify(appState, null, 2));
    console.log('✅ AppState saved!');
  });
});
```

Subsequent logins using saved AppState:

```javascript
const login = require('shan-fca');
const fs = require('fs');

const appState = JSON.parse(fs.readFileSync('appState.json'));

login({ appState }, (err, api) => {
  if (err) return console.error('❌ Session expired, re-authenticate');
  
  console.log('✅ Logged in with saved session!');
});
```

### Method 3: Two-Factor Authentication (2FA)

```javascript
login({
  email: process.env.FB_EMAIL,
  password: process.env.FB_PASSWORD
}, {
  forceLogin: true
}, (err, api) => {
  if (err?.error === 'login-approval') {
    // 2FA required
    const code = prompt('Enter 2FA code:');
    err.continue(code)
      .then(api => console.log('✅ Logged in!'))
      .catch(err => console.error('❌ Invalid 2FA code'));
  } else if (err) {
    console.error('❌ Login failed:', err);
  }
});
```

---

## 📚 API Reference

### Messaging

#### Send Message
```javascript
// Basic text message
api.sendMessage('Hello World!', threadID, (err, messageInfo) => {
  if (err) console.error(err);
  console.log('Message ID:', messageInfo.messageID);
});

// With attachments
api.sendMessage({
  body: 'Check this out!',
  attachment: fs.createReadStream('image.png')
}, threadID);

// With mentions
api.sendMessage({
  body: 'SH AN, what do you think?',
  mentions: [{
    tag: 'SH AN',
    id: targetUid 
  }]
}, threadID);

// With sticker
api.sendMessage({
  sticker: 'STICKER_ID_HERE'
}, threadID);
```

#### Send Direct Message (DM)
```javascript
api.sendMessage('Private message', userID, (err) => {
  if (err) console.error(err);
});
```

#### Send Typing Indicator
```javascript
api.sendTypingIndicator(threadID, (err) => {
  if (err) console.error(err);
});

// Simulate 3 seconds of typing
setTimeout(() => {
  api.sendMessage('I was typing...', threadID);
}, 3000);
```

#### Edit Message
```javascript
api.editMessage('Updated text!', messageID, (err) => {
  if (err) console.error(err);
});
```

#### Delete Message
```javascript
api.unsendMessage(messageID, (err) => {
  if (err) console.error(err);
});
```

#### Add Reaction/Emoji
```javascript
api.setMessageReaction('👍', messageID, (err) => {
  if (err) console.error(err);
});
```

### Thread Management

#### Get Thread Info
```javascript
api.getThreadInfo(threadID, (err, threadInfo) => {
  if (err) return console.error(err);
  
  console.log('Thread name:', threadInfo.threadName);
  console.log('Participants:', threadInfo.participantIDs);
  console.log('Unread count:', threadInfo.unreadCount);
});
```

#### Rename Thread
```javascript
api.changeThreadSubject('New Group Name', threadID, (err) => {
  if (err) console.error(err);
});
```

#### Change Thread Color
```javascript
// Use hex colors
api.changeThreadColor('#0084FF', threadID, (err) => {
  if (err) console.error(err);
});
```

#### Add User to Group
```javascript
api.addUserToGroup(userID, threadID, (err) => {
  if (err) console.error(err);
});
```

#### Remove User from Group
```javascript
api.removeUserFromGroup(userID, threadID, (err) => {
  if (err) console.error(err);
});
```

#### Mark Thread as Read
```javascript
api.markAsRead(threadID, (err) => {
  if (err) console.error(err);
});
```

### User Information

#### Get User Info
```javascript
api.getUserInfo(userID, (err, userInfo) => {
  if (err) return console.error(err);
  
  console.log('Name:', userInfo[userID].name);
  console.log('Photo:', userInfo[userID].photo);
  console.log('Gender:', userInfo[userID].gender);
});
```

#### Search Users
```javascript
api.searchForUser('SH AN', (err, results) => {
  if (err) return console.error(err);
  
  results.forEach(user => {
    console.log(`${user.name} (ID: ${user.userID})`);
  });
});
```

#### Get Message
```javascript
api.getMessage(messageID, (err, messageInfo) => {
  if (err) return console.error(err);
  
  console.log('Sender:', messageInfo.senderName);
  console.log('Body:', messageInfo.body);
  console.log('Timestamp:', messageInfo.timestamp);
});
```

---

## 👂 Event Handling

### Listen to Messages

```javascript
api.listenMqtt((err, event) => {
  if (err) return console.error(err);
  
  switch(event.type) {
    case 'message':
      console.log(`📨 ${event.senderName}: ${event.body}`);
      break;
      
    case 'event':
      console.log('📌 Event:', event.eventData);
      break;
      
    case 'presence':
      console.log(`👤 ${event.senderName} is ${event.statuses}`);
      break;
  }
});
```

### Event Types

| Event Type | Description | Data |
|-----------|-------------|------|
| `message` | New message received | `body`, `senderID`, `threadID`, `attachments` |
| `messageEdit` | Message edited | `messageID`, `newBody`, `senderID` |
| `messageUnsend` | Message deleted | `messageID`, `senderID` |
| `reaction` | Emoji reaction added | `messageID`, `reaction`, `userID` |
| `typing` | User typing | `isTyping`, `userID`, `threadID` |
| `readReceipt` | Message read | `reader`, `time`, `threadID` |
| `presence` | User online status | `userID`, `status` |

### Advanced Event Listener

```javascript
api.listenMqtt((err, event) => {
  if (err) return console.error(err);
  
  // Filter events
  if (event.type !== 'message') return;
  
  const { body, senderID, threadID, senderName } = event;
  
  // Ignore bot's own messages
  if (senderID === api.getCurrentUserID()) return;
  
  // Log message
  console.log(`[${new Date().toLocaleTimeString()}] ${senderName}: ${body}`);
  
  // Respond to specific messages
  if (body?.toLowerCase().includes('hello')) {
    api.sendMessage(`👋 Hey ${senderName}!`, threadID);
  }
});
```

---

## ⚙️ Configuration

### Login Options

```javascript
login(loginData, {
  // Boolean options
  online: true,              // Online status
  selfListen: false,         // Receive own messages
  listenEvents: true,        // Listen to all events
  forceLogin: false,         // Force re-authentication
  autoMarkDelivery: true,    // Auto-mark as delivered
  autoMarkRead: false,       // Auto-mark as read
  listenTyping: true,        // Listen to typing indicators
  autoReconnect: true,       // Auto reconnect
  emitReady: true,           // Emit ready event
  
  // String options
  logLevel: 'info',          // silly, debug, verbose, info, warn, error
  userAgent: 'Mozilla/5.0...',  // Custom user agent
  proxy: 'http://proxy:port',   // Proxy URL
  
  // Number options
  logRecordSize: 100,        // Max log records
  pageID: '123456789'        // Page ID for page login
}, (err, api) => {
  // ...
});
```

### Config File

Create `config.json`:

```json
{
  "email": "your.email@gmail.com",
  "enableTypingIndicator": true,
  "typingDuration": 3000,
  "e2ee": {
    "saveType": "path",
    "devicePath": "./e2ee_devices"
  },
  "proxy": "http://proxy.example.com:8080"
}
```

Load in your bot:

```javascript
const config = require('./config.json');

login({
  email: config.email,
  appState: require('./appState.json')
}, config, (err, api) => {
  // ...
});
```

---

## 🎯 Advanced Usage

### Command Bot

```javascript
const login = require('shan-fca');
const fs = require('fs');

const commands = {
  '!help': (args, api, event) => {
    api.sendMessage('📚 Available commands: !help, !ping, !time', event.threadID);
  },
  
  '!ping': (args, api, event) => {
    api.sendMessage('🏓 Pong!', event.threadID);
  },
  
  '!time': (args, api, event) => {
    const time = new Date().toLocaleTimeString();
    api.sendMessage(`⏰ Current time: ${time}`, event.threadID);
  }
};

const appState = JSON.parse(fs.readFileSync('appState.json'));

login({ appState }, (err, api) => {
  if (err) return console.error(err);
  
  console.log('🤖 Bot started!');
  
  api.listenMqtt((err, event) => {
    if (err || event.type !== 'message') return;
    
    const { body, threadID } = event;
    if (!body) return;
    
    const [command, ...args] = body.split(' ');
    
    if (commands[command]) {
      commands[command](args, api, event);
    }
  });
});
```

### Auto-Reply Bot

```javascript
api.listenMqtt((err, event) => {
  if (err || event.type !== 'message') return;
  
  const responses = {
    'hello': '👋 Hi there!',
    'how are you': '😊 I\'m great, thanks for asking!',
    'bye': '👋 See you later!',
    'thanks': '❤️ You\'re welcome!'
  };
  
  const body = event.body?.toLowerCase() || '';
  
  Object.entries(responses).forEach(([trigger, response]) => {
    if (body.includes(trigger)) {
      api.sendMessage(response, event.threadID);
    }
  });
});
```

### Message Logger

```javascript
const fs = require('fs');

api.listenMqtt((err, event) => {
  if (err || event.type !== 'message') return;
  
  const log = {
    timestamp: new Date().toISOString(),
    sender: event.senderName,
    message: event.body,
    threadID: event.threadID
  };
  
  fs.appendFileSync('messages.log', JSON.stringify(log) + '\n');
  console.log(`✅ Logged: ${event.senderName} - ${event.body}`);
});
```

### E2EE Support

```javascript
// Connect to E2EE protected chats
api.connectE2EE((err) => {
  if (err) return console.error(err);
  
  console.log('🔐 E2EE connected!');
  
  // Listen to E2EE messages
  api.listenMqtt((err, event) => {
    if (event.type === 'message') {
      console.log('🔒 Encrypted message:', event.body);
    }
  });
});
```

### Proxy Configuration

```javascript
login({
  email: process.env.FB_EMAIL,
  password: process.env.FB_PASSWORD
}, {
  proxy: 'http://proxy.example.com:8080',
  autoReconnect: true
}, (err, api) => {
  if (err) return console.error(err);
  console.log('✅ Connected via proxy!');
});
```

---

## 💡 Examples

### Example 1: Welcome Bot

```javascript
const login = require('shan-fca');
const fs = require('fs');

const appState = JSON.parse(fs.readFileSync('appState.json'));

login({ appState }, (err, api) => {
  if (err) return console.error(err);
  
  api.listenMqtt((err, event) => {
    if (err || event.type !== 'message') return;
    
    if (event.isGroup) {
      api.sendMessage(`👋 Welcome to the group, ${event.senderName}!`, event.threadID);
    }
  });
});
```

### Example 2: Quote Bot

```javascript
const quotes = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Innovation distinguishes between a leader and a follower. - Steve Jobs",
  "Life is what happens when you're busy making other plans. - John Lennon"
];

api.listenMqtt((err, event) => {
  if (err || event.type !== 'message') return;
  
  if (event.body?.toLowerCase().includes('!quote')) {
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    api.sendMessage(`📝 ${quote}`, event.threadID);
  }
});
```

### Example 3: Admin Commands

```javascript
const ADMINS = ['123456789', '987654321'];

api.listenMqtt((err, event) => {
  if (err || event.type !== 'message') return;
  
  if (!ADMINS.includes(event.senderID)) return;
  
  const { body, threadID } = event;
  
  if (body?.startsWith('!mute')) {
    api.muteThread(threadID, 3600000, (err) => {
      api.sendMessage('🔇 Thread muted for 1 hour', threadID);
    });
  }
  
  if (body?.startsWith('!unmute')) {
    api.muteThread(threadID, 0, (err) => {
      api.sendMessage('🔊 Thread unmuted', threadID);
    });
  }
});
```

---

## 🐛 Troubleshooting

### Common Issues

#### Login Fails with "Wrong username/password"
- Verify credentials are correct
- Check if 2FA is enabled
- Try disabling browser extensions that intercept login
- Use app-specific password if 2FA is enabled

#### Messages Not Sending
```javascript
// Check thread ID is valid (should be numeric)
if (typeof threadID !== 'string' && typeof threadID !== 'number') {
  console.error('Invalid threadID');
}

// Verify not sending to invalid threads
api.getThreadInfo(threadID, (err, info) => {
  if (err) console.error('Thread not found:', err);
});
```

#### Disconnect Issues
```javascript
// Implement reconnection logic
function reconnect() {
  login({ appState }, (err, api) => {
    if (err) {
      console.error('Reconnect failed, retrying in 5s...');
      setTimeout(reconnect, 5000);
    } else {
      console.log('✅ Reconnected!');
    }
  });
}
```

#### Session Expired
```javascript
// Re-save appState periodically
setInterval(() => {
  api.getAppState((err, state) => {
    if (!err) {
      fs.writeFileSync('appState.json', JSON.stringify(state, null, 2));
    }
  });
}, 24 * 60 * 60 * 1000); // Every 24 hours
```

### Debug Mode

```javascript
const log = require('npmlog');

// Enable detailed logging
log.level = 'info'; // silly, debug, verbose, info, warn, error

login({ appState }, {
  logLevel: 'silly'
}, (err, api) => {
  // All operations will be logged
});
```

---

## 🔒 Security

### Best Practices

1. **Never commit credentials**
   ```javascript
   // ❌ BAD
   const login = require('shan-fca');
   login({
     email: 'your.email@gmail.com',
     password: 'your-password'
   }, ...);
   
   // ✅ GOOD
   login({
     email: process.env.FB_EMAIL,
     password: process.env.FB_PASSWORD
   }, ...);
   ```

2. **Use AppState in Production**
   ```javascript
   // Don't store passwords, use encrypted AppState
   const appState = require('./appState.json');
   login({ appState }, ...);
   ```

3. **Implement Rate Limiting**
   ```javascript
   const rateLimit = {};
   
   api.listenMqtt((err, event) => {
     if (event.type !== 'message') return;
     
     const userID = event.senderID;
     rateLimit[userID] = (rateLimit[userID] || 0) + 1;
     
     if (rateLimit[userID] > 10) {
       console.warn(`⚠️ Rate limit for ${userID}`);
       return; // Ignore
     }
   });
   ```

4. **Validate User Input**
   ```javascript
   const escapeHtml = (text) => {
     const map = {
       '&': '&amp;',
       '<': '&lt;',
       '>': '&gt;',
       '"': '&quot;',
       "'": '&#039;'
     };
     return text.replace(/[&<>"']/g, m => map[m]);
   };
   ```

5. **Use HTTPS/TLS for Proxies**
   ```javascript
   login(loginData, {
     proxy: 'https://secure-proxy:8080' // Use HTTPS
   }, ...);
   ```

---

## 📝 Environment Variables

Create `.env` file:

```env
FB_EMAIL=your.email@gmail.com
FB_PASSWORD=your-password
PROXY_URL=http://proxy:8080
LOG_LEVEL=info
```

Load with `dotenv`:

```bash
npm install dotenv
```

```javascript
require('dotenv').config();

login({
  email: process.env.FB_EMAIL,
  password: process.env.FB_PASSWORD
}, {
  proxy: process.env.PROXY_URL,
  logLevel: process.env.LOG_LEVEL
}, ...);
```
---

## ⚠️ Disclaimer

**This is an unofficial library.** It is not endorsed by Facebook or Meta Platforms, Inc.

- Use responsibly and comply with Facebook's Terms of Service
- Unauthorized bots may result in account restrictions or bans
- Do not spam, harass, or abuse the platform
- Respect user privacy and data
- This library is for educational purposes

---

## 📄 License

MIT License - See LICENSE file for details

---

## 📞 Support & Contact

- **Facebook**: [Facebook](https://facebook.com/Sh4nDev1)
- **GitHub Issues**: [Report bugs](https://github.com/Sh4nDev/shan-fca/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/Sh4nDev/shan-fca/discussions)
- **Developer**: [@Sh4nDev](https://github.com/Sh4nDev)

---

## 🎉 Acknowledgments

Built with ❤️ by the ShAn Development Team
