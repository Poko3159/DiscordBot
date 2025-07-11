import { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Routes } from "discord.js";
import { config } from "dotenv";
import { REST } from "@discordjs/rest";
import { DateTime } from "luxon";

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
  // Add any other commands you had before here
  // For example:
  // { name: "othercommand", description: "Description" },
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
    .setFooter({ text: "Automated Clans Message" });
}

function buildRemindEmbed() {
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("Ticket Reminder")
    .setDescription(
      `Please remember to respond to any open tickets in <#${TICKETS_CHANNEL_ID}>.`
    )
    .setTimestamp()
    .setFooter({ text: "Ticket Reminder" });
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, channel } = interaction;

  // Admin check for /clans and /remind commands
  if ((commandName === "clans" || commandName === "remind") && !isAdmin(member)) {
    return interaction.reply({
      content: "❌ You must have administrator permissions to use this command.",
      ephemeral: true,
    });
  }

  try {
    if (commandName === "clans") {
      await interaction.deferReply();

      const embed = buildClansEmbed();

      await interaction.editReply({ embeds: [embed] });
    } else if (commandName === "remind") {
      await interaction.deferReply();

      const embed = buildRemindEmbed();

      await interaction.editReply({ embeds: [embed] });
    }

    // Add other command handlers here, unchanged from your existing code
  } catch (error) {
    console.error("Interaction error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing the command.",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({ content: "❌ An error occurred." });
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
    setTimeout(dailySend, 24 * 60 * 60 * 1000); // Schedule next run in 24 hours
  }, delay);
}

client.login(DISCORD_TOKEN).then(() => {
  scheduleDailyMessage();
});