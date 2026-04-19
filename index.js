require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  Events,
  PermissionsBitField
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID;

const dataFilePath = path.join(__dirname, 'data.json');

const CAMPAIGNS = {
  emoney_shopping: {
  id: 'emoney_shopping',
  name: 'eMoney Shopping',
  allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
  staffChannelId: process.env.EMONEY_STAFF_CHANNEL_ID,
  roleId: process.env.EMONEY_CAMPAIGN_ROLE_ID,
    panelText: `🎙️ **Earn Money Posting Political Clips – Michael Carbonara Campaign**

Earn money by posting clips and edits of politician *Michael Carbonara* discussing current political topics. High-quality AI-generated content is accepted!

All you have to do is **register for the campaign below** and follow the guidelines to start earning.

📊 **Campaign Overview**
• **Content:** Michael Carbonara political discussions
• **Platforms:** TikTok, IG Reels, YouTube Shorts
• **Requirement:** Must tag **@mcarbonarafl** at the start of every caption
• **Requirement:** Likeness (audio/visual) must be exact
• **Strict Rule:** **NO** Anti-Trump or Anti-White House content
• **Strict Rule:** **NO** outrageous or violent content *(r*pe, killing, etc.)*

💰 **Payment Details**

> **TikTok:** $160 per 100,000 views  
> **YouTube Shorts:** $100 per 100,000 views  
> **Instagram Reels:** $50 per 100,000 views  
> **Account Limit:** Unlimited  
> **Payment Method:** Crypto  
> **Minimum Payout:** 100k views to qualify

🚀 **Join the Campaign**
Click the button below to start clipping and earning:`
  }
};

function loadData() {
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify({ users: {}, applications: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
}

function ensureUser(data, member) {
  if (!data.users[member.id]) {
    data.users[member.id] = {
      discordId: member.id,
      discordName: member.user.username,
      verified: false,
      campaigns: [],
      stats: { videosPosted: 0, videosApproved: 0, videosRejected: 0, totalViews: 0, moneyMade: 0 }
    };
  }
  return data.users[member.id];
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function formatPlatform(p) {
  return { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook' }[p] || p;
}

function normalizeUsername(u) {
  return String(u).trim().replace(/^@+/, '');
}

function makeApplicationId() {
  return `app_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function getStatusLabel(s) {
  return {
    pending: 'Pending',
    waiting_confirm: 'Waiting for user confirmation',
    verifying: 'Verifying',
    approved: 'Approved',
    rejected: 'Rejected'
  }[s] || s;
}

function renderStaffContent(app) {
  return `📥 **Campaign Application**

User: <@${app.userId}>
Campaign: ${app.campaignName}
Platform: ${formatPlatform(app.platform)}
Username: @${app.username}
Status: ${getStatusLabel(app.status)}
${app.bioCode ? `Code: \`${app.bioCode}\`` : ''}`;
}

function buildStaffButtons(id, status) {
  if (status === 'pending') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`staff_send_code:${id}`).setLabel('Send Code').setStyle(ButtonStyle.Primary)
    )];
  }
  if (status === 'waiting_confirm') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wait:${id}`).setLabel('Waiting').setStyle(ButtonStyle.Secondary).setDisabled(true)
    )];
  }
  if (status === 'verifying') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`staff_accept:${id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`staff_reject:${id}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
    )];
  }
  return [];
}

async function updateStaffMessage(guild, app) {
  const ch = guild.channels.cache.get(app.staffChannelId);
  if (!ch) return;
  try {
    const msg = await ch.messages.fetch(app.staffMessageId);
    await msg.edit({
      content: renderStaffContent(app),
      components: buildStaffButtons(app.id, app.status)
    });
  } catch {}
}

client.once(Events.ClientReady, c => console.log(`Online as ${c.user.tag}`));

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    console.log('MESSAGE RECEIVED:', message.content);

    // VERIFY PANEL
    if (message.content === '!verifypanel') {
  if (!isAdmin(message.member)) {
    await message.reply('❌ You must be an admin to use this command.');
    return;
  }

  await message.delete().catch(() => {});

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_human')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Primary)
  );

  const embed = new EmbedBuilder()
    .setTitle('🤖 Verification Required')
    .setDescription(
      'This server requires you to verify yourself before accessing the rest of the server.\n\nClick the **Verify** button below to continue.'
    )
    .setImage('https://your-image-link-here.com/banner.png');

  await message.channel.send({
    embeds: [embed],
    components: [row]
  });

  return;
}

      await message.delete().catch(() => {});

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_human')
          .setLabel("I'm not a robot")
          .setStyle(ButtonStyle.Success)
      );

      await message.channel.send({
        content: `✅ **Verification Required**

Click the button below to verify that you're human.`,
        components: [row]
      });

      return;
    }

    // CAMPAIGN PANEL
    if (message.content.startsWith('!campaignpanel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];

      if (!campaignId || !CAMPAIGNS[campaignId]) {
        await message.channel.send(
          `❌ Usage: \`!campaignpanel campaign_id\`\nAvailable campaigns: ${Object.keys(CAMPAIGNS).join(', ')}`
        );
        return;
      }

      const campaign = CAMPAIGNS[campaignId];

      await message.delete().catch(() => {});

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_campaign:${campaign.id}`)
          .setLabel('Join Campaign')
          .setStyle(ButtonStyle.Success)
      );

      await message.channel.send({
        content: campaign.panelText,
        components: [row]
      });

      return;
    }
  } catch (error) {
    console.error('MessageCreate error:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {

    // JOIN
    if (interaction.isButton() && interaction.customId.startsWith('join_campaign:')) {
      const campaign = CAMPAIGNS[interaction.customId.split(':')[1]];
      const select = new StringSelectMenuBuilder()
        .setCustomId(`campaign_platform:${campaign.id}`)
        .addOptions(campaign.allowedPlatforms.map(p => ({ label: formatPlatform(p), value: p })));

      await interaction.reply({
        content: `Choose platform for **${campaign.name}**`,
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });
    }

    // SELECT
    if (interaction.isStringSelectMenu()) {
      const [_, campaignId] = interaction.customId.split(':');
      const platform = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`campaign_username:${campaignId}:${platform}`)
        .setTitle('Enter Username');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('campaign_username_input')
            .setLabel('Username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    // USER SUBMIT
    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_username')) {
      const [, campaignId, platform] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];

      const username = normalizeUsername(
        interaction.fields.getTextInputValue('campaign_username_input')
      );

      const data = loadData();
      const appId = makeApplicationId();

      const app = {
        id: appId,
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        campaignId,
        campaignName: campaign.name,
        platform,
        username,
        status: 'pending',
        bioCode: null,
        staffChannelId: campaign.staffChannelId,
        staffMessageId: null,
        sourceChannelId: interaction.channelId
      };

      const staffCh = interaction.guild.channels.cache.get(campaign.staffChannelId);
      const msg = await staffCh.send({
        content: renderStaffContent(app),
        components: buildStaffButtons(appId, 'pending')
      });

      app.staffMessageId = msg.id;
      data.applications[appId] = app;
      saveData(data);

      await interaction.reply({ content: `Submitted. Wait for code.`, ephemeral: true });
    }

    // STAFF SEND CODE
    if (interaction.isButton() && interaction.customId.startsWith('staff_send_code')) {
      const appId = interaction.customId.split(':')[1];

      const modal = new ModalBuilder()
        .setCustomId(`staff_code:${appId}`)
        .setTitle('Enter Code');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('code')
            .setLabel('Code')
            .setStyle(TextInputStyle.Short)
        )
      );

      await interaction.showModal(modal);
    }

    // STAFF CODE SUBMIT
if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_code')) {
  if (!interaction.guild || !isAdmin(interaction.member)) {
    await interaction.reply({
      content: '❌ You are not allowed to do this.',
      ephemeral: true
    });
    return;
  }

  const appId = interaction.customId.split(':')[1];
  const data = loadData();
  const app = data.applications[appId];

  if (!app) {
    await interaction.reply({
      content: '❌ Application not found.',
      ephemeral: true
    });
    return;
  }

  const code = interaction.fields.getTextInputValue('code').trim();

  app.bioCode = code;
  app.status = 'waiting_confirm';
  data.applications[appId] = app;
  saveData(data);

  // update staff message first
  await updateStaffMessage(interaction.guild, app);

  // send code to original campaign channel
  const sourceChannel = interaction.guild.channels.cache.get(app.sourceChannelId);

  if (!sourceChannel) {
    await interaction.reply({
      content: '❌ Original campaign channel not found.',
      ephemeral: true
    });
    return;
  }

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`user_confirm:${appId}`)
      .setLabel('Confirm Bio Updated')
      .setStyle(ButtonStyle.Success)
  );

  await sourceChannel.send({
    content: `📩 <@${app.userId}> your bio code for **${app.campaignName}** is:

\`${code}\`

Add this code to your **${formatPlatform(app.platform)}** bio for **@${app.username}**.

When done, click the button below.`,
    components: [confirmRow]
  });

  await interaction.reply({
    content: `✅ Code sent to <@${app.userId}>.`,
    ephemeral: true
  });
}

    // USER CONFIRM
if (interaction.isButton() && interaction.customId.startsWith('user_confirm')) {
  const appId = interaction.customId.split(':')[1];
  const data = loadData();
  const app = data.applications[appId];

  if (!app) {
    await interaction.reply({
      content: '❌ Application not found.',
      ephemeral: true
    });
    return;
  }

  if (interaction.user.id !== app.userId) {
    await interaction.reply({
      content: '❌ This confirmation is not for you.',
      ephemeral: true
    });
    return;
  }

  app.status = 'verifying';
  data.applications[appId] = app;
  saveData(data);

  await updateStaffMessage(interaction.guild, app);

  await interaction.reply({
    content: '✅ Submitted. Staff reviewing.',
    ephemeral: true
  });
}

  } catch (e) {
    console.log(e);
  }
});

client.login(process.env.TOKEN);