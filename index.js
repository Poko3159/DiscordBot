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

async function deliverReminder(userId, message) {
    try {
        const user = await client.users.fetch(userId);
        await user.send(`🔔 Reminder: ${message}`);

        const reminders = loadReminders();
        reminders[userId] = reminders[userId].filter(r => r.message !== message);
        if (reminders[userId].length === 0) {
            delete reminders[userId];
        }
        saveReminders(reminders);
    } catch (err) {
        if (err.code === 10013) {
            console.warn(`⚠️ Could not deliver reminder — Unknown User (ID: ${userId})`);
        } else {
            console.error(`❌ Failed to deliver reminder to ${userId}:`, err);
        }

        // Clean up reminder even if user is gone
        const reminders = loadReminders();
        if (reminders[userId]) {
            reminders[userId] = reminders[userId].filter(r => r.message !== message);
            if (reminders[userId].length === 0) {
                delete reminders[userId];
            }
            saveReminders(reminders);
        }
    }
}

// === Helper Functions ===
async function getPlayerInfo(tag) {
    try {
        const res = await axios.get(`${COC_BASE_URL}/players/%23${tag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "❌ Could not fetch player info." };
    }
}

async function getClanInfo(tag) {
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${tag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "❌ Could not fetch clan info." };
    }
}

async function getTopClans() {
    try {
        const res = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data.items.slice(0, 5);
    } catch {
        return { error: "❌ Could not fetch top clans." };
    }
}

async function getClanWarData(tag) {
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${tag}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch {
        return { error: "❌ Could not fetch clan war data." };
    }
}

async function roastUser(target) {
    const res = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: `Roast ${target} in a funny way.` }]
    });
    return res.choices[0].message.content;
}

async function aiTransform(instruction, text) {
    const res = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: `${instruction}\n\n${text}` }]
    });
    return res.choices[0].message.content;
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

// === Ready Event ===
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}!`);

    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!"),
        new SlashCommandBuilder().setName("help").setDescription("Shows all commands."),
        new SlashCommandBuilder().setName("player").setDescription("Get player info.").addStringOption(opt => opt.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan").setDescription("Get clan info.").addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top clans."),
        new SlashCommandBuilder().setName("ask").setDescription("Ask AI a question.").addStringOption(opt => opt.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user.").addStringOption(opt => opt.setName("target").setDescription("Who to roast").setRequired(false)),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.").addStringOption(opt => opt.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war info.").addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("remindme").setDescription("Set a reminder.").addStringOption(opt => opt.setName("time").setDescription("Minutes from now").setRequired(true)).addStringOption(opt => opt.setName("message").setDescription("Reminder message").setRequired(true)),
        new SlashCommandBuilder().setName("listreminders").setDescription("List your reminders."),
        new SlashCommandBuilder().setName("cancelreminder").setDescription("Cancel a reminder.").addStringOption(opt => opt.setName("id").setDescription("Reminder ID").setRequired(true)),
        new SlashCommandBuilder().setName("summarise").setDescription("Summarise text.").addStringOption(opt => opt.setName("text").setDescription("The text").setRequired(true)),
        new SlashCommandBuilder().setName("replysuggest").setDescription("Suggest a reply.").addStringOption(opt => opt.setName("text").setDescription("The text").setRequired(true)),
        new SlashCommandBuilder().setName("fixgrammar").setDescription("Fix grammar.").addStringOption(opt => opt.setName("text").setDescription("The text").setRequired(true)),
        new SlashCommandBuilder().setName("purge").setDescription("Delete messages.").addIntegerOption(opt => opt.setName("count").setDescription("Number of messages").setRequired(true)),
        new SlashCommandBuilder().setName("poll").setDescription("Create a poll.").addStringOption(opt => opt.setName("question").setDescription("The poll question").setRequired(true)).addStringOption(opt => opt.setName("options").setDescription("Comma-separated options").setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");

    rescheduleReminders();
});

// === Interaction Handler ===
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
            await interaction.deferReply({ flags: 64 });
            const question = options.getString("question");
            const res = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            await interaction.editReply(res.choices[0].message.content);
        } else if (commandName === "roast") {
            await interaction.deferReply({ flags: 64 });
            const target = options.getString("target") || "you";
            const roast = await roastUser(target);
            await interaction.editReply(roast);
        } else if (commandName === "rps") {
            const choice = options.getString("choice");
            const result = playRps(choice.toLowerCase());
            await interaction.reply(result);
        } else if (commandName === "poster") {
            const tag = options.getString("tag");
            const war = await getClanWarData(tag);
            if (war.error) return await interaction.reply(war.error);
            await interaction.reply(`⚔️ War Status: ${war.state}\nStars: ${war.clan.stars} vs ${war.opponent.stars}`);
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
                deliverReminder(userId, message);
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
            await interaction.deferReply({ flags: 64 });
            const text = options.getString("text");
            const result = await aiTransform("Summarise this text clearly and concisely.", text);
            await interaction.editReply(result);
        } else if (commandName === "replysuggest") {
            await interaction.deferReply({ flags: 64 });
            const text = options.getString("text");
            const result = await aiTransform("Suggest a helpful and friendly reply to this message.", text);
            await interaction.editReply(result);
        } else if (commandName === "fixgrammar") {
            await interaction.deferReply({ flags: 64 });
            const text = options.getString("text");
            const result = await aiTransform("Fix grammar, spelling, and clarity in this text.", text);
            await interaction.editReply(result);
        } else if (commandName === "purge") {
            const count = options.getInteger("count");

            if (!count || count < 1 || count > 100) {
                return await interaction.reply({ content: "❌ Please provide a count between 1 and 100.", flags: 64 });
            }

            const member = interaction.member;
            if (!member || !member.permissions || !member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return await interaction.reply({ content: "❌ You don't have permission to use this command.", flags: 64 });
            }

            if (!channel || !channel.messages) {
                return await interaction.reply({ content: "❌ Unable to access this channel's messages.", flags: 64 });
            }

            const messages = await channel.messages.fetch({ limit: count });
            const deletable = messages.filter(m => !m.pinned);

            await channel.bulkDelete(deletable, true);
            await interaction.reply({ content: `🧹 Deleted ${deletable.size} messages.`, flags: 64 });
        } else if (commandName === "poll") {
            const question = options.getString("question");
            const rawOptions = options.getString("options");
            const choices = rawOptions.split(",").map(opt => opt.trim()).filter(opt => opt);

            if (choices.length < 2 || choices.length > 5) {
                return await interaction.reply("❌ Please provide between 2 and 5 options.");
            }

            const row = new ActionRowBuilder();
            choices.forEach((opt, i) => {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`poll_${i}`)
                        .setLabel(opt)
                        .setStyle(ButtonStyle.Primary)
                );
            });

            const embed = new EmbedBuilder()
                .setTitle("📊 Poll")
                .setDescription(question)
                .setFooter({ text: "Click a button to vote!" });

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    } catch (err) {
        console.error("Interaction error:", err);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: "❌ Something went wrong.", flags: 64 });
            } else {
                await interaction.reply({ content: "❌ Something went wrong.", flags: 64 });
            }
        } catch (followErr) {
            console.error("Failed to send error reply:", followErr);
        }
    }
});

// === Start the Bot ===
client.login(process.env.DISCORD_TOKEN);