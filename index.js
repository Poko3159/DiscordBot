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
const ticketsChannelId = process.env.TICKETS_CHANNEL_ID;
const reminderChannelId = process.env.REMINDER_CHANNEL_ID;
const REMINDER_FILE = "./reminders.json";
const rpsChoices = ["rock", "paper", "scissors"];
const eightBallResponses = [
    "Yes.", "No.", "Definitely.", "Absolutely not.", "Ask again later.",
    "It is certain.", "Very doubtful.", "Without a doubt.", "Better not tell you now."
];
let lastReminderMessageId = null;

// === Reminder Storage ===
function loadReminders() {
    if (!fs.existsSync(REMINDER_FILE)) return {};
    return JSON.parse(fs.readFileSync(REMINDER_FILE));
}

function saveReminders(data) {
    fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2));
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

function getUserInfo(user) {
    return `👤 Username: ${user.tag}\n🆔 ID: ${user.id}\n📅 Created: ${user.createdAt.toDateString()}`;
}

function getServerInfo(guild) {
    return `🏰 Server: ${guild.name}\n🆔 ID: ${guild.id}\n👥 Members: ${guild.memberCount}\n📅 Created: ${guild.createdAt.toDateString()}`;
}

async function cleanupOldReminders(channel) {
    if (!channel?.isTextBased()) return;
    try {
        const fetched = await channel.messages.fetch({ limit: 50 });
        const toDelete = fetched.filter(m =>
            m.author?.id === client.user?.id &&
            m.embeds?.length &&
            m.embeds[0].title?.includes("Lost Family")
        ).first(5);
        for (const msg of toDelete) {
            if (msg.deletable) await msg.delete().catch(() => {});
        }
    } catch (err) {
        console.warn("Reminder cleanup error:", err);
    }
}

async function postApplicationReminder(channel) {
    if (!channel || !channel.isTextBased()) return;
    await cleanupOldReminders(channel);

    const now = DateTime.now().setZone("Europe/London");
    const nextReminder = now.plus({ hours: 6 - (now.hour % 6), minutes: -now.minute, seconds: -now.second });
    const timeLeft = nextReminder.diff(now, ["hours", "minutes"]).toObject();
    const countdownText = `${Math.floor(timeLeft.hours)}h ${Math.floor(timeLeft.minutes)}m`;

    const ticketUrl = `https://discord.com/channels/${channel.guildId}/${ticketsChannelId}`;
    const embed = new EmbedBuilder()
        .setColor(0x1ABC9C)
        .setTitle("📢 Join a Lost Family Clan!")
        .setDescription(`Looking to join a Lost Family clan?\n\nHead over to <#${ticketsChannelId}> and select **Clan Application** from the ticket dropdown.`)
        .addFields({ name: "⏳ Time Until Next Reminder", value: countdownText, inline: true })
        .setFooter({ text: "Lost Family Network | Applications open 24/7" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("📝 Apply Now")
            .setStyle(ButtonStyle.Link)
            .setURL(ticketUrl)
    );

    try {
        const sent = await channel.send({ embeds: [embed], components: [row] });
        lastReminderMessageId = sent.id;
    } catch (err) {
        console.error("Reminder post error:", err);
    }
}
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
            .addStringOption(opt => opt.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
            .addStringOption(opt => opt.setName("target").setDescription("Target to roast")),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
            .addStringOption(opt => opt.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war data.")
            .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message."),
        new SlashCommandBuilder().setName("clans").setDescription("How to apply for a Lost Family clan."),
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
            .addIntegerOption(opt => opt.setName("count").setDescription("Number of messages to delete").setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, guild, channel } = interaction;

    try {
        if (commandName === "ping") {
            await interaction.reply("🏓 Pong! I'm alive.");
        } else if (commandName === "help") {
            await interaction.reply("Available commands: /ping /help /player /clan /leaderboard /ask /roast /rps /poster /remind /clans /remindme /listreminders /cancelreminder /summarise /replysuggest /fixgrammar /purge");
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
            const question = options.getString("question");
            const res = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            await interaction.reply(res.choices[0].message.content);
        } else if (commandName === "roast") {
            const target = options.getString("target") || "you";
            const roast = await roastUser(target);
            await interaction.reply(roast);
        } else if (commandName === "rps") {
            const choice = options.getString("choice");
            const result = playRps(choice.toLowerCase());
            await interaction.reply(result);
        } else if (commandName === "poster") {
            const tag = options.getString("tag");
            const war = await getClanWarData(tag);
            if (war.error) return await interaction.reply(war.error);
            await interaction.reply(`⚔️ War Status: ${war.state}\nStars: ${war.clan.stars} vs ${war.opponent.stars}`);
        } else if (commandName === "remind") {
            const reminderChannel = await client.channels.fetch(reminderChannelId);
            await postApplicationReminder(reminderChannel);
            await interaction.reply("✅ Reminder sent.");
        } else if (commandName === "clans") {
            await interaction.reply(`📢 To apply for a Lost Family clan, head to <#${ticketsChannelId}> and open a Clan Application ticket.`);
        } else if (commandName === "remindme") {
            const minutes = parseInt(options.getString("time"));
            const message = options.getString("message");
            const userId = user.id;
            const reminders = loadReminders();

            const reminder = {
                id: Date.now().toString(),
                message,
                time: Date.now() + minutes * 60000
            };

            if (!reminders[userId]) reminders[userId] = [];
            reminders[userId].push(reminder);
            saveReminders(reminders);

            await interaction.reply(`⏳ Reminder set for ${minutes} minutes.`);

            setTimeout(() => {
                interaction.followUp({ content: `🔔 Reminder: ${message}`, ephemeral: true });
            }, minutes * 60000);
        } else if (commandName === "listreminders") {
            const reminders = loadReminders()[user.id] || [];
            if (!reminders.length) return await interaction.reply("📭 You have no active reminders.");
            const list = reminders.map(r => `• ID: ${r.id} – ${r.message}`).join("\n");
            await interaction.reply(`📋 Your reminders:\n${list}`);
        } else if (commandName === "cancelreminder") {
            const id = options.getString("id");
            const reminders = loadReminders();
            const userReminders = reminders[user.id] || [];
            const updated = userReminders.filter(r => r.id !== id);
            if (updated.length === userReminders.length) return await interaction.reply("❌ No reminder found with that ID.");
            reminders[user.id] = updated;
            saveReminders(reminders);
            await interaction.reply("✅ Reminder cancelled.");
        } else if (commandName === "summarise") {
            const text = options.getString("text");
            const result = await aiTransform("Summarise this text clearly and concisely.", text);
            await interaction.reply(result);
        } else if (commandName === "replysuggest") {
            const text = options.getString("text");
            const result = await aiTransform("Suggest a helpful and friendly reply to this message.", text);
            await interaction.reply(result);
                } else if (commandName === "fixgrammar") {
            const text = options.getString("text");
            const result = await aiTransform("Fix grammar, spelling, and clarity in this text.", text);
            await interaction.reply(result);
        } else if (commandName === "purge") {
            const count = options.getInteger("count");
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return await interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            const messages = await channel.messages.fetch({ limit: count });
            const deletable = messages.filter(m => !m.pinned);
            await channel.bulkDelete(deletable, true);
            await interaction.reply({ content: `🧹 Deleted ${deletable.size} messages.`, ephemeral: true });
        }
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