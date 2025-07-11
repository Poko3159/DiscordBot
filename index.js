import { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Routes } from "discord.js";
import { config } from "dotenv";
import { REST } from "@discordjs/rest";
import { DateTime } from "luxon";
import express from "express";

config();

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  GLOBAL_CHAT_CHANNEL_ID,
  TICKETS_CHANNEL_ID,
} = process.env;

// Setup Express server to keep Render happy
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

// Register slash commands
const commands = [
  {
    name: "clans",
    description: "Send clans info message",
  },
  {
    name: "remind",
    description: "Send ticket reminder message",
  },
];

(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("✅ Slash commands registered for guild.");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
})();

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
  scheduleDailyMessage(); // Schedule 4pm message
});

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function buildClansEmbed() {
  return new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("🎯 Clans Information")
    .setDescription(
      `To apply for tickets, please head to <#${TICKETS_CHANNEL_ID}> and submit your request.\n\nGood luck!`
    )
    .setTimestamp()
    .setFooter({ text: "Lost Family Team" });
}

function buildRemindEmbed() {
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("⏰ Reminder")
    .setDescription(
      "We are still awaiting a response from you. Please respond at your earliest convenience.\n\nLost Family Team"
    )
    .setTimestamp()
    .setFooter({ text: "Ticket Reminder" });
}

// Handle slash command interactions
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, channel } = interaction;

  // Admin permission check
  if (!isAdmin(member)) {
    return interaction.reply({
      content: "❌ You must have administrator permissions to use this command.",
      ephemeral: true,
    });
  }

  try {
    if (commandName === "clans") {
      await interaction.deferReply({ ephemeral: false });
      const embed = buildClansEmbed();
      await interaction.editReply({ embeds: [embed] });
    }

    if (commandName === "remind") {
      await interaction.deferReply({ ephemeral: false });
      const embed = buildRemindEmbed();
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error("Interaction error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing the command.",
        ephemeral: true,
      });
    }
  }
});

// Function to send clans message daily to GLOBAL_CHAT_CHANNEL_ID
async function sendDailyClansMessage() {
  try {
    const channel = await client.channels.fetch(GLOBAL_CHAT_CHANNEL_ID);
    if (!channel) {
      console.error("Global chat channel not found.");
      return;
    }

    const embed = buildClansEmbed();
    await channel.send({ embeds: [embed] });
    console.log("✅ Sent daily clans message to global chat.");
  } catch (error) {
    console.error("Error sending daily clans message:", error);
  }
}

// Schedule daily message at 4pm UK time
function scheduleDailyMessage() {
  const now = DateTime.now().setZone("Europe/London");
  let next4pm = now.set({ hour: 16, minute: 0, second: 0, millisecond: 0 });

  if (now >= next4pm) {
    next4pm = next4pm.plus({ days: 1 });
  }

  const delay = next4pm.diff(now).as("milliseconds");

  setTimeout(async function dailySend() {
    await sendDailyClansMessage();
    setTimeout(dailySend, 24 * 60 * 60 * 1000); // Run every 24 hours
  }, delay);
}

client.login(DISCORD_TOKEN);
