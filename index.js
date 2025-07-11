const express = require("express");
const app = express();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");

// Express server for uptime
app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID;

const rpsChoices = ["rock", "paper", "scissors"];

// Helper functions
async function getPlayerInfo(playerTag) {
  try {
    const tag = playerTag.replace("#", "");
    const res = await axios.get(`${COC_BASE_URL}/players/%23${tag}`, {
      headers: { Authorization: `Bearer ${COC_API_KEY}` },
    });
    return res.data;
  } catch (e) {
    return { error: "Failed to fetch player data." };
  }
}

async function getClanInfo(clanTag) {
  try {
    const tag = clanTag.replace("#", "");
    const res = await axios.get(`${COC_BASE_URL}/clans/%23${tag}`, {
      headers: { Authorization: `Bearer ${COC_API_KEY}` },
    });
    return res.data;
  } catch (e) {
    return { error: "Failed to fetch clan data." };
  }
}

async function getTopClans() {
  try {
    const res = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
      headers: { Authorization: `Bearer ${COC_API_KEY}` },
    });
    return res.data.items.slice(0, 5);
  } catch (e) {
    return { error: "Failed to fetch leaderboard." };
  }
}

async function getClanWarData(clanTag) {
  try {
    const tag = clanTag.replace("#", "");
    const res = await axios.get(`${COC_BASE_URL}/clans/%23${tag}/currentwar`, {
      headers: { Authorization: `Bearer ${COC_API_KEY}` },
    });
    return res.data;
  } catch (e) {
    return { error: "Failed to fetch war data." };
  }
}

function playRps(userChoice) {
  const botChoice = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
  if (userChoice === botChoice) return `It's a tie! We both chose ${botChoice}.`;
  if (
    (userChoice === "rock" && botChoice === "scissors") ||
    (userChoice === "paper" && botChoice === "rock") ||
    (userChoice === "scissors" && botChoice === "paper")
  ) {
    return `You win! I chose ${botChoice}.`;
  } else {
    return `I win! I chose ${botChoice}.`;
  }
}

async function roastUser(target) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a funny, lighthearted AI that makes humorous roasts." },
        { role: "user", content: `Roast ${target} in a funny but non-offensive way.` },
      ],
    });
    return response.choices[0].message.content;
  } catch {
    return "Couldn't roast this time. They're just too cool!";
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  const commands = [
    new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
    new SlashCommandBuilder()
      .setName("player")
      .setDescription("Get info about a player.")
      .addStringOption((opt) => opt.setName("tag").setDescription("Player tag").setRequired(true)),
    new SlashCommandBuilder()
      .setName("clan")
      .setDescription("Get info about a clan.")
      .addStringOption((opt) => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
    new SlashCommandBuilder().setName("clans").setDescription("How to apply to Lost Family clans."),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
    new SlashCommandBuilder()
      .setName("ask")
      .setDescription("Ask any question to OpenAI.")
      .addStringOption((opt) => opt.setName("question").setDescription("Your question").setRequired(true)),
    new SlashCommandBuilder()
      .setName("roast")
      .setDescription("Roast a user.")
      .addStringOption((opt) => opt.setName("target").setDescription("Target to roast")),
    new SlashCommandBuilder()
      .setName("rps")
      .setDescription("Play Rock Paper Scissors.")
      .addStringOption((opt) => opt.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
    new SlashCommandBuilder()
      .setName("poster")
      .setDescription("Get current war data for a clan.")
      .addStringOption((opt) => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
    new SlashCommandBuilder().setName("help").setDescription("List all commands."),
    new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message (Admin only)."),
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log("Slash commands registered.");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply();

  const { commandName, options } = interaction;

  if (commandName === "ping") {
    return interaction.editReply("🏓 Pong!");
  }

  if (commandName === "player") {
    const tag = options.getString("tag");
    const data = await getPlayerInfo(tag);
    if (data.error) return interaction.editReply(`❌ Error: ${data.error}`);
    return interaction.editReply(
      `🏆 **Player Name:** ${data.name}\n` +
      `🏰 **Town Hall Level:** ${data.townHallLevel}\n` +
      `⭐ **Trophies:** ${data.trophies}\n` +
      `⚔️ **War Stars:** ${data.warStars}\n` +
      `🎖️ **Clan:** ${data.clan ? data.clan.name : "No Clan"}\n` +
      `🛠️ **Experience Level:** ${data.expLevel}`
    );
  }

  if (commandName === "clan") {
    const tag = options.getString("tag");
    const data = await getClanInfo(tag);
    if (data.error) return interaction.editReply(`❌ Error: ${data.error}`);
    return interaction.editReply(
      `🏰 **Clan Name:** ${data.name}\n` +
      `🏆 **Clan Level:** ${data.clanLevel}\n` +
      `🎖️ **Clan Points:** ${data.clanPoints}\n` +
      `🔥 **War Win Streak:** ${data.warWinStreak}\n` +
      `⚔️ **War Wins:** ${data.warWins}`
    );
  }

  if (commandName === "clans") {
    if (!TICKETS_CHANNEL_ID) {
      return interaction.editReply("❌ Tickets channel ID not configured.");
    }
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return interaction.editReply(
      `**Clan Applications**\n\n` +
      `To apply for a Lost Family clan, please go to <#${TICKETS_CHANNEL_ID}> and submit your request.\n\n` +
      `Lost Family Team | Today at ${timeString}`
    );
  }

  if (commandName === "leaderboard") {
    const clans = await getTopClans();
    if (clans.error) return interaction.editReply(`❌ Error: ${clans.error}`);
    const list = clans.map((c, i) => `${i + 1}. **${c.name}** - ${c.clanPoints} points`).join("\n");
    return interaction.editReply(`🏆 **Top 5 Global Clans:**\n${list}`);
  }

  if (commandName === "ask") {
    const question = options.getString("question");
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: question }],
      });
      return interaction.editReply(res.choices[0].message.content);
    } catch {
      return interaction.editReply("❌ Could not process your question.");
    }
  }

  if (commandName === "roast") {
    const target = options.getString("target") || interaction.user.username;
    const roast = await roastUser(target);
    return interaction.editReply(roast);
  }

  if (commandName === "rps") {
    const choice = options.getString("choice").toLowerCase();
    if (!rpsChoices.includes(choice)) {
      return interaction.editReply("Please choose rock, paper, or scissors.");
    }
    const result = playRps(choice);
    return interaction.editReply(result);
  }

  if (commandName === "poster") {
    const tag = options.getString("tag");
    const warData = await getClanWarData(tag);
    if (warData.error) return interaction.editReply(`❌ Error: ${warData.error}`);
    const warStatus = warData.state === "inWar" ? "Currently at War" : "Not currently in war";
    return interaction.editReply(
      `📅 **Clan War Status:** ${warStatus}\n` +
      `🛡️ **Opponent:** ${warData.opponent.name}\n` +
      `⚔️ **Clan Wins:** ${warData.clan.winCount}\n` +
      `🔥 **Opponent Wins:** ${warData.opponent.winCount}`
    );
  }

  if (commandName === "help") {
    return interaction.editReply(
      "**Available Commands:**\n" +
      "`/ping` - Check bot status\n" +
      "`/player [tag]` - Get player info\n" +
      "`/clan [tag]` - Get clan info\n" +
      "`/clans` - How to apply to Lost Family clans\n" +
      "`/leaderboard` - Top global clans\n" +
      "`/ask [question]` - Ask OpenAI a question\n" +
      "`/roast [target]` - Roast a user\n" +
      "`/rps [choice]` - Play rock paper scissors\n" +
      "`/poster [tag]` - Clan war info\n" +
      "`/remind` - Admin reminder"
    );
  }

  if (commandName === "remind") {
    if (!interaction.member.permissions.has("Administrator")) {
      return interaction.editReply("❌ You do not have permission to use this command.");
    }
    return interaction.editReply("Reminder sent!");
  }
});

client.login(process.env.DISCORD_TOKEN);