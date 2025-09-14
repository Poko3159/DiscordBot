const express = require("express");
const { DateTime } = require("luxon");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const cron = require("node-cron"); // For scheduling

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));

const ticketsChannelId = process.env.TICKETS_CHANNEL_ID || "1320552677654003844";
const globalChannelId = process.env.GLOBAL_CHANNEL_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const rpsChoices = ["rock", "paper", "scissors"];

// === COC Helper Functions ===
async function getPlayerInfo(playerTag) {
    try {
        const sanitizedTag = playerTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/players/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching player data. Check the tag or API status." };
    }
}

async function getClanInfo(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching clan data. Check the tag or API status." };
    }
}

async function getTopClans() {
    try {
        const response = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data.items.slice(0, 5);
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching global leaderboard." };
    }
}

async function getClanWarData(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching war data. Check the clan tag or API status." };
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
                { role: "system", content: "You are a humorous, sarcastic AI that generates funny but non-offensive roasts." },
                { role: "user", content: `Roast ${target} in a funny but lighthearted way.` },
            ],
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI Error:", error);
        return "I couldn't roast them this time! Maybe they're just too nice?";
    }
}

// === Reminder Message Handling ===
let lastReminderMessageId = null;

async function cleanupOldReminders(channel) {
    if (!channel?.isTextBased()) return;

    if (lastReminderMessageId) {
        try {
            const prev = await channel.messages.fetch(lastReminderMessageId).catch(() => null);
            if (prev && prev.deletable) {
                await prev.delete();
                lastReminderMessageId = null;
                return;
            }
        } catch (err) {
            console.warn("Could not delete stored reminder message:", err);
            lastReminderMessageId = null;
        }
    }

    try {
        const fetched = await channel.messages.fetch({ limit: 50 });
        const toDelete = fetched.filter(m =>
            m.author?.id === client.user?.id &&
            m.embeds?.length &&
            m.embeds[0].title?.includes("Lost Family")
        ).first(5);

        for (const msg of toDelete) {
            if (msg.deletable) await msg.delete().catch(e => console.warn("Failed delete:", e));
        }
    } catch (err) {
        console.warn("Error scanning/deleting old reminders:", err);
    }
}

async function postApplicationReminder(channel) {
    if (!channel || !channel.isTextBased()) return;
    await cleanupOldReminders(channel);

    const guildId = channel.guildId;
    const ticketUrl = `https://discord.com/channels/${guildId}/${ticketsChannelId}`;

    const reminderEmbed = new EmbedBuilder()
        .setColor(0x1ABC9C) // bright teal for visibility
        .setTitle("📢 Join a Lost Family Clan!")
        .setDescription(`Looking to join a Lost Family clan?\n\nHead over to <#${ticketsChannelId}> and select **Clan Application** from the ticket dropdown.`)
        .setFooter({ text: "Lost Family Network | Applications open 24/7" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("📝 Apply Now")
            .setStyle(ButtonStyle.Link)
            .setURL(ticketUrl)
    );

    try {
        const sent = await channel.send({ embeds: [reminderEmbed], components: [row] });
        lastReminderMessageId = sent.id;
        console.log("[✅] Posted 6-hour application reminder with button.");
    } catch (err) {
        console.error("❌ Error posting 6-hour reminder:", err);
    }
}

// === Bot Ready Event ===
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}!`);

    // === Slash Commands Registration ===
    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
        new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
            .addStringOption(option => option.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
        new SlashCommandBuilder().setName("ask").setDescription("Ask any question to OpenAI.")
            .addStringOption(option => option.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
            .addStringOption(option => option.setName("target").setDescription("Target to roast")),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
            .addStringOption(option => option.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war data for a clan.")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
        new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message."),
        new SlashCommandBuilder().setName("clans").setDescription("How to apply for a Lost Family clan.")
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");

    let globalChannel = null;
    try {
        globalChannel = await client.channels.fetch(globalChannelId);
        if (!globalChannel || !globalChannel.isTextBased()) {
            console.warn("Global channel ID invalid or not text-based.");
        }
    } catch (err) {
        console.warn("Failed to fetch global channel on ready:", err);
    }

    // === 6-Hourly Reminder Schedule (Europe/London) ===
    cron.schedule("0 */6 * * *", async () => {
        const channel = globalChannel ?? await client.channels.fetch(globalChannelId);
        if (!channel || !channel.isTextBased()) return;
        await postApplicationReminder(channel);
    }, { timezone: "Europe/London" });
});

// === Interaction Handler ===
// Keep your full existing interactionCreate handler here (unchanged)
// ... your existing code continues ...

// === Start Bot ===
client.login(process.env.DISCORD_TOKEN);