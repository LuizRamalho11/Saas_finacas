"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionHeading } from "@/components/common/section-heading";
import { EmptyState } from "@/components/common/empty-state";
import { usePreferences } from "@/components/providers";
import { confirmImport, previewImport, type ImportPreview, type ImportRow } from "@/lib/actions/transactions";
import { formatCurrency } from "@/lib/format";

const TEMPLATE = [
  "data;descricao;valor;tipo;categoria;conta;status",
  "2026-09-01;Plano Scale — Rede Farmacore;18500,00;entrada;Assinaturas recorrentes;Conta Principal;completed",
  "2026-09-02;Cloud Nimbus — infraestrutura;7400,00;saida;Infraestrutura;Cartão Corporativo;completed",
].join("\n");

/** Parser de CSV que respeita aspas e aceita ";" ou "," como separador. */
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, "").trim();
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field.trim());
  rows.push(row);

  const [header = [], ...body] = rows;
  return { header: header.map((h) => h.toLowerCase()), rows: body.filter((r) => r.some((cell) => cell !== "")) };
}

const COLUMN_ALIASES: Record<keyof ImportRow, string[]> = {
  date: ["data", "date"],
  description: ["descricao", "descrição", "description", "historico", "histórico"],
  amount: ["valor", "amount", "montante"],
  type: ["tipo", "type"],
  category: ["categoria", "category"],
  account: ["conta", "account"],
  status: ["status", "situacao", "situação"],
};

export function ImportWizard() {
  const router = useRouter();
  const { currency } = usePreferences();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setParsing(true);
    setPreview(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const { header, rows } = parseCsv(text);

      const indexFor = (key: keyof ImportRow) =>
        header.findIndex((column) => COLUMN_ALIASES[key].includes(column));

      const missing = (["date", "description", "amount", "type", "category", "account"] as const).filter(
        (key) => indexFor(key) === -1,
      );

      if (missing.length) {
        toast.error(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);
        setParsing(false);
        return;
      }

      const parsedRows: ImportRow[] = rows.map((cells) => ({
        date: cells[indexFor("date")] ?? "",
        description: cells[indexFor("description")] ?? "",
        amount: cells[indexFor("amount")] ?? "",
        type: cells[indexFor("type")] ?? "",
        category: cells[indexFor("category")] ?? "",
        account: cells[indexFor("account")] ?? "",
        status: indexFor("status") >= 0 ? cells[indexFor("status")] : undefined,
      }));

      const result = await previewImport(parsedRows);
      setParsing(false);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setPreview(result.data);
      toast.success(`${result.data.valid.length} linha(s) prontas para importar.`);
    } catch {
      setParsing(false);
      toast.error("Não foi possível ler o arquivo. Confirme que é um CSV válido.");
    }
  }

  async function handleConfirm() {
    if (!preview?.valid.length) return;
    setImporting(true);
    const result = await confirmImport(preview.valid);
    setImporting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? "Importação concluída.");
    router.push("/transactions");
    router.refresh();
  }

  function downloadTemplate() {
    const blob = new Blob([`﻿${TEMPLATE}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "finora-modelo-importacao.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Importar transações"
        description="Envie um CSV, confira a prévia e só então confirme a gravação."
        action={
          <Button variant="ghost" asChild>
            <Link href="/transactions">
              <ArrowLeft aria-hidden /> Voltar ao extrato
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>1. Selecione o arquivo</CardTitle>
            <CardDescription>
              Colunas obrigatórias: data, descrição, valor, tipo, categoria e conta. Status é opcional.
            </CardDescription>
          </div>
          <Button variant="secondary" size="sm" onClick={downloadTemplate}>
            <FileSpreadsheet aria-hidden /> Baixar modelo
          </Button>
        </CardHeader>
        <CardContent>
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center transition-colors hover:border-brand/50 hover:bg-surface-raised/40"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-surface-raised text-brand">
              {parsing ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {fileName ?? "Arraste o CSV aqui ou clique para escolher"}
              </span>
              <span className="block text-xs text-muted-foreground">
                Nada é gravado antes da sua confirmação na etapa 2.
              </span>
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
          </label>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>2. Confira a prévia</CardTitle>
              <CardDescription>
                {preview.valid.length} linha(s) válidas · {preview.invalid.length} com problema
              </CardDescription>
            </div>
            <Button onClick={handleConfirm} disabled={importing || preview.valid.length === 0}>
              {importing ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
              {importing ? "Importando…" : `Importar ${preview.valid.length} lançamento(s)`}
            </Button>
          </CardHeader>
          <CardContent className="space-y-5 px-0">
            {preview.invalid.length > 0 ? (
              <div className="mx-5 space-y-2 rounded-lg border border-warning/25 bg-warning/[0.06] p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="size-4" aria-hidden />
                  {preview.invalid.length} linha(s) serão ignoradas
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {preview.invalid.slice(0, 6).map((item) => (
                    <li key={item.line}>
                      Linha {item.line}: {item.error}
                    </li>
                  ))}
                  {preview.invalid.length > 6 ? (
                    <li>… e mais {preview.invalid.length - 6} linha(s).</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {preview.valid.length === 0 ? (
              <div className="px-5">
                <EmptyState
                  icon={AlertTriangle}
                  title="Nenhuma linha válida"
                  description="Corrija o arquivo conforme os avisos acima e envie novamente."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.valid.slice(0, 12).map((row, index) => (
                    <TableRow key={`${row.description}-${index}`}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{row.date}</TableCell>
                      <TableCell className="text-sm text-foreground">
                        <span className="flex items-center gap-2">
                          {row.description}
                          <Badge variant={row.type === "income" ? "success" : "neutral"}>
                            {row.type === "income" ? "Entrada" : "Saída"}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.account}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular text-foreground">
                        {formatCurrency(row.amountValue, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {preview.valid.length > 12 ? (
              <p className="px-5 text-xs text-muted-foreground">
                Mostrando as 12 primeiras linhas de {preview.valid.length}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
