import TelegramBot from 'node-telegram-bot-api';
import { MongoClient } from 'mongodb';
import express from 'express';
import fs from 'fs';
import path from 'path';
import https from 'https';

const BOT_TOKEN = '7763399646:AAE2h_J58u8x05z161rCV44f0SDT0cdPHBc';
const ADMIN_ID = 6186936436;
const MONGO_URI = 'mongodb+srv://toshidev0:zcode22107@dbtxt.3dxoaud.mongodb.net/pyhost?retryWrites=true&w=majority';
const ADMIN_TOKEN = 'yawara';

const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db('pyhost');
const collection = db.collection('txtdata');
const progressCollection = db.collection('user_progress');

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());
app.use(express.static('public'));

const uploadState = new Set();

function premiumInlineKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '💎 Become Premium', url: 'https://t.me/YOUR_ADMIN_USERNAME' }],
      [{ text: '⏱ Check Remaining Time', callback_data: 'check_remaining' }]
    ]
  };
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeText =
    "**Hey 𝗟𝗨𝗫 • 𝐑𝐢𝐤𝐮𝐮𝐲𝐚 ✧ 𖣂︎! 👋**\n\n" +
    "**Welcome to the TXT Bot.**\n" +
    "**Use /txt to get your 1k lines of text file.**\n" +
    "**Admins can upload new files with /upload.**\n" +
    "**Use /gettxtsites for free text sources.**\n" +
    "**Enjoy! 🚀**";
  const photoUrl = 'https://i.ibb.co/svppp8bn/rikuuya.jpg';
  await bot.sendPhoto(chatId, photoUrl, { caption: welcomeText, parse_mode: 'Markdown' });
});

bot.onText(/\/upload/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) {
    await bot.sendMessage(msg.chat.id, '**Only admin can use this command.**', { parse_mode: 'Markdown' });
    return;
  }
  uploadState.add(msg.from.id);
  await bot.sendMessage(msg.chat.id, '**Send the .txt file now.**', { parse_mode: 'Markdown' });
});

function downloadFile(fileUrl) {
  return new Promise((resolve, reject) => {
    https.get(fileUrl, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', reject);
  });
}

bot.on('document', async (msg) => {
  const userId = msg.from.id;
  if (userId !== ADMIN_ID || !uploadState.has(userId)) {
    await bot.sendMessage(msg.chat.id, '**Unauthorized or /upload not used.**', { parse_mode: 'Markdown' });
    return;
  }
  const doc = msg.document;
  if (!doc.file_name.endsWith('.txt')) {
    await bot.sendMessage(msg.chat.id, '**Only .txt files are allowed.**', { parse_mode: 'Markdown' });
    return;
  }
  const fileId = doc.file_id;
  const fileLink = await bot.getFileLink(fileId);
  const fileBuffer = await downloadFile(fileLink);
  const content = Buffer.from(fileBuffer).toString('utf-8');
  const lines = content.split(/\r?\n/);
  await collection.deleteMany({});
  for (let i = 0; i < lines.length; i += 1000) {
    const chunk = lines.slice(i, i + 1000);
    await collection.insertOne({ chunk_id: Math.floor(i / 1000), lines: chunk });
  }
  uploadState.delete(userId);
  await bot.sendMessage(msg.chat.id, `**File uploaded successfully with ${lines.length} lines.**`, { parse_mode: 'Markdown' });
});

bot.onText(/\/txt/, async (msg) => {
  const userId = msg.from.id.toString();
  const now = new Date();
  if (userId == ADMIN_ID.toString()) {
    const userData = await progressCollection.findOne({ user_id: userId }) || {};
    const chunkId = userData.chunk_id || 0;
    const chunk = await collection.findOne({ chunk_id: chunkId });
    if (!chunk) {
      await bot.sendMessage(msg.chat.id, '**No more text chunks available.**', { parse_mode: 'Markdown' });
      return;
    }
    const textContent = chunk.lines.join('\n');
    const fileName = 'RIKUUYAFREE.txt';
    const filePath = path.join('./', fileName);
    fs.writeFileSync(filePath, textContent, 'utf8');
    await bot.sendDocument(msg.chat.id, filePath);
    fs.unlinkSync(filePath);
    await collection.deleteOne({ chunk_id: chunkId });
    await progressCollection.updateOne({ user_id: userId }, { $set: { chunk_id: chunkId + 1 } }, { upsert: true });
    return;
  }
  const userData = await progressCollection.findOne({ user_id: userId }) || {};
  const isPremium = userData.is_premium || false;
  const chunkId = userData.chunk_id || 0;
  if (!isPremium && userData.last_access) {
    const lastAccess = new Date(userData.last_access);
    const diff = now - lastAccess;
    if (diff < 24 * 3600 * 1000) {
      const waitMs = 24 * 3600 * 1000 - diff;
      const waitHours = Math.floor(waitMs / (3600 * 1000));
      const waitMinutes = Math.floor((waitMs % (3600 * 1000)) / (60 * 1000));
      await bot.sendMessage(msg.chat.id,
        `**Free users can use this once per day.**\n⏳ **Try again in 0d ${waitHours}h ${waitMinutes}m**`,
        { parse_mode: 'Markdown', reply_markup: premiumInlineKeyboard() });
      return;
    }
  }
  const chunk = await collection.findOne({ chunk_id: chunkId });
  if (!chunk) {
    await bot.sendMessage(msg.chat.id, "**You've reached the end of the file.**", { parse_mode: 'Markdown' });
    return;
  }
  const textContent = chunk.lines.join('\n');
  const fileName = 'RIKUUYAFREE.txt';
  const filePath = path.join('./', fileName);
  fs.writeFileSync(filePath, textContent, 'utf8');
  await bot.sendDocument(msg.chat.id, filePath);
  fs.unlinkSync(filePath);
  await collection.deleteOne({ chunk_id: chunkId });
  await progressCollection.updateOne({ user_id: userId }, {
    $set: {
      chunk_id: chunkId + 1,
      last_access: now,
      is_premium: isPremium
    }
  }, { upsert: true });
});

bot.onText(/\/gettxtsites/, async (msg) => {
  const txtSites = `
Free TXT Sites:
- https://example1.com
- https://example2.com
- https://example3.com
Use these sites to find more TXT files.
  `.trim();
  await bot.sendMessage(msg.chat.id, txtSites);
});

bot.onText(/\/help/, async (msg) => {
  const isAdmin = msg.from.id === ADMIN_ID;
  let helpMessage = `
Available Commands:
/start - Start bot and see welcome message
/txt - Get your 1000 lines text file (once per day for free users)
/gettxtsites - Get free TXT file source sites
/help - Show this help message
`;

  if (isAdmin) {
    helpMessage += `
Admin Commands:
/upload - Upload new .txt file to DB
(Use admin dashboard for premium/ban/remove users)
`;
  } else {
    helpMessage += `
Get premium for unlimited access by contacting admin.
`;
  }

  await bot.sendMessage(msg.chat.id, helpMessage.trim(), { parse_mode: 'Markdown' });
});

bot.on('callback_query', async (query) => {
  const userId = query.from.id.toString();
  if (query.data === 'check_remaining') {
    const userData = await progressCollection.findOne({ user_id: userId }) || {};
    const chunkId = userData.chunk_id || 0;
    await bot.answerCallbackQuery(query.id, { text: `You are on chunk #${chunkId}` });
  }
});

app.get('/api/admin/users', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  const users = await progressCollection.find({}).toArray();
  const chunks = await collection.find({}).toArray();
  const totalLinesLeft = chunks.reduce((acc, c) => acc + c.lines.length, 0);
  const userData = users.map(user => ({
    userId: user.user_id,
    isPremium: !!user.is_premium,
    chunk_id: user.chunk_id || 0,
  }));
  res.json({ linesLeft: totalLinesLeft, users: userData });
});

app.post('/api/admin/user/:userId/premium', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  const userId = req.params.userId;
  const { makePremium } = req.body;
  await progressCollection.updateOne(
    { user_id: userId },
    { $set: { is_premium: !!makePremium } },
    { upsert: true }
  );
  res.json({ success: true });
});

app.post('/api/admin/user/:userId/remove', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  const userId = req.params.userId;
  await progressCollection.deleteOne({ user_id: userId });
  res.json({ success: true });
});

app.listen(3000, () => {
  console.log('Admin API running on http://localhost:3000');
});

console.log('Bot started...');
