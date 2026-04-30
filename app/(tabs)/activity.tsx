import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivitySkeleton } from '@/components/ui/skeleton';
import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import { listCategories, type CategoryRecord } from '@/lib/api/categories';
import {
  createTransaction,
  deleteTransaction,
  getTransactionDetail,
  getTransactionSummary,
  listTransactions,
  updateTransaction,
  type TransactionRecord,
  type TransactionSummaryParams,
  type TransactionSummaryData,
  type TransactionType,
} from '@/lib/api/transactions';
import { listWallets, type WalletRecord } from '@/lib/api/wallets';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';
import { useAppLanguage } from '@/providers/language-provider';
import { useNetworkStatus } from '@/providers/network-status-provider';

type ActivityFilterType = 'all' | TransactionType;
type ActivityDateFilterMode = 'month' | 'range';

type PaginationState = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

type TransactionFormState = {
  id?: number;
  walletId: number | null;
  type: TransactionType;
  category: string;
  amount: string;
  date: string;
  description: string;
};

type TransactionSection = {
  key: string;
  title: string;
  items: TransactionRecord[];
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
};

type ActivityListFilters = {
  walletId: number | null;
  type: ActivityFilterType;
  category: string;
  dateMode: ActivityDateFilterMode;
  month: string;
  startDate: string;
  endDate: string;
};

type ActivityCacheState = {
  summary: TransactionSummaryData;
  transactions: TransactionRecord[];
  categories: CategoryRecord[];
  wallets: WalletRecord[];
  pagination: PaginationState;
};

const DEFAULT_SUMMARY: TransactionSummaryData = {
  total_income: 0,
  total_expense: 0,
  balance: 0,
};

const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  perPage: 10,
  total: 0,
  totalPages: 1,
};

const LIGHT_INCOME_ACCENT = '#0f7a52';
const LIGHT_EXPENSE_ACCENT = '#c5651a';

const MONTH_INPUT_PATTERN = /^\d{4}-\d{2}$/;
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getCurrentMonthInputValue = () => new Date().toISOString().slice(0, 7);
const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const createDefaultActivityFilters = (): ActivityListFilters => ({
  walletId: null,
  type: 'all',
  category: '',
  dateMode: 'month',
  month: getCurrentMonthInputValue(),
  startDate: '',
  endDate: '',
});

const createEmptyTransactionForm = (): TransactionFormState => ({
  walletId: null,
  type: 'expense',
  category: '',
  amount: '',
  date: getTodayInputValue(),
  description: '',
});

const createTransactionListParams = (filters: ActivityListFilters, page: number, perPage: number) => ({
  page,
  per_page: perPage,
  wallet_id: filters.walletId ?? undefined,
  type: filters.type === 'all' ? undefined : filters.type,
  category: filters.category || undefined,
  month: filters.dateMode === 'month' ? filters.month : undefined,
  start_date: filters.dateMode === 'range' ? filters.startDate : undefined,
  end_date: filters.dateMode === 'range' ? filters.endDate : undefined,
});

const createTransactionSummaryParams = (filters: ActivityListFilters): TransactionSummaryParams => ({
  month: filters.dateMode === 'month' ? filters.month : undefined,
  start_date: filters.dateMode === 'range' ? filters.startDate : undefined,
  end_date: filters.dateMode === 'range' ? filters.endDate : undefined,
});

const createActivityCacheSuffix = (filters: ActivityListFilters) =>
  [
    filters.dateMode,
    filters.month,
    filters.startDate,
    filters.endDate,
    filters.walletId ?? 'all',
    filters.type,
    filters.category.trim().toLowerCase(),
  ].join('|');

const sanitizeCurrencyInput = (value: string) => value.replace(/[^\d]/g, '');

const parseCurrencyInput = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  return normalized ? Number(normalized) : 0;
};

const formatCurrencyInput = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  if (!normalized) {
    return '';
  }

  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(Number(normalized));
};

const toInputDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return getTodayInputValue();
  }

  return parsed.toISOString().slice(0, 10);
};

const toApiDate = (value: string) => {
  const normalized = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T00:00:00Z`;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? `${getTodayInputValue()}T00:00:00Z` : parsed.toISOString();
};

const toCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

const toSignedCurrency = (value: number, locale: string) => {
  const formatted = toCurrency(Math.abs(value), locale);
  return `${value >= 0 ? '+' : '-'}${formatted}`;
};

const toTimeLabel = (value: string, locale: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

const toDateHeading = (value: string, locale: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.toUpperCase();
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
    .format(parsed)
    .toUpperCase();
};

const toPickerDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
};

const toDateInputLabel = (value: string, locale: string) => {
  const parsed = toPickerDate(value);
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
};

const toMonthInputLabel = (value: string, locale: string) => {
  if (!MONTH_INPUT_PATTERN.test(value)) {
    return value;
  }

  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(parsed);
};

const getMonthValueParts = (value: string) => {
  if (!MONTH_INPUT_PATTERN.test(value)) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      monthIndex: now.getMonth(),
    };
  }

  const [year, month] = value.split('-').map(Number);
  return {
    year,
    monthIndex: Math.max(0, Math.min(11, month - 1)),
  };
};

const toMonthValue = (year: number, monthIndex: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

const getFilterRangeDays = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const toTransactionForm = (record: TransactionRecord): TransactionFormState => ({
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

const toDaySectionKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'older';
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(parsed, now)) {
    return 'today';
  }

  if (isSameDay(parsed, yesterday)) {
    return 'yesterday';
  }

  return parsed.toISOString().slice(0, 10);
};

const isMainWalletName = (value?: string | null) => value?.trim().toLowerCase() === 'main';

const CATEGORY_ICON_MAP: Record<string, { icon: string; color: string }> = {
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
  uangmasuk: { icon: 'arrow-down-bold-outline', color: '#27ae60' },
  pemasukan: { icon: 'arrow-down-bold-outline', color: '#27ae60' },
  penghasilan: { icon: 'cash-multiple', color: '#27ae60' },

  investasi: { icon: 'chart-line', color: '#27ae60' },
  investment: { icon: 'chart-line', color: '#27ae60' },
  transfer: { icon: 'bank-transfer-outline', color: '#3498db' },
  transferbank: { icon: 'bank-transfer-outline', color: '#3498db' },
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
  natal: { icon: 'pine-tree', color: '#27ae60' },
  tahunbaru: { icon: 'party-popper-outline', color: '#f39c12' },

  utilitas: { icon: 'tools-outline', color: '#7f8c8d' },
  utilities: { icon: 'tools-outline', color: '#7f8c8d' },
  perawatanrumah: { icon: 'hammer-wrench', color: '#7f8c8d' },
  perbaikan: { icon: 'wrench-outline', color: '#7f8c8d' },
  service: { icon: 'wrench-outline', color: '#7f8c8d' },
  maintenance: { icon: 'wrench-outline', color: '#7f8c8d' },
  instalasi: { icon: 'cog-outline', color: '#7f8c8d' },

  olahraga: { icon: 'dumbbell', color: '#e67e22' },
  pakaian: { icon: 'hanger', color: '#9b59b6' },
  clothing: { icon: 'hanger', color: '#9b59b6' },
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
  aksesorishp: { icon: 'cellphone-link', color: '#7f8c8d' },
  screenprotector: { icon: 'cellphone', color: '#7f8c8d' },
  simcard: { icon: 'sim', color: '#3498db' },
  paketdata: { icon: 'cellphone', color: '#1abc9c' },

  bensin: { icon: 'gas-station-outline', color: '#2980b9' },
  parkir: { icon: 'car-parking-lights', color: '#2980b9' },
  tol: { icon: 'highway', color: '#7f8c8d' },
  tiketmasuk: { icon: 'ticket-outline', color: '#f1c40f' },
  tiketwahana: { icon: 'ferris-wheel', color: '#e91e63' },

  zakatmal: { icon: 'hand-heart-outline', color: '#27ae60' },
  zakatfitrah: { icon: 'hand-heart-outline', color: '#27ae60' },
  infaq: { icon: 'hand-heart-outline', color: '#27ae60' },
  sodaqoh: { icon: 'hand-heart-outline', color: '#27ae60' },
  wakaf: { icon: 'hand-heart-outline', color: '#27ae60' },
  yayasan: { icon: 'hand-heart-outline', color: '#27ae60' },
  pesantren: { icon: 'school-outline', color: '#27ae60' },
  masjid: { icon: 'mosque-outline', color: '#27ae60' },

  potongiangat: { icon: 'cut-outline', color: '#e74c3c' },
  pph21: { icon: 'receipt-text-outline', color: '#e74c3c' },
  pph23: { icon: 'receipt-text-outline', color: '#e74c3c' },
  ppn: { icon: 'receipt-text-outline', color: '#e74c3c' },
  pajakbadan: { icon: 'receipt-text-outline', color: '#e74c3c' },
  pajakusaha: { icon: 'receipt-text-outline', color: '#e74c3c' },

  asuransijiwa: { icon: 'shield-heart-outline', color: '#2980b9' },
  asuransikesehatan: { icon: 'shield-check-outline', color: '#27ae60' },
  asuransimobil: { icon: 'shield-car-outline', color: '#3498db' },
  asuransitriip: { icon: 'shield-airplane-outline', color: '#3498db' },
  bpjskesehatan: { icon: 'shield-check-outline', color: '#27ae60' },
  bpjsketenagakerjaan: { icon: 'shield-check-outline', color: '#27ae60' },
  dplk: { icon: 'shield-check-outline', color: '#27ae60' },

  patokantugas: { icon: 'clock-outline', color: '#7f8c8d' },
  uangjajan: { icon: 'food-outline', color: '#e67e22' },
  uangmakan: { icon: 'food-outline', color: '#e67e22' },
  uangtransport: { icon: 'car-outline', color: '#3498db' },
  uangjajan: { icon: 'food-outline', color: '#e67e22' },
  jajan: { icon: 'food-variant', color: '#f39c12' },

  mainan: { icon: 'toy-brick-outline', color: '#f39c12' },
  lego: { icon: 'toy-brick-outline', color: '#f39c12' },
  actionfigure: { icon: 'human-greeting-variant', color: '#9b59b6' },
  popmart: { icon: 'human-greeting-variant', color: '#e91e63' },
  blindbox: { icon: 'gift-outline', color: '#9b59b6' },
  sticker: { icon: 'sticker-outline', color: '#f39c12' },
  jurnaling: { icon: 'notebook-outline', color: '#3498db' },
  scrapbook: { icon: 'book-open-outline', color: '#9b59b6' },
  merajut: { icon: 'yarn', color: '#e67e22' },
  origami: { icon: 'paper-outline', color: '#3498db' },
  painting: { icon: 'palette-outline', color: '#9b59b6' },
  menggambar: { icon: 'pencil-outline', color: '#f39c12' },
  fotografi: { icon: 'camera-outline', color: '#7f8c8d' },
  videografi: { icon: 'video-outline', color: '#7f8c8d' },
  editing: { icon: 'image-edit-outline', color: '#9b59b6' },
  desain: { icon: 'palette-outline', color: '#9b59b6' },
  coding: { icon: 'code-outline', color: '#3498db' },
  programming: { icon: 'code-outline', color: '#3498db' },
  ngeblog: { icon: 'pencil-outline', color: '#3498db' },
  writing: { icon: 'pencil-outline', color: '#34495e' },

  berlangganan: { icon: 'refresh-outline', color: '#9b59b6' },
  subscription: { icon: 'refresh-outline', color: '#9b59b6' },
  membership: { icon: 'card-account-details-outline', color: '#9b59b6' },
  keanggotaan: { icon: 'card-account-details-outline', color: '#9b59b6' },

  sedang: { icon: 'dots-horizontal', color: '#7f8c8d' },
  lainnya: { icon: 'dots-horizontal', color: '#7f8c8d' },
  other: { icon: 'dots-horizontal', color: '#7f8c8d' },
  miscellaneous: { icon: 'dots-horizontal', color: '#7f8c8d' },
  takterduga: { icon: 'alert-circle-outline', color: '#e74c3c' },
  emergency: { icon: 'alert-circle-outline', color: '#e74c3c' },
  darurat: { icon: 'alert-circle-outline', color: '#e74c3c' },
  cash: { icon: 'cash-outline', color: '#27ae60' },
  tunai: { icon: 'cash-outline', color: '#27ae60' },
  uang: { icon: 'cash-outline', color: '#27ae60' },
  koin: { icon: 'coin-outline', color: '#f1c40f' },
  receh: { icon: 'coin-outline', color: '#f1c40f' },
};

const CATEGORY_DEFAULT = { icon: 'label-outline', color: '#7f8c8d' };

const getCategoryVisual = (name: string) => {
  const normalized = name.trim().toLowerCase();
  return CATEGORY_ICON_MAP[normalized] ?? CATEGORY_DEFAULT;
};

const toDayDateQuickValues = () => {
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

function SummaryStat({
  colors,
  title,
  value,
  meta,
  metaTone = 'muted',
  accent = 'primary',
  showProgress = false,
  progress = 0,
}: {
  colors: AppColorTheme;
  title: string;
  value: string;
  meta: string;
  metaTone?: 'muted' | 'positive';
  accent?: 'primary' | 'secondary' | 'teal';
  showProgress?: boolean;
  progress?: number;
}) {
  const isLight = colors === Colors.light;
  const accentMap = {
    primary: {
      background: alpha(colors.primary, isLight ? 0.08 : 0.14),
      fill: colors.primary,
      borderColor: alpha(colors.primary, isLight ? 0.14 : 0.24),
      metaColor: isLight ? LIGHT_EXPENSE_ACCENT : colors.secondaryAccent,
    },
    secondary: {
      background: isLight ? colors.shellCardSoft : alpha(colors.surfaceContainerHigh, 0.16),
      fill: isLight ? colors.primary : colors.primaryContainer,
      borderColor: alpha(colors.primary, isLight ? 0.08 : 0.18),
      metaColor: colors.shellTextSecondary,
    },
    teal: {
      background: alpha(isLight ? LIGHT_INCOME_ACCENT : colors.secondary, isLight ? 0.08 : 0.12),
      fill: isLight ? LIGHT_INCOME_ACCENT : colors.secondaryAccent,
      borderColor: alpha(isLight ? LIGHT_INCOME_ACCENT : colors.secondary, isLight ? 0.14 : 0.22),
      metaColor: isLight ? LIGHT_INCOME_ACCENT : colors.secondary,
    },
  } as const;

  const palette = accentMap[accent];

  return (
    <View
      style={[
        summaryStyles(colors).card,
        { backgroundColor: palette.background, borderColor: palette.borderColor },
      ]}>
      <Text style={summaryStyles(colors).title}>{title}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={summaryStyles(colors).value}>
        {value}
      </Text>
      {showProgress ? (
        <View style={summaryStyles(colors).progressTrack}>
          <View
            style={[
              summaryStyles(colors).progressFill,
              { width: `${Math.max(8, progress)}%`, backgroundColor: palette.fill },
            ]}
          />
        </View>
      ) : null}
      <Text
        style={[
          summaryStyles(colors).meta,
          { color: metaTone === 'positive' ? palette.metaColor : colors.shellTextMuted },
        ]}>
        {meta}
      </Text>
    </View>
  );
}

function TransactionDaySummary({
  colors,
  locale,
  income,
  expense,
  net,
  incomeLabel,
  expenseLabel,
  netLabel,
}: {
  colors: AppColorTheme;
  locale: string;
  income: number;
  expense: number;
  net: number;
  incomeLabel: string;
  expenseLabel: string;
  netLabel: string;
}) {
  const isLight = colors === Colors.light;
  const incomeTone = isLight ? LIGHT_INCOME_ACCENT : colors.secondaryAccent;
  const expenseTone = isLight ? LIGHT_EXPENSE_ACCENT : colors.primaryContainer;
  const netTone = net >= 0 ? incomeTone : expenseTone;

  return (
    <View style={daySummaryStyles(colors).card}>
      <View style={daySummaryStyles(colors).row}>
        <Text style={daySummaryStyles(colors).label}>{incomeLabel}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[daySummaryStyles(colors).value, { color: incomeTone }]}
        >
          {toCurrency(income, locale)}
        </Text>
      </View>

      <View style={daySummaryStyles(colors).divider} />

      <View style={daySummaryStyles(colors).row}>
        <Text style={daySummaryStyles(colors).label}>{expenseLabel}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[daySummaryStyles(colors).value, { color: expenseTone }]}
        >
          {toCurrency(expense, locale)}
        </Text>
      </View>

      <View style={daySummaryStyles(colors).divider} />

      <View style={daySummaryStyles(colors).row}>
        <Text style={daySummaryStyles(colors).label}>{netLabel}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[daySummaryStyles(colors).value, { color: netTone }]}
        >
          {toSignedCurrency(net, locale)}
        </Text>
      </View>
    </View>
  );
}

function TransactionRow({
  record,
  colors,
  locale,
  statusLabel,
  incomeLabel,
  expenseLabel,
  onPress,
}: {
  record: TransactionRecord;
  colors: AppColorTheme;
  locale: string;
  statusLabel: string;
  incomeLabel: string;
  expenseLabel: string;
  onPress: () => void;
}) {
  const isIncome = record.type === 'income';
  const isLight = colors === Colors.light;
  const rowAccent = isIncome
    ? isLight
      ? LIGHT_INCOME_ACCENT
      : colors.secondaryAccent
    : isLight
      ? LIGHT_EXPENSE_ACCENT
      : colors.primaryContainer;
  const iconColor = rowAccent;
  const iconBackground = alpha(rowAccent, isLight ? 0.14 : 0.18);
  const amount = toSignedCurrency(isIncome ? record.amount : -record.amount, locale);
  const subtitleBase = record.description?.trim() || (isIncome ? incomeLabel : expenseLabel);
  const subtitle = `${subtitleBase} • ${toTimeLabel(record.date, locale)}`;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [rowStyles(colors).card, pressed && rowStyles(colors).pressed]}>
      <View style={rowStyles(colors).left}>
        <View style={[rowStyles(colors).iconWrap, { backgroundColor: iconBackground }]}>
          <MaterialCommunityIcons name={isIncome ? 'cash-fast' : 'cart-outline'} size={20} color={iconColor} />
        </View>

        <View style={rowStyles(colors).copy}>
          <Text numberOfLines={2} style={rowStyles(colors).title}>
            {record.category}
          </Text>
          <Text numberOfLines={2} style={rowStyles(colors).subtitle}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={rowStyles(colors).right}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.74}
          style={[rowStyles(colors).amount, isIncome && { color: rowAccent }]}>
          {amount}
        </Text>
        <View
          style={[
            rowStyles(colors).statusChip,
            {
              backgroundColor: alpha(rowAccent, isLight ? 0.12 : 0.18),
            },
          ]}>
          <Text
            style={[
              rowStyles(colors).statusText,
              {
                color: rowAccent,
              },
            ]}>
            {statusLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ActivityScreen() {
  const searchParams = useLocalSearchParams<{ compose?: string }>();
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { language, t } = useAppLanguage();
  const { isOffline } = useNetworkStatus();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const styles = createStyles(colors, insets.top, insets.bottom);
  const isLight = colors === Colors.light;

  const [summary, setSummary] = useState<TransactionSummaryData>(DEFAULT_SUMMARY);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [filters, setFilters] = useState<ActivityListFilters>(createDefaultActivityFilters);
  const [draftFilters, setDraftFilters] = useState<ActivityListFilters>(createDefaultActivityFilters);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [detailViewVisible, setDetailViewVisible] = useState(false);
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<TransactionRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [editDeleteConfirmVisible, setEditDeleteConfirmVisible] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<TransactionFormState>(createEmptyTransactionForm);
  const [iosDatePickerVisible, setIosDatePickerVisible] = useState(false);
  const [iosFilterDatePickerVisible, setIosFilterDatePickerVisible] = useState(false);
  const [filterDateTarget, setFilterDateTarget] = useState<'startDate' | 'endDate' | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const keyboardOpen = keyboardHeight > 0;
  const modalLift = keyboardOpen ? Math.max(36, keyboardHeight - insets.bottom + 28) : 0;
  const hasActivitySnapshot = Boolean(
    transactions.length ||
      categories.length ||
      pagination.total ||
      summary.total_income ||
      summary.total_expense ||
      summary.balance
  );
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchFocused(false);
    setSearchInputKey((current) => current + 1);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateActivityCache = async () => {
      const session = await getAuthSession();

      if (!session || !active) {
        return;
      }

      const cached = await readScreenCache<ActivityCacheState>(
        buildScreenCacheKey('activity', session.user.id, createActivityCacheSuffix(filters))
      );

      if (!cached || !active) {
        return;
      }

      setSummary(cached.data.summary);
      setTransactions(cached.data.transactions);
      setCategories(cached.data.categories);
      setWallets(cached.data.wallets ?? []);
      setPagination(cached.data.pagination);
      setLoading(false);
    };

    hydrateActivityCache();

    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => {
    const compose = Array.isArray(searchParams.compose) ? searchParams.compose[0] : searchParams.compose;

    if (compose !== 'income' && compose !== 'expense') {
      return;
    }

    setTransactionModalVisible(true);
    const defaultWalletId = wallets.find((wallet) => isMainWalletName(wallet.name))?.id ?? null;
    setForm((current) => ({
      ...createEmptyTransactionForm(),
      type: compose,
      walletId: compose === 'income' ? defaultWalletId : current.walletId,
    }));

    router.setParams({ compose: undefined });
  }, [searchParams.compose, wallets]);

  const withAuthorizedRequest = useCallback(
    async <T,>(task: (accessToken: string) => Promise<T>) => {
      const session = await getAuthSession();

      if (!session) {
        router.replace('/login');
        throw new Error('missing_session');
      }

      try {
        return await task(session.token.access_token);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401 && session.token.refresh_token) {
          const refreshed = await refreshStoredAuthSession();
          if (refreshed) {
            return task(refreshed.token.access_token);
          }
        }

        if (error instanceof ApiRequestError && error.status === 401) {
          router.replace('/login');
        }

        throw error;
      }
    },
    []
  );

  const loadActivity = useCallback(
    async (isRefresh = false) => {
      const shouldShowSkeleton = !isRefresh && !hasActivitySnapshot;

      if (isRefresh) {
        setRefreshing(true);
      } else if (shouldShowSkeleton) {
        setLoading(true);
      }

      setError('');

      try {
        const session = await getAuthSession();
        if (!session) {
          router.replace('/login');
          return;
        }

        const [summaryResponse, transactionResponse, categoryResponse, walletResponse] = await withAuthorizedRequest((accessToken) =>
          Promise.allSettled([
            getTransactionSummary(accessToken, createTransactionSummaryParams(filters)),
            listTransactions(accessToken, createTransactionListParams(filters, 1, 10)),
            listCategories(accessToken),
            listWallets(accessToken),
          ])
        );

        if (
          summaryResponse.status !== 'fulfilled' ||
          transactionResponse.status !== 'fulfilled' ||
          categoryResponse.status !== 'fulfilled'
        ) {
          throw new Error('load_failed');
        }

        setSummary(summaryResponse.value.Data ?? DEFAULT_SUMMARY);
        setTransactions(transactionResponse.value.Data.data ?? []);
        setCategories(categoryResponse.value.Data ?? []);
        setWallets(walletResponse.status === 'fulfilled' ? walletResponse.value.Data ?? [] : []);
        setPagination({
          page: transactionResponse.value.Data.page ?? 1,
          perPage: transactionResponse.value.Data.per_page ?? 10,
          total: transactionResponse.value.Data.total ?? 0,
          totalPages: transactionResponse.value.Data.total_pages ?? 1,
        });

        await writeScreenCache(
          buildScreenCacheKey('activity', session.user.id, createActivityCacheSuffix(filters)),
          {
            summary: summaryResponse.value.Data ?? DEFAULT_SUMMARY,
            transactions: transactionResponse.value.Data.data ?? [],
            categories: categoryResponse.value.Data ?? [],
            wallets: walletResponse.status === 'fulfilled' ? walletResponse.value.Data ?? [] : [],
            pagination: {
              page: transactionResponse.value.Data.page ?? 1,
              perPage: transactionResponse.value.Data.per_page ?? 10,
              total: transactionResponse.value.Data.total ?? 0,
              totalPages: transactionResponse.value.Data.total_pages ?? 1,
            },
          }
        );
      } catch (loadError) {
        if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
          if (isOffline && hasActivitySnapshot) {
            setError('');
            return;
          }

          setError(isOffline ? t('common.offlineLoadError') : t('activity.transactions.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, hasActivitySnapshot, isOffline, t, withAuthorizedRequest]
  );

  useFocusEffect(
    useCallback(() => {
      loadActivity();
    }, [loadActivity])
  );

  useEffect(() => {
    if (!transactionModalVisible) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [transactionModalVisible]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || pagination.page >= pagination.totalPages) {
      return;
    }

    setLoadingMore(true);
    setError('');

    try {
      const response = await withAuthorizedRequest((accessToken) =>
        listTransactions(
          accessToken,
          createTransactionListParams(filters, pagination.page + 1, pagination.perPage)
        )
      );

      setTransactions((current) => [...current, ...(response.Data.data ?? [])]);
      setPagination({
        page: response.Data.page ?? pagination.page + 1,
        perPage: response.Data.per_page ?? pagination.perPage,
        total: response.Data.total ?? pagination.total,
        totalPages: response.Data.total_pages ?? pagination.totalPages,
      });
    } catch (loadError) {
      if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
        if (isOffline && hasActivitySnapshot) {
          return;
        }

        setError(isOffline ? t('common.offlineLoadError') : t('activity.transactions.loadMoreError'));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [filters, hasActivitySnapshot, isOffline, loading, loadingMore, pagination, t, withAuthorizedRequest]);

  const resetTransactionForm = useCallback(() => {
    setForm(createEmptyTransactionForm());
    setIosDatePickerVisible(false);
    setFormError('');
  }, []);

  const openCreateModal = useCallback(() => {
    resetTransactionForm();
    setTransactionModalVisible(true);
  }, [resetTransactionForm]);

  const openEditModal = useCallback(
    async (id: number) => {
      setTransactionModalVisible(true);
      setDetailLoading(true);
      setIosDatePickerVisible(false);
      setFormError('');

      try {
        const response = await withAuthorizedRequest((accessToken) => getTransactionDetail(accessToken, id));
        setForm(toTransactionForm(response.Data));
      } catch (detailError) {
        if (!(detailError instanceof Error && detailError.message === 'missing_session')) {
          setFormError(t('activity.transactions.detailError'));
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [t, withAuthorizedRequest]
  );

  const openDetailModal = useCallback((record: TransactionRecord) => {
    setSelectedDetailRecord(record);
    setDetailViewVisible(true);
  }, []);

  const closeDetailModal = useCallback(() => {
    setDetailViewVisible(false);
    setSelectedDetailRecord(null);
  }, []);

  const handleEditFromDetail = useCallback(() => {
    if (!selectedDetailRecord) return;
    const recordId = selectedDetailRecord.id;
    closeDetailModal();
    openEditModal(recordId);
  }, [selectedDetailRecord, closeDetailModal, openEditModal]);

  const handleDeleteFromDetail = useCallback(async () => {
    if (!selectedDetailRecord) return;
    setDeleting(true);

    try {
      await withAuthorizedRequest((accessToken) => deleteTransaction(accessToken, selectedDetailRecord.id));
      closeDetailModal();
      await loadActivity();
    } catch (deleteError) {
      if (deleteError instanceof ApiRequestError) {
        setFormError(deleteError.message);
      } else if (!(deleteError instanceof Error && deleteError.message === 'missing_session')) {
        setFormError(t('activity.transactions.deleteError'));
      }
    } finally {
      setDeleting(false);
    }
  }, [selectedDetailRecord, closeDetailModal, loadActivity, t, withAuthorizedRequest]);

  const closeTransactionModal = useCallback(() => {
    setTransactionModalVisible(false);
    setDetailLoading(false);
    setSubmitting(false);
    setDeleting(false);
    setIosDatePickerVisible(false);
    setFormError('');
    setForm(createEmptyTransactionForm());
  }, []);

  const handleDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        return;
      }
    }

    if (!selectedDate) {
      return;
    }

    const nextDate = selectedDate.toISOString().slice(0, 10);
    setForm((current) => ({ ...current, date: nextDate }));
  }, []);

  const openDatePicker = useCallback(() => {
    const currentDate = toPickerDate(form.date);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        onChange: handleDateChange,
      });
      return;
    }

    setIosDatePickerVisible((current) => !current);
  }, [form.date, handleDateChange]);

  const openFilterModal = useCallback(() => {
    setDraftFilters(filters);
    setFilterError('');
    setFilterDateTarget(null);
    setIosFilterDatePickerVisible(false);
    setFilterModalVisible(true);
  }, [filters]);

  const closeFilterModal = useCallback(() => {
    setFilterModalVisible(false);
    setFilterError('');
    setFilterDateTarget(null);
    setIosFilterDatePickerVisible(false);
  }, []);

  const handleFilterDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android' && event.type === 'dismissed') {
        return;
      }

      if (!selectedDate || !filterDateTarget) {
        return;
      }

      const nextDate = selectedDate.toISOString().slice(0, 10);
      setDraftFilters((current) => ({ ...current, [filterDateTarget]: nextDate }));
    },
    [filterDateTarget]
  );

  const openFilterDatePicker = useCallback(
    (target: 'startDate' | 'endDate') => {
      const currentValue = draftFilters[target] || getTodayInputValue();
      const currentDate = toPickerDate(currentValue);

      setFilterDateTarget(target);

      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          value: currentDate,
          mode: 'date',
          onChange: handleFilterDateChange,
        });
        return;
      }

      setIosFilterDatePickerVisible(true);
    },
    [draftFilters, handleFilterDateChange]
  );

  const resetFilters = useCallback(() => {
    const nextFilters = createDefaultActivityFilters();
    setLoading(true);
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
    setFilterError('');
    setFilterModalVisible(false);
  }, []);

  const applyFilters = useCallback(() => {
    if (draftFilters.dateMode === 'month') {
      if (!MONTH_INPUT_PATTERN.test(draftFilters.month)) {
        setFilterError(t('activity.transactions.filterMonthInvalid'));
        return;
      }
    }

    if (draftFilters.dateMode === 'range') {
      if (!DATE_INPUT_PATTERN.test(draftFilters.startDate) || !DATE_INPUT_PATTERN.test(draftFilters.endDate)) {
        setFilterError(t('activity.transactions.filterRangeRequired'));
        return;
      }

      const rangeDays = getFilterRangeDays(draftFilters.startDate, draftFilters.endDate);
      if (rangeDays < 0) {
        setFilterError(t('activity.transactions.filterRangeInvalid'));
        return;
      }

      if (rangeDays > 62) {
        setFilterError(t('activity.transactions.filterRangeTooLong'));
        return;
      }
    }

    setFilterError('');
    setLoading(true);
    setTransactions([]);
    setPagination(DEFAULT_PAGINATION);
    setFilters(draftFilters);
    setFilterModalVisible(false);
    setIosFilterDatePickerVisible(false);
    setFilterDateTarget(null);
  }, [draftFilters, t]);

  const handleSaveTransaction = useCallback(async () => {
    const normalizedCategory = form.category.trim();
    const normalizedAmount = parseCurrencyInput(form.amount);

    if (!normalizedCategory || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || !form.date.trim()) {
      setFormError(t('activity.transactions.validation'));
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const payload = {
        wallet_id: selectedTransactionWalletId ?? undefined,
        type: form.type,
        category: normalizedCategory,
        amount: normalizedAmount,
        date: toApiDate(form.date),
        description: form.description.trim(),
      };

      if (form.id) {
        await withAuthorizedRequest((accessToken) => updateTransaction(accessToken, form.id!, payload));
      } else {
        await withAuthorizedRequest((accessToken) => createTransaction(accessToken, payload));
      }

      closeTransactionModal();
      await loadActivity();
    } catch (saveError) {
      if (saveError instanceof ApiRequestError) {
        setFormError(saveError.message);
      } else if (!(saveError instanceof Error && saveError.message === 'missing_session')) {
        setFormError(t('activity.transactions.saveError'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [closeTransactionModal, loadActivity, selectedTransactionWalletId, form, t, withAuthorizedRequest]);

  const handleDeleteTransaction = useCallback(async () => {
    if (!form.id) {
      return;
    }

    setDeleting(true);
    setFormError('');

    try {
      await withAuthorizedRequest((accessToken) => deleteTransaction(accessToken, form.id!));
      closeTransactionModal();
      await loadActivity();
    } catch (deleteError) {
      if (deleteError instanceof ApiRequestError) {
        setFormError(deleteError.message);
      } else if (!(deleteError instanceof Error && deleteError.message === 'missing_session')) {
        setFormError(t('activity.transactions.deleteError'));
      }
    } finally {
      setDeleting(false);
    }
  }, [closeTransactionModal, form.id, loadActivity, t, withAuthorizedRequest]);

  const transactionBalance = summary.balance;
  const searchActive = searchQuery.trim().length > 0;
  const visibleTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return transactions;
    }

    return transactions.filter((record) => {
      const haystack = `${record.category} ${record.description} ${record.type}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, transactions]);

  const groupedTransactions = useMemo<TransactionSection[]>(() => {
    const buckets = new Map<string, TransactionRecord[]>();

    visibleTransactions.forEach((record) => {
      const key = toDaySectionKey(record.date);
      const existing = buckets.get(key) ?? [];
      existing.push(record);
      buckets.set(key, existing);
    });

    return Array.from(buckets.entries())
      .sort(([left], [right]) => {
        if (left === 'today') return -1;
        if (right === 'today') return 1;
        if (left === 'yesterday') return -1;
        if (right === 'yesterday') return 1;
        return right.localeCompare(left);
      })
      .map(([key, items]) => {
        const totals = items.reduce(
          (acc, record) => {
            if (record.type === 'income') {
              acc.incomeTotal += record.amount;
            } else {
              acc.expenseTotal += record.amount;
            }

            return acc;
          },
          { incomeTotal: 0, expenseTotal: 0 }
        );

        return {
          key,
          title:
            key === 'today'
              ? t('activity.transactions.today')
              : key === 'yesterday'
                ? t('activity.transactions.yesterday')
                : toDateHeading(items[0]?.date ?? key, locale),
          items,
          incomeTotal: totals.incomeTotal,
          expenseTotal: totals.expenseTotal,
          netTotal: totals.incomeTotal - totals.expenseTotal,
        };
      });
  }, [locale, t, visibleTransactions]);

  const totalMovement = summary.total_income + summary.total_expense;
  const streamProgress =
    pagination.total > 0 ? (visibleTransactions.length / Math.max(pagination.total, 1)) * 100 : 0;
  const incomeShare = totalMovement > 0 ? (summary.total_income / totalMovement) * 100 : 0;

  const availableCategories = useMemo(
    () =>
      categories
        .filter((category) => category.type === form.type)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [categories, form.type]
  );
  const walletMap = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, wallet] as const)),
    [wallets]
  );
  const walletOptions = useMemo(
    () => [...wallets].sort((left, right) => left.name.localeCompare(right.name)),
    [wallets]
  );
  const selectableWalletOptions = useMemo(
    () => walletOptions.filter((wallet) => !isMainWalletName(wallet.name)),
    [walletOptions]
  );
  const transactionWalletOptions = form.type === 'income' ? walletOptions : selectableWalletOptions;
  const mainWallet = useMemo(() => walletOptions.find((wallet) => isMainWalletName(wallet.name)), [walletOptions]);
  const mainWalletBalance = mainWallet ? Number(mainWallet.balance ?? 0) : 0;
  const filterCategories = useMemo(
    () =>
      [...new Set(categories.map((category) => category.name.trim()).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right)
      ),
    [categories]
  );
  const isIncomeForm = form.type === 'income';
  const modalAccent = isIncomeForm ? colors.secondary : colors.primary;
  const modalAccentSoft = alpha(modalAccent, isLight ? 0.1 : 0.18);
  const modalAccentBorder = alpha(modalAccent, isLight ? 0.16 : 0.28);
  const normalizedPreviewAmount = parseCurrencyInput(form.amount);
  const hasAmountPreview = Number.isFinite(normalizedPreviewAmount) && normalizedPreviewAmount > 0;
  const amountPreview = hasAmountPreview
    ? toCurrency(normalizedPreviewAmount, locale)
    : t('activity.transactions.modalAmountPending');
  const dateInputLabel = toDateInputLabel(form.date, locale);
  const selectedTransactionWalletId =
    isIncomeForm
      ? form.walletId ?? mainWallet?.id ?? null
      : form.walletId && walletMap.get(form.walletId) && !isMainWalletName(walletMap.get(form.walletId)?.name)
      ? form.walletId
      : null;
  const selectedWalletLabel =
    form.walletId && walletMap.get(form.walletId)
      ? walletMap.get(form.walletId)?.name ?? t('activity.transactions.walletDefault')
      : t('activity.transactions.walletDefault');
  const modalKicker = form.id
    ? t('activity.transactions.modalEditKicker')
    : t('activity.transactions.modalCreateKicker');
  const modalToneCopy = isIncomeForm
    ? t('activity.transactions.modalIncomeHint')
    : t('activity.transactions.modalExpenseHint');
  const activeFilterCount =
    (filters.walletId ? 1 : 0) +
    (filters.type !== 'all' ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.dateMode === 'range' || filters.month !== getCurrentMonthInputValue() ? 1 : 0);
  const activeFilterWalletLabel =
    filters.walletId && walletMap.get(filters.walletId)
      ? walletMap.get(filters.walletId)?.name ?? ''
      : '';
  const activeFilterChips = [
    filters.dateMode === 'month'
      ? toMonthInputLabel(filters.month, locale)
      : `${toDateInputLabel(filters.startDate, locale)} - ${toDateInputLabel(filters.endDate, locale)}`,
    activeFilterWalletLabel,
    filters.type !== 'all'
      ? filters.type === 'income'
        ? t('activity.transactions.income')
        : t('activity.transactions.expense')
      : '',
    filters.category,
  ].filter(Boolean);
  const selectedMonthParts = getMonthValueParts(draftFilters.month);
  const monthOptionLabels = Array.from({ length: 12 }, (_, monthIndex) =>
    new Intl.DateTimeFormat(locale, { month: 'short' })
      .format(new Date(2026, monthIndex, 1))
      .replace('.', '')
      .toUpperCase()
  );
  const yearOptions = Array.from({ length: 7 }, (_, index) => selectedMonthParts.year - 3 + index);

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadActivity(true)} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, searchActive && styles.collapsedSection]}>
          {!searchActive ? (
            <>
              <Text style={styles.kicker}>{t('activity.transactions.overview')}</Text>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{t('activity.transactions.titleShort')}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.toolbarRow}>
          <View style={[styles.searchShell, searchFocused && styles.searchShellFocused]}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.shellTextMuted} />
            <TextInput
              ref={searchInputRef}
              key={searchInputKey}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('activity.transactions.searchPlaceholder')}
              placeholderTextColor={colors.shellTextMuted}
              style={styles.searchInput}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onTouchStart={() => searchInputRef.current?.focus()}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchActive ? (
              <Pressable onPress={clearSearch} style={styles.searchClearButton} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={16} color={colors.shellTextMuted} />
              </Pressable>
            ) : null}
          </View>

          <Pressable onPress={openFilterModal} style={styles.filterCardButton}>
            <MaterialCommunityIcons name="tune-variant" size={18} color={colors.primary} />
            {activeFilterCount > 0 ? (
              <View style={styles.filterLauncherBadge}>
                <Text style={styles.filterLauncherBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {loading ? (
          <ActivitySkeleton colors={colors} />
        ) : (
          <>
            {!searchActive ? <View style={styles.filterSummaryCard}>
              <View style={styles.filterSummaryHeader}>
                <View style={styles.filterSummaryCopy}>
                  <Text style={styles.filterSummaryKicker}>{t('activity.transactions.filterTitle')}</Text>
                  <Text style={styles.filterSummaryText}>{t('activity.transactions.filterHelper')}</Text>
                </View>
              </View>

              <View style={styles.filterChipWrap}>
                {activeFilterChips.map((label) => (
                  <View key={label} style={styles.filterChip}>
                    <Text style={styles.filterChipText}>{label}</Text>
                  </View>
                ))}
              </View>
            </View> : null}

            {!searchActive ? <View style={styles.summaryStack}>
              <SummaryStat
                colors={colors}
                title={t('activity.transactions.balance')}
                value={toCurrency(transactionBalance, locale)}
                meta={t('activity.transactions.thisPeriod')}
                metaTone="positive"
                accent="primary"
              />
              <SummaryStat
                colors={colors}
                title={t('activity.transactions.activeStream')}
                value={String(pagination.total)}
                meta={t('activity.transactions.recordsTracked', { count: pagination.total })}
                accent="secondary"
                showProgress
                progress={streamProgress}
              />
              <SummaryStat
                colors={colors}
                title={t('activity.transactions.incomeShare')}
                value={`${incomeShare.toFixed(1)}%`}
                meta={t('activity.transactions.ofMovement')}
                accent="teal"
              />
            </View> : null}

            {groupedTransactions.length === 0 ? (
              <View style={styles.stateCard}>
                <MaterialCommunityIcons name="text-box-search-outline" size={28} color={colors.outlineVariant} />
                <Text style={styles.emptyTitle}>{t('activity.transactions.emptyTitle')}</Text>
                <Text style={styles.emptyBody}>{t('activity.transactions.emptyBody')}</Text>
              </View>
            ) : (
              groupedTransactions.map((section) => (
                <View key={section.key} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{section.title}</Text>
                    <View style={styles.groupLine} />
                  </View>

                  <View style={styles.groupSummaryRow}>
                    <TransactionDaySummary
                      colors={colors}
                      locale={locale}
                      income={section.incomeTotal}
                      expense={section.expenseTotal}
                      net={section.netTotal}
                      incomeLabel={t('activity.transactions.income')}
                      expenseLabel={t('activity.transactions.expense')}
                      netLabel={t('activity.transactions.netVolume')}
                    />
                  </View>

                  <View style={styles.groupList}>
                    {section.items.map((record) => (
                      <TransactionRow
                        key={record.id}
                        record={record}
                        colors={colors}
                        locale={locale}
                        statusLabel={
                          record.type === 'income'
                            ? t('activity.transactions.settled')
                            : t('activity.transactions.completed')
                        }
                        incomeLabel={t('activity.transactions.income')}
                        expenseLabel={t('activity.transactions.expense')}
                        onPress={() => openDetailModal(record)}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {pagination.page < pagination.totalPages && visibleTransactions.length > 0 && (
          <Pressable onPress={loadMore} disabled={loadingMore} style={styles.loadMoreButton}>
            {loadingMore ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.loadMoreText}>{t('activity.transactions.loadMore')}</Text>
            )}
          </Pressable>
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      <Pressable
        onPress={openCreateModal}
        style={({ pressed }) => [styles.fabContainer, pressed && styles.fabPressed]}>
        <View style={styles.fab}>
          <MaterialCommunityIcons name="plus" size={26} color={colors.onPrimary} />
        </View>
      </Pressable>

      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeFilterModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeFilterModal} />
            <View style={styles.modalKeyboard}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <View style={styles.modalBody}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderCopy}>
                      <Text style={[styles.modalKicker, { color: colors.primary }]}>
                        {t('activity.transactions.filterKicker')}
                      </Text>
                      <Text style={styles.modalTitle}>{t('activity.transactions.filterTitle')}</Text>
                      <Text style={styles.modalSubtitle}>{t('activity.transactions.filterHelper')}</Text>
                    </View>
                    <Pressable onPress={closeFilterModal} style={styles.closeButton}>
                      <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                    </Pressable>
                  </View>

                  <ScrollView
                    style={styles.modalScroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.formContent}>
                    <View style={styles.modalSectionCard}>
                      <View style={styles.modalSectionHeader}>
                        <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                          <MaterialCommunityIcons name="calendar-range" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.modalSectionCopy}>
                          <Text style={styles.modalSectionTitle}>{t('activity.transactions.filterDateTitle')}</Text>
                          <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.filterDateHelper')}</Text>
                        </View>
                      </View>

                      <View style={styles.typeSegment}>
                        {(['month', 'range'] as ActivityDateFilterMode[]).map((mode) => {
                          const active = draftFilters.dateMode === mode;
                          return (
                            <Pressable
                              key={mode}
                              onPress={() =>
                                setDraftFilters((current) => ({
                                  ...current,
                                  dateMode: mode,
                                  month: mode === 'month' ? current.month || getCurrentMonthInputValue() : current.month,
                                  startDate: mode === 'range' ? current.startDate : '',
                                  endDate: mode === 'range' ? current.endDate : '',
                                }))
                              }
                              style={[
                                styles.typePill,
                                active && {
                                  backgroundColor: alpha(colors.primary, isLight ? 0.12 : 0.18),
                                  borderColor: alpha(colors.primary, isLight ? 0.3 : 0.36),
                                },
                              ]}>
                              <View
                                style={[
                                  styles.typePillIcon,
                                  { backgroundColor: active ? alpha(colors.primary, 0.16) : colors.shellCardMuted },
                                ]}>
                                <MaterialCommunityIcons
                                  name={mode === 'month' ? 'calendar-month-outline' : 'calendar-range-outline'}
                                  size={16}
                                  color={active ? colors.primary : colors.shellTextMuted}
                                />
                              </View>
                              <Text style={[styles.typePillText, active && { color: colors.primary }]}>
                                {mode === 'month'
                                  ? t('activity.transactions.filterMonthMode')
                                  : t('activity.transactions.filterRangeMode')}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {draftFilters.dateMode === 'month' ? (
                        <View style={styles.fieldGroup}>
                          <Text style={styles.fieldLabel}>{t('activity.transactions.filterMonthLabel')}</Text>
                          <View style={styles.monthSummaryCard}>
                            <View style={styles.monthSummaryIcon}>
                              <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.primary} />
                            </View>
                            <View style={styles.monthSummaryCopy}>
                              <Text style={styles.monthSummaryTitle}>
                                {toMonthInputLabel(draftFilters.month, locale)}
                              </Text>
                              <Text style={styles.monthSummaryMeta}>
                                {t('activity.transactions.filterMonthHelper')}
                              </Text>
                            </View>
                          </View>

                          <Text style={styles.fieldLabel}>{t('activity.transactions.filterPickMonth')}</Text>
                          <View style={styles.monthGrid}>
                            {monthOptionLabels.map((label, monthIndex) => {
                              const active = selectedMonthParts.monthIndex === monthIndex;
                              return (
                                <Pressable
                                  key={label}
                                  onPress={() =>
                                    setDraftFilters((current) => ({
                                      ...current,
                                      month: toMonthValue(selectedMonthParts.year, monthIndex),
                                    }))
                                  }
                                  style={[styles.filterChip, active && styles.filterChipActive, styles.monthChip]}>
                                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                    {label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          <Text style={styles.fieldLabel}>{t('activity.transactions.filterPickYear')}</Text>
                          <View style={styles.filterChipWrap}>
                            {yearOptions.map((year) => {
                              const active = selectedMonthParts.year === year;
                              return (
                                <Pressable
                                  key={year}
                                  onPress={() =>
                                    setDraftFilters((current) => ({
                                      ...current,
                                      month: toMonthValue(year, selectedMonthParts.monthIndex),
                                    }))
                                  }
                                  style={[styles.filterChip, active && styles.filterChipActive]}>
                                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                    {year}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ) : (
                        <>
                          <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>{t('activity.transactions.filterStartDate')}</Text>
                            <Pressable
                              onPress={() => openFilterDatePicker('startDate')}
                              style={({ pressed }) => [styles.inputShell, pressed && styles.actionButtonPressed]}>
                              <View style={styles.inputIconWrap}>
                                <MaterialCommunityIcons name="calendar-start" size={18} color={colors.primary} />
                              </View>
                              <Text style={styles.inputDisplayText}>
                                {draftFilters.startDate
                                  ? toDateInputLabel(draftFilters.startDate, locale)
                                  : t('activity.transactions.filterChooseDate')}
                              </Text>
                            </Pressable>
                          </View>

                          <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>{t('activity.transactions.filterEndDate')}</Text>
                            <Pressable
                              onPress={() => openFilterDatePicker('endDate')}
                              style={({ pressed }) => [styles.inputShell, pressed && styles.actionButtonPressed]}>
                              <View style={styles.inputIconWrap}>
                                <MaterialCommunityIcons name="calendar-end" size={18} color={colors.primary} />
                              </View>
                              <Text style={styles.inputDisplayText}>
                                {draftFilters.endDate
                                  ? toDateInputLabel(draftFilters.endDate, locale)
                                  : t('activity.transactions.filterChooseDate')}
                              </Text>
                            </Pressable>
                          </View>

                          {Platform.OS === 'ios' && iosFilterDatePickerVisible && filterDateTarget ? (
                            <View style={styles.datePickerCard}>
                              <DateTimePicker
                                value={toPickerDate(draftFilters[filterDateTarget] || getTodayInputValue())}
                                mode="date"
                                display="spinner"
                                onChange={handleFilterDateChange}
                                accentColor={colors.primary}
                                themeVariant={isLight ? 'light' : 'dark'}
                              />
                            </View>
                          ) : null}
                        </>
                      )}
                    </View>

                    <View style={styles.modalSectionCard}>
                      <View style={styles.modalSectionHeader}>
                        <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                          <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.modalSectionCopy}>
                          <Text style={styles.modalSectionTitle}>{t('activity.transactions.filterWalletTitle')}</Text>
                          <Text style={styles.modalSectionSubtitle}>
                            {t('activity.transactions.filterWalletHelper')}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.filterChipWrap}>
                        <Pressable
                          onPress={() => setDraftFilters((current) => ({ ...current, walletId: null }))}
                          style={[styles.filterChip, !draftFilters.walletId && styles.filterChipActive]}>
                          <Text style={[styles.filterChipText, !draftFilters.walletId && styles.filterChipTextActive]}>
                            {t('activity.transactions.all')}
                          </Text>
                        </Pressable>

                        {walletOptions.map((wallet) => {
                          const active = draftFilters.walletId === wallet.id;
                          const balance = Number(wallet.balance ?? 0);
                          return (
                            <Pressable
                              key={wallet.id}
                              onPress={() => setDraftFilters((current) => ({ ...current, walletId: wallet.id }))}
                              style={[styles.filterChip, active && styles.filterChipActive]}>
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                {wallet.name}
                              </Text>
                              <Text style={[styles.filterChipBalance, active && styles.filterChipBalanceActive]}>
                                {toCurrency(balance, locale)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.modalSectionCard}>
                      <View style={styles.modalSectionHeader}>
                        <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                          <MaterialCommunityIcons name="swap-horizontal" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.modalSectionCopy}>
                          <Text style={styles.modalSectionTitle}>{t('activity.transactions.filterTypeTitle')}</Text>
                          <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.filterTypeHelper')}</Text>
                        </View>
                      </View>

                      <View style={styles.filterChipWrap}>
                        {(['all', 'income', 'expense'] as ActivityFilterType[]).map((option) => {
                          const active = draftFilters.type === option;
                          const label =
                            option === 'all'
                              ? t('activity.transactions.all')
                              : option === 'income'
                                ? t('activity.transactions.income')
                                : t('activity.transactions.expense');

                          return (
                            <Pressable
                              key={option}
                              onPress={() => setDraftFilters((current) => ({ ...current, type: option }))}
                              style={[styles.filterChip, active && styles.filterChipActive]}>
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.modalSectionCard}>
                      <View style={styles.modalSectionHeader}>
                        <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                          <MaterialCommunityIcons name="shape-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.modalSectionCopy}>
                          <Text style={styles.modalSectionTitle}>{t('activity.transactions.filterCategoryTitle')}</Text>
                          <Text style={styles.modalSectionSubtitle}>
                            {t('activity.transactions.filterCategoryHelper')}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.filterChipWrap}>
                        <Pressable
                          onPress={() => setDraftFilters((current) => ({ ...current, category: '' }))}
                          style={[styles.filterChip, !draftFilters.category && styles.filterChipActive]}>
                          <Text style={[styles.filterChipText, !draftFilters.category && styles.filterChipTextActive]}>
                            {t('activity.transactions.all')}
                          </Text>
                        </Pressable>

                        {filterCategories.map((category) => {
                          const active = draftFilters.category === category;
                          const visual = getCategoryVisual(category);
                          return (
                            <Pressable
                              key={category}
                              onPress={() => setDraftFilters((current) => ({ ...current, category }))}
                              style={[styles.filterChip, active && styles.filterChipActive]}>
                              <MaterialCommunityIcons
                                name={visual.icon as any}
                                size={12}
                                color={active ? colors.primary : colors.shellTextMuted}
                              />
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                {category}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {!!filterError ? (
                      <View style={styles.formErrorCard}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                        <Text style={styles.formErrorText}>{filterError}</Text>
                      </View>
                    ) : null}
                  </ScrollView>

                  <View style={styles.modalFooter}>
                    <View style={styles.modalActionsRow}>
                      <Pressable onPress={resetFilters} style={styles.secondaryActionButton}>
                        <Text style={styles.secondaryActionButtonText}>{t('activity.transactions.filterReset')}</Text>
                      </Pressable>
                      <Pressable onPress={applyFilters} style={styles.submitButton}>
                        <Text style={styles.submitButtonText}>{t('activity.transactions.filterApply')}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={transactionModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeTransactionModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeTransactionModal} />
            <View style={[styles.modalKeyboard, keyboardOpen && { paddingBottom: modalLift }]}>
              <View style={[styles.modalSheet, keyboardOpen && styles.modalSheetKeyboard]}>
                <View style={styles.modalHandle} />
                <View style={styles.modalBody}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderCopy}>
                      <Text style={[styles.modalKicker, { color: modalAccent }]}>{modalKicker}</Text>
                      <Text style={styles.modalTitle}>
                        {form.id ? t('activity.transactions.editTitle') : t('activity.transactions.createTitle')}
                      </Text>
                      <Text style={styles.modalSubtitle}>{t('activity.transactions.modalHint')}</Text>
                    </View>
                    <Pressable onPress={closeTransactionModal} style={styles.closeButton}>
                      <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                    </Pressable>
                  </View>

                  {detailLoading ? (
                    <View style={styles.modalLoadingState}>
                      <ActivityIndicator color={colors.primary} />
                      <Text style={styles.stateText}>{t('activity.transactions.detailLoading')}</Text>
                    </View>
                  ) : (
                    <>
                      <ScrollView
                        style={styles.modalScroll}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.formContent}>
                        <View
                          style={[
                            styles.modalHeroCard,
                            {
                              backgroundColor: modalAccentSoft,
                              borderColor: modalAccentBorder,
                            },
                          ]}>
                          <View style={styles.modalHeroMain}>
                            <View
                              style={[
                                styles.modalHeroIcon,
                                { backgroundColor: alpha(modalAccent, isLight ? 0.14 : 0.18) },
                              ]}>
                              <MaterialCommunityIcons
                                name={isIncomeForm ? 'trending-up' : 'trending-down'}
                                size={22}
                                color={modalAccent}
                              />
                            </View>
                            <View style={styles.modalHeroCopy}>
                              <Text style={styles.modalHeroTitle}>
                                {isIncomeForm ? t('activity.transactions.income') : t('activity.transactions.expense')}
                              </Text>
                              <Text style={styles.modalHeroText}>{modalToneCopy}</Text>
                            </View>
                          </View>

                          <View style={styles.modalHeroMetrics}>
                            <View style={styles.modalMetric}>
                              <Text style={styles.modalMetricLabel}>{t('activity.transactions.modalAmountPreview')}</Text>
                              <Text
                                numberOfLines={1}
                                style={[styles.modalMetricValue, !hasAmountPreview && styles.modalMetricValueMuted]}>
                                {amountPreview}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.modalMetricBadge,
                                {
                                  borderColor: modalAccentBorder,
                                  backgroundColor: alpha(colors.surfaceContainerLowest, isLight ? 0.8 : 0.14),
                                },
                              ]}>
                              <MaterialCommunityIcons name="shape-outline" size={14} color={modalAccent} />
                              <Text style={[styles.modalMetricBadgeText, { color: modalAccent }]}>
                                {t('activity.transactions.modalCategoryCount', { count: availableCategories.length })}
                              </Text>
                            </View>
                        </View>
                      </View>

                        <View style={styles.modalSectionCard}>
                          <View style={styles.modalSectionHeader}>
                            <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}> 
                              <MaterialCommunityIcons name="wallet-outline" size={18} color={modalAccent} />
                            </View>
                            <View style={styles.modalSectionCopy}>
                              <Text style={styles.modalSectionTitle}>{t('activity.transactions.walletTitle')}</Text>
                              <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.walletHelper')}</Text>
                            </View>
                          </View>

                          <View style={styles.filterChipWrap}>
                            {!isIncomeForm ? (
                              <Pressable
                                onPress={() => setForm((current) => ({ ...current, walletId: null }))}
                                style={[styles.filterChip, !form.walletId && styles.filterChipActive]}>
                                <Text style={[styles.filterChipText, !form.walletId && styles.filterChipTextActive]}>
                                  {t('activity.transactions.walletDefault')}
                                </Text>
                                <Text style={[styles.filterChipBalance, !form.walletId && styles.filterChipBalanceActive]}>
                                  {toCurrency(mainWalletBalance, locale)}
                                </Text>
                              </Pressable>
                            ) : null}

                            {transactionWalletOptions.map((wallet) => {
                              const active = form.walletId === wallet.id;
                              const balance = Number(wallet.balance ?? 0);
                              return (
                                <Pressable
                                  key={wallet.id}
                                  onPress={() => setForm((current) => ({ ...current, walletId: wallet.id }))}
                                  style={[styles.filterChip, active && styles.filterChipActive]}>
                                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                    {wallet.name}
                                  </Text>
                                  <Text style={[styles.filterChipBalance, active && styles.filterChipBalanceActive]}>
                                    {toCurrency(balance, locale)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          <Text style={styles.monthSummaryMeta}>{selectedWalletLabel}</Text>
                        </View>

                        <View style={styles.modalSectionCard}>
                          <View style={styles.modalSectionHeader}>
                            <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                              <MaterialCommunityIcons name="swap-horizontal" size={18} color={modalAccent} />
                            </View>
                            <View style={styles.modalSectionCopy}>
                              <Text style={styles.modalSectionTitle}>{t('activity.transactions.modalTypeTitle')}</Text>
                              <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.modalTypeHelper')}</Text>
                            </View>
                          </View>

                          <View style={styles.typeSegment}>
                            {(['expense', 'income'] as TransactionType[]).map((type) => {
                              const active = type === form.type;
                              const typeColor = type === 'income' ? colors.secondary : colors.primary;
                              return (
                                <Pressable
                                  key={type}
                                  onPress={() =>
                                      setForm((current) => ({
                                        ...current,
                                        type,
                                        walletId: type === 'income' ? current.walletId ?? mainWallet?.id ?? null : current.walletId,
                                        category:
                                          current.type === type
                                            ? current.category
                                          : categories.some((item) => item.type === type && item.name === current.category)
                                            ? current.category
                                            : '',
                                    }))
                                  }
                                  style={[
                                    styles.typePill,
                                    active && {
                                      backgroundColor: alpha(typeColor, isLight ? 0.12 : 0.18),
                                      borderColor: alpha(typeColor, isLight ? 0.3 : 0.36),
                                    },
                                  ]}>
                                  <View
                                    style={[
                                      styles.typePillIcon,
                                      { backgroundColor: active ? alpha(typeColor, 0.16) : colors.shellCardMuted },
                                    ]}>
                                    <MaterialCommunityIcons
                                      name={type === 'income' ? 'trending-up' : 'trending-down'}
                                      size={16}
                                      color={active ? typeColor : colors.shellTextMuted}
                                    />
                                  </View>
                                  <Text
                                    style={[
                                      styles.typePillText,
                                      active && {
                                        color: typeColor,
                                      },
                                    ]}>
                                    {type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>

                        <View style={styles.modalSectionCard}>
                          <View style={styles.modalSectionHeader}>
                            <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                              <MaterialCommunityIcons name="shape-outline" size={18} color={modalAccent} />
                            </View>
                            <View style={styles.modalSectionCopy}>
                              <Text style={styles.modalSectionTitle}>{t('activity.transactions.modalCategoryTitle')}</Text>
                              <Text style={styles.modalSectionSubtitle}>
                                {t('activity.transactions.modalCategoryHelper')}
                              </Text>
                            </View>
                          </View>

                          {availableCategories.length > 0 ? (
                            <View style={styles.categoryWrap}>
                              {availableCategories.map((category) => {
                                const active = form.category === category.name;
                                const visual = getCategoryVisual(category.name);
                                const chipBg = active ? alpha(visual.color, 0.14) : colors.shellCard;
                                const chipBorder = active ? alpha(visual.color, 0.32) : colors.shellBorder;
                                const textColor = active ? visual.color : colors.shellTextSecondary;
                                return (
                                  <Pressable
                                    key={category.id}
                                    onPress={() => setForm((current) => ({ ...current, category: category.name }))}
                                    style={[styles.categoryChip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                                    <MaterialCommunityIcons
                                      name={visual.icon as any}
                                      size={14}
                                      color={textColor}
                                    />
                                    <Text style={[styles.categoryChipText, { color: textColor }]}>
                                      {category.name}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          ) : (
                            <View style={styles.emptyCategoryBox}>
                              <Text style={styles.emptyCategoryText}>{t('activity.transactions.categoryFromSettings')}</Text>
                            <Pressable onPress={() => router.push('/categories')} style={styles.emptyCategoryButton}>
                                <Text style={styles.emptyCategoryButtonText}>{t('activity.transactions.openCategories')}</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>

                        <View style={styles.modalSectionCard}>
                          <View style={styles.modalSectionHeader}>
                            <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                              <MaterialCommunityIcons name="receipt-text-outline" size={18} color={modalAccent} />
                            </View>
                            <View style={styles.modalSectionCopy}>
                              <Text style={styles.modalSectionTitle}>{t('activity.transactions.modalDetailsTitle')}</Text>
                              <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.modalDetailsHelper')}</Text>
                            </View>
                          </View>

                          <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>{t('activity.transactions.amount')}</Text>
                            <View style={styles.inputShell}>
                              <TextInput
                                value={form.amount}
                                onChangeText={(value) =>
                                  setForm((current) => ({ ...current, amount: formatCurrencyInput(value) }))
                                }
                                placeholder="1.500.000"
                                placeholderTextColor={colors.inputPlaceholder}
                                keyboardType="number-pad"
                                style={styles.inputControl}
                              />
                            </View>
                          </View>

                          <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>{t('activity.transactions.quickAmount')}</Text>
                            <View style={styles.filterChipWrap}>
                              {[
                                { label: '50K', value: '50000' },
                                { label: '100K', value: '100000' },
                                { label: '200K', value: '200000' },
                                { label: '500K', value: '500000' },
                                { label: '1M', value: '1000000' },
                                { label: '2M', value: '2000000' },
                              ].map((preset) => (
                                <Pressable
                                  key={preset.value}
                                  onPress={() => setForm((current) => ({ ...current, amount: formatCurrencyInput(preset.value) }))}
                                  style={({ pressed }) => [
                                    styles.filterChip,
                                    form.amount === formatCurrencyInput(preset.value) && styles.filterChipActive,
                                    pressed && styles.actionButtonPressed,
                                  ]}>
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      form.amount === formatCurrencyInput(preset.value) && styles.filterChipTextActive,
                                    ]}>
                                    {preset.label}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>

                          <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>{t('activity.transactions.date')}</Text>
                            <Pressable
                              onPress={openDatePicker}
                              style={({ pressed }) => [styles.inputShell, pressed && styles.actionButtonPressed]}>
                              <View style={styles.inputIconWrap}>
                                <MaterialCommunityIcons name="calendar-month-outline" size={18} color={modalAccent} />
                              </View>
                              <Text style={styles.inputDisplayText}>{dateInputLabel}</Text>
                            </Pressable>
                            {Platform.OS === 'ios' && iosDatePickerVisible ? (
                              <View style={styles.datePickerCard}>
                                <DateTimePicker
                                  value={toPickerDate(form.date)}
                                  mode="date"
                                  display="spinner"
                                  onChange={handleDateChange}
                                  accentColor={modalAccent}
                                  themeVariant={isLight ? 'light' : 'dark'}
                                />
                              </View>
                            ) : null}

                            <View style={styles.filterChipWrap}>
                              {[
                                { label: t('activity.transactions.dateQuickToday'), value: toDayDateQuickValues().today },
                                { label: t('activity.transactions.dateQuickYesterday'), value: toDayDateQuickValues().yesterday },
                                { label: t('activity.transactions.dateQuickThisWeek'), value: toDayDateQuickValues().thisWeek },
                                { label: t('activity.transactions.dateQuickStartMonth'), value: toDayDateQuickValues().startOfMonth },
                              ].map((preset) => {
                                const active = form.date === preset.value;
                                return (
                                  <Pressable
                                    key={preset.value}
                                    onPress={() => setForm((current) => ({ ...current, date: preset.value }))}
                                    style={({ pressed }) => [
                                      styles.filterChip,
                                      active && styles.filterChipActive,
                                      pressed && styles.actionButtonPressed,
                                    ]}>
                                    <MaterialCommunityIcons
                                      name="calendar-check-outline"
                                      size={12}
                                      color={active ? colors.primary : colors.shellTextMuted}
                                    />
                                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                      {preset.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        </View>

                        <View style={styles.modalSectionCard}>
                          <View style={styles.modalSectionHeader}>
                            <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                              <MaterialCommunityIcons name="text-box-outline" size={18} color={modalAccent} />
                            </View>
                            <View style={styles.modalSectionCopy}>
                              <Text style={styles.modalSectionTitle}>{t('activity.transactions.modalNotesTitle')}</Text>
                              <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.modalNotesHelper')}</Text>
                            </View>
                          </View>

                          <View style={[styles.inputShell, styles.textareaShell]}>
                            <View style={styles.inputIconWrap}>
                              <MaterialCommunityIcons name="pencil-outline" size={18} color={modalAccent} />
                            </View>
                            <TextInput
                              value={form.description}
                              onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
                              placeholder={t('activity.transactions.descriptionPlaceholder')}
                              placeholderTextColor={colors.inputPlaceholder}
                              multiline
                              textAlignVertical="top"
                              scrollEnabled={false}
                              style={[styles.inputControl, styles.textareaInput]}
                            />
                          </View>
                        </View>

                        {!!formError && (
                          <View style={styles.formErrorCard}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                            <Text style={styles.formErrorText}>{formError}</Text>
                          </View>
                        )}
                      </ScrollView>

                      <View style={styles.modalFooter}>
                        <View style={styles.modalActionsRow}>
                          {form.id ? (
                            <Pressable
                              onPress={() => setEditDeleteConfirmVisible(true)}
                              disabled={submitting || deleting}
                              style={({ pressed }) => [
                                styles.deleteButton,
                                pressed && !(submitting || deleting) && styles.actionButtonPressed,
                                (submitting || deleting) && styles.actionButtonDisabled,
                              ]}>
                              {deleting ? (
                                <ActivityIndicator color={colors.danger} />
                              ) : (
                                <>
                                  <Text style={styles.deleteButtonText}>{t('activity.transactions.delete')}</Text>
                                </>
                              )}
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={closeTransactionModal}
                              disabled={submitting || deleting}
                              style={({ pressed }) => [
                                styles.secondaryActionButton,
                                pressed && !(submitting || deleting) && styles.actionButtonPressed,
                              ]}>
                              <Text style={styles.secondaryActionButtonText}>{t('common.cancel')}</Text>
                            </Pressable>
                          )}

                          <Pressable
                            onPress={handleSaveTransaction}
                            disabled={submitting || deleting}
                            style={({ pressed }) => [
                              styles.submitButton,
                              pressed && !(submitting || deleting) && styles.actionButtonPressed,
                              (submitting || deleting) && styles.actionButtonDisabled,
                            ]}>
                            {submitting ? (
                              <ActivityIndicator color={colors.onPrimary} />
                            ) : (
                              <Text style={styles.submitButtonText}>
                                {form.id ? t('activity.transactions.update') : t('activity.transactions.create')}
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={detailViewVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeDetailModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDetailModal} />
            <View style={styles.modalKeyboard}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <View style={styles.modalBody}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderCopy}>
                      <Text style={[styles.modalKicker, { color: selectedDetailRecord?.type === 'income' ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary) : colors.primary }]}>
                        {t('activity.transactions.detailKicker')}
                      </Text>
                      <Text style={styles.modalTitle}>{t('activity.transactions.detailTitle')}</Text>
                    </View>
                    <Pressable onPress={closeDetailModal} style={styles.closeButton}>
                      <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                    </Pressable>
                  </View>

                  {selectedDetailRecord ? (
                    <>
                      <View
                        style={[
                          styles.modalHeroCard,
                          {
                            backgroundColor: selectedDetailRecord.type === 'income'
                              ? alpha(isLight ? LIGHT_INCOME_ACCENT : colors.secondary, isLight ? 0.1 : 0.18)
                              : alpha(colors.primary, isLight ? 0.1 : 0.18),
                            borderColor: selectedDetailRecord.type === 'income'
                              ? alpha(isLight ? LIGHT_INCOME_ACCENT : colors.secondary, isLight ? 0.16 : 0.28)
                              : alpha(colors.primary, isLight ? 0.16 : 0.28),
                          },
                        ]}>
                        <View style={styles.modalHeroMain}>
                          <View
                            style={[
                              styles.modalHeroIcon,
                              {
                                backgroundColor: alpha(
                                  selectedDetailRecord.type === 'income'
                                    ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary)
                                    : colors.primary,
                                  isLight ? 0.14 : 0.18
                                ),
                              },
                            ]}>
                            <MaterialCommunityIcons
                              name={selectedDetailRecord.type === 'income' ? 'trending-up' : 'trending-down'}
                              size={22}
                              color={selectedDetailRecord.type === 'income' ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary) : colors.primary}
                            />
                          </View>
                          <View style={styles.modalHeroCopy}>
                            <Text style={styles.modalHeroTitle}>
                              {selectedDetailRecord.type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')}
                            </Text>
                            <Text style={styles.modalHeroText}>{selectedDetailRecord.category}</Text>
                          </View>
                        </View>
                        <View style={styles.modalHeroMetrics}>
                          <View style={styles.modalMetric}>
                            <Text style={styles.modalMetricLabel}>{t('activity.transactions.detailAmount')}</Text>
                            <Text numberOfLines={1} style={styles.modalMetricValue}>
                              {toSignedCurrency(selectedDetailRecord.type === 'income' ? selectedDetailRecord.amount : -selectedDetailRecord.amount, locale)}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                            <MaterialCommunityIcons name="information-outline" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('activity.transactions.detailTitle')}</Text>
                          </View>
                        </View>

                        <View style={{ gap: 14 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailType')}</Text>
                            <View style={[rowStyles(colors).statusChip, { backgroundColor: alpha(selectedDetailRecord.type === 'income' ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary) : colors.primary, isLight ? 0.12 : 0.18) }]}>
                              <Text style={[rowStyles(colors).statusText, { color: selectedDetailRecord.type === 'income' ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary) : colors.primary }]}>
                                {selectedDetailRecord.type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')}
                              </Text>
                            </View>
                          </View>

                          <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailCategory')}</Text>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextPrimary }]}>{selectedDetailRecord.category}</Text>
                          </View>

                          <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailWallet')}</Text>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextPrimary }]}>
                              {walletMap.get(selectedDetailRecord.wallet_id ?? 0)?.name ?? t('activity.transactions.detailDefaultWallet')}
                            </Text>
                          </View>

                          <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailDate')}</Text>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextPrimary }]}>{toDateInputLabel(selectedDetailRecord.date, locale)}</Text>
                          </View>

                          {selectedDetailRecord.description?.trim() ? (
                            <>
                              <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />
                              <View style={{ gap: 6 }}>
                                <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailNotes')}</Text>
                                <Text style={[styles.fieldLabel, { color: colors.shellTextPrimary, fontWeight: '500' }]}>{selectedDetailRecord.description}</Text>
                              </View>
                            </>
                          ) : null}

                          <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailCreated')}</Text>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextSecondary, fontSize: 12 }]}>
                              {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(selectedDetailRecord.created_at))}
                            </Text>
                          </View>

                          <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailUpdated')}</Text>
                            <Text style={[styles.fieldLabel, { color: colors.shellTextSecondary, fontSize: 12 }]}>
                              {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(selectedDetailRecord.updated_at))}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </>
                  ) : null}

                  <View style={styles.modalFooter}>
                    <View style={styles.modalActionsRow}>
                      <Pressable
                        onPress={() => {
                          setDeleteConfirmVisible(true);
                        }}
                        disabled={deleting}
                        style={({ pressed }) => [
                          styles.deleteButton,
                          pressed && !deleting && styles.actionButtonPressed,
                          deleting && styles.actionButtonDisabled,
                        ]}>
                        {deleting ? (
                          <ActivityIndicator color={colors.danger} />
                        ) : (
                          <Text style={styles.deleteButtonText}>{t('activity.transactions.detailDelete')}</Text>
                        )}
                      </Pressable>

                      <Pressable
                        onPress={handleEditFromDetail}
                        disabled={deleting}
                        style={({ pressed }) => [
                          styles.submitButton,
                          pressed && !deleting && styles.actionButtonPressed,
                        ]}>
                        <Text style={styles.submitButtonText}>{t('activity.transactions.detailEdit')}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deleteConfirmVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setDeleteConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteConfirmVisible(false)} />
            <View style={[styles.modalKeyboard, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
              <View style={[styles.modalSheet, { maxHeight: 'auto', width: '100%', paddingBottom: 0 }]}>
                <View style={[styles.modalBody, { gap: 16, paddingTop: 24 }]}>
                  <View style={{ alignItems: 'center', gap: 12 }}>
                    <View style={[styles.modalHeroIcon, { backgroundColor: alpha(colors.danger, 0.12), width: 56, height: 56, borderRadius: 20 }]}>
                      <MaterialCommunityIcons name="trash-can-outline" size={26} color={colors.danger} />
                    </View>
                    <Text style={[styles.modalTitle, { textAlign: 'center', fontSize: 18 }]}>{t('activity.transactions.detailDeleteConfirmTitle')}</Text>
                    <Text style={[styles.modalSubtitle, { textAlign: 'center' }]}>{t('activity.transactions.detailDeleteConfirmBody')}</Text>
                  </View>

                  <View style={styles.modalActionsRow}>
                    <Pressable
                      onPress={() => setDeleteConfirmVisible(false)}
                      style={styles.secondaryActionButton}>
                      <Text style={styles.secondaryActionButtonText}>{t('activity.transactions.detailDeleteConfirmNo')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setDeleteConfirmVisible(false);
                        handleDeleteFromDetail();
                      }}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        { flex: 1 },
                        pressed && styles.actionButtonPressed,
                      ]}>
                      <Text style={styles.deleteButtonText}>{t('activity.transactions.detailDeleteConfirmYes')}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editDeleteConfirmVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setEditDeleteConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditDeleteConfirmVisible(false)} />
            <View style={[styles.modalKeyboard, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
              <View style={[styles.modalSheet, { maxHeight: 'auto', width: '100%', paddingBottom: 0 }]}>
                <View style={[styles.modalBody, { gap: 16, paddingTop: 24 }]}>
                  <View style={{ alignItems: 'center', gap: 12 }}>
                    <View style={[styles.modalHeroIcon, { backgroundColor: alpha(colors.danger, 0.12), width: 56, height: 56, borderRadius: 20 }]}>
                      <MaterialCommunityIcons name="trash-can-outline" size={26} color={colors.danger} />
                    </View>
                    <Text style={[styles.modalTitle, { textAlign: 'center', fontSize: 18 }]}>{t('activity.transactions.deleteConfirmTitle')}</Text>
                    <Text style={[styles.modalSubtitle, { textAlign: 'center' }]}>{t('activity.transactions.deleteConfirmBody')}</Text>
                  </View>

                  <View style={styles.modalActionsRow}>
                    <Pressable
                      onPress={() => setEditDeleteConfirmVisible(false)}
                      style={styles.secondaryActionButton}>
                      <Text style={styles.secondaryActionButtonText}>{t('activity.transactions.deleteConfirmNo')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditDeleteConfirmVisible(false);
                        handleDeleteTransaction();
                      }}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        { flex: 1 },
                        pressed && styles.actionButtonPressed,
                      ]}>
                      <Text style={styles.deleteButtonText}>{t('activity.transactions.deleteConfirmYes')}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const summaryStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 30,
      paddingHorizontal: 24,
      paddingVertical: 22,
      gap: 12,
      overflow: 'hidden',
      borderWidth: 1,
    },
    title: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.8,
    },
    value: {
      color: colors.shellTextPrimary,
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '900',
      letterSpacing: -1,
    },
    progressTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: alpha(colors.surfaceContainerHighest, 0.44),
      overflow: 'hidden',
      marginTop: 2,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
    },
    meta: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
  });

const daySummaryStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    label: {
      flexShrink: 1,
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    value: {
      flexShrink: 0,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '900',
      letterSpacing: -0.2,
      includeFontPadding: false,
      textAlign: 'right',
    },
    divider: {
      height: 1,
      backgroundColor: alpha(colors.surfaceContainerHighest, 0.2),
      marginVertical: 10,
    },
  });

const rowStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 18,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    pressed: {
      opacity: 0.94,
    },
    left: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '800',
    },
    subtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    right: {
      width: 108,
      alignItems: 'flex-end',
      gap: 8,
    },
    amount: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    statusChip: {
      minHeight: 26,
      borderRadius: 999,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusText: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
  });

const createStyles = (colors: AppColorTheme, topInset: number, bottomInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: Math.max(topInset + 12, 26),
      paddingBottom: Math.max(bottomInset + 126, 150),
      gap: 18,
    },
    hero: {
      gap: 8,
      paddingTop: 10,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    kicker: {
      color: colors.primaryContainer,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.6,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '900',
      letterSpacing: -1.2,
      flex: 1,
      minWidth: 0,
    },
    inlineCreateButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      marginBottom: 12,
      position: 'relative',
      zIndex: 2,
    },
    searchShell: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
      minHeight: 56,
      borderRadius: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginRight: 12,
      overflow: 'hidden',
      position: 'relative',
      zIndex: 2,
      elevation: 2,
    },
    searchShellFocused: {
      borderColor: alpha(colors.primary, 0.28),
      shadowColor: colors.primary,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
      paddingVertical: 0,
    },
    searchClearButton: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.surfaceContainerHighest, 0.6),
    },
    collapsedSection: {
      height: 0,
      marginTop: 0,
      marginBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden',
    },
    filterCardButton: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      flexShrink: 0,
      zIndex: 1,
    },
    filterLauncherBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 18,
      height: 18,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterLauncherBadgeText: {
      color: colors.onPrimary,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '900',
    },
    filterSummaryCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 16,
      gap: 14,
      position: 'relative',
      zIndex: 1,
    },
    filterSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    filterSummaryCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    filterSummaryKicker: {
      color: colors.primary,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.6,
    },
    filterSummaryText: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
      filterChipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    monthGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    filterChip: {
      minHeight: 36,
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    filterChipActive: {
      backgroundColor: alpha(colors.primary, 0.12),
      borderColor: alpha(colors.primary, 0.28),
    },
    filterChipText: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
    },
    filterChipTextActive: {
      color: colors.primary,
    },
    filterChipBalance: {
      color: colors.shellTextSecondary,
      fontSize: 9,
      lineHeight: 12,
      fontWeight: '600',
      marginTop: 2,
    },
    filterChipBalanceActive: {
      color: alpha(colors.primary, 0.7),
    },
    monthChip: {
      minWidth: '22%',
    },
    monthSummaryCard: {
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    monthSummaryIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: alpha(colors.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthSummaryCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    monthSummaryTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    monthSummaryMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    summaryStack: {
      gap: 14,
      marginTop: 6,
    },
    stateCard: {
      borderRadius: 26,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 24,
      gap: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateText: {
      color: colors.shellTextSecondary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      textAlign: 'center',
    },
    emptyTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyBody: {
      color: colors.shellTextMuted,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
      textAlign: 'center',
    },
    groupSection: {
      gap: 14,
      marginTop: 8,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    groupSummaryRow: {
      marginTop: -2,
    },
    groupTitle: {
      color: colors.shellTextSoft,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.4,
    },
    groupLine: {
      flex: 1,
      height: 1,
      backgroundColor: alpha(colors.surfaceContainerHighest, 0.24),
    },
    groupList: {
      gap: 12,
    },
    loadMoreButton: {
      minHeight: 50,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      backgroundColor: colors.shellCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    loadMoreText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
    modalOverlay: {
      flex: 1,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: alpha(colors.inverseSurface, 0.36),
      justifyContent: 'flex-end',
    },
    modalKeyboard: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      maxHeight: '92%',
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      backgroundColor: colors.shellBackground,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 0,
      gap: 16,
      borderTopWidth: 1,
      borderColor: colors.shellBorder,
    },
    modalSheetKeyboard: {
      paddingBottom: Math.max(bottomInset + 20, 24),
    },
    modalHandle: {
      alignSelf: 'center',
      width: 46,
      height: 5,
      borderRadius: 999,
      backgroundColor: alpha(colors.shellTextSoft, 0.5),
      marginBottom: 2,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    modalBody: {
      gap: 16,
      flexShrink: 1,
      minHeight: 0,
    },
    modalKicker: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.8,
    },
    modalTitle: {
      color: colors.shellTextPrimary,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    modalSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
      marginTop: 2,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    modalScroll: {
      flexGrow: 0,
    },
    modalLoadingState: {
      paddingVertical: 36,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    formContent: {
      gap: 14,
      paddingBottom: 18,
    },
    modalHeroCard: {
      borderRadius: 28,
      borderWidth: 1,
      padding: 18,
      gap: 16,
    },
    modalHeroMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    modalHeroIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHeroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    modalHeroTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '900',
    },
    modalHeroText: {
      color: colors.shellTextSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
    modalHeroMetrics: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalMetric: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    modalMetricLabel: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    modalMetricValue: {
      color: colors.shellTextPrimary,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    modalMetricValueMuted: {
      color: colors.shellTextMuted,
    },
    modalMetricBadge: {
      minHeight: 34,
      maxWidth: '48%',
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    modalMetricBadgeText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
    },
    modalSectionCard: {
      borderRadius: 26,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 16,
      gap: 14,
    },
    modalSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    modalSectionIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSectionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    modalSectionTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    modalSectionSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    typeSegment: {
      flexDirection: 'row',
      gap: 8,
    },
    typePill: {
      flex: 1,
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    typePillIcon: {
      width: 30,
      height: 30,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typePillText: {
      color: colors.shellTextSecondary,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    fieldGroup: {
      gap: 8,
    },
    fieldGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    fieldHalf: {
      flex: 1,
      minWidth: 0,
    },
    fieldLabel: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '700',
    },
    inputShell: {
      minHeight: 56,
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    inputIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 2,
      marginTop: 2,
    },
    inputControl: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      paddingVertical: 16,
      paddingRight: 14,
    },
    inputDisplayText: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      paddingVertical: 16,
      paddingRight: 14,
    },
    datePickerCard: {
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 6,
      paddingVertical: 4,
      overflow: 'hidden',
    },
    textareaShell: {
      minHeight: 132,
      alignItems: 'flex-start',
      paddingTop: 10,
    },
    textareaInput: {
      minHeight: 104,
      paddingTop: 8,
    },
    categoryWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    categoryChip: {
      minHeight: 38,
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    categoryChipActive: {
      backgroundColor: alpha(colors.primary, 0.12),
      borderColor: alpha(colors.primary, 0.32),
    },
    categoryChipText: {
      color: colors.shellTextSecondary,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '700',
    },
    categoryChipTextActive: {
      color: colors.primary,
    },
    emptyCategoryBox: {
      borderRadius: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 14,
      gap: 10,
    },
    emptyCategoryText: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    emptyCategoryButton: {
      alignSelf: 'flex-start',
      minHeight: 34,
      borderRadius: 12,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyCategoryButtonText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    formErrorCard: {
      borderRadius: 18,
      backgroundColor: alpha(colors.danger, 0.08),
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.24),
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    formErrorText: {
      flex: 1,
      minWidth: 0,
      color: colors.danger,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },
    modalFooter: {
      borderTopWidth: 1,
      borderTopColor: colors.shellBorder,
      paddingTop: 14,
      paddingBottom: Math.max(bottomInset, 12),
      backgroundColor: colors.shellBackground,
    },
    modalActionsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    secondaryActionButton: {
      minHeight: 54,
      minWidth: 110,
      borderRadius: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    secondaryActionButtonText: {
      color: colors.shellTextSecondary,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '800',
    },
    submitButton: {
      flex: 1,
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitButtonText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    deleteButton: {
      minHeight: 54,
      minWidth: 142,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.28),
      backgroundColor: alpha(colors.danger, 0.08),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    deleteButtonText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: '800',
    },
    actionButtonPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.99 }],
    },
    actionButtonDisabled: {
      opacity: 0.6,
    },
    fabContainer: {
      position: 'absolute',
      bottom: Math.max(bottomInset + 90, 100),
      right: 18,
      zIndex: 100,
    },
    fab: {
      width: 60,
      height: 60,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.32,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    fabPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.95 }],
    },
  });
