export const REWARD_TIERS = [
  { type: 'donut', icon: '🍩', label: 'Donut' },
  { type: 'cookie', icon: '🍪', label: 'Cookie' },
  { type: 'lollipop', icon: '🍭', label: 'Lollipop' },
  { type: 'cupcake', icon: '🧁', label: 'Cupcake' },
  { type: 'cake', icon: '🎂', label: 'Cake' },
  { type: 'chocolate_bar', icon: '🍫', label: 'Chocolate Bar' },
  { type: 'honey_pot', icon: '🍯', label: 'Honey Pot' },
  { type: 'bubbly', icon: '🍾', label: 'Bottle of Bubbly' },
  { type: 'present', icon: '🎁', label: 'Wrapped Present' },
  { type: 'balloon', icon: '🎈', label: 'Celebration Balloon' },
  { type: 'party_popper', icon: '🎉', label: 'Party Popper' },
  { type: 'trophy', icon: '🏆', label: 'Trophy' },
  { type: 'gold_medal', icon: '🥇', label: 'Gold Medal' },
  { type: 'gem', icon: '💎', label: 'Gem' },
  { type: 'ring', icon: '💍', label: 'Ring' },
  { type: 'gold_coin', icon: '🪙', label: 'Gold Coin' },
  { type: 'bank', icon: '🏦', label: 'Bank' },
  { type: 'rocket', icon: '🚀', label: 'Rocket' },
  { type: 'star', icon: '🌟', label: 'Star' },
  { type: 'crown', icon: '👑', label: 'Crown' },
];

export function rewardBadge(type, unlocked = false, isNew = false) {
  const reward = REWARD_TIERS.find(r => r.type === type);
  if (!reward) return '';

  const tier = REWARD_TIERS.indexOf(reward) + 1;
  const classes = [
    'reward-badge',
    unlocked ? 'reward-badge--unlocked' : '',
    isNew ? 'reward-badge--new' : '',
  ].filter(Boolean).join(' ');

  return `<span class="${classes}" title="${reward.label} (${tier} perfect round${tier !== 1 ? 's' : ''})">${reward.icon}</span>`;
}

export function rewardSet(rewards = [], newRewards = []) {
  return REWARD_TIERS.map(r =>
    rewardBadge(r.type, rewards.includes(r.type), newRewards.includes(r.type))
  ).join('');
}
