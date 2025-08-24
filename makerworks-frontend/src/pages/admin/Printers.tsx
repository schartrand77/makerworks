import { useEffect, useMemo, useRef, useState } from 'react';
import { Bambu, type BridgePrinter, type BridgeStatus, type StartPrintBody } from '../../features/printers/BambuService';

type Mode = '3mf' | 'gcode';

export default function Printers() {
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState<BridgePrinter[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('3mf');
  const [url, setUrl] = useState('');
  const [copyToSd, setCopyToSd] = useState(false);
  const [autoStart, setAutoStart] = useState(true);

  const cameraRef = useRef<HTMLImageElement | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await Bambu.listPrinters();
      setPrinters(list);
      if (!selected && list.length) setSelected(list[0].name);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load printers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const refreshStatus = async (name?: string) => {
    const n = name || selected;
    if (!n) return;
    setErr(null);
    try {
      const s = await Bambu.status(n);
      setStatus(s);
    } catch (e: any) {
      setErr(e?.message || 'Failed to fetch status');
    }
  };

  useEffect(() => {
    if (selected) refreshStatus(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const connect = async (name: string) => {
    setErr(null);
    try {
      await Bambu.connect(name);
      await refreshStatus(name);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Connect failed');
    }
  };

  const startPrint = async () => {
    if (!selected || !url.trim()) return setErr('Give me a URL, not vibes.');
    let body: StartPrintBody;
    if (mode === '3mf') body = { '3mf_url': url.trim(), start: autoStart, copy_to_sd: copyToSd };
    else body = { gcode_url: url.trim(), start: autoStart, copy_to_sd: copyToSd };

    setErr(null);
    try {
      await Bambu.startPrint(selected, body);
      setUrl('');
      await refreshStatus(selected);
    } catch (e: any) {
      setErr(e?.message || 'Start print failed');
    }
  };

  const pause = async () => { if (selected) { try { await Bambu.pause(selected); await refreshStatus(selected); } catch (e: any) { setErr(e?.message); } } };
  const resume = async () => { if (selected) { try { await Bambu.resume(selected); await refreshStatus(selected); } catch (e: any) { setErr(e?.message); } } };
  const stop = async () => { if (selected) { try { await Bambu.stop(selected); await refreshStatus(selected); } catch (e: any) { setErr(e?.message); } } };

  const camSrc = useMemo(() => selected ? Bambu.cameraUrl(selected) : '', [selected]);

  // naive polling every 5s while a printer is selected
  useEffect(() => {
    if (!selected) return;
    const id = setInterval(() => refreshStatus(selected), 5000);
    return () => clearInterval(id);
  }, [selected]);

  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <h1>Printers</h1>

      {err && <div style={{ background: '#ffe6e6', color: '#900', padding: 10, borderRadius: 6 }}>{err}</div>}

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload list'}</button>
          <select
            value={selected || ''}
            onChange={(e) => setSelected(e.target.value || null)}
          >
            {printers.map(p => <option key={p.name} value={p.name}>{p.name} {p.connected ? '✓' : '•'}</option>)}
          </select>
          {selected && <button onClick={() => connect(selected)}>Connect</button>}
          {selected && <button onClick={() => refreshStatus(selected)}>Refresh status</button>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Host</th>
              <th style={th}>Serial</th>
              <th style={th}>Connected</th>
              <th style={th}>Last Error</th>
            </tr>
          </thead>
          <tbody>
            {printers.map(p => (
              <tr key={p.name}>
                <td style={td}>{p.name}</td>
                <td style={td}>{p.host}</td>
                <td style={td}>{p.serial || '—'}</td>
                <td style={td}>{p.connected ? 'Yes' : 'No'}</td>
                <td style={td}>{p.last_error || '—'}</td>
              </tr>
            ))}
            {!printers.length && !loading && (
              <tr><td style={td} colSpan={5}>No printers configured (check env BAMBULAB_* in backend).</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2>Controls</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={pause} disabled={!selected}>Pause</button>
          <button onClick={resume} disabled={!selected}>Resume</button>
          <button onClick={stop} disabled={!selected}>Stop</button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>Start print from URL</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label><input type="radio" name="mode" checked={mode === '3mf'} onChange={() => setMode('3mf')} /> 3MF URL</label>
          <label><input type="radio" name="mode" checked={mode === 'gcode'} onChange={() => setMode('gcode')} /> G-code URL</label>
          <input
            placeholder={mode === '3mf' ? 'https://example.com/file.3mf' : 'https://example.com/file.gcode'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ minWidth: 360 }}
          />
          <label title="copy file to SD card first"><input type="checkbox" checked={copyToSd} onChange={(e) => setCopyToSd(e.target.checked)} /> copy to SD</label>
          <label title="auto-start after transfer"><input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} /> auto-start</label>
          <button onClick={startPrint} disabled={!selected}>Start</button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>Status</h2>
        <pre style={{ background: '#111', color: '#eee', padding: 12, borderRadius: 8, maxHeight: 280, overflow: 'auto' }}>
          {status ? JSON.stringify(status, null, 2) : '—'}
        </pre>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>Camera</h2>
        {selected ? (
          <img
            ref={cameraRef}
            src={camSrc}
            alt="Camera"
            style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #ccc' }}
            onError={() => setErr('Camera stream unavailable on this pybambu build')}
          />
        ) : <div>Select a printer.</div>}
      </section>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ddd' };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #2222' };
