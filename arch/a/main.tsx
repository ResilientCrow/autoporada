import './jitless';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './base.css';
import './app.css';
import { StoreProvider, useRoute, useStore } from '../core/react';
import * as Q from '../core/select';
import { AkceDetail, Navrh, NovaAkce } from './akce';
import { Clovek, Lide, Login, Nastaveni, NovyRok, Pristup, Seznam, Seznamy, Soukromi, Ucet } from './admin';
import { Domu, Moje, NotFound, Tyden, Udalosti, Zprava } from './home';
import { Archiv, ArchivDoc, Hotovo, Nahled, Pokyny, Porada, Pridat, Prilohy, Udaje, Zpravy } from './porada';
import { Kontrola } from './review';
import { Oprava, Wizard } from './write';

function Router() {
  const { s } = useStore(); const r = useRoute(); const [a, b, c] = r.parts; const u = Q.me(s);
  if (a === 'soukromi') return <Soukromi />;
  if (!u) return <Login />;
  if (u.role === 'pending' || u.status === 'blocked') return <Pristup />;
  const head = u.role === 'headmaster'; const staff = Q.atLeast(u.role, 'reviewer');
  switch (a) {
    case undefined: return <Domu />;
    case 'tyden': return <Tyden />;
    case 'moje': return <Moje />;
    case 'akce': return b ? <AkceDetail key={b} id={b} fresh={r.q.has('fresh')} /> : <Udalosti />;
    case 'nova-akce': return b ? <NovaAkce id={b} {...(c ? { step: c } : {})} /> : <NotFound />;
    case 'navrh': return b && staff ? <Navrh id={b} /> : <NotFound />;
    case 'psat': return b ? <Wizard key={`${b}-${c}`} id={b} {...(c ? { step: c } : {})} /> : <NotFound />;
    case 'oprava': return b ? <Oprava id={b} /> : <NotFound />;
    case 'zprava': return b ? <Zprava key={b} id={b} fresh={r.q.has('fresh')} /> : <NotFound />;
    case 'kontrola': return staff ? <Kontrola {...(b ? { id: b } : {})} /> : <NotFound />;
    case 'archiv': return staff ? (b ? <ArchivDoc m={b} /> : <Archiv />) : <NotFound />;
    case 'hotovo': return head && b ? <Hotovo m={b} /> : <NotFound />;
    case 'pridat': return head ? <Pridat /> : <NotFound />;
    case 'porada':
      if (!head) return <NotFound />;
      if (b === 'udaje') return <Udaje />;
      if (b === 'prilohy') return <Prilohy key={c ?? 'list'} {...(c ? { id: c } : {})} />;
      if (b === 'pokyny') return <Pokyny key={c ?? 'list'} {...(c ? { rowId: c } : {})} />;
      if (b === 'pokyny-novy') return <Pokyny key="new" adding section={r.q.get('sekce') === 'hospodareni' ? 'hospodareni' : 'pokyny'} />;
      if (b === 'zpravy') return <Zpravy />;
      if (b === 'nahled') return <Nahled />;
      return <Porada />;
    case 'lide': return head ? (b ? <Clovek id={b} /> : <Lide />) : <NotFound />;
    case 'seznamy': return staff ? (b ? <Seznam key={b} id={b} /> : <Seznamy />) : <NotFound />;
    case 'novy-rok': return head ? <NovyRok /> : <NotFound />;
    case 'nastaveni': return head ? <Nastaveni /> : <NotFound />;
    case 'ucet': return <Ucet />;
    default: return <NotFound />;
  }
}
createRoot(document.getElementById('root')!).render(<StoreProvider ns="a"><Router /></StoreProvider>);
