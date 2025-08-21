const approvedHexes = [
  '#ff7a1a',
  '#42ffa1',
  '#2b2d31',
  '#e5e7eb',
  '#b6bbc6',
  '#0b0f1a',
  '#00b35f',
  '#ffffff',
  '#000000',
  '#000',
  '#fff',
  '#999999',
  '#fff0f0',
  '#9a9a9a',
  '#2f2f2f',
  '#ffd7d7',
  '#003366',
  '#333333',
  '#ff4f00',
  '#ff0000'
];

const disallowed = new RegExp(
  `#(?!(${approvedHexes.map((c) => c.replace('#', '')).join('|')}))(?:[0-9a-f]{3}|[0-9a-f]{6})`,
  'i'
);

export default {
  rules: {
    'declaration-property-value-disallowed-list': {
      '/.*/': [disallowed]
    }
  }
};
