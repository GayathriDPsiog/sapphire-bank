// Customer: portfolio (accounts, balances, limits), account statement, loans (apply + EMI schedule).
// Read-only except "Apply for a loan". Transfers stay on the Accounts and transfers page (central Worker).
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Skeleton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
} from '@mui/material';
import { FileText, HandCoins, Wallet } from 'lucide-react';
import { toPaise } from '../amount';
import { api } from './api';
import { dateTime, emiPreviewMinor, money, STATUS_COLORS } from './format';
import { Shell, SignInPanel, useBackendSession } from './Shell';

const DEMO_RATE_BPS = 1050; // shown in the preview; the backend's rate is the one that counts

export default function CustomerServices({ bank }) {
  const [session, setSession, signOut] = useBackendSession();
  const [portfolio, setPortfolio] = useState(null);
  const [loans, setLoans] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const [p, l] = await Promise.all([
        api('/portfolio', { token: session.token }),
        api('/loans', { token: session.token }),
      ]);
      setPortfolio(p);
      setLoans(l.items);
    } catch (failure) {
      if (failure.status === 401) signOut();
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return <Shell bank={bank} active="#/services" title="My loans and portfolio"
    subtitle="Your accounts, statements and loans." session={session} onSignOut={signOut}>
    {!session ? <SignInPanel bank={bank} onSignedIn={setSession} /> : <>
      {error && <Alert severity="error">{error}</Alert>}
      {loading && !portfolio ? <Skeleton variant="rounded" height={160} /> : portfolio && <>
        <Portfolio portfolio={portfolio} />
        <Statement token={session.token} accounts={portfolio.accounts} />
        <Loans token={session.token} accounts={portfolio.accounts} loans={loans} onChanged={load} />
      </>}
    </>}
  </Shell>;
}

function Portfolio({ portfolio }) {
  const { accounts, totals, loans } = portfolio;
  return <section className="panel"><header className="panel-head"><div><h2>Portfolio</h2>
    <p>{accounts.length} account(s) · Total available {money(totals.availableMinor)}</p></div><Wallet size={19} /></header>
    {accounts.length ? <div className="sapphire-cards">{accounts.map(account => <div className="sapphire-card" key={account.accountId}>
      <div className="sapphire-card-top"><span>{account.accountNumber}</span>
        <Chip size="small" label={account.status} color={STATUS_COLORS[account.status] || 'default'} /></div>
      <div className="sapphire-card-amount">{money(account.availableMinor)}</div>
      <div className="sapphire-card-foot">Posted {money(account.postedBalanceMinor)} · Held {money(account.heldMinor)}</div>
      <div className="sapphire-card-foot">Limits: {money(account.perTransferMinor)} per transfer · {money(account.dailyMinor)} per day</div>
    </div>)}</div> : <Alert severity="info">No account yet.</Alert>}
    <div className="sapphire-stats">
      <span>Loans pending: <strong>{loans.pending}</strong></span>
      <span>Loans approved: <strong>{loans.approved}</strong> ({money(loans.approvedPrincipalMinor)})</span>
      <span>Monthly EMI: <strong>{money(loans.monthlyEmiMinor)}</strong></span>
    </div>
  </section>;
}

function Statement({ token, accounts }) {
  const [accountId, setAccountId] = useState(accounts[0]?.accountId || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setError('');
    api('/accounts/' + encodeURIComponent(accountId) + '/statement', { token })
      .then(result => { if (!cancelled) setData(result); })
      .catch(failure => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [accountId, token]);

  if (!accounts.length) return null;
  return <section className="panel"><header className="panel-head"><div><h2>Statement</h2>
    <p>Money in and out of your account (newest first)</p></div><FileText size={19} /></header>
    <div className="sapphire-toolbar">
      <TextField select size="small" label="Account" value={accountId} onChange={e => setAccountId(e.target.value)}>
        {accounts.map(a => <MenuItem key={a.accountId} value={a.accountId}>{a.accountNumber}</MenuItem>)}
      </TextField>
    </div>
    {error && <Alert severity="error">{error}</Alert>}
    {!data ? <Skeleton variant="rounded" height={90} /> : data.entries.length ? <TableContainer><Table size="small">
      <TableHead><TableRow><TableCell>Date (IST)</TableCell><TableCell>Type</TableCell><TableCell>Reference</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
      <TableBody>{data.entries.map(entry => <TableRow key={entry.entryId}>
        <TableCell>{dateTime(entry.postedAt)}</TableCell>
        <TableCell>{entry.entryType.replace(/_/g, ' ').toLowerCase()}</TableCell>
        <TableCell className="sapphire-mono">{entry.transferId || '—'}</TableCell>
        <TableCell align="right" className={entry.direction === 'CREDIT' ? 'sapphire-credit' : 'sapphire-debit'}>
          {entry.direction === 'CREDIT' ? '+' : '−'}{money(entry.amountMinor)}</TableCell>
      </TableRow>)}</TableBody></Table></TableContainer> : <Alert severity="info">No entries yet.</Alert>}
  </section>;
}

function Loans({ token, accounts, loans, onChanged }) {
  const active = accounts.filter(a => a.status === 'ACTIVE');
  const [accountId, setAccountId] = useState(active[0]?.accountId || '');
  const [amount, setAmount] = useState('50000');
  const [months, setMonths] = useState('12');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState(null);

  const amountMinor = toPaise(amount);
  const termMonths = Number(months);
  const preview = amountMinor && Number.isInteger(termMonths) ? emiPreviewMinor(amountMinor, DEMO_RATE_BPS, termMonths) : 0;
  const hasPending = loans.some(loan => loan.status === 'PENDING');

  async function apply(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!accountId) { setError('You need an ACTIVE account to apply.'); return; }
    if (!amountMinor || amountMinor < 100_000 || amountMinor > 50_000_000) { setError('Amount must be between Rs 1,000 and Rs 5,00,000.'); return; }
    if (!Number.isInteger(termMonths) || termMonths < 3 || termMonths > 60) { setError('Term must be 3 to 60 months.'); return; }
    if (purpose.trim().length < 3) { setError('Tell us the purpose of the loan.'); return; }
    setBusy(true);
    try {
      const result = await api('/loans', { token, method: 'POST', data: { accountId, amountMinor, termMonths, purpose: purpose.trim() } });
      setMessage(`Application sent. Estimated EMI ${money(result.emiMinor)} per month.`);
      setPurpose('');
      onChanged();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className="panel"><header className="panel-head"><div><h2>Loans</h2>
    <p>Demo interest rate {DEMO_RATE_BPS / 100}% per year</p></div><HandCoins size={19} /></header>
    {loans.length ? <TableContainer><Table size="small">
      <TableHead><TableRow><TableCell>Applied</TableCell><TableCell>Purpose</TableCell><TableCell align="right">Amount</TableCell>
        <TableCell align="right">EMI</TableCell><TableCell>Term</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
      <TableBody>{loans.map(loan => <TableRow key={loan.loanId}>
        <TableCell>{dateTime(loan.createdAt)}</TableCell><TableCell>{loan.purpose}</TableCell>
        <TableCell align="right">{money(loan.amountMinor)}</TableCell><TableCell align="right">{money(loan.emiMinor)}</TableCell>
        <TableCell>{loan.termMonths} months</TableCell>
        <TableCell><Chip size="small" label={loan.status} color={STATUS_COLORS[loan.status] || 'default'} />
          {loan.note && <div className="sapphire-note">{loan.note}</div>}</TableCell>
        <TableCell><Button size="small" onClick={() => setSchedule(loan)}>EMI schedule</Button></TableCell>
      </TableRow>)}</TableBody></Table></TableContainer> : <Alert severity="info">No loans yet.</Alert>}

    <h3 className="sapphire-h3">Apply for a loan</h3>
    {hasPending ? <Alert severity="info">You already have an application waiting for a decision.</Alert> :
    <form className="transfer-form sapphire-narrow" onSubmit={apply} noValidate>
      <TextField select label="Credit to account" value={accountId} onChange={e => setAccountId(e.target.value)} disabled={busy || !active.length}>
        {active.map(a => <MenuItem key={a.accountId} value={a.accountId}>{a.accountNumber}</MenuItem>)}
      </TextField>
      <div className="sapphire-two">
        <TextField label="Amount in INR" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} helperText="Rs 1,000 to Rs 5,00,000" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        <TextField label="Term (months)" value={months} onChange={e => setMonths(e.target.value)} disabled={busy} helperText="3 to 60" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
      </div>
      <TextField label="Purpose" value={purpose} onChange={e => setPurpose(e.target.value)} disabled={busy} />
      {preview > 0 && <Alert severity="info">Estimated EMI: <strong>{money(preview)}</strong> per month</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <div><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Sending…' : 'Apply'}</Button></div>
    </form>}

    <Dialog open={!!schedule} onClose={() => setSchedule(null)} maxWidth="md" fullWidth>
      <DialogTitle>EMI schedule · {schedule && money(schedule.amountMinor)} over {schedule?.termMonths} months</DialogTitle>
      <DialogContent>{schedule && <TableContainer><Table size="small">
        <TableHead><TableRow><TableCell>Month</TableCell><TableCell align="right">Payment</TableCell><TableCell align="right">Principal</TableCell>
          <TableCell align="right">Interest</TableCell><TableCell align="right">Remaining</TableCell></TableRow></TableHead>
        <TableBody>{(schedule.schedule || []).map(row => <TableRow key={row.month}>
          <TableCell>{row.month}</TableCell><TableCell align="right">{money(row.paymentMinor)}</TableCell>
          <TableCell align="right">{money(row.principalMinor)}</TableCell><TableCell align="right">{money(row.interestMinor)}</TableCell>
          <TableCell align="right">{money(row.remainingMinor)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
        {schedule && <p className="sapphire-note">Total interest {money(schedule.totalInterestMinor)} · Total payable {money(schedule.totalPaymentMinor)}</p>}
      </DialogContent>
      <DialogActions><Button onClick={() => setSchedule(null)}>Close</Button></DialogActions>
    </Dialog>
  </section>;
}
