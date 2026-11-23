// Open an account: the customer's application form (POST /api/register on the Sapphire backend).
// The Rs 1,000 opening amount is credited only after the bank approves the application.
import { useState } from 'react';
import { Alert, Button, TextField } from '@mui/material';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { api } from './api';
import { Shell } from './Shell';

const MAX_BYTES = 2 * 1024 * 1024;
const EMPTY = { fullName: '', email: '', password: '', confirm: '', phone: '', address: '', dateOfBirth: '' };

export default function RegisterPage({ bank }) {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const set = field => event => {
    setForm(current => ({ ...current, [field]: event.target.value }));
    setErrors(current => ({ ...current, [field]: '' }));
  };

  function validate() {
    const next = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';
    if (!/^(\+91)?[6-9]\d{9}$/.test(form.phone.replace(/[\s-]/g, ''))) next.phone = 'Enter a 10-digit Indian mobile number.';
    if (form.address.trim().length < 5) next.address = 'Enter your address.';
    if (!form.dateOfBirth) next.dateOfBirth = 'Enter your date of birth.';
    if (!file) next.document = 'Upload an ID document (PDF, JPG or PNG).';
    else if (file.size > MAX_BYTES) next.document = 'The file is larger than 2 MB.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!validate()) return;
    const body = new FormData();
    for (const field of ['fullName', 'email', 'password', 'phone', 'address', 'dateOfBirth']) body.append(field, form[field].trim ? form[field].trim() : form[field]);
    body.set('password', form.password); // never trim a password
    body.append('document', file);
    setBusy(true);
    try {
      setDone(await api('/register', { method: 'POST', form: body }));
      setForm(EMPTY);
      setFile(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <Shell bank={bank} active="#/register" title="Open an account"
    subtitle={`Apply for a ${bank.name} savings account. Rs 1,000 is credited once your application is approved.`}>
    {done ? <section className="panel sapphire-narrow"><header className="panel-head"><div>
      <h2>Application received</h2><p>Reference: {done.requestId}</p></div><CheckCircle2 size={20} /></header>
      <Alert severity="info">Your application is <strong>pending approval</strong>. You will receive an email when the bank decides.
        After approval, sign in on the <a href="#/">Accounts and transfers</a> page with the same email and password.</Alert>
      <div className="sapphire-actions"><Button variant="outlined" onClick={() => setDone(null)}>Submit another application</Button></div>
    </section> :
    <section className="panel sapphire-narrow"><header className="panel-head"><div>
      <h2>Your details</h2><p>All fields are required.</p></div><UserPlus size={19} /></header>
      <form className="transfer-form" onSubmit={submit} noValidate>
        <TextField label="Full name" value={form.fullName} onChange={set('fullName')} error={!!errors.fullName} helperText={errors.fullName} disabled={busy} autoComplete="name" />
        <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={!!errors.email} helperText={errors.email} disabled={busy} autoComplete="email" />
        <div className="sapphire-two">
          <TextField label="Password" type="password" value={form.password} onChange={set('password')} error={!!errors.password} helperText={errors.password || 'At least 8 characters'} disabled={busy} autoComplete="new-password" />
          <TextField label="Confirm password" type="password" value={form.confirm} onChange={set('confirm')} error={!!errors.confirm} helperText={errors.confirm} disabled={busy} autoComplete="new-password" />
        </div>
        <div className="sapphire-two">
          <TextField label="Mobile number" value={form.phone} onChange={set('phone')} error={!!errors.phone} helperText={errors.phone} disabled={busy} autoComplete="tel" />
          <TextField label="Date of birth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} error={!!errors.dateOfBirth} helperText={errors.dateOfBirth} disabled={busy} slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <TextField label="Address" multiline minRows={2} value={form.address} onChange={set('address')} error={!!errors.address} helperText={errors.address} disabled={busy} autoComplete="street-address" />
        <div className="sapphire-file">
          <Button variant="outlined" component="label" disabled={busy}>Choose ID document
            <input hidden type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={e => { setFile(e.target.files?.[0] || null); setErrors(c => ({ ...c, document: '' })); }} />
          </Button>
          <span>{file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : 'PDF, JPG or PNG, max 2 MB'}</span>
        </div>
        {errors.document && <Alert severity="warning">{errors.document}</Alert>}
        <Alert severity="info">Opening amount: <strong>Rs 1,000.00</strong>, credited once after approval.</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <div><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</Button></div>
      </form>
    </section>}
  </Shell>;
}
