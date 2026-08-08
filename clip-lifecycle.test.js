const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyCampaignMembership,
  applyApprovalSnapshotAccounting,
  applyTrackedMetadata,
  assignCampaignJoinRoles,
  buildCampaignAccountApprovedEmbed,
  buildCampaignAccountRejectedEmbed,
  buildCampaignConnectAccountRow,
  buildCampaignJoinSuccessEmbed,
  buildClipStaffEmbed,
  buildClipStaffButtons,
  CAMPAIGNS,
  finalizeOutOfRunClips,
  getCampaignConnectAccountLink,
  getCampaignJoinBlockReason,
  getVerifiedCampaignPlatforms,
  getInitialSubmissionViewState,
  initializeClipTrackingFields,
  repairApprovalSnapshotInvariants,
  ensureCampaignAccount,
  shouldTrackClip,
  updateApprovedClipTracking
} = require('./index.js').__clipLifecycleTest;

const currentSubmittedTimestamp = Date.parse('2026-08-07T12:00:00.000Z');

function makeCurrentCrowderClip(overrides = {}) {
  return {
    id: 'test-clip',
    userId: 'user-1',
    campaignId: 'crowder',
    platform: 'instagram',
    videoUrl: 'https://www.instagram.com/reel/test/',
    status: 'approved',
    payoutEligible: true,
    wasEverApproved: true,
    submittedTimestamp: currentSubmittedTimestamp,
    submittedAt: new Date(currentSubmittedTimestamp).toISOString(),
    earningRunKey: 'crowder:2026-08-03T07:00:00.000Z:2026-08-31T07:00:00.000Z',
    trackingStatus: 'active',
    publicViews: 502000,
    currentViews: 502000,
    submissionViews: 502000,
    views: 0,
    campaignCreditedViews: 0,
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 502000,
      lastPublicViews: 502000,
      creditedViewsThisCycle: 0
    },
    payout: { paidViews: 0, paidMoney: 0, history: [] },
    ...overrides
  };
}

test('A: submission persists the normalized public snapshot', () => {
  assert.deepEqual(getInitialSubmissionViewState({ views: 502000 }, CAMPAIGNS.crowder), {
    publicViews: 502000,
    currentViews: 502000,
    submissionViews: 502000,
    views: 0,
    campaignCreditedViews: 0
  });
});

test('B/C: approval stores a fresh monotonic public snapshot and safely falls back', () => {
  const fresh = makeCurrentCrowderClip();
  const credited = applyApprovalSnapshotAccounting(fresh, CAMPAIGNS.crowder, { clips: {}, clipReviews: {} }, 502900, currentSubmittedTimestamp);
  assert.equal(fresh.approvalViews, 502900);
  assert.equal(fresh.currentViews, 502900);
  assert.equal(fresh.publicViews, 502900);
  assert.equal(credited, 502900);

  const fallback = makeCurrentCrowderClip();
  const safeFallback = Math.max(fallback.submissionViews, fallback.currentViews, fallback.publicViews);
  applyApprovalSnapshotAccounting(fallback, CAMPAIGNS.crowder, { clips: {}, clipReviews: {} }, safeFallback, currentSubmittedTimestamp);
  assert.equal(fallback.approvalViews, 502000);
});

test('approval preserves the public snapshot when the weekly cap limits credit', () => {
  const clip = makeCurrentCrowderClip({ id: 'approval-target' });
  const other = makeCurrentCrowderClip({
    id: 'other',
    userId: 'user-2',
    publicViews: 6900000,
    currentViews: 6900000,
    submissionViews: 6900000,
    views: 6900000,
    campaignCreditedViews: 6900000,
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 0,
      lastPublicViews: 6900000,
      creditedViewsThisCycle: 6900000
    }
  });
  const credited = applyApprovalSnapshotAccounting(
    clip,
    CAMPAIGNS.crowder,
    { clips: { [other.id]: other }, clipReviews: {} },
    502900,
    currentSubmittedTimestamp
  );
  assert.equal(clip.approvalViews, 502900);
  assert.equal(clip.currentViews, 502900);
  assert.equal(credited, 100000);
  assert.equal(clip.campaignCreditedViews, 100000);
});

test('D: a bad provider result cannot reduce public views', () => {
  const clip = makeCurrentCrowderClip({ status: 'pending', payoutEligible: false });
  applyTrackedMetadata(clip, { views: 7 }, { clips: {}, clipReviews: { [clip.id]: clip } });
  assert.equal(clip.publicViews, 502000);
  assert.equal(clip.currentViews, 502000);
});

test('E: migration repairs only an impossible approval snapshot', () => {
  const clip = makeCurrentCrowderClip({ approvalViews: 7, currentViews: 502900, publicViews: 502900 });
  const data = { clips: { [clip.id]: clip }, clipReviews: {} };
  assert.deepEqual(repairApprovalSnapshotInvariants(data), {
    impossibleApprovalSnapshots: 1,
    repairedApprovalSnapshots: 1
  });
  assert.equal(clip.approvalViews, 502000);
  assert.equal(clip.currentViews, 502900);
  assert.equal(clip.publicViews, 502900);
});

test('F: post-approval tracking never overwrites approvalViews', () => {
  const clip = makeCurrentCrowderClip({ approvalViews: 502000, campaignCreditedViews: 502000, views: 502000 });
  updateApprovedClipTracking(clip, { views: 700000 }, { clips: { [clip.id]: clip }, clipReviews: {} });
  assert.equal(clip.approvalViews, 502000);
  assert.equal(clip.currentViews, 700000);
  assert.equal(clip.publicViews, 700000);
});

test('G/H: staff embed distinguishes pending approval and completed tracking', () => {
  const pending = makeCurrentCrowderClip({ status: 'pending', payoutEligible: false, wasEverApproved: false, approvedAt: null, approvalViews: undefined });
  assert.match(buildClipStaffEmbed(pending).data.description, /Approval Views\*\*\nNot approved yet/);

  const completed = makeCurrentCrowderClip({ trackingStatus: 'completed', completedReason: 'campaign_earning_period_ended', nextCheckAt: null });
  const description = buildClipStaffEmbed(completed).data.description;
  assert.match(description, /Tracking\*\*\n✅ Completed/);
  assert.doesNotMatch(description, /Next Scheduled Check/);
  assert.equal(buildClipStaffButtons(completed)[0].components.some(button => button.data.custom_id?.startsWith('update_views:')), false);
});

test('H/I: old runs complete while current-run clips remain trackable', () => {
  const old = makeCurrentCrowderClip({
    submittedTimestamp: Date.parse('2026-07-20T12:00:00.000Z'),
    submittedAt: '2026-07-20T12:00:00.000Z',
    earningRunKey: 'crowder:old-run',
    nextCheckAt: Date.parse('2026-08-08T15:00:00.000Z')
  });
  const result = finalizeOutOfRunClips({ clips: { [old.id]: old }, clipReviews: {} }, Date.parse('2026-08-08T12:00:00.000Z'));
  assert.deepEqual(result, { completedCount: 1, changed: true });
  assert.equal(old.trackingStatus, 'completed');
  assert.equal(old.nextCheckAt, null);
  initializeClipTrackingFields(old);
  assert.equal(old.nextCheckAt, null);

  const current = makeCurrentCrowderClip();
  assert.equal(shouldTrackClip(current, CAMPAIGNS.crowder, { clips: { [current.id]: current }, clipReviews: {} }), true);
});

test('J: a fulfilled weekly cap pauses tracking without monthly completion', () => {
  const target = makeCurrentCrowderClip({ id: 'target' });
  const capped = makeCurrentCrowderClip({
    id: 'capped',
    userId: 'user-2',
    publicViews: 7000000,
    currentViews: 7000000,
    submissionViews: 7000000,
    views: 7000000,
    campaignCreditedViews: 7000000,
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 0,
      lastPublicViews: 7000000,
      creditedViewsThisCycle: 7000000
    }
  });
  const data = { clips: { target, capped }, clipReviews: {} };
  assert.equal(shouldTrackClip(target, CAMPAIGNS.crowder, data), false);
  assert.equal(target.trackingStatus, 'active');
});

test('K: staff earnings use campaign-credited views, not public views', () => {
  const clip = makeCurrentCrowderClip({
    approvalViews: 502000,
    publicViews: 502900,
    currentViews: 502900,
    views: 900,
    campaignCreditedViews: 900,
    totalMoneyMade: 999
  });
  const description = buildClipStaffEmbed(clip).data.description;
  assert.match(description, /Campaign Credited Views\*\*\n900/);
  assert.match(description, /Current Earnings\*\*\n\$0\.27/);
});

test('join A/E: membership and roles are immediate and idempotent without an account', async () => {
  const campaign = { ...CAMPAIGNS.crowder, roleId: 'campaign-role', connectAccountChannelId: 'connect-channel' };
  const heldRoles = new Set();
  const campaignRole = { id: 'campaign-role' };
  const clipperRole = { id: 'clipper-role' };
  const guild = {
    id: 'guild-1',
    roles: { cache: { get: id => id === campaignRole.id ? campaignRole : clipperRole } }
  };
  const member = {
    displayName: 'Creator',
    roles: {
      cache: { has: id => heldRoles.has(id) },
      add: async role => heldRoles.add(role.id),
      remove: async role => heldRoles.delete(role.id)
    }
  };
  const userRecord = { campaigns: [], campaignAccounts: {} };
  const roleResult = await assignCampaignJoinRoles(guild, member, campaign, { clipperRoleId: 'clipper-role-id' });
  assert.equal(roleResult.ok, true);
  assert.equal(heldRoles.has('campaign-role'), true);
  assert.equal(heldRoles.has('clipper-role'), true);

  assert.deepEqual(applyCampaignMembership(userRecord, campaign, 1000), { alreadyJoined: false });
  assert.deepEqual(applyCampaignMembership(userRecord, campaign, 2000), { alreadyJoined: true });
  assert.deepEqual(userRecord.campaigns, ['crowder']);
  assert.deepEqual(userRecord.campaignAccounts.crowder, {});
  assert.equal(userRecord.campaignMemberships.crowder.joinedAt, 1000);

  const interaction = { user: { username: 'creator' }, member, guild: { iconURL: () => null } };
  assert.match(buildCampaignJoinSuccessEmbed(interaction, campaign).data.title, /Let's Get Clipping, Creator/);
  const row = buildCampaignConnectAccountRow('guild-1', campaign, {});
  assert.equal(row.components[0].data.style, 5);
  assert.equal(row.components[0].data.custom_id, undefined);
});

test('join B/C/D/I: verified accounts gate submission but do not control membership', () => {
  const campaign = { ...CAMPAIGNS.crowder };
  const userRecord = { campaigns: [], campaignAccounts: {} };
  applyCampaignMembership(userRecord, campaign, 1000);
  assert.deepEqual(getVerifiedCampaignPlatforms(userRecord, campaign.id), []);

  const account = ensureCampaignAccount(userRecord, campaign.id, 'instagram', 'creator');
  assert.deepEqual(getVerifiedCampaignPlatforms(userRecord, campaign.id), []);
  account.verified = true;
  assert.deepEqual(getVerifiedCampaignPlatforms(userRecord, campaign.id), ['instagram']);

  delete userRecord.campaignAccounts[campaign.id].instagram;
  assert.deepEqual(userRecord.campaigns, ['crowder']);
  assert.deepEqual(getVerifiedCampaignPlatforms(userRecord, campaign.id), []);
});

test('join F: missing campaign role fails before membership is written', async () => {
  const campaign = { ...CAMPAIGNS.crowder, roleId: 'missing-role' };
  const userRecord = { campaigns: [], campaignAccounts: {} };
  const member = { roles: { cache: { has: () => false }, add: async () => {}, remove: async () => {} } };
  const result = await assignCampaignJoinRoles({ roles: { cache: { get: () => null } } }, member, campaign);
  assert.equal(result.ok, false);
  assert.deepEqual(userRecord.campaigns, []);
});

test('join G/H: finished campaigns are blocked and Connect Account uses the user-facing channel', () => {
  const campaign = { ...CAMPAIGNS.crowder, connectAccountChannelId: 'user-connect-channel' };
  assert.equal(CAMPAIGNS.crowder.connectAccountChannelId, '1521566652796240046');
  assert.equal(CAMPAIGNS.elephant.connectAccountChannelId, '1521567104552276058');
  assert.match(getCampaignJoinBlockReason(campaign, { campaignStatus: { crowder: { status: 'finished' } } }, new Date('2026-08-08T12:00:00Z')), /permanently finished/);
  assert.equal(getCampaignJoinBlockReason(campaign, {}, new Date('2026-08-08T12:00:00Z')), null);
  assert.equal(
    getCampaignConnectAccountLink('guild-id', campaign),
    'https://discord.com/channels/guild-id/user-connect-channel'
  );
  assert.equal(getCampaignConnectAccountLink('guild-id', { id: 'missing' }), null);
});

test('account decision A/B: Instagram and TikTok approvals use account-only wording', () => {
  for (const [platform, expectedPlatform] of [['instagram', 'Instagram'], ['tiktok', 'TikTok']]) {
    const embed = buildCampaignAccountApprovedEmbed({
      campaignId: 'crowder',
      campaignName: 'Legacy Name',
      platform,
      username: 'dailyclp_'
    }).data;
    assert.equal(embed.title, 'Account Verified ✅');
    assert.equal(embed.color, 0x57F287);
    assert.match(embed.description, /Steven Crowder Clipping Campaign/);
    assert.match(embed.description, /successfully verified/);
    assert.doesNotMatch(embed.description, /Campaign Approved|approved for the campaign|access the campaign channels/i);
    assert.equal(embed.fields.find(field => field.name === '🌐 Platform').value, expectedPlatform);
    assert.equal(embed.fields.find(field => field.name === '👤 Account').value, '@dailyclp\\_');
    assert.equal(embed.fields.find(field => field.name === '✅ Status').value, 'Verified');
  }
});

test('account decision C/D: rejection is account-specific and links to Connect Another Account', () => {
  const userRecord = { campaigns: ['crowder'], campaignAccounts: { crowder: {} } };
  const request = { campaignId: 'crowder', platform: 'instagram', username: 'dailyclp_' };
  const embed = buildCampaignAccountRejectedEmbed(request, 'The bio verification code could not be found.').data;
  assert.equal(embed.title, 'Account Verification Rejected ❌');
  assert.equal(embed.color, 0xED4245);
  assert.match(embed.description, /still part of the campaign/);
  assert.doesNotMatch(embed.description, /rejected from the campaign|lost access/i);
  assert.match(embed.fields.find(field => field.name === '📌 Reason').value, /bio verification code/);
  assert.deepEqual(userRecord.campaigns, ['crowder']);

  const campaign = { ...CAMPAIGNS.crowder, connectAccountChannelId: 'connect-channel' };
  const row = buildCampaignConnectAccountRow('guild-id', campaign, { label: 'Connect Another Account' });
  assert.equal(row.components[0].data.label, 'Connect Another Account');
  assert.equal(row.components[0].data.url, 'https://discord.com/channels/guild-id/connect-channel');
});

test('account decision E/F: DM failure is non-fatal and missing campaign config falls back safely', async () => {
  const request = { campaignId: 'missing-campaign', campaignName: 'Legacy Campaign', platform: 'youtube', username: 'creator' };
  const embed = buildCampaignAccountApprovedEmbed(request).data;
  assert.match(embed.description, /Legacy Campaign/);
  assert.equal(embed.fields.find(field => field.name === '🌐 Platform').value, 'YouTube');

  const accountState = { verified: true };
  const disabledDmMember = { send: async () => { throw new Error('DMs disabled'); } };
  await disabledDmMember.send({ embeds: [embed] }).catch(() => {});
  assert.equal(accountState.verified, true);
});
