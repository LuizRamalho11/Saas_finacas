"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Check, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/components/providers";
import { updateProfile } from "@/lib/actions/auth";
import { formatCurrency, type CurrencyCode } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/types";

const CURRENCIES: { value: CurrencyCode; label: string }[] = [
  { value: "BRL", label: "Real brasileiro (R$)" },
  { value: "USD", label: "Dólar americano ($)" },
  { value: "EUR", label: "Euro (€)" },
];

const THEMES = [
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "light", label: "Claro", icon: Sun },
] as const;

export function ProfileSettings({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const { currency, compactNumbers, weeklyDigest, setPreference } = usePreferences();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [form, setForm] = React.useState({
    name: profile.name,
    role: profile.role,
    email: profile.email,
    timezone: profile.timezone,
  });

  React.useEffect(() => setMounted(true), []);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = await updateProfile({ ...form, currency });
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? "Preferências salvas.");
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
    router.refresh();
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Perfil</CardTitle>
            <CardDescription>Como seu nome aparece em relatórios exportados</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSave} noValidate>
            <div className="flex items-center gap-4">
              <Avatar className="size-14">
                <AvatarFallback className="text-base">{profile.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{profile.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile.role} · {profile.company}
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" className="ml-auto">
                Trocar foto
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Nome completo" error={errors.name}>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field id="role" label="Cargo" error={errors.role}>
                <Input id="role" value={form.role} onChange={(e) => set("role", e.target.value)} />
              </Field>
              <Field id="email" label="E-mail" error={errors.email}>
                <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field id="timezone" label="Fuso horário" error={errors.timezone}>
                <Input id="timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
              {saved ? (
                <span role="status" className="flex items-center gap-1.5 text-xs text-success">
                  <Check className="size-4" aria-hidden /> Preferências salvas
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Aparência</CardTitle>
              <CardDescription>O tema escuro é o padrão do produto</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tema da interface">
              {THEMES.map((option) => {
                const active = mounted && theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-xs transition-colors",
                      active
                        ? "border-brand bg-brand/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-surface-raised",
                    )}
                  >
                    <option.icon className="size-4" aria-hidden />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Monitor className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              O contraste dos gráficos é recalculado automaticamente em cada tema.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Moeda e números</CardTitle>
              <CardDescription>Aplica-se a KPIs, gráficos e tabelas</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currency">Moeda de exibição</Label>
              <Select value={currency} onValueChange={(value) => setPreference("currency", value as CurrencyCode)}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Exemplo: {formatCurrency(1284930.5, currency)}</p>
            </div>

            <ToggleRow
              id="compact"
              label="Números compactos nos KPIs"
              description="Mostra R$ 1,2 mi em vez do valor completo"
              checked={compactNumbers}
              onCheckedChange={(value) => setPreference("compactNumbers", value)}
            />
            <ToggleRow
              id="digest"
              label="Resumo semanal por e-mail"
              description="Toda segunda-feira às 8h, com variações relevantes"
              checked={weeklyDigest}
              onCheckedChange={(value) => setPreference("weeklyDigest", value)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm text-foreground">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
