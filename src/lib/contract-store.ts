import type { RiskClause } from "@/lib/analysis-store";

export type SavedContract = {
  id: string;
  name: string;
  contractType: string;
  risk: "High" | "Medium" | "Low";
  issues: number;
  issuesFixed: number;
  saved: string; // e.g. "Mar 22, 2026"
};

export type ContractData = {
  extractedText: string;
  clauses: RiskClause[]; // remaining (unfixed) clauses — kept in sync
  delta?: object;        // Quill Delta — saved after each fix so edits persist
};

const KEY        = "lexora_contracts";
const dataKey    = (id: string) => `lexora_data_${id}`;

function read(): SavedContract[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(contracts: SavedContract[]) {
  localStorage.setItem(KEY, JSON.stringify(contracts));
}

export const contractStore = {
  getAll: read,

  add(c: SavedContract) {
    const all = read();
    all.unshift(c);
    write(all);
  },

  updateFixed(id: string, issuesFixed: number) {
    const all = read();
    const idx = all.findIndex(c => c.id === id);
    if (idx !== -1) { all[idx].issuesFixed = issuesFixed; write(all); }
  },

  rename(id: string, name: string) {
    const all = read();
    const idx = all.findIndex(c => c.id === id);
    if (idx !== -1) { all[idx].name = name; write(all); }
  },

  remove(id: string) {
    write(read().filter(c => c.id !== id));
    localStorage.removeItem(dataKey(id));
  },

  // Full document data (text + remaining clauses)
  setData(id: string, data: ContractData) {
    localStorage.setItem(dataKey(id), JSON.stringify(data));
  },

  getData(id: string): ContractData | null {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem(dataKey(id)) ?? "null");
    } catch {
      return null;
    }
  },

  updateClauses(id: string, clauses: RiskClause[]) {
    const existing = this.getData(id);
    if (existing) this.setData(id, { ...existing, clauses });
  },

  updateDelta(id: string, delta: object) {
    const existing = this.getData(id);
    if (existing) this.setData(id, { ...existing, delta });
  },
};
