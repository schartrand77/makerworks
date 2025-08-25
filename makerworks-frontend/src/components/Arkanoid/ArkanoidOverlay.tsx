// src/components/Arkanoid/ArkanoidOverlay.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from '@/hooks/useUser';

type Vec = { x: number; y: number };
type Ball = { p: Vec; v: Vec; r: number; stuck?: boolean };
type Brick = { x: number; y: number; w: number; h: number; hp: number; alive: boolean; color: string; drops?: PowerType[] };
type PowerType = 'E'|'S'|'M'|'C'|'L'|'R'|'P'; // Expand, Slow, Multi, Catch, Laser (not implemented), Reduce, 1UP
type Capsule = { x: number; y: number; w: number; h: number; type: PowerType; vy: number };
type Laser = { x: number; y: number; h: number; w: number; vy: number };

type LeaderRow = { name: string; score: number; date: string };

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
const WIDTH = 900;
const HEIGHT = 650;
const PADDLE_H = 18;
const PADDLE_W = 120;
const BALL_R = 8;
const WALL = 12;

const LB_KEY = 'mw.arkanoid.leaderboard.v1';
function loadLB(): LeaderRow[] {
  try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]') } catch { return []; }
}
function saveLB(rows: LeaderRow[]) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(rows.slice(0, 50))); } catch {}
}

const rand = (a:number,b:number)=>a+Math.random()*(b-a);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

function sfxBeep(freq=880, dur=0.06, vol=0.04){
  try{
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type='square'; o.frequency.value=freq;
    g.gain.value = vol; o.connect(g); g.connect(ctx.destination);
    o.start(); setTimeout(()=>{o.stop(); ctx.close();}, dur*1000);
  }catch{}
}

function mkLevels(): number[][] {
  // Simple encoded levels: 0 empty, 1 normal, 2 strong, 3 very strong (HP)
  return [
    // Level 1
    [
      0,1,1,1,1,1,1,1,1,1,0,
      1,1,2,2,2,2,2,2,2,1,1,
      1,2,2,3,3,3,3,3,2,2,1,
      1,1,2,2,2,2,2,2,2,1,1,
      0,1,1,1,1,1,1,1,1,1,0,
    ],
    // Level 2
    [
      1,0,1,0,1,0,1,0,1,0,1,
      0,2,0,2,0,2,0,2,0,2,0,
      1,0,3,0,3,0,3,0,3,0,1,
      0,2,0,2,0,2,0,2,0,2,0,
      1,0,1,0,1,0,1,0,1,0,1,
    ],
    // Level 3 (bossy)
    [
      2,2,2,2,2,2,2,2,2,2,2,
      2,3,3,3,3,3,3,3,3,3,2,
      2,3,0,0,0,0,0,0,0,3,2,
      2,3,0,3,3,3,3,3,0,3,2,
      2,3,3,3,3,3,3,3,3,3,2,
    ],
  ];
}

function colorFor(hp:number){
  if (hp<=1) return '#22c55e'; // emerald
  if (hp===2) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

function ArkanoidOverlay({ onClose }: { onClose: () => void }) {
  const root = typeof document!=='undefined' ? document.body : null;
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const [paused, setPaused] = useState(false);
  const [running, setRunning] = useState(true);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [levelIdx, setLevelIdx] = useState(0);
  const [lb, setLb] = useState<LeaderRow[]>(() => loadLB());
  const [showHelp, setShowHelp] = useState(true);
  const showHelpRef = useRef(true); // keep draw loop in sync

  useEffect(() => { showHelpRef.current = showHelp; }, [showHelp]);

  const { user } = useUser();
  const playerName = useMemo(() => {
    const guess = (user?.username || user?.name || user?.email || '').split('@')[0];
    return guess || 'Player';
  }, [user]);

  const levels = useMemo(() => mkLevels(), []);
  const bricksRef = useRef<Brick[]>([]);
  const ballsRef = useRef<Ball[]>([]);
  const paddleRef = useRef({ x: WIDTH/2 - PADDLE_W/2, y: HEIGHT - 80, w: PADDLE_W, h: PADDLE_H, vx: 0, sticky: false, laser: false });
  const capsulesRef = useRef<Capsule[]>([]);
  const lasersRef = useRef<Laser[]>([]);
  const keysRef = useRef<Record<string,boolean>>({});
  const mouseXRef = useRef<number|null>(null);
  const speedScaleRef = useRef(1);
  const levelClearedRef = useRef(false);
  const gameOverRef = useRef(false);

  // --- Gamepad support ---
  const gamepadIdxRef = useRef<number | null>(null);
  const gpAxisXRef = useRef(0);          // -1..1 from left stick or d-pad
  const gpButtonsPrevRef = useRef<boolean[]>([]);
  const [gpConnected, setGpConnected] = useState(false);

  function gpRumble(strength = 0.25, durationMs = 40) {
    try {
      const idx = gamepadIdxRef.current;
      if (idx == null) return;
      const gp = navigator.getGamepads?.()[idx];
      const vib = (gp as any)?.vibrationActuator;
      if (vib?.playEffect) {
        vib.playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: strength,
          strongMagnitude: strength * 0.8,
        }).catch(() => {});
      }
    } catch {}
  }

  // Build level bricks
  const buildLevel = (idx:number) => {
    const grid = levels[idx];
    const cols = 11, rows = 5;
    const marginTop = 80;
    const gap = 6;
    const brickW = Math.floor((WIDTH - WALL*2 - gap*(cols-1)) / cols);
    const brickH = 26;

    const arr: Brick[] = [];
    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        const hp = grid[r*cols + c];
        if (!hp) continue;
        const x = WALL + c*(brickW+gap);
        const y = marginTop + r*(brickH+gap);
        const drops: PowerType[] = [];
        if (Math.random() < 0.15) drops.push('M'); // multiball
        if (Math.random() < 0.15) drops.push(Math.random()<0.5?'E':'S'); // expand/slow
        if (Math.random() < 0.08) drops.push('C'); // catch
        if (Math.random() < 0.05) drops.push(Math.random()<0.5?'R':'P'); // reduce/1up
        arr.push({ x, y, w: brickW, h: brickH, hp, alive: true, color: colorFor(hp), drops });
      }
    }
    bricksRef.current = arr;
  };

  const resetBall = (keepOthers=false) => {
    const p = { x: paddleRef.current.x + paddleRef.current.w/2, y: paddleRef.current.y - BALL_R - 2 };
    const v = { x: rand(-180, 180), y: -360 };
    const b: Ball = { p, v, r: BALL_R, stuck: true };
    if (!keepOthers) ballsRef.current = [b]; else ballsRef.current.push(b);
  };

  // Init level & ball
  useEffect(() => {
    buildLevel(levelIdx);
    resetBall(false);
    levelClearedRef.current = false;
    gameOverRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelIdx]);

  // Controls (keyboard + mouse)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'p' || e.key === 'P') setPaused(p => !p);
      keysRef.current[e.key] = true;
      if (e.key === ' ' || e.key === 'Spacebar') {
        ballsRef.current.forEach(b => { if (b.stuck) b.stuck = false; });
        setShowHelp(false);
      }
    };
    const ku = (e: KeyboardEvent) => { keysRef.current[e.key] = false; };
    const mm = (e: MouseEvent) => { mouseXRef.current = e.clientX; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('mousemove', mm);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mousemove', mm);
    };
  }, [onClose]);

  // Gamepad connect/disconnect + polling loop
  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      if (gamepadIdxRef.current == null) {
        gamepadIdxRef.current = e.gamepad.index;
      }
      setGpConnected(true);
    };
    const onDisconnect = (e: GamepadEvent) => {
      if (gamepadIdxRef.current === e.gamepad.index) {
        gamepadIdxRef.current = null;
        gpAxisXRef.current = 0;
      }
      const any = (navigator.getGamepads?.() || []).some(Boolean);
      setGpConnected(any);
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    let raf = 0;
    const DEAD = 0.18;
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pads = navigator.getGamepads?.();
      if (!pads) return;
      let gp: Gamepad | null = null;
      if (gamepadIdxRef.current != null) gp = pads[gamepadIdxRef.current] || null;
      if (!gp) {
        gp = (pads as any[]).find(Boolean) || null;
        if (gp) gamepadIdxRef.current = gp.index;
      }
      if (!gp) return;

      const rawAx = gp.axes[0] ?? 0;
      const ax = Math.abs(rawAx) > DEAD ? (rawAx as number) : 0;
      const dpadLeft = gp.buttons[14]?.pressed ? -1 : 0;
      const dpadRight = gp.buttons[15]?.pressed ? 1 : 0;
      const axis = ax !== 0 ? ax : (dpadLeft || dpadRight);
      gpAxisXRef.current = axis;

      const prev = gpButtonsPrevRef.current;
      const cur = gp.buttons.map(b => !!b?.pressed);
      const pressed = (i: number) => cur[i] && !prev[i];

      if (pressed(0)) { // A / Cross
        ballsRef.current.forEach(b => { if (b.stuck) b.stuck = false; });
        setShowHelp(false);
      }
      if (pressed(1)) onClose();     // B / Circle
      if (pressed(9)) setPaused(p => !p); // Start / Options

      gpButtonsPrevRef.current = cur;
      setGpConnected(true);
    };
    raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, [onClose]);

  // Resize canvas for DPR
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    c.width = WIDTH * DPR; c.height = HEIGHT * DPR;
    c.style.width = WIDTH+'px'; c.style.height = HEIGHT+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }, []);

  // Physics/game loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (t:number) => {
      raf = requestAnimationFrame(tick);
      if (!running || paused) { draw(); last = t; return; }
      const dt = Math.min(0.033, (t - last)/1000);
      last = t;
      update(dt);
      draw();
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, paused]);

  // Update
  const update = (dt:number) => {
    const p = paddleRef.current;
    const sp = 550;

    if (mouseXRef.current != null) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = mouseXRef.current - rect.left;
      p.x = clamp(mx - p.w/2, WALL, WIDTH - WALL - p.w);
    } else if (gpConnected && Math.abs(gpAxisXRef.current) > 0) {
      const vx = gpAxisXRef.current * sp * 1.05;
      p.x = clamp(p.x + vx*dt, WALL, WIDTH - WALL - p.w);
      mouseXRef.current = null;
    } else {
      let vx = 0;
      if (keysRef.current['ArrowLeft'] || keysRef.current['a']) vx -= sp;
      if (keysRef.current['ArrowRight'] || keysRef.current['d']) vx += sp;
      p.x = clamp(p.x + vx*dt, WALL, WIDTH - WALL - p.w);
    }

    // If any ball is free, ensure help hides
    if (showHelpRef.current && ballsRef.current.some(b => !b.stuck)) {
      setShowHelp(false);
    }

    // move stuck balls with paddle
    ballsRef.current.forEach(b => {
      if (b.stuck) {
        b.p.x = p.x + p.w/2;
        b.p.y = p.y - b.r - 2;
      }
    });

    // capsules
    capsulesRef.current.forEach(c => { c.y += c.vy*dt; });
    capsulesRef.current = capsulesRef.current.filter(c => c.y < HEIGHT - WALL);
    for (const c of capsulesRef.current) {
      if (rectsIntersect(c.x, c.y, c.w, c.h, p.x, p.y, p.w, p.h)) {
        applyPower(c.type);
        c.y = HEIGHT + 999;
        sfxBeep(660, 0.06, 0.05);
      }
    }
    capsulesRef.current = capsulesRef.current.filter(c => c.y < HEIGHT);

    lasersRef.current.forEach(L => { L.y += L.vy*dt; });
    lasersRef.current = lasersRef.current.filter(L => L.y + L.h > WALL);

    const speedScale = speedScaleRef.current;
    for (const b of ballsRef.current) {
      if (b.stuck) continue;
      b.p.x += b.v.x*dt*speedScale;
      b.p.y += b.v.y*dt*speedScale;

      if (b.p.x - b.r < WALL) { b.p.x = WALL + b.r; b.v.x = Math.abs(b.v.x); sfxBeep(880); }
      if (b.p.x + b.r > WIDTH - WALL) { b.p.x = WIDTH - WALL - b.r; b.v.x = -Math.abs(b.v.x); sfxBeep(880); }
      if (b.p.y - b.r < WALL) { b.p.y = WALL + b.r; b.v.y = Math.abs(b.v.y); sfxBeep(780); }

      if (circleRect(b.p.x, b.p.y, b.r, p.x, p.y, p.w, p.h) && b.v.y > 0) {
        const hitPos = (b.p.x - (p.x + p.w/2)) / (p.w/2); // -1..1
        const angle = hitPos * (Math.PI * 0.4);
        const speed = Math.hypot(b.v.x, b.v.y);
        b.v.x = Math.sin(angle) * speed;
        b.v.y = -Math.abs(Math.cos(angle) * speed);
        sfxBeep(520);
        gpRumble(0.2, 22);
      }

      if (b.p.y - b.r > HEIGHT) {
        b.r = -1;
      }
    }
    ballsRef.current = ballsRef.current.filter(b => b.r > 0);
    if (ballsRef.current.length === 0) {
      const rem = lives - 1;
      setLives(rem);
      if (rem <= 0) {
        gameOverRef.current = true;
        setRunning(false);
        const rows = loadLB();
        rows.push({ name: playerName, score, date: new Date().toISOString() });
        rows.sort((a,b)=>b.score-a.score);
        saveLB(rows);
        setLb(rows);
      } else {
        resetBall(false);
        speedScaleRef.current = 1;
        paddleRef.current.sticky = false;
        setShowHelp(true);
      }
    }

    for (const b of ballsRef.current) {
      for (const br of bricksRef.current) {
        if (!br.alive) continue;
        if (!circleRect(b.p.x, b.p.y, b.r, br.x, br.y, br.w, br.h)) continue;

        const prev = { x: b.p.x - b.v.x*dt*speedScale, y: b.p.y - b.v.y*dt*speedScale };
        const overlapLeft = (prev.x + b.r) - br.x;
        const overlapRight = (br.x + br.w) - (prev.x - b.r);
        const overlapTop = (prev.y + b.r) - br.y;
        const overlapBottom = (br.y + br.h) - (prev.y - b.r);
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (minOverlap === overlapLeft) b.v.x = -Math.abs(b.v.x);
        else if (minOverlap === overlapRight) b.v.x = Math.abs(b.v.x);
        else if (minOverlap === overlapTop) b.v.y = -Math.abs(b.v.y);
        else b.v.y = Math.abs(b.v.y);

        br.hp -= 1;
        br.color = colorFor(br.hp);
        if (br.hp <= 0) {
          br.alive = false;
          setScore(s => s + 50);
          sfxBeep(300, 0.06, 0.06);
          gpRumble(0.35, 35);
          for (const t of (br.drops||[])) {
            if (Math.random() < 0.6) {
              capsulesRef.current.push({ x: br.x + br.w/2 - 12, y: br.y + br.h, w: 24, h: 14, type: t, vy: 140 });
            }
          }
        } else {
          setScore(s => s + 10);
          sfxBeep(420, 0.04, 0.04);
          gpRumble(0.18, 18);
        }
      }
    }

    if (!gameOverRef.current && bricksRef.current.every(b => !b.alive)) {
      levelClearedRef.current = true;
      setScore(s => s + 500);
      setLevelIdx(i => {
        const next = i+1;
        if (next >= levels.length) {
          gameOverRef.current = true;
          setRunning(false);
          const rows = loadLB();
          rows.push({ name: playerName, score, date: new Date().toISOString() });
          rows.sort((a,b)=>b.score-a.score);
          saveLB(rows);
          setLb(rows);
          return i;
        } else {
          buildLevel(next);
          resetBall(false);
          speedScaleRef.current = 1 + next*0.15;
          paddleRef.current.sticky = false;
          setShowHelp(true);
          levelClearedRef.current = false;
          return next;
        }
      });
    }
  };

  function applyPower(t: PowerType) {
    const p = paddleRef.current;
    switch (t) {
      case 'E': p.w = clamp(p.w + 60, 80, 240); break;
      case 'R': p.w = clamp(p.w - 40, 80, 240); break;
      case 'S': speedScaleRef.current = Math.max(0.7, speedScaleRef.current * 0.85); break;
      case 'C': p.sticky = true; break;
      case 'P': setLives(l => l + 1); break;
      case 'M': {
        const clones: Ball[] = [];
        for (const b of ballsRef.current.slice(0, 2)) {
          if (b.stuck) continue;
          const speed = Math.hypot(b.v.x, b.v.y);
          clones.push({
            p: { x: b.p.x, y: b.p.y },
            v: { x: -b.v.y*0.5, y: b.v.x*0.5 - Math.abs(speed*0.8) },
            r: BALL_R
          });
          clones.push({
            p: { x: b.p.x, y: b.p.y },
            v: { x: b.v.y*0.5, y: b.v.x*-0.5 - Math.abs(speed*0.8) },
            r: BALL_R
          });
        }
        ballsRef.current.push(...clones);
        break;
      }
      case 'L': /* reserved: laser */ break;
    }
  }

  // Draw
  const draw = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0,0,WIDTH,HEIGHT);

    const g = ctx.createLinearGradient(0,0,0,HEIGHT);
    g.addColorStop(0, '#0b1220');
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,WIDTH,HEIGHT);

    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(0,0,WIDTH,WALL);
    ctx.fillRect(0,0,WALL,HEIGHT);
    ctx.fillRect(WIDTH-WALL,0,WALL,HEIGHT);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`SCORE ${score}`, WALL+6, 24);
    ctx.fillText(`LIVES ${lives}`, WALL+150, 24);
    ctx.fillText(`LEVEL ${levelIdx+1}`, WALL+260, 24);
    if (paused) ctx.fillText('PAUSED (P)', WIDTH-140, 24);

    for (const b of bricksRef.current) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(b.x+2, b.y+2, b.w-4, 5);
    }

    for (const cap of capsulesRef.current) {
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(cap.x, cap.y, cap.w, cap.h);
      ctx.fillStyle = '#0c4a6e';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(cap.type, cap.x+8, cap.y+11);
    }

    const p = paddleRef.current;
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(p.x+2, p.y+2, p.w-4, 4);

    ctx.fillStyle = '#e5e7eb';
    for (const b of ballsRef.current) {
      ctx.beginPath();
      ctx.arc(b.p.x, b.p.y, b.r, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.fillStyle = '#ef4444';
    for (const L of lasersRef.current) {
      ctx.fillRect(L.x, L.y, L.w, L.h);
    }

    if (showHelpRef.current && !gameOverRef.current) {
      banner(ctx, 'SPACE to Launch • Mouse or ← → to Move • P to Pause • Esc to Exit');
    }

    if (gameOverRef.current) {
      banner(ctx, 'GAME OVER — Press Esc to exit');
    }
  };

  function banner(ctx: CanvasRenderingContext2D, text: string) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(80, HEIGHT/2 - 40, WIDTH-160, 80);
    ctx.strokeStyle = 'rgba(34,197,94,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(80, HEIGHT/2 - 40, WIDTH-160, 80);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '16px ui-monospace, monospace';
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, (WIDTH - tw)/2, HEIGHT/2 + 6);
    ctx.restore();
  }

  function rectsIntersect(ax:number, ay:number, aw:number, ah:number, bx:number, by:number, bw:number, bh:number){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ah + ay > by;
  }
  function circleRect(cx:number, cy:number, r:number, rx:number, ry:number, rw:number, rh:number){
    const x = clamp(cx, rx, rx+rw);
    const y = clamp(cy, ry, ry+rh);
    const dx = cx - x, dy = cy - y;
    return dx*dx + dy*dy <= r*r;
  }

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey as any);
      prev?.focus?.();
    };
  }, []);

  if (!root) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backdropFilter: 'blur(8px)',
        background: 'linear-gradient(180deg, rgba(2,6,23,0.65), rgba(2,6,23,0.85))'
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target?.dataset?.role === 'overlay-root') onClose();
      }}
      data-role="overlay-root"
    >
      <div className="relative shadow-2xl rounded-xl border border-emerald-500/40 bg-black/40">
        <header className="flex items-center justify-between px-4 py-3">
          <h2 className="text-emerald-200 font-semibold tracking-wide">
            Arkanoid — {user?.username || user?.name || 'Player'}
          </h2>
          <div className="flex items-center gap-2 text-xs text-emerald-300/80">
            <kbd className="px-2 py-1 rounded bg-emerald-900/40 border border-emerald-600/40">Esc</kbd>
            <span>exit</span>
          </div>
        </header>

        {/* Center canvas in panel; dock sidebar to the right only on very wide screens */}
        <div className="p-4">
          <div className="flex items-start justify-center gap-4">
            {/* Ghost column balances the sidebar so the canvas stays centered */}
            <div className="hidden 2xl:block w-72" aria-hidden="true" />
            <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
            <aside className="hidden 2xl:block w-72">
              <Leaderboard
                playerName={playerName}
                currentScore={score}
                rows={lb}
                onClear={() => {
                  saveLB([]);
                  setLb([]);
                }}
              />
              <Controls />
              <div className="mt-3 text-xs text-emerald-300/80">
                {gpConnected ? '🎮 Gamepad connected' : '— connect a gamepad for stick controls —'}
              </div>
            </aside>
          </div>

          {/* On smaller screens, put the sidebar below, centered */}
          <aside className="2xl:hidden mt-4 w-full max-w-[20rem] mx-auto">
            <Leaderboard
              playerName={playerName}
              currentScore={score}
              rows={lb}
              onClear={() => {
                saveLB([]);
                setLb([]);
              }}
            />
            <Controls />
            <div className="mt-3 text-xs text-emerald-300/80 text-center">
              {gpConnected ? '🎮 Gamepad connected' : '— connect a gamepad for stick controls —'}
            </div>
          </aside>
        </div>
      </div>
    </div>,
    root
  );
}

export default ArkanoidOverlay;

// --- Sidebar components ---

function Leaderboard({
  playerName, currentScore, rows, onClear
}: { playerName: string; currentScore: number; rows: LeaderRow[]; onClear: () => void }) {
  const top = useMemo(() => rows.slice(0, 10), [rows]);
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-white/5 p-3 text-emerald-100">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Leaderboard</h3>
        <button
          onClick={onClear}
          className="text-[11px] opacity-80 hover:opacity-100 underline"
          title="Clear local leaderboard"
        >clear</button>
      </div>
      <ul className="mt-2 space-y-1">
        {top.length === 0 && (
          <li className="text-emerald-200/70 text-sm">No scores yet. Be the legend.</li>
        )}
        {top.map((r, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="tabular-nums">{String(i+1).padStart(2,'0')}.</span>
            <span className="truncate mx-2">{r.name}</span>
            <span className="tabular-nums">{r.score}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-emerald-500/20 pt-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="opacity-80">Current</span>
          <span className="tabular-nums">{currentScore}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="opacity-80">You</span>
          <span className="truncate">{playerName}</span>
        </div>
      </div>
    </div>
  );
}

function Controls() {
  return (
    <div className="mt-4 rounded-lg border border-emerald-500/30 bg-white/5 p-3 text-emerald-100 text-sm">
      <h3 className="font-semibold mb-2">Controls</h3>
      <ul className="space-y-1">
        <li>Mouse or <kbd className="px-1 rounded bg-emerald-900/40 border border-emerald-600/40">←</kbd>/<kbd className="px-1 rounded bg-emerald-900/40 border border-emerald-600/40">→</kbd> to move</li>
        <li><kbd className="px-1 rounded bg-emerald-900/40 border border-emerald-600/40">Space</kbd> to launch</li>
        <li><kbd className="px-1 rounded bg-emerald-900/40 border border-emerald-600/40">P</kbd> to pause</li>
        <li><kbd className="px-1 rounded bg-emerald-900/40 border border-emerald-600/40">Esc</kbd> to exit</li>
      </ul>
      <p className="mt-2 opacity-80 text-xs">Power-ups: E Expand, S Slow, M Multi, C Catch, R Reduce, P 1UP.</p>
    </div>
  );
}
