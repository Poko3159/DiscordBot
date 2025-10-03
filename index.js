// index.js
const express = require("express");
const { DateTime } = require("luxon");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const fs = require("fs");

const { safeDefer, safeReplyOrFollow, safeEdit } = require("./safe-interaction");

// HTTP keep-alive for Render/hosts
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", function (req, res) { res.send("Bot is alive!"); });
app.listen(PORT, "0.0.0.0", function () { console.log("Server is running on port " + PORT); });

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// OpenAI client (ensure your installed openai package matches usage)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Clash of Clans config
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const REMINDER_FILE = "./reminders.json";

// === Reminder Storage ===
function loadReminders() {
  try {
    if (!fs.existsSync(REMINDER_FILE)) return {};
    const raw = fs.readFileSync(REMINDER_FILE, "utf8");
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load/parse reminders file, returning empty reminders:", err);
    return {};
  }
}

function saveReminders(data) {
  try {
    fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to save reminders file:", err);
  }
}

function rescheduleReminders() {
  const reminders = loadReminders();
  const now = Date.now();

  for (const userId in reminders) {
    if (!Array.isArray(reminders[userId])) continue;
    for (const reminder of reminders[userId]) {
      // Expect reminder to have { id, time, message } shape
      const delay = (reminder && reminder.time ? reminder.time : 0) - now;
      if (delay <= 0) {
        // deliver immediately (async but fire-and-forget)
        deliverReminder(userId, reminder).catch(err => console.error('deliverReminder immediate error', err));
      } else {
        setTimeout(function () {
          deliverReminder(userId, reminder).catch(err => console.error('deliverReminder timeout error', err));
        }, delay);
      }
    }
  }
}

async function deliverReminder(userId, reminder) {
  try {
    const user = await client.users.fetch(userId);
    if (!user) throw new Error("User not found");
    await user.send("🔔 Reminder: " + reminder.message);

    // Remove reminder by id
    const reminders = loadReminders();
    if (reminders[userId]) {
      reminders[userId] = reminders[userId].filter(function (r) { return r.id !== reminder.id; });
      if (reminders[userId].length === 0) delete reminders[userId];
      saveReminders(reminders);
    }
  } catch (err) {
    const isUnknown = err && (err.code === 10013 || (err.rawError && err.rawError.code === 10013));
    if (isUnknown) {
      console.warn("Removing reminders for unknown user " + userId);
      const reminders = loadReminders();
      if (reminders[userId]) {
        delete reminders[userId];
        saveReminders(reminders);
      }
    } else {
      console.error("Failed to deliver reminder to " + userId + ":", err);
      // Do not delete reminders on transient errors
    }
  }
}

// === Helper Functions ===
async function getPlayerInfo(tag) {
  var sanitized = tag.replace("#", "");
  try {
    var res = await axios.get(COC_BASE_URL + "/players/%23" + sanitized, {
      headers: { Authorization: "Bearer " + COC_API_KEY }
    });
    return res.data;
  } catch (e) {
    console.error('getPlayerInfo error', e?.response?.status, e?.message);
    return { error: "Error fetching player data." };
  }
}

async function getClanInfo(tag) {
  var sanitized = tag.replace("#", "");
  try {
    var res = await axios.get(COC_BASE_URL + "/clans/%23" + sanitized, {
      headers: { Authorization: "Bearer " + COC_API_KEY }
    });
    return res.data;
  } catch (e) {
    console.error('getClanInfo error', e?.response?.status, e?.message);
    return { error: "Error fetching clan data." };
  }
}

async function getTopClans() {
  try {
    var res = await axios.get(COC_BASE_URL + "/locations/global/rankings/clans", {
      headers: { Authorization: "Bearer " + COC_API_KEY }
    });
    return res.data.items.slice(0, 5);
  } catch (e) {
    console.error('getTopClans error', e?.response?.status, e?.message);
    return { error: "Error fetching leaderboard." };
  }
}

async function getClanWarData(tag) {
  var sanitized = tag.replace("#", "");
  try {
    var res = await axios.get(COC_BASE_URL + "/clans/%23" + sanitized + "/currentwar", {
      headers: { Authorization: "Bearer " + COC_API_KEY }
    });
    return res.data;
  } catch (e) {
    console.error('getClanWarData error', e?.response?.status, e?.message);
    return { error: "Error fetching war data." };
  }
}

function playRps(choice) {
  var rpsChoices = ["rock", "paper", "scissors"];
  var bot = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
  if (choice === bot) return "It's a tie! We both chose " + bot + ".";
  if ((choice === "rock" && bot === "scissors") || (choice === "paper" && bot === "rock") || (choice === "scissors" && bot === "paper")) {
    return "You win! I chose " + bot + ".";
  }
  return "I win! I chose " + bot + ".";
}

async function roastUser(target) {
  try {
    // Best-effort: adapt to installed OpenAI SDK; if your SDK differs, update accordingly.
    var res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a humorous, sarcastic AI that generates funny but non-offensive roasts." },
        { role: "user", content: "Roast " + target + " in a funny but lighthearted way." }
      ]
    });
    return res.choices[0].message.content;
  } catch (e) {
    console.error('roastUser error', e?.message);
    return "Couldn't roast them this time!";
  }
}

async function aiTransform(prompt, input) {
  try {
    var res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: input }
      ]
    });
    return res.choices[0].message.content;
  } catch (e) {
    console.error('aiTransform error', e?.message);
    return "AI transformation failed.";
  }
}

// === Bot Ready ===
client.once("ready", async function () {
  console.log("✅ Logged in as " + (client.user ? client.user.tag : "unknown") + "!");

  var commands = [
    new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
    new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
    new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
      .addStringOption(function (opt) { return opt.setName("tag").setDescription("Player tag").setRequired(true); }),
    new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
      .addStringOption(function (opt) { return opt.setName("tag").setDescription("Clan tag").setRequired(true); }),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
    new SlashCommandBuilder().setName("ask").setDescription("Ask OpenAI anything.")
      .addStringOption(function (opt) { return opt.setName("question").setDescription("Your question").setRequired(true); })
      .addBooleanOption(function (opt) { return opt.setName("private").setDescription("Private reply only for you"); }),
    new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
      .addStringOption(function (opt) { return opt.setName("target").setDescription("Target to roast"); }),
    new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
      .addStringOption(function (opt) { return opt.setName("choice").setDescription("rock, paper, or scissors").setRequired(true); }),
    new SlashCommandBuilder().setName("poster").setDescription("Get current war data.")
      .addStringOption(function (opt) { return opt.setName("tag").setDescription("Clan tag").setRequired(true); }),
    new SlashCommandBuilder().setName("remindme").setDescription("Set a personal reminder.")
      .addStringOption(function (opt) { return opt.setName("time").setDescription("Time in minutes").setRequired(true); })
      .addStringOption(function (opt) { return opt.setName("message").setDescription("Reminder message").setRequired(true); }),
    new SlashCommandBuilder().setName("listreminders").setDescription("List your active reminders."),
    new SlashCommandBuilder().setName("cancelreminder").setDescription("Cancel a reminder.")
      .addStringOption(function (opt) { return opt.setName("id").setDescription("Reminder ID").setRequired(true); }),
    new SlashCommandBuilder().setName("summarise").setDescription("Summarise a block of text.")
      .addStringOption(function (opt) { return opt.setName("text").setDescription("Text to summarise").setRequired(true); }),
    new SlashCommandBuilder().setName("replysuggest").setDescription("Suggest a reply to a message.")
      .addStringOption(function (opt) { return opt.setName("text").setDescription("Message to reply to").setRequired(true); }),
    new SlashCommandBuilder().setName("fixgrammar").setDescription("Fix grammar and clarity.")
      .addStringOption(function (opt) { return opt.setName("text").setDescription("Text to improve").setRequired(true); }),
    new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages.")
      .addIntegerOption(function (opt) { return opt.setName("count").setDescription("Number of messages to delete").setRequired(true); }),
    new SlashCommandBuilder().setName("poll").setDescription("Create a quick poll.")
      .addStringOption(function (opt) { return opt.setName("question").setDescription("Poll question").setRequired(true); })
      .addStringOption(function (opt) { return opt.setName("options").setDescription("Comma-separated options").setRequired(true); })
  ].map(function (cmd) { return cmd.toJSON(); });

  var rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");
  } catch (err) {
    console.error('Failed to register slash commands', err);
  }

  rescheduleReminders(); // 🔄 Auto-reschedule reminders on startup
});

// === Interaction Handling ===
client.on("interactionCreate", async function (interaction) {
  if (!interaction.isChatInputCommand()) return;
  var commandName = interaction.commandName;
  var options = interaction.options;

  try {
    if (commandName === "ping") {
      await safeReplyOrFollow(interaction, { content: "🏓 Pong! I'm alive." });
    } else if (commandName === "help") {
      await safeReplyOrFollow(interaction, { content: "Available commands: /ping /help /player /clan /leaderboard /ask /roast /rps /poster /remindme /listreminders /cancelreminder /summarise /replysuggest /fixgrammar /purge /poll" });
    } else if (commandName === "player") {
      var tag = options.getString("tag");
      var info = await getPlayerInfo(tag);
      if (info.error) return await safeReplyOrFollow(interaction, { content: info.error, ephemeral: true });
      await safeReplyOrFollow(interaction, { content: "🏅 Player: " + info.name + "\n🏰 Clan: " + (info.clan && info.clan.name ? info.clan.name : "None") + "\n🏆 Trophies: " + info.trophies });
    } else if (commandName === "clan") {
      var tag = options.getString("tag");
      var info = await getClanInfo(tag);
      if (info.error) return await safeReplyOrFollow(interaction, { content: info.error, ephemeral: true });
      await safeReplyOrFollow(interaction, { content: "🏰 Clan: " + info.name + "\n📊 Members: " + info.members + "\n🏆 Points: " + info.clanPoints });
    } else if (commandName === "leaderboard") {
      var clans = await getTopClans();
      if (clans.error) return await safeReplyOrFollow(interaction, { content: clans.error, ephemeral: true });
      var list = clans.map(function (c, i) { return (i + 1) + ". " + c.name + " - " + c.clanPoints + " pts"; }).join("\n");
      await safeReplyOrFollow(interaction, { content: "🌍 Top 5 Global Clans:\n" + list });
    } else if (commandName === "ask") {
      var isPrivate = options.getBoolean("private") || false;
      await safeDefer(interaction, { ephemeral: isPrivate });
      var question = options.getString("question");
      try {
        var res = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: question }]
        });
        var content = res?.choices?.[0]?.message?.content ?? "No response from AI.";
        await safeEdit(interaction, { content });
      } catch (e) {
        console.error('OpenAI ask error', e?.message);
        await safeEdit(interaction, { content: "AI request failed.", ephemeral: true });
      }
    } else if (commandName === "roast") {
      var target = options.getString("target") || "you";
      await safeDefer(interaction, { ephemeral: true });
      const roast = await roastUser(target);
      await safeEdit(interaction, { content: roast });
    } else if (commandName === "rps") {
      var choice = options.getString("choice");
      await safeReplyOrFollow(interaction, { content: playRps(choice) });
    } else if (commandName === "poster") {
      var tag = options.getString("tag");
      var war = await getClanWarData(tag);
      if (war.error) return await safeReplyOrFollow(interaction, { content: war.error, ephemeral: true });
      await safeReplyOrFollow(interaction, { content: "War status: " + JSON.stringify(war) });
    } else if (commandName === "remindme") {
      var minutes = parseInt(options.getString("time"), 10);
      var message = options.getString("message");
      if (isNaN(minutes) || minutes <= 0) return await safeReplyOrFollow(interaction, { content: "Invalid time provided.", ephemeral: true });

      const reminders = loadReminders();
      const userId = interaction.user.id;
      const id = Date.now().toString() + "-" + Math.floor(Math.random() * 10000);
      const time = Date.now() + minutes * 60 * 1000;

      if (!reminders[userId]) reminders[userId] = [];
      reminders[userId].push({ id, time, message });
      saveReminders(reminders);

      // schedule single timer for this reminder
      setTimeout(() => deliverReminder(userId, { id, time, message }).catch(err => console.error('deliverReminder scheduled error', err)), time - Date.now());

      await safeReplyOrFollow(interaction, { content: `Reminder set for ${minutes} minute(s). ID: ${id}`, ephemeral: true });
    } else if (commandName === "listreminders") {
      const reminders = loadReminders();
      const userReminders = reminders[interaction.user.id] || [];
      if (userReminders.length === 0) return await safeReplyOrFollow(interaction, { content: "You have no active reminders.", ephemeral: true });
      const lines = userReminders.map(r => `${r.id} - ${DateTime.fromMillis(r.time).toLocaleString(DateTime.DATETIME_SHORT)} - ${r.message}`);
      await safeReplyOrFollow(interaction, { content: "Your reminders:\n" + lines.join("\n"), ephemeral: true });
    } else if (commandName === "cancelreminder") {
      const id = options.getString("id");
      const reminders = loadReminders();
      const userId = interaction.user.id;
      if (!reminders[userId]) return await safeReplyOrFollow(interaction, { content: "No reminders for you.", ephemeral: true });

      const before = reminders[userId].length;
      reminders[userId] = reminders[userId].filter(r => r.id !== id);
      if (reminders[userId].length === 0) delete reminders[userId];
      saveReminders(reminders);
      const after = reminders[userId] ? reminders[userId].length : 0;
      if (before === after) {
        await safeReplyOrFollow(interaction, { content: "Reminder ID not found.", ephemeral: true });
      } else {
        await safeReplyOrFollow(interaction, { content: "Reminder cancelled.", ephemeral: true });
      }
    } else if (commandName === "summarise") {
      const text = options.getString("text");
      await safeDefer(interaction, { ephemeral: false });
      try {
        const summary = await aiTransform("Summarise the following text concisely:", text);
        await safeEdit(interaction, { content: summary });
      } catch (e) {
        console.error('summarise error', e);
        await safeEdit(interaction, { content: "Summarisation failed.", ephemeral: true });
      }
    } else if (commandName === "replysuggest") {
      const text = options.getString("text");
      await safeDefer(interaction, { ephemeral: false });
      try {
        const suggestion = await aiTransform("Suggest a short reply to the following message:", text);
        await safeEdit(interaction, { content: suggestion });
      } catch (e) {
        console.error('replysuggest error', e);
        await safeEdit(interaction, { content: "Suggestion failed.", ephemeral: true });
      }
    } else if (commandName === "fixgrammar") {
      const text = options.getString("text");
      await safeDefer(interaction, { ephemeral: false });
      try {
        const fixed = await aiTransform("Fix grammar and clarity for the following text:", text);
        await safeEdit(interaction, { content: fixed });
      } catch (e) {
        console.error('fixgrammar error', e);
        await safeEdit(interaction, { content: "Grammar fix failed.", ephemeral: true });
      }
    } else if (commandName === "purge") {
      const count = options.getInteger("count");
      if (!interaction.memberPermissions || !interaction.memberPermissions.has || !interaction.memberPermissions.has("ManageMessages")) {
        // permission check fallback
        await safeReplyOrFollow(interaction, { content: "You do not have permission to purge messages.", ephemeral: true });
      } else {
        try {
          const fetched = await interaction.channel.messages.fetch({ limit: Math.min(100, Math.max(1, count)) });
          await interaction.channel.bulkDelete(fetched, true);
          await safeReplyOrFollow(interaction, { content: `Deleted ${fetched.size} messages.` });
        } catch (e) {
          console.error('purge error', e);
          await safeReplyOrFollow(interaction, { content: "Purge failed.", ephemeral: true });
        }
      }
    } else if (commandName === "poll") {
      const question = options.getString("question");
      const opts = options.getString("options").split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
      const content = `Poll: ${question}\nOptions:\n` + opts.map((o, i) => `${i + 1}. ${o}`).join("\n");
      await safeReplyOrFollow(interaction, { content });
    } else {
      await safeReplyOrFollow(interaction, { content: "Unknown command.", ephemeral: true });
    }
  } catch (err) {
    console.error("Interaction error:", err);
    try {
      await safeReplyOrFollow(interaction, { content: "❌ Something went wrong.", ephemeral: true });
    } catch (inner) {
      console.error('Failed to send error message for interaction', inner);
    }
  }
});

// === Start Bot ===
process.on('unhandledRejection', (reason, p) => { console.error('Unhandled Rejection at:', p, 'reason:', reason); });
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });

client.login(process.env.DISCORD_TOKEN).catch(err => console.error('Failed to login', err));