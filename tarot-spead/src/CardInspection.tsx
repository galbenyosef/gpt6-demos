import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ZoomIn} from 'lucide-react';
import type {Lang} from './data';

export type CardPreview = {image: string; name: string; reversed: boolean};
type MenuState = {x: number; y: number; card: CardPreview; origin: HTMLElement};

function ZoomedCard({card, lang, origin, onClose}: {card: CardPreview; lang: Lang; origin: HTMLElement; onClose: ()=>void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    const dismiss = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation(); onClose();
    };
    document.addEventListener('keydown', dismiss, true);
    return () => {
      document.removeEventListener('keydown', dismiss, true);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if(origin.isConnected) origin.focus({preventScroll:true});
    };
  }, [onClose, origin]);
  return <dialog ref={ref} className="card-zoom" aria-label={card.name} onCancel={onClose} onClick={onClose} onAuxClick={onClose} onContextMenu={e=>{e.preventDefault();onClose();}}>
    <figure>
      <img src={card.image} alt={card.name} draggable={false} style={{transform: card.reversed ? 'rotate(180deg)' : undefined}}/>
      <figcaption><strong>{card.name}</strong><span>{lang === 'en' ? 'Press any key or click anywhere to return' : 'Pulsa cualquier tecla o haz clic para volver'}</span></figcaption>
    </figure>
  </dialog>;
}

function CardContextMenu({menu, lang, onClose, onZoom}: {menu: MenuState; lang: Lang; onClose: ()=>void; onZoom: ()=>void}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const outside = (event: PointerEvent) => {if(!ref.current?.contains(event.target as Node)) onClose();};
    const key = (event: KeyboardEvent) => {if(event.key==='Escape' || event.key==='Tab'){event.preventDefault();onClose();menu.origin.focus({preventScroll:true});}};
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [menu.origin, onClose]);
  return <div ref={ref} role="menu" aria-label={lang === 'en' ? 'Card options' : 'Opciones de carta'} className="card-context-menu" style={{left: Math.max(10, Math.min(menu.x, window.innerWidth-200)), top: Math.max(10, Math.min(menu.y, window.innerHeight-64))}} onContextMenu={e=>e.preventDefault()}>
    <button role="menuitem" onClick={onZoom}><ZoomIn size={17}/>{lang === 'en' ? 'Zoom card' : 'Ampliar carta'}</button>
  </div>;
}

export function useCardInspection(lang: Lang) {
  const [menu, setMenu] = useState<MenuState|null>(null);
  const [zoom, setZoom] = useState<{card: CardPreview; origin: HTMLElement}|null>(null);
  const closeMenu = useCallback(()=>setMenu(null), []);
  const closeZoom = useCallback(()=>setZoom(null), []);
  const openMenu = (event: React.MouseEvent<HTMLElement>|React.KeyboardEvent<HTMLElement>, card: CardPreview) => {
    event.preventDefault(); event.stopPropagation();
    const origin = event.currentTarget;
    const bounds = origin.getBoundingClientRect();
    setMenu({card, origin, x:('clientX' in event && event.clientX) || bounds.left+bounds.width/2, y:('clientY' in event && event.clientY) || bounds.top+bounds.height/2});
  };
  const openZoom = (card: CardPreview, origin: HTMLElement) => {setMenu(null);setZoom({card, origin});};
  return {openMenu, openZoom, overlay: <>
    {menu && <CardContextMenu menu={menu} lang={lang} onClose={closeMenu} onZoom={()=>openZoom(menu.card,menu.origin)}/>}
    {zoom && <ZoomedCard card={zoom.card} lang={lang} origin={zoom.origin} onClose={closeZoom}/>}
  </>};
}
