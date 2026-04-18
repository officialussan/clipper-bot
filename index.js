require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const REVIEW_CHANNEL_ID = process.env.REVIEW_CHANNEL_ID;
const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID;

function stripQuery(url) {
  return url.split('?')[0].trim();
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Bot is online as ${readyClient.user.tag}`);
});

// !panel command
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // 🔒 ONLY ADMINS CAN USE
  if (!message.member.permissions.has('Administrator')) return;

  if (message.content === '!panel') {
    await message.delete(); // remove command message

    const button = new ButtonBuilder()
      .setCustomId('join_campaign')
      .setLabel('Join Campaign')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await message.channel.send({
      content: `🛍️ **Earn Money Posting Clips & Edits – eMoney Shopping**

Earn money by posting clips and edits of *eMoney Shopping coupons* — **“The Resell Universe.”**

All you have to do is **register for the campaign below** and follow the guidelines to start earning.

📊 **Campaign Overview**
• Clips & edits that follow campaign guidelines
• Platforms: TikTok, Instagram, YouTube, Facebook
• Target: Tier 1 countries
• Minimum video length: 20 seconds

💰 **Earnings**
• $1 per 1,000 views
• $100 per 100,000 views
• $300 per 1,000,000 views

• **Budget:** $15,000 *(up to 15M total views)*
• **Minimum payout:** **$10**

🚀 **Join the Campaign**
Click the button below to start clipping and earning:`,
      components: [row]
    });
  }
});

// button + modal + approve/reject
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Join Campaign button
    if (interaction.isButton() && interaction.customId === 'join_campaign') {
      const modal = new ModalBuilder()
        .setCustomId('join_modal')
        .setTitle('Submit your accounts links');

      const youtubeInput = new TextInputBuilder()
        .setCustomId('youtube_link')
        .setLabel('Paste your YouTube link')
        .setPlaceholder('https://youtube.com/@username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const instagramInput = new TextInputBuilder()
        .setCustomId('instagram_link')
        .setLabel('Paste your Instagram link')
        .setPlaceholder('https://www.instagram.com/username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const tiktokInput = new TextInputBuilder()
        .setCustomId('tiktok_link')
        .setLabel('Paste your TikTok link')
        .setPlaceholder('https://www.tiktok.com/@username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const facebookInput = new TextInputBuilder()
        .setCustomId('facebook_link')
        .setLabel('Paste your Facebook profile link')
        .setPlaceholder('https://www.facebook.com/username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(youtubeInput);
      const row2 = new ActionRowBuilder().addComponents(instagramInput);
      const row3 = new ActionRowBuilder().addComponents(tiktokInput);
      const row4 = new ActionRowBuilder().addComponents(facebookInput);

      modal.addComponents(row1, row2, row3, row4);

      await interaction.showModal(modal);
      return;
    }

    // Modal submit
    if (interaction.isModalSubmit() && interaction.customId === 'join_modal') {
      const youtubeRaw = interaction.fields.getTextInputValue('youtube_link').trim();
      const instagramRaw = interaction.fields.getTextInputValue('instagram_link').trim();
      const tiktokRaw = interaction.fields.getTextInputValue('tiktok_link').trim();
      const facebookRaw = interaction.fields.getTextInputValue('facebook_link').trim();

      const youtube = stripQuery(youtubeRaw);
      const instagram = stripQuery(instagramRaw);
      const tiktok = stripQuery(tiktokRaw);
      const facebook = stripQuery(facebookRaw);

      const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/(@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+)|youtu\.be\/[A-Za-z0-9_-]+)([/?].*)?$/i;
      const instagramRegex = /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?(\?.*)?$/i;
      const tiktokRegex = /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/?(\?.*)?$/i;

      const badFacebookRegex = /^https?:\/\/(www\.)?facebook\.com\/(share|reel|video)\//i;
      const facebookProfileRegex = /^https?:\/\/(www\.)?facebook\.com\/([A-Za-z0-9.\-]+|profile\.php)(\/)?(\?.*)?$/i;

      if (!youtubeRegex.test(youtubeRaw)) {
        await interaction.reply({
          content: '❌ Invalid YouTube link.\nExample: https://youtube.com/@username',
          ephemeral: true
        });
        return;
      }

      if (!instagramRegex.test(instagramRaw)) {
        await interaction.reply({
          content: '❌ Invalid Instagram link.\nExample: https://www.instagram.com/username',
          ephemeral: true
        });
        return;
      }

      if (!tiktokRegex.test(tiktokRaw)) {
        await interaction.reply({
          content: '❌ Invalid TikTok link.\nExample: https://www.tiktok.com/@username',
          ephemeral: true
        });
        return;
      }

      if (badFacebookRegex.test(facebookRaw) || !facebookProfileRegex.test(facebookRaw)) {
        await interaction.reply({
          content: '❌ Please submit a valid Facebook profile/page link, not a share, reel, or video link.\nExample: https://www.facebook.com/username',
          ephemeral: true
        });
        return;
      }

      const reviewChannel = interaction.guild.channels.cache.get(REVIEW_CHANNEL_ID);

      if (!reviewChannel) {
        await interaction.reply({
          content: '❌ Review channel not found. Check REVIEW_CHANNEL_ID.',
          ephemeral: true
        });
        return;
      }

      const botMember = interaction.guild.members.me;
      const perms = reviewChannel.permissionsFor(botMember);

      if (!perms || !perms.has(['ViewChannel', 'SendMessages', 'ReadMessageHistory'])) {
        await interaction.reply({
          content: '❌ I do not have permission to access the review channel.',
          ephemeral: true
        });
        return;
      }

      const approveButton = new ButtonBuilder()
        .setCustomId(`approve_${interaction.user.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success);

      const rejectButton = new ButtonBuilder()
        .setCustomId(`reject_${interaction.user.id}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger);

      const reviewRow = new ActionRowBuilder().addComponents(approveButton, rejectButton);

      await reviewChannel.send({
        content: `📥 **New Campaign Submission**

**User:** <@${interaction.user.id}>
**Discord ID:** ${interaction.user.id}

**YouTube:** ${youtube}
**Instagram:** ${instagram}
**TikTok:** ${tiktok}
**Facebook:** ${facebook}`,
        components: [reviewRow]
      });

      await interaction.reply({
        content: '✅ Submitted successfully. Your links are now under review.',
        ephemeral: true
      });
      return;
    }

    // Approve
    if (interaction.isButton() && interaction.customId.startsWith('approve_')) {
      const userId = interaction.customId.replace('approve_', '');
      const member = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!member) {
        await interaction.reply({
          content: '❌ Could not find that user.',
          ephemeral: true
        });
        return;
      }

      const role = interaction.guild.roles.cache.get(CLIPPER_ROLE_ID);

      if (!role) {
        await interaction.reply({
          content: '❌ Clipper role not found. Check CLIPPER_ROLE_ID.',
          ephemeral: true
        });
        return;
      }

      await member.roles.add(role);

      await interaction.update({
        content: `✅ **Approved**

**User:** <@${userId}> has been approved and given the <@&${CLIPPER_ROLE_ID}> role.`,
        components: []
      });

      try {
        await member.send('✅ You have been approved for the campaign and now have access.');
      } catch (error) {
        console.log('Could not DM approved user.');
      }
      return;
    }

    // Reject
    if (interaction.isButton() && interaction.customId.startsWith('reject_')) {
      const userId = interaction.customId.replace('reject_', '');
      const member = await interaction.guild.members.fetch(userId).catch(() => null);

      await interaction.update({
        content: `❌ **Rejected**

**User:** <@${userId}> was rejected.`,
        components: []
      });

      if (member) {
        try {
          await member.send('❌ Your campaign application was rejected. Please check your links and try again.');
        } catch (error) {
          console.log('Could not DM rejected user.');
        }
      }
      return;
    }
  } catch (error) {
    console.error('Interaction error:', error);

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ Something went wrong while processing this action.',
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: '❌ Something went wrong while processing this action.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

client.login(process.env.TOKEN);