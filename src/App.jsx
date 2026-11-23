// Chooses which page to show from the address (#/register, #/services, #/admin).
// With no "#/..." part, the original Worker page (LiveBank) is shown exactly as before.
import { useEffect, useState } from 'react';
import LiveBank from './LiveBank';
import AdminPage from './sapphire/AdminPage';
import CustomerServices from './sapphire/CustomerServices';
import RegisterPage from './sapphire/RegisterPage';
import './sapphire.css';

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => { setHash(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

function ServicesBar() {
  return <div className="sapphire-bar" role="navigation" aria-label="Sapphire services">
    <span>Sapphire services:</span>
    <a href="#/register">Open an account</a>
    <a href="#/services">My loans and portfolio</a>
    <a href="#/admin">Bank admin</a>
  </div>;
}

export default function App({ bank, switchUrl }) {
  const route = useHashRoute();
  if (route === '/register') return <RegisterPage bank={bank} />;
  if (route === '/services') return <CustomerServices bank={bank} />;
  if (route === '/admin') return <AdminPage bank={bank} />;
  return <><ServicesBar /><LiveBank bank={bank} switchUrl={switchUrl} /></>;
}
