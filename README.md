# 🔥 ShAn-FCA - Facebook Chat API

[![GitHub](https://img.shields.io/badge/GitHub-Sh4nDev%2Fshan--fca-blue?logo=github)](https://github.com/Sh4nDev/shan-fca)
[![Language](https://img.shields.io/badge/Language-JavaScript-yellow?logo=javascript)](https://www.javascript.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen)]()
[![npm version](https://img.shields.io/npm/v/shan-fca?logo=npm)](https://www.npmjs.com/package/shan-fca)
[![Node Version](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen?logo=node.js)](https://nodejs.org/)

> 🤖 **An advanced, unofficial Facebook Messenger API library for Node.js** - Build powerful bots with ease.

---

## 📋 Table of Contents

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
- [Contributing](#-contributing)
- [License](#-license)
- [Support](#-support)

---

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
- ✅ **Message Reactions** - Add/remove emoji reactions to messages

### Advanced Features
- 🔐 **End-to-End Encryption (E2EE)** - Secure messaging for encrypted chats
- 🌐 **Proxy Support** - Route traffic through proxy servers
- 🔄 **Auto-Reconnection** - Automatic reconnection with exponential backoff
- 📊 **Presence Detection** - Track user online/offline status
- ⚡ **High Performance** - Native bindings for critical operations
- 🎯 **Event Streaming** - Real-time message streaming via MQTT
- 💾 **Session Management** - Persistent sessions across restarts
- 🛡️ **Error Recovery** - Robust error handling and recovery mechanisms
- 🎨 **Theme Customization** - Predefined themes and custom color support
- 📱 **Multi-Account Support** - Run multiple bot instances simultaneously

---

## 📦 Installation

### Prerequisites
- **Node.js** >= 12.0.0
- **npm** >= 6.0.0 or **yarn** >= 1.22.0

### Install via npm
```bash
npm install shan-fca
```

### Install via yarn
```bash
yarn add shan-fca
```

### Verify Installation
```bash
node -e "const login = require('shan-fca'); console.log('✅ ShAn-FCA installed successfully!');"
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
    api.sendMessage('Hello from ShAn-FCA! 🤖', '123456789', (err) => {
      if (err) console.error(err);
      else console.log('✅ Message sent!');
    });
  }
);
```

### Using Promise/Async-Await

```javascript
const login = require('shan-fca');

(async () => {
  try {
    const api = await login({
      email: 'your.email@gmail.com',
      password: 'your-password'
    });
    
    console.log('✅ Logged in!');
    
    // Send message
    await api.sendMessage('Hello!', '123456789');
    console.log('✅ Message sent!');
    
    // Listen to messages
    api.listenMqtt((err, event) => {
      if (event.type === 'message') {
        console.log(`📨 ${event.senderName}: ${event.body}`);
      }
    });
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
```

---

## 🔐 Authentication

### Method 1: Email & Password

```javascript
login({
  email: process.env.FB_EMAIL,
  password: process.env.FB_PASSWORD
}, (err, api) => {
  if (err) return console.error(err);
  console.log('✅ Logged in!');
});
```

### Method 2: AppState (Recommended for Production)

```javascript
const appState = JSON.parse(fs.readFileSync('appState.json'));

login({ appState }, (err, api) => {
  if (err) return console.error('❌ Session expired');
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
    const code = prompt('Enter 2FA code: ');
    err.continue(code)
      .then(api => console.log('✅ Logged in with 2FA!'))
      .catch(err => console.error('❌ Invalid 2FA code'));
  }
});
```

---

## 📚 API Reference

### Send Message

```javascript
// Basic text
api.sendMessage('Hello World!', threadID, (err, info) => {
  if (err) console.error(err);
});

// With attachments
api.sendMessage({
  body: 'Check this!',
  attachment: fs.createReadStream('image.png')
}, threadID);

// With mentions
api.sendMessage({
  body: 'Hey {{User}}, check this!',
  mentions: [{ tag: 'User', id: '123456789' }]
}, threadID);

// With sticker
api.sendMessage({ sticker: 'STICKER_ID' }, threadID);
```

### Thread Management

```javascript
// Get thread info
api.getThreadInfo(threadID, (err, info) => {
  console.log('Name:', info.threadName);
  console.log('Participants:', info.participantIDs);
});

// Rename thread
api.changeThreadSubject('New Name', threadID, callback);

// Change color
api.changeThreadColor('#0084FF', threadID, callback);

// Add user
api.addUserToGroup(userID, threadID, callback);

// Remove user
api.removeUserFromGroup(userID, threadID, callback);

// Mute/Unmute
api.muteThread(threadID, 3600000, callback); // 1 hour
api.muteThread(threadID, 0, callback); // Unmute
```

### User Information

```javascript
// Get user info
api.getUserInfo(userID, (err, info) => {
  console.log('Name:', info[userID].name);
  console.log('Photo:', info[userID].photo);
});

// Search users
api.searchForUser('John', (err, results) => {
  results.forEach(user => console.log(user.name));
});

// Current user ID
const myID = api.getCurrentUserID();
```

### Edit & Delete Messages

```javascript
// Edit
api.editMessage('Updated!', messageID, callback);

// Delete
api.unsendMessage(messageID, callback);

// React
api.setMessageReaction('👍', messageID, callback);
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
    case 'typing':
      console.log(`⌨️ ${event.senderName} is typing...`);
      break;
    case 'reaction':
      console.log(`😊 ${event.senderName} reacted with ${event.reaction}`);
      break;
  }
});
```

### Event Types

| Event | Description | Data |
|-------|-------------|------|
| `message` | New message | `body`, `senderID`, `threadID`, `attachments` |
| `messageEdit` | Message edited | `messageID`, `body`, `senderID` |
| `messageUnsend` | Message deleted | `messageID`, `senderID` |
| `reaction` | Reaction added | `messageID`, `reaction`, `userID` |
| `typing` | User typing | `isTyping`, `userID`, `threadID` |
| `readReceipt` | Message read | `reader`, `time`, `threadID` |
| `presence` | Online status | `userID`, `statuses` |

---

## ⚙️ Configuration

```javascript
login(loginData, {
  online: true,
  selfListen: false,
  listenEvents: true,
  autoMarkDelivery: true,
  autoMarkRead: false,
  listenTyping: true,
  autoReconnect: true,
  logLevel: 'info', // silly, debug, verbose, info, warn, error
  userAgent: 'Mozilla/5.0...',
  proxy: 'http://proxy:port'
}, (err, api) => {
  // ...
});
```

---

## 🎯 Advanced Usage

### Command Bot

```javascript
const commands = {
  '!help': (args, api, event) => {
    api.sendMessage('📚 Commands available', event.threadID);
  },
  '!ping': (args, api, event) => {
    api.sendMessage('🏓 Pong!', event.threadID);
  }
};

api.listenMqtt((err, event) => {
  if (err || event.type !== 'message') return;
  
  const [cmd, ...args] = event.body.split(' ');
  if (commands[cmd]) {
    commands[cmd](args, api, event);
  }
});
```

### Auto-Reply Bot

```javascript
const responses = {
  'hello': '👋 Hi there!',
  'how are you': '😊 Great!',
  'bye': '👋 See you!'
};

api.listenMqtt((err, event) => {
  if (err || event.type !== 'message') return;
  
  const body = event.body?.toLowerCase() || '';
  Object.entries(responses).forEach(([trigger, response]) => {
    if (body.includes(trigger)) {
      api.sendMessage(response, event.threadID);
    }
  });
});
```

### Rate Limiting

```javascript
const userLimits = {};
const LIMIT = 10;

api.listenMqtt((err, event) => {
  if (event.type !== 'message') return;
  
  const userID = event.senderID;
  userLimits[userID] = (userLimits[userID] || 0) + 1;
  
  if (userLimits[userID] > LIMIT) {
    console.warn(`⚠️ Rate limit for ${userID}`);
    return;
  }
});
```

---

## 💡 Examples

### Example 1: Quote Bot

```javascript
const quotes = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Stay hungry, stay foolish. - Steve Jobs"
];

api.listenMqtt((err, event) => {
  if (err || event.type !== 'message') return;
  
  if (event.body?.includes('!quote')) {
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    api.sendMessage(`📝 ${quote}`, event.threadID);
  }
});
```

### Example 2: Admin Commands

```javascript
const ADMINS = ['123456789', '987654321'];

api.listenMqtt((err, event) => {
  if (err || !ADMINS.includes(event.senderID)) return;
  
  const { body, threadID } = event;
  
  if (body?.startsWith('!mute')) {
    api.muteThread(threadID, 3600000, () => {
      api.sendMessage('🔇 Muted for 1 hour', threadID);
    });
  }
});
```

---

## 🐛 Troubleshooting

### Login Issues
```javascript
// Check credentials
// Try 2FA if enabled
// Verify account isn't locked
```

### Messages Not Sending
```javascript
// Verify thread ID is valid
api.getThreadInfo(threadID, (err, info) => {
  if (err) console.error('Thread not found');
});
```

### Reconnection
```javascript
let attempts = 0;

function reconnect() {
  if (attempts >= 5) return;
  
  const delay = Math.pow(2, attempts) * 1000;
  setTimeout(() => {
    login({ appState }, (err, api) => {
      if (err) {
        attempts++;
        reconnect();
      } else {
        attempts = 0;
        console.log('✅ Reconnected!');
      }
    });
  }, delay);
}
```

### Debug Mode
```javascript
login({ appState }, {
  logLevel: 'silly'
}, (err, api) => {
  // Full logging enabled
});
```

---

## 🔒 Security

### Best Practices

1. **Use Environment Variables**
```bash
# .env
FB_EMAIL=your@email.com
FB_PASSWORD=your_password
```

2. **Use AppState in Production**
```javascript
// Don't store passwords
const appState = require('./appState.json');
login({ appState }, callback);
```

3. **Add to .gitignore**
```
appState.json
.env
*.log
```

4. **Validate Input**
```javascript
function sanitize(text) {
  return text
    .replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', 
      '>': '&gt;', '"': '&quot;',
      "'": '&#039;'
    }[m]))
    .trim();
}
```

5. **Use HTTPS for Proxies**
```javascript
login(data, {
  proxy: 'https://secure-proxy:8080'
}, callback);
```

---

## 📝 Environment Variables

```bash
# Install dotenv
npm install dotenv
```

```javascript
require('dotenv').config();

login({
  email: process.env.FB_EMAIL,
  password: process.env.FB_PASSWORD
}, {
  logLevel: process.env.LOG_LEVEL
}, callback);
```

---

## ⚠️ Disclaimer

**This is an unofficial library.** Not endorsed by Facebook/Meta.

- ⚠️ Use responsibly and comply with Facebook's ToS
- ⚠️ Unauthorized bots may face account restrictions
- ⚠️ Don't spam, harass, or abuse the platform
- ⚠️ Respect user privacy and data protection
- ⚠️ For educational purposes only
- ⚠️ Developers not responsible for misuse

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

## 📞 Support

- **Issues**: [Report bugs](https://github.com/Sh4nDev/shan-fca/issues)
- **Discussions**: [Ask questions](https://github.com/Sh4nDev/shan-fca/discussions)
- **Facebook**: [Sh4nDev](https://facebook.com/Sh4nDev1)
- **GitHub**: [@Sh4nDev](https://github.com/Sh4nDev)

---

## 🎉 Acknowledgments

Built with ❤️ by the ShAn Development Team

---

<div align="center">

**⭐ If you find this helpful, please give it a star!** ⭐

Built with ❤️ for the Facebook Bot community

**[↑ Back to Top](#-shAn-fca---facebook-chat-api)**

</div>
