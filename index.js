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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

// Slash commands to register
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
});

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function buildClansEmbed() {
  return new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Clans Information")
    .setDescription(
      `Here is the clans info message.\n\n` +
      `To apply for tickets, please go to <#${TICKETS_CHANNEL_ID}> and submit your request.`
    )
    .setTimestamp()
    .setFooter({ text: "Clans Message" });
}

function buildRemindEmbed() {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("Reminder")
    .setDescription(
      `We are still awaiting a response from you. Please respond at your earliest convenience.\n\nLost Family Team`
    )
    .setTimestamp()
    .setFooter({ text: "Ticket Reminder" });
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, channel } = interaction;

  if ((commandName === "clans" || commandName === "remind") && !isAdmin(member)) {
    return interaction.reply({
      content: "❌ You must have administrator permissions to use this command.",
      flags: 64, // ephemeral
    });
  }

  try {
    if (commandName === "clans") {
      const embed = buildClansEmbed();
      await interaction.reply({ embeds: [embed] }); // Reply in current channel
    } else if (commandName === "remind") {
      const embed = buildRemindEmbed();
      await interaction.reply({ embeds: [embed] }); // Reply in current channel
    }
  } catch (error) {
    console.error("Interaction error:", error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ An error occurred while processing the command.", flags: 64 });
      } else {
        await interaction.editReply({ content: "❌ An error occurred." });
      }
    } catch (e) {
      console.error("Failed to reply to interaction:", e);
    }
  }
});

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

function scheduleDailyMessage() {
  const now = DateTime.now().setZone("Europe/London");
  let next4pm = now.set({ hour: 16, minute: 0, second: 0, millisecond: 0 });

  if (now >= next4pm) {
    next4pm = next4pm.plus({ days: 1 });
  }

  const delay = next4pm.diff(now).as("milliseconds");

  setTimeout(async function dailySend() {
    await sendDailyClansMessage();
    setTimeout(dailySend, 24 * 60 * 60 * 1000); // 24 hours
  }, delay);
}

// Express server to keep Render service alive
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

client.login(DISCORD_TOKEN).then(() => {
  scheduleDailyMessage();
});