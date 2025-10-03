require('dotenv').config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const fs = require("fs");

// early env check
if (!process.env.DISCORD_TOKEN || !process.env.OPENAI_API_KEY) {
  console.error("Missing required environment variables. Ensure DISCORD_TOKEN and OPENAI_API_KEY are set.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", function (req, res) { res.send("Bot is alive!"); });
app.listen(PORT, "0.0.0.0", function () { console.log("Server is running on port " + PORT); });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COC_API_KEY = process.env.COC_API_KEY || "";
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const REMINDER_FILE = "./reminders.json";

// --- Broadcast config (env) ---
const GLOBAL_CHANNEL_ID = process.env.GLOBAL_CHANNEL_ID || "";
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID || "";
const BROADCAST_FILE = "./last_broadcast.json";
const BROADCAST_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BROADCAST_DESCRIPTION = "To Apply to a Lost Family clan, Request support, or Enquire about a Partnership or Paid promotion, please navigate to Tickets channel and select the relevant option";
const BROADCAST_TITLE = "Lost Reminder";
const BROADCAST_COLOR = 0x9e6bff;

// --- Reminders helpers (unchanged) ---
function loadReminders() {
  try {
    if (!fs.existsSync(REMINDER_FILE)) return {};
    const raw = fs.readFileSync(REMINDER_FILE, "utf8");
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load reminders:", err);
    return {};
  }
}

function saveReminders(data) {
  try {
    fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save reminders:", err);
  }
}

async function deliverReminder(userId, message) {
  try {
    const user = await client.users.fetch(userId);
    if (!user) throw new Error("User not found");
    await user.send("🔔 Reminder: " + message);

    const reminders = loadReminders();
    if (reminders[userId]) {
      reminders[userId] = reminders[userId].filter(r => r.message !== message);
      if (reminders[userId].length === 0) delete reminders[userId];
      saveReminders(reminders);
    }
  } catch (err) {
    const isUnknown = err && (err.code === 10013 || (err.rawError && err.rawError.code === 10013));
    if (!isUnknown) console.error("Failed to deliver reminder to " + userId + ":", err);
    else {
      console.warn("Removing reminders for unknown user " + userId);
      const reminders = loadReminders();
      if (reminders[userId]) {
        delete reminders[userId];
        saveReminders(reminders);
      }
    }
  }
}

function rescheduleReminders() {
  const reminders = loadReminders();
  const now = Date.now();
  for (const userId in reminders) {
    if (!Array.isArray(reminders[userId])) continue;
    for (const reminder of reminders[userId]) {
      const time = Number(reminder && reminder.time) || 0;
      const delay = time - now;
      if (delay <= 0) {
        deliverReminder(userId, reminder.message).catch(() => {});
      } else {
        setTimeout(() => {
          deliverReminder(userId, reminder.message).catch(() => {});
        }, delay);
      }
    }
  }
}

// --- Clash of Clans helpers (unchanged) ---
async function getPlayerInfo(tag) {
  const sanitized = (tag || "").replace("#", "");
  try {
    const res = await axios.get(COC_BASE_URL + "/players/%23" + sanitized, {
      headers: { Authorization: "Bearer " + COC_API_KEY }
    });
    return res.data;
  } catch (e) {
    return { error: "Error fetching player data." };
  }
}

async function getClanInfo(tag) {
  const sanitized = (tag || "").replace("#", "");
  try {
    const res = await axios.get(COC_BASE_URL + "/clans/%23" + sanitized, {
      headers: { Authorization: "Bearer " + COC_API_KEY }
    });
    return res.data;
  } catch (e) {
    return { error: "Error fetching clan data." };
  }
}

// --- Minimal AI call wrapper (unchanged) ---
async function askAI(prompt) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }]
    });
    return res.choices && res.choices[0] && res.choices[0].message ? res.choices[0].message.content : "No response";
  } catch (e) {
    console.error("AI error:", e);
    return "AI error.";
  }
}

// --- Broadcast persistence helpers ---
function loadBroadcastRecord() {
  try {
    if (!fs.existsSync(BROADCAST_FILE)) return {};
    const raw = fs.readFileSync(BROADCAST_FILE, "utf8");
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load broadcast record:", e);
    return {};
  }
}

function saveBroadcastRecord(obj) {
  try {
    fs.writeFileSync(BROADCAST_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save broadcast record:", e);
  }
}

// --- Send scheduled broadcast ---
async function sendScheduledBroadcast() {
  if (!GLOBAL_CHANNEL_ID) {
    console.warn("GLOBAL_CHANNEL_ID not set — skipping scheduled broadcast.");
    return { ok: false, error: "GLOBAL_CHANNEL_ID not configured" };
  }
  try {
    const channel = await client.channels.fetch(GLOBAL_CHANNEL_ID).catch(() => null);
    if (!channel || typeof channel.send !== "function") {
      console.warn("Broadcast channel not available or not a text channel:", GLOBAL_CHANNEL_ID);
      return { ok: false, error: "channel not available" };
    }

    // compute tickets URL using the same guild as the broadcast channel
    const guildId = channel.guildId || (channel.guild ? channel.guild.id : null);
    let ticketsUrl = null;
    if (TICKETS_CHANNEL_ID && guildId) {
      ticketsUrl = "https://discord.com/channels/" + guildId + "/" + TICKETS_CHANNEL_ID;
    }

    // delete previous message if present
    const record = loadBroadcastRecord();
    if (record && record.messageId) {
      try {
        const prev = await channel.messages.fetch(record.messageId).catch(() => null);
        if (prev && prev.delete) await prev.delete().catch(() => {});
      } catch (e) {
        // ignore deletion errors
      }
    }

    // compose embed and button(s)
    const embed = new EmbedBuilder()
      .setTitle(BROADCAST_TITLE)
      .setDescription(BROADCAST_DESCRIPTION)
      .setColor(BROADCAST_COLOR);

    const row = new ActionRowBuilder();
    if (ticketsUrl) {
      const btn = new ButtonBuilder()
        .setLabel("Go to Tickets")
        .setStyle(ButtonStyle.Link)
        .setURL(ticketsUrl);
      row.addComponents(btn);
    } else if (TICKETS_CHANNEL_ID) {
      const btn = new ButtonBuilder()
        .setLabel("Open Tickets")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("open_tickets_button");
      row.addComponents(btn);
    }

    const components = row.components.length > 0 ? [row] : [];

    const sent = await channel.send({ embeds: [embed], components: components });
    if (sent && sent.id) {
      saveBroadcastRecord({ channelId: channel.id, messageId: sent.id, sentAt: Date.now() });
    }
    return { ok: true, messageId: sent && sent.id ? sent.id : null };
  } catch (e) {
    console.error("Error sending scheduled broadcast:", e);
    return { ok: false, error: e.message || String(e) };
  }
}

// handle the fallback button click (if we used customId)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId === "open_tickets_button") {
    if (TICKETS_CHANNEL_ID) {
      await interaction.reply({ content: "Go to: <#" + TICKETS_CHANNEL_ID + ">", ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: "Tickets channel not configured.", ephemeral: true }).catch(() => {});
    }
  }
});

// --- Bot ready / commands registration ---
client.once("ready", async () => {
  console.log("✅ Logged in as " + (client.user ? client.user.tag : "unknown") + "!");

  const commands = [
    new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
    new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
      .addStringOption(opt => opt.setName("tag").setDescription("Player tag").setRequired(true)),
    new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
      .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
    new SlashCommandBuilder().setName("ask").setDescription("Ask the AI a question.")
      .addStringOption(opt => opt.setName("question").setDescription("Question").setRequired(true)),
    new SlashCommandBuilder().setName("lostreminder").setDescription("Send the Lost Reminder broadcast now."),
    new SlashCommandBuilder().setName("help").setDescription("List bot commands and short descriptions.")
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");
  } catch (e) {
    console.error("Failed to register commands:", e);
  }

  // restore reminders after login
  rescheduleReminders();

  // start scheduled broadcasts: immediately, then every 6 hours
  try {
    await sendScheduledBroadcast();
  } catch (e) {
    console.error("Initial broadcast failed:", e);
  }
  setInterval(() => {
    sendScheduledBroadcast().catch(() => {});
  }, BROADCAST_INTERVAL_MS);
});

// --- Interactions ---
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options } = interaction;

  try {
    if (commandName === "ping") {
      await interaction.reply("🏓 Pong! I'm alive.");
      return;
    }

    if (commandName === "player") {
      const tag = options.getString("tag");
      const info = await getPlayerInfo(tag);
      if (info.error) return await interaction.reply(info.error);
      return await interaction.reply("🏅 Player: " + info.name + "\n🏰 Clan: " + (info.clan && info.clan.name ? info.clan.name : "None") + "\n🏆 Trophies: " + info.trophies);
    }

    if (commandName === "clan") {
      const tag = options.getString("tag");
      const info = await getClanInfo(tag);
      if (info.error) return await interaction.reply(info.error);
      return await interaction.reply("🏰 Clan: " + info.name + "\n📊 Members: " + info.members + "\n🏆 Points: " + info.clanPoints);
    }

    if (commandName === "ask") {
      await interaction.deferReply();
      const question = options.getString("question");
      const answer = await askAI(question);
      return await interaction.editReply(answer);
    }

    if (commandName === "lostreminder") {
      await interaction.deferReply({ ephemeral: true });
      const res = await sendScheduledBroadcast();
      if (res.ok) return await interaction.editReply("Lost Reminder broadcast sent.");
      return await interaction.editReply("Failed to send broadcast: " + (res.error || "unknown"));
    }

    if (commandName === "help") {
      const helpText = [
        "/ping — Check if the bot is alive.",
        "/player <tag> — Get info about a Clash player.",
        "/clan <tag> — Get info about a Clash clan.",
        "/ask <question> — Ask the AI a question.",
        "/lostreminder — Send the Lost Reminder broadcast now.",
        "/help — Show this help text."
      ].join("\n");
      return await interaction.reply({ content: helpText, ephemeral: true });
    }

  } catch (err) {
    console.error("Interaction error:", err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: "❌ Something went wrong.", ephemeral: true });
      } else {
        await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
      }
    } catch (e) {
      console.error("Failed to send error reply:", e);
    }
  }
});

// --- Start ---
client.login(process.env.DISCORD_TOKEN);
