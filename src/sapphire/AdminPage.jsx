// Bank admin: dashboard numbers, KYC queue, accounts (limits + freeze), loans.
// Every action goes through the Sapphire backend, which re-checks the ADMIN role on the server.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Skeleton, Snackbar,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField,
} from '@mui/material';
import { toPaise } from '../amount';
import { api, openKycDocument } from './api';
import { dateTime, money, STATUS_COLORS } from './format';
import { Shell, SignInPanel, useBackendSession } from './Shell';

export default function AdminPage({ bank }) {
  const [session, setSession, signOut] = useBackendSession();
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState('kyc');
  const [data, setData] = useState({ kyc: [], accounts: [], loans: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const me = await api('/me', { token: session.token });
      setRole(me.role);
      if (me.role !== 'ADMIN') return;
      const [kyc, accounts, loans] = await Promise.all([
        api('/admin/kyc-requests?status=ALL', { token: session.token }),
        api('/admin/accounts', { token: session.token }),
        api('/admin/loans?status=ALL', { token: session.token }),
      ]);
      setData({ kyc: kyc.items, accounts: accounts.items, loans: loans.items });
    } catch (failure) {
      if (failure.status === 401) signOut();
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const done = message => { setToast(message); load(); };
  const token = session?.token;

  let body;
  if (!session) body = <SignInPanel bank={bank} onSignedIn={setSession} note="Sign in with the bank admin login." />;
  else if (!role) body = loading || !error ? <Skeleton variant="rounded" height={160} />
    : <div><Button variant="outlined" onClick={load}>Try again</Button></div>; // never show admin screens until the server confirms ADMIN
  else if (role !== 'ADMIN') body = <Alert severity="warning">This page is for the bank admin only. You are signed in as {session.email}.</Alert>;
  else body = <>
    <Dashboard data={data} />
    <section className="panel">
      <Tabs value={tab} onChange={(e, value) => setTab(value)} aria-label="Admin sections">
        <Tab value="kyc" label={`KYC (${data.kyc.filter(k => k.status === 'PENDING').length} pending)`} />
        <Tab value="accounts" label="Accounts and limits" />
        <Tab value="loans" label={`Loans (${data.loans.filter(l => l.status === 'PENDING').length} pending)`} />
      </Tabs>
      <div className="sapphire-tab">
        {tab === 'kyc' && <KycQueue token={token} items={data.kyc} onDone={done} onError={setError} />}
        {tab === 'accounts' && <AccountsTable token={token} items={data.accounts} onDone={done} />}
        {tab === 'loans' && <LoansQueue token={token} items={data.loans} onDone={done} />}
      </div>
    </section>
  </>;

  return <Shell bank={bank} active="#/admin" title="Bank admin" subtitle="Applications, accounts, limits and loans."
    session={session} onSignOut={signOut}>
    {error && <Alert severity="error">{error}</Alert>}
    {session && role === 'ADMIN' && <div><Button size="small" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button></div>}
    {body}
    <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')} message={toast} />
  </Shell>;
}

function Dashboard({ data }) {
  const count = (list, status) => list.filter(item => item.status === status).length;
  const deposits = data.accounts.reduce((sum, a) => sum + a.postedBalanceMinor, 0);
  const cards = [
    ['Customers (accounts)', data.accounts.length],
    ['KYC pending', count(data.kyc, 'PENDING')],
    ['KYC approved / held / rejected', `${count(data.kyc, 'APPROVED')} / ${count(data.kyc, 'HOLD')} / ${count(data.kyc, 'REJECTED')}`],
    ['Total deposits', money(deposits)],
    ['Loans pending', count(data.loans, 'PENDING')],
    ['Loans approved', count(data.loans, 'APPROVED')],
  ];
  return <div className="sapphire-stat-grid">{cards.map(([label, value]) =>
    <div className="sapphire-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

// A small dialog asking for a reason/note, used by every admin action.
function ReasonDialog({ open, title, label, required, confirmLabel, busy, error, onCancel, onConfirm }) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  const tooShort = required && text.trim().length < 3;
  return <Dialog open={open} onClose={busy ? undefined : onCancel} fullWidth maxWidth="sm">
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      <TextField autoFocus fullWidth multiline minRows={2} margin="dense" label={label + (required ? ' (required)' : ' (optional)')}
        value={text} onChange={e => setText(e.target.value)} disabled={busy}
        error={required && text.length > 0 && tooShort} helperText={required ? 'At least 3 characters' : ''} />
      {error && <Alert severity="error">{error}</Alert>}
    </DialogContent>
    <DialogActions><Button onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button variant="contained" onClick={() => onConfirm(text.trim())} disabled={busy || tooShort}>{busy ? 'Saving…' : confirmLabel}</Button></DialogActions>
  </Dialog>;
}

function useAction(onDone) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(call, message) {
    setBusy(true);
    setError('');
    try { await call(); setPending(null); onDone(message); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const open = value => { setError(''); setPending(value); };
  return { pending, open, close: () => setPending(null), busy, error, run };
}

function KycQueue({ token, items, onDone, onError }) {
  const [filter, setFilter] = useState('PENDING');
  const action = useAction(onDone);
  const shown = filter === 'ALL' ? items : items.filter(item => item.status === filter);
  const decide = (request, decision) => action.open({ request, decision });

  return <>
    <div className="sapphire-toolbar"><TextField select size="small" label="Status" value={filter} onChange={e => setFilter(e.target.value)}>
      {['PENDING', 'HOLD', 'APPROVED', 'REJECTED', 'ALL'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField></div>
    {shown.length ? <TableContainer><Table size="small">
      <TableHead><TableRow><TableCell>Applicant</TableCell><TableCell>Phone / DOB</TableCell><TableCell>Submitted</TableCell>
        <TableCell>Document</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
      <TableBody>{shown.map(r => <TableRow key={r.requestId}>
        <TableCell><strong>{r.fullName}</strong><div className="sapphire-note">{r.email}</div><div className="sapphire-note">{r.address}</div></TableCell>
        <TableCell>{r.phone}<div className="sapphire-note">{r.dateOfBirth}</div></TableCell>
        <TableCell>{dateTime(r.createdAt)}</TableCell>
        <TableCell><Button size="small" onClick={() => openKycDocument(token, r.requestId).catch(f => onError(f.message))}>{r.documentName || 'Open'}</Button></TableCell>
        <TableCell><Chip size="small" label={r.status} color={STATUS_COLORS[r.status] || 'default'} />
          {r.accountNumber && <div className="sapphire-note">{r.accountNumber}</div>}
          {r.reason && <div className="sapphire-note">{r.reason}</div>}</TableCell>
        <TableCell>{['PENDING', 'HOLD'].includes(r.status) ? <div className="sapphire-row-actions">
          <Button size="small" variant="contained" color="success" onClick={() => decide(r, 'APPROVE')}>Approve</Button>
          {r.status === 'PENDING' && <Button size="small" variant="outlined" color="warning" onClick={() => decide(r, 'HOLD')}>Hold</Button>}
          <Button size="small" variant="outlined" color="error" onClick={() => decide(r, 'REJECT')}>Reject</Button>
        </div> : '—'}</TableCell>
      </TableRow>)}</TableBody></Table></TableContainer> : <Alert severity="info">No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}applications.</Alert>}

    <ReasonDialog open={!!action.pending} busy={action.busy} error={action.error} onCancel={action.close}
      title={action.pending ? `${action.pending.decision === 'APPROVE' ? 'Approve' : action.pending.decision === 'HOLD' ? 'Hold' : 'Reject'} ${action.pending.request.fullName}` : ''}
      label={action.pending?.decision === 'APPROVE' ? 'Note' : 'Reason (sent to the customer)'}
      required={action.pending?.decision !== 'APPROVE'}
      confirmLabel={action.pending?.decision === 'APPROVE' ? 'Approve and open account' : 'Confirm'}
      onConfirm={reason => action.run(() => api('/admin/kyc-requests/' + encodeURIComponent(action.pending.request.requestId), {
        token, method: 'PATCH', data: { decision: action.pending.decision, ...(reason && { reason }) },
      }), `${action.pending.request.fullName}: ${action.pending.decision.toLowerCase()} done`)} />
  </>;
}

function AccountsTable({ token, items, onDone }) {
  const statusAction = useAction(onDone);
  const [limits, setLimits] = useState(null);
  const [form, setForm] = useState({ per: '', daily: '' });
  const [limitError, setLimitError] = useState('');
  const [busy, setBusy] = useState(false);

  function openLimits(account) {
    setLimitError('');
    setForm({ per: String(account.perTransferMinor / 100), daily: String(account.dailyMinor / 100) });
    setLimits(account);
  }

  async function saveLimits() {
    const perTransferMinor = toPaise(form.per);
    const dailyMinor = toPaise(form.daily);
    if (!perTransferMinor || !dailyMinor) { setLimitError('Enter positive amounts with at most two decimals.'); return; }
    if (dailyMinor < perTransferMinor) { setLimitError('The daily limit must be at least the per-transfer limit.'); return; }
    setBusy(true);
    setLimitError('');
    try {
      await api('/admin/accounts/' + encodeURIComponent(limits.accountId) + '/limits', { token, method: 'PATCH', data: { perTransferMinor, dailyMinor } });
      setLimits(null);
      onDone(`Limits updated for ${limits.accountNumber}`);
    } catch (failure) { setLimitError(failure.message); }
    finally { setBusy(false); }
  }

  return <>
    {items.length ? <TableContainer><Table size="small">
      <TableHead><TableRow><TableCell>Account</TableCell><TableCell>Owner</TableCell><TableCell>Status</TableCell>
        <TableCell align="right">Available</TableCell><TableCell align="right">Held</TableCell><TableCell>Limits</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
      <TableBody>{items.map(a => <TableRow key={a.accountId}>
        <TableCell><strong>{a.accountNumber}</strong><div className="sapphire-note">{a.accountId}</div>
          {a.isNetworkTestAccount && <Chip size="small" label="Network test account" variant="outlined" />}</TableCell>
        <TableCell>{a.ownerName || '—'}<div className="sapphire-note">{a.ownerEmail || ''}</div></TableCell>
        <TableCell><Chip size="small" label={a.status} color={STATUS_COLORS[a.status] || 'default'} /></TableCell>
        <TableCell align="right">{money(a.availableMinor)}</TableCell>
        <TableCell align="right">{money(a.heldMinor)}</TableCell>
        <TableCell>{money(a.perTransferMinor)} / transfer<div className="sapphire-note">{money(a.dailyMinor)} / day · {a.limitsSource.toLowerCase()}</div></TableCell>
        <TableCell><div className="sapphire-row-actions">
          <Button size="small" variant="outlined" onClick={() => openLimits(a)}>Limits</Button>
          {!a.isNetworkTestAccount && (a.status === 'ACTIVE'
            ? <Button size="small" variant="outlined" color="error" onClick={() => statusAction.open({ account: a, status: 'FROZEN' })}>Freeze</Button>
            : a.status === 'FROZEN' && <Button size="small" variant="outlined" color="success" onClick={() => statusAction.open({ account: a, status: 'ACTIVE' })}>Unfreeze</Button>)}
        </div></TableCell>
      </TableRow>)}</TableBody></Table></TableContainer> : <Alert severity="info">No accounts yet.</Alert>}

    <Dialog open={!!limits} onClose={busy ? undefined : () => setLimits(null)} fullWidth maxWidth="xs">
      <DialogTitle>Transfer limits · {limits?.accountNumber}</DialogTitle>
      <DialogContent className="sapphire-dialog-fields">
        <TextField label="Per transfer (INR)" value={form.per} onChange={e => setForm(f => ({ ...f, per: e.target.value }))} disabled={busy} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        <TextField label="Per day (INR)" value={form.daily} onChange={e => setForm(f => ({ ...f, daily: e.target.value }))} disabled={busy} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        {limitError && <Alert severity="error">{limitError}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setLimits(null)} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={saveLimits} disabled={busy}>{busy ? 'Saving…' : 'Save limits'}</Button></DialogActions>
    </Dialog>

    <ReasonDialog open={!!statusAction.pending} busy={statusAction.busy} error={statusAction.error} onCancel={statusAction.close}
      title={statusAction.pending ? `${statusAction.pending.status === 'FROZEN' ? 'Freeze' : 'Unfreeze'} ${statusAction.pending.account.accountNumber}` : ''}
      label="Reason (sent to the customer)" required confirmLabel="Confirm"
      onConfirm={reason => statusAction.run(() => api('/admin/accounts/' + encodeURIComponent(statusAction.pending.account.accountId) + '/status', {
        token, method: 'PATCH', data: { status: statusAction.pending.status, reason },
      }), `${statusAction.pending.account.accountNumber} is now ${statusAction.pending.status}`)} />
  </>;
}

function LoansQueue({ token, items, onDone }) {
  const [filter, setFilter] = useState('PENDING');
  const action = useAction(onDone);
  const shown = filter === 'ALL' ? items : items.filter(item => item.status === filter);
  return <>
    <div className="sapphire-toolbar"><TextField select size="small" label="Status" value={filter} onChange={e => setFilter(e.target.value)}>
      {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField></div>
    {shown.length ? <TableContainer><Table size="small">
      <TableHead><TableRow><TableCell>Applied</TableCell><TableCell>Account</TableCell><TableCell>Purpose</TableCell>
        <TableCell align="right">Amount</TableCell><TableCell align="right">EMI</TableCell><TableCell>Term</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
      <TableBody>{shown.map(l => <TableRow key={l.loanId}>
        <TableCell>{dateTime(l.createdAt)}</TableCell><TableCell>{l.accountNumber}</TableCell><TableCell>{l.purpose}</TableCell>
        <TableCell align="right">{money(l.amountMinor)}</TableCell><TableCell align="right">{money(l.emiMinor)}</TableCell>
        <TableCell>{l.termMonths} months</TableCell>
        <TableCell><Chip size="small" label={l.status} color={STATUS_COLORS[l.status] || 'default'} />{l.note && <div className="sapphire-note">{l.note}</div>}</TableCell>
        <TableCell>{l.status === 'PENDING' ? <div className="sapphire-row-actions">
          <Button size="small" variant="contained" color="success" onClick={() => action.open({ loan: l, decision: 'APPROVE' })}>Approve</Button>
          <Button size="small" variant="outlined" color="error" onClick={() => action.open({ loan: l, decision: 'REJECT' })}>Reject</Button>
        </div> : '—'}</TableCell>
      </TableRow>)}</TableBody></Table></TableContainer> : <Alert severity="info">No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}loans.</Alert>}

    <ReasonDialog open={!!action.pending} busy={action.busy} error={action.error} onCancel={action.close}
      title={action.pending ? `${action.pending.decision === 'APPROVE' ? 'Approve' : 'Reject'} loan of ${money(action.pending.loan.amountMinor)}` : ''}
      label="Note" required={action.pending?.decision === 'REJECT'}
      confirmLabel={action.pending?.decision === 'APPROVE' ? 'Approve and credit' : 'Reject'}
      onConfirm={note => action.run(() => api('/admin/loans/' + encodeURIComponent(action.pending.loan.loanId), {
        token, method: 'PATCH', data: { decision: action.pending.decision, ...(note && { note }) },
      }), `Loan ${action.pending.decision === 'APPROVE' ? 'approved and credited' : 'rejected'}`)} />
  </>;
}
