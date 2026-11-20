// Menu + ingredient catalog for the grocery cart.
// Ingredient ids match backend/mercado/registry/commodities.json.
// Only the 10 "live" commodities (rice, pork, chicken, eggs, bangus, tomato, onion, calamansi,
// cabbage, eggplant) have forecast prices from the API. Every other ingredient uses `est`, a
// placeholder retail price in PHP per unit that the cart flags as an estimate. Replace these
// with real WFP prices once the backend serves them.

// unit: 'kg' | 'piece' | 'bottle' (bottle = 750 ml cooking oil)
export const INGREDIENTS = {
  pork: { name: 'Pork (liempo)', icon: '🥩', unit: 'kg', est: 250 },
  'meat-pork-with-fat': { name: 'Pork (with fat)', icon: '🥓', unit: 'kg', est: 280 },
  'meat-pork-with-bones': { name: 'Pork (with bones)', icon: '🍖', unit: 'kg', est: 240 },
  'meat-pork-hock': { name: 'Pork hock (pata)', icon: '🍖', unit: 'kg', est: 290 },
  chicken: { name: 'Chicken (whole)', icon: '🍗', unit: 'kg', est: 150 },
  'meat-beef': { name: 'Beef', icon: '🥩', unit: 'kg', est: 420 },
  'meat-beef-chops-with-bones': { name: 'Beef (chops with bones)', icon: '🥩', unit: 'kg', est: 380 },
  eggs: { name: 'Eggs', icon: '🥚', unit: 'piece', est: 8 },
  bangus: { name: 'Milkfish (bangus)', icon: '🐟', unit: 'kg', est: 140 },
  'fish-roundscad': { name: 'Roundscad (galunggong)', icon: '🐟', unit: 'kg', est: 160 },
  'fish-tilapia': { name: 'Tilapia', icon: '🐟', unit: 'kg', est: 130 },
  'fish-mackerel-fresh': { name: 'Mackerel (fresh)', icon: '🐟', unit: 'kg', est: 180 },
  'shrimp-tiger': { name: 'Shrimp (tiger)', icon: '🦐', unit: 'kg', est: 480 },
  'shrimp-endeavor': { name: 'Shrimp (endeavor)', icon: '🦐', unit: 'kg', est: 380 },
  crab: { name: 'Crab (alimasag)', icon: '🦀', unit: 'kg', est: 450 },
  rice: { name: 'Rice (regular, milled)', icon: '🍚', unit: 'kg', est: 50 },
  'rice-well-milled': { name: 'Rice (well milled)', icon: '🍚', unit: 'kg', est: 58 },
  garlic: { name: 'Garlic', icon: '🧄', unit: 'kg', est: 160 },
  'garlic-large': { name: 'Garlic (large)', icon: '🧄', unit: 'kg', est: 180 },
  'garlic-small': { name: 'Garlic (small)', icon: '🧄', unit: 'kg', est: 150 },
  onion: { name: 'Onions (red)', icon: '🧅', unit: 'kg', est: 80 },
  tomato: { name: 'Tomatoes', icon: '🍅', unit: 'kg', est: 45 },
  ginger: { name: 'Ginger', icon: '🫚', unit: 'kg', est: 150 },
  calamansi: { name: 'Calamansi', icon: '🍋', unit: 'kg', est: 55 },
  cabbage: { name: 'Cabbage', icon: '🥬', unit: 'kg', est: 50 },
  'cabbage-chinese': { name: 'Cabbage (chinese)', icon: '🥬', unit: 'kg', est: 60 },
  eggplant: { name: 'Eggplants', icon: '🍆', unit: 'kg', est: 55 },
  'water-spinach': { name: 'Water spinach (kangkong)', icon: '🥬', unit: 'kg', est: 40 },
  'beans-string': { name: 'String beans (sitaw)', icon: '🫛', unit: 'kg', est: 90 },
  taro: { name: 'Taro (gabi)', icon: '🥔', unit: 'kg', est: 80 },
  'potatoes-irish': { name: 'Potatoes (Irish)', icon: '🥔', unit: 'kg', est: 100 },
  carrots: { name: 'Carrots', icon: '🥕', unit: 'kg', est: 80 },
  papaya: { name: 'Papaya (green)', icon: '🍈', unit: 'kg', est: 35 },
  choko: { name: 'Choko (sayote)', icon: '🥒', unit: 'kg', est: 45 },
  'bottle-gourd': { name: 'Bottle gourd (upo)', icon: '🥒', unit: 'kg', est: 45 },
  'sweet-potato-leaves': { name: 'Sweet potato leaves (talbos)', icon: '🌿', unit: 'kg', est: 40 },
  'bitter-melon': { name: 'Bitter melon (ampalaya)', icon: '🥒', unit: 'kg', est: 70 },
  squashes: { name: 'Squash (kalabasa)', icon: '🎃', unit: 'kg', est: 40 },
  'beans-mung': { name: 'Mung beans', icon: '🫘', unit: 'kg', est: 110 },
  coconut: { name: 'Coconut', icon: '🥥', unit: 'kg', est: 60 },
  'bananas-saba': { name: 'Bananas (saba)', icon: '🍌', unit: 'kg', est: 45 },
  'sweet-potatoes': { name: 'Sweet potatoes (kamote)', icon: '🍠', unit: 'kg', est: 55 },
  'sugar-brown': { name: 'Sugar (brown)', icon: '🍬', unit: 'kg', est: 70 },
  'sugar-white': { name: 'Sugar (white)', icon: '🍬', unit: 'kg', est: 75 },
  'oil-cooking': { name: 'Cooking oil (750 ml)', icon: '🛢️', unit: 'bottle', est: 85 },
}

export const CATEGORIES = ['Pork & Chicken Classics', 'Seafood Dishes', 'Vegetable & Budget-Friendly Staples', 'Snacks & Desserts (Merienda)']

// items: [ingredientId, recommended quantity in the ingredient's unit (about 4 servings)].
// Where the dataset allows "A or B", the cart starts with A; B is one tap away in the Add popup.
export const DISHES = [
  { id: 'adobo', cat: 0, icon: '🍲', name: 'Adobong Baboy / Manok', items: [['pork', 0.5], ['garlic-large', 0.05], ['sugar-brown', 0.05], ['oil-cooking', 0.25], ['rice-well-milled', 0.5]] },
  { id: 'sinigang-baboy', cat: 0, icon: '🥘', name: 'Sinigang na Baboy', items: [['meat-pork-with-bones', 0.5], ['tomato', 0.25], ['onion', 0.1], ['water-spinach', 0.25], ['eggplant', 0.25], ['beans-string', 0.2], ['taro', 0.25], ['calamansi', 0.15]] },
  { id: 'menudo', cat: 0, icon: '🍛', name: 'Pork Menudo / Afritada', items: [['pork', 0.5], ['potatoes-irish', 0.25], ['carrots', 0.2], ['tomato', 0.2], ['garlic', 0.05], ['onion', 0.1], ['oil-cooking', 0.25]] },
  { id: 'tinola', cat: 0, icon: '🍜', name: 'Tinolang Manok', items: [['chicken', 0.75], ['ginger', 0.1], ['garlic', 0.05], ['onion', 0.1], ['papaya', 0.4], ['sweet-potato-leaves', 0.2]] },
  { id: 'bicol-express', cat: 0, icon: '🌶️', name: 'Bicol Express', items: [['meat-pork-with-fat', 0.5], ['coconut', 0.5], ['garlic', 0.05], ['onion', 0.1], ['ginger', 0.05], ['beans-string', 0.2]] },
  { id: 'crispy-pata', cat: 0, icon: '🍖', name: 'Crispy Pata / Paksiw na Pata', items: [['meat-pork-hock', 1], ['garlic', 0.05], ['onion', 0.1], ['sugar-brown', 0.05], ['bananas-saba', 0.3]] },

  { id: 'sinigang-bangus', cat: 1, icon: '🐟', name: 'Sinigang na Bangus / Hipon', items: [['bangus', 0.6], ['tomato', 0.25], ['onion', 0.1], ['water-spinach', 0.25], ['eggplant', 0.25], ['beans-string', 0.2], ['calamansi', 0.15]] },
  { id: 'ginataang-alimasag', cat: 1, icon: '🦀', name: 'Ginataang Alimasag / Hipon', items: [['crab', 0.6], ['coconut', 0.5], ['squashes', 0.3], ['beans-string', 0.2], ['ginger', 0.05], ['garlic', 0.05], ['onion', 0.1]] },
  { id: 'paksiw-isda', cat: 1, icon: '🍤', name: 'Paksiw na Isda / Pritong Isda', items: [['fish-roundscad', 0.5], ['ginger', 0.05], ['garlic', 0.05], ['onion', 0.1], ['bitter-melon', 0.25], ['eggplant', 0.25], ['oil-cooking', 0.25]] },
  { id: 'sarciado', cat: 1, icon: '🍳', name: 'Sarciadong Isda', items: [['fish-tilapia', 0.5], ['eggs', 2], ['tomato', 0.25], ['onion', 0.1], ['garlic', 0.05], ['oil-cooking', 0.25]] },

  { id: 'pinakbet', cat: 2, icon: '🥗', name: 'Pinakbet', items: [['squashes', 0.3], ['eggplant', 0.25], ['bitter-melon', 0.25], ['beans-string', 0.2], ['tomato', 0.2], ['garlic', 0.05], ['onion', 0.1], ['ginger', 0.05], ['pork', 0.25]] },
  { id: 'munggo', cat: 2, icon: '🫘', name: 'Ginisang Munggo', items: [['beans-mung', 0.25], ['garlic', 0.05], ['onion', 0.1], ['tomato', 0.2], ['bitter-melon', 0.2], ['pork', 0.25]] },
  { id: 'tortang-talong', cat: 2, icon: '🍆', name: 'Tortang Talong', items: [['eggplant', 0.5], ['eggs', 4], ['oil-cooking', 0.25]] },
  { id: 'ampalaya-egg', cat: 2, icon: '🥒', name: 'Ginisang Ampalaya with Egg', items: [['bitter-melon', 0.4], ['eggs', 3], ['tomato', 0.2], ['garlic', 0.05], ['onion', 0.1], ['oil-cooking', 0.25]] },
  { id: 'sayote-upo', cat: 2, icon: '🥬', name: 'Ginisang Sayote / Upo', items: [['choko', 0.5], ['garlic', 0.05], ['onion', 0.1], ['tomato', 0.2], ['pork', 0.25]] },
  { id: 'pochero', cat: 2, icon: '🍲', name: 'Pochero / Nilagang Baka', items: [['meat-beef-chops-with-bones', 0.75], ['cabbage', 0.3], ['potatoes-irish', 0.25], ['beans-string', 0.2], ['bananas-saba', 0.3], ['onion', 0.1]] },

  { id: 'turon', cat: 3, icon: '🍌', name: 'Turon / Maruya / Banana Cue', items: [['bananas-saba', 0.6], ['sugar-brown', 0.1], ['oil-cooking', 0.25]] },
  { id: 'bilo-bilo', cat: 3, icon: '🍨', name: 'Ginataang Bilo-Bilo / Halo-Halo', items: [['coconut', 0.5], ['bananas-saba', 0.3], ['sweet-potatoes', 0.3], ['taro', 0.25], ['sugar-brown', 0.15]] },
  { id: 'camote-cue', cat: 3, icon: '🍠', name: 'Camote Cue', items: [['sweet-potatoes', 0.6], ['sugar-brown', 0.15], ['oil-cooking', 0.25]] },
]

export const UNIT_LABEL = { kg: 'kg', piece: 'pc', bottle: 'bottle' }

const r2 = (n) => Math.round(n * 100) / 100

// Quantity step for the +/- buttons: whole pieces, fine grams for small amounts, then quarter units.
export function qtyStep(unit, q) {
  if (unit === 'piece') return 1
  return q < 0.5 ? 0.05 : 0.25
}
export const stepQty = (unit, q, dir) => Math.max(0, r2(q + dir * qtyStep(unit, dir < 0 ? q - 0.001 : q)))

// Starting quantity when the user adds an ingredient from the popup.
export const defaultQty = (unit) => (unit === 'piece' ? 1 : unit === 'bottle' ? 0.25 : 0.5)

export const dishCart = (dish) => Object.fromEntries(dish.items.map(([id, q]) => [id, q]))

// Unit price: live API price when the commodity has a forecast series, else the estimate.
export function unitPrice(id, byC) {
  const live = byC?.[id]
  if (live) return { price: live.price, live: true, change: null }
  return { price: INGREDIENTS[id]?.est ?? 0, live: false, change: null }
}
