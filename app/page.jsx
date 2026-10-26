'use client';

import { useEffect, useRef, useState } from 'react';
import { OPTIONS } from '../lib/prompt';

const styles = [...OPTIONS.style, 'custom'];
const initialResult = 'Your next scene starts here.\n\nDescribe an idea on the left. Kino will shape the action, camera, atmosphere, and visual continuity into a production-ready direction.';

function Choice({ id, label, options, custom = false }) {
  const [value, setValue] = useState(options.includes('10s') || options.includes('1080p') ? (options.includes('10s') ? '10s' : '1080p') : options[0]);
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <select id={id} name={id} value={value} onChange={event => {
      setValue(event.target.value);
      if (event.target.value === 'Custom…') requestAnimationFrame(() => document.getElementById(id + '-custom')?.focus());
    }}>
      {options.map(option => <option key={option}>{option}</option>)}
      {custom && <option>Custom…</option>}
    </select>
    {custom && value === 'Custom…' && <input type="text" id={id + '-custom'} name={id + '-custom'} defaultValue="" maxLength={120} required placeholder={`Your ${label.toLowerCase()}…`} aria-label={`Custom ${label.toLowerCase()}`} />}
  </div>;
}

function Scene() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d');
    let width = 0, height = 0, particles = [], animationId;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function resize() {
      const bounds = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      width = bounds.width; height = bounds.height;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: 38 }, (_, i) => ({ x: (Math.sin(i * 127.1) * .5 + .5) * width, y: (Math.sin(i * 311.7) * .5 + .5) * height, r: .4 + (i % 4) * .25, v: .06 + (i % 5) * .018 }));
      draw(0);
    }
    function draw(time = 0) {
      ctx.clearRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(width * .63, height * .52, 0, width * .63, height * .52, width * .55);
      glow.addColorStop(0, 'rgba(178,195,119,.13)'); glow.addColorStop(1, 'rgba(15,17,12,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.translate(width * .61, height * .51); ctx.rotate(-.22); ctx.scale(1, .32);
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 72 + i * 29, 72 + i * 29, 0, 0, Math.PI * 2); ctx.strokeStyle = `rgba(211,227,165,${.17 - i * .028})`; ctx.stroke(); }
      ctx.restore();
      particles.forEach((p, i) => { ctx.beginPath(); ctx.arc((p.x + time * p.v * .01) % width, p.y + Math.sin(time * .0004 + i) * 5, p.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(222,236,180,${.16 + (i % 3) * .1})`; ctx.fill(); });
    }
    function animate(time) { draw(time); animationId = requestAnimationFrame(animate); }
    function sync() { cancelAnimationFrame(animationId); if (!document.hidden && !reduced.matches) animationId = requestAnimationFrame(animate); else draw(0); }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); sync();
    document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync);
    return () => { cancelAnimationFrame(animationId); observer.disconnect(); document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync); };
  }, []);
  return <canvas ref={canvasRef} aria-hidden="true" />;
}

export default function Home() {
  const [style, setStyle] = useState('Cinematic');
  const [ideaCount, setIdeaCount] = useState(0);
  const [tab, setTab] = useState('prompt');
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [meta, setMeta] = useState('CINEMATIC · 16:9 · 1080P · GOLDEN HOUR');
  const [token, setToken] = useState('');
  const toastTimer = useRef();
  const turnstileRef = useRef();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    function renderCaptcha() {
      if (window.turnstile && turnstileRef.current && !turnstileRef.current.hasChildNodes()) {
        window.turnstile.render(turnstileRef.current, { sitekey: siteKey, theme: 'dark', callback: setToken, 'expired-callback': () => setToken(''), 'error-callback': () => setToken('') });
      }
    }
    const existing = document.querySelector('script[data-kino-turnstile]');
    if (existing) { existing.addEventListener('load', renderCaptcha); renderCaptcha(); }
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true; script.dataset.kinoTurnstile = 'true'; script.onload = renderCaptcha;
      document.head.append(script);
    }
    return () => { if (window.turnstile && turnstileRef.current) { try { window.turnstile.remove(turnstileRef.current); } catch {} } };
  }, [siteKey]);

  useEffect(() => {
    const form = document.getElementById('builder');
    function update() {
      const data = new FormData(form);
      const selectedStyle = data.get('style') === 'custom' ? (data.get('style-custom') || 'Custom') : data.get('style');
      setMeta([selectedStyle, data.get('ratio'), data.get('resolution'), data.get('light')].filter(Boolean).join(' · ').toUpperCase());
    }
    form.addEventListener('change', update); form.addEventListener('input', update);
    return () => { form.removeEventListener('change', update); form.removeEventListener('input', update); };
  }, []);

  function notify(message) { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2200); }
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  async function generate(event) {
    event.preventDefault(); setError('');
    if (siteKey && !token) return setError('Complete the human verification first.');
    setBusy(true);
    const data = new FormData(event.currentTarget), direction = {};
    for (const [key, value] of data) direction[key] = value;
    if (direction.style === 'custom') direction.style = direction['style-custom'];
    for (const key of Object.keys(OPTIONS)) if (direction[key] === 'Custom…') direction[key] = direction[key + '-custom'];
    try {
      const response = await fetch('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction, turnstileToken: token }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not create your prompt.');
      setResults(payload); setTab('prompt');
      if (innerWidth < 950) document.getElementById('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      window.turnstile?.reset(); setToken('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!results[tab]) return notify('Create a prompt first');
    try { await navigator.clipboard.writeText(results[tab]); notify('Copied to clipboard'); }
    catch { notify('Select the text to copy'); }
  }

  return <>
    <div className="noise" aria-hidden="true" />
    <main className="shell">
      <nav className="nav" aria-label="Main navigation"><a className="brand" href="#" aria-label="Kino home"><span className="brand-mark" aria-hidden="true" />KINO</a><div className="nav-right"><a className="nav-link" href="#studio">Prompt studio</a><span className="engine"><span className="status-dot" />Seedance 2.5</span></div></nav>
      <header className="hero"><div><p className="eyebrow">From imagination to motion</p><h1>Direct the extraordinary.<br /><em>One prompt at a time.</em></h1></div><p className="hero-copy">A considered workspace for crafting cinematic, precise prompts for Seedance 2.5.</p></header>
      <section className="workspace" id="studio" aria-label="Prompt studio">
        <form className="panel builder" id="builder" onSubmit={generate}>
          <div className="panel-heading"><h2>Set the scene</h2><span className="step">01 — Your vision</span></div>
          <div className="field"><div className="label-row"><label htmlFor="idea">Your idea</label><span className="hint">{ideaCount} / 800</span></div><textarea id="idea" name="idea" maxLength={800} required onChange={event => setIdeaCount(event.target.value.length)} placeholder="A lone traveller crosses a windswept rice field at dawn, distant mountains emerging through the mist…" /></div>
          <div className="field"><span className="label" id="style-label">Visual language</span><div className="chips" role="group" aria-labelledby="style-label">{styles.map(item => <button type="button" className={`chip ${style === item ? 'active' : ''}`} key={item} aria-pressed={style === item} onClick={() => { setStyle(item); if (item === 'custom') requestAnimationFrame(() => document.getElementById('style-custom')?.focus()); }}>{item === 'custom' ? 'Custom…' : item}</button>)}</div><input type="hidden" name="style" value={style} />{style === 'custom' && <input type="text" id="style-custom" name="style-custom" maxLength={120} required placeholder="Describe your own visual language…" aria-label="Custom visual language" />}</div>
          <div className="field-row three"><Choice id="camera" label="Camera movement" options={OPTIONS.camera} custom /><Choice id="angle" label="Camera angle" options={OPTIONS.angle} custom /><Choice id="composition" label="Composition" options={OPTIONS.composition} custom /></div>
          <div className="field-row three"><Choice id="light" label="Lighting" options={OPTIONS.light} custom /><Choice id="ratio" label="Frame" options={OPTIONS.ratio} /><Choice id="duration" label="Duration" options={OPTIONS.duration} /><Choice id="resolution" label="Resolution" options={OPTIONS.resolution} /></div>
          <details><summary>Refine atmosphere & sound</summary><div className="advanced"><Choice id="mood" label="Mood" options={OPTIONS.mood} custom /><div className="field"><label htmlFor="audio">Audio direction <span className="hint">(optional)</span></label><textarea id="audio" name="audio" maxLength={300} placeholder="Gentle wind, distant birds, soft footsteps…" /></div></div></details>
          {siteKey && <div className="captcha" ref={turnstileRef} />}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="generate" type="submit" disabled={busy}><span>{busy ? 'Directing your scene…' : 'Craft my prompt'}</span><span aria-hidden="true">{busy ? '···' : '→'}</span></button>
          <p className="privacy">Powered by Kimi-k3 · Your ideas are not stored</p>
        </form>
        <section className="panel output" aria-label="Generated prompt">
          <div className="visual"><Scene /><div className="visual-top"><span className="visual-label">Visual study / 001</span><span className="live">Live canvas</span></div><div className="visual-bottom"><div><div className="scene-name">Stillness, in motion.</div><div className="scene-meta">{meta}</div></div><div className="frame-icon" aria-hidden="true">↗</div></div></div>
          <div className="result-body">
            <div className="result-top"><div className="tabs" role="tablist" aria-label="Prompt results" onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault(); const tabs = ['prompt', 'negative'], next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + 2) % 2]; setTab(next); document.getElementById('tab-' + next).focus();
            }}>{['prompt', 'negative'].map(item => <button className={`tab ${tab === item ? 'active' : ''}`} role="tab" aria-selected={tab === item} aria-controls="result" id={`tab-${item}`} key={item} onClick={() => setTab(item)}>{item === 'prompt' ? 'Seedance prompt' : 'Exclusions'}</button>)}</div><button className="icon-button" type="button" aria-label="Clear prompt" onClick={() => { setResults({}); notify('Canvas cleared'); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg></button></div>
            <p className="prompt-output" id="result" role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={busy}>{busy ? 'Kimi is shaping your direction into a cinematic prompt…' : results[tab] || (Object.keys(results).length ? 'No notes for this section.' : initialResult)}</p>
            <div className="output-footer"><span><span className="tiny-spark">✦</span> Designed for visual precision</span><button className="copy-main" type="button" onClick={copy}>Copy prompt <span aria-hidden="true">⧉</span></button></div>
          </div>
        </section>
      </section>
      <footer className="footer"><span>CRAFTED FOR <b>SEEDANCE 2.5</b></span><span>LESS PROMPTING. MORE DIRECTING.</span></footer>
    </main>
    <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
  </>;
}
