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
  ChannelType,
  PermissionsBitField,
  PermissionFlagsBits,
  EmbedBuilder,
  Status,
  MessageFlags
} = require('discord.js');

const cron = require("node-cron");

const express = require('express');
const axios = require('axios');

// Express App Setup
const app = express();



const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

const PORT = process.env.PORT
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI; // Update this variable in Railway (see Step 3);
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const PROXY_STAFF_ROLE_ID = process.env.PROXY_STAFF_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const CONNECT_ACCOUNTS_CHANNEL_ID = process.env.CONNECT_ACCOUNTS_CHANNEL_ID;
const VERIFY_DEMOGRAPHICS_CHANNEL_ID = process.env.VERIFY_DEMOGRAPHICS_CHANNEL_ID;
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID;
const DEMOGRAPHICS_STAFF_CHANNEL_ID = process.env.DEMOGRAPHICS_STAFF_CHANNEL_ID;
const GET_HELP_CHANNEL_ID = process.env.GET_HELP_CHANNEL_ID || '1492888887452762313';
const DEMOGRAPHICS_UPLOAD_CATEGORY_ID = process.env.DEMOGRAPHICS_UPLOAD_CATEGORY_ID;
const PAYMENT_STAFF_CHANNEL_ID = process.env.PAYMENT_STAFF_CHANNEL_ID;
const LEADERBOARD_CHANNEL_ID = '1495692728431018015';
const LEADERBOARD_MESSAGE_ID = '1508380113056567417';
const MONSTERLAB_API_KEY = process.env.MONSTERLAB_API_KEY;
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const INSTAGRAM_TEST_ACCESS_TOKEN = process.env.INSTAGRAM_TEST_ACCESS_TOKEN;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;
const INSTAGRAM_API_VERSION = process.env.INSTAGRAM_API_VERSION || 'v24.0';
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_INSTAGRAM_ACTOR = 'apify~instagram-reel-scraper';
const PRICE_PER_PROXY = 7;
const FINISHED_CAMPAIGNS_CATEGORY_ID = '1520064994274709747';
const STAFF_CONTROL_CHANNEL_ID = "1521116369909710889";
const GOAL_CHANNEL_ID = process.env.GOAL_CHANNEL_ID;
const PAID_CHANNEL_ID = process.env.PAID_CHANNEL_ID;
const AVAILABLE_CHANNEL_ID = process.env.AVAILABLE_CHANNEL_ID;
const VIEWS_CHANNEL_ID = process.env.VIEWS_CHANNEL_ID;
const ACTIVE_CAMPAIGNS_CHANNEL_ID = process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID;
const CLIP_TRACK_INTERVAL_MS = 3 * 60 * 60 * 1000;
const CLIP_TRACK_SCHEDULER_MS = 10 * 60 * 1000;
const CLIP_TRACK_RETRY_MS = 15 * 60 * 1000;

function getInstagramConfigurationStatus() {
  const missing = [];
  if (!INSTAGRAM_APP_ID) missing.push('INSTAGRAM_APP_ID');
  if (!INSTAGRAM_APP_SECRET) missing.push('INSTAGRAM_APP_SECRET');
  if (!INSTAGRAM_TEST_ACCESS_TOKEN) missing.push('INSTAGRAM_TEST_ACCESS_TOKEN');
  if (!INSTAGRAM_REDIRECT_URI) missing.push('INSTAGRAM_REDIRECT_URI');
  return { configured: missing.length === 0, missing };
}

async function fetchInstagramTestIdentity() {
  if (!INSTAGRAM_TEST_ACCESS_TOKEN) throw new Error('Instagram test access token is not configured.');
  const response = await axios.get('https://graph.instagram.com/me', {
    params: {
      fields: 'id,user_id,username,account_type',
      access_token: INSTAGRAM_TEST_ACCESS_TOKEN
    },
    timeout: 15000
  });
  const data = response.data || {};
  const instagramUserId = data.user_id || data.id;
  if (!instagramUserId) throw new Error('Instagram did not return an account ID.');
  return {
    instagramUserId: String(instagramUserId),
    apiIdentityId: data.id ? String(data.id) : null,
    username: data.username || null,
    accountType: data.account_type || null
  };
}

function getInstagramApiErrorDetails(error) {
  const metaError = error?.response?.data?.error || {};
  return {
    status: Number(error?.response?.status) || null,
    code: Number(metaError.code) || null,
    subcode: Number(metaError.error_subcode) || null,
    type: metaError.type || null,
    message: metaError.message || error?.message || 'Instagram API request failed.'
  };
}

async function instagramApiGet(path, params = {}) {
  if (!INSTAGRAM_TEST_ACCESS_TOKEN) throw new Error('Instagram test access token is not configured.');
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const url = `https://graph.instagram.com/${INSTAGRAM_API_VERSION}/${cleanPath}`;
  try {
    const response = await axios.get(url, { params: { ...params, access_token: INSTAGRAM_TEST_ACCESS_TOKEN }, timeout: 15000 });
    return response.data;
  } catch (error) {
    const details = getInstagramApiErrorDetails(error);
    const wrapped = new Error(details.message || 'Instagram API request failed.');
    wrapped.instagramApiError = details;
    throw wrapped;
  }
}

async function fetchInstagramTestMedia(limit = 10) {
  const identity = await fetchInstagramTestIdentity();
  const MAX_MEDIA_TO_INSPECT = 100;
  const MAX_PAGES_TO_INSPECT = 10;
  const PAGE_LIMIT = 25;
  const media = [];
  let pagesInspected = 0;
  let after = null;
  let partialError = null;
  while (media.length < MAX_MEDIA_TO_INSPECT && pagesInspected < MAX_PAGES_TO_INSPECT) {
    try {
      const data = await instagramApiGet(`${identity.instagramUserId}/media`, {
        fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,username',
        limit: Math.min(Math.max(Number(limit) || PAGE_LIMIT, 1), PAGE_LIMIT),
        ...(after ? { after } : {})
      });
      pagesInspected++;
      media.push(...(Array.isArray(data?.data) ? data.data : []));
      if (media.filter(isInstagramReel).length >= 5) break;
      after = data?.paging?.cursors?.after || null;
      if (!after || !(data?.data || []).length) break;
    } catch (error) {
      partialError = error.instagramApiError || getInstagramApiErrorDetails(error);
      break;
    }
  }
  return { identity, media: media.slice(0, MAX_MEDIA_TO_INSPECT), pagesInspected, partialError };
}

function isInstagramReel(media) {
  return getInstagramMediaClassification(media).isReel;
}

function getInstagramMediaClassification(media) {
  const mediaType = String(media?.media_type || 'UNKNOWN').toUpperCase();
  const productType = String(media?.media_product_type || 'UNKNOWN').toUpperCase();
  const permalink = String(media?.permalink || '');
  return { mediaType, productType, isReel: productType === 'REELS' || productType === 'REEL' || /\/reels?\//i.test(permalink) };
}

function extractInstagramInsightValue(metric) {
  if (!metric) return null;
  const values = Array.isArray(metric.values) ? metric.values : [];
  const latestValue = values.length ? values[values.length - 1]?.value : null;
  const directValue = metric.total_value?.value ?? metric.value ?? latestValue;
  const numeric = Number(directValue);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchInstagramTestMediaInsights(media) {
  if (!media?.id) throw new Error('Instagram media ID is missing.');
  const results = {}, errors = [];
  for (const metricName of ['views', 'plays']) {
    try {
      const response = await instagramApiGet(`${media.id}/insights`, { metric: metricName });
      const value = extractInstagramInsightValue(Array.isArray(response?.data) ? response.data[0] : null);
      if (value !== null) results[metricName] = value;
    } catch (error) {
      const details = error.instagramApiError || {};
      errors.push({ metric: metricName, status: details.status || null, code: details.code || null, message: details.message || error.message });
    }
  }
  const views = Number.isFinite(Number(results.views)) ? Number(results.views) : Number.isFinite(Number(results.plays)) ? Number(results.plays) : null;
  return { views, metrics: results, errors };
}

function getInstagramMediaTitle(media) {
  const caption = String(media?.caption || '').trim();
  if (!caption) return isInstagramReel(media) ? 'Instagram Reel' : 'Instagram Post';
  const firstLine = caption.split(/\r?\n/)[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

const instagramMediaTestCooldowns = new Map();
const apifyInstagramTestCooldowns = new Map();

function parsePublicInstagramReelUrl(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname !== 'instagram.com') return null;

  const match = url.pathname.match(/^\/reels?\/([^/?#]+)\/?/i);
  if (!match) return null;

  const shortcode = String(match[1] || '').trim();
  if (!shortcode) return null;

  return {
    platform: 'instagram',
    shortcode,
    canonicalUrl: `https://www.instagram.com/reel/${shortcode}/`
  };
}

function getApifyInstagramError(error) {
  const status = Number(error?.response?.status) || null;
  if (status === 402) return { status, message: 'Apify account does not have enough usage credit.' };
  if (status === 401 || status === 403) return { status, message: 'Apify API token is invalid or unauthorized.' };
  return { status, message: 'Instagram Reel data could not be retrieved.' };
}

async function runApifyInstagramReelScraper(reelUrl) {
  if (!APIFY_API_TOKEN) throw new Error('APIFY_API_TOKEN is not configured.');

  const parsed = parsePublicInstagramReelUrl(reelUrl);
  if (!parsed) throw new Error('Invalid Instagram Reel URL.');

  try {
    const response = await axios.post(
      `https://api.apify.com/v2/acts/${APIFY_INSTAGRAM_ACTOR}/run-sync-get-dataset-items`,
      {
        // The official Reel Scraper accepts direct Reel URLs in its `username` array.
        username: [parsed.canonicalUrl],
        resultsLimit: 1
      },
      {
        headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
        timeout: 120000
      }
    );
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    const details = getApifyInstagramError(error);
    const wrapped = new Error(details.message);
    wrapped.apifyInstagramError = details;
    throw wrapped;
  }
}

function getFirstFiniteNonNegativeValue(values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

function getFirstFiniteApifyMetric(candidates) {
  for (const candidate of candidates) {
    if (candidate.value === null || candidate.value === undefined || candidate.value === '') continue;
    const numeric = Number(candidate.value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return { value: numeric, field: candidate.field };
    }
  }
  return { value: null, field: null };
}

function getSafeApifyInstagramDiagnostics(item) {
  const diagnostics = {};
  const keyMatches = /view|play|like|comment|share|reach|impression|video|count/i;
  const addValue = (key, value) => {
    if (!keyMatches.test(key) || (typeof value !== 'number' && typeof value !== 'string')) return;
    if (typeof value === 'string' && (/^https?:\/\//i.test(value) || value.length > 100)) return;
    diagnostics[key] = value;
  };

  for (const [key, value] of Object.entries(item || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        addValue(`${key}.${nestedKey}`, nestedValue);
      }
    } else {
      addValue(key, value);
    }
  }
  return diagnostics;
}

function getApifyTimestampMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeApifyInstagramReel(item, requestedUrl) {
  const requested = parsePublicInstagramReelUrl(requestedUrl);
  if (!requested) throw new Error('Invalid Instagram Reel URL.');
  const source = item || {};
  const shortcode = String(source.shortcode || source.shortCode || requested.shortcode).trim();
  const usernameValue = [source.ownerUsername, source.username, source.owner?.username, source.authorUsername]
    .find(value => typeof value === 'string' && value.trim());
  const username = usernameValue ? usernameValue.replace(/^@+/, '').trim() : '';
  if (!username) throw new Error('Apify did not return the Reel owner username.');

  const caption = String(source.caption || source.text || source.title || '').trim();
  const firstLine = caption.split(/\r?\n/)[0].trim();
  const title = firstLine ? (firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine) : 'Instagram Reel';
  const thumbnailCandidate = [source.displayUrl, source.thumbnailUrl, source.thumbnailSrc]
    .find(value => typeof value === 'string' && /^https:\/\//i.test(value));
  const permalink = parsePublicInstagramReelUrl(source.reelUrl || source.url || source.permalink);

  // Apify Instagram Reel public play count is represented by
  // videoPlayCount in the current Actor output.
  // videoViewCount may represent a different/partial metric and must not
  // take precedence for Reel tracking.
  const viewMetric = getFirstFiniteApifyMetric([
    { field: 'videoPlayCount', value: source.videoPlayCount },
    { field: 'videoViewCount', value: source.videoViewCount },
    { field: 'playCount', value: source.playCount },
    { field: 'views', value: source.views },
    { field: 'viewCount', value: source.viewCount }
  ]);

  return {
    platform: 'instagram',
    videoId: String(source.id || source.videoId || shortcode),
    shortcode,
    url: permalink?.canonicalUrl || requested.canonicalUrl,
    username,
    title,
    thumbnailUrl: thumbnailCandidate || null,
    views: viewMetric.value,
    viewMetricField: viewMetric.field,
    likes: getFirstFiniteNonNegativeValue([source.likesCount, source.likeCount, source.likes]),
    comments: getFirstFiniteNonNegativeValue([source.commentCount, source.commentsCount, source.comments]),
    publishedTimestamp: getApifyTimestampMs(source.timestamp || source.publishedTimestamp || source.publishedAt || source.takenAt),
    fetchedAt: Date.now(),
    source: 'apify'
  };
}

async function fetchInstagramPublicReelMetadata(reelUrl) {
  return runApifyInstagramReelScraper(reelUrl);
}

async function fetchApifyInstagramReelMetadata(reelUrl) {
  const parsed = parsePublicInstagramReelUrl(reelUrl);
  if (!parsed) throw new Error('Invalid Instagram Reel URL.');

  const items = await fetchInstagramPublicReelMetadata(parsed.canonicalUrl);
  const item = items.find(candidate => {
    const candidateUrl = parsePublicInstagramReelUrl(candidate?.inputUrl || candidate?.reelUrl || candidate?.url || candidate?.permalink);
    return candidateUrl?.shortcode === parsed.shortcode || String(candidate?.shortcode || candidate?.shortCode || '') === parsed.shortcode;
  }) || items[0];
  if (!item) throw new Error('Instagram Reel data could not be retrieved.');

  const reel = normalizeApifyInstagramReel(item, parsed.canonicalUrl);
  return {
    authorUsername: reel.username,
    authorId: item.ownerId || item.owner?.id || null,
    authorDisplayName: item.ownerFullName || reel.username,
    title: reel.title,
    views: reel.views,
    likes: reel.likes,
    viewMetricField: reel.viewMetricField,
    thumbnailUrl: reel.thumbnailUrl,
    publishedTimestamp: reel.publishedTimestamp,
    canonicalUrl: reel.url
  };
}

const clean = (str) =>
  str.replace(/[`*_|~]/g, '').trim();

const toSafeChannelName = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);

const SUPPORTED_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Nigeria'
];

const ticketCooldowns = new Map();
const claimedTickets = new Map();

const localDataFilePath = path.join(__dirname, 'data.json');
const railwayDataFilePath = '/data/data.json';
const railwayBackupFilePath = '/data/data.backup.json';
const primaryDataFilePath = process.env.RAILWAY_ENVIRONMENT ? railwayDataFilePath : localDataFilePath;
const mirrorDataFilePath = localDataFilePath;
const dataFilePath = primaryDataFilePath;
// The project-level data.json mirror exists inside the running Railway
// container. It does not automatically synchronize back to the developer's
// local computer or Git repository. Persistent production copies live in
// the mounted /data volume.

const CAMPAIGNS = {
  elephant: {
    id: 'elephant',
    name: 'Elephant Clipping Campaign',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
    payoutThreshold: 17500,
    campaignBudget: 2400,
    startDate: '2026-08-03T07:00:00.000Z',
    endDate: '2026-08-31T07:00:00.000Z',
    cycleWeeks: "1",
    budgetCycle: "weekly",
    budgetCycleWeeks: 1,
    budgetResetDayUtc: 1,
    budgetResetHourUtc: 7,
    earningCycle: "monthly",
    separateEarningLifecycle: true,
    viewCap: 8000000,
    ratePerMillion: 300,
    panelChannelId:'1492239981308018698',
    panelMessageId:'1528713090651394209',
    roleId: process.env.ELEPHANT_ROLE_ID,
    entryChannelId: process.env.ELEPHANT_ENTRY_CHANNEL_ID,
    source: 'monsterlab',
    monsterCampaignId: "fbFMAJpxpQkZ0Honf7z4",
    status: 'active',
    
    panelText: `# <a:fire1:1504871649491554487> **Earn Money Posting Clips – Elephant Clipping Campaign**

Earn money by posting high-retention clips and edits from Elephant content across short-form platforms. Your goal is simple: create engaging clips, generate views, and grow your pages while earning from performance.

All you have to do is **register for the campaign below** and follow the guidelines to start earning.

## <a:chart1:1504773558415523931> Campaign Overview

• **Content:** You can only post content from the <#1521232893370826802>

• **Platforms:** <:tiktok1:1504871476485029979> TikTok, <:ig1:1504871708664922162> Instagram Reels & <:ytshort:1504774704123220099> YouTube Shorts

• **Requirement:** All uploaded videos must follow the campaign rules → <#1492248546156609778>

• **Editing Style:** Deliver value, maintain strong retention, and present SWA positively.

• **Campaign Goal:** Post informative clips from prominent conservative figures. Focus on politics, policy, and social issues.

• **Strict Rule:** Low-quality, spam, or misleading edits may result in removal from the campaign.

## <a:Cash1:1504871843419521115> Payment Details

> **Weekly Budget:** $2,400  
> **Rate:** $300 per 1M eligible views  
> **Eligible Views:** Tier 1 countries only  
> **Payout Schedule:** Monthly  
> **Payment Method:** Crypto
> **Minimum Payout:** $10

## <a:arrow1:1504776324051374130> Join the Campaign

Click the button below to start clipping and earning.`

  },

  crowder: {
    id: 'crowder',
    name: 'Steven Crowder Clipping Campaign',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
    payoutThreshold: 17500,
    campaignBudget: 2100,
    startDate: '2026-08-03T07:00:00.000Z',
    endDate: '2026-08-31T07:00:00.000Z',
    cycleWeeks: "1",
    budgetCycle: "weekly",
    budgetCycleWeeks: 1,
    budgetResetDayUtc: 1,
    budgetResetHourUtc: 7,
    earningCycle: "monthly",
    separateEarningLifecycle: true,
    ratePerMillion: 300,
    viewCap: 7000000,
    panelChannelId:'1521565850505838672',
    panelMessageId:'1523670266213957763',
    roleId: process.env.CROWDER_ROLE_ID,
    entryChannelId: process.env.CROWDER_ENTRY_CHANNEL_ID,
    source: 'monsterlab',
    monsterCampaignId: "Qgl6rzYPcDIVxqZ23kXI",
    status: 'active',

    panelText: `
# <a:fire1:1504871649491554487> Earn Money Posting Clips – Steven Crowder Clipping Campaign

Earn money by posting high-retention clips and edits from Steven Crowder content across short-form platforms. Your goal is simple: Create engaging content, generate views, grow your pages, and earn based on performance.

All you have to do is **register for the campaign below** and follow the guidelines to start earning.

## <a:chart1:1504773558415523931> Campaign Overview

• **Content:** Clips and edits from official Steven Crowder content focused primarily on Steven Crowder

• **Platforms:** <:tiktok1:1504871476485029979> TikTok, <:ig1:1504871708664922162> Instagram Reels & <:ytshort:1504774704123220099> YouTube Shorts

• **Requirement:** All uploads must follow the official campaign rules → <#1492184654864842963>

• **Editing Style:** Strong hooks, high retention, clear context, and clean presentation

• **Campaign Goal:** Create engaging clips around Crowder’s commentary, debates, reactions, and discussion moments

• **Content Standard:** Low-quality, spam, misleading, or heavily manipulated edits may result in removal from the campaign


## <a:Cash1:1504871843419521115> Payment Details

> **Campaign Budget:** $2,100
> **Rate:** $300 per 1M eligible views
> **Eligible Traffic:** Tier 1 countries only
> **Payout Schedule:** Monthly
> **Payment Method:** Crypto
> **Minimum Payout:** $10

## <a:arrow1:1504776324051374130> Join the Campaign

Click the button below to start clipping and earning.`
  }
};

function writeJsonAtomic(filePath, jsonText) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
  const tempPath = filePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(tempPath, jsonText, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readJsonFileSafely(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return null;
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error('Could not read ' + filePath + ':', error.message);
    return null;
  }
}

function loadData() {
  let raw = readJsonFileSafely(primaryDataFilePath);
  let recovered = false;
  if (!raw && process.env.RAILWAY_ENVIRONMENT) raw = readJsonFileSafely(railwayBackupFilePath), recovered = !!raw;
  if (!raw && mirrorDataFilePath !== primaryDataFilePath) raw = readJsonFileSafely(mirrorDataFilePath), recovered = !!raw;
  if (!raw) { raw = { users: {}, applications: {}, campaignAccountRequests: {}, clips: {}, campaignStatus: {}, payoutTrackers: {} }; recovered = true; }

  raw.users ||= {}; raw.applications ||= {}; raw.campaignAccountRequests ||= {}; raw.clips ||= {}; raw.clipReviews ||= {}; raw.campaignStatus ||= {}; raw.payoutTrackers ||= {}; raw.storageMigrations ||= {};
  for (const request of Object.values(raw.payoutRequests || {})) {
    if (!request?.campaignId || !request?.userId) continue;
    const id = request.id || request.campaignId + '_' + request.userId;
    raw.payoutTrackers[id] ||= { ...request, id };
  }
  delete raw.payoutRequests;
  for (const clip of Object.values(raw.clips || {})) {
    clip.payout ||= {};
    clip.payout.paidViews = Number(clip.payout.paidViews ?? clip.payout.totalPaidViews ?? 0) || 0;
    clip.payout.paidMoney = Number(clip.payout.paidMoney ?? clip.payout.totalPaidAmount ?? 0) || 0;
    if (!Array.isArray(clip.payout.history)) clip.payout.history = [];
    clip.payout.lastPaidAt ??= null;
    delete clip.payout.totalPaidViews; delete clip.payout.totalPaidAmount;
  }
  let migrationChanged = false;
  if (!raw.storageMigrations.clipReviewSplitV1) {
    let movedPending = 0;
    let keptApproved = 0;
    for (const [clipId, clip] of Object.entries(raw.clips || {})) {
      const paidViews = Number(clip.payout?.paidViews) || 0;
      const paidMoney = Number(clip.payout?.paidMoney) || 0;
      const hasHistory = Array.isArray(clip.payout?.history) && clip.payout.history.length > 0;
      const previouslyApproved = Boolean(clip.approvedAt || clip.wasEverApproved === true || paidViews > 0 || paidMoney > 0 || hasHistory);
      const moveToReviews = clip.status === 'pending' || (clip.status === 'rejected' && !previouslyApproved);
      initializeClipTrackingFields(clip);
      if (moveToReviews) {
        if (raw.clipReviews[clipId]) {
          console.warn(`⚠️ Migration skipped duplicate clip ID ${clipId}`);
          continue;
        }
        clip.payoutEligible = false;
        clip.wasEverApproved = false;
        if (clip.status === 'rejected') clip.rejectionStage ||= 'pre_approval';
        raw.clipReviews[clipId] = clip;
        delete raw.clips[clipId];
        movedPending++;
      } else {
        if (clip.status === 'approved') { clip.payoutEligible ??= true; clip.wasEverApproved ??= true; }
        if (clip.status === 'rejected' && previouslyApproved) { clip.payoutEligible = false; clip.wasEverApproved = true; clip.rejectionStage ||= 'post_approval'; }
        keptApproved++;
      }
    }
    raw.storageMigrations.clipReviewSplitV1 = true;
    migrationChanged = true;
    console.log(`✅ Clip review storage migration complete: ${movedPending} pending/rejected review clips moved, ${keptApproved} approved/history clips kept.`);
  }
  if (!raw.storageMigrations.clipTrackingScheduleV1) {
    for (const collection of [raw.clipReviews, raw.clips]) {
      for (const clip of Object.values(collection || {})) {
        initializeClipTrackingFields(clip);
        clip.trackingRetryAt ??= null;
        clip.lastTrackingError ??= null;
        clip.lastTrackingErrorAt ??= null;
        if (clip.status === 'approved') clip.payoutEligible ??= true;
      }
    }
    raw.storageMigrations.clipTrackingScheduleV1 = true;
    migrationChanged = true;
    console.log('✅ Clip tracking schedule migration complete.');
  }
  if (!raw.storageMigrations.rejectionLifecycleV1) {
    for (const [clipId, clip] of Object.entries(raw.clipReviews || {})) {
      if (clip.status !== 'rejected') continue;
      clip.payoutEligible = false;
      clip.wasEverApproved ??= false;
      clip.rejectionStage ??= 'pre_approval';
      clip.views = Math.max(Number(clip.views) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0, Number(clip.submissionViews) || 0);
    }
    for (const [clipId, clip] of Object.entries(raw.clips || {})) {
      if (clip.status !== 'rejected') continue;
      clip.views = Math.max(Number(clip.views) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0, Number(clip.submissionViews) || 0);
      if (wasClipPreviouslyApproved(clip)) {
        clip.payoutEligible = false;
        clip.wasEverApproved = true;
        clip.rejectionStage = 'post_approval';
      } else if (!raw.clipReviews[clipId]) {
        clip.payoutEligible = false;
        clip.wasEverApproved = false;
        clip.rejectionStage = 'pre_approval';
        raw.clipReviews[clipId] = clip;
        delete raw.clips[clipId];
      }
    }
    raw.storageMigrations.rejectionLifecycleV1 = true;
    migrationChanged = true;
    console.log('✅ Rejection lifecycle migration complete.');
  }
  if (!raw.storageMigrations.submissionBudgetCycleV1) {
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const [clipId, clip] of Object.entries(collection || {})) {
        const campaign = CAMPAIGNS[clip.campaignId];
        const submittedTimestamp = getClipSubmissionTimestamp(clip);
        if (campaign && submittedTimestamp) {
          clip.budgetCycleIndex = getCampaignBudgetCycleIndex(campaign, submittedTimestamp);
          clip.budgetCycleSubmittedAt = submittedTimestamp;
          delete clip.budgetCycleUnknown;
        } else {
          clip.budgetCycleIndex = null;
          clip.budgetCycleUnknown = true;
          console.warn(`Clip ${clipId} has no submission timestamp and was excluded from budget-cycle reporting.`);
        }
      }
    }
    raw.storageMigrations.submissionBudgetCycleV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.viewCapTrackingLifecycleV1) {
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        const legacyViews = Math.max(Number(clip.views) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0, Number(clip.submissionViews) || 0);
        clip.publicViews = Math.max(Number(clip.publicViews) || 0, legacyViews);
        if (clip.views === null || clip.views === undefined) clip.views = legacyViews;
      }
    }
    finalizeExpiredBudgetCycleClips(raw);
    for (const campaign of Object.values(CAMPAIGNS)) {
      const cap = getCampaignViewCap(campaign);
      const creditedViews = getCampaignCurrentCycleCreditedViews(campaign.id, { data: raw });
      if (cap !== null && creditedViews > cap) {
        console.warn('[Campaign View Cap] legacy current-cycle credited views exceed configured cap; history was preserved for manual review.', { campaignId: campaign.id, viewCap: cap, currentCreditedViews: creditedViews });
      }
    }
    raw.storageMigrations.viewCapTrackingLifecycleV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.elephantWeeklyBudgetMonthlyEarningsV1) {
    const elephant = CAMPAIGNS.elephant;
    const now = new Date();
    const cycleKey = getCampaignBudgetCycleKey(elephant, now);
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        if (clip.campaignId !== 'elephant') continue;
        const legacyCredited = Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0, Number(clip.approvalViews) || 0);
        clip.publicViews = Math.max(Number(clip.publicViews) || 0, Number(clip.currentViews) || 0, legacyCredited);
        clip.campaignCreditedViews = legacyCredited;
        if (isClipInCampaignEarningPeriod(clip, elephant, now)) {
          if (clip.completedReason === 'budget_cycle_ended') {
            delete clip.trackingStatus;
            delete clip.completedAt;
            delete clip.completedReason;
          }
          clip.budgetTracking ||= {
            budgetCycleKey: cycleKey,
            baselinePublicViews: clip.publicViews,
            lastPublicViews: clip.publicViews,
            creditedViewsThisCycle: 0,
            pausedBaselineViews: null
          };
        }
      }
    }
    raw.storageMigrations.elephantWeeklyBudgetMonthlyEarningsV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.crowderWeeklyBudgetMonthlyEarningsV1) {
    const crowder = CAMPAIGNS.crowder;
    const now = new Date();
    const cycleKey = getCampaignBudgetCycleKey(crowder, now);
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        if (clip.campaignId !== 'crowder') continue;
        const legacyCredited = Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0, Number(clip.approvalViews) || 0);
        clip.publicViews = Math.max(Number(clip.publicViews) || 0, Number(clip.currentViews) || 0, legacyCredited);
        clip.campaignCreditedViews = legacyCredited;
        if (isClipInCampaignEarningPeriod(clip, crowder, now)) {
          if (clip.completedReason === 'budget_cycle_ended') {
            delete clip.trackingStatus;
            delete clip.completedAt;
            delete clip.completedReason;
          }
          clip.budgetTracking ||= {
            budgetCycleKey: cycleKey,
            baselinePublicViews: clip.publicViews,
            lastPublicViews: clip.publicViews,
            creditedViewsThisCycle: 0,
            pausedBaselineViews: null
          };
        }
      }
    }
    raw.storageMigrations.crowderWeeklyBudgetMonthlyEarningsV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.monthlyEarningRunLifecycleV1) {
    const now = Date.now();
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        const campaign = CAMPAIGNS[clip.campaignId];
        if (!campaign?.separateEarningLifecycle) continue;
        if (isClipInCampaignEarningRun(clip, campaign)) {
          clip.earningRunKey ||= getCampaignEarningRunKey(campaign);
          clip.trackingStatus ||= 'active';
        } else {
          clip.trackingStatus = 'completed';
          clip.completedAt ||= now;
          clip.completedReason = 'campaign_earning_period_ended';
        }
      }
    }
    raw.storageMigrations.monthlyEarningRunLifecycleV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.monthlyEarningRunBackfillV2) {
    const now = Date.now();
    let backfilled = 0;
    let repaired = 0;
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        const campaign = CAMPAIGNS[clip?.campaignId];
        if (!campaign?.separateEarningLifecycle) continue;
        const belongsToCurrentRun = isClipInCampaignEarningRun(clip, campaign);
        const campaignEnd = getCampaignEarningEnd(campaign);
        if (belongsToCurrentRun && !clip.earningRunKey) {
          clip.earningRunKey = getCampaignEarningRunKey(campaign);
          backfilled++;
        }
        if (
          belongsToCurrentRun &&
          campaignEnd !== null && now < campaignEnd &&
          clip.trackingStatus === 'completed' &&
          clip.completedReason === 'campaign_earning_period_ended' &&
          (clip.status === 'pending' || clip.status === 'approved')
        ) {
          clip.trackingStatus = 'active';
          delete clip.completedAt;
          delete clip.completedReason;
          repaired++;
        }
      }
    }
    raw.storageMigrations.monthlyEarningRunBackfillV2 = true;
    migrationChanged = true;
    if (process.env.DEBUG_MY_STATS === 'true') {
      console.log('[My Stats Backfill]', { backfilled, repaired });
    }
  }
  if (migrationChanged) recovered = true;
  if (recovered) saveData(raw);
  return raw;
}

function saveData(data) {
  const jsonText = JSON.stringify(data, null, 2);
  writeJsonAtomic(primaryDataFilePath, jsonText);
  if (process.env.RAILWAY_ENVIRONMENT && railwayBackupFilePath !== primaryDataFilePath) {
    try { writeJsonAtomic(railwayBackupFilePath, jsonText); } catch (error) { console.error('Could not update persistent data backup:', error.message); }
  }
  if (mirrorDataFilePath !== primaryDataFilePath) {
    try { writeJsonAtomic(mirrorDataFilePath, jsonText); } catch (error) { console.error('Could not update project data.json mirror:', error.message); }
  }
}

function getPayoutTracker(campaignId, userId) {
  const data = loadData();
  const id = `${campaignId}_${userId}`;
  return data.payoutTrackers?.[id] || null;
}

function ensurePayoutTracker(campaignId, userId) {
  const data = loadData();
  if (!data.payoutTrackers) data.payoutTrackers = {};

  const id = `${campaignId}_${userId}`;
  if (!data.payoutTrackers[id]) {
    data.payoutTrackers[id] = {
      id,
      campaignId,
      userId,
      channelId: null,
      messageId: null,
      lifetimeViews: 0,
      lifetimeEarned: 0,
      lifetimePaid: 0,
      currentUnpaidViews: 0,
      currentUnpaidMoney: 0,
      status: 'waiting',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    saveData(data);
  }

  return data.payoutTrackers[id];
}

function savePayoutTracker(tracker) {
  if (!tracker?.campaignId || !tracker?.userId) {
    throw new Error('Payout tracker requires campaignId and userId.');
  }

  const data = loadData();
  if (!data.payoutTrackers) data.payoutTrackers = {};

  tracker.id ||= `${tracker.campaignId}_${tracker.userId}`;
  tracker.updatedAt = Date.now();
  data.payoutTrackers[tracker.id] = tracker;
  saveData(data);
  return tracker;
}

function ensureUser(data, member) {

    if (!data.users) data.users = {};

    const id = member.id;

    if (!data.users[id]) {

        data.users[id] = {

            discordId: id,
            username: member.user.username,
            discordUsername: member.user.username,
            displayName: member.displayName,
            tag: member.user.tag,
            avatar: member.user.displayAvatarURL(),

            stats: {},
            campaigns: [],
            campaignAccounts: {}

        };

    }

    const user = data.users[id];

    // Always refresh these
    user.username = member.user.username;
    user.discordUsername = member.user.username;
    user.displayName = member.displayName;
    user.tag = member.user.tag;
    user.avatar = member.user.displayAvatarURL();

    return user;

}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function formatPlatform(p) {
  return {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
    facebook: 'Facebook'
  }[p] || p;
}

function normalizeUsername(u) {
  return String(u).trim().replace(/^@+/, '');
}

function isPayoutEligibleClip(clip) {
  return Boolean(clip && clip.status === 'approved' && clip.payoutEligible !== false);
}

function findClipRecord(data, clipId) {
  if (data.clipReviews?.[clipId]) return { clip: data.clipReviews[clipId], collection: 'clipReviews' };
  if (data.clips?.[clipId]) return { clip: data.clips[clipId], collection: 'clips' };
  return null;
}

function wasClipPreviouslyApproved(clip) {
  return Boolean(
    clip?.wasEverApproved === true ||
    clip?.approvedAt ||
    Number(clip?.payout?.paidViews) > 0 ||
    Number(clip?.payout?.paidMoney) > 0 ||
    (Array.isArray(clip?.payout?.history) && clip.payout.history.length > 0)
  );
}

function getClipRejectionStage(clip, collection) {
  if (clip?.rejectionStage === 'post_approval') return 'post_approval';
  return collection === 'clips' || wasClipPreviouslyApproved(clip)
    ? 'post_approval'
    : 'pre_approval';
}

function getClipSubmittedTimestamp(clip) {
  const directTimestamp = Number(clip?.submittedTimestamp);
  if (Number.isFinite(directTimestamp) && directTimestamp > 0) return directTimestamp;
  const parsed = Date.parse(clip?.submittedAt || clip?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function initializeClipTrackingFields(clip) {
  const submittedTimestamp = getClipSubmittedTimestamp(clip);
  clip.submittedTimestamp = submittedTimestamp;
  clip.submittedAt ||= new Date(submittedTimestamp).toISOString();
  clip.lastChecked = Number(clip.lastChecked) || submittedTimestamp;
  clip.nextCheckAt = Number(clip.nextCheckAt) || submittedTimestamp + CLIP_TRACK_INTERVAL_MS;
  return clip;
}

function isTrackableReviewClip(clip) {
  const campaign = CAMPAIGNS[clip?.campaignId];
  return Boolean(
    clip &&
    clip.status === 'pending' &&
    clip.trackingStatus !== 'completed' &&
    (!campaign?.separateEarningLifecycle || isClipInCampaignEarningPeriod(clip, campaign)) &&
    (clip.platform === 'tiktok' || clip.platform === 'youtube' || clip.platform === 'instagram') &&
    (clip.videoUrl || clip.url)
  );
}

function isTrackableApprovedClip(clip) {
  const campaign = CAMPAIGNS[clip?.campaignId];
  return Boolean(
    clip &&
    isPayoutEligibleClip(clip) &&
    clip.trackingStatus !== 'completed' &&
    (!campaign?.separateEarningLifecycle || isClipInCampaignEarningPeriod(clip, campaign)) &&
    (clip.platform === 'tiktok' || clip.platform === 'youtube' || clip.platform === 'instagram') &&
    (clip.videoUrl || clip.url)
  );
}

function isClipTrackingDue(clip, now = Date.now()) {
  initializeClipTrackingFields(clip);
  const retryAt = Number(clip.trackingRetryAt) || 0;
  if (retryAt > 0 && now < retryAt) return false;
  const nextCheckAt = Number(clip.nextCheckAt) || 0;
  return nextCheckAt > 0 && now >= nextCheckAt;
}

function advanceClipNextCheckAt(clip, now = Date.now()) {
  initializeClipTrackingFields(clip);
  const submittedTimestamp = getClipSubmittedTimestamp(clip);
  let nextCheckAt = Number(clip.nextCheckAt);
  if (!Number.isFinite(nextCheckAt) || nextCheckAt <= 0) {
    nextCheckAt = submittedTimestamp + CLIP_TRACK_INTERVAL_MS;
  }
  while (nextCheckAt <= now) nextCheckAt += CLIP_TRACK_INTERVAL_MS;
  clip.nextCheckAt = nextCheckAt;
  return nextCheckAt;
}

function getSafeTrackedViews(clip, metadata) {
  const fetchedViews = Number(metadata?.views);
  const existingViews = Math.max(
    Number(clip.publicViews) || 0,
    Number(clip.currentViews) || 0,
    Number(clip.views) || 0,
    Number(clip.submissionViews) || 0,
    Number(clip.approvalViews) || 0
  );
  if (!Number.isFinite(fetchedViews) || fetchedViews < 0) return existingViews;
  return Math.max(existingViews, fetchedViews);
}

function getClipLikes(clip) {
  const candidates = [
    clip?.likes,
    clip?.likeCount,
    clip?.likesCount,
    clip?.currentLikes,
    clip?.metadata?.likes,
    clip?.metadata?.likeCount,
    clip?.metadata?.likesCount
  ];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

function applyTrackedMetadata(clip, metadata, data) {
  const fetchedLikes = Number(metadata?.likes);
  if (Number.isFinite(fetchedLikes) && fetchedLikes >= 0) {
    clip.likes = fetchedLikes;
  }
  const publicViews = getSafeTrackedViews(clip, metadata);
  const campaign = CAMPAIGNS[clip.campaignId];
  if (campaign?.separateEarningLifecycle) {
    return applySeparateEarningCycleTracking(clip, metadata, data, publicViews, campaign);
  }
  const previousCreditedViews = getClipCreditedViews(clip);
  const cap = getCampaignViewCap(campaign);
  const otherCreditedViews = cap === null ? 0 : getCampaignCurrentCycleCreditedViews(clip.campaignId, { data, excludeClipId: clip.id });
  const remainingForThisClip = cap === null ? Infinity : Math.max(cap - otherCreditedViews, 0);
  const desiredCreditedViews = Math.max(previousCreditedViews, publicViews);
  const creditedViews = cap === null
    ? desiredCreditedViews
    : Math.max(previousCreditedViews, Math.min(desiredCreditedViews, remainingForThisClip));

  clip.publicViews = publicViews;
  clip.currentViews = creditedViews;
  clip.views = creditedViews;
  if (cap !== null && process.env.DEBUG_VIEW_CAP_TRACKING === 'true') {
    console.log('[Campaign View Cap]', { campaignId: clip.campaignId, budgetCycleIndex: getCampaignBudgetCycleIndex(campaign), viewCap: cap, currentCreditedViews: otherCreditedViews, remainingViews: remainingForThisClip, fulfilled: otherCreditedViews >= cap });
  }
  if (cap !== null && previousCreditedViews > remainingForThisClip && process.env.DEBUG_VIEW_CAP_TRACKING === 'true') {
    console.warn('[Campaign View Cap] legacy credited views exceed remaining capacity', { clipId: clip.id, campaignId: clip.campaignId, previousCreditedViews, remainingForThisClip });
  }
  if (cap !== null && process.env.DEBUG_VIEW_CAP_TRACKING === 'true') {
    const campaignTotalAfter = otherCreditedViews + creditedViews;
    console.log('[Clip View Cap Update]', { clipId: clip.id, campaignId: clip.campaignId, previousCreditedViews, fetchedPublicViews: Number(metadata?.views) || null, creditedViewsAfter: creditedViews, creditedIncrease: creditedViews - previousCreditedViews, campaignTotalAfter, remainingAfter: Math.max(cap - campaignTotalAfter, 0) });
  }
  if (metadata?.title) clip.title = metadata.title;
  if (metadata?.thumbnailUrl) clip.thumbnailUrl = metadata.thumbnailUrl;
  if (metadata?.authorName || metadata?.authorDisplayName || metadata?.authorUsername) {
    clip.platformAuthorName = metadata.authorName || metadata.authorUsername || metadata.authorDisplayName;
  }
  if (metadata?.authorId) clip.platformAuthorId = metadata.authorId;
  clip.lastChecked = Date.now();
  clip.lastTrackingError = null;
  clip.lastTrackingErrorAt = null;
  clip.trackingRetryAt = null;
  return creditedViews;
}

function applySeparateEarningCycleTracking(clip, metadata, data, publicViews, campaign) {
  const cycleKey = getCampaignBudgetCycleKey(campaign);
  const previousMonthlyViews = Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0, Number(clip.approvalViews) || 0);
  clip.budgetTracking ||= {};
  const tracking = clip.budgetTracking;

  if (tracking.budgetCycleKey !== cycleKey) {
    tracking.budgetCycleKey = cycleKey;
    tracking.baselinePublicViews = publicViews;
    tracking.lastPublicViews = publicViews;
    tracking.creditedViewsThisCycle = 0;
    tracking.pausedBaselineViews = null;
  } else {
    const lastPublicViews = Math.max(Number(tracking.lastPublicViews) || 0, Number(tracking.baselinePublicViews) || 0);
    const publicGrowth = Math.max(publicViews - lastPublicViews, 0);
    const cap = getCampaignViewCap(campaign);
    const otherWeeklyCredits = cap === null ? 0 : getCampaignCurrentWeeklyCreditedViews(campaign.id, { data, excludeClipId: clip.id });
    const remainingViews = cap === null ? Infinity : Math.max(cap - otherWeeklyCredits, 0);
    const creditedIncrease = Math.min(publicGrowth, remainingViews);
    tracking.creditedViewsThisCycle = Math.max(Number(tracking.creditedViewsThisCycle) || 0, 0) + creditedIncrease;
    tracking.lastPublicViews = publicViews;
    if (cap !== null && process.env.DEBUG_VIEW_CAP_TRACKING === 'true') {
      const weeklyTotalAfter = otherWeeklyCredits + tracking.creditedViewsThisCycle;
      console.log('[Clip View Cap Update]', { clipId: clip.id, campaignId: clip.campaignId, previousCreditedViews: previousMonthlyViews, fetchedPublicViews: Number(metadata?.views) || null, creditedViewsAfter: previousMonthlyViews + creditedIncrease, creditedIncrease, campaignTotalAfter: weeklyTotalAfter, remainingAfter: Math.max(cap - weeklyTotalAfter, 0) });
    }
    clip.campaignCreditedViews = previousMonthlyViews + creditedIncrease;
  }

  clip.campaignCreditedViews ??= previousMonthlyViews;
  clip.publicViews = publicViews;
  clip.currentViews = clip.campaignCreditedViews;
  clip.views = clip.campaignCreditedViews;
  if (metadata?.title) clip.title = metadata.title;
  if (metadata?.thumbnailUrl) clip.thumbnailUrl = metadata.thumbnailUrl;
  if (metadata?.authorName || metadata?.authorDisplayName || metadata?.authorUsername) {
    clip.platformAuthorName = metadata.authorName || metadata.authorUsername || metadata.authorDisplayName;
  }
  if (metadata?.authorId) clip.platformAuthorId = metadata.authorId;
  clip.lastChecked = Date.now();
  clip.lastTrackingError = null;
  clip.lastTrackingErrorAt = null;
  clip.trackingRetryAt = null;
  return clip.campaignCreditedViews;
}

function updatePendingReviewTracking(clip, metadata, data) {
  const views = applyTrackedMetadata(clip, metadata, data);
  const rate = Number(CAMPAIGNS[clip.campaignId]?.ratePerMillion) || 0;
  clip.estimatedEarnings = views / 1_000_000 * rate;
  clip.payoutEligible = false;
  delete clip.totalMoneyMade;
  delete clip.moneyMade;
  delete clip.weeklyMoneyMade;
  delete clip.unpaidViews;
  delete clip.unpaidMoney;
  advanceClipNextCheckAt(clip);
  return clip;
}

function updateApprovedClipTracking(clip, metadata, data) {
  const views = applyTrackedMetadata(clip, metadata, data);
  const rate = Number(CAMPAIGNS[clip.campaignId]?.ratePerMillion) || 0;
  clip.totalMoneyMade = views / 1_000_000 * rate;
  clip.moneyMade = clip.totalMoneyMade;
  clip.weeklyViews = views;
  clip.weeklyMoneyMade = clip.totalMoneyMade;
  clip.payoutEligible = true;
  clip.payout ||= { paidViews: 0, paidMoney: 0, lastPaidAt: null, history: [] };
  const paidViews = Number(clip.payout.paidViews) || 0;
  clip.unpaidViews = Math.max(views - paidViews, 0);
  clip.unpaidMoney = clip.unpaidViews / 1_000_000 * rate;
  advanceClipNextCheckAt(clip);
  return clip;
}

function recordClipTrackingFailure(clip, error) {
  clip.lastTrackingError = error?.message || 'Unknown tracking error';
  clip.lastTrackingErrorAt = Date.now();
  clip.trackingRetryAt = Date.now() + CLIP_TRACK_RETRY_MS;
  return clip;
}

function delayBetweenPlatformRequests() {
  return new Promise(resolve => setTimeout(resolve, 2000));
}
function normalizeSocialUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}
function normalizeExternalId(value) {
  return String(value || '').trim();
}

async function resolveYouTubeChannelIdentity(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let channelId = null;
  let handle = null;
  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : null;
    const path = url?.pathname || raw;
    const channelMatch = path.match(/\/channel\/(UC[\w-]{20,})/i);
    const handleMatch = path.match(/@([^/?#]+)/);
    if (/^UC[\w-]{20,}$/i.test(raw)) channelId = raw;
    else if (channelMatch) channelId = channelMatch[1];
    else handle = (handleMatch?.[1] || raw.replace(/^@/, '')).trim();

    const params = { part: 'snippet', key: process.env.YOUTUBE_API_KEY };
    if (channelId) params.id = channelId;
    else params.forHandle = handle;
    let response = await axios.get('https://www.googleapis.com/youtube/v3/channels', { timeout: 15000, params });
    let item = response.data?.items?.[0];
    if (!item && !channelId && handle) {
      response = await axios.get('https://www.googleapis.com/youtube/v3/channels', { timeout: 15000, params: { part: 'snippet', forUsername: handle, key: process.env.YOUTUBE_API_KEY } });
      item = response.data?.items?.[0];
    }
    return item ? { channelId: item.id, handle: handle || null, title: item.snippet?.title || null } : null;
  } catch {
    return null;
  }
}
function normalizeSocialKey(platform, username) {
  return `${platform}:${normalizeUsername(username).toLowerCase()}`;
}

function isUnsafeSocialHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^0\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function getSupportedSocialPlatform(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  return null;
}

async function expandSocialUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(String(inputUrl).trim());
  } catch {
    throw new Error('Invalid social video URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || isUnsafeSocialHost(parsed.hostname)) {
    throw new Error('Unsafe social video URL.');
  }

  const originalUrl = parsed.toString();
  const isShortHost = ['vm.tiktok.com', 'vt.tiktok.com', 'youtu.be'].includes(parsed.hostname.toLowerCase());
  let response;

  try {
    response = await axios.head(originalUrl, {
      maxRedirects: 5,
      timeout: 10000,
      beforeRedirect: options => {
        if (isUnsafeSocialHost(options.hostname)) throw new Error('Unsafe redirect target.');
      },
      validateStatus: status => status >= 200 && status < 400
    });
  } catch {
    try {
      response = await axios.get(originalUrl, {
        maxRedirects: 5,
        timeout: 10000,
        beforeRedirect: options => {
          if (isUnsafeSocialHost(options.hostname)) throw new Error('Unsafe redirect target.');
        },
        responseType: 'stream',
        validateStatus: status => status >= 200 && status < 400
      });
    } catch {
      throw new Error('Could not resolve this social video URL.');
    }
  }

  try {
    const resolvedUrl = response.request?.res?.responseUrl || response.request?.responseURL || originalUrl;
    const finalUrl = new URL(resolvedUrl);
    if (!['http:', 'https:'].includes(finalUrl.protocol) || isUnsafeSocialHost(finalUrl.hostname)) {
      throw new Error('Unsafe redirect target.');
    }
    const platform = getSupportedSocialPlatform(finalUrl.hostname);
    if (!platform || (isShortHost && finalUrl.hostname.toLowerCase() === parsed.hostname.toLowerCase())) {
      throw new Error('Unsupported or unresolved social video URL.');
    }
    finalUrl.hash = '';
    return { originalUrl, resolvedUrl: finalUrl.toString(), platform };
  } finally {
    response?.data?.destroy?.();
  }
}

function ensureUserSocials(data, userId) {
  if (!data.users[userId]) return;
  if (!data.users[userId].socials) {
    data.users[userId].socials = [];
  }
}

function getApprovedCampaignAccounts(data, userId, campaignId, platform) {
  const userRecord = data.users?.[String(userId)];
  const platformAccounts = userRecord?.campaignAccounts?.[campaignId]?.[platform];
  if (!platformAccounts) return [];

  const candidates = Array.isArray(platformAccounts)
    ? platformAccounts
    : typeof platformAccounts === 'object' && ('username' in platformAccounts || 'verified' in platformAccounts || 'status' in platformAccounts)
      ? [platformAccounts]
      : Object.values(platformAccounts || {});

  return candidates
    .filter(account => account && (account.verified === true || account.status === 'approved'))
    .map(account => ({
      platform: account.platform || platform,
      username: account.username || '',
      externalAccountId: account.externalAccountId || null,
      verified: true,
      source: account
    }));
}

async function validateVideoOwnership(approvedAccounts, metadata) {
  const accounts = approvedAccounts || [];
  const platform = metadata?.platform || (metadata?.authorUsername ? 'tiktok' : 'youtube');
  const authorUsername = normalizeUsername(metadata?.authorUsername || '').toLowerCase();
  const authorDisplayName = normalizeUsername(metadata?.authorDisplayName || '').toLowerCase();

  for (const account of accounts) {
    let storedId = normalizeExternalId(account.externalAccountId || account.source?.channelId);
    const authorId = normalizeExternalId(metadata?.authorId);

    if (storedId && authorId) {
      if (storedId === authorId) return { valid: true, matchedAccount: account, reason: null };
      continue;
    }

    const storedUsername = normalizeSocialUsername(account.username);
    if (!storedUsername) continue;

    if (platform === 'youtube') {
      const identity = await resolveYouTubeChannelIdentity(account.username);
      if (identity?.channelId && identity.channelId === authorId) {
        account.source.externalAccountId ||= identity.channelId;
        account.source.channelId ||= identity.channelId;
        return { valid: true, matchedAccount: account, reason: null };
      }
    } else if (storedUsername && storedUsername === normalizeSocialUsername(metadata?.authorUsername)) {
      return { valid: true, matchedAccount: account, reason: null };
    }
  }

  return {
    valid: false,
    matchedAccount: null,
    reason: 'The video author is not one of the approved campaign accounts.'
  };
}

function parseCanonicalVideoUrl(resolvedUrl) {
  const url = new URL(resolvedUrl);
  const host = url.hostname.toLowerCase();

  const instagramReel = parsePublicInstagramReelUrl(resolvedUrl);
  if (instagramReel) {
    return { platform: 'instagram', videoId: instagramReel.shortcode, canonicalUrl: instagramReel.canonicalUrl };
  }

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const match = url.pathname.match(/\/video\/(\d+)/);
    if (!match) return null;
    return { platform: 'tiktok', videoId: match[1], canonicalUrl: url.toString() };
  }

  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
    const videoId = getYouTubeVideoId(url.toString());
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return { platform: 'youtube', videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` };
  }

  return null;
}

function getClipVideoKey(platform, videoId) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const normalizedVideoId = String(videoId || '').trim();
  return normalizedPlatform && normalizedVideoId ? `${normalizedPlatform}:${normalizedVideoId}` : null;
}

function normalizeClipVideoUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    const host = url.hostname.toLowerCase();
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
      const videoId = getYouTubeVideoId(url.toString());
      return videoId ? `youtube:${videoId}` : null;
    }
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      const match = url.pathname.match(/\/video\/(\d+)/);
      return match ? `tiktok:${match[1]}` : null;
    }
    const instagramReel = parsePublicInstagramReelUrl(value);
    if (instagramReel) return `instagram:${instagramReel.shortcode}`;
  } catch {}
  return null;
}

async function validateClipBeforeSubmission({ data, userId, campaignId, submittedUrl }) {
  const campaign = CAMPAIGNS[campaignId];
  if (campaign?.separateEarningLifecycle && !isCampaignEarningActive(campaign)) {
    return { valid: false, message: 'Campaign earning period has ended.', metadata: null };
  }
  if (campaign?.separateEarningLifecycle && isCampaignCurrentBudgetCycleFulfilled(campaignId, { data })) {
    return { valid: false, message: 'Campaign is paused until the next weekly view-cap reset.', metadata: null };
  }
  if (!campaign) return { valid: false, message: '❌ Campaign not found.', metadata: null };

  try {
    const instagramReel = parsePublicInstagramReelUrl(submittedUrl);
    const expanded = instagramReel
      ? { resolvedUrl: instagramReel.canonicalUrl, platform: 'instagram' }
      : await expandSocialUrl(submittedUrl);
    const parsed = parseCanonicalVideoUrl(expanded.resolvedUrl);
    if (!parsed) return { valid: false, message: '❌ This link is not a supported public TikTok or YouTube video.', metadata: null };
    if (!campaign.allowedPlatforms?.includes(parsed.platform)) {
      return { valid: false, message: `❌ ${formatPlatform(parsed.platform)} is not enabled for this campaign.`, metadata: null };
    }

    const incomingVideoKey = getClipVideoKey(parsed.platform, parsed.videoId);
    const incomingUrlKey = normalizeClipVideoUrl(parsed.canonicalUrl);
    const allStoredClips = [
      ...Object.values(data.clipReviews || {}),
      ...Object.values(data.clips || {})
    ].filter(clip => String(clip.campaignId) === String(campaignId));
    const duplicate = allStoredClips.some(clip =>
      (getClipVideoKey(clip.platform, clip.videoId) && getClipVideoKey(parsed.platform, parsed.videoId) && getClipVideoKey(clip.platform, clip.videoId) === getClipVideoKey(parsed.platform, parsed.videoId)) ||
      (normalizeClipVideoUrl(clip.videoUrl || clip.url) && normalizeClipVideoUrl(parsed.canonicalUrl) && normalizeClipVideoUrl(clip.videoUrl || clip.url) === normalizeClipVideoUrl(parsed.canonicalUrl))
    );
    const matchedDuplicate = duplicate ? allStoredClips.find(clip =>
      (getClipVideoKey(clip.platform, clip.videoId) && incomingVideoKey && getClipVideoKey(clip.platform, clip.videoId) === incomingVideoKey) ||
      (normalizeClipVideoUrl(clip.videoUrl || clip.url) && incomingUrlKey && normalizeClipVideoUrl(clip.videoUrl || clip.url) === incomingUrlKey)
    ) : null;
    if (duplicate) {
      if (process.env.DEBUG_CLIP_DUPLICATES === 'true') console.log('[Clip Duplicate Check]', { campaignId, incomingPlatform: parsed.platform, incomingVideoId: parsed.videoId, incomingVideoKey, matchedClipId: matchedDuplicate?.id || null, matchedCampaignId: matchedDuplicate?.campaignId || null, matchedStatus: matchedDuplicate?.status || null });
      return { valid: false, code: 'DUPLICATE_CLIP', message: 'Duplicate clip in this campaign.', metadata: null };
    }
    if (duplicate) return { valid: false, message: '❌ This video has already been submitted.', metadata: null };

    const metadata = await fetchSubmissionMetadata(parsed.platform, parsed.canonicalUrl, parsed.videoId);
    metadata.platform = parsed.platform;
    if (parsed.platform === 'tiktok' && !normalizeUsername(metadata.authorUsername || '')) {
      return { valid: false, message: '❌ We could not verify the TikTok username for this video. Please submit the full public TikTok video link or try again shortly.', metadata };
    }
    const accounts = getApprovedCampaignAccounts(data, userId, campaignId, parsed.platform);
    if (!accounts.length) {
      return { valid: false, message: `❌ You do not have a verified ${formatPlatform(parsed.platform)} account for this campaign.`, metadata };
    }

    const ownership = await validateVideoOwnership(accounts, metadata);
    if (!ownership.valid) {
      const author = metadata.authorUsername || metadata.authorDisplayName || 'an unlinked account';
      return { valid: false, message: `❌ This video was posted by **@${author}**, but that account is not linked and approved for this campaign.`, metadata };
    }

    if (parsed.platform === 'tiktok' && metadata.authorId && !ownership.matchedAccount.externalAccountId) {
      ownership.matchedAccount.source.externalAccountId = String(metadata.authorId);
      saveData(data);
    }
    if (parsed.platform === 'youtube' && ownership.matchedAccount.source?.externalAccountId) {
      saveData(data);
    }

    return { valid: true, message: null, metadata, platform: parsed.platform, videoId: parsed.videoId, canonicalUrl: parsed.canonicalUrl, matchedAccount: ownership.matchedAccount };
  } catch (err) {
    return { valid: false, message: '❌ We could not validate this public video link. Please try the full public URL.', metadata: null };
  }
}

function makeApplicationId() {
  return `app_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function getUserPayoutSummary(data, userId, campaignId) {

    const clips = Object.values(data.clips || {})
        .filter(c =>
            String(c.userId) === String(userId) &&
            String(c.campaignId) === String(campaignId) &&
            isPayoutEligibleClip(c)
        );

    const totalViews =
        clips.reduce(
            (s,c)=>s + getApprovedClipViews(c),
            0
        );

    const unpaidViews =
        clips.reduce(
            (s,c)=>s + Math.max(getApprovedClipViews(c) - (Number(c.payout?.paidViews) || 0), 0),
            0
        );

    const totalMoney =
        clips.reduce(
            (s,c)=>s + getApprovedClipEarnings(c, CAMPAIGNS[campaignId]),
            0
        );

    const unpaidMoney =
        clips.reduce(
            (s,c)=>s + Math.max(getApprovedClipViews(c) - (Number(c.payout?.paidViews) || 0), 0) / 1_000_000 * (Number(CAMPAIGNS[campaignId]?.ratePerMillion) || 0),
            0
        );

    return {

        totalViews,

        unpaidViews,

        totalMoney,

        unpaidMoney,

        clips

    };

}

function calculateTrackerStats(tracker) {
    const data = loadData();
    const campaign = CAMPAIGNS[tracker.campaignId];
    if (!campaign) return tracker;

    const allCampaignClips = Object.values(data.clips || {}).filter(clip =>
        String(clip.userId) === String(tracker.userId) &&
        String(clip.campaignId) === String(tracker.campaignId)
    );
    const eligibleClips = allCampaignClips.filter(isPayoutEligibleClip);
    const lifetimeViews = eligibleClips.reduce((sum, clip) => sum + getApprovedClipViews(clip), 0);
    const lifetimePaid = allCampaignClips.reduce((sum, clip) => sum + (Number(clip.payout?.paidMoney) || 0), 0);
    const lifetimeEarned = lifetimeViews / 1000000 * (Number(campaign.ratePerMillion) || 0);

    tracker.lifetimeViews = lifetimeViews;
    tracker.lifetimeEarned = lifetimeEarned;
    tracker.lifetimePaid = lifetimePaid;
    tracker.currentUnpaidViews = eligibleClips.reduce((sum, clip) =>
        sum + Math.max(getApprovedClipViews(clip) - (Number(clip.payout?.paidViews) || 0), 0), 0);
    tracker.currentUnpaidMoney = eligibleClips.reduce((sum, clip) => {
        const unpaidViews = Math.max(getApprovedClipViews(clip) - (Number(clip.payout?.paidViews) || 0), 0);
        return sum + unpaidViews / 1_000_000 * (Number(campaign.ratePerMillion) || 0);
    }, 0);
    if (tracker.status !== 'issue') {
        tracker.status = tracker.currentUnpaidViews === 0 ? 'paid' :
            tracker.currentUnpaidViews >= (Number(campaign.payoutThreshold) || 0) ? 'ready' : 'waiting';
    }
    tracker.updatedAt = Date.now();
    return tracker;
}

async function syncPayoutCard(guild, campaignId, userId) {

    const data = loadData();

    const campaign = CAMPAIGNS[campaignId];
    if (!campaign) return;
    
    const user = data.users?.[userId];

    let paymentLabel = "Payment ID";
    let paymentValue = "Not Set";

    if (user?.paymentDetails?.exchange) {

        const exchange =
            user.paymentDetails.exchange;

        paymentLabel =
            `${exchange.charAt(0).toUpperCase()}${exchange.slice(1)} ID`;

        paymentValue =
            user.paymentDetails.paymentId;

    }

    const payoutChannelId =
        data.campaignStaffChannels?.[campaignId]?.payouts;

    if (!payoutChannelId) return;

    const currentChannel = guild.channels.cache.get(payoutChannelId);

    if (!currentChannel) return;

    const payoutId = `${campaignId}_${userId}`;

    if (!data.payoutTrackers) data.payoutTrackers = {};

    const tracker = data.payoutTrackers[payoutId] || {
        id: payoutId,
        campaignId,
        userId,
        status: "waiting",
        createdAt: Date.now(),
        messageId: null,
        channelId: null,
        lifetimeViews: 0,
        lifetimeEarned: 0,
        lifetimePaid: 0,
        currentUnpaidViews: 0,
        currentUnpaidMoney: 0,
        lastPaidAt: null,
        lastIssueAt: null
    };
    const messageChannel = tracker.channelId
        ? await guild.channels.fetch(tracker.channelId).catch(() => null)
        : null;
    calculateTrackerStats(tracker);
    const statusLabels = {
        waiting: '🟡 Waiting for threshold',
        ready: '🟢 Ready for payment',
        paid: '✅ Paid — waiting for new views',
        issue: '🔴 Payment issue'
    };
    const statusText = statusLabels[tracker.status] || statusLabels.waiting;
    tracker.updatedAt = Date.now();
    data.payoutTrackers[payoutId] = tracker;

    saveData(data);

    const embed = new EmbedBuilder()

        .setColor(0x00AE86)

        .setTitle("💰 Creator Ready For Payment")

        .setDescription(

`👤 <@${userId}>

**Campaign**
${campaign.name}

**Unpaid Views**
${formatNumber(tracker.currentUnpaidViews)}

**Amount**
$${tracker.currentUnpaidMoney.toFixed(2)}

**${paymentLabel}**
\`${paymentValue}\``

);

    embed.addFields(
        { name: 'Lifetime Views', value: formatNumber(tracker.lifetimeViews), inline: true },
        { name: 'Lifetime Earned', value: '$' + tracker.lifetimeEarned.toFixed(2), inline: true },
        { name: 'Lifetime Paid', value: '$' + tracker.lifetimePaid.toFixed(2), inline: true },
        { name: 'Current Unpaid Views', value: formatNumber(tracker.currentUnpaidViews), inline: true },
        { name: 'Current Unpaid Amount', value: '$' + tracker.currentUnpaidMoney.toFixed(2), inline: true },
        { name: 'Status', value: statusText, inline: true }
    );

    const row = new ActionRowBuilder()

        .addComponents(

            new ButtonBuilder()

                .setCustomId(`pay:${payoutId}`)

                .setLabel("Mark Paid")

                .setStyle(ButtonStyle.Success)

                .setDisabled(tracker.status !== "ready"),

            new ButtonBuilder()

                .setCustomId(`issue:${payoutId}`)

                .setLabel("Issue")

                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()

                .setCustomId(`payout_refresh:${payoutId}`)

                .setLabel("Refresh")

                .setStyle(ButtonStyle.Secondary)

        );

    const payload = {
        embeds: [embed],
        components: [row]
    };

    if (tracker.status === 'issue') {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`payout_resolve_issue:${payoutId}`)
                .setLabel('Resolve Issue')
                .setStyle(ButtonStyle.Success)
        );
    }

    let msg = null;
    if (tracker.messageId) {
        msg = await messageChannel?.messages.fetch(tracker.messageId).catch(() => null);
    }

    if (msg) {
        await msg.edit(payload);
    } else {
        msg = await currentChannel.send(payload);
    }

    console.log("✅ Payout card sent");

    data.payoutTrackers[payoutId].messageId = msg.id;
    data.payoutTrackers[payoutId].channelId = msg.channel.id;

    saveData(data);

}

function getCampaignCycle(campaign, date = new Date()) {

    date = new Date(date);

    if (isNaN(date.getTime())) {
        date = new Date();
    }

    if (campaign.campaignMode === "monthly") {

        const start = new Date(campaign.startDate);

        const diffMonths =
            (date.getUTCFullYear() - start.getUTCFullYear()) * 12 +
            (date.getUTCMonth() - start.getUTCMonth());

        return Math.max(0, diffMonths);

    }

    const start = new Date(campaign.startDate);

    const diffWeeks = Math.floor(
        (date.getTime() - start.getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    );

    return Math.max(
        0,
        Math.floor(
            diffWeeks / (campaign.cycleWeeks || 1)
        )
    );

}

function getStatusLabel(status) {
  return {
    pending: 'Pending',
    waiting_confirm: 'Waiting for user confirmation',
    verifying: 'Verifying',
    approved: 'Approved',
    rejected: 'Rejected'
  }[status] || status;
}

function resetWeeklyCampaignStats() {
    const data = loadData();

    for (const clip of Object.values(data.clips || {})) {
        clip.weeklyBaselineViews = clip.currentViews || clip.views || 0;
        clip.weeklyViews = 0;
        clip.weeklyMoneyMade = 0;
    }

    saveData(data);

    console.log("✅ Weekly campaign stats reset.");
}

async function sendAccountForStaffReview(guild, campaignId, accountData) {
    const campaign = CAMPAIGNS[campaignId];
    const channelId = campaign?.staffChannels?.linkAccount;
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (channel) {
        // Send account linking review payload with Accept/Reject buttons
        await channel.send({ embeds: [/* Account Link Embed */], components: [/* Staff Action Buttons */] });
    }
}

// Dynamic routing helper for clip reviews
async function sendClipForStaffReview(guild, clip) {
    const data = loadData();
    const campaignStaffMap = data.campaignStaffChannels?.[clip.campaignId];
    
    if (!campaignStaffMap) {
        console.error(`⚠️ No staff channels configured for campaign: ${clip.campaignId}`);
        return;
    }

    // Pick channel ID based on clip platform ('instagram', 'tiktok', 'youtube')
    const platformKey = clip.platform.toLowerCase();
    const targetChannelId = campaignStaffMap[platformKey];

    if (!targetChannelId) {
        console.error(`⚠️ No target channel ID found for platform: ${platformKey}`);
        return;
    }

    const channel = guild.channels.cache.get(targetChannelId);
    if (channel) {
        await channel.send({
            content: `📌 **New ${clip.platform.toUpperCase()} Submission** from <@${clip.userId}>`,
            embeds: [/* Clip Review Embed */],
            components: [/* Approve / Reject Action Row Buttons */]
        });
    }
}

function validateAccountSubmission(userId, campaignId, platform, username) {
  const data = loadData();
  const currentKey = normalizeSocialKey(platform, username);

  // 1. FIND ANY EXISTING ACTIVE OR PENDING REQUEST FOR THIS EXACT HANDLE
  const conflictingRequest = Object.values(data.campaignAccountRequests || {}).find(
    req => normalizeSocialKey(req.platform, req.username) === currentKey && req.status !== 'rejected'
  );

  if (conflictingRequest) {
    // Rule A: The handle is already taken by a DIFFERENT creator
    if (conflictingRequest.userId !== userId) {
      return { 
        isValid: false, 
        message: `❌ The account **@${username}** has already been registered by another creator.` 
      };
    } 
    // Rule B: The CURRENT user is trying to register the exact same handle again
    else {
      return { 
        isValid: false, 
        message: `❌ You have already linked or submitted a pending request for **@${username}**!` 
      };
    }
  }

  // ✅ SUCCESS: No duplicate handles found! 
  // The user is completely free to add multiple accounts for the same campaign and platform.
  return { isValid: true };
}

// Deprecated: submission flow uses validateClipBeforeSubmission() for campaign-scoped canonical duplicate checks.
function validateClipSubmission(videoUrl) {
  const data = loadData();
  
  // Clean URL to remove tracking metrics (e.g., "?is_from_webapp=1")
  const cleanUrl = String(videoUrl).split('?')[0].trim().toLowerCase();

  // Check if this video base-url exists anywhere inside your clips dataset
  const clipExists = Object.values(data.clips || {}).some(clip => {
    const existingCleanUrl = String(clip.videoUrl || clip.url).split('?')[0].trim().toLowerCase();
    return existingCleanUrl === cleanUrl;
  });

  if (clipExists) {
    return { isValid: false, message: "❌ This video link has already been submitted to our system!" };
  }

  return { isValid: true };
}

async function archiveFinishedCampaigns(client) {

  const data = loadData();

  if (!data.campaignStatus) return;

  for (const campaignId of Object.keys(data.campaignStatus)) {

    const status = data.campaignStatus[campaignId];

    if (status.status !== 'finished') continue;

    if (status.archived) continue;

    if (!status.finishedAt) continue;

    const hoursPassed =
      (Date.now() - status.finishedAt) /
      (1000 * 60 * 60);

    if (hoursPassed < 24) continue;

    const campaign = CAMPAIGNS[campaignId];

    if (!campaign) continue;

    const guild =
      client.guilds.cache.first();

    if (!guild) continue;

    const channel =
      guild.channels.cache.get(
        campaign.panelChannelId
      );

    if (!channel) continue;

    try {

      // Move channel
      await channel.setParent(
        FINISHED_CAMPAIGNS_CATEGORY_ID
      );

      // Hide from everyone
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          ViewChannel: false
        }
      );

      // Allow staff
      await channel.permissionOverwrites.edit(
        STAFF_ROLE_ID,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }
      );

      // Rename channel
      if (!channel.name.startsWith("closed-")) {

        await channel.setName(
          `closed-${channel.name}`
        );

      }

      status.archived = true;

      saveData(data);

      console.log(
        `${campaign.name} archived successfully.`
      );

    } catch (err) {

      console.error(err);

    }

  }

}

function buildClipStaffEmbed(clip) {
  const campaignName = clip.campaignName || CAMPAIGNS[clip.campaignId]?.name || clip.campaignId;
  const clipUrl = clip.videoUrl || clip.url || '';
  const title = clip.title || clip.caption || clipUrl || 'View clip';
  const color = { pending: 0xF1C40F, approved: 0x57F287, rejected: 0xED4245 }[clip.status] || 0xF1C40F;
  const pending = clip.status === 'pending';
  const rejected = clip.status === 'rejected';
  const rejectionStage = rejected ? getClipRejectionStage(clip, null) : null;
  const earnings = pending || rejectionStage === 'pre_approval'
    ? Number(clip.estimatedEarnings) || 0
    : Number(clip.totalMoneyMade ?? clip.moneyMade ?? 0);
  const statusText = pending ? '🟡 Pending Review' :
    rejectionStage === 'pre_approval' ? '🔴 Rejected Before Approval' :
    rejectionStage === 'post_approval' ? '🔴 Removed From Payment' : clip.status || 'pending';
  const viewsLabel = rejected ? 'Latest Recorded Views' : 'Current Views';
  const earningsLabel = rejectionStage === 'pre_approval' ? 'Estimated Earnings Before Rejection' :
    rejectionStage === 'post_approval' ? 'Tracked Earnings Before Removal' :
    pending ? 'Estimated Earnings' : 'Current Earnings';
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('Clip Review')
    .setDescription(
      '**Creator**\n<@' + clip.userId + '>\n' +
      '**Campaign**\n' + campaignName + '\n' +
      '**Platform**\n' + formatPlatform(clip.platform) + '\n' +
      '**Account**\n@' + (clip.username || 'Unknown') + '\n' +
      '**Video**\n[' + title + '](' + clipUrl + ')\n' +
      '**Status**\n' + statusText + '\n' +
      '**' + viewsLabel + '**\n' + formatNumber(getSafeTrackedViews(clip, null)) + '\n' +
      '**' + earningsLabel + '**\n$' + earnings.toFixed(2) + (pending ? ' — Not Yet Approved' : '') + '\n' +
      (pending ? '**Payment Eligibility**\nNot eligible until approved\n' : '') +
      (rejectionStage === 'pre_approval' ? '**Payment Eligibility**\nNot eligible\n' : '') +
      (rejectionStage === 'post_approval' ? '**Payment Eligibility**\nNot eligible for new payment\n**Historical Paid**\n$' + (Number(clip.payout?.paidMoney) || 0).toFixed(2) + '\n' : '') +
      (rejected ? '**Rejection Reason**\n' + (clip.rejectReason || 'Not provided') + '\n' : '') +
      (pending ? '**Submission Views**\n' + formatNumber(Number(clip.submissionViews) || 0) + '\n' : '') +
      '**Approval Views**\n' + formatNumber(Number(clip.approvalViews) || 0) + '\n' +
      '**Last Updated**\n<t:' + Math.floor((clip.lastChecked || Date.now()) / 1000) + ':R>\n' +
      '**Next Scheduled Check**\n<t:' + Math.floor((clip.nextCheckAt || Date.now()) / 1000) + ':R>'
    );
  if (clip.thumbnailUrl) embed.setThumbnail(clip.thumbnailUrl);
  return embed;
}

async function sendClipApprovedDM(guild, clip) {
  try {
    const member = await guild.members.fetch(clip.userId);
    const clipUrl = clip.videoUrl || clip.url;
    const rawTitle = clip.title || clip.caption || 'View approved clip';
    const title = String(rawTitle).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const videoText = clipUrl ? `[${title}](${clipUrl})` : title;
    const embed = new EmbedBuilder().setColor(0x00E676)
      .setAuthor({ name: clip.campaignName || CAMPAIGNS[clip.campaignId]?.name || 'Creators Elite', iconURL: guild.iconURL() || undefined })
      .setTitle('Your video has been approved ✅')
      .setDescription(videoText + '\n\n📈 **Current Views**\n' + formatNumber(getApprovedClipViews(clip)) + '\n\n💰 **Current Earnings**\n$' + Number(clip.totalMoneyMade ?? clip.moneyMade ?? 0).toFixed(2) + '\n\n🌐 **Platform**\n' + formatPlatform(clip.platform))
      .setFooter({ text: 'Creators Elite • Thank you for clipping ❤️', iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png' })
      .setTimestamp();
    if (clip.thumbnailUrl) embed.setThumbnail(clip.thumbnailUrl);
    await member.send({ embeds: [embed] });
  } catch (err) {
    console.error(`Could not DM approved clip to ${clip.userId}:`, err.message);
  }
}

function buildClipStaffButtons(clip) {
    const row = new ActionRowBuilder();

    if (clip.status === "pending") {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`clip_approve:${clip.id}`)
                .setLabel("Approve")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`clip_reject:${clip.id}`)
                .setLabel("Reject")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger)
        );
    } else if (clip.status === "approved") {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`clip_reject:${clip.id}`)
                .setLabel("Reject")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`update_views:${clip.id}`)
                .setLabel("Update Views")
                .setEmoji("📈")
                .setStyle(ButtonStyle.Primary)
        );
    } else if (clip.status === "rejected") {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`restore_clip:${clip.id}`)
                .setLabel("Restore")
                .setEmoji("♻️")
                .setStyle(ButtonStyle.Success)
        );
    }

    return [row];
}

function buildStaffButtons(id, status) {
  if (status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staff_send_code:${id}`)
          .setLabel('Send Code')
          .setStyle(ButtonStyle.Primary)
      )
    ];
  }

  if (status === 'waiting_confirm') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wait:${id}`)
          .setLabel('Waiting')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  if (status === 'verifying') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staff_accept:${id}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`staff_reject:${id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  return [];
}

function cleanDropdownLabel(text) {
  return String(text)
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

async function sendStaffPayoutDashboard(guild, userId) {
  const data = loadData();
  const userRecord = data.users?.[userId];
  if (!userRecord) return;

  // Calculate live totals dynamically from approved clips
  const approvedClips = Object.values(data.clips || {}).filter(
    clip => clip.userId === userId && isPayoutEligibleClip(clip)
  );
  
  const liveTotalEarned = approvedClips.reduce((sum, clip) => sum + (Number(clip.totalMoneyMade) || 0), 0);
  if (liveTotalEarned <= 0) return; // Skip if they haven't earned anything yet

  let paymentLabel = 'No ID Provided';
  if (userRecord.paymentDetails?.exchange) {
    const exchangeName = userRecord.paymentDetails.exchange.charAt(0).toUpperCase() + userRecord.paymentDetails.exchange.slice(1);
    paymentLabel = `**${exchangeName} ID:** \`${userRecord.paymentDetails.paymentId}\``;
  }

  const embed = new EmbedBuilder()
    .setColor(0xF1C40F) // Processing Gold
    .setTitle('💸 Pending Payout Processing')
    .setDescription(
      `👤 **Creator:** <@${userId}>\n` +
      `💳 **Payment Method:** ${paymentLabel}\n` +
      `💰 **Total Outstanding Amount:** $${formatNumber(liveTotalEarned)}\n\n` +
      `*Verify the wallet details on your exchange platform, execute the payment, then use the controls below to update the user's dashboard entry status.*`
    )
    .setFooter({ text: `User ID: ${userId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_payout_paid:${userId}`)
      .setLabel('Mark as Paid')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`staff_payout_error:${userId}`)
      .setLabel('Flag Error')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⚠️')
  );

  // Uses your exact environmental configuration constant
  const staffChannel = guild.channels.cache.get(PAYMENT_STAFF_CHANNEL_ID);
  if (staffChannel) {
    await staffChannel.send({ embeds: [embed], components: [row] });
  } else {
    console.log(`❌ Payout processing failed: Channel with ID ${PAYMENT_STAFF_CHANNEL_ID} not found.`);
  }
}

async function backfillPayoutCards() {

    const data = loadData();
    const guild = client.guilds.cache.first();

    if (!guild) return;

    for (const campaignId of Object.keys(CAMPAIGNS)) {

        const users = [
            ...new Set(
                Object.values(data.clips)
                    .filter(c =>
                        c.campaignId === campaignId &&
                        isPayoutEligibleClip(c)
                    )
                    .map(c => c.userId)
            )
        ];

        for (const userId of users) {

            await syncPayoutCard(
                guild,
                campaignId,
                userId
            );
        }
    }

    console.log("✅ Existing payout cards generated.");
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
  } catch (error) {
    console.log('Could not update staff message:', error.message);
  }
}

function formatNumber(num) {
  const n = Number(num) || 0;

  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function getLeaderboardUsers(data) {
  const users = Object.values(data.users || {});

  return users
    .map(user => {
      const userClips = Object.values(data.clips || {}).filter(clip => clip.userId === user.discordId && isPayoutEligibleClip(clip));
      const totalViews = getUserAllTimeCreditedViews(data, user.discordId);

      const moneyMade = userClips.reduce(
        (sum, clip) => sum + (Number(clip.totalMoneyMade) || 0),
        0
      );

      return {
        ...user,
        leaderboardViews: totalViews,
        leaderboardMoney: moneyMade
      };
    })
    .sort((a, b) => b.leaderboardViews - a.leaderboardViews);
}

function buildLeaderboardEmbed(guild, data, page = 1, perPage = 10) {
  // 1. MAP & AGGREGATE VIEWS FOR EVERY USER
  const sortedUsers = Object.entries(data.users || {})
    .map(([userId, userRecord]) => {
      const liveTotalViews = getUserAllTimeCreditedViews(data, userId);

      const finalName =
          userRecord.displayName ||
          userRecord.discordUsername ||
          userRecord.username ||
          userRecord.tag ||
          `User-${userId.slice(-4)}`;

      return {
        userId,
        username: finalName,
        totalViews: liveTotalViews,
        hideFromLeaderboard: userRecord.hideFromLeaderboard
      };
    })
    // 2. FILTER OUT USERS WITH 0 VIEWS AND SORT HIGHEST TO LOWEST
    .filter(user => user.totalViews > 0)
    .sort((a, b) => b.totalViews - a.totalViews);

  if (process.env.DEBUG_STATS_CONSISTENCY === 'true') {
    const leaderboardViews = sortedUsers.reduce((sum, user) => sum + user.totalViews, 0);
    const serverViews = getServerAllTimeCreditedViews(data);
    console.log('[Stats Consistency]', { serverViews, leaderboardViews, difference: leaderboardViews - serverViews });
  }

  // 3. PAGINATION MATH
  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * perPage;
  const pageUsers = sortedUsers.slice(startIdx, startIdx + perPage);

  // 4. BUILD THE EMBED STRINGS
  let leaderboardText = '';
  if (pageUsers.length === 0) {
    leaderboardText = '*No clippers on the leaderboard yet!*';
  } else {
    pageUsers.forEach((user, index) => {
      const overallRank = startIdx + index + 1;

      let rankDisplay;

      switch (overallRank) {
        case 1:
          rankDisplay = "🥇";
          break;
        case 2:
          rankDisplay = "🥈";
          break;
        case 3:
          rankDisplay = "🥉";
          break;
        default:
          rankDisplay = `\`${overallRank}.\``;
      }

      const displayName = user.hideFromLeaderboard
        ? "*Hidden*"
        : user.username;

      leaderboardText += `${rankDisplay} **${displayName}**: ${formatNumber(user.totalViews)} Views\n`;
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x7ED957)
    .setTitle('🎬 Creators Elite <a:rgem:1506235676276953190>')
    .setDescription(`### Top Clippers All Time <a:chart1:1504773558415523931>\n\n${leaderboardText}\n\n<:whiteCE:1504904179905200148> Powered by Creators Elite`)
    .setFooter({ text: `Page ${currentPage} / ${totalPages}` });

  return { embed, page: currentPage, totalPages };
}

function buildLeaderboardButtons(page, totalPages) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`leaderboard_prev:${page}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),

      new ButtonBuilder()
        .setCustomId(`leaderboard_next:${page}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages)
    )
  ];
}

function getUserRank(data, userId) {
  const sortedUsers = Object.entries(data.users || {})
    .map(([id, userRecord]) => {
      const liveTotalViews = getUserAllTimeCreditedViews(data, id);

      return { id, totalViews: liveTotalViews };
    })
    .filter(user => user.totalViews > 0)
    .sort((a, b) => b.totalViews - a.totalViews);

  const rankIndex = sortedUsers.findIndex(u => u.id === userId);
  return rankIndex !== -1 ? rankIndex + 1 : null;
}

function ensureCampaignStats(userRecord, campaignId) {
  if (!userRecord.campaignStats) {
    userRecord.campaignStats = {};
  }

  if (!userRecord.campaignStats[campaignId]) {
    userRecord.campaignStats[campaignId] = {
      videosPosted: 0,
      videosApproved: 0,
      videosRejected: 0,
      totalViews: 0,
      moneyMade: 0
    };
  }

  return userRecord.campaignStats[campaignId];
}

function getApprovedClipViews(clip) {
  if (!clip) return 0;
  return getClipCreditedViews(clip);
}

function getApprovedClipEarnings(clip, campaign) {
  const views = getApprovedClipViews(clip);
  const rate = Number(campaign?.ratePerMillion) || 0;
  return views / 1_000_000 * rate;
}

function getCampaignBudgetCycleWeeks(campaign) {
  const explicitWeeks = Number(campaign?.budgetCycleWeeks);
  if (Number.isFinite(explicitWeeks) && explicitWeeks > 0) return explicitWeeks;
  const configuredWeeks = Number(campaign?.cycleWeeks);
  if (Number.isFinite(configuredWeeks) && configuredWeeks > 0) return configuredWeeks;
  return String(campaign?.budgetCycle || 'weekly').toLowerCase() === 'monthly' ? 4 : 1;
}

function getCampaignBudgetCycleIndex(campaign, date = new Date()) {
  const parsedDate = new Date(date);
  const startDate = new Date(campaign?.startDate);
  if (Number.isNaN(parsedDate.getTime()) || Number.isNaN(startDate.getTime())) return 0;
  const lengthMs = getCampaignBudgetCycleWeeks(campaign) * 7 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((parsedDate.getTime() - startDate.getTime()) / lengthMs));
}

function getCampaignBudgetPeriod(campaign, date = new Date()) {
  const cycleIndex = getCampaignBudgetCycleIndex(campaign, date);
  const cycleWeeks = getCampaignBudgetCycleWeeks(campaign);
  const periodStart = new Date(campaign.startDate);
  periodStart.setUTCDate(periodStart.getUTCDate() + cycleIndex * cycleWeeks * 7);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + cycleWeeks * 7);
  return { cycleIndex, periodStart, periodEnd };
}

function getCampaignEarningPeriod(campaign) {
  const start = new Date(campaign?.startDate);
  const end = new Date(campaign?.endDate);
  return {
    periodStart: Number.isNaN(start.getTime()) ? null : start,
    periodEnd: Number.isNaN(end.getTime()) ? null : end
  };
}

function getCampaignEarningStart(campaign) {
  const value = Date.parse(campaign?.startDate || '');
  return Number.isFinite(value) ? value : null;
}

function getCampaignEarningEnd(campaign) {
  const value = Date.parse(campaign?.endDate || '');
  return Number.isFinite(value) ? value : null;
}

function getCampaignEarningRunKey(campaign) {
  return [campaign?.id || 'unknown', campaign?.startDate || '', campaign?.endDate || ''].join(':');
}

function isClipInCampaignEarningRun(clip, campaign) {
  const submittedAt = getClipSubmissionTimestamp(clip);
  const start = getCampaignEarningStart(campaign);
  const end = getCampaignEarningEnd(campaign);
  if (!Number.isFinite(submittedAt) || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (submittedAt < start || submittedAt >= end) return false;
  // A submission timestamp inside this configured run is authoritative for
  // legacy records created before earningRunKey was introduced.
  if (!clip?.earningRunKey) return true;
  return String(clip.earningRunKey) === String(getCampaignEarningRunKey(campaign));
}

function isCampaignEarningActive(campaign, date = new Date()) {
  const { periodStart, periodEnd } = getCampaignEarningPeriod(campaign);
  if (!campaign?.separateEarningLifecycle) return true;
  if (!periodStart || !periodEnd) return false;
  const time = new Date(date).getTime();
  return time >= periodStart.getTime() && time < periodEnd.getTime();
}

function isClipInCampaignEarningPeriod(clip, campaign, date = new Date()) {
  if (!campaign?.separateEarningLifecycle) return isClipInCurrentBudgetCycle(clip, campaign, date);
  return isClipInCampaignEarningRun(clip, campaign) && isCampaignEarningActive(campaign, date);
}

function getCampaignBudgetCycleKey(campaign, date = new Date()) {
  const { periodStart } = getCampaignBudgetPeriod(campaign, date);
  return periodStart ? periodStart.toISOString() : null;
}

function getClipSubmissionTimestamp(clip) {
  const direct = Number(clip?.submittedTimestamp);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = Date.parse(clip?.submittedAt || clip?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function getClipBudgetCycleIndex(clip, campaign) {
  const submittedTimestamp = getClipSubmissionTimestamp(clip);
  return submittedTimestamp ? getCampaignBudgetCycleIndex(campaign, submittedTimestamp) : null;
}

function isClipInCurrentBudgetCycle(clip, campaign, now = new Date()) {
  const clipCycle = getClipBudgetCycleIndex(clip, campaign);
  return clipCycle !== null && Number(clipCycle) === Number(getCampaignBudgetCycleIndex(campaign, now));
}

function getCampaignViewCap(campaign) {
  const value = Number(campaign?.viewCap);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function campaignHasViewCap(campaign) {
  return getCampaignViewCap(campaign) !== null;
}

function getClipCreditedViews(clip) {
  const persistedCredited = Number(clip?.campaignCreditedViews);
  if (Number.isFinite(persistedCredited) && persistedCredited >= 0) return persistedCredited;
  return Math.max(Number(clip?.views) || 0, Number(clip?.approvalViews) || 0);
}

function getCurrentBudgetCycleEligibleClips(campaignId, options = {}) {
  const data = options.data || loadData();
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return [];
  return getUniqueClipRecords([
    ...Object.values(data.clips || {}),
    ...Object.values(data.clipReviews || {})
  ]).filter(clip =>
    String(clip.campaignId) === String(campaignId) &&
    isClipInCurrentBudgetCycle(clip, campaign) &&
    clip.trackingStatus !== 'completed' &&
    (isPayoutEligibleClip(clip) || Number(clip.payout?.paidViews) > 0 || Number(clip.payout?.paidMoney) > 0)
  );
}

function getCampaignCurrentWeeklyCreditedViews(campaignId, options = {}) {
  const data = options.data || loadData();
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return 0;
  const cycleKey = getCampaignBudgetCycleKey(campaign, options.date || new Date());
  const excludeClipId = options.excludeClipId ? String(options.excludeClipId) : null;
  return getUniqueClipRecords([
    ...Object.values(data.clips || {}),
    ...Object.values(data.clipReviews || {})
  ]).filter(clip =>
    String(clip.campaignId) === String(campaignId) &&
    String(clip.id) !== excludeClipId &&
    clip.trackingStatus !== 'completed' &&
    isClipInCampaignEarningPeriod(clip, campaign, options.date || new Date()) &&
    (clip.status === 'pending' || isPayoutEligibleClip(clip)) &&
    clip.budgetTracking?.budgetCycleKey === cycleKey
  ).reduce((total, clip) => total + Math.max(Number(clip.budgetTracking?.creditedViewsThisCycle) || 0, 0), 0);
}

function getCampaignCurrentCycleCreditedViews(campaignId, options = {}) {
  if (CAMPAIGNS[campaignId]?.separateEarningLifecycle) {
    return getCampaignCurrentWeeklyCreditedViews(campaignId, options);
  }
  const excludeClipId = options.excludeClipId ? String(options.excludeClipId) : null;
  return getCurrentBudgetCycleEligibleClips(campaignId, options)
    .filter(clip => String(clip.id) !== excludeClipId)
    .reduce((total, clip) => total + getClipCreditedViews(clip), 0);
}

function isCampaignCurrentBudgetCycleFulfilled(campaignId, options = {}) {
  const campaign = CAMPAIGNS[campaignId];
  const cap = getCampaignViewCap(campaign);
  return cap !== null && getCampaignCurrentCycleCreditedViews(campaignId, options) >= cap;
}

function finalizeExpiredBudgetCycleClips(data = loadData(), now = new Date()) {
  let changed = false;
  for (const collection of [data.clipReviews || {}, data.clips || {}]) {
    for (const clip of Object.values(collection)) {
      const campaign = CAMPAIGNS[clip?.campaignId];
      if (!campaign) continue;
      if (campaign.separateEarningLifecycle) {
        const { periodStart, periodEnd } = getCampaignEarningPeriod(campaign);
        const submittedAt = getClipSubmissionTimestamp(clip);
        if (!periodStart || !periodEnd || !submittedAt || submittedAt < periodStart.getTime() || submittedAt >= periodEnd.getTime() || new Date(now).getTime() < periodEnd.getTime()) continue;
        if (clip.trackingStatus !== 'completed') {
          clip.trackingStatus = 'completed';
          clip.completedAt ||= Date.now();
          clip.completedReason ||= 'campaign_earning_period_ended';
          changed = true;
        }
        continue;
      }
      const clipCycle = getClipBudgetCycleIndex(clip, campaign);
      const currentCycle = getCampaignBudgetCycleIndex(campaign, now);
      if (clipCycle === null || Number(clipCycle) >= Number(currentCycle)) continue;
      if (clip.trackingStatus !== 'completed') {
        clip.trackingStatus = 'completed';
        clip.completedAt ||= Date.now();
        clip.completedReason ||= 'budget_cycle_ended';
        changed = true;
      }
    }
  }
  return changed;
}

function finalizeOutOfRunClips(data, now = Date.now()) {
  let changed = false;
  for (const collection of [data?.clips || {}, data?.clipReviews || {}]) {
    for (const clip of Object.values(collection)) {
      const campaign = CAMPAIGNS[clip?.campaignId];
      if (!campaign?.separateEarningLifecycle) continue;
      const campaignEnd = getCampaignEarningEnd(campaign);
      const belongsToRun = isClipInCampaignEarningRun(clip, campaign);
      if (!belongsToRun || (campaignEnd !== null && now >= campaignEnd)) {
        if (clip.trackingStatus !== 'completed') {
          clip.trackingStatus = 'completed';
          clip.completedAt ||= now;
          clip.completedReason = 'campaign_earning_period_ended';
          changed = true;
        }
      }
    }
  }
  return changed;
}

function shouldTrackClip(clip, campaign, data) {
  if (!clip || !campaign || clip.trackingStatus === 'completed') return false;
  if (clip.status !== 'pending' && !(clip.status === 'approved' && isPayoutEligibleClip(clip))) return false;
  if (campaign.separateEarningLifecycle) {
    if (!isClipInCampaignEarningPeriod(clip, campaign)) return false;
  } else if (!isClipInCurrentBudgetCycle(clip, campaign)) return false;
  if (campaignHasViewCap(campaign) && isCampaignCurrentBudgetCycleFulfilled(campaign.id, { data })) return false;
  return true;
}

function getFiniteNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function getClipIdentityKey(clip) {
  const platform = String(clip?.platform || '').trim().toLowerCase();
  const videoId = String(clip?.videoId || '').trim();
  if (platform && videoId) return `video:${platform}:${videoId}`;
  const rawUrl = clip?.videoUrl || clip?.url;
  if (rawUrl) {
    try {
      const parsed = parseCanonicalVideoUrl(rawUrl);
      if (parsed?.platform && parsed?.videoId) return `video:${parsed.platform}:${parsed.videoId}`;
      const url = new URL(rawUrl);
      url.hash = '';
      return `url:${url.origin.toLowerCase()}${url.pathname}`;
    } catch {}
  }
  return clip?.id ? `id:${clip.id}` : null;
}

function getClipAccounting(clip, campaign) {
  const totalViews = getClipCreditedViews(clip);
  const rawPaidViews = getFiniteNonNegativeNumber(clip?.payout?.paidViews);
  const paidViews = Math.min(rawPaidViews, totalViews);
  const paidMoney = getFiniteNonNegativeNumber(clip?.payout?.paidMoney);
  if (rawPaidViews > totalViews && process.env.DEBUG_CLIP_ACCOUNTING === 'true') console.warn('[Clip Accounting anomaly]', { id: clip?.id, identity: getClipIdentityKey(clip), rawPaidViews, totalViews });
  const eligible = isPayoutEligibleClip(clip);
  const unpaidViews = eligible ? Math.max(totalViews - paidViews, 0) : 0;
  const unpaidMoney = unpaidViews / 1_000_000 * (Number(campaign?.ratePerMillion) || 0);
  return { eligible, totalViews, rawPaidViews, paidViews, unpaidViews, paidMoney, unpaidMoney,
    accountedViews: paidViews + unpaidViews, accountedMoney: paidMoney + unpaidMoney };
}

function getUniqueClipRecords(clips, diagnosticContext = {}) {
  const unique = new Map();
  for (const clip of clips || []) {
    if (!clip) continue;
    const key = getClipIdentityKey(clip);
    if (!key) continue;
    const existing = unique.get(key);
    if (!existing) { unique.set(key, { ...clip, payout: { ...(clip.payout || {}) }, _accountingIdentityKey: key }); continue; }
    const existingViews = getClipCreditedViews(existing);
    const incomingViews = getClipCreditedViews(clip);
    const selected = incomingViews > existingViews ? clip : existing;
    const suppressed = selected === clip ? existing : clip;
    const conflicts = ['userId', 'campaignId', 'cycle', 'status'].some(field => String(existing[field] ?? '') !== String(clip[field] ?? '')) || Boolean(existing.payout?.history?.length) !== Boolean(clip.payout?.history?.length) || isPayoutEligibleClip(existing) !== isPayoutEligibleClip(clip);
    const merged = { ...selected, payout: { ...(selected.payout || {}) }, _accountingIdentityKey: key };
    merged.views = Math.max(existingViews, incomingViews);
    merged.currentViews = Math.max(existingViews, incomingViews);
    merged.payout.paidViews = Math.max(getFiniteNonNegativeNumber(existing.payout?.paidViews), getFiniteNonNegativeNumber(clip.payout?.paidViews));
    merged.payout.paidMoney = Math.max(getFiniteNonNegativeNumber(existing.payout?.paidMoney), getFiniteNonNegativeNumber(clip.payout?.paidMoney));
    if ((!merged.payout.history || !merged.payout.history.length) && (existing.payout?.history?.length || clip.payout?.history?.length)) merged.payout.history = existing.payout?.history?.length ? existing.payout.history : clip.payout.history;
    unique.set(key, merged);
    if (process.env.DEBUG_CLIP_ACCOUNTING === 'true') console.warn('[Clip Accounting duplicate]', { scope: diagnosticContext.scope, campaignId: diagnosticContext.campaignId, identity: key, selectedId: selected.id, suppressedId: suppressed.id, conflicts });
  }
  return [...unique.values()];
}

function calculateClipCollectionAccounting(clips, campaign, diagnosticContext = {}) {
  let paidViews = 0, unpaidViews = 0, paidMoney = 0, unpaidMoney = 0, accountedVideos = 0;
  const userIds = new Set();
  const uniqueClips = getUniqueClipRecords(clips, diagnosticContext);
  for (const clip of uniqueClips) {
    const accounting = getClipAccounting(clip, campaign);
    const counted = accounting.eligible || accounting.paidViews > 0 || accounting.paidMoney > 0;
    if (process.env.DEBUG_CLIP_ACCOUNTING === 'true') console.log('[Clip Accounting]', { scope: diagnosticContext.scope, campaignId: diagnosticContext.campaignId, requestedUserId: diagnosticContext.userId, id: clip.id, identity: clip._accountingIdentityKey || getClipIdentityKey(clip), userId: clip.userId, platform: clip.platform, videoId: clip.videoId, cycle: clip.cycle, status: clip.status, eligible: accounting.eligible, totalViews: accounting.totalViews, rawPaidViews: accounting.rawPaidViews, paidViews: accounting.paidViews, unpaidViews: accounting.unpaidViews, counted, exclusionReason: counted ? null : 'not_eligible_and_no_historical_payment' });
    if (!counted) continue;
    paidViews += accounting.paidViews;
    unpaidViews += accounting.unpaidViews;
    paidMoney += accounting.paidMoney;
    unpaidMoney += accounting.unpaidMoney;
    accountedVideos++;
    if (clip.userId) userIds.add(String(clip.userId));
  }
  const result = { users: userIds.size, videos: accountedVideos, paidViews, unpaidViews, totalViews: paidViews + unpaidViews, paidMoney, unpaidMoney, totalMoney: paidMoney + unpaidMoney };
  if (process.env.DEBUG_CLIP_ACCOUNTING === 'true') console.log('[Clip Accounting summary]', { scope: diagnosticContext.scope, campaignId: diagnosticContext.campaignId, userId: diagnosticContext.userId, inputRecords: (clips || []).length, uniqueVideoGroups: uniqueClips.length, duplicatesSuppressed: (clips || []).length - uniqueClips.length, ...result });
  return result;
}

function getUserAllTimeCreditedViews(data, userId) {
  return Object.values(CAMPAIGNS).reduce((total, campaign) => {
    const clips = Object.values(data.clips || {}).filter(clip =>
      String(clip.userId) === String(userId) && String(clip.campaignId) === String(campaign.id)
    );
    const accounting = calculateClipCollectionAccounting(clips, campaign, { scope: 'leaderboard', campaignId: campaign.id, userId });
    return total + (Number(accounting.totalViews) || 0);
  }, 0);
}

function getServerAllTimeCreditedViews(data) {
  return Object.values(CAMPAIGNS).reduce((total, campaign) => {
    const clips = Object.values(data.clips || {}).filter(clip => String(clip.campaignId) === String(campaign.id));
    const accounting = calculateClipCollectionAccounting(clips, campaign, { scope: 'server_stats', campaignId: campaign.id });
    return total + (Number(accounting.totalViews) || 0);
  }, 0);
}

function getClipStatsCycle(clip, campaign) {
  const storedCycleValue = clip?.cycle;
  if (storedCycleValue !== null && storedCycleValue !== undefined && storedCycleValue !== '') {
    const storedCycle = Number(storedCycleValue);
    if (Number.isFinite(storedCycle)) return storedCycle;
  }

  const fallbackDate = clip?.approvedAt || clip?.submittedAt || clip?.createdAt || Date.now();
  return getCampaignCycle(campaign, fallbackDate);
}

function isClipInCurrentCampaignCycle(clip, campaign) {
  return Number(getClipStatsCycle(clip, campaign)) === Number(getCampaignCycle(campaign));
}

function buildCampaignStatsEmbed(data, userRecord, campaignId, campaignName, userId) {
  const campaign = CAMPAIGNS[campaignId];

  if (!campaign) {
    return new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription('❌ Campaign not found. Please rejoin the campaign or contact staff.');
  }

  const currentCycle = getCampaignBudgetCycleIndex(campaign);
  const payoutThreshold = campaign?.payoutThreshold || 100000;

  const targetUserId =
    userId ||
    userRecord?.discordId ||
    userRecord?.userId ||
    userRecord?.id;

  if (!targetUserId) {
    return new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription('❌ Could not resolve user identity context.');
  }

  const inStatsScope = clip => campaign.separateEarningLifecycle
    ? isClipInCampaignEarningRun(clip, campaign)
    : isClipInCurrentBudgetCycle(clip, campaign);
  const matchesUserCampaign = clip =>
    String(clip.userId) === String(targetUserId) &&
    String(clip.campaignId) === String(campaignId);
  const currentRunClipRecords = Object.values(data.clips || {})
    .filter(clip => matchesUserCampaign(clip) && inStatsScope(clip));
  const currentReviewClips = Object.values(data.clipReviews || {})
    .filter(clip => matchesUserCampaign(clip) && inStatsScope(clip));
  const currentRunStatusRecords = getUniqueClipRecords([
    ...currentReviewClips,
    ...currentRunClipRecords
  ], { scope: 'my_stats_status_counts', campaignId, userId: targetUserId });
  // Status counts reflect the full review lifecycle. Financial accounting below
  // intentionally remains limited to payout-eligible approved clip records.
  const approvedClips = currentRunStatusRecords.filter(clip => clip.status === 'approved');
  const pendingClips = currentRunStatusRecords.filter(clip => clip.status === 'pending');
  const rejectedClips = currentRunStatusRecords.filter(clip => clip.status === 'rejected');
  const approvedPayoutClips = currentRunClipRecords.filter(isPayoutEligibleClip);

  const userCampaignClips = currentRunClipRecords;
  const accounting = calculateClipCollectionAccounting(userCampaignClips, campaign, { scope: 'my_stats', campaignId, userId: targetUserId });
  const { totalViews, paidViews, unpaidViews, totalMoney, paidMoney, unpaidMoney } = accounting;
  if (process.env.DEBUG_MY_STATS === 'true') {
    const records = [
      ...Object.values(data.clips || {}).map(clip => ({ clip, collection: 'clips' })),
      ...Object.values(data.clipReviews || {}).map(clip => ({ clip, collection: 'clipReviews' }))
    ].filter(({ clip }) => matchesUserCampaign(clip));
    console.log('[My Stats Diagnostic]', {
      userId: targetUserId,
      campaignId,
      campaignStart: campaign.startDate,
      campaignEnd: campaign.endDate,
      currentEarningRunKey: campaign.separateEarningLifecycle ? getCampaignEarningRunKey(campaign) : null,
      approvedRecordsFound: approvedClips.length,
      reviewRecordsFound: currentReviewClips.length
    });
    for (const { clip, collection } of records) {
      const belongsToCurrentRun = inStatsScope(clip);
      const submittedAt = getClipSubmissionTimestamp(clip);
      const exclusionReason = belongsToCurrentRun ? null :
        !Number.isFinite(submittedAt) ? 'missing_submission_timestamp' :
        campaign.separateEarningLifecycle && submittedAt < getCampaignEarningStart(campaign) ? 'before_campaign_earning_start' :
        campaign.separateEarningLifecycle && submittedAt >= getCampaignEarningEnd(campaign) ? 'after_campaign_earning_end' :
        campaign.separateEarningLifecycle && clip.earningRunKey ? 'earning_run_key_mismatch' : 'outside_current_budget_cycle';
      console.log('[My Stats Record]', {
        clipId: clip.id,
        collection,
        status: clip.status,
        submittedAt: clip.submittedAt,
        submittedTimestamp: clip.submittedTimestamp,
        earningRunKey: clip.earningRunKey,
        trackingStatus: clip.trackingStatus,
        belongsToCurrentRun,
        exclusionReason
      });
    }
  }
  if (process.env.DEBUG_CLIP_ACCOUNTING === 'true') {
    const campaignAudit = getCampaignTotals(data, campaignId);
    const difference = campaignAudit.views - totalViews;
    const onlyCreator = campaignAudit.users <= 1;
    console.log('[Clip Accounting cross-scope]', { campaignId, userId: targetUserId, myStatsViews: totalViews, campaignStatusViews: campaignAudit.views, difference, onlyCreator });
    if (totalViews > campaignAudit.views) console.warn('[Clip Accounting cross-scope anomaly]', { campaignId, userId: targetUserId, myStatsViews: totalViews, campaignStatusViews: campaignAudit.views });
  }

  const viewsNeeded = Math.max(payoutThreshold - unpaidViews, 0);
  const weeklyUserViews = campaign.separateEarningLifecycle
    ? approvedPayoutClips.reduce((sum, clip) => sum + (clip.budgetTracking?.budgetCycleKey === getCampaignBudgetCycleKey(campaign) ? Math.max(Number(clip.budgetTracking?.creditedViewsThisCycle) || 0, 0) : 0), 0)
    : null;

  const payoutEligible = payoutThreshold > 0 && unpaidViews >= payoutThreshold;
  const payoutTracker = Object.values(data.payoutTrackers || {}).find(tracker =>
    String(tracker.userId) === String(targetUserId) && String(tracker.campaignId) === String(campaignId)
  );
  const payoutStatus = payoutTracker?.status === 'issue' ? '⚠️ Payment on hold' :
    payoutTracker?.status === 'ready' ? '✅ Ready for payout' :
    payoutTracker?.status === 'pending' ? '⏳ Payment pending' :
    '✅ Eligible for payout';
  const payoutSection = payoutEligible
    ? `<a:Cash1:1504871843419521115> **Payout Status**\n${payoutStatus}\n\n`
    : `<a:Cash1:1504871843419521115> **Payout Target: ${formatNumber(payoutThreshold)} Views**\nNeed **${formatNumber(viewsNeeded)}** more unpaid views\n\n`;

  return new EmbedBuilder()
    .setColor(0x7ED957)
    .setDescription(
      `<a:chart1:1504773558415523931> **Campaign Stats - ${campaignName}**\n\n` +

      `<a:rocket1:1504872045849346140> **${campaign.separateEarningLifecycle ? 'Monthly Earned Views' : 'Total Views'}**\n${formatNumber(totalViews)}\n\n` +
      (weeklyUserViews === null ? '' : `<a:chart1:1504773558415523931> **Current Week Views**\n${formatNumber(weeklyUserViews)}\n\n`) +
      `<a:good1:1504871589332914176> **Paid Views**\n${formatNumber(paidViews)}\n\n` +
      `<a:flyin:1506234392920723546> **Unpaid Views**\n${formatNumber(unpaidViews)}\n\n` +

      `<a:Cash1:1504871843419521115> **Total Earnings**\n$${totalMoney.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n\n` +

      `<a:good1:1504871589332914176> **Paid Earnings**\n$${paidMoney.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n\n` +

      `<a:flyin:1506234392920723546> **Unpaid Earnings**\n$${unpaidMoney.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n\n` +

      payoutSection +

      `<a:appr:1534931253952909453> **Approved Videos**\n${approvedClips.length}\n\n` +
      `<a:dot1:1508433228669780029> **Pending Videos**\n${pendingClips.length}\n\n` +
      `<a:cancel:1506235594303606794> **Rejected Videos**\n${rejectedClips.length}\n\n` +

      `🎞️ **View Your Clips**\nClick the button below to check the clips submitted for this campaign.`
    )
    .setFooter({ text: `Last update | ${new Date().toLocaleString()}` });
}

function buildApprovedClipUserEmbed(clip) {
  const currentViews = Number(clip.views) || 0;
  const currentMoney =
    clip.moneyMade != null
      ? Number(clip.moneyMade) || 0
      : ((currentViews / 1000000) * ((CAMPAIGNS[clip.campaignId]?.ratePerMillion) || 0));

  const titleText =
    clip.title ||
    clip.videoTitle ||
    clip.caption ||
    "View Approved Clip";

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({
      name: clip.campaignName || "Creators Elite"
    })
    .setTitle("Your video has been approved ✅")
    .setDescription(`[${titleText}](${clip.videoUrl || clip.url})`)
    .addFields(
      {
        name: "<a:chart1:1504773558415523931> Current Views",
        value: `${formatNumber(currentViews)}`,
        inline: false
      },
      {
        name: "<a:Cash1:1504871843419521115> Current Earnings",
        value: `$${currentMoney.toFixed(2)}`,
        inline: false
      },
      {
        name: "🌐 Platform",
        value: `${formatPlatform(clip.platform)}`,
        inline: false
      }
    )
    .setFooter({
      text: "Creators Elite • Thank you for clipping ❤️",
      iconURL: "https://cdn.discordapp.com/emojis/1504904179905200148.png"
    })
    .setTimestamp();

  if (clip.thumbnailUrl) {
    embed.setThumbnail(clip.thumbnailUrl);
  }

  return embed;
}

function buildRejectedClipUserEmbed(clip, reason) {
  const campaign = CAMPAIGNS[clip.campaignId];
  const title = String(clip.title || clip.videoTitle || clip.caption || 'View Clip')
    .replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const clipUrl = clip.videoUrl || clip.url || null;
  const rejectionStage = getClipRejectionStage(clip, null);
  const views = getSafeTrackedViews(clip, null);
  const earnings = Number(clip.totalMoneyMade ?? clip.moneyMade ?? clip.estimatedEarnings ?? 0) || 0;
  const paidMoney = Number(clip.payout?.paidMoney) || 0;
  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setAuthor({ name: campaign?.name || clip.campaignName || 'Creators Elite' })
    .setTitle('Your video has been rejected ❌')
    .setDescription(clipUrl ? `[${title}](${clipUrl})` : title)
    .addFields(
      { name: '<a:cancel:1506235594303606794> Reason', value: reason || 'Not provided', inline: false },
      { name: '<a:chart1:1504773558415523931> Latest Recorded Views', value: formatNumber(views), inline: true },
      { name: '🌐 Platform', value: formatPlatform(clip.platform), inline: true }
    )
    .setFooter({ text: 'Creators Elite • Thank you for clipping ❤️', iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png' })
    .setTimestamp();
  if (rejectionStage === 'pre_approval') {
    embed.addFields({ name: '<a:chart2:1504773558415523932> Estimated Earnings Before Rejection', value: `$${earnings.toFixed(2)} — not payable`, inline: false });
  } else {
    embed.addFields({ name: '<a:Cash1:1504871843419521115> Tracked Earnings Before Removal', value: `$${earnings.toFixed(2)}`, inline: false });
    if (paidMoney > 0) embed.addFields({ name: '<a:appr:1534931253952909453> Historical Paid', value: `$${paidMoney.toFixed(2)}`, inline: false });
  }
  if (clip.thumbnailUrl) embed.setThumbnail(clip.thumbnailUrl);
  return embed;
}
 
function makeSocialRequestId() {
  return `social_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function renderSocialStaffContent(request) {
  // Pass the raw input username through your normalizeUsername function to strip spaces and '@'
  const cleanUsername = normalizeUsername(request.username);
  const platform = String(request.platform).toLowerCase();
  
  // 1. Map out the clickable web link for each platform
  let profileUrl = '';
  if (platform === 'instagram') {
    profileUrl = `https://www.instagram.com/${cleanUsername}`;
  } else if (platform === 'tiktok') {
    profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
  } else if (platform === 'youtube') {
    profileUrl = `https://www.youtube.com/@${cleanUsername}`;
  } else {
    profileUrl = `Platform Link Formatting Error`;
  }

  // 2. Format the message for the staff channel with a markdown link [Text](URL)
  return (
    `📩 **Campaign Account Verification Request**\n\n` +
    `👤 **User:** <@${request.userId}>\n` +
    `🎬 **Campaign:** **${request.campaignName || 'Unknown Campaign'}**\n` +
    `🌐 **Platform:** ${formatPlatform(request.platform)}\n` +
    `🆔 **Username Link:** [@${cleanUsername}](${profileUrl})\n` + // Becomes a blue clickable hyperlink!
    `⏳ **Status:** \`${request.status.toUpperCase()}\``
  );
}

function buildSocialStaffButtons(id, status) {
  if (status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`social_staff_send_code:${id}`)
          .setLabel('Send Code')
          .setStyle(ButtonStyle.Primary)
      )
    ];
  }

  if (status === 'waiting_confirm') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`social_wait:${id}`)
          .setLabel('Waiting')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  

  if (status === 'verifying') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`social_staff_accept:${id}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`social_staff_reject:${id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  return [];
}

console.log(process.env.MONSTERLAB_API_KEY);

function getCampaignPeriod(campaign) {

    if (campaign.campaignMode === "monthly") {

        const cycle = getCampaignCycle(campaign);

        const periodStart =
            new Date(campaign.startDate);

        periodStart.setUTCMonth(
            periodStart.getUTCMonth() + cycle
        );

        const periodEnd =
            new Date(periodStart);

        periodEnd.setUTCMonth(
            periodEnd.getUTCMonth() + 1
        );

        return {
            periodStart,
            periodEnd
        };

    }

    // Existing code ↓↓↓

    const cycle = getCampaignCycle(campaign);

    const periodStart = new Date(campaign.startDate);

    periodStart.setUTCDate(
        periodStart.getUTCDate() +
        cycle * (campaign.cycleWeeks || 1) * 7
    );

    const periodEnd = new Date(periodStart);

    periodEnd.setUTCDate(
        periodEnd.getUTCDate() +
        (campaign.cycleWeeks || 1) * 7
    );

    return {
        periodStart,
        periodEnd
    };

}

function formatDateShort(date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function getCampaignTotals(data, campaignId) {
  const campaign = CAMPAIGNS[campaignId];

  if (!campaign) {
      return {
          users: 0,
          videos: 0,
          views: 0,
          payableViews: 0,
          payout: 0
      };
  }

  const campaignClips = Object.values(data.clips || {}).filter(clip =>
    String(clip.campaignId) === String(campaignId) &&
    (campaign.separateEarningLifecycle
      ? isClipInCampaignEarningPeriod(clip, campaign)
      : isClipInCurrentBudgetCycle(clip, campaign))
  );
  const accounting = calculateClipCollectionAccounting(campaignClips, campaign, { scope: 'campaign_status', campaignId });
  if (campaign.separateEarningLifecycle) {
    const weeklyViews = getCampaignCurrentWeeklyCreditedViews(campaignId, { data });
    return {
      users: accounting.users,
      videos: accounting.videos,
      views: weeklyViews,
      paidViews: accounting.paidViews,
      unpaidViews: accounting.unpaidViews,
      paidMoney: accounting.paidMoney,
      unpaidMoney: accounting.unpaidMoney,
      payout: accounting.paidMoney + accounting.unpaidMoney
    };
  }
  const viewCap = getCampaignViewCap(campaign);
  const creditedViews = viewCap === null ? accounting.totalViews : Math.min(accounting.totalViews, viewCap);
  const cappedPaidViews = Math.min(accounting.paidViews, creditedViews);
  const cappedUnpaidViews = Math.max(creditedViews - cappedPaidViews, 0);
  const cappedUnpaidMoney = cappedUnpaidViews / 1_000_000 * (Number(campaign.ratePerMillion) || 0);
  return {
    users: accounting.users,
    videos: accounting.videos,
    views: creditedViews,
    paidViews: cappedPaidViews,
    unpaidViews: cappedUnpaidViews,
    paidMoney: accounting.paidMoney,
    unpaidMoney: cappedUnpaidMoney,
    payout: accounting.paidMoney + cappedUnpaidMoney
  };
}

// Global tracking timestamp to block excessive name edits
let lastChannelUpdateTimestamp = 0;

async function updateServerStats(guild) {
    if (!guild) return;

    const data = loadData();
    const YEAR_GOAL = 100000; // Updated from your image configuration

    let totalPaid = 0;
    const totalViews = getServerAllTimeCreditedViews(data);
    for (const campaign of Object.values(CAMPAIGNS)) {
        const campaignClips = Object.values(data.clips || {}).filter(clip => String(clip.campaignId) === String(campaign.id));
        const accounting = calculateClipCollectionAccounting(campaignClips, campaign, { scope: 'server_stats', campaignId: campaign.id });
        totalPaid += accounting.paidMoney + accounting.unpaidMoney;
    }
    const activeCampaigns = Object.values(CAMPAIGNS).filter(c => c.status === "active").length;

    let availableMoney = 0;
    for (const campaign of Object.values(CAMPAIGNS)) {
        if (campaign.status !== "active") continue;
        const totals = getCampaignTotals(data, campaign.id);
        availableMoney += Math.max((campaign.campaignBudget || 0) - totals.payout, 0);
    }

    // Format metrics into clean visual target strings
    const goalText = `🎯・2026 Goal: $${YEAR_GOAL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const paidText = `🏦・Paid: $${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const availText = `💰・Available: $${availableMoney.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const viewsText = `📈・Views: ${formatNumber(totalViews)}`;
    const activeText = `🚀・Active Campaigns: ${activeCampaigns}`;

    // Target arrays mapping channels to their desired names safely
    const updates = [
        { id: process.env.GOAL_CHANNEL_ID || GOAL_CHANNEL_ID, name: goalText },
        { id: process.env.PAID_CHANNEL_ID || PAID_CHANNEL_ID, name: paidText },
        { id: process.env.AVAILABLE_CHANNEL_ID || AVAILABLE_CHANNEL_ID, name: availText },
        { id: process.env.VIEWS_CHANNEL_ID || VIEWS_CHANNEL_ID, name: viewsText },
        { id: process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID || ACTIVE_CAMPAIGNS_CHANNEL_ID, name: activeText }
    ];

    // Fire the name updates sequentially with micro-delays to eliminate Discord API rate-limiting blocks
    for (let i = 0; i < updates.length; i++) {
        const target = updates[i];
        if (!target.id) continue;
        
        const channel = guild.channels.cache.get(target.id);
        if (channel && channel.name !== target.name) {
            // Introduce a 500ms separation delay per channel change execution loop
            await new Promise(resolve => setTimeout(resolve, 500));
            await channel.setName(target.name).catch(err => console.error(`⚠️ Channel update failed for ID ${target.id}:`, err.message));
        }
    }
    console.log("📈 Counter display sync completed successfully!");
}

function buildCampaignStatusEmbed(campaign, data) {
  const { periodStart, periodEnd } = getCampaignBudgetPeriod(campaign);
  const totals = getCampaignTotals(data, campaign.id);
  const viewCap = getCampaignViewCap(campaign);
  const fulfilled = viewCap !== null && totals.views >= viewCap;
  const statusText = campaign.separateEarningLifecycle
    ? (fulfilled ? 'Paused — Weekly View Cap Reached' : 'Live')
    : (fulfilled ? 'Fulfilled' : 'Active');
  const viewsLabel = campaign.separateEarningLifecycle ? 'Weekly Views' : 'Total Views';
  console.log(`[Campaign Accounting] ${campaign.id}`, { users: totals.users, videos: totals.videos, paidViews: totals.paidViews, unpaidViews: totals.unpaidViews, totalViews: totals.views, payout: totals.payout });

  const cappedPayout = Math.min(
    Number(totals.payout) || 0,
    Number(campaign.campaignBudget) || 0
  );

  const remaining = Math.max(
    (Number(campaign.campaignBudget) || 0) - cappedPayout,
    0
  );

  const fulfilledPercent = Number(campaign.campaignBudget) > 0
    ? Math.min((cappedPayout / Number(campaign.campaignBudget)) * 100, 100)
    : 0;

  return new EmbedBuilder()
    .setColor(0x7ED957)
    .setTitle(campaign.name)
    .setDescription(
      `<a:redalert:1504777207648620595> **Campaign Status**\n` +
      `**Status:** ${statusText}\n\n` +

      `📅 **Campaign Period**\n` +
      `${formatDateShort(periodStart)} - ${formatDateShort(periodEnd)}\n\n` +

      `<a:rocket1:1504872045849346140> **Performance Metrics**\n` +
      `**Users:** ${totals.users}\n` +
      `**Videos:** ${totals.videos}\n` +
      `**${viewsLabel}:** ${viewCap === null ? formatNumber(totals.views) : `${formatNumber(totals.views)} / ${formatNumber(viewCap)}`}\n` +
      `**Paid Views:** ${formatNumber(totals.paidViews)}\n` +
      `**Unpaid Views:** ${formatNumber(totals.unpaidViews)}\n\n` +

      `<a:Cash1:1504871843419521115> **Payout & Budget**\n` +
      `**Campaign Budget:** $${formatNumber(campaign.campaignBudget)}\n` +
      `**Already Paid:** $${formatNumber(totals.paidMoney)}\n` +
      `**Current Unpaid:** $${formatNumber(totals.unpaidMoney)}\n` +
      `**Total Fulfilled:** $${formatNumber(cappedPayout)} (${fulfilledPercent.toFixed(1)}%)\n` +
      `**Remaining:** $${formatNumber(remaining)}\n` +
      (campaign.separateEarningLifecycle && fulfilled ? `**Next Reset:** ${formatDateShort(periodEnd)} at 07:00 UTC\n` : '\n') +

      `<a:warning:1504774411280973864> Once we hit the **${formatNumber(campaign.viewCap)} view cap**, any views after that won't be paid, so post early to secure your payout.\n\n` +
      `<:whiteCE:1504904179905200148> Powered by Creators Elite | ${new Date().toLocaleString()}`
  );
}

function makeClipId() {
  return `clip_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function getUserCampaignClips(data, userId, campaignId) {
  if (!data.clips) data.clips = {};

  return Object.values(data.clips).filter(
    clip => clip.userId === userId && clip.campaignId === campaignId
  );
}

function renderCampaignAccounts(userRecord, campaignId) {
  const campaignStats = userRecord.campaignStats?.[campaignId] || {};
  const platforms = Object.keys(campaignStats);

  if (platforms.length === 0) {
    return 'No campaign accounts set yet.';
  }

  return platforms.map(platform => {
    const acc = campaignStats[platform];
    return `• **${formatPlatform(platform)}** — @${acc.username || 'unknown'}`;
  }).join('\n');
}

async function sendTicketLog(guild, {
  user,
  ticketName,
  action,
  panel = 'Support',
  color = 0x57F287
}) {
  const logChannel = guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: user.tag,
      iconURL: user.displayAvatarURL()
    })
    .setDescription(
      `## Logged Info\n` +
      `Ticket: ${ticketName}\n` +
      `Action: ${action}\n` +
      `## Panel\n` +
      `${panel}`
    );

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function migratePayoutSystem() {

    const data = loadData();

    const guild = client.guilds.cache.first();

    if (!guild) {
        console.log("❌ Guild not found.");
        return;
    }

    // Create payout object on old clips
    for (const clip of Object.values(data.clips || {})) {

        if (!clip.payout) {

            clip.payout = {
                paidViews: 0,
                paidMoney: 0,
                lastPaidAt: null
            };

        }

    }

    saveData(data);

    let cardsCreated = 0;

    for (const campaignId of Object.keys(CAMPAIGNS)) {

        const users = [
            ...new Set(
                Object.values(data.clips || {})
                    .filter(c =>
                        c.campaignId === campaignId &&
                        String(c.status).toLowerCase() === "approved"
                    )
                    .map(c => c.userId)
            )
        ];

        for (const userId of users) {

            await syncPayoutCard(
                guild,
                campaignId,
                userId
            );

            cardsCreated++;

        }

    }

    console.log(`✅ Payout migration complete.`);
    console.log(`💰 ${cardsCreated} payout cards created.`);

}

async function addMissingPayoutChannels() {

    const data = loadData();

    const guild = client.guilds.cache.first();

    if (!guild) return console.log("Guild not found.");

    for (const campaignId of Object.keys(data.campaignStaffChannels || {})) {

        const staff = data.campaignStaffChannels[campaignId];

        if (staff.payouts) {
            console.log(`${campaignId} already has a payout channel.`);
            continue;
        }

        const category = guild.channels.cache.get(staff.category);

        if (!category) {
            console.log(`Category missing for ${campaignId}`);
            continue;
        }

        const payoutChannel = await guild.channels.create({
            name: "💰┃payout-queue",
            type: ChannelType.GuildText,
            parent: category.id
        });

        staff.payouts = payoutChannel.id;

        console.log(`✅ Created payout channel for ${campaignId}`);
    }

    saveData(data);

    console.log("✅ Missing payout channels created.");
}

function buildCampaignPanelButtons(campaign, data) {
  const totals = getCampaignTotals(data, campaign.id);

  const cappedPayout = Math.min(
    Number(totals.payout) || 0,
    Number(campaign.campaignBudget) || 0
  );
  const fulfilledPercent = Number(campaign.campaignBudget) > 0
    ? Math.min(cappedPayout / Number(campaign.campaignBudget) * 100, 100)
    : 0;

  // 🟢 FIX: Dynamic fallbacks to check both the state tree and the raw campaign object properties safely
  const isFinished =
    data.campaignStatus?.[campaign.id]?.status === 'finished' ||
    data.campaigns?.[campaign.id]?.status === 'finished' ||
    campaign.status === 'finished';

  console.log(`📊 Campaign UI Build [${campaign.name || campaign.id}] - Payout Total: $${totals.payout} | Finished: ${isFinished}`);

  const components = [
    new ButtonBuilder()
      .setCustomId(`join_campaign:${campaign.id}`)
      .setLabel("Join Campaign")
      .setEmoji("<a:flyin:1506234392920723546>")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isFinished),

    new ButtonBuilder()
      .setCustomId(`campaign_status:${campaign.id}`)
      .setLabel(isFinished ? "Campaign Finished" : "Campaign Status")
      .setEmoji(isFinished ? "🏁" : "<a:chart1:1504773558415523931>")
      .setStyle(isFinished ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(isFinished),

    new ButtonBuilder()
      .setCustomId(`campaign_fulfilled:${campaign.id}`)
      .setLabel(`Fulfilled: ${fulfilledPercent.toFixed(1)}%`)
      .setEmoji("<a:Loadin:1506234461459714100>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  ];

  const row = new ActionRowBuilder().addComponents(...components);
  return [row];
}

async function createStaffCampaignPanel(campaign) {

    const channel = client.channels.cache.get(STAFF_CONTROL_CHANNEL_ID);

    if (!channel) return;

    const row = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId(`finish_campaign:${campaign.id}`)
            .setLabel("Finish Campaign")
            .setEmoji("🏁")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`reopen_campaign:${campaign.id}`)
            .setLabel("Reopen Campaign")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Success)

    );

    await channel.send({
        content:
`## ${campaign.name}

Staff Controls

Only moderators should use these buttons.`,
        components: [row]
    });

}

async function updateCampaignPanelMessage(guild, campaignId) {
  const campaign = CAMPAIGNS[campaignId];

  console.log('Updating campaign panel...');
  console.log(campaign.panelChannelId);
  console.log(campaign.panelMessageId);

  const channel = guild.channels.cache.get(
    campaign.panelChannelId
  );

  if (!channel) {
    console.log('Panel channel not found');
    return;
  }

  const msg = await channel.messages
    .fetch(campaign.panelMessageId)
    .catch(() => null);

  if (!msg) {
    console.log('Panel message not found');
    return;
  }

  console.log('Panel message fetched');
  console.log('Editing panel...');

  const data = loadData();

  await msg.edit({
    content: campaign.panelText,
    components: buildCampaignPanelButtons(campaign, data)
  });
  
  console.log('Panel updated successfully');

}

async function updateLeaderboardMessage(guild) {
  console.log('🔄 Triggering automated leaderboard edit...');

  const channel = guild.channels.cache.get(LEADERBOARD_CHANNEL_ID);
  if (!channel) return;

  const msg = await channel.messages
    .fetch(LEADERBOARD_MESSAGE_ID)
    .catch(() => null);

  if (!msg) return;

  const data = loadData();

  for (const member of guild.members.cache.values()) {

      if (!data.users?.[member.id]) continue;

      data.users[member.id].displayName = member.displayName;
      data.users[member.id].discordUsername = member.user.username;
      data.users[member.id].username = member.user.username;
      data.users[member.id].tag = member.user.tag;

  }

  saveData(data);

  // FIX: Pass guild as the very first argument here!
  const { embed, totalPages } = buildLeaderboardEmbed(guild, data, 1); 

  await msg.edit({
    embeds: [embed],
    components: buildLeaderboardButtons(1, totalPages)
  });
}

function extractLinksFromText(text) {
  return String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function getCampaignPlatformsForUser(userRecord, campaignId) {
  const campaignStats = userRecord.campaignStats?.[campaignId] || {};
  return Object.keys(campaignStats).filter(platform => campaignStats[platform]);
}

function ensureCampaignAccount(userRecord, campaignId, platform, username = '') {
  if (!userRecord.campaignAccounts) {
    userRecord.campaignAccounts = {};
  }

  if (!userRecord.campaignAccounts[campaignId]) {
    userRecord.campaignAccounts[campaignId] = {};
  }

  if (!userRecord.campaignAccounts[campaignId][platform]) {
    userRecord.campaignAccounts[campaignId][platform] = {
      username,
      verified: false,
      bioCode: null,
      addedAt: new Date().toISOString()
    };
  }

  if (username) {
    userRecord.campaignAccounts[campaignId][platform].username = username;
  }

  return userRecord.campaignAccounts[campaignId][platform];
}

function ensureCampaignPlatformStats(userRecord, campaignId, platform, username = '') {
  if (!userRecord.campaignStats) {
    userRecord.campaignStats = {};
  }

  if (!userRecord.campaignStats[campaignId]) {
    userRecord.campaignStats[campaignId] = {};
  }

  if (!userRecord.campaignStats[campaignId][platform]) {
    userRecord.campaignStats[campaignId][platform] = {
      username,
      videosPosted: 0,
      videosApproved: 0,
      videosRejected: 0,
      totalViews: 0,
      moneyMade: 0
    };
  }

  if (username) {
    userRecord.campaignStats[campaignId][platform].username = username;
  }

  return userRecord.campaignStats[campaignId][platform];
}

function renderCampaignAssignedAccounts(userRecord, campaignId) {
  const accounts = userRecord.campaignAccounts?.[campaignId] || {};
  const platforms = Object.keys(accounts);

  if (platforms.length === 0) {
    return 'No campaign accounts assigned yet.';
  }

  return platforms.map(platform => {
    const acc = accounts[platform];
    const verifiedText = acc.verified ? '✅ Verified' : '⏳ Pending';
    return `• **${formatPlatform(platform)}** — @${acc.username} (${verifiedText})`;
  }).join('\n');
}

function makeCampaignAccountRequestId() {
  return `car_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function renderCampaignAccountStaffContent(request) {
  // Pass the raw input username through your normalizeUsername function to strip spaces and '@'
  const cleanUsername = normalizeUsername(request.username);
  const platform = String(request.platform).toLowerCase();
  
  // 1. Map out the clickable web link for each platform
  let profileUrl = '';
  if (platform === 'instagram') {
    profileUrl = `https://www.instagram.com/${cleanUsername}`;
  } else if (platform === 'tiktok') {
    profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
  } else if (platform === 'youtube') {
    profileUrl = `https://www.youtube.com/@${cleanUsername}`;
  } else {
    profileUrl = `Platform Link Formatting Error`;
  }

  // 2. Format the message for the staff channel with a markdown link [Text](URL)
  return (
    `📩 **Campaign Account Verification Request**\n\n` +
    `👤 **User:** <@${request.userId}>\n` +
    `🎬 **Campaign:** **${request.campaignName || 'Unknown Campaign'}**\n` +
    `🌐 **Platform:** ${formatPlatform(request.platform)}\n` +
    `🆔 **Username Link:** [@${cleanUsername}](${profileUrl})\n` + // Becomes a blue clickable hyperlink!
    `⏳ **Status:** \`${request.status.toUpperCase()}\``
  );
}

function buildCampaignAccountStaffButtons(id, status) {
  // 1. Initial State: Show "Send Code"
  if (status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_staff_send_code:${id}`)
          .setLabel('Send Code')
          .setStyle(ButtonStyle.Primary)
      )
    ];
  }

  // 2. Waiting State: Staff sent code, waiting for user to update bio
  if (status === 'waiting_confirm') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_wait:${id}`)
          .setLabel('⏳ Waiting for User...')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  // 3. Review State: User confirmed bio code! Show "Accept" and "Reject"
  if (status === 'verifying' || status === 'ready_for_review' || status === 'bio_updated') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_staff_accept:${id}`)
          .setLabel('✅ Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`campaign_staff_reject:${id}`)
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  // 4. Approved Final State
  if (status === 'approved') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_approved:${id}`)
          .setLabel('✅ Account Approved')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      )
    ];
  }

  // 5. Rejected Final State
  if (status === 'rejected') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_rejected:${id}`)
          .setLabel('❌ Account Rejected')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      )
    ];
  }

  return [];
}

async function updateCampaignAccountStaffMessage(guild, request) {
  if (!guild || !request) return;

  const data = loadData();

  // 🟢 4-TIER FALLBACK CHANNEL RESOLUTION
  const campaignStaffMap = data.campaignStaffChannels?.[request.campaignId];
  const channelId = request.staffChannelId 
                 || campaignStaffMap?.linkAccount 
                 || campaignStaffMap?.accountLinking 
                 || CAMPAIGNS[request.campaignId]?.staffChannelId;

  if (!channelId || !request.staffMessageId) {
    console.log(`⚠️ Missing channelId (${channelId}) or staffMessageId (${request.staffMessageId}) for request ${request.id}`);
    return;
  }

  // Backfill missing staffChannelId into request so future checks find it instantly
  request.staffChannelId = channelId;

  const ch = guild.channels.cache.get(channelId);
  if (!ch) {
    console.log(`⚠️ Could not find channel with ID ${channelId} in guild cache.`);
    return;
  }

  try {
    const msg = await ch.messages.fetch(request.staffMessageId);
    if (msg) {
      await msg.edit({
        content: renderCampaignAccountStaffContent(request),
        components: buildCampaignAccountStaffButtons(request.id, request.status)
      });
      console.log(`✅ Successfully updated staff message for request ${request.id}`);
    }
  } catch (error) {
    console.log('Could not update campaign account staff message:', error.message);
  }
}

function makeClipId() {
  return `clip_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function extractLinksFromText(text) {
  return String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function getUserCampaignClips(data, userId, campaignId) {
  if (!data.clips) data.clips = {};

  return Object.values(data.clips).filter(
    clip => clip.userId === userId && clip.campaignId === campaignId
  );
}

async function getTikTokViews(url) {
  return (await fetchClipMetadata({ platform: 'tiktok', url })).views;
}

function getYouTubeVideoId(url) {
  const match = url.match(/(?:shorts\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function getYouTubeViews(url) {
  return (await fetchClipMetadata({ platform: 'youtube', url })).views;
}

async function fetchClipMetadata(clip) {
  const clipUrl = clip.videoUrl || clip.url;
  if (clip.platform === 'instagram') {
    const metadata = await fetchApifyInstagramReelMetadata(clipUrl);
    return {
      views: metadata.views,
      likes: metadata.likes,
      title: metadata.title,
      thumbnailUrl: metadata.thumbnailUrl,
      authorName: metadata.authorUsername,
      authorId: metadata.authorId || null
    };
  }
  if (clip.platform === 'tiktok') {
    const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(clipUrl)}`, { timeout: 15000 });
    const item = res.data?.data || {};
    return {
      views: Number(item.play_count) || 0,
      likes: getFirstFiniteNonNegativeValue([item.digg_count, item.like_count, item.likeCount, item.likes]),
      title: item.title || '',
      thumbnailUrl: item.cover || item.origin_cover || null,
      authorName: item.author?.nickname || item.author?.unique_id || null
    };
  }

  if (clip.platform !== 'youtube') return { views: Number(clip.currentViews) || 0, title: clip.title || '', thumbnailUrl: clip.thumbnailUrl || null, authorName: clip.platformAuthorName || null };
  const videoId = getYouTubeVideoId(clipUrl);
  if (!videoId) return { views: 0, title: '', thumbnailUrl: null, authorName: null };

  const res = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    timeout: 15000,
    params: {
      part: 'statistics,snippet',
      id: videoId,
      key: process.env.YOUTUBE_API_KEY
    }
  });

  const item = res.data?.items?.[0] || {};
  const thumbs = item.snippet?.thumbnails || {};
  return {
    views: Number(item.statistics?.viewCount) || 0,
    likes: getFirstFiniteNonNegativeValue([item.statistics?.likeCount]),
    title: item.snippet?.title || '',
    thumbnailUrl: thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null,
    authorName: item.snippet?.channelTitle || null
  };
}

async function fetchSubmissionMetadata(platform, canonicalUrl, videoId) {
  if (platform === 'instagram') {
    return fetchApifyInstagramReelMetadata(canonicalUrl);
  }

  if (platform === 'tiktok') {
    const response = await axios.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(canonicalUrl)}`,
      { timeout: 15000 }
    );
    const data = response.data?.data;
    if (!data) throw new Error('TikTok video could not be found or is not publicly available.');

    const createdAt = Number(data.create_time);
    const authorUsername = data?.author?.unique_id || data?.author?.uniqueId || data?.author?.username || data?.author_name || null;
    const authorDisplayName = data?.author?.nickname || data?.author?.name || null;
    return {
      authorUsername,
      authorId: data.author?.id || data.author?.uid || null,
      authorDisplayName,
      title: data.title || '',
      views: Number(data.play_count) || 0,
      likes: getFirstFiniteNonNegativeValue([data.digg_count, data.like_count, data.likeCount, data.likes]),
      thumbnailUrl: data.cover || data.origin_cover || null,
      publishedTimestamp: Number.isFinite(createdAt) && createdAt > 0 ? createdAt * 1000 : null
    };
  }

  if (platform === 'youtube') {
    const id = videoId || getYouTubeVideoId(canonicalUrl);
    if (!id) throw new Error('Invalid YouTube video ID.');

    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      timeout: 15000,
      params: { part: 'snippet,statistics', id, key: process.env.YOUTUBE_API_KEY }
    });
    const item = response.data?.items?.[0];
    if (!item) throw new Error('This YouTube video could not be found or is not publicly available.');

    const snippet = item.snippet || {};
    const thumbnails = snippet.thumbnails || {};
    const publishedTimestamp = Date.parse(snippet.publishedAt || '');
    return {
      authorUsername: null,
      authorId: snippet.channelId || null,
      authorDisplayName: snippet.channelTitle || null,
      title: snippet.title || '',
      views: Number(item.statistics?.viewCount) || 0,
      likes: getFirstFiniteNonNegativeValue([item.statistics?.likeCount]),
      thumbnailUrl: thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null,
      publishedTimestamp: Number.isFinite(publishedTimestamp) ? publishedTimestamp : null
    };
  }

  throw new Error('Unsupported social platform.');
}

async function fetchClipViews(clip) {
  if (clip.platform === 'tiktok' || clip.platform === 'youtube' || clip.platform === 'instagram') return (await fetchClipMetadata(clip)).views;
  return clip.rawViews || 0;
}

let trackingRunning = false;
const campaignTrackingLocks = new Map();

async function withCampaignTrackingLock(campaignId, task) {
  const key = String(campaignId || 'unknown');
  const previous = campaignTrackingLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const queued = previous.then(() => current);
  campaignTrackingLocks.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (campaignTrackingLocks.get(key) === queued) campaignTrackingLocks.delete(key);
  }
}

async function autoTrackClipViews() {
  if (trackingRunning) return;
  trackingRunning = true;

  try {
    const data = loadData();
    const guild = client.guilds.cache.first();

    let changed = finalizeExpiredBudgetCycleClips(data);
    changed = finalizeOutOfRunClips(data, Date.now()) || changed;
    const updatedCampaignIds = new Set();
    const updatedPayoutPairs = new Set();
    const approvedClipIds = new Set(Object.entries(data.clips || {})
      .filter(([, clip]) => clip.status === 'approved')
      .map(([clipId]) => clipId));

    for (const [clipId, clip] of Object.entries(data.clipReviews || {})) {
      if (approvedClipIds.has(clipId)) {
        console.warn(`Duplicate clip lifecycle record detected: ${clipId}`);
        continue;
      }
      if (!isTrackableReviewClip(clip) || !isClipTrackingDue(clip)) continue;
      const campaign = CAMPAIGNS[clip.campaignId];
      if (!shouldTrackClip(clip, campaign, data)) continue;
      try {
        await withCampaignTrackingLock(clip.campaignId, async () => {
          if (!shouldTrackClip(clip, campaign, data)) return;
          const metadata = await fetchClipMetadata(clip);
          updatePendingReviewTracking(clip, metadata, data);
          data.clipReviews[clipId] = clip;
          changed = true;
          if (guild) {
            try { await updateClipStaffMessage(guild, clip); }
            catch (error) { console.error(`Could not update pending staff message ${clipId}:`, error.message); }
          }
        });
      } catch (error) {
        recordClipTrackingFailure(clip, error);
        data.clipReviews[clipId] = clip;
        changed = true;
        console.error(`Pending clip tracking failed ${clipId}:`, error.message);
      }
      await delayBetweenPlatformRequests();
    }

    for (const [clipId, clip] of Object.entries(data.clips || {})) {
      if (!isTrackableApprovedClip(clip) || !isClipTrackingDue(clip)) continue;
      const campaign = CAMPAIGNS[clip.campaignId];
      if (!shouldTrackClip(clip, campaign, data)) continue;
      try {
        await withCampaignTrackingLock(clip.campaignId, async () => {
          if (!shouldTrackClip(clip, campaign, data)) return;
          const metadata = await fetchClipMetadata(clip);
          updateApprovedClipTracking(clip, metadata, data);
          data.clips[clipId] = clip;
          changed = true;
          updatedCampaignIds.add(clip.campaignId);
          updatedPayoutPairs.add(`${clip.campaignId}:${clip.userId}`);
          if (guild) {
            try { await updateClipStaffMessage(guild, clip); }
            catch (error) { console.error(`Could not update approved staff message ${clipId}:`, error.message); }
          }
        });
      } catch (error) {
        recordClipTrackingFailure(clip, error);
        data.clips[clipId] = clip;
        changed = true;
        console.error(`Approved clip tracking failed ${clipId}:`, error.message);
      }
      await delayBetweenPlatformRequests();
    }

    if (changed) saveData(data);

    if (guild && updatedCampaignIds.size > 0) {
      for (const campaignId of updatedCampaignIds) {
        try { await updateCampaignPanelMessage(guild, campaignId); }
        catch (error) { console.error(`Could not refresh campaign panel ${campaignId}:`, error.message); }
      }
      try { await updateLeaderboardMessage(guild); }
      catch (error) { console.error('Could not refresh leaderboard:', error.message); }
      try { await updateServerStats(guild); }
      catch (error) { console.error('Could not refresh server counters:', error.message); }
      for (const pair of updatedPayoutPairs) {
        const [campaignId, userId] = pair.split(':');
        try { await syncPayoutCard(guild, campaignId, userId); }
        catch (error) { console.error(`Could not refresh payout card ${pair}:`, error.message); }
      }
    }

    console.log('Auto tracking completed.');
  } catch (err) {
    console.error('❌ Auto tracking failed:', err);
  } finally {
    trackingRunning = false;
  }
}

async function archiveFinishedCampaigns() {

    const data = loadData();

    if (!data.campaignStatus) return;

    const guild = client.guilds.cache.first();

    if (!guild) return;

    for (const [campaignId, state] of Object.entries(data.campaignStatus)) {

        if (state.status !== "finished") continue;

        if (state.archived) continue;

        if (
            Date.now() - state.finishedAt <
            24 * 60 * 60 * 1000
        ) continue;

        const campaign =
            CAMPAIGNS[campaignId];

        if (!campaign) continue;

        try {

            const category =
                guild.channels.cache.get(
                    campaign.categoryId
                );

            if (!category) continue;

            let finishedCategory =
                guild.channels.cache.find(
                    c =>
                        c.type === ChannelType.GuildCategory &&
                        c.name === "📁 Finished Campaigns"
                );

            if (!finishedCategory) {

                finishedCategory =
                    await guild.channels.create({

                        name: "📁 Finished Campaigns",

                        type: ChannelType.GuildCategory

                    });

            }

            const channels =
                guild.channels.cache.filter(
                    c => c.parentId === category.id
                );

            for (const [, channel] of channels) {

                await channel.setParent(
                    finishedCategory.id
                );

                await channel.permissionOverwrites.edit(

                    guild.roles.everyone,

                    {
                        ViewChannel: false
                    }

                );

            }

            await category.delete().catch(() => {});

            state.archived = true;

            console.log(
                `${campaign.name} archived`
            );

        } catch (err) {

            console.error(err);

        }

    }

    saveData(data);

}

async function updateSocialStaffMessage(guild, request) {
  const ch = guild.channels.cache.get(process.env.SOCIAL_STAFF_CHANNEL_ID);
  if (!ch) return;

  try {
    const msg = await ch.messages.fetch(request.staffMessageId);
    await msg.edit({
      content: renderSocialStaffContent(request),
      components: buildSocialStaffButtons(request.id, request.status)
    });
  } catch (error) {
    console.log('Could not update social staff message:', error.message);
  }
}

client.once(Events.ClientReady, async () => {
    
    console.log(`Online as ${client.user.tag}`);
    const instagramConfig = getInstagramConfigurationStatus();
    console.log(instagramConfig.configured
      ? 'Instagram API configuration: ready'
      : `Instagram API configuration missing: ${instagramConfig.missing.join(', ')}`);

    autoTrackClipViews();
    setInterval(autoTrackClipViews, CLIP_TRACK_SCHEDULER_MS);

    archiveFinishedCampaigns();
    setInterval(archiveFinishedCampaigns, 5 * 60 * 1000);
});

// ==========================================
// 🛠️ AUTOMATED STAFF CHANNEL CREATOR
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Command structure: !setupcampaignstaff elephant
    if (!message.content.startsWith('!setupcampaignstaff')) return;

    // Check for administrator permissions
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply("❌ You need Administrator permissions to run this setup command.");
    }

    const args = message.content.split(' ');
    const campaignId = args[1]?.toLowerCase();

    if (!campaignId || !CAMPAIGNS[campaignId]) {
        const available = Object.keys(CAMPAIGNS).join(', ') || 'None';
        return message.reply(`❌ Invalid or missing campaign ID. Available campaigns: \`${available}\``);
    }

    const campaign = CAMPAIGNS[campaignId];
    const statusMsg = await message.reply(`⏳ Generating staff category & review channels for **${campaign.name}**...`);

    try {
        // 1. Create Private Staff Category
        const category = await message.guild.channels.create({
            name: `🔒 ${campaign.name} Staff`,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: message.guild.id, // @everyone role
                    deny: [PermissionFlagsBits.ViewChannel] // Hide from regular members
                }
            ]
        });

        // 2. Create the 4 channel destinations inside the category
        const linkChan = await message.guild.channels.create({
            name: '🔗・link-accounts',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Account linking verification requests for ${campaign.name}`
        });

        const igChan = await message.guild.channels.create({
            name: '📸・ig-clips',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Instagram Reels review queue for ${campaign.name}`
        });

        const ttChan = await message.guild.channels.create({
            name: '🎵・tiktok-clips',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `TikTok clip review queue for ${campaign.name}`
        });

        const ytChan = await message.guild.channels.create({
            name: '📺・yt-clips',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `YouTube Shorts review queue for ${campaign.name}`
        });

        const payChan = await message.guild.channels.create({
            name: '💵・payout-queue',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Payout review queue for ${campaign.name}`
        });

        // 3. Save directly into data.json runtime structure
        const data = loadData();
        if (!data.campaignStaffChannels) data.campaignStaffChannels = {};

        data.campaignStaffChannels[campaignId] = {
            category: category.id,
            linkAccount: linkChan.id,
            instagram: igChan.id,
            tiktok: ttChan.id,
            youtube: ytChan.id,
            payouts: payChan.id,
        };
        saveData(data);

        // 4. Confirm Setup Completion
        await statusMsg.edit({
            content: `✅ **Staff Channels Successfully Created for ${campaign.name}!**\n\n` +
                     `**Category:** <#${category.id}>\n` +
                     `• **Account Linking:** <#${linkChan.id}> (\`${linkChan.id}\`)\n` +
                     `• **Instagram Clips:** <#${igChan.id}> (\`${igChan.id}\`)\n` +
                     `• **TikTok Clips:** <#${ttChan.id}> (\`${ttChan.id}\`)\n` +
                     `• **Payout Queue:** <#${payChan.id}> (\`${payChan.id}\`)\n\n` +
                     `*Channel IDs have been registered automatically to your database!*`
        });

    } catch (err) {
        console.error("⚠️ Failed to generate campaign staff channels:", err);
        await statusMsg.edit(`❌ An error occurred while creating channels: \`${err.message}\``);
    }
});

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    console.log('MESSAGE RECEIVED:', message.content);

    if (message.content === '!monstertest') {
      console.log('monster test triggered');
        
      const response = await fetch(
        'https://monsterlab.io/api/account',
        {
          headers: {
            Authorization: `ApiKey ${MONSTERLAB_API_KEY}`
          }
        }
      );

      console.log('Status:', response.status);

      const text = await response.text();

      console.log('Response:', text);

      await message.reply('Check console for response.');
    }

    if (message.content === '!monstercampaigns') {
      const response = await fetch(
        'https://monsterlab.io/api/clips/campaigns',
        {
          method: 'GET',
          headers: {
            Authorization: `ApiKey ${process.env.MONSTERLAB_API_KEY}`
          }
        }
      );

      console.log('Status:', response.status);

      const text = await response.text();

      console.log(text);

      await message.reply('Check console for campaigns.');
    }

    if (message.content === '!monsterraw') {
      const response = await fetch(
        'https://monsterlab.io/api/clips/campaigns',
        {
          headers: {
            Authorization: `ApiKey ${process.env.MONSTERLAB_API_KEY}`
          }
        }
      );
 
      const data = await response.json();

      console.log(
        JSON.stringify(data, null, 2)
      );

      await message.reply('Printed campaign data to console.');
    }

    if (message.content.trim() === '!ding') {
      await message.reply('✅ Bot can read messages.');
      return;
    }

    if (message.content.trim().toLowerCase() === '!testinstagram') {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You are not allowed to do this.');
        return;
      }

      const configuration = getInstagramConfigurationStatus();
      if (!configuration.configured) {
        await message.reply(`❌ Instagram API configuration missing: ${configuration.missing.join(', ')}`);
        return;
      }

      try {
        const identity = await fetchInstagramTestIdentity();
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Instagram API Connection')
          .addFields(
            { name: 'Status', value: '✅ Connected', inline: true },
            { name: 'Username', value: identity.username ? `@${identity.username}` : 'Not returned', inline: true },
            { name: 'Instagram User ID', value: identity.instagramUserId, inline: true },
            { name: 'Account Type', value: identity.accountType || 'Not returned', inline: true },
            { name: 'API Version', value: INSTAGRAM_API_VERSION, inline: true }
          );
        await message.reply({ embeds: [embed] });
      } catch (error) {
        const details = getInstagramApiErrorDetails(error);
        await message.reply(
          `❌ Instagram API connection failed.\nHTTP Status: ${details.status ?? 'Not available'}\nMeta Error Code: ${details.code ?? 'Not available'}\nMessage: ${details.message}`
        );
      }
      return;
    }

    if (message.content.trim().toLowerCase() === '!testinstagrammedia') {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You are not allowed to do this.');
        return;
      }
      const now = Date.now();
      const lastRun = instagramMediaTestCooldowns.get(message.author.id) || 0;
      if (now - lastRun < 30_000) {
        await message.reply('Please wait before running the Instagram media test again.');
        return;
      }
      instagramMediaTestCooldowns.set(message.author.id, now);
      const loadingMessage = await message.reply('⏳ Testing Instagram media access…');
      try {
        const { identity, media, pagesInspected, partialError } = await fetchInstagramTestMedia(25);
        const reels = media.filter(isInstagramReel).slice(0, 5);
        const classifications = media.map(getInstagramMediaClassification);
        const mediaTypeCounts = classifications.reduce((counts, item) => ({ ...counts, [item.mediaType]: (counts[item.mediaType] || 0) + 1 }), {});
        const productTypeCounts = classifications.reduce((counts, item) => ({ ...counts, [item.productType]: (counts[item.productType] || 0) + 1 }), {});
        const videoItems = media.filter(item => getInstagramMediaClassification(item).mediaType === 'VIDEO');
        const reelPermalinks = media.filter(item => /\/reels?\//i.test(String(item.permalink || ''))).length;
        console.log('[Instagram Media Diagnostic]', { username: identity.username, mediaInspected: media.length, pagesInspected, reelsFound: reels.length, videoItemsFound: videoItems.length, mediaTypeCounts, productTypeCounts });
        if (!reels.length) {
          const summary = `Media inspected: ${media.length}\nPages inspected: ${pagesInspected}\nMedia types: ${Object.entries(mediaTypeCounts).map(([type, count]) => `${type}: ${count}`).join(', ') || 'None'}\nProduct types: ${Object.entries(productTypeCounts).map(([type, count]) => `${type}: ${count}`).join(', ') || 'None'}\nVideo posts found: ${videoItems.length}\nPermalinks containing /reel/: ${reelPermalinks}`;
          if (!videoItems.length) {
            await loadingMessage.edit(`Instagram media access works, but no API-visible video or Reel media was found among the inspected records.\n\n${summary}${partialError ? '\n\nA later page could not be retrieved.' : ''}`);
            return;
          }
          const diagnosticEmbed = new EmbedBuilder().setColor(0xF1C40F).setTitle('Instagram Media API Diagnostic').setDescription(`Instagram media access works, but none of the inspected VIDEO records were identified as Reels.\n\n${summary}${partialError ? '\n\nA later page could not be retrieved.' : ''}`);
          for (const item of videoItems.slice(0, 5)) {
            const classification = getInstagramMediaClassification(item);
            const title = getInstagramMediaTitle(item).replace(/[\[\]\\]/g, '\\$&');
            const pathType = /\/reels?\//i.test(String(item.permalink || '')) ? 'Reel' : String(item.permalink || '').includes('/p/') ? 'Post' : 'Unknown';
            diagnosticEmbed.addFields({ name: title, value: `${item.permalink ? `[Open Media](${item.permalink})\n` : ''}Media ID: ${item.id}\nMedia Type: ${classification.mediaType}\nProduct Type: ${classification.productType}\nPermalink Path: ${pathType}\nTimestamp: ${item.timestamp || 'Not returned'}`.slice(0, 1024) });
          }
          await loadingMessage.edit({ content: null, embeds: [diagnosticEmbed] });
          return;
          await loadingMessage.edit('✅ Instagram media access works, but no recent Reels were found in the first 10 media items.');
          return;
        }

        const tested = [];
        for (const reel of reels) {
          const insights = await fetchInstagramTestMediaInsights(reel);
          tested.push({ reel, insights });
          for (const insightError of insights.errors) {
            console.warn('[Instagram Media Insight Test]', { mediaId: reel.id, metric: insightError.metric, status: insightError.status, code: insightError.code, message: insightError.message });
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        const insightSuccesses = tested.filter(item => item.insights.views !== null).length;
        const insightFailures = tested.length - insightSuccesses;
        console.log('[Instagram Media Test]', { username: identity.username, mediaFound: media.length, reelsFound: media.filter(isInstagramReel).length, reelsTested: tested.length, insightSuccesses, insightFailures });
        if (!insightSuccesses) {
          await loadingMessage.edit('⚠️ Instagram media access works, but the API did not return a supported views or plays metric for the tested Reels.');
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Instagram Media API Test')
          .setDescription(`**Status:** ✅ Media retrieved\n**Account:** @${identity.username || 'Unknown'}\n**Recent Media Found:** ${media.length}\n**Reels Found:** ${media.filter(isInstagramReel).length}\n**Reels Tested:** ${tested.length}\n**Successful insight checks:** ${insightSuccesses}\n**Unavailable or failed:** ${insightFailures}`);
        for (const { reel, insights } of tested) {
          const title = getInstagramMediaTitle(reel).replace(/[\[\]\\]/g, '\\$&');
          const metric = insights.metrics.views !== undefined ? 'views' : insights.metrics.plays !== undefined ? 'plays' : 'none';
          const published = reel.timestamp ? new Date(reel.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not returned';
          embed.addFields({ name: title, value: `${reel.permalink ? `[Open Reel](${reel.permalink})\n` : ''}Media ID: ${reel.id}\nPublished: ${published}\nViews: ${insights.views === null ? 'Not available' : insights.views.toLocaleString()}\nMetric: ${metric}`.slice(0, 1024) });
        }
        const thumbnail = tested.map(item => item.reel.thumbnail_url || item.reel.media_url).find(url => /^https:\/\//i.test(url || ''));
        if (thumbnail) embed.setThumbnail(thumbnail);
        await loadingMessage.edit({ content: null, embeds: [embed] });
      } catch (error) {
        const details = error.instagramApiError || getInstagramApiErrorDetails(error);
        await loadingMessage.edit(`❌ Instagram media retrieval failed.\nHTTP Status: ${details.status ?? 'Not available'}\nMeta Error Code: ${details.code ?? 'Not available'}\nMessage: ${details.message || error.message}`);
      }
      return;
    }

    if (message.content.trim().toLowerCase().startsWith('!testapifyinstagram')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You are not allowed to do this.');
        return;
      }

      const reelInput = message.content.trim().replace(/^!testapifyinstagram\b/i, '').trim();
      const parsedReel = parsePublicInstagramReelUrl(reelInput);
      if (!parsedReel) {
        await message.reply('❌ Provide one public Instagram Reel URL, for example: `!testapifyinstagram https://www.instagram.com/reel/ABC123/`');
        return;
      }

      const now = Date.now();
      const lastRun = apifyInstagramTestCooldowns.get(message.author.id) || 0;
      if (now - lastRun < 30_000) {
        await message.reply('Please wait before running the Apify Instagram test again.');
        return;
      }
      apifyInstagramTestCooldowns.set(message.author.id, now);

      const loadingMessage = await message.reply('⏳ Retrieving public Instagram Reel metadata through Apify…');
      try {
        const items = await fetchInstagramPublicReelMetadata(parsedReel.canonicalUrl);
        const matchingItem = items.find(item => {
          const itemUrl = parsePublicInstagramReelUrl(item?.inputUrl || item?.reelUrl || item?.url || item?.permalink);
          return itemUrl?.shortcode === parsedReel.shortcode || String(item?.shortcode || item?.shortCode || '') === parsedReel.shortcode;
        }) || items[0];

        if (!matchingItem) throw new Error('Instagram Reel data could not be retrieved.');
        const diagnostics = getSafeApifyInstagramDiagnostics(matchingItem);
        if (process.env.DEBUG_APIFY_INSTAGRAM === 'true') {
          console.log('[Apify Instagram Fields]', Object.keys(matchingItem || {}));
          console.log('[Apify Instagram Metric Diagnostics]', diagnostics);
        }

        const reel = normalizeApifyInstagramReel(matchingItem, parsedReel.canonicalUrl);
        if (process.env.DEBUG_APIFY_INSTAGRAM === 'true') {
          console.log('[Apify Instagram Normalized]', {
            shortcode: reel.shortcode,
            username: reel.username,
            views: reel.views,
            source: reel.source
          });
        }

        const safeTitle = reel.title.replace(/[\\[\]]/g, '\\$&');
        const published = reel.publishedTimestamp
          ? new Date(reel.publishedTimestamp).toLocaleString()
          : 'Unknown';
        const diagnosticLines = Object.entries(diagnostics)
          .slice(0, 15)
          .map(([field, value]) => `${field}: ${String(value)}`);
        const diagnosticChunks = [];
        let diagnosticChunk = '';
        for (const line of diagnosticLines) {
          const nextChunk = diagnosticChunk ? `${diagnosticChunk}\n${line}` : line;
          if (nextChunk.length > 1000 && diagnosticChunk) {
            diagnosticChunks.push(diagnosticChunk);
            diagnosticChunk = line;
          } else {
            diagnosticChunk = nextChunk;
          }
        }
        if (diagnosticChunk) diagnosticChunks.push(diagnosticChunk);
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Apify Instagram Reel Test')
          .setDescription(`[${safeTitle}](${reel.url})`)
          .addFields(
            { name: 'Status', value: '✅ Reel retrieved', inline: true },
            { name: 'Owner', value: `@${reel.username}`, inline: true },
            { name: 'Views', value: reel.views === null ? 'Not available' : reel.views.toLocaleString(), inline: true },
            { name: 'View field', value: reel.viewMetricField || 'Not available', inline: true },
            { name: 'Likes', value: reel.likes === null ? 'Not available' : reel.likes.toLocaleString(), inline: true },
            { name: 'Comments', value: reel.comments === null ? 'Not available' : reel.comments.toLocaleString(), inline: true },
            { name: 'Published', value: published, inline: true },
            { name: 'Source', value: 'Apify', inline: true },
            { name: 'Potential view/count fields', value: diagnosticChunks.shift() || 'No safe candidate metrics returned.' }
          );
        if (reel.thumbnailUrl) embed.setThumbnail(reel.thumbnailUrl);
        await loadingMessage.edit({ content: null, embeds: [embed] });
        if (diagnosticChunks.length) {
          await message.reply({
            embeds: [new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('Apify Instagram Reel Test — Additional Diagnostics')
              .setDescription(diagnosticChunks.join('\n\n'))]
          });
        }
      } catch (error) {
        const messageText = error?.apifyInstagramError?.message || error?.message || 'Instagram Reel data could not be retrieved.';
        await loadingMessage.edit(`❌ ${messageText}`);
      }
      return;
    }
  
    if (message.content.trim().toLowerCase() === '!ticketpanel') {
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('<:whiteCE:1504904179905200148> Support Center')
        .setDescription(
          'Need help with campaigns, payments, submissions, or account issues?\n\nOpen a support ticket below.⬇️'
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_ticket')
          .setLabel('Open Ticket')
          .setEmoji('✉️')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    if (message.content.trim().toLowerCase() === '!proxypanel') {
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('<:whiteCE:1504904179905200148> Premium Residential Proxies')
        .setDescription(
          `Looking for clean, high-performance proxies for automated posting, scraping, or multi-accounting?\n\n` +
          `💰 **Pricing:** \`$${PRICE_PER_PROXY}\` per proxy\n` +
          `🌍 **Locations:** US, UK, DE, NG and more\n` +
          `🔥 **Optimization:** TikTok, Instagram, YouTube and automation workflows`
        )
        .setFooter({
          text: 'Creators Elite Proxy Network'
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('buy_proxy_trigger')
          .setLabel('Buy Proxy')
          .setEmoji('🛒')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });
      
      return;
    }

    if (message.content === '!monstercampaigns') {

      const data = loadData();

      const campaigns =
        Object.values(data.monsterCampaigns || {});

      return message.reply(
        campaigns
          .map(c => c.name)
          .join('\n')
      );
    }

    if (message.content === '!leaderboard') {
      const data = loadData();
      const leaderboard = buildLeaderboardEmbed(message.guild, data, 1, 10);

      await message.channel.send({
        embeds: [leaderboard.embed],
        components: buildLeaderboardButtons(leaderboard.page, leaderboard.totalPages)
      });

      return;
    }

    if (message.content.startsWith('!addviews')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const mentionedUser = message.mentions.users.first();
      const views = Number(args[2]);

      if (!mentionedUser || Number.isNaN(views)) {
        await message.reply('❌ Usage: `!addviews @user 50000`');
        return;
      }

      const member = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
      if (!member) {
        await message.reply('❌ User not found in server.');
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, member);
      userRecord.stats.totalViews += views;
      saveData(data);

      await message.reply(`✅ Added **${views}** views to <@${mentionedUser.id}>.`);
      return;
    }

    if (message.content.startsWith('!approveclip')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const mentionedUser = message.mentions.users.first();
      const views = Number(args[2]);
      const amount = Number(args[3]);

      if (!mentionedUser || Number.isNaN(views) || Number.isNaN(amount)) {
        await message.reply('❌ Usage: `!approveclip @user 50000 80`');
        return;
      }

      const member = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
      if (!member) {
        await message.reply('❌ User not found in server.');
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, member);

      userRecord.stats.videosPosted += 1;
      userRecord.stats.videosApproved += 1;
      userRecord.stats.totalViews += views;
      userRecord.stats.moneyMade += amount;

      saveData(data);

      await message.reply(
        `✅ Approved clip for <@${mentionedUser.id}>.\nViews added: **${views}**\nMoney added: **$${amount}**`
      );
      return;
    }

    if (message.content.startsWith('!rejectclip')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const mentionedUser = message.mentions.users.first();

      if (!mentionedUser) {
        await message.reply('❌ Usage: `!rejectclip @user`');
        return;
      }

      const member = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
      if (!member) {
        await message.reply('❌ User not found in server.');
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, member);

      userRecord.stats.videosPosted += 1;
      userRecord.stats.videosRejected += 1;

      saveData(data);

      await message.reply(`❌ Rejected clip for <@${mentionedUser.id}>.`);
      return;
    }

    if (message.content.trim() === '!demographicspanel') {
      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('🌍 Demographics Verification')
        .setDescription(
          `Upload your screen recording demographics proof.\n\n` +
          `Click below to begin.`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('demographics_start')
          .setLabel('Upload Demographics')
          .setEmoji('🌍')
          .setStyle(ButtonStyle.Primary)
      );
 
      await message.channel.send({ embeds: [embed], components: [row] });
      return;
    }

    if (message.content.startsWith('!fixcampaignaccount')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const mentionedUser = message.mentions.users.first();
      const campaignId = args[2];
      const platform = args[3];
      const username = args[4];

      if (!mentionedUser || !campaignId || !platform || !username) {
        await message.reply('❌ Usage: `!fixcampaignaccount @user emoney_shopping tiktok Dijanobs7rq`');
        return;
      }

      const member = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
      if (!member) {
        await message.reply('❌ User not found in server.');
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, member);

      ensureCampaignAccount(userRecord, campaignId, platform, username);
      ensureCampaignPlatformStats(userRecord, campaignId, platform, username);
   
      if (!userRecord.campaigns.includes(campaignId)) {
        userRecord.campaigns.push(campaignId);
      }
 
      saveData(data);

      await message.reply(
        `✅ Fixed campaign account for <@${mentionedUser.id}> in **${campaignId}** on **${platform}**.`
      );
      return;
    }

    if (message.content.trim() === '!accountpanel') {
      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('Manage Your All-Time Stats')
        .setDescription(
          `📈 **Analytics**\nView your earnings and performance metrics\n\n` +
          `<:usdt1:1504872188317012098> **Payment Details**\nAdd your Binance or Bybit ID\n\n` +
          `💸 **Payouts**\nTrack your payment history and USDT payout info\n\n` +
          `👥 **Social Accounts**\nConnect and manage your social media accounts\n\n` +
          `<:whiteCE:1504904179905200148> Powered by Creators Elite`
        );

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('account_analytics')
            .setLabel('Analytics')
            .setEmoji('📈')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('payment_details')
            .setLabel('Payment Details')
            .setEmoji('<:usdt1:1504872188317012098>')
            .setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('account_payouts')
            .setLabel('Payouts')
            .setEmoji('💸')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setLabel('Social Accounts')
            .setEmoji('👥')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${message.guild.id}/${CONNECT_ACCOUNTS_CHANNEL_ID}`)
        );

        await message.channel.send({
          embeds: [embed],
          components: [row1, row2]
        });

        return;
    }

    if (message.content.startsWith('!campaignconnectpanel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await message.reply(
          `❌ Usage: !campaignconnectpanel campaign_id\nAvailable campaigns: ${Object.keys(CAMPAIGNS).join(', ')}`
        );
        return;
      }

      await message.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle(`${campaign.name} - Connect Accounts`)
        .setDescription(
          `Use the buttons below to manage your campaign accounts for **${campaign.name.replace(/<a?:\w+:\d+>/g, '').trim()}**.\n\n` +
          `➕ **Link Account**\nAdd and verify an account for this campaign.\n\n` +
          `➖ **Remove Account**\nRemove a campaign account.\n\n` +
          `🌐 **View Accounts**\nView accounts added to this campaign.\n\n` +
          `<:whiteCE:1504904179905200148> **Powered by Creators Elite**`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_connect_link:${campaignId}`)
          .setLabel('➕Link Account')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`campaign_connect_remove:${campaignId}`)
          .setLabel('➖Remove Account')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`campaign_connect_view:${campaignId}`)
          .setLabel('🌐View Accounts')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    if (message.content.startsWith('!submitpanel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await message.reply(
          `❌ Usage: !submitpanel campaign_id\nAvailable campaigns: ${Object.keys(CAMPAIGNS).join(', ')}`
        );
        return;
      }

      await message.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle(campaign.name)
        .setDescription(
          `Track Your Campaign Clips\n\n` +
          `Use the buttons below to manage your account for **${campaign.name.replace(/<a?:\w+:\d+>/g, '').trim()}** campaign.\n\n` +
          `⬆️ **Submit Clip**\nSubmit your clips manually for campaign tracking.\n\n` +
          `👥 **My Stats**\nCheck your total stats, clips and payout.\n\n` +
          `🗑️ **Remove Clip**\nRemove one or more clips for campaign tracking.\n\n` +
          `⚙️ **Manage Account**\nEdit and manage your clipper account.\n\n` +
          `⚠️ **Leave Campaign**\nLeave this campaign.\n\n` +
          `<:whiteCE:1504904179905200148> **Powered by Creators Elite**`
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`submit_clip:${campaignId}`)
          .setLabel('⬆️Submit Clip')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`campaign_stats:${campaignId}`)
          .setLabel('👥My Stats')
          .setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`remove_clip:${campaignId}`)
          .setLabel('🗑️Remove Clip')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`manage_account:${campaignId}`)
          .setLabel('⚙️Manage Account')
          .setStyle(ButtonStyle.Secondary)
      );   

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`leave_campaign:${campaignId}`)
          .setLabel('Leave Campaign')
          .setEmoji('1504774239679676416')
          .setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row1, row2, row3]
      });

      return;
    } 

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
          .setStyle(ButtonStyle.Success)
      );

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('Welcome to Verification!')
        .setDescription(
          'This server requires you to verify yourself to get access to other channels.\n\nYou can simply verify by clicking on the **Verify** button below.'
        )
        .setImage('https://cdn.discordapp.com/attachments/1492952587224354947/1495526570230546502/copy_3A941843-8993-470E-ACAC-3C7BCBC89E90.jpg?ex=69e69127&is=69e53fa7&hm=bf601d27e93a82fe86f7b9377683c5ad9ab8dd5034a9fc1d3fa40027f35c8e0e&')
        .setFooter({ text: 'Creators Elite Security' });

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    if (message.content.trim().toLowerCase().startsWith('!staffpanel')) {

        if (!isAdmin(message.member)) {
            await message.reply('❌ Admin only.');
            return;
        }

        const args = message.content.trim().split(/\s+/);
        const campaignId = args[1];

        if (!campaignId || !CAMPAIGNS[campaignId]) {
            await message.reply('❌ Invalid campaign.');
            return;
        }

        const campaign = CAMPAIGNS[campaignId];

        const row = new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId(`finish_campaign:${campaign.id}`)
              .setLabel('Finish Campaign')
              .setEmoji('🏁')
              .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
              .setCustomId(`reopen_campaign:${campaign.id}`)
              .setLabel('Reopen Campaign')
              .setEmoji('🔄')
              .setStyle(ButtonStyle.Success)

        );

        const channel =
            client.channels.cache.get(STAFF_CONTROL_CHANNEL_ID);

        await channel.send({

            content:
    `## ${campaignName}

    Staff Controls`,

            components: [row]

        });

        await message.reply('✅ Staff panel created.');

        return;
    }

    
    if (message.content.trim().toLowerCase().startsWith('!panel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];

      if (!campaignId || !CAMPAIGNS[campaignId]) {
        await message.reply(
          `❌ Usage: \`!panel campaign_id\`\nAvailable campaigns: ${Object.keys(CAMPAIGNS).join(', ')}`
        );
        return;
      }

      const campaign = CAMPAIGNS[campaignId];

      const panelData = loadData();
      const totals = getCampaignTotals(panelData, campaign.id);

      const cappedViews = Math.min(totals.views, campaign.viewCap || totals.views);
      const payout = (cappedViews / 1000000) * (campaign.ratePerMillion || 0);

      const fulfilledPercent = campaign.campaignBudget
        ? ((payout / campaign.campaignBudget) * 100).toFixed(1)
        : '0.0';

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_campaign:${campaign.id}`)
          .setLabel('Join Campaign')
          .setEmoji('<a:flyin:1506234392920723546>')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`campaign_status:${campaign.id}`)
          .setLabel('Campaign Status')
          .setEmoji('<a:chart1:1504773558415523931>')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`campaign_fulfilled:${campaign.id}`)
          .setLabel(`Fulfilled: ${fulfilledPercent}%`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<a:Loadin:1506234461459714100>')
          .setDisabled(true)
      );

      try {
        await message.delete().catch(() => {});

        await message.channel.send({
          content: campaign.panelText,
          components: [row]
        });

        console.log(`Panel sent for ${campaignId}`);
      } catch (err) {
        console.error('PANEL SEND ERROR:', err);
        await message.reply(`❌ Panel send error: ${err.message}`);
    }

    return;
  }
  } catch (error) {
    console.error('MessageCreate error:', error);
  }
});

async function updateClipStaffMessage(guild, clip) {
    if (!guild || !clip) return;

    if (!clip.staffChannelId || !clip.staffMessageId) {
        console.warn(`Missing staff message reference for clip ${clip.id}`);
        return;
    }

    const ch = guild.channels.cache.get(clip.staffChannelId);
    if (!ch) {
        console.warn(`Could not locate staff channel for clip ${clip.id}`);
        return;
    }

    try {
        const msg = await ch.messages.fetch(clip.staffMessageId);
        if (msg) {
            await msg.edit({
                embeds: [buildClipStaffEmbed(clip)],
                components: buildClipStaffButtons(clip)
            });
            console.log(`✅ Updated staff message for clip ${clip.id}`);
        }
    } catch (error) {
        console.warn(`Could not update clip staff message ${clip.id}:`, error.message);
    }
}

client.on('guildMemberAdd', async (member) => {
  // Replace with your actual Main Server ID
  if (member.guild.id !== '1413113505565118524') return; 

  const data = loadData();
  const userToken = data.oauthTokens?.[member.id];

  if (!userToken) {
    console.log(`ℹ️ User ${member.user.tag} joined but has not completed OAuth authorization.`);
    return;
  }

  try {
    // Replace with your actual Secondary/Backup Server ID
    await axios.put(
      `https://discord.com/api/v10/guilds/1348583895007760415/members/${member.id}`,
      { access_token: userToken },
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN || process.env.TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Automatically added ${member.user.tag} to the backup server!`);
  } catch (error) {
    console.error(`❌ Failed to background-join user:`, error.response?.data || error.message);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('leaderboard_prev:')) {
      const currentPage = Number(interaction.customId.split(':')[1]);
      const newPage = currentPage - 1;

      const data = loadData();
      const leaderboard = buildLeaderboardEmbed(interaction.guild, data, newPage, 10);

      await interaction.update({
        embeds: [leaderboard.embed],
        components: buildLeaderboardButtons(leaderboard.page, leaderboard.totalPages)
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('leaderboard_next:')) {
      const currentPage = Number(interaction.customId.split(':')[1]);
      const newPage = currentPage + 1;

      const data = loadData();
      const leaderboard = buildLeaderboardEmbed(interaction.guild, data, newPage, 10);

      await interaction.update({
        embeds: [leaderboard.embed],
        components: buildLeaderboardButtons(leaderboard.page, leaderboard.totalPages)
      });

      return;
    }
     
    if (interaction.isButton() && interaction.customId === 'view_your_clips') {
      await interaction.reply({
        content: '📂 Clip history is not connected yet. This button will show all your submitted clips once clip tracking is added.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'open_ticket') {
      try {
        const userId = interaction.user.id;

        if (!STAFF_ROLE_ID) {
          await interaction.reply({ content: '❌ STAFF_ROLE_ID is missing.', flags: MessageFlags.Ephemeral });
          return;
        }

        if (!TICKET_CATEGORY_ID) {
          await interaction.reply({ content: '❌ TICKET_CATEGORY_ID is missing.',  flags: MessageFlags.Ephemeral });
          return;
        }

        const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
        if (!category) {
          await interaction.reply({ content: '❌ Ticket category not found. Check TICKET_CATEGORY_ID.', flags: MessageFlags.Ephemeral });
          return;
        }

        const existingTicket = interaction.guild.channels.cache.find(
          ch =>
            ch.name === `ticket-${interaction.user.username.toLowerCase()}` &&
            ch.parentId === TICKET_CATEGORY_ID
        ); 

        if (existingTicket) {
          await interaction.reply({
            content: `❌ You already have an open ticket: ${existingTicket}`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`.toLowerCase(),
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY_ID,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels
              ]
            },
            {
              id: userId,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory              
              ]
            },
            {
              id: STAFF_ROLE_ID,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            }
          ]
        });

        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setDescription(
            `🎫 Welcome ${interaction.user}. Staff will be with you shortly.\n\n` + 
            `To close this press the close button.`
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('🔒Close')
            .setStyle(ButtonStyle.Secondary)
        );

        await channel.send({
          embeds:[embed],
          components: [row]
        });

        await sendTicketLog(interaction.guild, {
          user: interaction.user,
          ticketName: channel.name,
          action: 'Created',
          panel: 'Support',
          color: 0x57F287
        });

        await interaction.reply({
          content: `✅ Ticket created: ${channel}`,
          flags: MessageFlags.Ephemeral
        });

        return;
      } catch (err) {
        console.error('OPEN TICKET ERROR:', err);

        await interaction.reply({
          content: `❌ Ticket error: ${err.message}`,
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return;
      }
    }    

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_close_ticket')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId('cancel_close_ticket')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: 'Are you sure you would like to close this ticket?',
        components: [row]
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'cancel_close_ticket') {
      await interaction.update({
        content: '✅ Ticket close cancelled.',
        components: []
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'confirm_close_ticket') {
      await interaction.update({
        content: `Ticket closed by ${interaction.user}`,
        components: []
      });

      await interaction.channel.setName(
        interaction.channel.name.replace('ticket-', 'closed-')
      ).catch(() => {});

      const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_transcript')
          .setLabel('Transcript')
          .setEmoji('📑')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('reopen_ticket')
          .setLabel('Open')
          .setEmoji('🔓')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('delete_ticket')
          .setLabel('Delete')
          .setEmoji('⛔')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({
        content: 'Support team ticket controls',
        components: [controls]
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'reopen_ticket') {
      await interaction.channel.setName(
        interaction.channel.name.replace('closed-', 'ticket-')
      ).catch(() => {});

      await interaction.reply({
        content: `🔓 Ticket reopened by ${interaction.user}.`
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'delete_ticket') {
      await interaction.reply({
        content: '🗑 Deleting ticket in 5 seconds...'
      });

      await sendTicketLog(interaction.guild, {
        user: interaction.user,
        ticketName: interaction.channel.name,
        action: 'Deleted',
        panel: 'Support',
        color: 0xED4245
      });

      setTimeout(async () => {
        await interaction.channel.delete().catch(() => {});
      }, 5000);

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("payout_resolve_issue:")) {
        const trackerId = interaction.customId.split(':')[1];
        const data = loadData();
        const tracker = data.payoutTrackers?.[trackerId];
        const campaign = CAMPAIGNS[tracker?.campaignId];
        if (!tracker || !campaign) return interaction.reply({ content: 'Payout tracker not found.', flags: MessageFlags.Ephemeral });
        tracker.issueReason = null;
        tracker.issueAt = null;
        tracker.status = tracker.currentUnpaidViews === 0 ? 'paid' : tracker.currentUnpaidViews >= campaign.payoutThreshold ? 'ready' : 'waiting';
        tracker.updatedAt = Date.now();
        savePayoutTracker(tracker);
        await syncPayoutCard(interaction.guild, tracker.campaignId, tracker.userId);
        return interaction.reply({ content: 'Payout issue resolved.', flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && interaction.customId.startsWith("payout_refresh:")) {
        const trackerId = interaction.customId.split(':')[1];
        const data = loadData();
        const tracker = data.payoutTrackers?.[trackerId];

        if (!tracker) {
            return interaction.reply({ content: 'Payout tracker not found.', flags: MessageFlags.Ephemeral });
        }

        await syncPayoutCard(interaction.guild, tracker.campaignId, tracker.userId);
        await interaction.reply({ content: 'Payout tracker refreshed.', flags: MessageFlags.Ephemeral });
        return;
    }

    if (interaction.customId.startsWith("pay:")) {

        const payoutId = interaction.customId.split(":")[1];

        const data = loadData();

        const payout = data.payoutTrackers?.[payoutId];

        if (!payout) {
            return interaction.reply({
                content: "❌ Payout request not found.",
                flags: MessageFlags.Ephemeral
            });
        }

        const campaignId = payout.campaignId;
        const userId = payout.userId;

        const campaign = CAMPAIGNS[campaignId];
        const guild = interaction.guild;
        const userRecord = data.users?.[userId];
        const exchange = userRecord?.paymentDetails?.exchange;
        const paymentLabel = exchange
            ? `${exchange.charAt(0).toUpperCase()}${exchange.slice(1)} ID`
            : "Payment ID";
        const paymentValue = userRecord?.paymentDetails?.paymentId || "Not Set";

        if (!campaign) {
            return interaction.reply({
                content: "❌ Campaign not found.",
                flags: MessageFlags.Ephemeral
            });
        }

        calculateTrackerStats(payout);
        if (payout.status !== "ready") {
            return interaction.reply({
                content: "❌ This creator has not reached the payout threshold yet.",
                flags: MessageFlags.Ephemeral
            });
        }

        const approvedClips = Object.values(data.clips).filter(c =>
            String(c.userId) === String(userId) &&
            String(c.campaignId) === String(campaignId) &&
            isPayoutEligibleClip(c)
        );

        let paidViews = 0;
        let paidMoney = 0;

        approvedClips.forEach(clip => {

            if (!clip.payout) {
                clip.payout = {
                    paidViews: 0,
                    paidMoney: 0,
                    history: []
                };
            }

            const newViews = Math.max(
                getApprovedClipViews(clip) - (Number(clip.payout.paidViews) || 0),
                0
            );

            if (newViews <= 0) return;

            const money =
                newViews / 1000000 *
                campaign.ratePerMillion;

            clip.payout.history.push({
                date: new Date().toISOString(),
                views: newViews,
                amount: money
            });

            clip.payout.paidViews += newViews;
            clip.payout.paidMoney += money;

            paidViews += newViews;
            paidMoney += money;

        });

        payout.status = "paid";
        payout.paidAt = Date.now();
        payout.paidViews = paidViews;
        payout.paidMoney = paidMoney;
        payout.lifetimePaid = (Number(payout.lifetimePaid) || 0) + paidMoney;
        payout.currentUnpaidViews = 0;
        payout.currentUnpaidMoney = 0;
        payout.lastPaidAt = Date.now();
        payout.updatedAt = Date.now();
 
        saveData(data);

        try {

            const member = await interaction.guild.members.fetch(userId);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel("Share Payment Result")
                        .setEmoji('📸')
                        .setURL("https://discord.com/channels/1413113505565118524/1533850271292199143")
                );

            const dmEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setAuthor({
                    name: `${campaign.name}`,
                    iconURL: guild.iconURL()
                })
                .setTitle("<a:flyin:1506234392920723546> You just got paid!")
                .setDescription(
            `Thanks for participating in **${campaign.name}**.

            Your payment has been successfully processed and sent to your **${paymentLabel.replace(" ID","")}** account.

            <a:chart1:1504773558415523931> **Views Paid**
            ${formatNumber(paidViews)}

            <a:Cash1:1504871843419521115> **Amount Paid**
            **$${paidMoney.toFixed(2)}**

            🏦 **Destination**
            \`${paymentValue}\`

            🗓️ **Payment Date**
            <t:${Math.floor(Date.now()/1000)}:F>

            <a:warning:1504774411280973864> Notes
            Network fees may apply depending on your exchange or wallet.`
                )
                .setFooter({
                    text: "Creators Elite • Thank you for clipping ❤️",
                    iconURL: "https://cdn.discordapp.com/emojis/1504904179905200148.png"
                })
                .setTimestamp();
 
            await member.send({
                embeds: [dmEmbed],
                components: [row]
            });

        } catch (err) {

            console.error("❌ OUTER ERROR");
            console.error(err);

        }

        await syncPayoutCard(interaction.guild, campaignId, userId);

        await interaction.reply({
            content: 'Payment recorded and payout tracker refreshed.',
            flags: MessageFlags.Ephemeral
        });
        return;

   }

   if (interaction.customId.startsWith("issue:")) {

       const payoutId = interaction.customId.split(":")[1];

       const data = loadData();

       const payout = data.payoutTrackers?.[payoutId];

       if (!payout) {
           return interaction.reply({
               content: "❌ Payout request not found.",
               flags: MessageFlags.Ephemeral
           });
       }

       await interaction.showModal(

           new ModalBuilder()
               .setCustomId(`issue_modal:${payoutId}`)
               .setTitle("Payment Issue")
               .addComponents(

                   new ActionRowBuilder().addComponents(

                       new TextInputBuilder()
                           .setCustomId("reason")
                           .setLabel("Reason")
                           .setStyle(TextInputStyle.Paragraph)
                           .setRequired(true)

                   )

               )

       );

   }

   if (
       interaction.isModalSubmit() &&
       interaction.customId.startsWith("issue_modal:")
   ) {

       const payoutId = interaction.customId.split(":")[1];

       const data = loadData();

       const payout = data.payoutTrackers?.[payoutId];

       if (!payout) {
           return interaction.reply({
               content: "❌ Payout request not found.",
               flags: MessageFlags.Ephemeral
           });
       }

       const campaignId = payout.campaignId;
       const userId = payout.userId;

       const campaign = CAMPAIGNS[campaignId];
       const user = data.users?.[userId];
       const exchange = user?.paymentDetails?.exchange;
       const paymentLabel = exchange
           ? `${exchange.charAt(0).toUpperCase()}${exchange.slice(1)} ID`
           : 'Payment ID';
       const paymentValue = user?.paymentDetails?.paymentId || 'Not Set';
       const unpaidViews = Number(payout.currentUnpaidViews) || 0;
       const unpaidMoney = Number(payout.currentUnpaidMoney) || 0;

       const reason = interaction.fields.getTextInputValue("reason");

       payout.status = "issue";
       payout.issueReason = reason;
       payout.issueAt = Date.now();
       payout.currentUnpaidViews = Number(payout.currentUnpaidViews) || 0;
       payout.currentUnpaidMoney = Number(payout.currentUnpaidMoney) || 0;
       payout.lastIssueAt = Date.now();
       payout.updatedAt = Date.now();

       saveData(data);

       // DM creator
       try {

           const member = await interaction.guild.members.fetch(userId);

           const issueEmbed = new EmbedBuilder()
    .setColor(0xF39C12)
    .setTitle(`<a:warning:1504774411280973864> Payment Issue With Your ${paymentLabel.replace(" ID","")} Account`)
    .setDescription(
`Your payment for the **${campaign.name}** campaign could not be completed.

This issue is related to your **${paymentLabel.replace(" ID","")}** account rather than the Creators Elite payment system.

<a:chart1:1504773558415523931> **Views Affected**
${formatNumber(unpaidViews)}

<a:Cash1:1504871843419521115> **Expected Payout**
**$${unpaidMoney.toFixed(2)}**

🏦 **${paymentLabel}**
\`${paymentValue}\`

### Reason
${reason}

### What to do next

1. Verify that your **${paymentLabel.replace(" ID","")}** account details are correct.
2. Update your payment ID if necessary.
3. Once resolved, open a ticket in <#1492888887452762313>.

> Your payout has **NOT** been lost. It will remain pending until the issue is resolved.`
    )
    .setFooter({
        text: "Creators Elite • Thank you for clipping ❤️",
        iconURL: "https://cdn.discordapp.com/emojis/1504904179905200148.png"
    })
    .setTimestamp();

           await member.send({ embeds: [issueEmbed] });

       } catch (err) {
           console.log("Couldn't DM user.");
       }

       await syncPayoutCard(interaction.guild, campaignId, userId);

       await interaction.reply({
           content: 'Payout issue recorded and tracker refreshed.',
           flags: MessageFlags.Ephemeral
       });
       return;

   }

   if (interaction.isButton() && interaction.customId === 'account_analytics') {
      const data = loadData();
      const member = interaction.member;
      const userRecord = ensureUser(data, member);

      const hiddenName = userRecord.hideFromLeaderboard ? 'Hidden' : interaction.user.username;

      // 1. DYNAMICALLY FETCH REAL-TIME LEADERBOARD RANK
      const currentRank = getUserRank(data, interaction.user.id);
      const rankString = currentRank ? `#${currentRank}` : 'Unranked';

      // Use the same canonical records and accounting as the leaderboard and
      // campaign overview. Rejected clips remain in clipReviews, so looking at
      // data.clips alone made the denied count permanently read as zero.
      const userClipRecords = Object.values(data.clips || {}).filter(
        clip => String(clip.userId) === String(interaction.user.id)
      );
      const userReviewRecords = Object.values(data.clipReviews || {}).filter(
        clip => String(clip.userId) === String(interaction.user.id)
      );
      const statusRecords = getUniqueClipRecords(
        [...userReviewRecords, ...userClipRecords],
        { scope: 'account_analytics_status_counts', userId: interaction.user.id }
      );
      const approvedCount = statusRecords.filter(clip => clip.status === 'approved').length;
      const rejectedCount = statusRecords.filter(clip => clip.status === 'rejected').length;

      const liveTotalViews = getUserAllTimeCreditedViews(data, interaction.user.id);
      const liveTotalEarned = Object.values(CAMPAIGNS).reduce((total, campaign) => {
        const campaignClips = userClipRecords.filter(
          clip => String(clip.campaignId) === String(campaign.id)
        );
        const accounting = calculateClipCollectionAccounting(campaignClips, campaign, {
          scope: 'account_analytics',
          campaignId: campaign.id,
          userId: interaction.user.id
        });
        return total + accounting.totalMoney;
      }, 0);

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setAuthor({
          name: hiddenName,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setDescription(
          `All-time Clipping Analytics\n\n` +
          `<a:rocket1:1504872045849346140> **Leaderboard**\n${rankString}\n` + 
          `<a:Cash1:1504871843419521115> **Total Earned**\n$${liveTotalEarned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
          `<a:fire1:1504871649491554487> **Campaigns Joined**\n${userRecord.campaigns?.length || 0}\n` +
          `<a:chart1:1504773558415523931> **Total Views**\n${formatNumber(liveTotalViews)}\n` +
          `<:approve1:1508373907411963955> **Clips Approved**\n${approvedCount}\n` + 
          `<:reject1:1508373970259546162> **Clips Denied**\n${rejectedCount}\n\n` + 
          `<:whiteCE:1504904179905200148> Powered by Creators Elite`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('view_user_clips:')
          .setLabel('View Your Clips')
          .setEmoji('🎥')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('toggle_leaderboard_name')
          .setLabel(userRecord.hideFromLeaderboard ? 'Show name on Leaderboard' : 'Hide name from Leaderboard')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('view_user_clips:')) {
      const [, ownerUserId, pageStr] = interaction.customId.split(':');
      const isPaginationClick = Boolean(ownerUserId);
      if (isPaginationClick && String(interaction.user.id) !== String(ownerUserId)) {
        return interaction.reply({
          content: '❌ This clip overview belongs to another user.',
          flags: MessageFlags.Ephemeral
        });
      }

      const page = Number.isInteger(Number(pageStr)) ? Number(pageStr) : 0;
      const pageData = buildUserClipsPage({
        data: loadData(),
        userId: ownerUserId || interaction.user.id,
        page,
        perPage: 2,
        displayName: interaction.user.username
      });

      if (isPaginationClick) {
        await interaction.update({ embeds: [pageData.embed], components: pageData.components });
      } else {
        await interaction.reply({
          embeds: [pageData.embed],
          components: pageData.components,
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === 'toggle_leaderboard_name') {
      const data = loadData();
      const userRecord = ensureUser(data, interaction.member);

      userRecord.hideFromLeaderboard = !userRecord.hideFromLeaderboard;

      saveData(data);

      await interaction.reply({
        content: userRecord.hideFromLeaderboard
          ? '✅ Your name will now show as **Hidden** on the leaderboard.'
          : '✅ Your name will now show normally on the leaderboard.',
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === "account_payouts") {

        const data = loadData();
        const userRecord = ensureUser(data, interaction.member);

        const approvedClips = Object.values(data.clips || {}).filter(
            c =>
                c.userId === interaction.user.id &&
                c.status === "approved"
        );

        let totalEarned = 0;
        let totalPaid = 0;
        let totalPending = 0;

        approvedClips.forEach(clip => {

            totalEarned += Number(clip.totalMoneyMade || 0);

            totalPaid += clip.payout?.paidMoney || 0;

        });

        totalPending = Math.max(
            totalEarned - totalPaid,
            0
        );

        let paymentLabel = "USDT ID";
        let paymentValue = "Not set";

        if (userRecord.paymentDetails?.exchange) {

            const exchange =
                userRecord.paymentDetails.exchange;

            paymentLabel =
                `${exchange.charAt(0).toUpperCase()}${exchange.slice(1)} ID`;

            paymentValue =
                `\`${userRecord.paymentDetails.paymentId}\``;

        }

        const embed = new EmbedBuilder()

            .setColor(0x7ED957)

            .setAuthor({

                name: interaction.user.username,

                iconURL: interaction.user.displayAvatarURL()

            })

            .setDescription(

    `## <a:flyin:1506234392920723546> Your Payments

    <a:Cash1:1504871843419521115> **Total Earned**
    $${formatNumber(totalEarned)}

    <a:good1:1504871589332914176> **Already Paid**
    $${formatNumber(totalPaid)}

    <a:dot1:1508433228669780029> **Current Unpaid**
    $${formatNumber(totalPending)}

    <a:fire1:1504871649491554487> **Campaigns Joined**
    ${userRecord.campaigns?.length || 0}

    <:usdt1:1504872188317012098> **${paymentLabel}**
    ${paymentValue}

    <a:warning:1504774411280973864> Network fees may apply depending on the payout network.`

            );

        const row = new ActionRowBuilder()

            .addComponents(

                new ButtonBuilder()

                    .setCustomId("payout_detailed_overview")

                    .setLabel("Detailed Overview")

                    .setEmoji("📄")

                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()

                    .setCustomId("edit_usdt_address")

                    .setLabel("Edit ID")

                    .setEmoji("<:usdt1:1504872188317012098>")

                    .setStyle(ButtonStyle.Secondary)

            );

        await interaction.reply({

            embeds: [embed],

            components: [row],

            flags: MessageFlags.Ephemeral

        });

    }

    if (interaction.isButton() && interaction.customId === 'demographics_start') {

      const data = loadData();

      if (!data.demographicsSessions) {
        data.demographicsSessions = {};
      }

      data.demographicsSessions[interaction.user.id] = {
        userId: interaction.user.id,
        status: 'pending_country',
        createdAt: Date.now()
      };

      saveData(data);

      const countryMenu = new StringSelectMenuBuilder()
        .setCustomId('demographics_country')
        .setPlaceholder('Select country')
        .addOptions([
          {
            label: 'United States',
            value: 'us'
          },
          {
            label: 'United Kingdom',
            value: 'uk'
          },
          {
            label: 'Canada',
            value: 'ca'
          }
        ]);

      const campaigns = Object.values(CAMPAIGNS)
        .filter(c => c.active === true)
        .map(c => ({
          label: cleanDropdownLabel(c.name),
          value: c.id
        }))
        .slice(0, 25);

      const campaignMenu = new StringSelectMenuBuilder()
        .setCustomId('demographics_campaign')
        .setPlaceholder('Select campaign')
        .addOptions(campaigns);
          
      await interaction.reply({
        content: '🌍 Select the country shown in your demographics.',
        components: [
          new ActionRowBuilder().addComponents(countryMenu)
         ],
         flags: MessageFlags.Ephemeral
       });

       return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'demographics_country') {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];

      if (!session) {
        await interaction.reply({ content: '❌ Session expired.', flags: MessageFlags.Ephemeral });
        return;
      }
 
      session.country = interaction.values[0];
      session.status = 'pending_account';
      saveData(data);

      const userRecord = ensureUser(data, interaction.member);
      const accounts = [];

      for (const [campaignId, platforms] of Object.entries(userRecord.campaignAccounts || {})) {
        for (const [platform, account] of Object.entries(platforms || {})) {
          accounts.push({
            label: `${formatPlatform(platform)} — @${account.username}`,
            value: `${campaignId}|${platform}|${account.username}`
          });
        }
      }

      if (!accounts.length) {
        await interaction.update({
          content: '❌ You have no verified campaign accounts yet.',
          components: []
        });
        return;
      }

      const accountMenu = new StringSelectMenuBuilder()
        .setCustomId('demographics_account')
        .setPlaceholder('Select account')
        .addOptions(accounts.slice(0, 25));

      await interaction.update({
        content: `✅ Country selected: **${session.country}**\nNow select account.`,
        components: [new ActionRowBuilder().addComponents(accountMenu)]
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'demographics_account') {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];

      if (!session) {
        await interaction.reply({ content: '❌ Session expired.', flags: MessageFlags.Ephemeral });
        return;
      }

      const [campaignId, platform, username] = interaction.values[0].split('|');

      session.account = { campaignId, platform, username };
      session.status = 'pending_campaign';

      saveData(data);

      const campaigns = Object.values(CAMPAIGNS)
        .filter(c => c.active !== false)
        .map(c => ({
          label: c.name.slice(0, 100),
          value: c.id
        }))
        .slice(0, 25);
 
      const campaignMenu = new StringSelectMenuBuilder()
        .setCustomId('demographics_campaign')
        .setPlaceholder('Select campaign')
        .addOptions(campaigns);

      await interaction.update({
        content: `✅ Account selected: **${formatPlatform(platform)} @${username}**\nNow select campaign.`,
        components: [new ActionRowBuilder().addComponents(campaignMenu)]
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'demographics_campaign') {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];

      if (!session) {
        await interaction.reply({
          content: '❌ Session expired. Start again.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const campaignId = interaction.values[0];

      session.campaignId = campaignId;
      session.status = 'pending_upload';
      saveData(data);

      const uploadChannel = await interaction.guild.channels.create({
        name: `demo-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: DEMOGRAPHICS_UPLOAD_CATEGORY_ID || null,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          {
            id: interaction.client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }
        ]   
      });

      session.uploadChannelId = uploadChannel.id;
      saveData(data);

      await interaction.update({
        content:
          `✅ Campaign selected: **${cleanDropdownLabel(CAMPAIGNS[campaignId]?.name || campaignId)}**\n\n` +
          `Now upload your demographics screen recording here: ${uploadChannel}`,
        components: []
      });

      await uploadChannel.send(
        `${interaction.user}, upload your demographics screen recording here.\n\n` +
        `Accepted files: **MP4, MOV, WEBM, MKV**\n` +
        `You have **10 minutes**.`
      );

      const collector = uploadChannel.createMessageCollector({
        filter: m => m.author.id === interaction.user.id && m.attachments.size > 0,
        max: 1,
        time: 10 * 60 * 1000
      });

      collector.on('collect', async msg => {
        const attachment = msg.attachments.first();

        const fileName = attachment.name.toLowerCase();

        const validExtensions = ['.mp4', '.mov', '.webm', '.mkv'];

        const isVideo = validExtensions.some(ext => fileName.endsWith(ext));

        if (!isVideo) {
          await uploadChannel.send('❌ Invalid file. Please upload MP4, MOV, WEBM, or MKV.');
          return;
        }

        const data = loadData();
        const session = data.demographicsSessions?.[interaction.user.id];

        if (!session) {
          await uploadChannel.send('❌ Session expired. Please start again.');
          return;
        }

        const submissionId = `demo_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

        if (!data.demographicsSubmissions) {
          data.demographicsSubmissions = {};
        } 

        const submission = {
          id: submissionId,
          userId: interaction.user.id,
          videoUrl: attachment.url,
          videoName: attachment.name,
          country: session.country,
          account: session.account,
          campaignId: session.campaignId,
          uploadChannelId: uploadChannel.id,
          status: 'pending',
          createdAt: Date.now()
        };

        data.demographicsSubmissions[submissionId] = submission;
        delete data.demographicsSessions[interaction.user.id];

        saveData(data);

        const staffChannel = interaction.guild.channels.cache.get(DEMOGRAPHICS_STAFF_CHANNEL_ID);

        if (staffChannel) {
          const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🌍 New Demographics Submission')
            .setDescription(
              `**User:** ${interaction.user} (${interaction.user.id})\n` +
              `**Country:** ${submission.country}\n` +
              `**Account:** ${formatPlatform(submission.account.platform)} @${submission.account.username}\n` +
              `**Campaign:** ${cleanDropdownLabel(CAMPAIGNS[submission.campaignId]?.name || submission.campaignId)}\n` +
              `**Video:** ${submission.videoUrl}\n` +
              `**Status:** Pending`
            );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`demo_approve:${submissionId}`)
              .setLabel('Approve')
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
             .setCustomId(`demo_reject:${submissionId}`)
             .setLabel('Reject')
             .setStyle(ButtonStyle.Danger)
          );

          const staffMessage = await staffChannel.send({
            embeds: [embed],
            components: [row]
          });
          submission.staffChannelId = staffChannel.id;
          submission.staffMessageId = staffMessage.id;
          saveData(data);
        }

        await uploadChannel.send('✅ Demographics submitted successfully. Staff will review it soon.');

        setTimeout(() => {
          uploadChannel.delete().catch(() => {});
        }, 60 * 1000);
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await uploadChannel.send('❌ Upload expired. Please start again.');

          const data = loadData();
          if (data.demographicsSessions?.[interaction.user.id]) {
            delete data.demographicsSessions[interaction.user.id];
            saveData(data);
          }

          setTimeout(() => {
            uploadChannel.delete().catch(() => {});
          }, 60 * 1000);
        }
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('demo_approve:')) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to approve demographic applications.', flags: MessageFlags.Ephemeral });
      }
      const submissionId = interaction.customId.split(':')[1];
      const submission = loadData().demographicsSubmissions?.[submissionId];
      if (!submission) {
        return interaction.reply({ content: '❌ Demographic application not found.', flags: MessageFlags.Ephemeral });
      }
      if (submission.status === 'approved') {
        return interaction.reply({ content: '❌ This demographic application has already been approved.', flags: MessageFlags.Ephemeral });
      }
      if (submission.status !== 'pending') {
        return interaction.reply({ content: '❌ This demographic application is no longer pending review.', flags: MessageFlags.Ephemeral });
      }
      const tierMenu = new StringSelectMenuBuilder()
        .setCustomId(`demographic_tier_select:${submissionId}`)
        .setPlaceholder('Choose the approved demographic tier')
        .addOptions(
          { label: 'Tier 1', value: 'Tier 1' },
          { label: 'Tier 2', value: 'Tier 2' },
          { label: 'Tier 3', value: 'Tier 3' }
        );
      await interaction.reply({
        content: 'Select the demographic tier before approving this application.',
        components: [new ActionRowBuilder().addComponents(tierMenu)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('demographic_tier_select:')) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to approve demographic applications.', flags: MessageFlags.Ephemeral });
      }
      const submissionId = interaction.customId.split(':')[1];
      const selectedTier = interaction.values[0];
      if (!['Tier 1', 'Tier 2', 'Tier 3'].includes(selectedTier)) {
        return interaction.reply({ content: '❌ Invalid demographic tier.', flags: MessageFlags.Ephemeral });
      }

      const data = loadData();
      const submission = data.demographicsSubmissions?.[submissionId];
      if (!submission) {
        return interaction.reply({ content: '❌ Demographic application not found.', flags: MessageFlags.Ephemeral });
      }
      if (submission.status === 'approved') {
        return interaction.reply({ content: '❌ This demographic application has already been approved.', flags: MessageFlags.Ephemeral });
      }
      if (submission.status !== 'pending') {
        return interaction.reply({ content: '❌ This demographic application is no longer pending review.', flags: MessageFlags.Ephemeral });
      }

      const approvedAt = Date.now();
      submission.demographicTier = selectedTier;
      submission.tierAssignedBy = interaction.user.id;
      submission.tierAssignedAt = approvedAt;
      submission.status = 'approved';
      submission.approvedBy = interaction.user.id;
      submission.approvedAt = approvedAt;

      const targetMember = await interaction.guild.members.fetch(submission.userId).catch(() => null);
      const userRecord = targetMember
        ? ensureUser(data, targetMember)
        : (data.users[submission.userId] ||= { discordId: submission.userId, stats: {}, campaigns: [] });
      userRecord.demographicTier = selectedTier;
      userRecord.demographics = {
        ...(userRecord.demographics || {}),
        status: 'approved',
        tier: selectedTier,
        approvedAt,
        approvedBy: interaction.user.id
      };

      saveData(data);
      await updateDemographicStaffReviewMessage(interaction.guild, submission, interaction.user).catch(error => {
        console.error(`Could not update demographic review ${submissionId}:`, error.message);
      });
      await sendDemographicApprovalDM(submission.userId, submission);
      await interaction.update({ content: `✅ Approved as **${selectedTier}**.`, components: [] });
      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith('reject_demographics:')
    ) {
      const submissionId = interaction.customId.split(':')[1];

      const data = loadData();
      const submission = data.demographics[submissionId];

      submission.status = 'rejected';

      saveData(data);

      // 👇 ADD DM CODE HERE
      const user = await client.users
        .fetch(submission.userId)
        .catch(() => null);

      if (user) {
        await user.send(
          `❌ Your demographics submission for ${CAMPAIGNS[submission.campaignId].name} has been rejected.`
        ).catch(() => {});
      }

       const category = interaction.guild.channels.cache.get(
        submission.uploadCategoryId
      );

      if (category) {
        await category.delete(
          `Demographics ${submission.status}`
        ).catch(console.error);
      }

      await interaction.update({
        content: '❌ Rejected',
        components: []
      });
    }

    // Staff clicks "Mark as Paid"
    if (interaction.isButton() && interaction.customId.startsWith('staff_payout_paid:')) {
      const targetUserId = interaction.customId.split(':')[1];
      const data = loadData();

      if (!data.payoutStatuses) data.payoutStatuses = {};
      
      data.payoutStatuses[targetUserId] = {
        status: 'paid',
        errorReason: null,
        processedBy: interaction.user.id,
        updatedAt: Date.now()
      };
      saveData(data);

      if (guild) {
          updateServerStats(guild);
      }

      const originalEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(0x7ED957) // Success Green
        .setTitle('✅ Payout Completed')
        .addFields({ name: 'Processed By', value: `${interaction.user}`, inline: true });

      await interaction.update({ embeds: [updatedEmbed], components: [] });

      // DM Notification
      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (targetUser) {
        await targetUser.send({
          content: `🎉 **Payout Success!** Your earnings on **Creators Elite** have been processed and sent to your submitted Exchange account. Check your wallet!`
        }).catch(() => console.log(`Could not send automated DM status update to user ${targetUserId}`));
      }
      return;
    }

    // Staff clicks "Flag Error" -> Triggers the modal pop-up prompt window
    if (interaction.isButton() && interaction.customId.startsWith('staff_payout_error:')) {
      const targetUserId = interaction.customId.split(':')[1];

      const modal = new ModalBuilder()
        .setCustomId(`staff_payout_error_modal:${targetUserId}`)
        .setTitle('Flag Payout Error');

      const reasonInput = new TextInputBuilder()
        .setCustomId('error_reason')
        .setLabel('What went wrong?')
        .setPlaceholder('e.g., Invalid Binance ID / Account Blocked / Incorrect Network Selection')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
      return;
    }

    // Modal Submission for Custom Error Explanations
    if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_payout_error_modal:')) {
      const targetUserId = interaction.customId.split(':')[1];
      const errorReason = interaction.fields.getTextInputValue('error_reason').trim();
      const data = loadData();

      if (!data.payoutStatuses) data.payoutStatuses = {};
      
      data.payoutStatuses[targetUserId] = {
        status: 'error',
        errorReason: errorReason,
        processedBy: interaction.user.id,
        updatedAt: Date.now()
      };
      saveData(data);

      if (guild) {
          updateServerStats(guild);
      }

      const originalEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(0xE74C3C) // Error Red
        .setTitle('❌ Payout Flagged with Error')
        .addFields(
          { name: 'Error Reason', value: `\`${errorReason}\`` },
          { name: 'Flagged By', value: `${interaction.user}`, inline: true }
        );

      await interaction.update({ embeds: [updatedEmbed], components: [] });

      // DM Notification containing the custom staff field context
      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (targetUser) {
        await targetUser.send({
          content: `⚠️ **Payout Alert - Creators Elite:** There was an issue processing your payout transfer request.\n**Reason:** ${errorReason}\n\nPlease head over to your account configurations panel, double-check your payment credentials by selecting **Edit ID**, or get in touch with our team.`
        }).catch(() => console.log(`Could not send automated DM status update to user ${targetUserId}`));
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === 'buy_proxy_trigger') {
      const modal = new ModalBuilder()
        .setCustomId('proxy_purchase_modal')
        .setTitle('Proxy Order Configuration');

      const countryInput = new TextInputBuilder()
        .setCustomId('proxy_country')
        .setLabel('Country/Location')
        .setPlaceholder('e.g., USA, UK, Germany')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const quantityInput = new TextInputBuilder()
        .setCustomId('proxy_quantity')
        .setLabel('Quantity')
        .setPlaceholder('How many proxies?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const useCaseInput = new TextInputBuilder()
        .setCustomId('proxy_usecase')
        .setLabel('Target Website / Use Case')
        .setPlaceholder('e.g., TikTok, Instagram, automation')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(countryInput),
        new ActionRowBuilder().addComponents(quantityInput),
        new ActionRowBuilder().addComponents(useCaseInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // ------------------------------------------
    // 2. MODAL SUBMIT -> CREATE PROXY TICKET
    // ------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId === 'proxy_purchase_modal') {

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const country = interaction.fields.getTextInputValue('proxy_country').trim();
      const quantityStr = interaction.fields.getTextInputValue('proxy_quantity').trim();
      const useCase = interaction.fields.getTextInputValue('proxy_usecase').trim();

      const quantity = parseInt(quantityStr, 10);

      if (isNaN(quantity) || quantity <= 0) {
        return interaction.editReply({
          content: '❌ Quantity must be a valid number greater than 0.'
        });
      }

      const totalPrice = `$${quantity * PRICE_PER_PROXY}`;

      try {

        // Validate Config
        if (!STAFF_ROLE_ID) {
          throw new Error('STAFF_ROLE_ID is missing');
        }

        if (!TICKET_CATEGORY_ID) {
         throw new Error('TICKET_CATEGORY_ID is missing');
        }

        const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);

        if (!category) {
          throw new Error('Ticket category not found');
        }

        // Prevent duplicate proxy tickets
        const existingTicket = interaction.guild.channels.cache.find(
          ch =>
            ch.name === `proxy-${interaction.user.username.toLowerCase()}` &&
            ch.parentId === TICKET_CATEGORY_ID
        );

        if (existingTicket) {
          return interaction.editReply({
            content: `❌ You already have an open proxy ticket: ${existingTicket}`
          });
        }

        // Create ticket channel
        const ticketChannel = await interaction.guild.channels.create({
          name: `proxy-${interaction.user.username}`.toLowerCase(),
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY_ID,
          topic: `proxy-ticket-${interaction.user.id}`,

          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },

            {
              id: client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels
              ]
            },

            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles
              ]
            },

            {
              id: STAFF_ROLE_ID,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles
              ]
            }
          ]
        });

        const ticketEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🚀 Proxy Order Created')
          .setDescription(
            `**Country/Location:** ${country}\n` +
            `**Quantity:** ${quantity}\n` +
            `**Use Case:** ${useCase}\n\n` +

            `### 💰 Pricing\n` +
            `**$${PRICE_PER_PROXY} per proxy**\n` +
            `**Total Due:** ${totalPrice}\n\n` +

            `### 💳 Payment Methods\n` +
            `🔸 Binance Pay ID: \`466875081\`\n` +
            `🔸 Bybit Pay ID: \`179999980\`\n` +
            `🔸 USDT (TRC20): \`TCKpFZVuuhpupnHP3qxoEGcy938Np6Bw6L\`\n\n` +

            `### ⚠️ Next Steps\n` +
            `1. Send payment\n` +
            `2. Upload payment screenshot\n` +
            `3. Send transaction ID\n\n` +

            `A staff member will verify payment and deliver your proxies.`
          )
          .setFooter({
            text: 'Creators Elite Order Center'
          })
          .setTimestamp();

        const controls = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('🔒 Close')
            .setStyle(ButtonStyle.Secondary)
        );

        await ticketChannel.send({
          content: `👋 ${interaction.user} | <@&${STAFF_ROLE_ID}> New proxy order received.`,
          embeds: [ticketEmbed],
          components: [controls]
        });

        await interaction.editReply({
          content: `✅ Proxy ticket created: ${ticketChannel}`
        });

      } catch (error) {

        console.error('PROXY TICKET ERROR:', error);

        await interaction.editReply({
          content: `❌ Failed to create ticket.\n\nError: \`${error.message}\``
        }).catch(() => {});

      }

      return;
    }

    if (interaction.isButton() && interaction.customId === 'payment_details') {
      const modal = new ModalBuilder()
        .setCustomId('payment_details_modal')
        .setTitle('Payment Details');

      const exchangeInput = new TextInputBuilder()
        .setCustomId('exchange')
        .setLabel('Exchange')
        .setPlaceholder('Binance or Bybit')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const idInput = new TextInputBuilder()
        .setCustomId('payment_id')
        .setLabel('Your Binance/Bybit ID')
        .setPlaceholder('Enter your payment ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(exchangeInput),
        new ActionRowBuilder().addComponents(idInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'payment_details_modal') {
      const exchange = interaction.fields.getTextInputValue('exchange').trim();
      const paymentId = interaction.fields.getTextInputValue('payment_id').trim();

      const allowed = ['binance', 'bybit'];

      if (!allowed.includes(exchange.toLowerCase())) {
        await interaction.reply({
          content: '❌ Exchange must be Binance or Bybit.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, interaction.member);

      userRecord.paymentDetails = {
        exchange: exchange.toLowerCase(),
        paymentId,
        updatedAt: Date.now()
      };

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('💳 New Payment Details Submission')
        .addFields(
          {
            name: 'User',
            value: `${interaction.user} (${interaction.user.id})`
          },
          {
            name: 'Exchange',
            value: exchange,
            inline: true
          },
          {
            name: 'Payment ID',
            value: `\`${paymentId}\``,
            inline: true
          }
        )
        .setFooter({
          text: 'Creators Elite Payment System'
        })
        .setTimestamp();

      const staffChannel = interaction.guild.channels.cache.get(PAYMENT_STAFF_CHANNEL_ID);

      if (staffChannel) {
        if (userRecord.paymentDetailsStaffMessageId) {
          const oldMsg = await staffChannel.messages
            .fetch(userRecord.paymentDetailsStaffMessageId)
            .catch(() => null);

           if (oldMsg) {
             await oldMsg.edit({ embeds: [embed] });
           } else {
             const newMsg = await staffChannel.send({ embeds: [embed] });
             userRecord.paymentDetailsStaffMessageId = newMsg.id;
           }
         } else {
           const newMsg = await staffChannel.send({ embeds: [embed] });
           userRecord.paymentDetailsStaffMessageId = newMsg.id;
         }
      }

      saveData(data);

      // 🚀 FIX: TRIGGER THE AUTOMATED STAFF DASHBOARD PANEL HERE!
      // This passes the server (guild) and the user's ID so the staff gets the processing message.
      await sendStaffPayoutDashboard(interaction.guild, interaction.user.id);

      await interaction.reply({
        content: '✅ Payment details submitted successfully.',
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'edit_usdt_address') {
      const modal = new ModalBuilder()
        .setCustomId('payment_details_modal')
        .setTitle('Update Payment Details');

      const exchangeInput = new TextInputBuilder()
        .setCustomId('exchange')
        .setLabel('Exchange')
        .setPlaceholder('Binance or Bybit')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const idInput = new TextInputBuilder()
        .setCustomId('payment_id')
        .setLabel('Binance/Bybit ID')
        .setPlaceholder('Enter your new payment ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(exchangeInput),
        new ActionRowBuilder().addComponents(idInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === "payout_detailed_overview") {
        const payments = getUserPaymentReceipts(loadData(), interaction.user.id);
        const page = 0;
        await interaction.reply({
            ...buildPaymentReceiptPage(interaction, payments, page),
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("payout_receipt_page:")) {
        const requestedPage = Number(interaction.customId.split(":")[1]);
        const payments = getUserPaymentReceipts(loadData(), interaction.user.id);
        const page = Math.min(Math.max(Number.isInteger(requestedPage) ? requestedPage : 0, 0), Math.max(payments.length - 1, 0));
        await interaction.update(buildPaymentReceiptPage(interaction, payments, page));
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_view:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const text = renderCampaignAssignedAccounts(userRecord, campaignId);

      await interaction.reply({
        content: `🌐 **${campaign.name} - Accounts**\n\n${text}`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_status:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const data = loadData();
      const embed = buildCampaignStatusEmbed(campaign, data);

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_link:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`campaign_connect_platform:${campaignId}`)
        .setPlaceholder('Choose platform')
        .addOptions(
          campaign.allowedPlatforms.map(platform => ({
            label: formatPlatform(platform),
            value: platform
          }))
        );

      await interaction.reply({
        content: `Choose platform for **${campaign.name}**`,
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_connect_platform:')) {
      const campaignId = interaction.customId.split(':')[1];
      const platform = interaction.values[0];
      const campaign = CAMPAIGNS[campaignId];
 
      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`campaign_connect_modal:${campaignId}:${platform}`)
        .setTitle('Add Campaign Account');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('campaign_username')
            .setLabel('Username')
            .setPlaceholder('@username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_connect_modal:')) {
      const [, campaignId, platform] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const username = normalizeUsername(
        interaction.fields.getTextInputValue('campaign_username')
      );

      if (!username) {
        await interaction.reply({ content: '❌ Username cannot be empty.', flags: MessageFlags.Ephemeral });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      
      const validation = validateAccountSubmission(
        interaction.user.id, 
        campaignId, 
        platform, 
        username
      );

      if (!validation.isValid) {
        return await interaction.reply({ content: validation.message, flags: MessageFlags.Ephemeral });
      }

      // --- FIX START: ALLOW MULTIPLE ACCOUNTS, ONLY BLOCK EXPLICIT DUPLICATES ---
      const cleanInputUsername = username.trim().toLowerCase().replace(/^@/, '');
      
      let handleExistsGlobally = false;
      let claimedBySomeoneElse = false;

      // 1. Scan all existing users in the database to check handles safely
      for (const [userId, record] of Object.entries(data.users || {})) {
        // If your database structure saves campaign accounts as an array or inside campaignStats:
        const accountsObj = record.campaignAccounts?.[campaignId]?.[platform] || record.campaignStats?.[campaignId]?.[platform];
        
        if (accountsObj) {
          // If it's stored as a single object but you plan to switch to an array, 
          // or if you check a unified database list, match your schema string:
          const savedName = String(accountsObj.username || '').trim().toLowerCase().replace(/^@/, '');
          
          if (savedName === cleanInputUsername) {
            handleExistsGlobally = true;
            if (userId !== interaction.user.id) {
              claimedBySomeoneElse = true;
            }
            break;
          }
        }
      }

      // 2. Scan active pending staff request items so users cannot spam the same handle twice concurrently
      const activeRequests = Object.values(data.campaignAccountRequests || {});
      const duplicatePending = activeRequests.find(req => 
        req.campaignId === campaignId &&
        req.platform === platform &&
        req.username.trim().toLowerCase().replace(/^@/, '') === cleanInputUsername &&
        req.status === 'pending'
      );

      // Rule Check A: Stolen account
      if (handleExistsGlobally && claimedBySomeoneElse) {
        await interaction.reply({
          content: `❌ The account **@${username}** has already been linked by another creator.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Rule Check B: User duplicate linking attempt
      if ((handleExistsGlobally && !claimedBySomeoneElse) || duplicatePending) {
        await interaction.reply({
          content: `❌ You have already linked or submitted a pending request for **@${username}**!`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      // --- FIX END ---

      const requestId = makeCampaignAccountRequestId();

      const request = {
        id: requestId,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        campaignId,
        campaignName: campaign.name,
        platform,
        username, // Beautifully stores the unique new secondary username handle
        status: 'pending',
        bioCode: null,
        createdAt: new Date().toISOString(),
        staffMessageId: null,
        sourceChannelId: interaction.channelId
      };

       // 2. Fetch staff channel mapping for this campaign
      const campaignStaffMap = data.campaignStaffChannels?.[campaignId];

      // 3. Fallback check for linkAccount (supports both data.json and static campaign fallback)
      const staffChannelId = campaignStaffMap?.linkAccount 
          || campaignStaffMap?.accountLinking 
          || campaign?.staffChannels?.linkAccount 
          || campaign?.staffChannelId;

      const staffChannel = interaction.guild.channels.cache.get(staffChannelId);

      if (!staffChannel) {
          return interaction.reply({ content: '❌ Staff channel not found.', flags: MessageFlags.Ephemeral });
      }

      const sent = await staffChannel.send({
        content: renderCampaignAccountStaffContent(request),
        components: buildCampaignAccountStaffButtons(request.id, request.status)
      });

      request.staffMessageId = sent.id;
      
      if (!data.campaignAccountRequests) data.campaignAccountRequests = {};
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      await interaction.reply({
        content: `✅ Campaign account request submitted for **${campaign.name}** using **@${username}**. Wait for staff code.`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_send_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`campaign_staff_code_modal:${requestId}`)
        .setTitle('Send Bio Code');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('campaign_staff_code_input')
            .setLabel('Enter code for bio')
            .setPlaceholder('MIC-4821')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_staff_code_modal:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const code = interaction.fields.getTextInputValue('campaign_staff_code_input').trim();

      // Update state data
      request.bioCode = code;
      request.status = 'waiting_confirm';
      request.staffChannelId = interaction.channelId; // 🟢 Save staff channel ID
      request.staffMessageId = interaction.message?.id || request.messageId; // 🟢 Save staff message ID
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      // 1. Send DM to user with confirmation button
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_user_confirm:${requestId}`)
          .setLabel('Confirm Bio Updated')
          .setStyle(ButtonStyle.Success)
      );

      const targetMember = await interaction.guild.members
        .fetch(request.userId)
        .catch(() => null);

      if (targetMember) {
        await targetMember.send({
          content:
            `✅ Your ${formatPlatform(request.platform)} bio verification code for **${request.campaignName}** is ready.\n\n` +
            `Username: @${request.username}\n\n` +
            `Add this code to your bio:\n\n` +
            `\`${request.bioCode}\`\n\n` +
            `After updating your bio, click **Confirm Bio Updated** below.`,
          components: [confirmRow]
        }).catch(async () => {
          const sourceChannel = interaction.guild.channels.cache.get(request.sourceChannelId);
          if (sourceChannel) {
            await sourceChannel.send({
              content: `<@${request.userId}> I could not DM you. Please enable DMs from server members, then ask staff to resend your code.`
            }).catch(() => {});
          }
        });
      }

      // 2. 🟢 UPDATE THE STAFF MESSAGE BUTTON IN #link-accounts TO "Waiting for User"
      const waitingRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('waiting_btn')
          .setLabel('⏳ Waiting for User...')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      if (interaction.message) {
        await interaction.update({ components: [waitingRow] });
        await interaction.followUp({ content: `✅ Bio code sent to <@${request.userId}> via DM.`, flags: MessageFlags.Ephemeral });
      } else {
        await updateCampaignAccountStaffMessage(interaction.guild, request);
        await interaction.reply({ content: `✅ Bio code sent to <@${request.userId}> via DM.`, flags: MessageFlags.Ephemeral });
      }

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_open_code:')) {
      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.user.id !== request.userId) {
        await interaction.reply({ content: '❌ This code is not for you.', flags: MessageFlags.Ephemeral });
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_user_confirm:${requestId}`)
          .setLabel('Confirm Bio Updated')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        content:
          `📩 Add this code to your **${formatPlatform(request.platform)}** bio for **@${request.username}**:\n\n` +
          `\`${request.bioCode}\`\n\n` +
          `Then click **Confirm Bio Updated** below.`,
        components: [row],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    // ==========================================
    // 📩 USER DM CONFIRMATION HANDLER
    // ==========================================
    if (interaction.isButton() && interaction.customId.startsWith('campaign_user_confirm:')) {
      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Account verification request not found or expired.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // 1. Update status to trigger Accept/Reject buttons
      request.status = 'ready_for_review';
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      // 2. Fetch target guild and update staff channel message in #link-accounts
      const guild = interaction.client.guilds.cache.get(process.env.GUILD_ID);

      if (guild) {
        await updateCampaignAccountStaffMessage(guild, request);
      } else {
        console.error("⚠️ Could not locate main guild during DM user confirmation.");
      }

      // 3. Confirm back to user in DM
      await interaction.editReply({
        content: '✅ **Bio Code Confirmed!**\n\nStaff has been notified and will review your profile bio shortly. You will receive a DM once your account is approved.'
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_accept:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ User not found in server.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);

      if (!userRecord.campaigns.includes(request.campaignId)) {
        userRecord.campaigns.push(request.campaignId);
      }

      const campaignAccount = ensureCampaignAccount(
        userRecord,
        request.campaignId,
        request.platform,
        request.username
      );

      campaignAccount.verified = true;
      campaignAccount.bioCode = request.bioCode || null;

      ensureCampaignPlatformStats(
        userRecord,
        request.campaignId,
        request.platform,
        request.username
      );

      const campaignRole = interaction.guild.roles.cache.get(CAMPAIGNS[request.campaignId]?.roleId);
      if (campaignRole && !member.roles.cache.has(campaignRole.id)) {
        await member.roles.add(campaignRole).catch(() => {});
      }

      request.status = 'approved';
      data.campaignAccountRequests[requestId] = request;

      if (!userRecord.campaignAccounts) {
        userRecord.campaignAccounts = {};
      }

      if (!userRecord.campaignAccounts[request.campaignId]) {
        userRecord.campaignAccounts[request.campaignId] = {};
      }

      userRecord.campaignAccounts[request.campaignId][request.platform] = {
        username: request.username,
        verified: true,
        addedAt: Date.now()
      };

      saveData(data);
     
      // 🟢 Fixed app.userId reference error -> request.userId
      console.log("Approved user:", request.userId);
      console.log(JSON.stringify(data.users[request.userId], null, 2));
     
      await updateCampaignAccountStaffMessage(interaction.guild, request);
     
      await member.send(
        `✅ **Campaign Approved**\n\n` +
        `You have been approved for **${request.campaignName}**.\n\n` +
        `Your **${formatPlatform(request.platform)}** account **@${request.username}** has been verified and added to the campaign.\n\n` +
        `You can now access the campaign channels and start submitting clips.`
      ).catch(() => {});

      await interaction.reply({
        content: `✅ Approved **${formatPlatform(request.platform)}** account **@${request.username}** for **${request.campaignName}**.`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_reject:')) {
        if (!interaction.guild || !isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        }

        const requestId = interaction.customId.split(':')[1];

        const modal = new ModalBuilder()
            .setCustomId(`campaign_staff_reject_modal:${requestId}`)
            .setTitle('Account Rejection Reason');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('campaign_reject_reason_input')
                    .setLabel('Reason for Rejection')
                    .setPlaceholder('e.g. Bio code was not found, account is private, etc.')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );

        await interaction.showModal(modal);
        return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_staff_reject_modal:')) {
        if (!interaction.guild || !isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        }

        const requestId = interaction.customId.split(':')[1];
        const data = loadData();
        const request = data.campaignAccountRequests[requestId];

        if (!request) {
            return interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        }

        const reason = interaction.fields.getTextInputValue('campaign_reject_reason_input').trim();

        request.status = 'rejected';
        request.rejectReason = reason;
        data.campaignAccountRequests[requestId] = request;
        saveData(data);

        // Update staff message components to show rejected state
        const rejectedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rejected_btn')
                .setLabel('❌ Account Rejected')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
        );

        const updatedEmbed = EmbedBuilder.from(interaction.message ? interaction.message.embeds[0] : {})
            .setColor('#EF4444')
            .addFields({ name: '❌ Rejection Reason', value: reason, inline: false });

        if (interaction.message) {
            await interaction.update({ embeds: [updatedEmbed], components: [rejectedRow] });
        } else {
        await interaction.reply({ content: `❌ Account request rejected with reason: "${reason}"`, flags: MessageFlags.Ephemeral });
        }

        // Send DM notification to user with the custom reason
        const targetMember = await interaction.guild.members.fetch(request.userId).catch(() => null);
        if (targetMember) {
            const dmEmbed = new EmbedBuilder()
                .setTitle('❌ Account Verification Rejected')
                .setDescription(`Your account request (@${request.username}) for **${request.campaignName}** was rejected by staff.`)
                .addFields({ name: '📌 Reason', value: reason })
                .setColor('#EF4444');

            await targetMember.send({ embeds: [dmEmbed] }).catch(() => {});
        }

        return interaction.followUp({ content: `❌ Rejected account request for <@${request.userId}>. Reason: "${reason}"`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_remove:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        return interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
      }

      const data = loadData();
      const userRecord = data.users?.[interaction.user.id];
      const accounts = userRecord?.campaignAccounts?.[campaignId] || {};
      const platforms = Object.keys(accounts);

      // Rule 1: Check if they have any linked accounts to begin with
      if (platforms.length === 0) {
        return interaction.reply({
          content: '📭 You don\'t have any accounts linked to this campaign.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Rule 2: Baseline safety check (User must leave at least one account)
      if (platforms.length === 1) {
        return interaction.reply({
          content: `⚠️ **Action Denied:** You only have one account linked to this campaign (\`${formatPlatform(platforms[0])}: @${accounts[platforms[0]].username}\`). To protect your stats, you must leave at least one active account. If you want to stop entirely, use the **Leave Campaign** option instead.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Build the selection menu out of their active linked accounts
      const select = new StringSelectMenuBuilder()
        .setCustomId(`campaign_connect_remove_select:${campaignId}`) // 🔗 Targets your existing select menu handler!
        .setPlaceholder('Select a platform account to delete')
        .addOptions(
          platforms.map(platform => ({
            label: `${formatPlatform(platform)} — @${accounts[platform].username}`,
            description: `Unlinks this handle from ${campaign.name.replace(/<a?:\w+:\d+>/g, '').trim()}`,
            value: platform
          }))
        );

      await interaction.reply({
        content: '🗑️ **Select which account you want to remove from this campaign:**',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_connect_remove_select:')) {
      const campaignId = interaction.customId.split(':')[1];
      const platform = interaction.values[0];

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);

      const username = userRecord.campaignAccounts?.[campaignId]?.[platform]?.username;
      if (!username) {
        await interaction.reply({ content: '❌ Campaign account not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      delete userRecord.campaignAccounts[campaignId][platform];

      if (userRecord.campaignStats?.[campaignId]?.[platform]) {
        delete userRecord.campaignStats[campaignId][platform];
      }

      if (data.clips) {
        for (const [clipId, clip] of Object.entries(data.clips)) {
          if (
            clip.userId === interaction.user.id &&
            clip.campaignId === campaignId &&
            clip.platform === platform
          ) {
            delete data.clips[clipId];
          }
        }
      }

      saveData(data);

      await interaction.reply({
        content: `✅ Removed **${formatPlatform(platform)}** account **@${username}** from this campaign.`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('submit_clip:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const accounts = userRecord.campaignAccounts?.[campaignId] || {};
      const availablePlatforms = Object.keys(accounts).filter(
        platform => accounts[platform]?.verified
      );

      if (availablePlatforms.length === 0) {
        await interaction.reply({
          content: '❌ You do not have any verified campaign account set for this campaign yet.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (availablePlatforms.length === 1) {
        const platform = availablePlatforms[0];

        const modal = new ModalBuilder()
          .setCustomId(`submit_clip_modal:${campaignId}:${platform}`)
          .setTitle('Submit your Clips');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('clip_links')
              .setLabel('Videos URL')
              .setPlaceholder('Paste up to 20 links, one per line')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(4000)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`submit_clip_platform_select:${campaignId}`)
        .setPlaceholder('Choose platform account')
        .addOptions(
          availablePlatforms.map(platform => ({
            label: `${formatPlatform(platform)} - @${accounts[platform].username}`.slice(0, 100),
            value: platform
          }))
        );

      await interaction.reply({
        content: 'Choose which campaign account these clips belong to.',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('submit_clip_platform_select:')) {
      const campaignId = interaction.customId.split(':')[1];
      const platform = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`submit_clip_modal:${campaignId}:${platform}`)
        .setTitle('Submit your Clips');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('clip_links')
            .setLabel('Videos URL')
            .setPlaceholder('Paste up to 20 links, one per line')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_clip_modal:')) {
        const [, campaignId, platform] = interaction.customId.split(':');
        const campaign = CAMPAIGNS[campaignId];

        if (!campaign) {
            await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (campaign.status === 'finished') {
            await interaction.reply({ content: '❌ This campaign has already been closed.', flags: MessageFlags.Ephemeral });
            return;
        }

        const rawLinks = interaction.fields.getTextInputValue('clip_links');
        const links = extractLinksFromText(rawLinks);

        if (links.length === 0) {
            await interaction.reply({ content: '❌ Please paste at least one link.', flags: MessageFlags.Ephemeral });
            return;
        } 

        if (links.length > 20) {
            await interaction.reply({ content: '❌ You can submit up to 20 links at once.', flags: MessageFlags.Ephemeral });
            return;
        }

        const invalidLinks = links.filter(link => !isValidUrl(link));
        if (invalidLinks.length > 0) {
            await interaction.reply({
                content: `❌ Some links are invalid.\n\nFirst invalid link:\n${invalidLinks[0]}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const data = loadData();
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

        if (!member) {
            await interaction.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        const userRecord = ensureUser(data, member);
        const campaignAccount = userRecord.campaignAccounts?.[campaignId]?.[platform];
    
        if (!campaignAccount || !campaignAccount.verified) {
            await interaction.reply({
                content: `❌ No verified ${formatPlatform(platform)} account found for this campaign.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const username = campaignAccount.username;
        const platformStats = ensureCampaignPlatformStats(userRecord, campaignId, platform, username);

        // 🟢 RESOLVE PLATFORM DYNAMIC STAFF CHANNEL (#ig-clips, #tiktok-clips, #yt-clips)
        const platformKey = platform.toLowerCase();
        const channelKey = platformKey.includes('ig') || platformKey.includes('instagram') ? 'instagram'
                         : platformKey.includes('tiktok') ? 'tiktok'
                         : platformKey.includes('youtube') || platformKey.includes('yt') ? 'youtube'
                         : platformKey;

        const campaignStaffMap = data.campaignStaffChannels?.[campaignId];
        const targetChannelId = campaignStaffMap?.[channelKey] || campaign.staffChannelId;
        const staffChannel = interaction.guild.channels.cache.get(targetChannelId);

        let submittedCount = 0;
        let duplicateCount = 0;
        const rejectedResults = [];
        const batchVideoKeys = new Set();

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        for (const originalLink of links) {
            const validation = await validateClipBeforeSubmission({
                data,
                userId: interaction.user.id,
                campaignId,
                submittedUrl: originalLink
            });

            if (!validation.valid) {
                if (validation.code === 'DUPLICATE_CLIP') duplicateCount++;
                else rejectedResults.push({ link: originalLink, reason: validation.message || 'Validation failed.' });
                continue;
            }

            if (validation.platform !== platform) {
                rejectedResults.push({
                    link: originalLink,
                    reason: '❌ This link is for ' + formatPlatform(validation.platform) + ', but you selected ' + formatPlatform(platform) + '.'
                });
                continue;
            }

            const videoKey = getClipVideoKey(validation.platform, validation.videoId);
            if (videoKey && batchVideoKeys.has(videoKey)) {
                duplicateCount++;
                continue;
            }
            if (videoKey) batchVideoKeys.add(videoKey);

            const metadata = validation.metadata;
            const matchedAccount = validation.matchedAccount;
            const clipId = makeClipId();
            const submittedTimestamp = Date.now();
            const submissionBudgetCycle = getCampaignBudgetCycleIndex(campaign, new Date(submittedTimestamp));
            const publicViews = Math.max(Number(metadata.views) || 0, 0);
            const fetchedLikes = Number(metadata?.likes);
            const currentViews = campaign.separateEarningLifecycle ? 0 : publicViews;
            const estimatedEarnings = currentViews / 1000000 * (Number(campaign.ratePerMillion) || 0);
            const clip = {
                id: clipId,
                userId: interaction.user.id,
                campaignId,
                campaignName: campaign.name,
                platform: validation.platform,
                username: matchedAccount?.username || metadata.authorUsername || metadata.authorDisplayName || campaignAccount.username,
                url: validation.canonicalUrl,
                videoUrl: validation.canonicalUrl,
                originalSubmittedUrl: originalLink,
                videoId: validation.videoId,
                platformAuthorId: metadata.authorId || null,
                platformAuthorName: metadata.authorUsername || metadata.authorDisplayName || null,
                publishedAt: metadata.publishedAt || null,
                publishedTimestamp: metadata.publishedTimestamp || null,
                title: metadata.title || validation.canonicalUrl,
                thumbnailUrl: metadata.thumbnailUrl || null,
                ...(Number.isFinite(fetchedLikes) && fetchedLikes >= 0 ? { likes: fetchedLikes } : {}),
                publicViews,
                currentViews,
                submissionViews: publicViews,
                views: currentViews,
                campaignCreditedViews: campaign.separateEarningLifecycle ? 0 : undefined,
                budgetTracking: campaign.separateEarningLifecycle ? {
                    budgetCycleKey: getCampaignBudgetCycleKey(campaign, new Date(submittedTimestamp)),
                    baselinePublicViews: publicViews,
                    lastPublicViews: publicViews,
                    creditedViewsThisCycle: 0,
                    pausedBaselineViews: null
                } : undefined,
                estimatedEarnings,
                status: 'pending',
                payoutEligible: false,
                wasEverApproved: false,
                submittedTimestamp,
                budgetCycleIndex: submissionBudgetCycle,
                earningRunKey: campaign.separateEarningLifecycle ? getCampaignEarningRunKey(campaign) : undefined,
                trackingStatus: campaign.separateEarningLifecycle ? 'active' : undefined,
                budgetCycleSubmittedAt: submittedTimestamp,
                submittedAt: new Date(submittedTimestamp).toISOString(),
                createdAt: new Date(submittedTimestamp).toISOString(),
                lastChecked: submittedTimestamp,
                nextCheckAt: submittedTimestamp + CLIP_TRACK_INTERVAL_MS,
                cycle: getCampaignCycle(campaign, new Date()),
                staffChannelId: staffChannel ? staffChannel.id : null,
                staffMessageId: null,
                payout: { paidViews: 0, paidMoney: 0, lastPaidAt: null, history: [] }
            };

            data.clipReviews ||= {};
            if (!staffChannel) {
                rejectedResults.push({ link: originalLink, reason: '❌ Staff review channel is unavailable. Please try again.' });
                continue;
            }
            try {
                const staffMessage = await staffChannel.send({
                    embeds: [buildClipStaffEmbed(clip)],
                    components: buildClipStaffButtons(clip)
                });
                clip.staffChannelId = staffChannel.id;
                clip.staffMessageId = staffMessage.id;
            } catch (error) {
                console.error(`Could not create staff review message for ${clipId}:`, error.message);
                rejectedResults.push({ link: originalLink, reason: '❌ The clip was verified, but its staff review message could not be created. Please try again.' });
                continue;
            }

            initializeClipTrackingFields(clip);
            data.clipReviews[clipId] = clip;
            platformStats.videosPosted++;
            userRecord.stats.videosPosted++;
            submittedCount++;
        }

        saveData(data);

        let responseMessage = '✅ **Accepted:** ' + submittedCount + '\n⚠️ **Duplicates:** ' + duplicateCount + '\n❌ **Rejected:** ' + rejectedResults.length;
        if (rejectedResults.length) {
            responseMessage += '\n\n**Rejected links:**\n' + rejectedResults.slice(0, 5).map((item, index) => (index + 1) + '. ' + item.reason).join('\n');
        }
        if (rejectedResults.length > 5) responseMessage += '\n…and ' + (rejectedResults.length - 5) + ' more.';

        await interaction.editReply({ content: responseMessage });
        return;    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_stats:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your stats.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const embed = buildCampaignStatsEmbed(
        data,
        userRecord,
        campaignId,
        campaign.name,
        interaction.user.id
      );

      saveData(data);

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    // ===============================
    // Finish Campaign
    // ===============================
    if (
       interaction.isButton() &&
       interaction.customId.startsWith("finish_campaign:")
    ) {

       if (!isAdmin(interaction.member)) {
           return interaction.reply({
               content: "❌ Staff only.",
               flags: MessageFlags.Ephemeral
           });
       }

       const campaignId = interaction.customId.split(":")[1];

       const campaign = CAMPAIGNS[campaignId];

       if (!campaign)
           return interaction.reply({
               content: "Campaign not found.",
               flags: MessageFlags.Ephemeral
           });

       campaign.status = "finished";

       const data = loadData();

       if (!data.campaignStatus)
           data.campaignStatus = {};

       data.campaignStatus[campaignId] = {
           status: "finished",
           finishedAt: Date.now(),
           archived: false
       };

       saveData(data);

       const guild = client.guilds.cache.get(process.env.GUILD_ID);

       if (guild) {
           updateServerStats(guild);
       }

       campaign.status = "finished"

       await updateCampaignPanelMessage(
           interaction.guild,
           campaignId
       );

       await interaction.reply({
           content:
               "🏁 Campaign finished.\nIt will automatically move in 24 hours.",
           flags: MessageFlags.Ephemeral
       });

       setTimeout(async () => {

           try {

               const guild = interaction.guild;

               const category =
                   guild.channels.cache.get(
                       campaign.categoryId
                   );

               if (!category) return;

               let finishedCategory =
                   guild.channels.cache.find(
                       c =>
                           c.type === ChannelType.GuildCategory &&
                           c.name === "📁 Finished Campaigns"
                   );

               if (!finishedCategory) {

                   finishedCategory =
                       await guild.channels.create({
                           name: "📁 Finished Campaigns",
                           type: ChannelType.GuildCategory
                       });

               }

               const children =
                   guild.channels.cache.filter(
                       c => c.parentId === category.id
                   );

               for (const [, ch] of children) {

                   await ch.setParent(finishedCategory.id);

                   await ch.permissionOverwrites.edit(
                       guild.roles.everyone,
                       {
                           ViewChannel: false
                       }
                   );

               }

               await category.delete().catch(() => {});

           } catch (err) {

               console.error(
                   "Move finished campaign failed:",
                   err
               );

           }

       }, 24 * 60 * 60 * 1000);

       return;
    }



    // ===============================
    // Reopen Campaign
    // ===============================
    if (
        interaction.isButton() &&
        interaction.customId.startsWith("reopen_campaign:")
    ) {

        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "❌ Staff only.",
                flags: MessageFlags.Ephemeral
            });
        }

        const campaignId =
            interaction.customId.split(":")[1];

        const campaign =
            CAMPAIGNS[campaignId];

        if (!campaign)
            return interaction.reply({
                content: "Campaign not found.",
                flags: MessageFlags.Ephemeral
           });

        campaign.status = "active";

        const data = loadData();

        if (data.campaignStatus?.[campaignId]) {
            data.campaignStatus[campaignId].status = "active";
            delete data.campaignStatus[campaignId].finishedAt;
            data.campaignStatus[campaignId].archived = false;
        }

        saveData(data);

        if (guild) {
            updateServerStats(guild);
        }

        campaign.status = "active";

        await updateCampaignPanelMessage(
            interaction.guild,
            campaignId
        );

        await interaction.reply({
            content: "✅ Campaign reopened.",
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('remove_clip:')) {
      const campaignId = interaction.customId.split(':')[1];
      const data = loadData();

      const clips = getUserCampaignClips(data, interaction.user.id, campaignId);

      if (clips.length === 0) {
        await interaction.reply({
          content: '📭 You have no submitted clips for this campaign.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`remove_clip_select:${campaignId}`)
        .setPlaceholder('Select clip to remove')
        .addOptions(
          clips.slice(0, 25).map(clip => ({
            label: `${formatPlatform(clip.platform)} - @${clip.username}`.slice(0, 100),
            description: clip.videoUrl.slice(0, 100),
            value: clip.id
          }))
        );

      await interaction.reply({
        content: 'Choose the clip you want to remove.',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('remove_clip_select:')) {
      const campaignId = interaction.customId.split(':')[1];
      const clipId = interaction.values[0];
      const data = loadData();

      if (!data.clips || !data.clips[clipId]) {
        await interaction.reply({ content: '❌ Clip not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const clip = data.clips[clipId];

      if (clip.userId !== interaction.user.id) {
        await interaction.reply({ content: '❌ You can only remove your own clips.', flags: MessageFlags.Ephemeral });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const platformStats = userRecord.campaignStats?.[campaignId]?.[clip.platform];

      if (platformStats) {
        platformStats.videosPosted = Math.max(0, (platformStats.videosPosted || 0) - 1);

        if (clip.status === 'approved') {
          platformStats.videosApproved = Math.max(0, (platformStats.videosApproved || 0) - 1);
          platformStats.totalViews = Math.max(0, (platformStats.totalViews || 0) - (clip.views || 0));
          platformStats.moneyMade = Math.max(0, (platformStats.moneyMade || 0) - (clip.totalMoneyMade || 0));

          userRecord.stats.videosApproved = Math.max(0, (userRecord.stats.videosApproved || 0) - 1);
          userRecord.stats.totalViews = Math.max(0, (userRecord.stats.totalViews || 0) - (clip.views || 0));
          userRecord.stats.moneyMade = Math.max(0, (userRecord.stats.moneyMade || 0) - (clip.totalMoneyMade || 0));
        }

        if (clip.status === 'rejected') {
          platformStats.videosRejected = Math.max(0, (platformStats.videosRejected || 0) - 1);
          userRecord.stats.videosRejected = Math.max(0, (userRecord.stats.videosRejected || 0) - 1);
        }
      }

      userRecord.stats.videosPosted = Math.max(0, (userRecord.stats.videosPosted || 0) - 1);

      delete data.clips[clipId];
      saveData(data);

      await interaction.reply({
        content: `✅ Removed clip: ${clip.videoUrl}`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('leave_campaign:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_leave_campaign:${campaignId}`)
          .setLabel('Yes, Leave')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_leave_campaign')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `⚠️ Are you sure you want to leave **${campaign.name}**?`,
        components: [row],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('confirm_leave_campaign:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.update({ content: '❌ Campaign not found.', components: [] });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.update({ content: '❌ Could not load your server profile.', components: [] });
        return;
      }

      const userRecord = ensureUser(data, member);

      userRecord.campaigns = (userRecord.campaigns || []).filter(id => id !== campaignId);

      if (userRecord.campaignAccounts?.[campaignId]) {
        delete userRecord.campaignAccounts[campaignId];
      }

      if (userRecord.campaignStats?.[campaignId]) {
        delete userRecord.campaignStats[campaignId];
      }

      const campaignRole = interaction.guild.roles.cache.get(campaign.roleId);
      if (campaignRole && member.roles.cache.has(campaignRole.id)) {
        await member.roles.remove(campaignRole).catch(() => {});
      }

      saveData(data);

      await interaction.update({
        content: `✅ You left **${campaign.name}** successfully.`,
        components: []
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'cancel_leave_campaign') {
      await interaction.update({
        content: '✅ Cancelled. You are still in the campaign.',
        components: []
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('manage_account:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }
 
      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const accountText = renderCampaignAssignedAccounts(userRecord, campaignId);

      await interaction.reply({
        content:
          `⚙️ **Manage Campaign Account - ${campaign.name}**\n\n` +
          `**Current campaign accounts:**\n${accountText}\n\n` +
          `Use the campaign connect-accounts channel to add or remove accounts for this campaign.`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('clip_approve:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
      }

      const clipId = interaction.customId.split(':')[1];
      const data = loadData();
      const located = findClipRecord(data, clipId);

      if (!located) {
        return interaction.reply({ content: '❌ Clip not found.', flags: MessageFlags.Ephemeral });
      }

      const clip = located.clip;
      const sourceCollection = located.collection;

      if (clip.status === 'approved') {
        return interaction.reply({ content: '❌ This clip is already approved.', flags: MessageFlags.Ephemeral });
      }

      if (clip.status !== 'pending') {
        return interaction.reply({ content: '❌ Only pending clips can be approved.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const campaign = CAMPAIGNS[clip.campaignId];
      if (!campaign) {
        return interaction.editReply({ content: '❌ Campaign not found.' });
      }

      if (!clip.staffChannelId) {
        clip.staffChannelId = interaction.channelId;
      }

      if (!clip.staffMessageId && interaction.message) {
        clip.staffMessageId = interaction.message.id;
      }

      let latestPublicViews = Math.max(
        Number(clip.publicViews) || 0,
        Number(clip.currentViews) || 0,
        Number(clip.views) || 0,
        Number(clip.submissionViews) || 0
      );

      try {
        const metadata = await fetchClipMetadata(clip);
        if (Number.isFinite(Number(metadata?.views)) && Number(metadata.views) >= 0) {
          latestPublicViews = Math.max(latestPublicViews, Number(metadata.views));
        }

        if (campaign.separateEarningLifecycle) {
          applyTrackedMetadata(clip, metadata, data);
          latestPublicViews = Math.max(latestPublicViews, Number(clip.publicViews) || 0);
        }

        if (metadata?.title) clip.title = metadata.title;
        if (metadata?.thumbnailUrl) clip.thumbnailUrl = metadata.thumbnailUrl;
        if (metadata?.authorName) clip.platformAuthorName = metadata.authorName;
      } catch (err) {
        console.error(`Could not refresh clip ${clipId} before approval:`, err.message);
      }

      const approvedAt = Date.now();
      const rate = Number(campaign.ratePerMillion) || 0;
      const viewCap = getCampaignViewCap(campaign);
      const otherCreditedViews = viewCap === null
        ? 0
        : getCampaignCurrentCycleCreditedViews(clip.campaignId, { data, excludeClipId: clip.id });
      const latestViews = campaign.separateEarningLifecycle
        ? Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0)
        : viewCap === null
          ? latestPublicViews
          : Math.min(latestPublicViews, Math.max(viewCap - otherCreditedViews, 0));
      clip.status = 'approved';
      clip.payoutEligible = true;
      clip.wasEverApproved = true;
      clip.approvedAt = approvedAt;
      clip.publicViews = latestPublicViews;
      if (campaign.separateEarningLifecycle) clip.campaignCreditedViews = latestViews;
      clip.currentViews = latestViews;
      clip.views = latestViews;
      clip.approvalViews = latestViews;
      clip.budgetCycleIndex = Number.isFinite(Number(clip.budgetCycleIndex))
        ? Number(clip.budgetCycleIndex)
        : getClipBudgetCycleIndex(clip, campaign);
      clip.approvalCycleIndex = getCampaignBudgetCycleIndex(campaign, new Date(approvedAt));
      clip.totalMoneyMade = latestViews / 1000000 * rate;
      clip.moneyMade = clip.totalMoneyMade;
      clip.weeklyViews = latestViews;
      clip.weeklyMoneyMade = clip.totalMoneyMade;
      clip.lastChecked = approvedAt;

      data.clips ||= {};
      data.clipReviews ||= {};
      data.clips[clipId] = clip;
      if (sourceCollection === 'clipReviews') {
        delete data.clipReviews[clipId];
      }

      const userRecord = data.users?.[clip.userId];
      if (userRecord) {
        userRecord.stats ||= {};
        userRecord.stats.videosApproved = (Number(userRecord.stats.videosApproved) || 0) + 1;
        const platformStats = ensureCampaignPlatformStats(
          userRecord,
          clip.campaignId,
          clip.platform,
          clip.username || ''
        );
        platformStats.videosApproved = (Number(platformStats.videosApproved) || 0) + 1;
      }

      saveData(data);

      try {
        await updateClipStaffMessage(interaction.guild, clip);
      } catch (err) {
        console.error(`Could not update approved staff message ${clipId}:`, err.message);
      }

      try {
        const member = await interaction.guild.members.fetch(clip.userId);

        await member.send({
          embeds: [buildApprovedClipUserEmbed(clip)]
        });
      } catch (err) {
        console.error("❌ Failed to send approval DM:", err.message);
      }

      try {
        await syncPayoutCard(interaction.guild, clip.campaignId, clip.userId);
      } catch (err) {
        console.error(`Could not sync payout card for approved clip ${clipId}:`, err.message);
      }

      const guild = client.guilds.cache.get(process.env.GUILD_ID) || interaction.guild;
      if (guild && typeof updateServerStats === 'function') {
        updateServerStats(guild).catch(err => console.error('Server stats update error:', err.message));
      }
      if (guild && typeof updateLeaderboardMessage === 'function') {
        updateLeaderboardMessage(guild).catch(err => console.error('Leaderboard update error:', err.message));
      }
      if (guild && typeof updateCampaignPanelMessage === 'function') {
        try {
          await updateCampaignPanelMessage(guild, clip.campaignId);
        } catch (err) {
          console.error(`Could not refresh campaign panel ${clip.campaignId}:`, err.message);
        }
      }

      await interaction.editReply({
        content: `✅ Clip approved with ${formatNumber(latestViews)} views.`
      });
      return;
    }

    if (interaction.customId.startsWith("update_views:")) {

        const clipId = interaction.customId.split(":")[1];

        const modal = new ModalBuilder()
            .setCustomId(`update_views_modal:${clipId}`)
            .setTitle("Update Clip Views");

        const viewsInput = new TextInputBuilder()
            .setCustomId("views")
            .setLabel("Current Views")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(viewsInput)
        );

        await interaction.showModal(modal);

        return;
    }

    if (interaction.customId.startsWith("update_views_modal:")) {

        const clipId = interaction.customId.split(":")[1];

        const data = loadData();

        const clip = data.clips[clipId];

        if (!clip) {

            return interaction.reply({
                content: "❌ Clip not found.",
                flags: MessageFlags.Ephemeral
            });

        }

        const campaign = CAMPAIGNS[clip.campaignId];

        const newViews = Number(
            interaction.fields.getTextInputValue("views")
        );

        if (isNaN(newViews) || newViews < 0) {

            return interaction.reply({
                content: "❌ Invalid view count.",
                flags: MessageFlags.Ephemeral
            });

        }

        clip.views = newViews;

        clip.totalMoneyMade =
            (newViews / 1000000) *
            (campaign.ratePerMillion || 0);

        data.clips[clipId] = clip;

        saveData(data);

        const guild = client.guilds.cache.get(process.env.GUILD_ID);

        if (guild) {
            updateServerStats(guild);
        }

        await updateLeaderboardMessage(
            interaction.guild
        );

        await updateCampaignPanelMessage(
            interaction.guild,
            clip.campaignId
        );

        await updateClipStaffMessage(
            interaction.guild,
            clip
        );

        await interaction.reply({

            content:
                `✅ Views updated to ${newViews.toLocaleString()}.`,

            flags: MessageFlags.Ephemeral

        });

        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('clip_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const clipId = interaction.customId.split(':')[1];
      const data = loadData();
      const located = findClipRecord(data, clipId);

      if (!located) {
        await interaction.reply({
          content: '❌ Clip not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const clip = located.clip;

      if (clip.status === 'rejected') {
        await interaction.reply({
          content: '❌ This clip is already rejected.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (clip.status !== 'pending' && clip.status !== 'approved') {
        await interaction.reply({ content: '❌ Only pending or approved clips can be rejected.', flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`clip_reject_modal:${clipId}`)
        .setTitle('Reject Clip');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reject_reason')
        .setLabel('Reason for rejection')
        .setPlaceholder('Example: Wrong campaign, low quality, duplicate, invalid link...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('clip_reject_modal:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const clipId = interaction.customId.split(':')[1];
      const reason = interaction.fields.getTextInputValue('reject_reason').trim();

      const data = loadData();
      const located = findClipRecord(data, clipId);

      if (!located) {
        await interaction.reply({
          content: '❌ Clip not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const clip = located.clip;

      if (clip.status === 'rejected') {
        await interaction.reply({
          content: '❌ This clip is already rejected.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (clip.status !== 'pending' && clip.status !== 'approved') {
        await interaction.reply({ content: '❌ Only pending or approved clips can be rejected.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const userRecord = data.users?.[clip.userId];
      const rejectionStage = getClipRejectionStage(clip, located.collection);

      clip.status = 'rejected';
      clip.payoutEligible = false;
      clip.wasEverApproved = rejectionStage === 'post_approval';
      clip.rejectionStage = rejectionStage;
      clip.rejectReason = reason;
      clip.rejectedAt = Date.now();
      clip.rejectedBy = interaction.user.id;
      clip.trackingRetryAt = null;

      if (rejectionStage === 'pre_approval') {
        data.clipReviews ||= {};
        data.clipReviews[clipId] = clip;
        delete data.clips[clipId];
      } else {
        clip.rejectedAtViews = Math.max(Number(clip.views) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0);
        data.clips ||= {};
        data.clips[clipId] = clip;
      }

      if (userRecord) {
        if (!userRecord.stats) userRecord.stats = {};
        userRecord.stats.videosRejected = (userRecord.stats.videosRejected || 0) + 1;
        const platformStats = ensureCampaignPlatformStats(userRecord, clip.campaignId, clip.platform, clip.username || '');
        platformStats.videosRejected = (Number(platformStats.videosRejected) || 0) + 1;
      }

      saveData(data);

      try { await updateClipStaffMessage(interaction.guild, clip); }
      catch (error) { console.error(`Could not update rejected staff message ${clipId}:`, error.message); }

      if (rejectionStage === 'post_approval') {
        try { await updateCampaignPanelMessage(interaction.guild, clip.campaignId); } catch (error) { console.error(`Could not refresh campaign panel ${clip.campaignId}:`, error.message); }
        try { await updateLeaderboardMessage(interaction.guild); } catch (error) { console.error('Could not refresh leaderboard:', error.message); }
        try { await updateServerStats(interaction.guild); } catch (error) { console.error('Could not refresh server counters:', error.message); }
        try { await syncPayoutCard(interaction.guild, clip.campaignId, clip.userId); } catch (error) { console.error(`Could not refresh payout card ${clip.campaignId}:${clip.userId}:`, error.message); }
      }

      const member = await interaction.guild.members.fetch(clip.userId).catch(() => null);

      if (member) {
        await member.send({ embeds: [buildRejectedClipUserEmbed(clip, reason)] }).catch(() => {});
      }

      await interaction.editReply({
        content: `✅ Clip rejected.\nReason: ${reason}`,
        flags: MessageFlags.Ephemeral
      });
   
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("restore_clip:")) {
        if (!interaction.guild || !isAdmin(interaction.member)) {
            return interaction.reply({ content: "❌ You are not allowed to do this.", flags: MessageFlags.Ephemeral });
        }

        const clipId = interaction.customId.split(":")[1];
        const data = loadData();
        const located = findClipRecord(data, clipId);
        if (!located) {
            return interaction.reply({ content: "❌ Clip not found.", flags: MessageFlags.Ephemeral });
        }
        const clip = located.clip;
        if (clip.status !== 'rejected') {
            return interaction.reply({ content: "❌ Only rejected clips can be restored.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const rejectionStage = getClipRejectionStage(clip, located.collection);
        const campaign = CAMPAIGNS[clip.campaignId];
        const userRecord = data.users?.[clip.userId];
        const restoredAt = Date.now();
        clip.rejectionStage = null;
        clip.rejectReason = null;
        clip.rejectedAt = null;
        clip.rejectedBy = null;
        clip.restoredAt = restoredAt;
        clip.restoredBy = interaction.user.id;
        clip.lastTrackingError = null;
        clip.lastTrackingErrorAt = null;
        clip.trackingRetryAt = null;

        try {
            const metadata = await fetchClipMetadata(clip);
            if (rejectionStage === 'pre_approval') updatePendingReviewTracking(clip, metadata);
            else updateApprovedClipTracking(clip, metadata);
        } catch (error) {
            console.error(`Could not refresh restored clip ${clipId}:`, error.message);
            advanceClipNextCheckAt(clip);
        }

        if (rejectionStage === 'pre_approval') {
            clip.status = 'pending';
            clip.payoutEligible = false;
            clip.wasEverApproved = false;
            data.clipReviews ||= {};
            data.clipReviews[clipId] = clip;
            delete data.clips[clipId];
        } else {
            clip.status = 'approved';
            clip.payoutEligible = true;
            clip.wasEverApproved = true;
            data.clips ||= {};
            data.clips[clipId] = clip;
            delete data.clipReviews[clipId];
        }

        if (userRecord) {
            userRecord.stats ||= {};
            userRecord.stats.videosRejected = Math.max((Number(userRecord.stats.videosRejected) || 0) - 1, 0);
            const platformStats = ensureCampaignPlatformStats(userRecord, clip.campaignId, clip.platform, clip.username || '');
            platformStats.videosRejected = Math.max((Number(platformStats.videosRejected) || 0) - 1, 0);
        }

        saveData(data);
        try { await updateClipStaffMessage(interaction.guild, clip); }
        catch (error) { console.error(`Could not update restored staff message ${clipId}:`, error.message); }

        if (rejectionStage === 'post_approval') {
            try { await updateCampaignPanelMessage(interaction.guild, clip.campaignId); } catch (error) { console.error(`Could not refresh campaign panel ${clip.campaignId}:`, error.message); }
            try { await updateLeaderboardMessage(interaction.guild); } catch (error) { console.error('Could not refresh leaderboard:', error.message); }
            try { await updateServerStats(interaction.guild); } catch (error) { console.error('Could not refresh server counters:', error.message); }
            try { await syncPayoutCard(interaction.guild, clip.campaignId, clip.userId); } catch (error) { console.error(`Could not refresh payout card ${clip.campaignId}:${clip.userId}:`, error.message); }
        }

        await interaction.editReply({ content: "✅ Clip restored successfully." });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_account_select:')) {
       const campaignId = interaction.customId.split(':')[1];
       const campaign = CAMPAIGNS[campaignId];

       if (!campaign) {
         await interaction.reply({
           content: '❌ Campaign not found.',
           flags: MessageFlags.Ephemeral
         });
         return;
       }

       const [platform, username] = interaction.values[0].split(':');
       const data = loadData();

       const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
       if (!member) {
         await interaction.reply({
           content: '❌ Could not load your account.',
           flags: MessageFlags.Ephemeral
         });
         return;
       }

       const userRecord = ensureUser(data, member);

       // optional: block more than one account per platform for a campaign
       if (
         userRecord.campaignAccounts?.[campaignId]?.[platform] &&
         userRecord.campaignAccounts[campaignId][platform].username !== username
       ) {
         await interaction.reply({
           content: `❌ You already assigned a ${formatPlatform(platform)} account to this campaign.`,
           flags: MessageFlags.Ephemeral
         });
         return;
       }

       ensureCampaignAccount(userRecord, campaignId, platform, username);
       ensureCampaignPlatformStats(userRecord, campaignId, platform, username);

       if (!userRecord.campaigns.includes(campaignId)) {
          userRecord.campaigns.push(campaignId);
       }

       saveData(data);

       await interaction.reply({
         content: `✅ Assigned **${formatPlatform(platform)}** account **@${username}** to **${campaign.name}**.`,
         flags: MessageFlags.Ephemeral
       });

       return;
    }

    if (interaction.isButton() && interaction.customId === 'verify_human') {
      if (!interaction.guild) {
        await interaction.reply({
          content: '❌ This can only be used in the server.',
         flags: MessageFlags.Ephemeral
        });
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, interaction.member);
      userRecord.verified = true;
      saveData(data);

      const verifiedRole = interaction.guild.roles.cache.get(VERIFIED_ROLE_ID);
      const clipperRole = interaction.guild.roles.cache.get(CLIPPER_ROLE_ID);

      if (!verifiedRole) {
        await interaction.reply({
          content: '❌ VERIFIED_ROLE_ID is missing or wrong.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (!clipperRole) {
        await interaction.reply({
          content: '❌ CLIPPER_ROLE_ID is missing or wrong.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      try {
        if (!interaction.member.roles.cache.has(VERIFIED_ROLE_ID)) {
          await interaction.member.roles.add(verifiedRole);
        }

        if (!interaction.member.roles.cache.has(CLIPPER_ROLE_ID)) {
          await interaction.member.roles.add(clipperRole);
        }

        await interaction.reply({
          content: '✅ Verification successful. You now have access and the clipper role.',
          flags: MessageFlags.Ephemeral
        });
      } catch (error) {
        console.error('Role add error:', error);

        await interaction.reply({
          content:
            '❌ Verification saved, but I could not add the role.\n\n' +
            'Check: bot has Manage Roles permission, bot role is above Clipper role, and role IDs are correct.',
          flags: MessageFlags.Ephemeral
        });
      }

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('join_campaign:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`campaign_connect_platform:${campaign.id}`)
        .setPlaceholder('Choose platform')
        .addOptions(
          campaign.allowedPlatforms.map(platform => ({
            label: formatPlatform(platform),
            value: platform
          }))
        );

      await interaction.reply({
        content: `Choose platform for **${campaign.name}**`,
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_platform:')) {
      const [, campaignId] = interaction.customId.split(':');
      const platform = interaction.values[0];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`campaign_username:${campaignId}:${platform}`)
        .setTitle('Enter Username');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('campaign_username_input')
            .setLabel('Username')
            .setPlaceholder('@username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_username:')) {
      const [, campaignId, platform] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const username = normalizeUsername(
        interaction.fields.getTextInputValue('campaign_username_input')
      );

      if (!username) {
        await interaction.reply({
          content: '❌ Username cannot be empty.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

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

      // 2. Fetch staff channel mapping for this campaign
      const campaignStaffMap = data.campaignStaffChannels?.[campaignId];

      // 3. Fallback check for linkAccount (supports both data.json and static campaign fallback)
      const staffChannelId = campaignStaffMap?.linkAccount 
          || campaignStaffMap?.accountLinking 
          || campaign?.staffChannels?.linkAccount 
          || campaign?.staffChannelId;

      const staffChannel = interaction.guild.channels.cache.get(staffChannelId);

      if (!staffChannel) {
          return interaction.reply({ content: '❌ Staff channel not found.', flags: MessageFlags.Ephemeral });
      }

      const msg = await staffCh.send({
        content: renderStaffContent(app),
        components: buildStaffButtons(appId, 'pending')
      });

      app.staffMessageId = msg.id;
      data.applications[appId] = app;
      saveData(data);

      await interaction.reply({
        content: '✅ Submitted. Wait for code.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_send_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`staff_code:${appId}`)
        .setTitle('Enter Code');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('code')
            .setLabel('Code')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const code = interaction.fields.getTextInputValue('code').trim();

      app.bioCode = code;
      app.status = 'waiting_confirm';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      const sourceChannel = interaction.guild.channels.cache.get(app.sourceChannelId);
      if (!sourceChannel) {
        await interaction.reply({
          content: '❌ Original campaign channel not found.',
          flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('user_confirm:')) {
      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.user.id !== app.userId) {
        await interaction.reply({
          content: '❌ This confirmation is not for you.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      app.status = 'verifying';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: '✅ Submitted. Staff reviewing.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_accept:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const member = await interaction.guild.members.fetch(app.userId).catch(() => null);
      if (!member) {
        await interaction.reply({
          content: '❌ User not found in server.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const clipperRole = interaction.guild.roles.cache.get(CLIPPER_ROLE_ID);
      const campaignRole = interaction.guild.roles.cache.get(CAMPAIGNS[app.campaignId]?.roleId);

      if (clipperRole && !member.roles.cache.has(CLIPPER_ROLE_ID)) {
        await member.roles.add(clipperRole).catch(() => {});
      }

      if (campaignRole && !member.roles.cache.has(campaignRole.id)) {
        await member.roles.add(campaignRole).catch(() => {});
      }

      app.status = 'approved';
      data.applications[appId] = app;

      const userRecord = ensureUser(data, member);

      if (!userRecord.campaigns.includes(app.campaignId)) {
        userRecord.campaigns.push(app.campaignId);
      }

      const campaignAccount = ensureCampaignAccount(
        userRecord,
        app.campaignId,
        app.platform,
        app.username
      );

      campaignAccount.verified = true;
      campaignAccount.bioCode = app.bioCode || null;

      ensureCampaignPlatformStats(
        userRecord,
        app.campaignId,
        app.platform,
        app.username
      );

      saveData(data);
      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: `✅ <@${app.userId}> was approved for **${app.campaignName}**.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      app.status = 'rejected';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: `❌ <@${app.userId}> was rejected for **${app.campaignName}**.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  } catch (e) {
    console.error('Interaction error:', e);

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `❌ Error: ${e.message}`,
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: `❌ Error: ${e.message}`,
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      }
    }
  }
});

// connectMongo();

// ==========================================
// 🌐 OAUTH2 WEB SERVER FOR FORCED JOINING
// ==========================================

app.get('/health/instagram', (req, res) => {
  const configuration = getInstagramConfigurationStatus();
  res.json({ configured: configuration.configured, missing: configuration.missing });
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ Authorization missing.');

  try {
    // Exchange the authorization code for an Access Token
    const tokenResponse = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResponse.data.access_token;

    // Get the user's Discord ID profile details
    const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const userId = userResponse.data.id;

    // Save this tracking token to your database
    const data = loadData();
    if (!data.oauthTokens) data.oauthTokens = {};
    data.oauthTokens[userId] = accessToken;
    saveData(data);

    res.send('✅ Account Authorized Successfully! You can close this tab and return to Discord.');
  } catch (error) {
    console.error('OAuth Error:', error.response?.data || error.message);
    res.send('❌ Failed to process account connection.');
  }
});

// Start the Express Server
app.listen(PORT, () => {
  console.log(`🌐 OAuth Web Server internally listening on port ${PORT}`);
});

client.once('ready', async () => {
    console.log(`🤖 Online and registered as ${client.user.tag}`);

    // Fetch target server cleanly via environment key arrays
    const targetGuildId = process.env.GUILD_ID;
    if (!targetGuildId) {
        console.error("❌ Startup aborted: GUILD_ID environment variable is missing inside .env");
        return;
    }

    const mainGuild = client.guilds.cache.get(targetGuildId);
    if (mainGuild) {
        // Execute initial load
        await updateServerStats(mainGuild);

        // Run the timer every 5 minutes passing the cached mainGuild variable layout
        setInterval(async () => {
            const freshGuildRef = client.guilds.cache.get(targetGuildId);
            if (freshGuildRef) {
                await updateServerStats(freshGuildRef);
            }
        }, 5 * 60 * 1000);
    } else {
        console.error(`❌ Bot could not locate or access server with matching ID: ${targetGuildId}`);
    }
});

// ==========================================
// 1. SELECT & DELETE PENDING ACCOUNTS
// Command: !pendingaccounts
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith('!pendingaccounts')) return;

    if (!isAdmin(message.member)) {
        return message.reply("❌ You do not have permission to use staff commands.");
    }

    const data = loadData();
    const requests = Object.values(data.campaignAccountRequests || {});

    // Filter only pending/waiting requests
    const pendingList = requests.filter(r => r.status === 'pending' || r.status === 'waiting_confirm' || r.status === 'ready_for_review');

    if (pendingList.length === 0) {
        return message.reply("✅ There are currently no pending account verification requests.");
    }

    // Build select menu options (Limit max 25 options for Discord API limits)
    const options = pendingList.slice(0, 25).map(req => ({
        label: `@${req.username} (${formatPlatform(req.platform)})`,
        value: req.id,
        description: `User: <@${req.userId}> | Campaign: ${req.campaignName || req.campaignId}`,
        emoji: '⏳'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('staff_delete_pending_select')
        .setPlaceholder('Select a pending request to delete...')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return message.reply({
        content: `📋 **Pending Account Requests (${pendingList.length})**\nSelect a request from the dropdown below to delete it:`,
        components: [row]
    });
});

// Handle pending request deletion selection
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'staff_delete_pending_select') return;

    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
    }

    const requestId = interaction.values[0];
    const data = loadData();
    const request = data.campaignAccountRequests?.[requestId];

    if (!request) {
        return interaction.reply({ content: '❌ Selected request was not found or already deleted.', flags: MessageFlags.Ephemeral });
    }

    // Clean up staff review message if it exists
    if (request.staffChannelId && request.staffMessageId) {
        const channel = await interaction.guild.channels.fetch(request.staffChannelId).catch(() => null);
        if (channel) {
            const msg = await channel.messages.fetch(request.staffMessageId).catch(() => null);
            if (msg) await msg.delete().catch(() => {});
        }
    }

    // Remove from database
    delete data.campaignAccountRequests[requestId];
    saveData(data);

    return interaction.reply({
        content: `✅ Successfully deleted pending request for **@${request.username}** (<@${request.userId}>) on **${formatPlatform(request.platform)}**.`,
        flags: MessageFlags.Ephemeral
    });
});

// ==========================================
// 2. SELECT & DELETE LINKED ACCOUNTS BY CAMPAIGN + PLATFORM
// Command: !listaccounts <campaignID> <platform>
// Example: !listaccounts elephant youtube
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith('!listaccounts')) return;

    if (!isAdmin(message.member)) {
        return message.reply("❌ You do not have permission to use staff commands.");
    }

    const args = message.content.split(' ').filter(Boolean);
    if (args.length < 3) {
        return message.reply("❌ **Usage:** `!listaccounts <campaignID> <platform>`\n**Example:** `!listaccounts elephant youtube`");
    }

    const campaignId = args[1].toLowerCase();
    const platformRaw = args[2].toLowerCase();

    // Standardize platform key
    const platformKey = platformRaw.includes('ig') || platformRaw.includes('instagram') ? 'instagram'
                     : platformRaw.includes('tiktok') ? 'tiktok'
                     : platformRaw.includes('youtube') || platformRaw.includes('yt') ? 'youtube'
                     : platformRaw;

    const data = loadData();
    const matches = [];

    // Search users for matching linked accounts
    for (const userId in data.users) {
        const userObj = data.users[userId];
        const account = userObj.campaignAccounts?.[campaignId]?.[platformKey];

        if (account) {
            matches.push({
                userId,
                username: account.username,
                campaignId,
                platform: platformKey
            });
        }
    }

    if (matches.length === 0) {
        return message.reply(`❌ No verified accounts found for campaign \`${campaignId}\` on **${formatPlatform(platformKey)}**.`);
    }

    // Build select menu options (Max 25 items)
    const options = matches.slice(0, 25).map(item => ({
        label: `@${item.username}`,
        value: `${item.userId}:${item.campaignId}:${item.platform}`,
        description: `User ID: ${item.userId}`,
        emoji: '👤'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('staff_delete_account_select')
        .setPlaceholder(`Select a ${formatPlatform(platformKey)} account to remove...`)
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return message.reply({
        content: `🔍 **Verified Accounts for \`${campaignId}\` (${formatPlatform(platformKey)})** — Found ${matches.length}:\nSelect an account from the dropdown below to delete it:`,
        components: [row]
    });
});

// Handle account deletion selection
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'staff_delete_account_select') return;

    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
    }

    const [userId, campaignId, platform] = interaction.values[0].split(':');
    const data = loadData();
    const userRecord = data.users?.[userId];

    if (!userRecord || !userRecord.campaignAccounts?.[campaignId]?.[platform]) {
        return interaction.reply({ content: '❌ Selected account was not found in database.', flags: MessageFlags.Ephemeral });
    }

    const username = userRecord.campaignAccounts[campaignId][platform].username;

    // Remove entry
    delete userRecord.campaignAccounts[campaignId][platform];
    if (Object.keys(userRecord.campaignAccounts[campaignId]).length === 0) {
        delete userRecord.campaignAccounts[campaignId];
    }

    saveData(data);

    return interaction.reply({
        content: `✅ Successfully removed **@${username}** (<@${userId}>) from campaign \`${campaignId}\` on **${formatPlatform(platform)}**.`,
        flags: MessageFlags.Ephemeral
    });
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!fixlegacychannels')) return;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const data = loadData();
    let updatedAccounts = 0;
    let updatedClips = 0;

    // Fix legacy Account Requests
    for (const reqId in data.campaignAccountRequests) {
        const req = data.campaignAccountRequests[reqId];
        if (!req.staffChannelId) {
            const campaignStaffMap = data.campaignStaffChannels?.[req.campaignId];
            req.staffChannelId = campaignStaffMap?.linkAccount || CAMPAIGNS[req.campaignId]?.staffChannelId || null;
            updatedAccounts++;
        }
    }

    // Fix legacy Clips
    for (const clipId in data.clips) {
        const clip = data.clips[clipId];
        if (!clip.staffChannelId) {
            const platformKey = (clip.platform || '').toLowerCase();
            const channelKey = platformKey.includes('ig') || platformKey.includes('instagram') ? 'instagram'
                             : platformKey.includes('tiktok') ? 'tiktok'
                             : platformKey.includes('youtube') || platformKey.includes('yt') ? 'youtube'
                             : platformKey;

            const campaignStaffMap = data.campaignStaffChannels?.[clip.campaignId];
            clip.staffChannelId = campaignStaffMap?.[channelKey] || CAMPAIGNS[clip.campaignId]?.staffChannelId || null;
            updatedClips++;
        }
    }

    saveData(data);
    await message.reply(`✅ Migration complete! Backfilled channel IDs for **${updatedAccounts}** account requests and **${updatedClips}** clips.`);
});

client.on('messageCreate', async message => {

    if (message.author.bot) return;

    if (message.content !== '!cleanupchannels') return;

    console.log('Cleanup command received');

    await message.reply('Cleanup started...');

    const prefixes = [
        '-clipping',
        'campaign-rules',
        'updates',
        'connect-accounts',
        'guides',
        'clip-assets',
        'submit-clips',
        'chat'
    ];

    let deleted = 0;

    for (const channel of message.guild.channels.cache.values()) {

        if (channel.type !== ChannelType.GuildText) continue;

        if (prefixes.some(name => channel.name.includes(name))) {

            try {
                console.log('Deleting:', channel.name);
                await channel.delete();
                deleted++;
            } catch (err) {
                console.log('Failed:', channel.name, err.message);
            }

        }
    }

    await message.reply(`✅ Deleted ${deleted} channels.`);
});

// Your existing login statement
function buildUserClipsPage({ data, userId, page = 0, perPage = 2, displayName }) {
  const getClipTimestamp = clip => {
    const numericTimestamp = Number(clip?.submittedTimestamp);
    if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) return numericTimestamp;
    const parsedTimestamp = Date.parse(clip?.submittedAt || clip?.createdAt || '');
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
  };
  const getStatusEmoji = status => ({
    approved: '🟢',
    pending_update: '⏳',
    pending: '🟡',
    rejected: '🔴',
    removed: '⚫'
  })[String(status || '').toLowerCase()] || '⚪';
  const userClips = Object.values(data.clips || {})
    .filter(clip => String(clip.userId) === String(userId))
    .sort((a, b) => getClipTimestamp(b) - getClipTimestamp(a));

  if (!userClips.length) {
    return {
      embed: new EmbedBuilder()
        .setColor(0x7ED957)
        .setDescription("❌ You haven't submitted any video clips to track yet."),
      components: [],
      page: 0,
      totalPages: 0
    };
  }

  const totalPages = Math.ceil(userClips.length / perPage);
  const currentPage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const startIndex = currentPage * perPage;
  const pageClips = userClips.slice(startIndex, startIndex + perPage);
  const pendingUpdateCount = userClips.filter(clip => clip.status === 'pending_update').length;
  let descriptionText = `### Videos submitted by ${displayName || 'you'}\n\n`;
  descriptionText += `📊 **${userClips.length} clips total** · ${pendingUpdateCount} pending update\n\n`;

  pageClips.forEach((clip, index) => {
    const globalIndex = startIndex + index + 1;
    const platformName = clip.platform ? clip.platform.charAt(0).toUpperCase() + clip.platform.slice(1) : 'Video';
    const timeAgoText = clip.updatedAt ? 'Updated recently' : 'No recent updates';
    const likes = getClipLikes(clip);
    descriptionText += `${getStatusEmoji(clip.status)} **${globalIndex}. @${clip.username || 'user'}: [${platformName} Link](${clip.link || '#'})**\n`;
    descriptionText += `↳ **Views:** ${formatNumber(clip.views || 0)} · **Likes:** ${likes === null ? 'Not available' : formatNumber(likes)} · **$${formatNumber(clip.totalMoneyMade || 0)}** earned\n`;
    descriptionText += `*${timeAgoText}*\n\n`;
  });
  descriptionText += '**Status Legend**\n';
  descriptionText += '🟢 Updated  ⏳ Pending Update  🟡 Pending  🔴 Rejected  ⚫ Removed\n';

  const embed = new EmbedBuilder()
    .setColor(0x7ED957)
    .setDescription(descriptionText)
    .setFooter({ text: `Page ${currentPage + 1}/${totalPages}` })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`view_user_clips:${userId}:${currentPage - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId(`view_user_clips:${userId}:${currentPage + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1)
  );
  return { embed, components: [row], page: currentPage, totalPages };
}

function buildDemographicStaffReviewEmbed(submission, approvedBy) {
  const campaignName = CAMPAIGNS[submission.campaignId]?.name || submission.campaignName || `Archived Campaign (${submission.campaignId})`;
  const account = submission.account || {};
  const approverText = approvedBy ? `<@${approvedBy.id}>` : (submission.approvedBy ? `<@${submission.approvedBy}>` : 'Unknown');
  return new EmbedBuilder()
    .setColor(submission.status === 'approved' ? 0x57F287 : 0xF1C40F)
    .setTitle('🌍 Demographics Submission')
    .setDescription(
      `**User:** <@${submission.userId}> (${submission.userId})\n` +
      `**Country:** ${submission.country || 'Not recorded'}\n` +
      `**Account:** ${account.platform ? `${formatPlatform(account.platform)} ` : ''}@${account.username || 'Unknown'}\n` +
      `**Campaign:** ${cleanDropdownLabel(campaignName)}\n` +
      `**Video:** ${submission.videoUrl || 'Not recorded'}\n` +
      `**Status:** ${submission.status === 'approved' ? '✅ Approved' : 'Pending'}` +
      (submission.status === 'approved'
        ? `\n**Assigned Tier:** ${submission.demographicTier || 'Not recorded'}\n**Approved By:** ${approverText}`
        : '')
    );
}

async function updateDemographicStaffReviewMessage(guild, submission, approvedBy) {
  if (!submission.staffChannelId || !submission.staffMessageId) return;
  const channel = await guild.channels.fetch(submission.staffChannelId).catch(() => null);
  if (!channel?.messages) return;
  const message = await channel.messages.fetch(submission.staffMessageId).catch(() => null);
  if (!message) return;
  await message.edit({
    embeds: [buildDemographicStaffReviewEmbed(submission, approvedBy)],
    components: []
  });
}

async function sendDemographicApprovalDM(userId, submission) {
  try {
    const user = await client.users.fetch(userId);
    const username = `@${submission.account?.username || 'unknown'}`;
    const tier = submission.demographicTier || 'Unknown tier';
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({
        name: 'Creators Elite',
        iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
      })
      .setTitle('Your application got approved 🟩')
      .setDescription(
        `Your account ${username} has been verified and marked as part of a **${tier}** country demographic.\n\n` +
        'You can now join campaigns that require this audience type.\n\n' +
        '**Note:** This tier is based on your current audience demographics and may be adjusted later if we find it is incorrect.\n\n' +
        `If you believe your assigned tier is wrong, please open a ticket in <#${GET_HELP_CHANNEL_ID}> so our support team can review it.`
      )
      .setFooter({
        text: 'Creators Elite',
        iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
      })
      .setTimestamp();
    await user.send({ embeds: [embed] });
  } catch {
    console.warn(`Could not DM demographic approval to ${userId}`);
  }
}

function formatPaymentReceiptViews(value) {
  const views = Number(value);
  if (!Number.isFinite(views) || views < 0) return 'Not recorded';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: views >= 1_000_000 ? 1 : 0
  }).format(views);
}

function createStablePaymentReference(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `CE-${(hash >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

function getUserPaymentReceipts(data, userId) {
  const grouped = new Map();
  const clipCollections = [
    ...Object.values(data.clips || {}),
    ...Object.values(data.clipReviews || {})
  ];

  for (const clip of clipCollections) {
    if (String(clip?.userId) !== String(userId)) continue;
    const history = Array.isArray(clip.payout?.history) ? clip.payout.history : [];
    const legacyHistory = history.length ? history :
      (Number(clip.payout?.paidViews) > 0 || Number(clip.payout?.paidMoney) > 0 ? [{
        views: clip.payout.paidViews,
        amount: clip.payout.paidMoney,
        paidAt: clip.payout.lastPaidAt,
        status: 'paid'
      }] : []);

    legacyHistory.forEach((payment, index) => {
      const campaignId = payment?.campaignId || clip.campaignId || 'unknown';
      const timestampValue = payment?.paidAt || payment?.completedAt || payment?.createdAt || payment?.timestamp || payment?.date || null;
      const timestamp = Number.isFinite(Number(timestampValue))
        ? Number(timestampValue)
        : Date.parse(timestampValue || '');
      const paymentId = payment?.paymentId || payment?.transactionId || payment?.id || null;
      const groupKey = paymentId
        ? `id:${campaignId}:${paymentId}`
        : Number.isFinite(timestamp)
          ? `time:${campaignId}:${Math.floor(timestamp / 1000)}`
          : `legacy:${campaignId}:${clip.id || clip.videoUrl || index}:${index}`;
      const ratePerMillion = Number(payment?.ratePerMillion ?? payment?.payoutRate ?? CAMPAIGNS[campaignId]?.ratePerMillion);
      const views = Number(payment?.views ?? payment?.paidViews ?? 0) || 0;
      const amount = Number(payment?.amount ?? payment?.paidMoney ?? payment?.money ?? payment?.payoutAmount ?? 0) || 0;
      const existing = grouped.get(groupKey) || {
        campaignId,
        campaignName: payment?.campaignName || clip.campaignName,
        paymentId,
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
        timestampValue,
        views: 0,
        amount: 0,
        ratePerMillion: Number.isFinite(ratePerMillion) ? ratePerMillion : null,
        status: payment?.status || 'paid',
        reason: payment?.reason || payment?.error || payment?.issueReason || null,
        clips: new Set(),
        sourceKeys: []
      };
      existing.views += Math.max(views, 0);
      existing.amount += Math.max(amount, 0);
      if (!existing.campaignName) existing.campaignName = payment?.campaignName || clip.campaignName;
      if (!existing.paymentId && paymentId) existing.paymentId = paymentId;
      if (!Number.isFinite(existing.timestamp) && Number.isFinite(timestamp)) {
        existing.timestamp = timestamp;
        existing.timestampValue = timestampValue;
      }
      if (!Number.isFinite(existing.ratePerMillion) && Number.isFinite(ratePerMillion)) existing.ratePerMillion = ratePerMillion;
      if (existing.status === 'paid' && payment?.status) existing.status = payment.status;
      if (!existing.reason) existing.reason = payment?.reason || payment?.error || payment?.issueReason || null;
      existing.clips.add(clip.id || clip.videoUrl || `${campaignId}:${index}`);
      existing.sourceKeys.push(`${clip.id || clip.videoUrl || 'legacy'}:${index}:${timestampValue || ''}:${views}:${amount}`);
      grouped.set(groupKey, existing);
    });
  }

  return [...grouped.values()]
    .map(payment => ({
      ...payment,
      clips: payment.clips.size,
      paymentReference: payment.paymentId || createStablePaymentReference([
        payment.campaignId,
        payment.timestampValue || '',
        ...payment.sourceKeys.sort()
      ].join('|'))
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function buildPaymentReceiptPage(interaction, payments, page) {
  const authorName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  const author = { name: authorName, iconURL: interaction.user.displayAvatarURL() };
  if (!payments.length) {
    return {
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor(author)
        .setTitle('Detailed Overview of Your Payments')
        .setDescription("You don't have any payment history yet.\n\nOnce you receive a payout, your payment receipts will appear here.")
        .setFooter({ text: 'Powered by Creators Elite', iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png' })],
      components: []
    };
  }

  const payment = payments[page];
  const campaign = CAMPAIGNS[payment.campaignId];
  const campaignName = campaign?.name || payment.campaignName || `Archived Campaign (${payment.campaignId})`;
  const statusDetails = {
    paid: { label: '<a:appr:1534931253952909453> Paid', color: 0x57F287 },
    pending: { label: '⏳ Payment Pending', color: 0xFEE75C },
    waiting: { label: '⏳ Payment Pending', color: 0xFEE75C },
    ready: { label: '🟡 Ready for Payment', color: 0xFEE75C },
    issue: { label: '<a:cancel:1506235594303606794> Payment Error', color: 0xED4245 },
    failed: { label: '<a:cancel:1506235594303606794> Payment Error', color: 0xED4245 },
    rejected: { label: '<a:cancel:1506235594303606794> Payment Rejected', color: 0xED4245 }
  }[String(payment.status || '').toLowerCase()] || { label: '⚪ Unknown', color: 0x99AAB5 };
  const dateText = Number.isFinite(payment.timestamp)
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(payment.timestamp))
    : 'Not recorded';
  const ratePerThousand = Number.isFinite(payment.ratePerMillion) ? payment.ratePerMillion / 1000 : null;
  const reason = payment.reason ? `\n\n**Reason:** ${String(payment.reason).replace(/[\r\n]+/g, ' ').slice(0, 500)}` : '';
  const clipCount = payment.clips > 1 ? `\n**Clips:** ${payment.clips}` : '';
  const embed = new EmbedBuilder()
    .setColor(statusDetails.color)
    .setAuthor(author)
    .setTitle('Detailed Overview of Your Payments')
    .setDescription(
      `**${campaignName}**\n\n` +
      `**Expected:** $${payment.amount.toFixed(2)}\n` +
      `**Status:** ${statusDetails.label}\n` +
      `**Date:** ${dateText}\n\n` +
      `**Views Paid:** ${formatPaymentReceiptViews(payment.views)}\n` +
      `**Rate:** ${ratePerThousand === null ? 'Not recorded' : `$${ratePerThousand.toFixed(2)} / 1K Views`}\n` +
      `**Payment ID:** \`${payment.paymentReference}\`` + clipCount + reason
    )
    .setFooter({
      text: `Powered by Creators Elite • Page ${page + 1}/${payments.length}`,
      iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
    });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`payout_receipt_page:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`payout_receipt_page:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === payments.length - 1)
  );
  return { embeds: [embed], components: [row] };
}

client.login(process.env.TOKEN); 
