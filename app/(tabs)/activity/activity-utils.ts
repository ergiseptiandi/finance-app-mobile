import { computeSalaryCycleDates } from '@/components/dashboard/dashboard-utils';
import type { CategoryRecord } from '@/lib/api/categories';
import type { TransactionRecord, TransactionSummaryData, TransactionSummaryParams } from '@/lib/api/transactions';
import type { WalletRecord } from '@/lib/api/wallets';

export type ActivityFilterType = 'all' | TransactionType;
export type ActivityDateFilterMode = 'month' | 'range' | 'cycle';
export type TransactionType = 'income' | 'expense';

export type PaginationState = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type TransactionFormState = {
  id?: number;
  walletId: number | null;
  type: TransactionType;
  category: string;
  amount: string;
  date: string;
  description: string;
};

export type TransactionSection = {
  key: string;
  title: string;
  items: TransactionRecord[];
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
};

export type ActivityListFilters = {
  walletId: number | null;
  type: ActivityFilterType;
  category: string;
  dateMode: ActivityDateFilterMode;
  month: string;
  startDate: string;
  endDate: string;
};

export type ActivityCacheState = {
  summary: TransactionSummaryData;
  transactions: TransactionRecord[];
  categories: CategoryRecord[];
  wallets: WalletRecord[];
  pagination: PaginationState;
};

export const DEFAULT_SUMMARY: TransactionSummaryData = {
  total_income: 0,
  total_expense: 0,
  balance: 0,
};

export const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  perPage: 10,
  total: 0,
  totalPages: 1,
};

export const LIGHT_INCOME_ACCENT = '#0f7a52';
export const LIGHT_EXPENSE_ACCENT = '#c5651a';

const MONTH_INPUT_PATTERN = /^\d{4}-\d{2}$/;

export const getCurrentMonthInputValue = () => new Date().toISOString().slice(0, 7);
export const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

export const createDefaultActivityFilters = (salaryDay?: number): ActivityListFilters => {
  if (salaryDay && salaryDay >= 1 && salaryDay <= 31) {
    const cycleDates = computeSalaryCycleDates(salaryDay);
    return {
      walletId: null,
      type: 'all',
      category: '',
      dateMode: 'cycle',
      month: '',
      startDate: cycleDates.startDate,
      endDate: cycleDates.endDate,
    };
  }
  return {
    walletId: null,
    type: 'all',
    category: '',
    dateMode: 'month',
    month: getCurrentMonthInputValue(),
    startDate: '',
    endDate: '',
  };
};

export const createEmptyTransactionForm = (): TransactionFormState => ({
  walletId: null,
  type: 'expense',
  category: '',
  amount: '',
  date: getTodayInputValue(),
  description: '',
});

export const createTransactionListParams = (filters: ActivityListFilters, page: number, perPage: number) => ({
  page,
  per_page: perPage,
  wallet_id: filters.walletId ?? undefined,
  type: filters.type === 'all' ? undefined : filters.type,
  category: filters.category || undefined,
  month: filters.dateMode === 'month' ? filters.month : undefined,
  start_date: filters.dateMode === 'range' || filters.dateMode === 'cycle' ? filters.startDate : undefined,
  end_date: filters.dateMode === 'range' || filters.dateMode === 'cycle' ? filters.endDate : undefined,
});

export const createTransactionSummaryParams = (filters: ActivityListFilters): TransactionSummaryParams => ({
  month: filters.dateMode === 'month' ? filters.month : undefined,
  start_date: filters.dateMode === 'range' || filters.dateMode === 'cycle' ? filters.startDate : undefined,
  end_date: filters.dateMode === 'range' || filters.dateMode === 'cycle' ? filters.endDate : undefined,
});

export const createActivityCacheSuffix = (filters: ActivityListFilters) =>
  [
    filters.dateMode,
    filters.month,
    filters.startDate,
    filters.endDate,
    filters.walletId ?? 'all',
    filters.type,
    filters.category.trim().toLowerCase(),
  ].join('|');

export const sanitizeCurrencyInput = (value: string) => value.replace(/[^\d]/g, '');

export const parseCurrencyInput = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  return normalized ? Number(normalized) : 0;
};

export const formatCurrencyInput = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  if (!normalized) return '';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(normalized));
};

export const toInputDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return getTodayInputValue();
  return parsed.toISOString().slice(0, 10);
};

export const toApiDate = (value: string) => {
  const normalized = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized}T00:00:00Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? `${getTodayInputValue()}T00:00:00Z` : parsed.toISOString();
};

export const toCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

export const toSignedCurrency = (value: number, locale: string) => {
  const formatted = toCurrency(Math.abs(value), locale);
  return `${value >= 0 ? '+' : '-'}${formatted}`;
};

export const toTimeLabel = (value: string, locale: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(parsed);
};

export const toDateHeading = (value: string, locale: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.toUpperCase();
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' }).format(parsed).toUpperCase();
};

export const toPickerDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};

export const toDateInputLabel = (value: string, locale: string) => {
  const parsed = toPickerDate(value);
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' }).format(parsed);
};

export const toMonthInputLabel = (value: string, locale: string) => {
  if (!MONTH_INPUT_PATTERN.test(value)) return value;
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(parsed);
};

export const getMonthValueParts = (value: string) => {
  if (!MONTH_INPUT_PATTERN.test(value)) {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }
  const [year, month] = value.split('-').map(Number);
  return { year, monthIndex: Math.max(0, Math.min(11, month - 1)) };
};

export const toMonthValue = (year: number, monthIndex: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

export const getFilterRangeDays = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export const toTransactionForm = (record: TransactionRecord): TransactionFormState => ({
  id: record.id,
  walletId: record.wallet_id ?? null,
  type: record.type,
  category: record.category,
  amount: formatCurrencyInput(String(record.amount)),
  date: toInputDate(record.date),
  description: record.description ?? '',
});

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

export const toDaySectionKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'older';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(parsed, now)) return 'today';
  if (isSameDay(parsed, yesterday)) return 'yesterday';
  return parsed.toISOString().slice(0, 10);
};

export const isMainWalletName = (value?: string | null) => value?.trim().toLowerCase() === 'main';

export const getCategoryIcon = (category: string, colors: Record<string, string>) => {
  const key = category?.trim().toLowerCase() || '';
  const mapping = CATEGORY_ICON_MAP[key] || CATEGORY_ICON_MAP[key.replace(/\s+/g, '')];
  if (mapping) return mapping;
  if (key.includes('makan') || key.includes('makanan')) return { icon: 'food-outline', color: '#e67e22' };
  if (key.includes('transport') || key.includes('bensin')) return { icon: 'car-outline', color: '#3498db' };
  if (key.includes('belanja') || key.includes('shop')) return { icon: 'shopping-outline', color: '#9b59b6' };
  if (key.includes('tagihan') || key.includes('listrik')) return { icon: 'receipt-text-outline', color: '#e74c3c' };
  if (key.includes('gaji') || key.includes('pemasukan') || key.includes('masuk')) return { icon: 'cash-fast', color: colors.secondary || '#27ae60' };
  return { icon: 'tag-outline', color: colors.primary || '#3498db' };
};

export const CATEGORY_DEFAULT = { icon: 'label-outline', color: '#7f8c8d' };

export const getCategoryVisual = (name: string) => {
  const normalized = name.trim().toLowerCase();
  return CATEGORY_ICON_MAP[normalized] ?? CATEGORY_DEFAULT;
};

export const toDayDateQuickValues = () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const weekStart = startOfWeek.toISOString().slice(0, 10);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStart = startOfMonth.toISOString().slice(0, 10);

  return { today, yesterday: yesterdayStr, thisWeek: weekStart, startOfMonth: monthStart };
};

export const CATEGORY_ICON_MAP: Record<string, { icon: string; color: string }> = {
  makan: { icon: 'food-outline', color: '#e67e22' },
  makanan: { icon: 'food-outline', color: '#e67e22' },
  'makan siang': { icon: 'food-outline', color: '#e67e22' },
  'makan malam': { icon: 'food-outline', color: '#e67e22' },
  sarapan: { icon: 'food-outline', color: '#e67e22' },
  jajan: { icon: 'food-variant', color: '#f39c12' },
  cemilan: { icon: 'cookie-outline', color: '#f39c12' },
  snack: { icon: 'cookie-outline', color: '#f39c12' },
  kue: { icon: 'cake-variant', color: '#e91e63' },
  roti: { icon: 'bread-slice', color: '#d4a574' },
  nasi: { icon: 'rice', color: '#f1c40f' },
  susu: { icon: 'bottle-soda', color: '#ecf0f1' },
  buah: { icon: 'fruit-cherries', color: '#e74c3c' },
  sayur: { icon: 'carrot', color: '#e67e22' },
  telur: { icon: 'egg-outline', color: '#f1c40f' },
  minum: { icon: 'beer-outline', color: '#1abc9c' },
  kopi: { icon: 'coffee-outline', color: '#8B4513' },
  teh: { icon: 'tea-outline', color: '#27ae60' },
  es: { icon: 'glass-cocktail', color: '#3498db' },
  eskrim: { icon: 'ice-cream', color: '#e91e63' },
  juice: { icon: 'fruit-citrus', color: '#f39c12' },
  restoran: { icon: 'silverware-fork-knife', color: '#e67e22' },
  cafe: { icon: 'coffee-outline', color: '#8B4513' },
  foodcourt: { icon: 'food-outline', color: '#e67e22' },
  pesanantar: { icon: 'bike-fast', color: '#27ae60' },
  delivery: { icon: 'bike-fast', color: '#27ae60' },
  takeaway: { icon: 'bag-personal-outline', color: '#e67e22' },
  bumbu: { icon: 'shaker-outline', color: '#e74c3c' },
  masak: { icon: 'pot-steam', color: '#e67e22' },
  dapur: { icon: 'silverware-fork-knife', color: '#7f8c8d' },
  transportasi: { icon: 'car-outline', color: '#3498db' },
  transport: { icon: 'car-outline', color: '#3498db' },
  bensin: { icon: 'gas-station-outline', color: '#2980b9' },
  parkir: { icon: 'car-parking-lights', color: '#2980b9' },
  motor: { icon: 'motorbike', color: '#e67e22' },
  mobil: { icon: 'car-outline', color: '#2c3e50' },
  ojek: { icon: 'motorbike-electric', color: '#27ae60' },
  grab: { icon: 'car-outline', color: '#27ae60' },
  gojek: { icon: 'car-outline', color: '#27ae60' },
  taksi: { icon: 'car-taxi', color: '#f1c40f' },
  bus: { icon: 'bus', color: '#3498db' },
  kereta: { icon: 'train', color: '#34495e' },
  mrt: { icon: 'train-variant', color: '#3498db' },
  krl: { icon: 'train', color: '#3498db' },
  pesawat: { icon: 'airplane', color: '#3498db' },
  kapal: { icon: 'ferry', color: '#2980b9' },
  tol: { icon: 'highway', color: '#7f8c8d' },
  sewakendaraan: { icon: 'car-key', color: '#9b59b6' },
  rental: { icon: 'car-key', color: '#9b59b6' },
  'service motor': { icon: 'wrench-outline', color: '#e67e22' },
  servismotor: { icon: 'wrench-outline', color: '#e67e22' },
  'service mobil': { icon: 'wrench-outline', color: '#3498db' },
  servismobil: { icon: 'wrench-outline', color: '#3498db' },
  ban: { icon: 'circle-outline', color: '#34495e' },
  oli: { icon: 'oil', color: '#f1c40f' },
  pajakkendaraan: { icon: 'car', color: '#e74c3c' },
  stnk: { icon: 'car', color: '#e74c3c' },
  belanja: { icon: 'shopping-outline', color: '#9b59b6' },
  shopping: { icon: 'shopping-outline', color: '#9b59b6' },
  grocery: { icon: 'shopping-outline', color: '#9b59b6' },
  groceries: { icon: 'shopping-outline', color: '#9b59b6' },
  supermarket: { icon: 'cart-outline', color: '#27ae60' },
  minimarket: { icon: 'store-outline', color: '#27ae60' },
  indomaret: { icon: 'store-outline', color: '#27ae60' },
  alfamart: { icon: 'store-outline', color: '#27ae60' },
  tokopedia: { icon: 'shopping-outline', color: '#27ae60' },
  shopee: { icon: 'shopping-outline', color: '#e67e22' },
  lazada: { icon: 'shopping-outline', color: '#2980b9' },
  bukalapak: { icon: 'shopping-outline', color: '#e74c3c' },
  blibli: { icon: 'shopping-outline', color: '#2980b9' },
  tokoonline: { icon: 'shopping-outline', color: '#9b59b6' },
  onlineshop: { icon: 'shopping-outline', color: '#9b59b6' },
  marketplace: { icon: 'cart-outline', color: '#9b59b6' },
  pakaian: { icon: 'hanger', color: '#9b59b6' },
  clothing: { icon: 'hanger', color: '#9b59b6' },
  sepatu: { icon: 'shoe-heel', color: '#8e44ad' },
  tas: { icon: 'bag-personal-outline', color: '#9b59b6' },
  aksesoris: { icon: 'ring', color: '#f1c40f' },
  tagihan: { icon: 'receipt-text-outline', color: '#e74c3c' },
  bills: { icon: 'receipt-text-outline', color: '#e74c3c' },
  listrik: { icon: 'flash-outline', color: '#f1c40f' },
  air: { icon: 'water-outline', color: '#3498db' },
  internet: { icon: 'wifi', color: '#1abc9c' },
  server: { icon: 'server-network', color: '#34495e' },
  pulsa: { icon: 'cellphone', color: '#1abc9c' },
  langganan: { icon: 'refresh-outline', color: '#9b59b6' },
  gas: { icon: 'fire', color: '#e67e22' },
  pdam: { icon: 'water-outline', color: '#3498db' },
  pln: { icon: 'flash-outline', color: '#f1c40f' },
  telkom: { icon: 'phone-outline', color: '#3498db' },
  indihome: { icon: 'wifi', color: '#1abc9c' },
  firstmedia: { icon: 'wifi', color: '#1abc9c' },
  myrepublic: { icon: 'wifi', color: '#1abc9c' },
  bpjs: { icon: 'shield-check-outline', color: '#27ae60' },
  pajak: { icon: 'receipt-text-outline', color: '#e74c3c' },
  spp: { icon: 'school-outline', color: '#2c3e50' },
  iuran: { icon: 'account-group-outline', color: '#8e44ad' },
  telepon: { icon: 'phone-outline', color: '#3498db' },
  teleponrumah: { icon: 'phone-classic', color: '#3498db' },
  kabeltv: { icon: 'television', color: '#34495e' },
  kesehatan: { icon: 'hospital-box-outline', color: '#27ae60' },
  health: { icon: 'hospital-box-outline', color: '#27ae60' },
  obat: { icon: 'pill-outline', color: '#27ae60' },
  dokter: { icon: 'stethoscope', color: '#27ae60' },
  rumahsakit: { icon: 'hospital-building', color: '#27ae60' },
  klinik: { icon: 'hospital-box-outline', color: '#27ae60' },
  apotek: { icon: 'medical-bag', color: '#27ae60' },
  vitamin: { icon: 'pill-outline', color: '#f1c40f' },
  suplemen: { icon: 'pill-outline', color: '#f1c40f' },
  gigi: { icon: 'tooth-outline', color: '#ecf0f1' },
  mata: { icon: 'eye-outline', color: '#3498db' },
  kulit: { icon: 'bandage-outline', color: '#e67e22' },
  fisioterapi: { icon: 'human-handrail', color: '#3498db' },
  laboratorium: { icon: 'flask-outline', color: '#9b59b6' },
  operasi: { icon: 'needle', color: '#e74c3c' },
  rawatinap: { icon: 'bed-outline', color: '#3498db' },
  medical: { icon: 'medical-bag-outline', color: '#27ae60' },
  kecantikan: { icon: 'face-man-shimmer', color: '#e91e63' },
  skincare: { icon: 'bottle-tonic-outline', color: '#e91e63' },
  perawatan: { icon: 'spa-outline', color: '#e91e63' },
  pendidikan: { icon: 'school-outline', color: '#2c3e50' },
  education: { icon: 'school-outline', color: '#2c3e50' },
  kursus: { icon: 'teach', color: '#3498db' },
  les: { icon: 'teach', color: '#3498db' },
  training: { icon: 'certificate-outline', color: '#f1c40f' },
  seminar: { icon: 'account-group-outline', color: '#8e44ad' },
  workshop: { icon: 'hammer-wrench', color: '#7f8c8d' },
  buku: { icon: 'book-outline', color: '#34495e' },
  atk: { icon: 'pencil-outline', color: '#f1c40f' },
  alattulis: { icon: 'pencil-outline', color: '#f1c40f' },
  kuliah: { icon: 'school-outline', color: '#2c3e50' },
  sekolah: { icon: 'school-outline', color: '#2c3e50' },
  uangmasuk: { icon: 'school-outline', color: '#2c3e50' },
  uangsekolah: { icon: 'school-outline', color: '#2c3e50' },
  tugas: { icon: 'file-document-outline', color: '#3498db' },
  praktikum: { icon: 'flask-outline', color: '#9b59b6' },
  hiburan: { icon: 'movie-open-outline', color: '#e91e63' },
  entertainment: { icon: 'movie-open-outline', color: '#e91e63' },
  bioskop: { icon: 'movie-open-outline', color: '#e74c3c' },
  konser: { icon: 'music-note-outline', color: '#9b59b6' },
  festival: { icon: 'party-popper-outline', color: '#f39c12' },
  streaming: { icon: 'play-outline', color: '#e74c3c' },
  netflix: { icon: 'play-outline', color: '#e74c3c' },
  spotify: { icon: 'music-note-outline', color: '#1DB954' },
  youtube: { icon: 'youtube', color: '#e74c3c' },
  disney: { icon: 'play-outline', color: '#113CCF' },
  primevideo: { icon: 'play-outline', color: '#00A8E1' },
  hbo: { icon: 'play-outline', color: '#b426d7' },
  vidio: { icon: 'play-outline', color: '#e74c3c' },
  visionplus: { icon: 'play-outline', color: '#006EFF' },
  weplay: { icon: 'play-outline', color: '#f39c12' },
  game: { icon: 'gamepad-variant-outline', color: '#9b59b6' },
  games: { icon: 'gamepad-variant-outline', color: '#9b59b6' },
  mobilelegends: { icon: 'gamepad-variant-outline', color: '#3498db' },
  pubg: { icon: 'gamepad-variant-outline', color: '#f1c40f' },
  valorant: { icon: 'gamepad-variant-outline', color: '#e74c3c' },
  genshin: { icon: 'gamepad-variant-outline', color: '#f1c40f' },
  steam: { icon: 'gamepad-variant-outline', color: '#1b2838' },
  roblox: { icon: 'gamepad-variant-outline', color: '#e74c3c' },
  hobi: { icon: 'puzzle-outline', color: '#f39c12' },
  koleksi: { icon: 'star-outline', color: '#f1c40f' },
  figurine: { icon: 'human-greeting-variant', color: '#9b59b6' },
  lego: { icon: 'toy-brick-outline', color: '#f39c12' },
  musik: { icon: 'music-note-outline', color: '#9b59b6' },
  film: { icon: 'film-outline', color: '#e74c3c' },
  anime: { icon: 'animation-outline', color: '#e91e63' },
  komik: { icon: 'book-open-outline', color: '#e74c3c' },
  majalah: { icon: 'newspaper-outline', color: '#7f8c8d' },
  podcast: { icon: 'microphone-outline', color: '#9b59b6' },
  kuis: { icon: 'frequently-asked-questions', color: '#f39c12' },
  tiket: { icon: 'ticket-confirmation-outline', color: '#f1c40f' },
  rumah: { icon: 'home-outline', color: '#8e44ad' },
  house: { icon: 'home-outline', color: '#8e44ad' },
  sewa: { icon: 'home-outline', color: '#8e44ad' },
  kosan: { icon: 'home-outline', color: '#8e44ad' },
  kontrakan: { icon: 'home-outline', color: '#8e44ad' },
  furnitur: { icon: 'bed-outline', color: '#8B4513' },
  furniture: { icon: 'bed-outline', color: '#8B4513' },
  perabotan: { icon: 'sofa-outline', color: '#8B4513' },
  dekorasi: { icon: 'palette-outline', color: '#9b59b6' },
  renovasi: { icon: 'hammer-outline', color: '#7f8c8d' },
  bangun: { icon: 'hammer-outline', color: '#7f8c8d' },
  cat: { icon: 'format-paint', color: '#f1c40f' },
  material: { icon: 'box-outline', color: '#7f8c8d' },
  kebersihan: { icon: 'broom-outline', color: '#27ae60' },
  laundry: { icon: 'washing-machine-outline', color: '#3498db' },
  cucibaju: { icon: 'washing-machine-outline', color: '#3498db' },
  vacuum: { icon: 'vacuum-outline', color: '#7f8c8d' },
  sampah: { icon: 'trash-can-outline', color: '#7f8c8d' },
  perlengkapankamar: { icon: 'bed-outline', color: '#8B4513' },
  elektronik: { icon: 'television-outline', color: '#34495e' },
  electronics: { icon: 'television-outline', color: '#34495e' },
  ac: { icon: 'air-conditioner', color: '#3498db' },
  kipas: { icon: 'fan', color: '#3498db' },
  kulkas: { icon: 'fridge-outline', color: '#3498db' },
  mesincuci: { icon: 'washing-machine-outline', color: '#3498db' },
  dispenser: { icon: 'water-outline', color: '#3498db' },
  kompor: { icon: 'fire-outline', color: '#e67e22' },
  microwave: { icon: 'microwave-outline', color: '#7f8c8d' },
  oven: { icon: 'silverware-fork-knife', color: '#7f8c8d' },
  tv: { icon: 'television-outline', color: '#34495e' },
  speaker: { icon: 'speaker-outline', color: '#34495e' },
  handphone: { icon: 'cellphone', color: '#34495e' },
  laptop: { icon: 'laptop', color: '#34495e' },
  komputer: { icon: 'desktop-tower', color: '#34495e' },
  printer: { icon: 'printer-outline', color: '#7f8c8d' },
  kamera: { icon: 'camera-outline', color: '#7f8c8d' },
  kipasangin: { icon: 'fan', color: '#3498db' },
  cicilan: { icon: 'credit-card-outline', color: '#e74c3c' },
  kredit: { icon: 'credit-card-outline', color: '#e74c3c' },
  utang: { icon: 'hand-coin-outline', color: '#e74c3c' },
  piutang: { icon: 'hand-coin-outline', color: '#27ae60' },
  pinjaman: { icon: 'bank-outline', color: '#e74c3c' },
  kartukredit: { icon: 'credit-card-outline', color: '#e74c3c' },
  kartudebit: { icon: 'credit-card-outline', color: '#3498db' },
  ewallet: { icon: 'wallet-outline', color: '#9b59b6' },
  gopay: { icon: 'wallet-outline', color: '#27ae60' },
  ovo: { icon: 'wallet-outline', color: '#4C3494' },
  dana: { icon: 'wallet-outline', color: '#108EE9' },
  shopeepay: { icon: 'wallet-outline', color: '#e67e22' },
  linkaja: { icon: 'wallet-outline', color: '#e74c3c' },
  jenius: { icon: 'wallet-outline', color: '#3498db' },
  brimo: { icon: 'wallet-outline', color: '#e74c3c' },
  mandirionline: { icon: 'wallet-outline', color: '#f1c40f' },
  bcaonline: { icon: 'wallet-outline', color: '#2980b9' },
  brionline: { icon: 'wallet-outline', color: '#2980b9' },
  tabungan: { icon: 'piggy-bank-outline', color: '#27ae60' },
  deposito: { icon: 'safe-square-outline', color: '#27ae60' },
  emas: { icon: 'gem-outline', color: '#f1c40f' },
  logammulia: { icon: 'gem-outline', color: '#f1c40f' },
  saham: { icon: 'chart-line', color: '#27ae60' },
  reksadana: { icon: 'chart-line', color: '#27ae60' },
  crypto: { icon: 'bitcoin', color: '#f39c12' },
  bitcoin: { icon: 'bitcoin', color: '#f39c12' },
  ethereum: { icon: 'ethereum', color: '#627EEA' },
  asuransi: { icon: 'shield-check-outline', color: '#2980b9' },
  insurance: { icon: 'shield-check-outline', color: '#2980b9' },
  asuransijiwa: { icon: 'shield-heart-outline', color: '#2980b9' },
  asuransikesehatan: { icon: 'shield-check-outline', color: '#27ae60' },
  asuransimobil: { icon: 'shield-car-outline', color: '#3498db' },
  asuransirumah: { icon: 'shield-home-outline', color: '#8e44ad' },
  olahraga: { icon: 'dumbbell', color: '#e67e22' },
  sport: { icon: 'dumbbell', color: '#e67e22' },
  gym: { icon: 'dumbbell', color: '#e67e22' },
  fitness: { icon: 'dumbbell', color: '#e67e22' },
  yoga: { icon: 'yoga', color: '#9b59b6' },
  renang: { icon: 'swim', color: '#3498db' },
  lari: { icon: 'run', color: '#e67e22' },
  sepakbola: { icon: 'soccer-field', color: '#27ae60' },
  basket: { icon: 'basketball', color: '#e67e22' },
  bulutangkis: { icon: 'badminton', color: '#27ae60' },
  tenis: { icon: 'tennis', color: '#f1c40f' },
  cycling: { icon: 'bicycle', color: '#3498db' },
  bersepeda: { icon: 'bicycle', color: '#3498db' },
  boxing: { icon: 'boxing-glove', color: '#e74c3c' },
  beladiri: { icon: 'karate', color: '#2c3e50' },
  panahan: { icon: 'bow-and-arrow', color: '#8B4513' },
  memancing: { icon: 'fish', color: '#3498db' },
  hiking: { icon: 'hiking', color: '#27ae60' },
  camping: { icon: 'campfire', color: '#e67e22' },
  climbing: { icon: 'human-handsup', color: '#7f8c8d' },
  orangtua: { icon: 'account-group-outline', color: '#8e44ad' },
  'orang tua': { icon: 'account-group-outline', color: '#8e44ad' },
  ayah: { icon: 'account-outline', color: '#2c3e50' },
  ibu: { icon: 'account-outline', color: '#e91e63' },
  suami: { icon: 'account-outline', color: '#2c3e50' },
  istri: { icon: 'account-outline', color: '#e91e63' },
  anak: { icon: 'baby-face-outline', color: '#f39c12' },
  bayi: { icon: 'baby-carriage-outline', color: '#f39c12' },
  balita: { icon: 'baby-face-outline', color: '#f39c12' },
  saudara: { icon: 'account-group-outline', color: '#8e44ad' },
  keluarga: { icon: 'home-heart', color: '#e91e63' },
  pasangan: { icon: 'human-male-female', color: '#e91e63' },
  pacar: { icon: 'heart-outline', color: '#e91e63' },
  kakek: { icon: 'account-outline', color: '#7f8c8d' },
  nenek: { icon: 'account-outline', color: '#7f8c8d' },
  paman: { icon: 'account-outline', color: '#7f8c8d' },
  tante: { icon: 'account-outline', color: '#e91e63' },
  kakak: { icon: 'account-outline', color: '#3498db' },
  adik: { icon: 'account-outline', color: '#3498db' },
  sepupu: { icon: 'account-outline', color: '#9b59b6' },
  mertua: { icon: 'account-outline', color: '#8e44ad' },
  mantan: { icon: 'account-outline', color: '#7f8c8d' },
  teman: { icon: 'account-group-outline', color: '#3498db' },
  sahabat: { icon: 'account-group-outline', color: '#3498db' },
  guru: { icon: 'school-outline', color: '#2c3e50' },
  dosen: { icon: 'school-outline', color: '#2c3e50' },
  liburan: { icon: 'palm-tree', color: '#27ae60' },
  vacation: { icon: 'palm-tree', color: '#27ae60' },
  travel: { icon: 'airplane-takeoff', color: '#3498db' },
  wisata: { icon: 'map-marker-outline', color: '#e74c3c' },
  jalanjalan: { icon: 'walk', color: '#27ae60' },
  hotel: { icon: 'bed-outline', color: '#8e44ad' },
  penginapan: { icon: 'bed-outline', color: '#8e44ad' },
  hostel: { icon: 'bed-outline', color: '#8e44ad' },
  villa: { icon: 'home-outline', color: '#8e44ad' },
  resort: { icon: 'palm-tree', color: '#27ae60' },
  oleholeh: { icon: 'bag-personal-outline', color: '#f39c12' },
  baggage: { icon: 'bag-suitcase-outline', color: '#7f8c8d' },
  koper: { icon: 'bag-suitcase-outline', color: '#7f8c8d' },
  boardingpass: { icon: 'ticket-outline', color: '#3498db' },
  visum: { icon: 'passport-outline', color: '#2c3e50' },
  visa: { icon: 'passport-outline', color: '#2c3e50' },
  foto: { icon: 'camera-outline', color: '#7f8c8d' },
  dokumentasi: { icon: 'camera-outline', color: '#7f8c8d' },
  belajarmasak: { icon: 'pot-steam-outline', color: '#e67e22' },
  hewan: { icon: 'dog-service', color: '#8B4513' },
  peliharaan: { icon: 'dog-service', color: '#8B4513' },
  kucing: { icon: 'cat', color: '#f39c12' },
  anjing: { icon: 'dog', color: '#8B4513' },
  makananhewan: { icon: 'bone-outline', color: '#d4a574' },
  dokterhewan: { icon: 'stethoscope', color: '#27ae60' },
  vaksinhewan: { icon: 'needle', color: '#27ae60' },
  groominghewan: { icon: 'scissors-outline', color: '#9b59b6' },
  mainanhewan: { icon: 'ball-outline', color: '#f39c12' },
  aquarium: { icon: 'fish-outline', color: '#3498db' },
  gaji: { icon: 'briefcase-outline', color: '#27ae60' },
  'gaji kerja': { icon: 'briefcase-outline', color: '#27ae60' },
  'gaji freelance': { icon: 'laptop', color: '#3498db' },
  'gaji kos': { icon: 'home-heart', color: '#e91e63' },
  salary: { icon: 'briefcase-outline', color: '#27ae60' },
  bonus: { icon: 'star-outline', color: '#f1c40f' },
  thr: { icon: 'cash-fast', color: '#f1c40f' },
  THR: { icon: 'cash-fast', color: '#f1c40f' },
  komisi: { icon: 'cash-multiple', color: '#27ae60' },
  referral: { icon: 'account-plus-outline', color: '#3498db' },
  cashback: { icon: 'cash-refund', color: '#27ae60' },
  reward: { icon: 'trophy-outline', color: '#f1c40f' },
  dividen: { icon: 'chart-line', color: '#27ae60' },
  bungabank: { icon: 'percent-outline', color: '#27ae60' },
  passiveincome: { icon: 'cash-multiple', color: '#27ae60' },
  sewaproperti: { icon: 'home-heart', color: '#8e44ad' },
  penyewaan: { icon: 'home-heart', color: '#8e44ad' },
  freelance: { icon: 'laptop', color: '#3498db' },
  usaha: { icon: 'store-outline', color: '#27ae60' },
  business: { icon: 'store-outline', color: '#27ae60' },
  jual: { icon: 'sale-outline', color: '#27ae60' },
  penjualan: { icon: 'sale-outline', color: '#27ae60' },
  pemasukan: { icon: 'arrow-down-bold-outline', color: '#27ae60' },
  penghasilan: { icon: 'cash-multiple', color: '#27ae60' },
  investasi: { icon: 'chart-line', color: '#27ae60' },
  investment: { icon: 'chart-line', color: '#27ae60' },
  transfer: { icon: 'bank-transfer', color: '#3498db' },
  transferbank: { icon: 'bank-transfer', color: '#3498db' },
  setoran: { icon: 'bank-outline', color: '#27ae60' },
  'tarik tunai': { icon: 'cash-outline', color: '#7f8c8d' },
  mutasi: { icon: 'swap-horizontal-outline', color: '#7f8c8d' },
  donasi: { icon: 'hand-heart-outline', color: '#e74c3c' },
  donation: { icon: 'hand-heart-outline', color: '#e74c3c' },
  amal: { icon: 'hand-heart-outline', color: '#e74c3c' },
  zakat: { icon: 'hand-heart-outline', color: '#27ae60' },
  infak: { icon: 'hand-heart-outline', color: '#27ae60' },
  sedekah: { icon: 'hand-heart-outline', color: '#27ae60' },
  wakaf: { icon: 'hand-heart-outline', color: '#27ae60' },
  qurban: { icon: 'cow', color: '#8B4513' },
  hadiah: { icon: 'gift-outline', color: '#e91e63' },
  gift: { icon: 'gift-outline', color: '#e91e63' },
  kado: { icon: 'gift-outline', color: '#e91e63' },
  ulangtahun: { icon: 'cake-variant-outline', color: '#f39c12' },
  anniversary: { icon: 'heart-outline', color: '#e91e63' },
  valentine: { icon: 'heart-outline', color: '#e91e63' },
  natal: { icon: 'pine-tree', color: '#27ae60' },
  idulfitri: { icon: 'star-crescent', color: '#27ae60' },
  imlek: { icon: 'lantern', color: '#e74c3c' },
  tahunbaru: { icon: 'party-popper-outline', color: '#f39c12' },
  utilitas: { icon: 'tools-outline', color: '#7f8c8d' },
  utilities: { icon: 'tools-outline', color: '#7f8c8d' },
  perawatanrumah: { icon: 'hammer-wrench', color: '#7f8c8d' },
  perbaikan: { icon: 'wrench-outline', color: '#7f8c8d' },
  service: { icon: 'wrench-outline', color: '#7f8c8d' },
  maintenance: { icon: 'wrench-outline', color: '#7f8c8d' },
  instalasi: { icon: 'cog-outline', color: '#7f8c8d' },
  kendaraan: { icon: 'car-outline', color: '#2c3e50' },
  vehicle: { icon: 'car-outline', color: '#2c3e50' },
  operasional: { icon: 'cog-outline', color: '#7f8c8d' },
  pekerjaan: { icon: 'briefcase-outline', color: '#3498db' },
  kantor: { icon: 'office-building-outline', color: '#34495e' },
  bisnis: { icon: 'store-outline', color: '#27ae60' },
  denda: { icon: 'alert-outline', color: '#e74c3c' },
  penalty: { icon: 'alert-outline', color: '#e74c3c' },
  administrasi: { icon: 'file-document-outline', color: '#7f8c8d' },
  fee: { icon: 'cash-outline', color: '#7f8c8d' },
  biaya: { icon: 'cash-outline', color: '#7f8c8d' },
  biayalainnya: { icon: 'dots-horizontal', color: '#7f8c8d' },
  tip: { icon: 'hand-coin-outline', color: '#27ae60' },
  gratifikasi: { icon: 'gift-outline', color: '#f1c40f' },
  kehilangan: { icon: 'alert-circle-outline', color: '#e74c3c' },
  kerusakan: { icon: 'alert-outline', color: '#e74c3c' },
  hajatan: { icon: 'party-popper-outline', color: '#f39c12' },
  pernikahan: { icon: 'ring-outline', color: '#e91e63' },
  sunatan: { icon: 'baby-face-outline', color: '#3498db' },
  undangan: { icon: 'email-outline', color: '#f39c12' },
  acara: { icon: 'calendar-star-outline', color: '#9b59b6' },
  meeting: { icon: 'account-group-outline', color: '#34495e' },
  arisan: { icon: 'account-group-outline', color: '#e91e63' },
  patungan: { icon: 'account-group-outline', color: '#27ae60' },
  makeup: { icon: 'face-man-shimmer', color: '#e91e63' },
  kosmetik: { icon: 'bottle-tonic-outline', color: '#e91e63' },
  parfum: { icon: 'bottle-perfume', color: '#9b59b6' },
  salon: { icon: 'scissors-outline', color: '#9b59b6' },
  potongrambut: { icon: 'scissors-outline', color: '#9b59b6' },
  cukur: { icon: 'scissors-outline', color: '#7f8c8d' },
  spa: { icon: 'spa-outline', color: '#9b59b6' },
  treatment: { icon: 'spa-outline', color: '#9b59b6' },
  facial: { icon: 'face-man-shimmer', color: '#e91e63' },
  manicure: { icon: 'fingerprint', color: '#e91e63' },
  pedicure: { icon: 'foot-outline', color: '#e91e63' },
  waxing: { icon: 'spa-outline', color: '#e91e63' },
  smartphone: { icon: 'cellphone', color: '#34495e' },
  casehp: { icon: 'cellphone', color: '#7f8c8d' },
  charger: { icon: 'battery-charging', color: '#27ae60' },
  powerbank: { icon: 'battery-charge', color: '#27ae60' },
  earphone: { icon: 'headphones', color: '#34495e' },
  tws: { icon: 'headphones-bluetooth', color: '#34495e' },
};
