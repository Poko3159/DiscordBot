const express = require("express");
const app = express();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const OpenAI = require("openai");
const axios = require("axios");

// Express server for uptime monitoring
app.get("/", (req, res) => {
    res.send("Bot is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

const GUILD_ID = process.env.GUILD_ID;
const GLOBAL_CHAT_CHANNEL_ID = process.env.GLOBAL_CHAT_CHANNEL_ID;

console.log('COC API Key loaded:', COC_API_KEY ? 'Yes' : 'No');

async function sendClansMessage(channel) {
    const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Lost Family Clan Applications")
        .setDescription("Hello! If you would like to apply for a Lost Family Clan, please navigate to the following channel - <#tickets-channel-id>") // replace tickets-channel-id with your actual Tickets channel ID or keep as text if you prefer
        .setFooter({ text: "Lost Family Team" });
    
    await channel.send({ embeds: [embed] });
}

client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);

    // Register slash commands for guild (faster to update)
    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
        new SlashCommandBuilder().setName("clans").setDescription("Send Lost Family clan application info."),
        new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message."),
        // ... Add your other commands here ...
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log("✅ Slash commands registered for guild.");

    // Schedule daily 4pm UK time message to global chat
    setInterval(async () => {
        const now = DateTime.now().setZone("Europe/London");
        if (now.hour === 16 && now.minute === 0) {  // 16:00 UK time
            try {
                const guild = await client.guilds.fetch(GUILD_ID);
                const channel = await guild.channels.fetch(GLOBAL_CHAT_CHANNEL_ID);
                if (!channel) return console.warn("Global chat channel not found.");
                await sendClansMessage(channel);
                console.log("✅ Sent daily clans message to global chat.");
            } catch (error) {
                console.error("Error sending scheduled clans message:", error);
            }
        }
    }, 60 * 1000); // Check every minute
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "ping") {
        await interaction.reply("🏓 Pong!");
    }

    if (commandName === "clans") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
        }
        // Send embed message in the channel where command was used
        await sendClansMessage(interaction.channel);
        await interaction.reply({ content: "✅ Lost Family clan application info sent!", ephemeral: true });
    }

    if (commandName === "remind") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
        }
        const embed = new EmbedBuilder()
            .setColor("#ff0000")
            .setTitle("Reminder")
            .setDescription("We are still awaiting a response from you. Please respond at your earliest convenience.\n\nLost Family Team");
        await interaction.reply({ embeds: [embed], ephemeral: false });
    }
});

client.login(process.env.DISCORD_TOKEN);