const express = require("express");
const app = express();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const { DateTime } = require("luxon");
require("dotenv").config();

// Express server
app.get("/", (req, res) => {
  res.send("Bot is alive!");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// OpenAI and CoC setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

// Embeds
function createRecruitmentEmbed() {
  return new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle("📬 Lost Family Recruitment")
    .setDescription(
      "If you would like to apply for a Lost Family Clan, please navigate to the following channel: <#CHANNEL_ID_TICKETS>\n\n— Lost Family Team"
    );
}

function createReminderEmbed() {
  return new EmbedBuilder()
    .setColor(0xF9A825)
    .setTitle("⏰ Friendly Reminder")
    .setDescription(
      "We are still awaiting a response from you. Please respond at your earliest convenience.\n\n— Lost Family Team"
    );
}

// Register slash commands
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
    new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
      .addStringOption(opt => opt.setName("tag").setDescription("Player tag").setRequired(true)),
    new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
      .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
    new SlashCommandBuilder().setName("ask").setDescription("Ask any question to OpenAI.")
      .addStringOption(opt => opt.setName("question").setDescription("Your question").setRequired(true)),
    new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
      .addStringOption(opt => opt.setName("target").setDescription("Target to roast")),
    new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
      .addStringOption(opt => opt.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
    new SlashCommandBuilder().setName("poster").setDescription("Get current war data for a clan.")
      .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
    new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
    new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message."),
    new SlashCommandBuilder().setName("clans").setDescription("Send Lost Family application message."),
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands.map(c => c.toJSON()) });
  console.log("✅ Slash commands registered.");
});

// Handle slash commands
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options } = interaction;
  await interaction.deferReply({ ephemeral: true });

  if (commandName === "ping") {
    return interaction.editReply("🏓 Pong!");
  }

  if (commandName === "remind") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply("❌ You do not have permission to use this command.");
    }
    await interaction.channel.send({ embeds: [createReminderEmbed()] });
    return interaction.editReply("✅ Reminder sent.");
  }

  if (commandName === "clans") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply("❌ You do not have permission to use this command.");
    }
    await interaction.channel.send({ embeds: [createRecruitmentEmbed()] });
    return interaction.editReply("✅ Recruitment message sent to this channel.");
  }

  // ... (Other commands like player, clan, leaderboard, etc. remain unchanged)
});

// Schedule daily message at 4PM UK time
setInterval(async () => {
  const now = DateTime.now().setZone("Europe/London");
  if (now.hour === 16 && now.minute === 0) {
    try {
      const channel = await client.channels.fetch(process.env.GLOBAL_CHAT_CHANNEL_ID);
      if (channel) {
        await channel.send({ embeds: [createRecruitmentEmbed()] });
        console.log("✅ Daily /clans message sent.");
      }
    } catch (error) {
      console.error("❌ Failed to send scheduled message:", error.message);
    }
  }
}, 60 * 1000);

client.login(process.env.DISCORD_TOKEN);