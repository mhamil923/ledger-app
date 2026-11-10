import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, type CryptoPlan, type CryptoPosition, type DcaCoin } from '../lib/api';
import { storage } from '../lib/storage';
import { colors, radius, spacing, type } from '../theme/colors';

const BUDGET_KEY = 'ledger.dca.budget';
const COINS_KEY = 'ledger.dca.excluded';

const usd = (x: number, cents = true): string =>
  (x < 0 ? '−$' : '$') +
  Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
const price = (x: number): string => '$' + (x >= 100 ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : x >= 1 ? x.toFixed(3) : x.toPrecision(4));
const pct = (x: number, d = 0): string => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`;

export default function CryptoPlanScreen() {
  const [budgetText, setBudgetText] = useState('');
  const [budget, setBudget] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    void Promise.all([storage.get(BUDGET_KEY), storage.get(COINS_KEY)]).then(([b, c]) => {
      const n = Number(b);
      if (b && n > 0) {
        setBudget(n);
        setBudgetText(String(n));
      }
      if (c) setExcluded(c.split(',').filter(Boolean));
      setLoaded(true);
    });
  }, []);

  const q = useQuery<CryptoPlan>({
    queryKey: ['crypto-plan', budget, excluded.join(','), refreshTick],
    enabled: loaded,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      // First call (no coin filter) tells us which coins are eligible; then filter.
      const all = await apiClient.getCryptoPlan({ budget, refresh: refreshTick > 0 });
      if (!excluded.length) return all;
      const keep = all.dca_eligible.filter((c) => !excluded.includes(c));
      return keep.length ? apiClient.getCryptoPlan({ budget, symbols: keep }) : { ...all, dca: null };
    },
  });
  const d = q.data;

  const applyBudget = (): void => {
    const n = Number(budgetText.replace(/[$,\s]/g, ''));
    const v = Number.isFinite(n) && n > 0 ? n : null;
    setBudget(v);
    void storage.set(BUDGET_KEY, v ? String(v) : '');
  };
  const toggleCoin = (code: string): void => {
    const next = excluded.includes(code) ? excluded.filter((c) => c !== code) : [...excluded, code];
    setExcluded(next);
    void storage.set(COINS_KEY, next.join(','));
  };

  const main = useMemo(() => (d?.positions ?? []).filter((p) => !p.dust), [d]);
  const dust = useMemo(() => (d?.positions ?? []).filter((p) => p.dust), [d]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/portfolio'))} style={styles.back} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CRYPTO</Text>
          <Text style={styles.title}>Break-even & DCA</Text>
        </View>
        <Pressable onPress={() => setRefreshTick((t) => t + 1)} style={styles.back} accessibilityLabel="Refresh from Coinbase">
          {q.isFetching ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="refresh" size={20} color={colors.text} />}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRefreshTick((t) => t + 1)} tintColor={colors.accent} />}
      >
        {q.isLoading || !loaded ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.body, { textAlign: 'center' }]}>
              Reading your full Coinbase history… the first load can take up to a minute.
            </Text>
          </View>
        ) : null}
        {q.error ? (
          <View style={styles.card}>
            <Text style={[styles.body, { color: colors.negative }]}>{(q.error as Error).message}</Text>
          </View>
        ) : null}

        {d ? (
          <>
            <TotalsCard d={d} />

            <Text style={styles.sectionTitle}>BREAK-EVEN BY COIN</Text>
            <Text style={styles.sectionHint}>
              Break-even is the price where selling everything gets back all the money you put in. Tap a coin for details.
            </Text>
            {main.map((p) => (
              <CoinCard key={p.code} p={p} />
            ))}
            {dust.length ? (
              <Text style={styles.footnote}>
                Small positions under $5 (not shown): {dust.map((p) => p.code).join(', ')}
              </Text>
            ) : null}

            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>DCA PLAN — HOW MUCH TO BUY</Text>
            <Text style={styles.sectionHint}>
              Dollar-cost averaging: buy a set amount every week instead of guessing the bottom. The amounts go up when the market is
              scared and the coin is cheap, and down when everyone is greedy.
            </Text>
            <View style={styles.card}>
              <Text style={styles.label}>MONTHLY AMOUNT FOR CRYPTO</Text>
              <View style={styles.budgetRow}>
                <View style={styles.inputWrap}>
                  <Text style={styles.prefix}>$</Text>
                  <TextInput
                    value={budgetText}
                    onChangeText={setBudgetText}
                    onSubmitEditing={applyBudget}
                    onBlur={applyBudget}
                    placeholder={d.investing_envelope ? String(d.investing_envelope) : '400'}
                    placeholderTextColor={colors.textDim}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
                <Pressable onPress={applyBudget} style={styles.smallBtn}>
                  <Text style={styles.smallBtnText}>Update</Text>
                </Pressable>
              </View>
              <Text style={styles.footnote}>
                {budget
                  ? `Using $${budget}/month.`
                  : d.investing_envelope
                    ? `Using your Investing budget (${usd(d.investing_envelope)}/month). If that also covers stocks, type a smaller crypto-only amount.`
                    : 'Enter how much per month you can put toward crypto.'}
              </Text>
              <Text style={[styles.label, { marginTop: spacing.sm }]}>COINS TO BUY</Text>
              <View style={styles.chips}>
                {d.dca_eligible.map((c) => {
                  const on = !excluded.includes(c);
                  return (
                    <Pressable key={c} onPress={() => toggleCoin(c)} style={[styles.chip, on && styles.chipOn]}>
                      <Ionicons name={on ? 'checkmark' : 'add'} size={12} color={on ? colors.bg : colors.textMuted} />
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {d.dca ? <DcaCard dca={d.dca} /> : null}

            <Text style={styles.footnote}>
              Prices from Coinbase · history updated {new Date(d.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Not
              financial advice — adding money to a losing coin only pays off if it recovers.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function TotalsCard({ d }: { d: CryptoPlan }) {
  const up = d.totals.pl >= 0;
  return (
    <View style={styles.card}>
      <Text style={styles.label}>ALL YOUR COINS</Text>
      <View style={styles.statRow}>
        <Stat label="You put in" value={usd(d.totals.net, false)} />
        <Stat label="Worth now" value={usd(d.totals.value, false)} />
        <Stat
          label={up ? 'Up' : 'Down'}
          value={`${usd(Math.abs(d.totals.pl), false)}${d.totals.pl_pct != null ? ` (${pct(d.totals.pl_pct)})` : ''}`}
          color={up ? colors.positive : colors.negative}
        />
      </View>
      <Text style={styles.footnote}>"Put in" is cash spent buying minus cash you got back from selling.</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 90 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function CoinCard({ p }: { p: CryptoPosition }) {
  const [open, setOpen] = useState(false);
  const good = p.status !== 'below';
  // How far price has come toward break-even (0–100%).
  const progress = p.status === 'below' && p.breakeven > 0 ? Math.max(0.02, Math.min(1, p.price / p.breakeven)) : 1;
  return (
    <Pressable onPress={() => setOpen(!open)} style={styles.card}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.coin}>{p.code}</Text>
          <Text style={styles.meta}>
            {p.qty.toLocaleString('en-US', { maximumFractionDigits: 4 })} {p.qty === 1 ? 'coin' : 'coins'} · worth {usd(p.value)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.pl, { color: p.pl >= 0 ? colors.positive : colors.negative }]}>
            {p.pl >= 0 ? '+' : '−'}
            {usd(Math.abs(p.pl))}
          </Text>
          <Text style={styles.meta}>{p.pl_pct != null ? pct(p.pl_pct, 1) : 'all profit'}</Text>
        </View>
      </View>

      {p.status === 'house_money' ? (
        <Text style={[styles.body, { color: colors.positive }]}>
          ✓ Playing with house money — you've already taken out more than you put in.
        </Text>
      ) : p.status === 'above' ? (
        <Text style={[styles.body, { color: colors.positive }]}>✓ Above break-even ({price(p.breakeven)}). You're in profit.</Text>
      ) : (
        <>
          <Text style={styles.body}>
            Break-even <Text style={styles.strong}>{price(p.breakeven)}</Text> · now {price(p.price)} ·{' '}
            <Text style={{ color: colors.warning }}>needs {pct(p.rise_needed)}</Text>
          </Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
          </View>
        </>
      )}

      {open ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={styles.statRow}>
            <Stat label="Cash put in" value={usd(p.cash_in)} />
            <Stat label="Cash taken out" value={usd(p.cash_out)} />
            <Stat label="Net invested" value={usd(p.net)} />
          </View>
          {p.fees ? <Text style={styles.footnote}>Includes {usd(p.fees)} in trading fees.</Text> : null}
          {p.add_scenarios.length ? (
            <>
              <Text style={styles.label}>IF YOU BUY MORE AT TODAY'S PRICE</Text>
              {p.add_scenarios.map((s) => (
                <View key={s.add} style={styles.tableRow}>
                  <Text style={styles.cell}>Add {usd(s.add, false)}</Text>
                  <Text style={styles.cell}>break-even {price(s.breakeven)}</Text>
                  <Text style={[styles.cell, { color: colors.warning, textAlign: 'right' }]}>needs {pct(s.needs)}</Text>
                </View>
              ))}
              {p.targets.map((t) => (
                <Text key={t.needs} style={styles.body}>
                  To only need {pct(t.needs)}: add about <Text style={styles.strong}>{usd(t.add, false)}</Text>
                </Text>
              ))}
              <Text style={styles.footnote}>
                Buying at today's price gets your break-even closer but never all the way down — the price still has to rise some.
              </Text>
            </>
          ) : null}
          {p.notes.map((n) => (
            <Text key={n} style={styles.footnote}>
              • {n}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function DcaCard({ dca }: { dca: NonNullable<CryptoPlan['dca']> }) {
  const [how, setHow] = useState(false);
  return (
    <>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>THIS WEEK, BUY</Text>
          {dca.mood ? (
            <Text style={styles.meta}>
              Market mood: <Text style={{ color: dca.mood.value < 45 ? colors.warning : dca.mood.value > 55 ? colors.positive : colors.text }}>{dca.mood.label} ({dca.mood.value})</Text>
            </Text>
          ) : null}
        </View>
        {dca.coins.map((c) => (
          <DcaRow key={c.code} c={c} />
        ))}
        <View style={[styles.rowBetween, styles.totalRow]}>
          <Text style={styles.strong}>Total this week</Text>
          <Text style={styles.strong}>{usd(dca.week_total)}</Text>
        </View>
        <Text style={styles.footnote}>
          Normal pace is {usd(dca.base_weekly)}/week ({usd(dca.monthly, false)}/month).{' '}
          {dca.vs_normal < -0.5
            ? `This week is ${usd(-dca.vs_normal)} under — keep the difference in your Investing budget for a scared week.`
            : dca.vs_normal > 0.5
              ? `This week is ${usd(dca.vs_normal)} over because the market is scared. Use cash saved from slower weeks; if you have none, buy ${dca.scaled?.map((s) => `${s.code} ${usd(s.weekly)}`).join(', ')}.`
              : ''}
        </Text>
        <Text style={styles.footnote}>Prefer monthly? Buy the monthly amount once, on the same day each month. Check back weekly — amounts update with the market.</Text>
      </View>

      {dca.coins.some((c) => c.projections.length) ? (
        <View style={styles.card}>
          <Text style={styles.label}>WHERE YOUR BREAK-EVEN GOES (NORMAL PACE, PRICE FLAT)</Text>
          {dca.coins
            .filter((c) => c.projections.length)
            .map((c) => (
              <View key={c.code} style={{ gap: 4, marginTop: spacing.xs }}>
                <Text style={styles.coinSmall}>{c.code}</Text>
                {c.projections.map((pr) => (
                  <View key={pr.label} style={styles.tableRow}>
                    <Text style={styles.cell}>In {pr.label}</Text>
                    <Text style={styles.cell}>+{usd(pr.added, false)}</Text>
                    <Text style={styles.cell}>{price(pr.breakeven)}</Text>
                    <Text style={[styles.cell, { color: colors.warning, textAlign: 'right' }]}>needs {pct(pr.needs)}</Text>
                  </View>
                ))}
                {c.down30 && c.up30 ? (
                  <Text style={styles.footnote}>
                    In 3 months if {c.code} drops 30%: needs {pct(c.down30.needs)}. If it rises 30%:{' '}
                    {c.up30.needs <= 0 ? 'back in profit ✓' : `needs ${pct(c.up30.needs)}`}.
                  </Text>
                ) : null}
              </View>
            ))}
        </View>
      ) : null}

      <Pressable onPress={() => setHow(!how)} style={styles.howBtn}>
        <Ionicons name={how ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.accent} />
        <Text style={styles.howText}>How the amounts are decided</Text>
      </Pressable>
      {how ? (
        <View style={styles.card}>
          <Text style={styles.body}>
            1. Your monthly amount becomes a weekly amount, split evenly across the coins you picked.{'\n'}
            2. Market mood (Crypto Fear & Greed): extreme fear 1.5×, fear 1.25×, neutral 1×, greed 0.75×, extreme greed 0.5×.{'\n'}
            3. Each coin's chart: oversold +25%, weak +10%, hot −10%, overbought −25%; more than 30% below its long-term average +15%,
            more than 40% above −25%.{'\n'}
            4. Coins still falling are capped at 1.25× so you don't pile into a falling knife.{'\n'}
            5. Every amount stays between 0.25× and 2× of normal.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function DcaRow({ c }: { c: DcaCoin }) {
  const tone = c.mult > 1.05 ? colors.positive : c.mult < 0.95 ? colors.warning : colors.textMuted;
  return (
    <View style={styles.dcaRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.coinSmall}>
          {c.code} <Text style={[styles.meta, { color: tone }]}>{c.mult > 1.05 ? 'buy more' : c.mult < 0.95 ? 'buy less' : 'normal'} · {c.mult.toFixed(2)}×</Text>
        </Text>
        <Text style={styles.meta}>{c.signals.join(' · ')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.strong}>{usd(c.weekly)}</Text>
        <Text style={styles.meta}>{usd(c.monthly, false)}/mo</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, maxWidth: 760, width: '100%', alignSelf: 'center' },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderSubtle },
  eyebrow: { ...type.micro, color: colors.accent, letterSpacing: 0.8 },
  title: { ...type.title, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md, maxWidth: 760, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8, marginTop: spacing.sm },
  sectionHint: { ...type.caption, color: colors.textDim, marginTop: -6 },
  label: { ...type.micro, color: colors.textDim, letterSpacing: 0.6 },
  body: { ...type.body, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  strong: { ...type.heading, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums' as const] },
  meta: { ...type.caption, fontSize: 12, color: colors.textDim },
  footnote: { ...type.caption, fontSize: 11, color: colors.textDim, lineHeight: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  statRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  statLabel: { ...type.micro, color: colors.textDim },
  statValue: { ...type.heading, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums' as const], marginTop: 2 },
  coin: { ...type.heading, fontSize: 18, color: colors.text },
  coinSmall: { ...type.heading, fontSize: 14, color: colors.text },
  pl: { ...type.heading, fontSize: 16, fontVariant: ['tabular-nums' as const] },
  barBg: { height: 6, borderRadius: 3, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.warning },
  tableRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 3, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  cell: { ...type.caption, flex: 1, fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums' as const] },
  budgetRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  prefix: { ...type.heading, color: colors.textMuted },
  input: { flex: 1, ...type.heading, color: colors.text, paddingVertical: 8, paddingHorizontal: 4 },
  smallBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 9 },
  smallBtnText: { ...type.caption, color: colors.bg, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { ...type.caption, fontSize: 12, color: colors.textMuted },
  chipTextOn: { color: colors.bg, fontWeight: '600' },
  dcaRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle, alignItems: 'center' },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  howBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  howText: { ...type.caption, color: colors.accent },
});
