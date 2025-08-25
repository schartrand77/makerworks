// src/pages/admin/FilamentsTab.tsx
import { useEffect, useMemo, useState } from "react";
import {
  listFilaments,
  createFilament,
  updateFilament,
  deleteFilament,
  addBarcode,
} from "../../api/filaments";

type Filament = {
  id: string;
  name?: string;
  material?: string | null; // PLA / PETG / ABS ...
  category?: string | null; // Matte / Silk / CF ...
  type?: string | null; // backend sometimes mirrors category here
  color_name?: string | null;
  color_hex?: string | null;
  color?: string | null; // some responses use color
  hex?: string | null; // some responses use hex
  price_per_kg?: number | string | null;
  pricePerKg?: number | string | null; // camelCase variant from backend
  is_active?: boolean;
  barcodes?: string[] | null; // backend returns array or null
};

type Draft = {
  material: string;
  category: string;
  color_name: string;
  color_hex: string;
  price_per_kg: number | string; // allow string while typing
  barcode?: string;
  is_active: boolean;
};

const EMPTY_DRAFT: Draft = {
  material: "",
  category: "",
  color_name: "",
  color_hex: "#000000",
  price_per_kg: "",
  is_active: true,
  barcode: "",
};

function normalizeHex(v: string | undefined | null): string {
  const s = (v ?? "").toString().trim();
  if (!s) return "#000000";
  const core = s.replace(/^#+/, "");
  return `#${core}`.slice(0, 7);
}

export default function FilamentsTab() {
  const [items, setItems] = useState<Filament[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // UI state
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [manage, setManage] = useState(false);

  // Create form
  const [newDraft, setNewDraft] = useState<Draft>({ ...EMPTY_DRAFT });

  // Edit form (single-row edit; no hooks in loops)
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>({ ...EMPTY_DRAFT });

  async function reload() {
    setLoading(true);
    try {
      const data = await listFilaments();
      setItems(Array.isArray(data) ? data : []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load filaments");
    } finally {
      setLoading(false);
    }
  }

  // Load all filaments
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await listFilaments();
        if (!alive) return;
        setItems(Array.isArray(data) ? data : []);
        setErr(null);
      } catch (e: any) {
        setErr(e?.message || "Failed to load filaments");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Filter + paginate (client-side)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? items.filter((f) => {
          const hay = [
            f.name,
            f.material,
            f.category,
            f.type,
            f.color_name,
            f.color,
            f.color_hex,
            f.hex,
            String(f.price_per_kg ?? f.pricePerKg ?? ""),
            Array.isArray(f.barcodes) ? f.barcodes.join(" ") : "",
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : items.slice();
    return base;
  }, [items, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Helpers to normalize fields on display
  const displayCategory = (f: Filament) => f.category ?? f.type ?? "—";
  const displayColorName = (f: Filament) => f.color_name ?? f.color ?? "—";
  const displayHex = (f: Filament) => f.color_hex ?? f.hex ?? "—";
  const displayPrice = (f: Filament) => {
    const n = Number(f.price_per_kg ?? f.pricePerKg);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  };
  const displayBarcode = (f: Filament) => {
    if (Array.isArray(f.barcodes) && f.barcodes.length > 0) return f.barcodes[0];
    return "—";
  };

  // Actions
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: any = {
        ...newDraft,
        color_hex: normalizeHex(newDraft.color_hex),
      };

      // coerce/validate price
      const price = Number(payload.price_per_kg);
      if (!Number.isFinite(price) || price <= 0) {
        alert("Please enter a price per kg greater than 0.");
        return;
      }
      payload.price_per_kg = price;

      const hasBarcode =
        typeof payload.barcode === "string" && payload.barcode.trim() !== "";
      // empty barcode should not be sent in the POST body
      if (!hasBarcode) delete payload.barcode;

      // Debug log matches your console style
      // eslint-disable-next-line no-console
      console.debug("[filaments] POST /filaments payload →", payload);

      const created = await createFilament(payload);

      // If user typed a barcode, attach it explicitly so we don't assume POST handled it
      if (hasBarcode && created?.id) {
        await addBarcode(created.id, newDraft.barcode!.trim());
      }

      // Always reload to sync (server may compute name, mirror fields, attach barcodes)
      await reload();
      setNewDraft({ ...EMPTY_DRAFT });
    } catch (e: any) {
      alert("Create failed: " + (e?.response?.data?.detail || e.message));
    }
  }

  async function beginEdit(f: Filament) {
    setEditId(f.id);
    setEditDraft({
      material: f.material ?? "",
      category: f.category ?? f.type ?? "",
      color_name: f.color_name ?? f.color ?? "",
      color_hex: normalizeHex(f.color_hex ?? f.hex ?? "#000000"),
      price_per_kg: String(f.price_per_kg ?? f.pricePerKg ?? ""),
      is_active: !!f.is_active,
      barcode: "", // single entry input (append-only)
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    try {
      const payload: any = {
        ...editDraft,
        color_hex: normalizeHex(editDraft.color_hex),
      };

      // validate/coerce price if provided
      if (payload.price_per_kg !== "") {
        const price = Number(payload.price_per_kg);
        if (!Number.isFinite(price) || price <= 0) {
          alert("Please enter a valid price per kg (> 0).");
          return;
        }
        payload.price_per_kg = price;
      } else {
        delete payload.price_per_kg;
      }

      // do not send barcode in PATCH; use explicit POST /barcodes
      const barcode: string | undefined =
        typeof payload.barcode === "string" && payload.barcode.trim() !== ""
          ? payload.barcode.trim()
          : undefined;
      delete payload.barcode;

      await updateFilament(editId, payload);
      if (barcode) {
        await addBarcode(editId, barcode);
      }
      await reload();
      setEditId(null);
    } catch (e: any) {
      alert("Update failed: " + (e?.response?.data?.detail || e.message));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this filament? This cannot be undone.")) return;
    try {
      await deleteFilament(id);
      setItems((prev) => prev.filter((f) => f.id !== id));
    } catch (e: any) {
      alert("Delete failed: " + (e?.response?.data?.detail || e.message));
    }
  }

  // Render
  return (
    <div className="space-y-4">
      {/* Top bar: pill search + pagination + manage toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search filaments…"
          className="rounded-full px-4 py-2 border outline-none focus:ring"
          aria-label="Search filaments"
        />
        <div className="flex items-center gap-2">
          <button
            className="mw-btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ Prev
          </button>
          <span className="text-sm">
            Page {page} / {totalPages}
          </span>
          <button
            className="mw-btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next ›
          </button>
        </div>
        <label className="ml-auto inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={manage}
            onChange={(e) => {
              setManage(e.target.checked);
              setEditId(null);
            }}
          />
          <span className="text-sm">Manage (add / edit / delete)</span>
        </label>
      </div>

      {/* Create form (only when manage) */}
      {manage && (
        <form onSubmit={handleCreate} className="p-3 rounded border space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <input
              value={newDraft.material}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, material: e.target.value }))
              }
              placeholder="Material (PLA, PETG)"
              className="mw-input"
              required
            />
            <input
              value={newDraft.category}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, category: e.target.value }))
              }
              placeholder="Category (Matte, Silk, CF)"
              className="mw-input"
              required
            />
            <input
              value={newDraft.color_name}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, color_name: e.target.value }))
              }
              placeholder="Color name (Onyx)"
              className="mw-input"
              required
            />
            <input
              value={newDraft.color_hex}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, color_hex: e.target.value }))
              }
              placeholder="#000000"
              className="mw-input"
              pattern="^#?[0-9A-Fa-f]{6}$"
              title="6-digit hex, with or without leading #"
              required
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={newDraft.price_per_kg}
              onChange={(e) =>
                setNewDraft((d) => ({
                  ...d,
                  // keep as string to avoid transient 0 during typing
                  price_per_kg: e.target.value,
                }))
              }
              placeholder="Price/kg"
              className="mw-input"
              required
            />
            <input
              value={newDraft.barcode}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, barcode: e.target.value }))
              }
              placeholder="Barcode (optional)"
              className="mw-input"
            />
          </div>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={newDraft.is_active}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, is_active: e.target.checked }))
              }
            />
            <span>Active</span>
          </label>
          <div>
            <button className="mw-btn">Add filament</button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="overflow-auto rounded border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-black/5 dark:bg-white/5">
              <th className="text-left p-2">#</th>
              <th className="text-left p-2">Material</th>
              <th className="text-left p-2">Category</th>
              <th className="text-left p-2">Color</th>
              <th className="text-left p-2">Hex</th>
              <th className="text-left p-2">Barcode</th>
              <th className="text-left p-2">Price/kg</th>
              <th className="text-left p-2">Active</th>
              {manage && <th className="text-left p-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-3" colSpan={manage ? 9 : 8}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && current.length === 0 && (
              <tr>
                <td className="p-3" colSpan={manage ? 9 : 8}>
                  No filaments.
                </td>
              </tr>
            )}
            {!loading &&
              current.map((f, idx) => {
                const rowNumber = (page - 1) * pageSize + idx + 1;
                const isEditing = manage && editId === f.id;

                if (isEditing) {
                  return (
                    <tr key={f.id} className="bg-yellow-50 dark:bg-yellow-950/20">
                      <td className="p-2">{rowNumber}</td>
                      <td className="p-2">
                        <input
                          className="mw-input"
                          value={editDraft.material}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              material: e.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="mw-input"
                          value={editDraft.category}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              category: e.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="mw-input"
                          value={editDraft.color_name}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              color_name: e.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="mw-input"
                          value={editDraft.color_hex}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              color_hex: e.target.value,
                            }))
                          }
                          pattern="^#?[0-9A-Fa-f]{6}$"
                          title="6-digit hex, with or without leading #"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="mw-input"
                          value={editDraft.barcode ?? ""}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              barcode: e.target.value,
                            }))
                          }
                          placeholder="Add barcode"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="mw-input"
                          value={editDraft.price_per_kg}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              price_per_kg: e.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={editDraft.is_active}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              is_active: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <button className="mw-btn-sm" onClick={handleSaveEdit}>
                            Save
                          </button>
                          <button
                            type="button"
                            className="mw-btn-sm"
                            onClick={() => setEditId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const hex = (displayHex(f) || "").toString();
                const swatchHex =
                  /^#?[0-9A-Fa-f]{6}$/.test(hex) ? normalizeHex(hex) : "#000000";

                return (
                  <tr key={f.id}>
                    <td className="p-2">{rowNumber}</td>
                    <td className="p-2">{f.material ?? "—"}</td>
                    <td className="p-2">{displayCategory(f)}</td>
                    <td className="p-2">{displayColorName(f)}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          style={{
                            width: "1rem",
                            height: "1rem",
                            borderRadius: "9999px",
                            border: "1px solid rgba(0,0,0,.2)",
                            background: swatchHex,
                          }}
                          title={swatchHex}
                        />
                        <span>{displayHex(f)}</span>
                      </div>
                    </td>
                    <td className="p-2">{displayBarcode(f)}</td>
                    <td className="p-2">{displayPrice(f)}</td>
                    <td className="p-2">{f.is_active ? "Yes" : "No"}</td>
                    {manage && (
                      <td className="p-2">
                        <div className="flex gap-2">
                          <button
                            className="mw-btn-sm"
                            onClick={() => beginEdit(f)}
                          >
                            Edit
                          </button>
                          <button
                            className="mw-btn-sm"
                            onClick={() => handleDelete(f.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* local styles for tiny utility classes (keeps your theme intact) */}
      <style>{`
        .mw-input{border:1px solid rgba(0,0,0,.15); padding:.35rem .5rem; border-radius:.35rem; width:100%;}
        .mw-btn{border:1px solid rgba(0,0,0,.2); padding:.45rem .75rem; border-radius:.45rem;}
        .mw-btn-sm{border:1px solid rgba(0,0,0,.2); padding:.25rem .5rem; border-radius:.35rem; font-size:.85rem;}
      `}</style>

      {/* Error banner (non-blocking) */}
      {err && (
        <div className="p-3 rounded border border-red-300 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200">
          {err}
        </div>
      )}
    </div>
  );
}
