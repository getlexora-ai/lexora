"use client";

import { useCallback, useState } from "react";
import { CloudUpload, X, FileText, Trash2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UploadedFile = {
  id: string;
  name: string;
  size: string;
  file: File;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onAnalyze: (file: File, name: string, contractType: string) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadModal({ open, onClose, onAnalyze }: Props) {
  const [files, setFiles]       = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [contractType, setContractType] = useState("");

  function addFiles(raw: FileList | null) {
    if (!raw) return;
    const incoming: UploadedFile[] = Array.from(raw).map(f => ({
      id:   crypto.randomUUID(),
      name: f.name,
      size: formatSize(f.size),
      file: f,
    }));
    setFiles(prev => [...prev, ...incoming]);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  function handleAnalyze() {
    if (files.length === 0) return;
    onAnalyze(files[0].file, files[0].name, contractType);
    setFiles([]);
    setContractType("");
    onClose();
  }

  function handleClose() {
    setFiles([]);
    setContractType("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-8 pt-8 pb-4">
          <DialogTitle className="text-2xl font-semibold tracking-tight">Upload Agreement</DialogTitle>
          <DialogDescription>
            Our AI will scan for liabilities, governing law, and key dates.
          </DialogDescription>
        </DialogHeader>

        <div className="px-8 pb-8 space-y-6">
          {/* Drag & Drop Zone */}
          <label
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
              dragging
                ? "border-brand bg-brand-soft"
                : "border-border hover:border-brand/60 bg-muted/30"
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-e1">
              <CloudUpload className="h-7 w-7 text-brand" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Drop your contract here</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOCX up to 50 MB</p>
            </div>
            <input
              type="file"
              accept=".pdf,.docx"
              multiple
              className="sr-only"
              onChange={e => addFiles(e.target.files)}
            />
          </label>

          {/* Selected Files */}
          {files.length > 0 && (
            <div>
              <p className="eyebrow mb-3">
                Selected Files
              </p>
              <div className="space-y-2">
                {files.map(file => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft">
                        <FileText className="h-5 w-5 text-brand" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none">{file.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 uppercase font-medium">
                          {file.size} · Ready
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contract Type */}
          <div className="space-y-2">
            <label className="eyebrow">
              Contract Type
              <span className="ml-1 text-brand normal-case tracking-normal">— helps AI improve accuracy</span>
            </label>
            <Select value={contractType} onValueChange={(v) => setContractType(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select a contract type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nda">Non-Disclosure Agreement (NDA)</SelectItem>
                <SelectItem value="msa">Master Service Agreement (MSA)</SelectItem>
                <SelectItem value="employment">Employment Contract</SelectItem>
                <SelectItem value="vendor">Vendor Agreement</SelectItem>
                <SelectItem value="saas">SaaS Subscription Agreement</SelectItem>
                <SelectItem value="lease">Lease Agreement</SelectItem>
                <SelectItem value="partnership">Partnership Agreement</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* AI Enhancement Banner */}
          <div className="flex items-start gap-4 rounded-xl bg-brand-soft border border-brand-line px-4 py-3">
            <Sparkles className="h-5 w-5 text-brand shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">AI Enhancement Active</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automated entity extraction and risk scoring will be applied to the document.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              className="flex-[2] gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={files.length === 0}
              onClick={handleAnalyze}
            >
              <Sparkles className="h-4 w-4" />
              Analyze with AI
            </Button>
          </div>
        </div>

        {/* Override default close button position */}
        <button
          onClick={handleClose}
          className="absolute right-5 top-5 rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
