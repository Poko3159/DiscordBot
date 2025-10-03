// index.js
require('dotenv').config(); // load .env in dev
const express = require("express");
// DateTime removed (unused)
// const { DateTime } = require("luxon");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const fs = require("fs");

// fail early if required env vars missing
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

// --- Reminders storage ---
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
        // deliver immediately (do not await)
        deliverReminder(userId, reminder.message).catch(() => {});
      } else {
        setTimeout(() => {
          deliverReminder(userId, reminder.message).catch(() => {});
        }, delay);
      }
    }
  }
}

// --- Helper: Clash of Clans ---
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

// --- Minimal AI call wrapper (keeps compile-time safe) ---
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
      .addStringOption(opt => opt.setName("question").setDescription("Question").setRequired(true))
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
