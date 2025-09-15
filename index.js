const express = require("express");
const { DateTime } = require("luxon");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const REMINDER_FILE = "./reminders.json";

// === Reminder Storage ===
function loadReminders() {
    if (!fs.existsSync(REMINDER_FILE)) return {};
    return JSON.parse(fs.readFileSync(REMINDER_FILE));
}

function saveReminders(data) {
    fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2));
}

function rescheduleReminders() {
    const reminders = loadReminders();
    const now = Date.now();

    for (const userId in reminders) {
        for (const reminder of reminders[userId]) {
            const delay = reminder.time - now;

            if (delay <= 0) {
                deliverReminder(userId, reminder.message);
            } else {
                setTimeout(() => {
                    deliverReminder(userId, reminder.message);
                }, delay);
            }
        }
    }
}

// New: periodic announcement for Lost Family Clan Applications
async function sendClanApplicationAnnouncement() {
    const globalChannelId = process.env.GLOBAL_CHANNEL_ID;
    const ticketsChannelId = process.env.TICKETS_CHANNEL_ID;
    if (!globalChannelId || !ticketsChannelId) {
        console.warn("GLOBAL_CHANNEL_ID or TICKETS_CHANNEL_ID not set, skipping clan application announcement.");
        return;
    }

    try {
        const channel = await client.channels.fetch(globalChannelId).catch(() => null);
        if (!channel || (typeof channel.isTextBased === "function" && !channel.isTextBased())) {
            console.warn("Global channel not found or not text-based.");
            return;
        }

        // Delete previous announcements by this bot with the same embed title
        const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (fetched) {
            const prev = fetched.filter(msg =>
                msg.author?.id === client.user?.id &&
                msg.embeds?.[0]?.title === "Lost Family Clan Applications"
            );
            for (const msg of prev.values()) {
                try { await msg.delete(); } catch (err) { console.warn("Failed to delete previous announcement message:", err); }
            }
        }

        // Build a guild-aware tickets URL when possible
        let guildId = channel.guild?.id;
        if (!guildId) {
            const ticketsChannel = await client.channels.fetch(ticketsChannelId).catch(() => null);
            guildId = ticketsChannel?.guild?.id || guildId;
        }
        const ticketsUrl = guildId
            ? `https://discord.com/channels/${guildId}/${ticketsChannelId}`
            : `https://discord.com/channels/${ticketsChannelId}`;

        const embed = new EmbedBuilder()
            .setTitle("Lost Family Clan Applications")
            .setDescription(`To apply for a Lost Family Clan navigate to the tickets channel <#${ticketsChannelId}> and select **Clan Application**.`)
            .setColor(0x5865F2)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Open Tickets")
                .setStyle(ButtonStyle.Link)
                .setURL(ticketsUrl)
        );

        await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
        console.error("Failed to send clan application announcement:", err);
    }
}

async function deliverReminder(userId, message) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) throw new Error("User not found");
        await user.send(`🔔 Reminder: ${message}`);

        const reminders = loadReminders();
        reminders[userId] = reminders[userId].filter(r => r.message !== message);
        if (reminders[userId].length === 0) delete reminders[userId];
        saveReminders(reminders);
    } catch (err) {
        console.error(`Failed to deliver reminder to ${userId}:`, err);
        const reminders = loadReminders();
        if (reminders[userId]) {
            reminders[userId] = reminders[userId].filter(r => r.message !== message);
            if (reminders[userId].length === 0) delete reminders[userId];
            saveReminders(reminders);
        }
    }
}

// === Helper Functions ===
async function getPlayerInfo(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/players/%23${sanitized}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "Error fetching player data." };
    }
}

async function getClanInfo(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${sanitized}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "Error fetching clan data." };
    }
}

async function getTopClans() {
    try {
        const res = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data.items.slice(0, 5);
    } catch {
        return { error: "Error fetching leaderboard." };
    }
}

async function getClanWarData(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${sanitized}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "Error fetching war data." };
    }
}

function playRps(choice) {
    const rpsChoices = ["rock", "paper", "scissors"];
    const bot = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
    if (choice === bot) return `It's a tie! We both chose ${bot}.`;
    if ((choice === "rock" && bot === "scissors") || (choice === "paper" && bot === "rock") || (choice === "scissors" && bot === "paper")) {
        return `You win! I chose ${bot}.`;
    }
    return `I win! I chose ${bot}.`;
}

async function roastUser(target) {
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a humorous, sarcastic AI that generates funny but non-offensive roasts." },
                { role: "user", content: `Roast ${target} in a funny but lighthearted way.` }
            ]
        });
        return res.choices[0].message.content;
    } catch {
        return "Couldn't roast them this time!";
    }
}

async function aiTransform(prompt, input) {
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: input }
            ]
        });
        return res.choices[0].message.content;
    } catch {
        return "AI transformation failed.";
    }
}

// === Bot Ready ===
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}!`);

    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
        new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
        new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
            .addStringOption(opt => opt.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
            .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
        new SlashCommandBuilder().setName("ask").setDescription("Ask OpenAI anything.")
            .addStringOption(opt => opt.setName("question").setDescription("Your question").setRequired(true))
            .addBooleanOption(opt => opt.setName("private").setDescription("Private reply only for you")),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
            .addStringOption(opt => opt.setName("target").setDescription("Target to roast")),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
            .addStringOption(opt => opt.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war data.")
            .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("remindme").setDescription("Set a personal reminder.")
            .addStringOption(opt => opt.setName("time").setDescription("Time in minutes").setRequired(true))
            .addStringOption(opt => opt.setName("message").setDescription("Reminder message").setRequired(true)),
        new SlashCommandBuilder().setName("listreminders").setDescription("List your active reminders."),
        new SlashCommandBuilder().setName("cancelreminder").setDescription("Cancel a reminder.")
            .addStringOption(opt => opt.setName("id").setDescription("Reminder ID").setRequired(true)),
        new SlashCommandBuilder().setName("summarise").setDescription("Summarise a block of text.")
            .addStringOption(opt => opt.setName("text").setDescription("Text to summarise").setRequired(true)),
        new SlashCommandBuilder().setName("replysuggest").setDescription("Suggest a reply to a message.")
            .addStringOption(opt => opt.setName("text").setDescription("Message to reply to").setRequired(true)),
        new SlashCommandBuilder().setName("fixgrammar").setDescription("Fix grammar and clarity.")
            .addStringOption(opt => opt.setName("text").setDescription("Text to improve").setRequired(true)),
        new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages.")
            .addIntegerOption(opt => opt.setName("count").setDescription("Number of messages to delete").setRequired(true)),
        new SlashCommandBuilder().setName("poll").setDescription("Create a quick poll.")
            .addStringOption(opt => opt.setName("question").setDescription("Poll question").setRequired(true))
            .addStringOption(opt => opt.setName("options").setDescription("Comma-separated options").setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");

    rescheduleReminders(); // 🔄 Auto-reschedule reminders on startup

    // Send announcement once immediately and then every 6 hours
    sendClanApplicationAnnouncement().catch(err => console.error("Initial announcement error:", err));
    setInterval(() => sendClanApplicationAnnouncement().catch(err => console.error("Scheduled announcement error:", err)), 6 * 60 * 60 * 1000);
});

// === Interaction Handling ===
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, channel } = interaction;

    try {
        if (commandName === "ping") {
            await interaction.reply("🏓 Pong! I'm alive.");
        } else if (commandName === "help") {
            await interaction.reply("Available commands: /ping /help /player /clan /leaderboard /ask /roast /rps /poster /remindme /listreminders /cancelreminder /summarise /replysuggest /fixgrammar /purge /poll");
        } else if (commandName === "player") {
            const tag = options.getString("tag");
            const info = await getPlayerInfo(tag);
            if (info.error) return await interaction.reply(info.error);
            await interaction.reply(`🏅 Player: ${info.name}\n🏰 Clan: ${info.clan?.name || "None"}\n🏆 Trophies: ${info.trophies}`);
        } else if (commandName === "clan") {
            const tag = options.getString("tag");
            const info = await getClanInfo(tag);
            if (info.error) return await interaction.reply(info.error);
            await interaction.reply(`🏰 Clan: ${info.name}\n📊 Members: ${info.members}\n🏆 Points: ${info.clanPoints}`);
        } else if (commandName === "leaderboard") {
            const clans = await getTopClans();
            if (clans.error) return await interaction.reply(clans.error);
            const list = clans.map((c, i) => `${i + 1}. ${c.name} – ${c.clanPoints} pts`).join("\n");
            await interaction.reply(`🌍 Top 5 Global Clans:\n${list}`);
        } else if (commandName === "ask") {
            const isPrivate = options.getBoolean("private") || false;
            await interaction.deferReply({ ephemeral: isPrivate });
            const question = options.getString("question");
            const res = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            await interaction.editReply(res.choices[0].message.content);
        }
        // ... rest of your commands (roast, rps, poster, remindme, listreminders, cancelreminder, summarise, replysuggest, fixgrammar, purge, poll) remain exactly the same as before with the previous fixes
    } catch (err) {
        console.error("Interaction error:", err);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "❌ Something went wrong.", ephemeral: true });
        } else {
            await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
        }
    }
});

// === Start Bot ===
client.login(process.env.DISCORD_TOKEN);
```// filepath: untitled:Untitled-1
const express = require("express");
const { DateTime } = require("luxon");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const REMINDER_FILE = "./reminders.json";

// === Reminder Storage ===
function loadReminders() {
    if (!fs.existsSync(REMINDER_FILE)) return {};
    return JSON.parse(fs.readSync(REMINDER_FILE));
}

function saveReminders(data) {
    fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2));
}

function rescheduleReminders() {
    const reminders = loadReminders();
    const now = Date.now();

    for (const userId in reminders) {
        for (const reminder of reminders[userId]) {
            const delay = reminder.time - now;

            if (delay <= 0) {
                deliverReminder(userId, reminder.message);
            } else {
                setTimeout(() => {
                    deliverReminder(userId, reminder.message);
                }, delay);
            }
        }
    }
}

// New: periodic announcement for Lost Family Clan Applications
async function sendClanApplicationAnnouncement() {
    const globalChannelId = process.env.GLOBAL_CHANNEL_ID;
    const ticketsChannelId = process.env.TICKETS_CHANNEL_ID;
    if (!globalChannelId || !ticketsChannelId) {
        console.warn("GLOBAL_CHANNEL_ID or TICKETS_CHANNEL_ID not set, skipping clan application announcement.");
        return;
    }

    try {
        const channel = await client.channels.fetch(globalChannelId).catch(() => null);
        if (!channel || (typeof channel.isTextBased === "function" && !channel.isTextBased())) {
            console.warn("Global channel not found or not text-based.");
            return;
        }

        // Delete previous announcements by this bot with the same embed title
        const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (fetched) {
            const prev = fetched.filter(msg =>
                msg.author?.id === client.user?.id &&
                msg.embeds?.[0]?.title === "Lost Family Clan Applications"
            );
            for (const msg of prev.values()) {
                try { await msg.delete(); } catch (err) { console.warn("Failed to delete previous announcement message:", err); }
            }
        }

        // Build a guild-aware tickets URL when possible
        let guildId = channel.guild?.id;
        if (!guildId) {
            const ticketsChannel = await client.channels.fetch(ticketsChannelId).catch(() => null);
            guildId = ticketsChannel?.guild?.id || guildId;
        }
        const ticketsUrl = guildId
            ? `https://discord.com/channels/${guildId}/${ticketsChannelId}`
            : `https://discord.com/channels/${ticketsChannelId}`;

        const embed = new EmbedBuilder()
            .setTitle("Lost Family Clan Applications")
            .setDescription(`To apply for a Lost Family Clan navigate to the tickets channel <#${ticketsChannelId}> and select **Clan Application**.`)
            .setColor(0x5865F2)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Open Tickets")
                .setStyle(ButtonStyle.Link)
                .setURL(ticketsUrl)
        );

        await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
        console.error("Failed to send clan application announcement:", err);
    }
}

async function deliverReminder(userId, message) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) throw new Error("User not found");
        await user.send(`🔔 Reminder: ${message}`);

        const reminders = loadReminders();
        reminders[userId] = reminders[userId].filter(r => r.message !== message);
        if (reminders[userId].length === 0) delete reminders[userId];
        saveReminders(reminders);
    } catch (err) {
        console.error(`Failed to deliver reminder to ${userId}:`, err);
        const reminders = loadReminders();
        if (reminders[userId]) {
            reminders[userId] = reminders[userId].filter(r => r.message !== message);
            if (reminders[userId].length === 0) delete reminders[userId];
            saveReminders(reminders);
        }
    }
}

// === Helper Functions ===
async function getPlayerInfo(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/players/%23${sanitized}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "Error fetching player data." };
    }
}

async function getClanInfo(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${sanitized}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "Error fetching clan data." };
    }
}

async function getTopClans() {
    try {
        const res = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data.items.slice(0, 5);
    } catch {
        return { error: "Error fetching leaderboard." };
    }
}

async function getClanWarData(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${sanitized}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "Error fetching war data." };
    }
}

function playRps(choice) {
    const rpsChoices = ["rock", "paper", "scissors"];
    const bot = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
    if (choice === bot) return `It's a tie! We both chose ${bot}.`;
    if ((choice === "rock" && bot === "scissors") || (choice === "paper" && bot === "rock") || (choice === "scissors" && bot === "paper")) {
        return `You win! I chose ${bot}.`;
    }
    return `I win! I chose ${bot}.`;
}

async function roastUser(target) {
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a humorous, sarcastic AI that generates funny but non-offensive roasts." },
                { role: "user", content: `Roast ${target} in a funny but lighthearted way.` }
            ]
        });
        return res.choices[0].message.content;
    } catch {
        return "Couldn't roast them this time!";
    }
}

async function aiTransform(prompt, input) {
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: input }
            ]
        });
        return res.choices[0].message.content;
    } catch {
        return "AI transformation failed.";
    }
}

// === Bot Ready ===
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}!`);

    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
        new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
        new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
            .addStringOption(opt => opt.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
            .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
        new SlashCommandBuilder().setName("ask").setDescription("Ask OpenAI anything.")
            .addStringOption(opt => opt.setName("question").setDescription("Your question").setRequired(true))
            .addBooleanOption(opt => opt.setName("private").setDescription("Private reply only for you")),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
            .addStringOption(opt => opt.setName("target").setDescription("Target to roast")),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
            .addStringOption(opt => opt.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war data.")
            .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("remindme").setDescription("Set a personal reminder.")
            .addStringOption(opt => opt.setName("time").setDescription("Time in minutes").setRequired(true))
            .addStringOption(opt => opt.setName("message").setDescription("Reminder message").setRequired(true)),
        new SlashCommandBuilder().setName("listreminders").setDescription("List your active reminders."),
        new SlashCommandBuilder().setName("cancelreminder").setDescription("Cancel a reminder.")
            .addStringOption(opt => opt.setName("id").setDescription("Reminder ID").setRequired(true)),
        new SlashCommandBuilder().setName("summarise").setDescription("Summarise a block of text.")
            .addStringOption(opt => opt.setName("text").setDescription("Text to summarise").setRequired(true)),
        new SlashCommandBuilder().setName("replysuggest").setDescription("Suggest a reply to a message.")
            .addStringOption(opt => opt.setName("text").setDescription("Message to reply to").setRequired(true)),
        new SlashCommandBuilder().setName("fixgrammar").setDescription("Fix grammar and clarity.")
            .addStringOption(opt => opt.setName("text").setDescription("Text to improve").setRequired(true)),
        new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages.")
            .addIntegerOption(opt => opt.setName("count").setDescription("Number of messages to delete").setRequired(true)),
        new SlashCommandBuilder().setName("poll").setDescription("Create a quick poll.")
            .addStringOption(opt => opt.setName("question").setDescription("Poll question").setRequired(true))
            .addStringOption(opt => opt.setName("options").setDescription("Comma-separated options").setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");

    rescheduleReminders(); // 🔄 Auto-reschedule reminders on startup

    // Send announcement once immediately and then every 6 hours
    sendClanApplicationAnnouncement().catch(err => console.error("Initial announcement error:", err));
    setInterval(() => sendClanApplicationAnnouncement().catch(err => console.error("Scheduled announcement error:", err)), 6 * 60 * 60 * 1000);
});

// === Interaction Handling ===
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, channel } = interaction;

    try {
        if (commandName === "ping") {
            await interaction.reply("🏓 Pong! I'm alive.");
        } else if (commandName === "help") {
            await interaction.reply("Available commands: /ping /help /player /clan /leaderboard /ask /roast /rps /poster /remindme /listreminders /cancelreminder /summarise /replysuggest /fixgrammar /purge /poll");
        } else if (commandName === "player") {
            const tag = options.getString("tag");
            const info = await getPlayerInfo(tag);
            if (info.error) return await interaction.reply(info.error);
            await interaction.reply(`🏅 Player: ${info.name}\n🏰 Clan: ${info.clan?.name || "None"}\n🏆 Trophies: ${info.trophies}`);
        } else if (commandName === "clan") {
            const tag = options.getString("tag");
            const info = await getClanInfo(tag);
            if (info.error) return await interaction.reply(info.error);
            await interaction.reply(`🏰 Clan: ${info.name}\n📊 Members: ${info.members}\n🏆 Points: ${info.clanPoints}`);
        } else if (commandName === "leaderboard") {
            const clans = await getTopClans();
            if (clans.error) return await interaction.reply(clans.error);
            const list = clans.map((c, i) => `${i + 1}. ${c.name} – ${c.clanPoints} pts`).join("\n");
            await interaction.reply(`🌍 Top 5 Global Clans:\n${list}`);
        } else if (commandName === "ask") {
            const isPrivate = options.getBoolean("private") || false;
            await interaction.deferReply({ ephemeral: isPrivate });
            const question = options.getString("question");
            const res = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            await interaction.editReply(res.choices[0].message.content);
        }
        // ... rest of your commands (roast, rps, poster, remindme, listreminders, cancelreminder, summarise, replysuggest, fixgrammar, purge, poll) remain exactly the same as before with the previous fixes
    } catch (err) {
        console.error("Interaction error:", err);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "❌ Something went wrong.", ephemeral: true });
        } else {
            await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
        }
    }
});

// === Start Bot ===
client.login(process.env.DISCORD_TOKEN);
